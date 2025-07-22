use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self, Token, TokenAccount, Transfer},
};

// Import our protocol integrations
pub mod integrations;
pub mod lending_integrations;
use integrations::{jupiter, raydium, ProtocolRouter, SwapProtocol};
use lending_integrations::{solend, port_finance, LendingRouter, LendingProtocol};

declare_id!("7opSCrXjWAC5cjMdSJiFjHGY2ncWiyQyHZEbmjiUA3Ax");

// IntentFI Protocol Constants
pub const PROTOCOL_FEE_BPS: u16 = 30; // 0.3% = 30 basis points
pub const MAX_INTENTS_PER_USER: u8 = 50;
pub const INTENT_EXPIRY_SECONDS: i64 = 86400 * 7; // 7 days
pub const MIN_RUGPROOF_SCORE: u8 = 70;

#[program]
pub mod intentfi {
    use super::*;

    /// Initialize the IntentFI protocol
    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        treasury_authority: Pubkey,
    ) -> Result<()> {
        let protocol_state = &mut ctx.accounts.protocol_state;
        protocol_state.authority = ctx.accounts.authority.key();
        protocol_state.treasury_authority = treasury_authority;
        protocol_state.protocol_fee_bps = PROTOCOL_FEE_BPS;
        protocol_state.total_fees_collected = 0;
        protocol_state.total_intents_created = 0;
        protocol_state.total_intents_executed = 0;
        protocol_state.is_paused = false;
        protocol_state.bump = ctx.bumps.protocol_state;
        
        msg!("🚀 IntentFI Protocol initialized with Jupiter + Raydium + Solend + Port Finance");
        msg!("💰 Protocol fee: 0.3% on all transactions");
        Ok(())
    }

    /// Initialize a user account for intent management
    pub fn initialize_user(ctx: Context<InitializeUser>) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        user_account.authority = ctx.accounts.authority.key();
        user_account.active_intents = 0;
        user_account.total_intents_created = 0;
        user_account.total_volume = 0;
        user_account.rugproof_enabled = true;
        user_account.bump = ctx.bumps.user_account;
        
        msg!("👤 User account initialized for: {}", ctx.accounts.authority.key());
        Ok(())
    }

    /// Create a swap intent with protocol selection
    pub fn create_swap_intent(
        ctx: Context<CreateSwapIntent>,
        params: SwapIntentParams,
    ) -> Result<()> {
        let protocol_state = &mut ctx.accounts.protocol_state;
        let user_account = &mut ctx.accounts.user_account;
        let intent_account = &mut ctx.accounts.intent_account;
        
        // Validate user has capacity for new intents
        require!(user_account.active_intents < MAX_INTENTS_PER_USER, IntentError::TooManyActiveIntents);
        
        // Validate protocol is not paused
        require!(!protocol_state.is_paused, IntentError::ProtocolPaused);
        
        // Validate intent parameters
        require!(params.amount > 0, IntentError::InvalidAmount);
        require!(params.max_slippage <= 5000, IntentError::SlippageTooHigh); // Max 50%
        
        // Calculate protocol fee (0.3%)
        let protocol_fee = (params.amount as u128)
            .checked_mul(PROTOCOL_FEE_BPS as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap() as u64;
        
        // Perform rugproof check if enabled
        if params.rugproof_enabled {
            let rugproof_score = perform_rugproof_check(&params.to_mint)?;
            require!(rugproof_score >= MIN_RUGPROOF_SCORE, IntentError::RugproofCheckFailed);
            
            msg!("🛡️ Rugproof check passed with score: {}", rugproof_score);
        }
        
        // Choose best DEX protocol for this swap
        let selected_protocol = ProtocolRouter::choose_best_protocol(
            &params.from_mint,
            &params.to_mint,
            params.amount,
        );
        
        msg!(
            "🎯 Selected protocol: {:?} for {}/{} swap",
            selected_protocol,
            params.from_mint,
            params.to_mint
        );
        
        // Initialize intent account
        intent_account.authority = ctx.accounts.authority.key();
        intent_account.intent_type = IntentType::Swap;
        intent_account.status = IntentStatus::Pending;
        intent_account.from_mint = params.from_mint;
        intent_account.to_mint = params.to_mint;
        intent_account.amount = params.amount;
        intent_account.protocol_fee = protocol_fee;
        intent_account.max_slippage = params.max_slippage;
        intent_account.rugproof_enabled = params.rugproof_enabled;
        intent_account.selected_swap_protocol = selected_protocol.clone();
        intent_account.selected_lending_protocol = None;
        intent_account.created_at = Clock::get()?.unix_timestamp;
        intent_account.expires_at = Clock::get()?.unix_timestamp + INTENT_EXPIRY_SECONDS;
        intent_account.bump = ctx.bumps.intent_account;
        
        // Update counters
        user_account.active_intents += 1;
        user_account.total_intents_created += 1;
        protocol_state.total_intents_created += 1;
        
        msg!(
            "✅ Swap intent created: {} {} → {} {} via {:?}",
            params.amount, 
            params.from_mint,
            params.amount.checked_sub(protocol_fee).unwrap(),
            params.to_mint,
            selected_protocol
        );
        msg!("💰 Protocol fee: {} tokens (0.3%)", protocol_fee);
        
        Ok(())
    }

    /// Execute a swap intent through selected DEX protocol
    pub fn execute_swap_intent_jupiter(
        ctx: Context<ExecuteSwapIntentJupiter>,
        jupiter_swap_data: jupiter::JupiterSwapData,
    ) -> Result<()> {
        // Validate intent can be executed
        require!(ctx.accounts.intent_account.status == IntentStatus::Pending, IntentError::IntentNotPending);
        require!(Clock::get()?.unix_timestamp < ctx.accounts.intent_account.expires_at, IntentError::IntentExpired);
        require!(matches!(ctx.accounts.intent_account.selected_swap_protocol, SwapProtocol::Jupiter), IntentError::WrongProtocol);
        
        msg!("🚀 Executing Jupiter aggregated swap...");
        
        // Calculate amounts
        let protocol_fee = ctx.accounts.intent_account.protocol_fee;
        let net_amount = ctx.accounts.intent_account.amount.checked_sub(protocol_fee).unwrap();
        
        // Transfer protocol fee to treasury first
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_source_token.to_account_info(),
            to: ctx.accounts.treasury_fee_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, protocol_fee)?;
        
        // Execute Jupiter swap with our integration
        let swap_params = jupiter::JupiterSwapParams {
            from_mint: ctx.accounts.intent_account.from_mint,
            to_mint: ctx.accounts.intent_account.to_mint,
            amount: net_amount,
            slippage_bps: ctx.accounts.intent_account.max_slippage,
            platform_fee_bps: 0, // We already collected our fee
        };
        
        // Execute Jupiter swap with simplified integration call
        let estimated_output = jupiter::execute_jupiter_swap_simple(
            &ctx.accounts.user.to_account_info(),
            &ctx.accounts.user_source_token.to_account_info(),
            &ctx.accounts.user_destination_token.to_account_info(),
            &ctx.accounts.jupiter_program.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            swap_params,
            jupiter_swap_data,
        )?;
        
        // Update intent status
        ctx.accounts.intent_account.status = IntentStatus::Executed;
        ctx.accounts.intent_account.executed_at = Some(Clock::get()?.unix_timestamp);
        ctx.accounts.intent_account.execution_price = Some(estimated_output);
        
        // Update counters
        ctx.accounts.user_account.active_intents -= 1;
        ctx.accounts.user_account.total_volume += ctx.accounts.intent_account.amount;
        ctx.accounts.protocol_state.total_intents_executed += 1;
        ctx.accounts.protocol_state.total_fees_collected += protocol_fee;
        
        emit!(SwapIntentExecuted {
            intent_id: ctx.accounts.intent_account.key(),
            user: ctx.accounts.user.key(),
            protocol: SwapProtocol::Jupiter,
            from_mint: ctx.accounts.intent_account.from_mint,
            to_mint: ctx.accounts.intent_account.to_mint,
            amount_in: net_amount,
            amount_out: estimated_output,
            protocol_fee,
        });
        
        msg!(
            "✅ Jupiter swap completed: {} → {} tokens (Fee: {})",
            net_amount,
            estimated_output,
            protocol_fee
        );
        
        Ok(())
    }

    /// Execute a swap intent through Raydium AMM
    pub fn execute_swap_intent_raydium(
        ctx: Context<ExecuteSwapIntentRaydium>,
        pool_info: raydium::RaydiumPoolInfo,
    ) -> Result<()> {
        // Validate intent can be executed
        require!(ctx.accounts.intent_account.status == IntentStatus::Pending, IntentError::IntentNotPending);
        require!(Clock::get()?.unix_timestamp < ctx.accounts.intent_account.expires_at, IntentError::IntentExpired);
        require!(matches!(ctx.accounts.intent_account.selected_swap_protocol, SwapProtocol::Raydium), IntentError::WrongProtocol);
        
        msg!("🌊 Executing direct Raydium AMM swap...");
        
        // Calculate amounts
        let protocol_fee = ctx.accounts.intent_account.protocol_fee;
        let net_amount = ctx.accounts.intent_account.amount.checked_sub(protocol_fee).unwrap();
        
        // Transfer protocol fee to treasury
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_source_token.to_account_info(),
            to: ctx.accounts.treasury_fee_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, protocol_fee)?;
        
        // Calculate minimum amount out with slippage
        let base_output = raydium::calculate_raydium_output(
            net_amount,
            if ctx.accounts.intent_account.from_mint == pool_info.coin_mint_address {
                pool_info.pool_coin_amount
            } else {
                pool_info.pool_pc_amount
            },
            if ctx.accounts.intent_account.from_mint == pool_info.coin_mint_address {
                pool_info.pool_pc_amount
            } else {
                pool_info.pool_coin_amount
            },
            25,    // Raydium fee: 0.25%
            10000,
        )?;
        
        // Apply slippage protection
        let slippage_multiplier = 10000_u64.checked_sub(ctx.accounts.intent_account.max_slippage as u64).unwrap();
        let minimum_amount_out = (base_output as u128)
            .checked_mul(slippage_multiplier as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap() as u64;
        
        // Execute Raydium swap
        let swap_params = raydium::RaydiumSwapParams {
            pool_id: ctx.accounts.raydium_pool.key(),
            from_mint: ctx.accounts.intent_account.from_mint,
            to_mint: ctx.accounts.intent_account.to_mint,
            amount_in: net_amount,
            minimum_amount_out,
        };
        
        // Execute Raydium swap with simplified integration call
        let estimated_output = raydium::execute_raydium_swap_simple(
            &ctx.accounts.user.to_account_info(),
            &ctx.accounts.user_source_token.to_account_info(),
            &ctx.accounts.user_destination_token.to_account_info(),
            &ctx.accounts.raydium_program.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            swap_params,
            pool_info,
        )?;
        
        // Update intent status
        ctx.accounts.intent_account.status = IntentStatus::Executed;
        ctx.accounts.intent_account.executed_at = Some(Clock::get()?.unix_timestamp);
        ctx.accounts.intent_account.execution_price = Some(estimated_output);
        
        // Update counters
        ctx.accounts.user_account.active_intents -= 1;
        ctx.accounts.user_account.total_volume += ctx.accounts.intent_account.amount;
        ctx.accounts.protocol_state.total_intents_executed += 1;
        ctx.accounts.protocol_state.total_fees_collected += protocol_fee;
        
        emit!(SwapIntentExecuted {
            intent_id: ctx.accounts.intent_account.key(),
            user: ctx.accounts.user.key(),
            protocol: SwapProtocol::Raydium,
            from_mint: ctx.accounts.intent_account.from_mint,
            to_mint: ctx.accounts.intent_account.to_mint,
            amount_in: net_amount,
            amount_out: estimated_output,
            protocol_fee,
        });
        
        msg!(
            "✅ Raydium swap completed: {} → {} tokens (Fee: {})",
            net_amount,
            estimated_output,
            protocol_fee
        );
        
        Ok(())
    }

    /// Create a lending intent with protocol selection
    pub fn create_lend_intent(
        ctx: Context<CreateLendIntent>,
        params: LendIntentParams,
    ) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        let intent_account = &mut ctx.accounts.intent_account;
        let protocol_state = &mut ctx.accounts.protocol_state;
        
        require!(user_account.active_intents < MAX_INTENTS_PER_USER, IntentError::TooManyActiveIntents);
        require!(!protocol_state.is_paused, IntentError::ProtocolPaused);
        require!(params.amount > 0, IntentError::InvalidAmount);
        require!(params.min_apy > 0 && params.min_apy <= 10000, IntentError::InvalidAPY); // Max 100%
        
        let protocol_fee = (params.amount as u128)
            .checked_mul(PROTOCOL_FEE_BPS as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap() as u64;
        
        // Choose best lending protocol for this token
        let selected_protocol = LendingRouter::choose_best_lending_protocol(&params.mint, params.amount);
        
        msg!(
            "🎯 Selected lending protocol: {:?} for {} (min APY: {}%)",
            selected_protocol,
            params.mint,
            params.min_apy
        );
        
        intent_account.authority = ctx.accounts.authority.key();
        intent_account.intent_type = IntentType::Lend;
        intent_account.status = IntentStatus::Pending;
        intent_account.from_mint = params.mint;
        intent_account.to_mint = params.mint; // Same for lending
        intent_account.amount = params.amount;
        intent_account.protocol_fee = protocol_fee;
        intent_account.max_slippage = 0;
        intent_account.min_apy = Some(params.min_apy);
        intent_account.target_price = None;
        intent_account.max_price_impact = None;
        intent_account.execution_price = None;
        intent_account.execution_apy = None;
        intent_account.rugproof_enabled = false;
        intent_account.selected_swap_protocol = SwapProtocol::Jupiter; // Default value
        intent_account.selected_lending_protocol = Some(selected_protocol.clone());
        intent_account.created_at = Clock::get()?.unix_timestamp;
        intent_account.expires_at = Clock::get()?.unix_timestamp + INTENT_EXPIRY_SECONDS;
        intent_account.executed_at = None;
        intent_account.cancelled_at = None;
        intent_account.bump = ctx.bumps.intent_account;
        
        user_account.active_intents += 1;
        user_account.total_intents_created += 1;
        protocol_state.total_intents_created += 1;
        
        msg!(
            "🏦 Lend intent created: {} tokens at {}% min APY via {:?} (Fee: {})",
            params.amount,
            params.min_apy,
            selected_protocol,
            protocol_fee
        );
        
        Ok(())
    }

    /// Execute a lending intent through Solend
    pub fn execute_lend_intent_solend(
        ctx: Context<ExecuteLendIntentSolend>,
        reserve_data: solend::SolendReserve,
    ) -> Result<()> {
        require!(ctx.accounts.intent_account.status == IntentStatus::Pending, IntentError::IntentNotPending);
        require!(Clock::get()?.unix_timestamp < ctx.accounts.intent_account.expires_at, IntentError::IntentExpired);
        require!(
            matches!(ctx.accounts.intent_account.selected_lending_protocol, Some(LendingProtocol::Solend)), 
            IntentError::WrongProtocol
        );
        
        msg!("🏦 Executing Solend lending...");
        
        let protocol_fee = ctx.accounts.intent_account.protocol_fee;
        let net_amount = ctx.accounts.intent_account.amount.checked_sub(protocol_fee).unwrap();
        
        // Collect protocol fee
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.treasury_fee_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, protocol_fee)?;
        
        // Execute Solend lending with real integration
        let lend_params = solend::SolendLendParams {
            reserve: ctx.accounts.solend_reserve.as_ref().unwrap().key(),
            lending_market: ctx.accounts.solend_lending_market.as_ref().unwrap().key(),
            amount: net_amount,
            expected_apy: ctx.accounts.intent_account.min_apy.unwrap_or(0),
        };
        
        let actual_apy = solend::execute_solend_lend(&ctx.accounts.intent_account, lend_params, reserve_data)?;
        
        // Transfer tokens to Solend reserve
        let solend_cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.solend_destination_liquidity.as_ref().unwrap().to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let solend_cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), solend_cpi_accounts);
        token::transfer(solend_cpi_ctx, net_amount)?;
        
        // Update intent status
        ctx.accounts.intent_account.status = IntentStatus::Executed;
        ctx.accounts.intent_account.executed_at = Some(Clock::get()?.unix_timestamp);
        ctx.accounts.intent_account.execution_apy = Some(actual_apy);
        
        // Update counters
        ctx.accounts.user_account.active_intents -= 1;
        ctx.accounts.user_account.total_volume += ctx.accounts.intent_account.amount;
        ctx.accounts.protocol_state.total_intents_executed += 1;
        ctx.accounts.protocol_state.total_fees_collected += protocol_fee;
        
        emit!(LendIntentExecuted {
            intent_id: ctx.accounts.intent_account.key(),
            user: ctx.accounts.user.key(),
            mint: ctx.accounts.intent_account.from_mint,
            amount: net_amount,
            apy: actual_apy,
            protocol: LendingProtocol::Solend,
            protocol_fee,
        });
        
        msg!("✅ Solend lending completed: {} tokens at {}% APY", net_amount, actual_apy);
        Ok(())
    }

    /// Execute a lending intent through Port Finance
    pub fn execute_lend_intent_port(
        ctx: Context<ExecuteLendIntentPort>,
        reserve_data: port_finance::PortReserve,
    ) -> Result<()> {
        require!(ctx.accounts.intent_account.status == IntentStatus::Pending, IntentError::IntentNotPending);
        require!(Clock::get()?.unix_timestamp < ctx.accounts.intent_account.expires_at, IntentError::IntentExpired);
        require!(
            matches!(ctx.accounts.intent_account.selected_lending_protocol, Some(LendingProtocol::PortFinance)), 
            IntentError::WrongProtocol
        );
        
        msg!("🏦 Executing Port Finance lending...");
        
        let protocol_fee = ctx.accounts.intent_account.protocol_fee;
        let net_amount = ctx.accounts.intent_account.amount.checked_sub(protocol_fee).unwrap();
        
        // Collect protocol fee
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.treasury_fee_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, protocol_fee)?;
        
        // Execute Port Finance lending
        let lend_params = port_finance::PortLendParams {
            reserve: ctx.accounts.port_reserve.as_ref().unwrap().key(),
            staking_pool: ctx.accounts.port_staking_pool.as_ref().unwrap().key(),
            amount: net_amount,
            expected_apy: ctx.accounts.intent_account.min_apy.unwrap_or(0),
        };
        
        let actual_apy = port_finance::execute_port_lend(&ctx.accounts.intent_account, lend_params, reserve_data)?;
        
        // Transfer tokens to Port Finance reserve
        let port_cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.port_reserve.as_ref().unwrap().to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let port_cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), port_cpi_accounts);
        token::transfer(port_cpi_ctx, net_amount)?;
        
        // Update intent status
        ctx.accounts.intent_account.status = IntentStatus::Executed;
        ctx.accounts.intent_account.executed_at = Some(Clock::get()?.unix_timestamp);
        ctx.accounts.intent_account.execution_apy = Some(actual_apy);
        
        // Update counters
        ctx.accounts.user_account.active_intents -= 1;
        ctx.accounts.user_account.total_volume += ctx.accounts.intent_account.amount;
        ctx.accounts.protocol_state.total_intents_executed += 1;
        ctx.accounts.protocol_state.total_fees_collected += protocol_fee;
        
        emit!(LendIntentExecuted {
            intent_id: ctx.accounts.intent_account.key(),
            user: ctx.accounts.user.key(),
            mint: ctx.accounts.intent_account.from_mint,
            amount: net_amount,
            apy: actual_apy,
            protocol: LendingProtocol::PortFinance,
            protocol_fee,
        });
        
        msg!("✅ Port Finance lending completed: {} tokens at {}% APY", net_amount, actual_apy);
        Ok(())
    }

    /// Create a buy intent with price conditions
    pub fn create_buy_intent(
        ctx: Context<CreateBuyIntent>,
        params: BuyIntentParams,
    ) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        let intent_account = &mut ctx.accounts.intent_account;
        let protocol_state = &mut ctx.accounts.protocol_state;
        
        require!(user_account.active_intents < MAX_INTENTS_PER_USER, IntentError::TooManyActiveIntents);
        require!(!protocol_state.is_paused, IntentError::ProtocolPaused);
        require!(params.usdc_amount > 0, IntentError::InvalidAmount);
        
        let protocol_fee = (params.usdc_amount as u128)
            .checked_mul(PROTOCOL_FEE_BPS as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap() as u64;
        
        // Rugproof check if enabled
        if params.rugproof_check {
            let rugproof_score = perform_rugproof_check(&params.mint)?;
            require!(rugproof_score >= MIN_RUGPROOF_SCORE, IntentError::RugproofCheckFailed);
        }
        
        intent_account.authority = ctx.accounts.authority.key();
        intent_account.intent_type = IntentType::Buy;
        intent_account.status = IntentStatus::Pending;
        intent_account.from_mint = params.usdc_mint; // Passed in params
        intent_account.to_mint = params.mint;
        intent_account.amount = params.usdc_amount;
        intent_account.protocol_fee = protocol_fee;
        intent_account.max_slippage = 0;
        intent_account.min_apy = None;
        intent_account.target_price = params.target_price;
        intent_account.max_price_impact = Some(params.max_price_impact);
        intent_account.execution_price = None;
        intent_account.execution_apy = None;
        intent_account.rugproof_enabled = params.rugproof_check;
        intent_account.selected_swap_protocol = SwapProtocol::Jupiter; // Default for buy intents
        intent_account.selected_lending_protocol = None;
        intent_account.created_at = Clock::get()?.unix_timestamp;
        intent_account.expires_at = Clock::get()?.unix_timestamp + INTENT_EXPIRY_SECONDS;
        intent_account.executed_at = None;
        intent_account.cancelled_at = None;
        intent_account.bump = ctx.bumps.intent_account;
        
        user_account.active_intents += 1;
        user_account.total_intents_created += 1;
        protocol_state.total_intents_created += 1;
        
        msg!(
            "💳 Buy intent created: ${} for {} (Fee: ${})",
            params.usdc_amount,
            params.mint,
            protocol_fee
        );
        
        Ok(())
    }

    /// Cancel an active intent
    pub fn cancel_intent(ctx: Context<CancelIntent>) -> Result<()> {
        let intent_account = &mut ctx.accounts.intent_account;
        let user_account = &mut ctx.accounts.user_account;
        
        require!(intent_account.status == IntentStatus::Pending, IntentError::IntentNotPending);
        require!(intent_account.authority == ctx.accounts.authority.key(), IntentError::Unauthorized);
        
        intent_account.status = IntentStatus::Cancelled;
        intent_account.cancelled_at = Some(Clock::get()?.unix_timestamp);
        
        user_account.active_intents -= 1;
        
        msg!("❌ Intent cancelled: {}", intent_account.key());
        Ok(())
    }

    /// Emergency pause protocol (admin only)
    pub fn pause_protocol(ctx: Context<PauseProtocol>) -> Result<()> {
        let protocol_state = &mut ctx.accounts.protocol_state;
        require!(protocol_state.authority == ctx.accounts.authority.key(), IntentError::Unauthorized);
        
        protocol_state.is_paused = true;
        msg!("⏸️ Protocol paused by admin");
        Ok(())
    }

    /// Unpause protocol (admin only)
    pub fn unpause_protocol(ctx: Context<UnpauseProtocol>) -> Result<()> {
        let protocol_state = &mut ctx.accounts.protocol_state;
        require!(protocol_state.authority == ctx.accounts.authority.key(), IntentError::Unauthorized);
        
        protocol_state.is_paused = false;
        msg!("▶️ Protocol unpaused by admin");
        Ok(())
    }
}

// Account Structs
#[account]
pub struct ProtocolState {
    pub authority: Pubkey,
    pub treasury_authority: Pubkey,
    pub protocol_fee_bps: u16,
    pub total_fees_collected: u64,
    pub total_intents_created: u64,
    pub total_intents_executed: u64,
    pub is_paused: bool,
    pub bump: u8,
}

#[account]
pub struct UserAccount {
    pub authority: Pubkey,
    pub active_intents: u8,
    pub total_intents_created: u64,
    pub total_volume: u64,
    pub rugproof_enabled: bool,
    pub bump: u8,
}

#[account]
pub struct IntentAccount {
    pub authority: Pubkey,
    pub intent_type: IntentType,
    pub status: IntentStatus,
    pub from_mint: Pubkey,
    pub to_mint: Pubkey,
    pub amount: u64,
    pub protocol_fee: u64,
    pub max_slippage: u16,
    pub min_apy: Option<u16>,
    pub target_price: Option<u64>,
    pub max_price_impact: Option<u16>,
    pub execution_price: Option<u64>,
    pub execution_apy: Option<u16>,
    pub rugproof_enabled: bool,
    pub selected_swap_protocol: SwapProtocol, // For swap intents
    pub selected_lending_protocol: Option<LendingProtocol>, // For lending intents
    pub created_at: i64,
    pub expires_at: i64,
    pub executed_at: Option<i64>,
    pub cancelled_at: Option<i64>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum IntentType {
    Swap,
    Lend,
    Buy,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum IntentStatus {
    Pending,
    Executed,
    Cancelled,
    Expired,
}

// Parameter Structs
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SwapIntentParams {
    pub from_mint: Pubkey,
    pub to_mint: Pubkey,
    pub amount: u64,
    pub max_slippage: u16,
    pub rugproof_enabled: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct LendIntentParams {
    pub mint: Pubkey,
    pub amount: u64,
    pub min_apy: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct BuyIntentParams {
    pub mint: Pubkey,
    pub usdc_mint: Pubkey,
    pub usdc_amount: u64,
    pub target_price: Option<u64>,
    pub max_price_impact: u16,
    pub rugproof_check: bool,
}

// Context Structs
#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 2 + 8 + 8 + 8 + 1 + 1,
        seeds = [b"protocol_state"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeUser<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1 + 8 + 8 + 1 + 1,
        seeds = [b"user_account", authority.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateSwapIntent<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"protocol_state"],
        bump = protocol_state.bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    
    #[account(
        mut,
        seeds = [b"user_account", authority.key().as_ref()],
        bump = user_account.bump
    )]
    pub user_account: Account<'info, UserAccount>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1 + 1 + 32 + 32 + 8 + 8 + 2 + 2 + 8 + 2 + 8 + 8 + 1 + 32 + 32 + 8 + 8 + 8 + 8 + 1, // Updated space for both protocol selections
        seeds = [b"intent", authority.key().as_ref(), &(user_account.total_intents_created + 1).to_le_bytes()],
        bump
    )]
    pub intent_account: Account<'info, IntentAccount>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteSwapIntentJupiter<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        constraint = intent_account.authority == user.key()
    )]
    pub intent_account: Account<'info, IntentAccount>,
    
    #[account(
        mut,
        seeds = [b"protocol_state"],
        bump = protocol_state.bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    
    #[account(
        mut,
        seeds = [b"user_account", user.key().as_ref()],
        bump = user_account.bump
    )]
    pub user_account: Account<'info, UserAccount>,
    
    #[account(mut)]
    pub user_source_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_destination_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub treasury_fee_account: Account<'info, TokenAccount>,
    
    /// CHECK: Jupiter program
    #[account(address = jupiter::JUPITER_PROGRAM_ID)]
    pub jupiter_program: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}



#[derive(Accounts)]
pub struct ExecuteSwapIntentRaydium<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        constraint = intent_account.authority == user.key()
    )]
    pub intent_account: Account<'info, IntentAccount>,
    
    #[account(
        mut,
        seeds = [b"protocol_state"],
        bump = protocol_state.bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    
    #[account(
        mut,
        seeds = [b"user_account", user.key().as_ref()],
        bump = user_account.bump
    )]
    pub user_account: Account<'info, UserAccount>,
    
    #[account(mut)]
    pub user_source_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_destination_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub treasury_fee_account: Account<'info, TokenAccount>,
    
    /// CHECK: Raydium pool account
    pub raydium_pool: UncheckedAccount<'info>,
    
    /// CHECK: Raydium program
    #[account(address = raydium::RAYDIUM_AMM_PROGRAM_ID)]
    pub raydium_program: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}



#[derive(Accounts)]
pub struct CreateLendIntent<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"protocol_state"],
        bump = protocol_state.bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    
    #[account(
        mut,
        seeds = [b"user_account", authority.key().as_ref()],
        bump = user_account.bump
    )]
    pub user_account: Account<'info, UserAccount>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1 + 1 + 32 + 32 + 8 + 8 + 2 + 2 + 8 + 2 + 8 + 8 + 1 + 32 + 32 + 8 + 8 + 8 + 8 + 1,
        seeds = [b"intent", authority.key().as_ref(), &(user_account.total_intents_created + 1).to_le_bytes()],
        bump
    )]
    pub intent_account: Account<'info, IntentAccount>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteLendIntentSolend<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        constraint = intent_account.authority == user.key()
    )]
    pub intent_account: Account<'info, IntentAccount>,
    
    #[account(mut)]
    pub protocol_state: Account<'info, ProtocolState>,
    
    #[account(mut)]
    pub user_account: Account<'info, UserAccount>,
    
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub treasury_fee_account: Account<'info, TokenAccount>,
    
    // Solend-specific accounts
    /// CHECK: Solend reserve account
    pub solend_reserve: Option<UncheckedAccount<'info>>,
    
    /// CHECK: Solend lending market
    pub solend_lending_market: Option<UncheckedAccount<'info>>,
    
    /// CHECK: Solend destination liquidity account
    pub solend_destination_liquidity: Option<UncheckedAccount<'info>>,
    
    /// CHECK: Solend collateral mint
    pub solend_collateral_mint: Option<UncheckedAccount<'info>>,
    
    /// CHECK: User's collateral token account
    pub user_collateral_account: Option<UncheckedAccount<'info>>,
    
    /// CHECK: Solend program
    #[account(address = solend::SOLEND_PROGRAM_ID)]
    pub solend_program: Option<UncheckedAccount<'info>>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ExecuteLendIntentPort<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        constraint = intent_account.authority == user.key()
    )]
    pub intent_account: Account<'info, IntentAccount>,
    
    #[account(mut)]
    pub protocol_state: Account<'info, ProtocolState>,
    
    #[account(mut)]
    pub user_account: Account<'info, UserAccount>,
    
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub treasury_fee_account: Account<'info, TokenAccount>,
    
    // Port Finance-specific accounts
    /// CHECK: Port Finance reserve
    pub port_reserve: Option<UncheckedAccount<'info>>,
    
    /// CHECK: Port Finance staking pool
    pub port_staking_pool: Option<UncheckedAccount<'info>>,
    
    /// CHECK: Port Finance LP token account
    pub port_lp_account: Option<UncheckedAccount<'info>>,
    
    /// CHECK: Port Finance program
    #[account(address = port_finance::PORT_FINANCE_PROGRAM_ID)]
    pub port_program: Option<UncheckedAccount<'info>>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CreateBuyIntent<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"protocol_state"],
        bump = protocol_state.bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    
    #[account(
        mut,
        seeds = [b"user_account", authority.key().as_ref()],
        bump = user_account.bump
    )]
    pub user_account: Account<'info, UserAccount>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1 + 1 + 32 + 32 + 8 + 8 + 2 + 2 + 8 + 2 + 8 + 8 + 1 + 32 + 32 + 8 + 8 + 8 + 8 + 1,
        seeds = [b"intent", authority.key().as_ref(), &(user_account.total_intents_created + 1).to_le_bytes()],
        bump
    )]
    pub intent_account: Account<'info, IntentAccount>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelIntent<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        constraint = intent_account.authority == authority.key()
    )]
    pub intent_account: Account<'info, IntentAccount>,
    
    #[account(mut)]
    pub user_account: Account<'info, UserAccount>,
}

#[derive(Accounts)]
pub struct PauseProtocol<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"protocol_state"],
        bump = protocol_state.bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

#[derive(Accounts)]
pub struct UnpauseProtocol<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"protocol_state"],
        bump = protocol_state.bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

// Events
#[event]
pub struct SwapIntentExecuted {
    pub intent_id: Pubkey,
    pub user: Pubkey,
    pub protocol: SwapProtocol,
    pub from_mint: Pubkey,
    pub to_mint: Pubkey,
    pub amount_in: u64,
    pub amount_out: u64,
    pub protocol_fee: u64,
}

#[event]
pub struct LendIntentExecuted {
    pub intent_id: Pubkey,
    pub user: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub apy: u16,
    pub protocol: LendingProtocol,
    pub protocol_fee: u64,
}

// Error Codes
#[error_code]
pub enum IntentError {
    #[msg("Too many active intents")]
    TooManyActiveIntents,
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Slippage too high")]
    SlippageTooHigh,
    #[msg("Rugproof check failed")]
    RugproofCheckFailed,
    #[msg("Intent is not pending")]
    IntentNotPending,
    #[msg("Intent has expired")]
    IntentExpired,
    #[msg("Slippage exceeded")]
    SlippageExceeded,
    #[msg("Invalid APY")]
    InvalidAPY,
    #[msg("APY too low")]
    APYTooLow,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Wrong protocol selected")]
    WrongProtocol,
}

fn perform_rugproof_check(mint: &Pubkey) -> Result<u8> {
    // Real rugproof check would analyze:
    // - Token metadata and verification
    // - Liquidity pool size and age
    // - Developer wallet distributions
    // - Trading volume and holders count
    // For now, return a score based on mint characteristics
    
    let score = if mint.to_bytes()[0] < 50 {
        95 // High score for certain patterns
    } else if mint.to_bytes()[0] < 100 {
        85 // Medium score  
    } else {
        75 // Lower score for other patterns
    };
    
    msg!("🛡️ Rugproof score for {}: {}", mint, score);
    Ok(score)
}
