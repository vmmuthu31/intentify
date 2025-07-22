use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        create_metadata_accounts_v3, mpl_token_metadata::types::DataV2, CreateMetadataAccountsV3,
        Metadata as Metaplex,
    },
    token::{self, Mint, Token, TokenAccount, MintTo},
};

declare_id!("5y2X9WML5ttrWrxzUfGrLSxbXfEcKTyV1dDyw2jXW1Zg");

#[program]
pub mod launchpad_contract {
    use super::*;

    /// Initialize the launchpad protocol
    pub fn initialize_launchpad(
        ctx: Context<InitializeLaunchpad>,
        platform_fee_bps: u16,
        treasury_authority: Pubkey,
    ) -> Result<()> {
        let launchpad_state = &mut ctx.accounts.launchpad_state;
        launchpad_state.authority = ctx.accounts.authority.key();
        launchpad_state.treasury_authority = treasury_authority;
        launchpad_state.platform_fee_bps = platform_fee_bps;
        launchpad_state.total_launches = 0;
        launchpad_state.total_raised = 0;
        launchpad_state.is_paused = false;
        launchpad_state.bump = ctx.bumps.launchpad_state;
        
        msg!("🚀 Token Launchpad initialized!");
        msg!("💰 Platform fee: {}%", platform_fee_bps as f64 / 100.0);
        Ok(())
    }

    /// Create a new token launch
    pub fn create_token_launch(
        ctx: Context<CreateTokenLaunch>,
        launch_params: LaunchParams,
    ) -> Result<()> {
        let launchpad_state = &mut ctx.accounts.launchpad_state;
        let launch_state = &mut ctx.accounts.launch_state;
        
        require!(!launchpad_state.is_paused, ErrorCode::LaunchpadPaused);
        require!(launch_params.soft_cap > 0, ErrorCode::InvalidSoftCap);
        require!(launch_params.hard_cap > launch_params.soft_cap, ErrorCode::InvalidHardCap);
        require!(launch_params.token_price > 0, ErrorCode::InvalidTokenPrice);
        require!(launch_params.min_contribution > 0, ErrorCode::InvalidMinContribution);
        require!(launch_params.max_contribution >= launch_params.min_contribution, ErrorCode::InvalidMaxContribution);
        require!(launch_params.launch_duration > 0, ErrorCode::InvalidLaunchDuration);
        
        let current_time = Clock::get()?.unix_timestamp;
        
        // Initialize launch state
        launch_state.creator = ctx.accounts.creator.key();
        launch_state.token_mint = ctx.accounts.token_mint.key();
        launch_state.token_name = launch_params.token_name.clone();
        launch_state.token_symbol = launch_params.token_symbol.clone();
        launch_state.token_uri = launch_params.token_uri.clone();
        launch_state.soft_cap = launch_params.soft_cap;
        launch_state.hard_cap = launch_params.hard_cap;
        launch_state.token_price = launch_params.token_price;
        launch_state.tokens_for_sale = launch_params.tokens_for_sale;
        launch_state.min_contribution = launch_params.min_contribution;
        launch_state.max_contribution = launch_params.max_contribution;
        launch_state.launch_start = current_time;
        launch_state.launch_end = current_time + launch_params.launch_duration;
        launch_state.total_raised = 0;
        launch_state.total_contributors = 0;
        launch_state.tokens_sold = 0;
        launch_state.status = LaunchStatus::Active;
        launch_state.bump = ctx.bumps.launch_state;
        
        // Update global state
        launchpad_state.total_launches += 1;
        
        emit!(TokenLaunchCreated {
            launch_id: launch_state.key(),
            creator: ctx.accounts.creator.key(),
            token_mint: ctx.accounts.token_mint.key(),
            token_name: launch_params.token_name,
            token_symbol: launch_params.token_symbol,
            soft_cap: launch_params.soft_cap,
            hard_cap: launch_params.hard_cap,
            token_price: launch_params.token_price,
            launch_end: launch_state.launch_end,
        });
        
        msg!("🪙 Token launch created: {} ({})", &launch_state.token_name, &launch_state.token_symbol);
        msg!("💎 Hard cap: {} SOL, Soft cap: {} SOL", launch_params.hard_cap, launch_params.soft_cap);
        msg!("💰 Token price: {} SOL per token", launch_params.token_price);
        
        Ok(())
    }

    /// Create token mint with metadata
    pub fn create_token_mint(
        ctx: Context<CreateTokenMint>,
        _decimals: u8,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let creator_key = ctx.accounts.creator.key();
        let seeds = &[
            b"launch_state",
            creator_key.as_ref(),
            &[ctx.bumps.launch_state],
        ];
        let signer = &[&seeds[..]];
        
        // Create metadata
        let data_v2 = DataV2 {
            name,
            symbol,
            uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };
        
        let metadata_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                payer: ctx.accounts.creator.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                metadata: ctx.accounts.metadata.to_account_info(),
                mint_authority: ctx.accounts.launch_state.to_account_info(),
                update_authority: ctx.accounts.launch_state.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
            signer,
        );
        
        create_metadata_accounts_v3(metadata_ctx, data_v2, false, true, None)?;
        
        msg!("🪙 Token mint created with metadata");
        Ok(())
    }

    /// Contribute to a token launch
    pub fn contribute_to_launch(
        ctx: Context<ContributeToLaunch>,
        amount: u64,
    ) -> Result<()> {
        let launch_state = &mut ctx.accounts.launch_state;
        let contributor_state = &mut ctx.accounts.contributor_state;
        let launchpad_state = &mut ctx.accounts.launchpad_state;
        
        let current_time = Clock::get()?.unix_timestamp;
        
        // Validate launch status
        require!(launch_state.status == LaunchStatus::Active, ErrorCode::LaunchNotActive);
        require!(current_time >= launch_state.launch_start, ErrorCode::LaunchNotStarted);
        require!(current_time <= launch_state.launch_end, ErrorCode::LaunchEnded);
        require!(amount >= launch_state.min_contribution, ErrorCode::ContributionTooLow);
        require!(
            contributor_state.total_contributed + amount <= launch_state.max_contribution,
            ErrorCode::ContributionTooHigh
        );
        require!(
            launch_state.total_raised + amount <= launch_state.hard_cap,
            ErrorCode::HardCapReached
        );
        
        // Calculate tokens to receive
        let tokens_to_receive = amount
            .checked_mul(10_u64.pow(ctx.accounts.token_mint.decimals as u32))
            .unwrap()
            .checked_div(launch_state.token_price)
            .unwrap();
        
        require!(
            launch_state.tokens_sold + tokens_to_receive <= launch_state.tokens_for_sale,
            ErrorCode::NotEnoughTokens
        );
        
        // For devnet testing, we'll just track contributions without actually holding SOL
        // In production, you'd use a proper vault system
        
        // Update contributor state
        let is_new_contributor = contributor_state.total_contributed == 0;
        contributor_state.contributor = ctx.accounts.contributor.key();
        contributor_state.launch = launch_state.key();
        contributor_state.total_contributed += amount;
        contributor_state.tokens_owed += tokens_to_receive;
        contributor_state.claimed = false;
        
        // Update launch state
        launch_state.total_raised += amount;
        launch_state.tokens_sold += tokens_to_receive;
        if is_new_contributor {
            launch_state.total_contributors += 1;
        }
        
        // Update global state
        launchpad_state.total_raised += amount;
        
        emit!(ContributionMade {
            launch_id: launch_state.key(),
            contributor: ctx.accounts.contributor.key(),
            amount,
            tokens_received: tokens_to_receive,
            total_raised: launch_state.total_raised,
        });
        
        msg!("💰 Contribution of {} SOL made, {} tokens allocated", amount, tokens_to_receive);
        
        Ok(())
    }

    /// Finalize a launch (success or failure)
    pub fn finalize_launch(ctx: Context<FinalizeLaunch>) -> Result<()> {
        let launch_state = &mut ctx.accounts.launch_state;
        
        require!(launch_state.status == LaunchStatus::Active, ErrorCode::LaunchNotActive);
        require!(
            Clock::get()?.unix_timestamp > launch_state.launch_end || 
            launch_state.total_raised >= launch_state.hard_cap,
            ErrorCode::LaunchStillActive
        );
        
        // Determine if launch was successful
        if launch_state.total_raised >= launch_state.soft_cap {
            launch_state.status = LaunchStatus::Successful;
            msg!("🎉 Launch successful! Raised {} SOL", launch_state.total_raised);
        } else {
            launch_state.status = LaunchStatus::Failed;
            msg!("❌ Launch failed. Only raised {} SOL (needed {})", 
                launch_state.total_raised, launch_state.soft_cap);
        }
        
        emit!(LaunchFinalized {
            launch_id: launch_state.key(),
            success: launch_state.status == LaunchStatus::Successful,
            total_raised: launch_state.total_raised,
            tokens_sold: launch_state.tokens_sold,
        });
        
        Ok(())
    }

    /// Claim tokens after successful launch
    pub fn claim_tokens(ctx: Context<ClaimTokens>) -> Result<()> {
        let launch_state = &ctx.accounts.launch_state;
        let contributor_state = &mut ctx.accounts.contributor_state;
        
        require!(launch_state.status == LaunchStatus::Successful, ErrorCode::LaunchNotSuccessful);
        require!(!contributor_state.claimed, ErrorCode::AlreadyClaimed);
        require!(contributor_state.tokens_owed > 0, ErrorCode::NoTokensOwed);
        
        let seeds = &[
            b"launch_state",
            launch_state.creator.as_ref(),
            &[launch_state.bump],
        ];
        let signer = &[&seeds[..]];
        
        // Mint tokens to contributor
        let mint_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.contributor_token_account.to_account_info(),
                authority: ctx.accounts.launch_state.to_account_info(),
            },
            signer,
        );
        
        token::mint_to(mint_ctx, contributor_state.tokens_owed)?;
        
        contributor_state.claimed = true;
        
        emit!(TokensClaimed {
            launch_id: launch_state.key(),
            contributor: contributor_state.contributor,
            tokens_claimed: contributor_state.tokens_owed,
        });
        
        msg!("🪙 {} tokens claimed by {}", contributor_state.tokens_owed, contributor_state.contributor);
        
        Ok(())
    }

    /// Claim refund after failed launch
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        let launch_state = &ctx.accounts.launch_state;
        let contributor_state = &mut ctx.accounts.contributor_state;
        
        require!(launch_state.status == LaunchStatus::Failed, ErrorCode::LaunchNotFailed);
        require!(!contributor_state.claimed, ErrorCode::AlreadyClaimed);
        require!(contributor_state.total_contributed > 0, ErrorCode::NoRefundOwed);
        
        // For devnet testing, we'll just mark as refunded
        // In production, you'd transfer SOL back from vault
        
        contributor_state.claimed = true;
        
        emit!(RefundClaimed {
            launch_id: launch_state.key(),
            contributor: contributor_state.contributor,
            refund_amount: contributor_state.total_contributed,
        });
        
        msg!("💰 Refund of {} SOL claimed", contributor_state.total_contributed);
        
        Ok(())
    }

    /// Withdraw raised funds (creator only, after successful launch)
    pub fn withdraw_funds(ctx: Context<WithdrawFunds>) -> Result<()> {
        let launch_state = &ctx.accounts.launch_state;
        let launchpad_state = &ctx.accounts.launchpad_state;
        
        require!(launch_state.status == LaunchStatus::Successful, ErrorCode::LaunchNotSuccessful);
        require!(launch_state.creator == ctx.accounts.creator.key(), ErrorCode::Unauthorized);
        
        let total_amount = launch_state.total_raised;
        let platform_fee = (total_amount as u128)
            .checked_mul(launchpad_state.platform_fee_bps as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap() as u64;
        let creator_amount = total_amount - platform_fee;
        
        // For devnet testing, we'll just emit the withdrawal event
        // In production, you'd transfer actual SOL from vault
        
        emit!(FundsWithdrawn {
            launch_id: launch_state.key(),
            creator: ctx.accounts.creator.key(),
            amount_withdrawn: creator_amount,
            platform_fee,
        });
        
        msg!("💰 Funds withdrawn: {} SOL to creator, {} SOL platform fee", creator_amount, platform_fee);
        
        Ok(())
    }
}

// Structs
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct LaunchParams {
    pub token_name: String,
    pub token_symbol: String,
    pub token_uri: String,
    pub soft_cap: u64,          // Minimum SOL to raise
    pub hard_cap: u64,          // Maximum SOL to raise
    pub token_price: u64,       // Price per token in lamports
    pub tokens_for_sale: u64,   // Total tokens available for sale
    pub min_contribution: u64,  // Minimum SOL contribution
    pub max_contribution: u64,  // Maximum SOL contribution per user
    pub launch_duration: i64,   // Duration in seconds
}

#[account]
pub struct LaunchpadState {
    pub authority: Pubkey,
    pub treasury_authority: Pubkey,
    pub platform_fee_bps: u16,  // Platform fee in basis points
    pub total_launches: u64,
    pub total_raised: u64,
    pub is_paused: bool,
    pub bump: u8,
}

#[account]
pub struct LaunchState {
    pub creator: Pubkey,
    pub token_mint: Pubkey,
    pub token_name: String,
    pub token_symbol: String,
    pub token_uri: String,
    pub soft_cap: u64,
    pub hard_cap: u64,
    pub token_price: u64,
    pub tokens_for_sale: u64,
    pub min_contribution: u64,
    pub max_contribution: u64,
    pub launch_start: i64,
    pub launch_end: i64,
    pub total_raised: u64,
    pub total_contributors: u32,
    pub tokens_sold: u64,
    pub status: LaunchStatus,
    pub bump: u8,
}

#[account]
pub struct ContributorState {
    pub contributor: Pubkey,
    pub launch: Pubkey,
    pub total_contributed: u64,
    pub tokens_owed: u64,
    pub claimed: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum LaunchStatus {
    Active,
    Successful,
    Failed,
}

// Context Structs
#[derive(Accounts)]
pub struct InitializeLaunchpad<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 2 + 8 + 8 + 1 + 1,
        seeds = [b"launchpad_state"],
        bump
    )]
    pub launchpad_state: Account<'info, LaunchpadState>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateTokenLaunch<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"launchpad_state"],
        bump = launchpad_state.bump
    )]
    pub launchpad_state: Account<'info, LaunchpadState>,
    
    #[account(
        init,
        payer = creator,
        space = 8 + 32 + 32 + 100 + 20 + 200 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 4 + 8 + 1 + 1,
        seeds = [b"launch_state", creator.key().as_ref()],
        bump
    )]
    pub launch_state: Account<'info, LaunchState>,
    
    pub token_mint: Account<'info, Mint>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateTokenMint<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    
    #[account(
        seeds = [b"launch_state", creator.key().as_ref()],
        bump
    )]
    pub launch_state: Account<'info, LaunchState>,
    
    #[account(
        init,
        payer = creator,
        mint::decimals = 9,
        mint::authority = launch_state,
        mint::freeze_authority = launch_state,
    )]
    pub token_mint: Account<'info, Mint>,
    
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
    pub token_metadata_program: Program<'info, Metaplex>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ContributeToLaunch<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"launch_state", launch_state.creator.as_ref()],
        bump = launch_state.bump
    )]
    pub launch_state: Account<'info, LaunchState>,
    
    #[account(
        init_if_needed,
        payer = contributor,
        space = 8 + 32 + 32 + 8 + 8 + 1,
        seeds = [b"contributor", launch_state.key().as_ref(), contributor.key().as_ref()],
        bump
    )]
    pub contributor_state: Account<'info, ContributorState>,
    
    #[account(
        mut,
        seeds = [b"launchpad_state"],
        bump = launchpad_state.bump
    )]
    pub launchpad_state: Account<'info, LaunchpadState>,
    
    pub token_mint: Account<'info, Mint>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeLaunch<'info> {
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"launch_state", launch_state.creator.as_ref()],
        bump = launch_state.bump
    )]
    pub launch_state: Account<'info, LaunchState>,
}

#[derive(Accounts)]
pub struct ClaimTokens<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,
    
    #[account(
        seeds = [b"launch_state", launch_state.creator.as_ref()],
        bump = launch_state.bump
    )]
    pub launch_state: Account<'info, LaunchState>,
    
    #[account(
        mut,
        seeds = [b"contributor", launch_state.key().as_ref(), contributor.key().as_ref()],
        bump
    )]
    pub contributor_state: Account<'info, ContributorState>,
    
    #[account(mut)]
    pub token_mint: Account<'info, Mint>,
    
    #[account(
        init_if_needed,
        payer = contributor,
        associated_token::mint = token_mint,
        associated_token::authority = contributor,
    )]
    pub contributor_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,
    
    #[account(
        seeds = [b"launch_state", launch_state.creator.as_ref()],
        bump = launch_state.bump
    )]
    pub launch_state: Account<'info, LaunchState>,
    
    #[account(
        mut,
        seeds = [b"contributor", launch_state.key().as_ref(), contributor.key().as_ref()],
        bump
    )]
    pub contributor_state: Account<'info, ContributorState>,
}

#[derive(Accounts)]
pub struct WithdrawFunds<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    
    #[account(
        seeds = [b"launch_state", creator.key().as_ref()],
        bump = launch_state.bump
    )]
    pub launch_state: Account<'info, LaunchState>,
    
    #[account(
        seeds = [b"launchpad_state"],
        bump = launchpad_state.bump
    )]
    pub launchpad_state: Account<'info, LaunchpadState>,
    
    #[account(mut)]
    /// CHECK: Treasury account for platform fees
    pub treasury: UncheckedAccount<'info>,
}

// Events
#[event]
pub struct TokenLaunchCreated {
    pub launch_id: Pubkey,
    pub creator: Pubkey,
    pub token_mint: Pubkey,
    pub token_name: String,
    pub token_symbol: String,
    pub soft_cap: u64,
    pub hard_cap: u64,
    pub token_price: u64,
    pub launch_end: i64,
}

#[event]
pub struct ContributionMade {
    pub launch_id: Pubkey,
    pub contributor: Pubkey,
    pub amount: u64,
    pub tokens_received: u64,
    pub total_raised: u64,
}

#[event]
pub struct LaunchFinalized {
    pub launch_id: Pubkey,
    pub success: bool,
    pub total_raised: u64,
    pub tokens_sold: u64,
}

#[event]
pub struct TokensClaimed {
    pub launch_id: Pubkey,
    pub contributor: Pubkey,
    pub tokens_claimed: u64,
}

#[event]
pub struct RefundClaimed {
    pub launch_id: Pubkey,
    pub contributor: Pubkey,
    pub refund_amount: u64,
}

#[event]
pub struct FundsWithdrawn {
    pub launch_id: Pubkey,
    pub creator: Pubkey,
    pub amount_withdrawn: u64,
    pub platform_fee: u64,
}

// Error Codes
#[error_code]
pub enum ErrorCode {
    #[msg("Launchpad is paused")]
    LaunchpadPaused,
    #[msg("Invalid soft cap")]
    InvalidSoftCap,
    #[msg("Invalid hard cap")]
    InvalidHardCap,
    #[msg("Invalid token price")]
    InvalidTokenPrice,
    #[msg("Invalid minimum contribution")]
    InvalidMinContribution,
    #[msg("Invalid maximum contribution")]
    InvalidMaxContribution,
    #[msg("Invalid launch duration")]
    InvalidLaunchDuration,
    #[msg("Launch is not active")]
    LaunchNotActive,
    #[msg("Launch has not started yet")]
    LaunchNotStarted,
    #[msg("Launch has ended")]
    LaunchEnded,
    #[msg("Contribution amount is too low")]
    ContributionTooLow,
    #[msg("Contribution amount is too high")]
    ContributionTooHigh,
    #[msg("Hard cap has been reached")]
    HardCapReached,
    #[msg("Not enough tokens available")]
    NotEnoughTokens,
    #[msg("Launch is still active")]
    LaunchStillActive,
    #[msg("Launch was not successful")]
    LaunchNotSuccessful,
    #[msg("Launch did not fail")]
    LaunchNotFailed,
    #[msg("Tokens already claimed")]
    AlreadyClaimed,
    #[msg("No tokens owed")]
    NoTokensOwed,
    #[msg("No refund owed")]
    NoRefundOwed,
    #[msg("Unauthorized")]
    Unauthorized,
} 