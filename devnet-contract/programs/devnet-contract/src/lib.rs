use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};

declare_id!("2UPCMZ2LESPx8wU83wdng3Yjhx2yxRLEkEDYDkNUg1jd");

#[program]
pub mod devnet_contract {
    use super::*;

    /// Initialize the simplified IntentFI protocol for devnet
    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        treasury_authority: Pubkey,
    ) -> Result<()> {
        let protocol_state = &mut ctx.accounts.protocol_state;
        protocol_state.authority = ctx.accounts.authority.key();
        protocol_state.treasury_authority = treasury_authority;
        protocol_state.protocol_fee_bps = 30; // 0.3%
        protocol_state.total_intents_created = 0;
        protocol_state.total_intents_executed = 0;
        protocol_state.is_paused = false;
        protocol_state.bump = ctx.bumps.protocol_state;
        
        msg!("🚀 Simplified IntentFI Protocol initialized for devnet");
        msg!("💰 Protocol fee: 0.3% on all transactions");
        Ok(())
    }

    /// Initialize a user account
    pub fn initialize_user(ctx: Context<InitializeUser>) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        user_account.authority = ctx.accounts.authority.key();
        user_account.active_intents = 0;
        user_account.total_intents_created = 0;
        user_account.total_volume = 0;
        user_account.bump = ctx.bumps.user_account;
        
        msg!("👤 User account initialized for: {}", ctx.accounts.authority.key());
        Ok(())
    }

    /// Create a simple swap intent (devnet version)
    pub fn create_swap_intent(
        ctx: Context<CreateSwapIntent>,
        from_mint: Pubkey,
        to_mint: Pubkey,
        amount: u64,
        max_slippage: u16,
    ) -> Result<()> {
        let protocol_state = &mut ctx.accounts.protocol_state;
        let user_account = &mut ctx.accounts.user_account;
        let intent_account = &mut ctx.accounts.intent_account;
        
        require!(!protocol_state.is_paused, ErrorCode::ProtocolPaused);
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(max_slippage <= 1000, ErrorCode::SlippageTooHigh); // Max 10%
        
        let protocol_fee = (amount as u128)
            .checked_mul(protocol_state.protocol_fee_bps as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap() as u64;
        
        intent_account.authority = ctx.accounts.authority.key();
        intent_account.intent_type = IntentType::Swap;
        intent_account.status = IntentStatus::Pending;
        intent_account.from_mint = from_mint;
        intent_account.to_mint = to_mint;
        intent_account.amount = amount;
        intent_account.protocol_fee = protocol_fee;
        intent_account.max_slippage = Some(max_slippage);
        intent_account.created_at = Clock::get()?.unix_timestamp;
        intent_account.expires_at = Clock::get()?.unix_timestamp + 3600; // 1 hour
        intent_account.bump = ctx.bumps.intent_account;
        
        user_account.active_intents += 1;
        user_account.total_intents_created += 1;
        protocol_state.total_intents_created += 1;
        
        msg!(
            "✅ Swap intent created: {} {} → {} {} (Fee: {})",
            amount, from_mint, amount - protocol_fee, to_mint, protocol_fee
        );
        
        Ok(())
    }

    /// Execute a simple swap (simulated for devnet)
    pub fn execute_swap_intent(
        ctx: Context<ExecuteSwapIntent>,
        expected_output: u64,
    ) -> Result<()> {
        let intent_account = &mut ctx.accounts.intent_account;
        let user_account = &mut ctx.accounts.user_account;
        let protocol_state = &mut ctx.accounts.protocol_state;
        
        require!(intent_account.status == IntentStatus::Pending, ErrorCode::IntentNotPending);
        require!(Clock::get()?.unix_timestamp < intent_account.expires_at, ErrorCode::IntentExpired);
        require!(intent_account.authority == ctx.accounts.user.key(), ErrorCode::Unauthorized);
        
        let protocol_fee = intent_account.protocol_fee;
        let net_amount = intent_account.amount.checked_sub(protocol_fee).unwrap();
        
        // Transfer protocol fee to treasury
        let fee_transfer = Transfer {
            from: ctx.accounts.user_source_token.to_account_info(),
            to: ctx.accounts.treasury_fee_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), fee_transfer),
            protocol_fee,
        )?;
        
        // Simulate swap - transfer remaining tokens from user to user destination
        // In real implementation, this would interact with DEX
        let swap_transfer = Transfer {
            from: ctx.accounts.user_source_token.to_account_info(),
            to: ctx.accounts.user_destination_token.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), swap_transfer),
            net_amount,
        )?;
        
        // Update intent status
        intent_account.status = IntentStatus::Executed;
        intent_account.executed_at = Some(Clock::get()?.unix_timestamp);
        intent_account.execution_output = Some(expected_output);
        
        // Update counters
        user_account.active_intents -= 1;
        user_account.total_volume += intent_account.amount;
        protocol_state.total_intents_executed += 1;
        
        emit!(SwapIntentExecuted {
            intent_id: intent_account.key(),
            user: ctx.accounts.user.key(),
            from_mint: intent_account.from_mint,
            to_mint: intent_account.to_mint,
            amount_in: net_amount,
            amount_out: expected_output,
            protocol_fee,
        });
        
        msg!("✅ Swap executed: {} → {} tokens (Fee: {})", net_amount, expected_output, protocol_fee);
        Ok(())
    }

    /// Create a lending intent (simplified)
    pub fn create_lend_intent(
        ctx: Context<CreateLendIntent>,
        mint: Pubkey,
        amount: u64,
        min_apy: u16,
    ) -> Result<()> {
        let protocol_state = &mut ctx.accounts.protocol_state;
        let user_account = &mut ctx.accounts.user_account;
        let intent_account = &mut ctx.accounts.intent_account;
        
        require!(!protocol_state.is_paused, ErrorCode::ProtocolPaused);
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(min_apy <= 10000, ErrorCode::InvalidAPY); // Max 100% APY
        
        let protocol_fee = (amount as u128)
            .checked_mul(protocol_state.protocol_fee_bps as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap() as u64;
        
        intent_account.authority = ctx.accounts.authority.key();
        intent_account.intent_type = IntentType::Lend;
        intent_account.status = IntentStatus::Pending;
        intent_account.from_mint = mint;
        intent_account.to_mint = mint;
        intent_account.amount = amount;
        intent_account.protocol_fee = protocol_fee;
        intent_account.min_apy = Some(min_apy);
        intent_account.created_at = Clock::get()?.unix_timestamp;
        intent_account.expires_at = Clock::get()?.unix_timestamp + 7200; // 2 hours
        intent_account.bump = ctx.bumps.intent_account;
        
        user_account.active_intents += 1;
        user_account.total_intents_created += 1;
        protocol_state.total_intents_created += 1;
        
        msg!("🏦 Lend intent created: {} tokens at {}% min APY", amount, min_apy);
        Ok(())
    }

    /// Execute lending intent (simulated)
    pub fn execute_lend_intent(
        ctx: Context<ExecuteLendIntent>,
        actual_apy: u16,
    ) -> Result<()> {
        let intent_account = &mut ctx.accounts.intent_account;
        let user_account = &mut ctx.accounts.user_account;
        let protocol_state = &mut ctx.accounts.protocol_state;
        
        require!(intent_account.status == IntentStatus::Pending, ErrorCode::IntentNotPending);
        require!(Clock::get()?.unix_timestamp < intent_account.expires_at, ErrorCode::IntentExpired);
        require!(intent_account.authority == ctx.accounts.user.key(), ErrorCode::Unauthorized);
        require!(actual_apy >= intent_account.min_apy.unwrap_or(0), ErrorCode::APYTooLow);
        
        let protocol_fee = intent_account.protocol_fee;
        let net_amount = intent_account.amount.checked_sub(protocol_fee).unwrap();
        
        // Transfer protocol fee
        let fee_transfer = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.treasury_fee_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), fee_transfer),
            protocol_fee,
        )?;
        
        // Simulate lending - in real implementation, tokens would go to lending protocol
        // For devnet, we just track the intent
        
        intent_account.status = IntentStatus::Executed;
        intent_account.executed_at = Some(Clock::get()?.unix_timestamp);
        intent_account.execution_apy = Some(actual_apy);
        
        user_account.active_intents -= 1;
        user_account.total_volume += intent_account.amount;
        protocol_state.total_intents_executed += 1;
        
        emit!(LendIntentExecuted {
            intent_id: intent_account.key(),
            user: ctx.accounts.user.key(),
            mint: intent_account.from_mint,
            amount: net_amount,
            apy: actual_apy,
            protocol_fee,
        });
        
        msg!("✅ Lending executed: {} tokens at {}% APY", net_amount, actual_apy);
        Ok(())
    }

    /// Cancel an intent
    pub fn cancel_intent(ctx: Context<CancelIntent>) -> Result<()> {
        let intent_account = &mut ctx.accounts.intent_account;
        let user_account = &mut ctx.accounts.user_account;
        
        require!(intent_account.status == IntentStatus::Pending, ErrorCode::IntentNotPending);
        require!(intent_account.authority == ctx.accounts.authority.key(), ErrorCode::Unauthorized);
        
        intent_account.status = IntentStatus::Cancelled;
        intent_account.cancelled_at = Some(Clock::get()?.unix_timestamp);
        user_account.active_intents -= 1;
        
        msg!("❌ Intent cancelled: {}", intent_account.key());
        Ok(())
    }
}

// Account Structs
#[account]
pub struct ProtocolState {
    pub authority: Pubkey,
    pub treasury_authority: Pubkey,
    pub protocol_fee_bps: u16,
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
    pub max_slippage: Option<u16>,
    pub min_apy: Option<u16>,
    pub execution_output: Option<u64>,
    pub execution_apy: Option<u16>,
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
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum IntentStatus {
    Pending,
    Executed,
    Cancelled,
    Expired,
}

// Context Structs
#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 2 + 8 + 8 + 1 + 1,
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
        space = 8 + 32 + 1 + 8 + 8 + 1,
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
        space = 8 + 32 + 1 + 1 + 32 + 32 + 8 + 8 + 2 + 2 + 8 + 2 + 8 + 8 + 8 + 8 + 1,
        seeds = [b"intent", authority.key().as_ref(), &(user_account.total_intents_created + 1).to_le_bytes()],
        bump
    )]
    pub intent_account: Account<'info, IntentAccount>,
    
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
        space = 8 + 32 + 1 + 1 + 32 + 32 + 8 + 8 + 2 + 2 + 8 + 2 + 8 + 8 + 8 + 8 + 1,
        seeds = [b"intent", authority.key().as_ref(), &(user_account.total_intents_created + 1).to_le_bytes()],
        bump
    )]
    pub intent_account: Account<'info, IntentAccount>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteSwapIntent<'info> {
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
    pub user_source_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_destination_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub treasury_fee_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ExecuteLendIntent<'info> {
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
    
    pub token_program: Program<'info, Token>,
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

// Events
#[event]
pub struct SwapIntentExecuted {
    pub intent_id: Pubkey,
    pub user: Pubkey,
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
    pub protocol_fee: u64,
}

// Error Codes
#[error_code]
pub enum ErrorCode {
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Slippage too high")]
    SlippageTooHigh,
    #[msg("Intent is not pending")]
    IntentNotPending,
    #[msg("Intent has expired")]
    IntentExpired,
    #[msg("Invalid APY")]
    InvalidAPY,
    #[msg("APY too low")]
    APYTooLow,
    #[msg("Unauthorized")]
    Unauthorized,
}
