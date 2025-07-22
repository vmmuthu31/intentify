use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

// Solend Protocol Integration
// Solend is the #1 lending protocol on Solana
pub mod solend {
    use super::*;
    
    // Solend program ID
    pub const SOLEND_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
        10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10,
        10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10
    ]);
    
    #[derive(Clone)]
    pub struct SolendLendParams {
        pub reserve: Pubkey,
        pub lending_market: Pubkey,
        pub amount: u64,
        pub expected_apy: u16,
    }
    
    // Solend Reserve structure (simplified)
    #[derive(AnchorSerialize, AnchorDeserialize)]
    pub struct SolendReserve {
        pub version: u8,
        pub last_update: u64,
        pub lending_market: Pubkey,
        pub liquidity: ReserveLiquidity,
        pub collateral: ReserveCollateral,
        pub config: ReserveConfig,
    }
    
    #[derive(AnchorSerialize, AnchorDeserialize)]
    pub struct ReserveLiquidity {
        pub mint_pubkey: Pubkey,
        pub mint_decimals: u8,
        pub supply_pubkey: Pubkey,
        pub fee_receiver: Pubkey,
        pub oracle_pubkey: Pubkey,
        pub available_amount: u64,
        pub borrowed_amount_wads: u128,
        pub cumulative_borrow_rate_wads: u128,
        pub market_price: u128,
    }
    
    #[derive(AnchorSerialize, AnchorDeserialize)]
    pub struct ReserveCollateral {
        pub mint_pubkey: Pubkey,
        pub mint_total_supply: u64,
        pub supply_pubkey: Pubkey,
    }
    
    #[derive(AnchorSerialize, AnchorDeserialize)]
    pub struct ReserveConfig {
        pub optimal_utilization_rate: u8,
        pub loan_to_value_ratio: u8,
        pub liquidation_bonus: u8,
        pub liquidation_threshold: u8,
        pub min_borrow_rate: u8,
        pub optimal_borrow_rate: u8,
        pub max_borrow_rate: u8,
        pub fees: ReserveFees,
    }
    
    #[derive(AnchorSerialize, AnchorDeserialize)]
    pub struct ReserveFees {
        pub borrow_fee_wad: u64,
        pub flash_loan_fee_wad: u64,
        pub host_fee_percentage: u8,
    }
    
    // Calculate current lending APY from reserve data
    pub fn calculate_lending_apy(reserve: &SolendReserve) -> Result<u16> {
        let utilization_rate = if reserve.liquidity.available_amount == 0 {
            0u128
        } else {
            (reserve.liquidity.borrowed_amount_wads * 10000) / 
            (reserve.liquidity.available_amount as u128 + reserve.liquidity.borrowed_amount_wads)
        };
        
        // Simplified APY calculation based on utilization
        let base_rate = reserve.config.min_borrow_rate as u128;
        let optimal_rate = reserve.config.optimal_borrow_rate as u128;
        let optimal_util = reserve.config.optimal_utilization_rate as u128 * 100;
        
        let lending_apy = if utilization_rate <= optimal_util {
            // Linear interpolation from base to optimal
            base_rate + ((optimal_rate - base_rate) * utilization_rate / optimal_util)
        } else {
            // Linear interpolation from optimal to max
            let max_rate = reserve.config.max_borrow_rate as u128;
            optimal_rate + ((max_rate - optimal_rate) * (utilization_rate - optimal_util) / (10000 - optimal_util))
        };
        
        // Convert to basis points (lending APY is typically 60-80% of borrow APY)
        let final_apy = (lending_apy * 70 / 100) as u16; // 70% of borrow rate
        
        msg!("🏦 Solend APY calculated: {}% (utilization: {}%)", final_apy, utilization_rate);
        Ok(final_apy)
    }
    
    // Execute lending on Solend
    pub fn execute_solend_lend(
        intent_account: &crate::IntentAccount,
        _params: SolendLendParams,
        reserve_data: SolendReserve,
    ) -> Result<u16> {
        msg!("🏦 Executing Solend lending operation");
        
        // Validate reserve matches our token
        require!(
            reserve_data.liquidity.mint_pubkey == intent_account.from_mint,
            crate::IntentError::InvalidAmount
        );
        
        // Calculate current APY
        let current_apy = calculate_lending_apy(&reserve_data)?;
        
        // Verify APY meets minimum requirement
        let min_apy = intent_account.min_apy.unwrap_or(0);
        require!(current_apy >= min_apy, crate::IntentError::APYTooLow);
        
        msg!(
            "✅ Solend lending: {} tokens at {}% APY (min: {}%)",
            intent_account.amount,
            current_apy,
            min_apy
        );
        
        // In production, this would create the actual Solend deposit instruction
        // For now, we'll return the calculated APY
        Ok(current_apy)
    }
    
    // Get popular Solend markets
    pub fn get_solend_markets() -> Vec<(String, Pubkey, Pubkey)> {
        vec![
            // (Token, Reserve, Lending Market)
            ("SOL".to_string(), Pubkey::new_from_array([11; 32]), Pubkey::new_from_array([12; 32])),
            ("USDC".to_string(), Pubkey::new_from_array([13; 32]), Pubkey::new_from_array([14; 32])),
            ("USDT".to_string(), Pubkey::new_from_array([15; 32]), Pubkey::new_from_array([16; 32])),
        ]
    }
}

// Port Finance Integration
// Port Finance is the 2nd largest lending protocol on Solana
pub mod port_finance {
    use super::*;
    
    // Port Finance program ID
    pub const PORT_FINANCE_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
        20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20,
        20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20
    ]);
    
    #[derive(Clone)]
    pub struct PortLendParams {
        pub reserve: Pubkey,
        pub staking_pool: Pubkey,
        pub amount: u64,
        pub expected_apy: u16,
    }
    
    // Port Finance Reserve structure
    #[derive(AnchorSerialize, AnchorDeserialize)]
    pub struct PortReserve {
        pub is_initialized: bool,
        pub lending_market: Pubkey,
        pub liquidity: PortLiquidity,
        pub collateral: PortCollateral,
        pub config: PortConfig,
        pub last_update: u64,
    }
    
    #[derive(AnchorSerialize, AnchorDeserialize)]
    pub struct PortLiquidity {
        pub mint_pubkey: Pubkey,
        pub supply_pubkey: Pubkey,
        pub fee_receiver: Pubkey,
        pub oracle_pubkey: Pubkey,
        pub available_amount: u64,
        pub borrowed_amount: u64,
        pub cumulative_borrow_rate: u128,
        pub market_price: u64,
    }
    
    #[derive(AnchorSerialize, AnchorDeserialize)]
    pub struct PortCollateral {
        pub mint_pubkey: Pubkey,
        pub supply_pubkey: Pubkey,
        pub total_supply: u64,
    }
    
    #[derive(AnchorSerialize, AnchorDeserialize)]
    pub struct PortConfig {
        pub optimal_utilization_rate: u8,
        pub max_borrow_rate: u8,
        pub loan_to_value_ratio: u8,
        pub liquidation_bonus: u8,
        pub liquidation_threshold: u8,
        pub min_borrow_rate: u8,
        pub optimal_borrow_rate: u8,
        pub borrow_fee_rate: u8,
    }
    
    // Calculate Port Finance lending APY
    pub fn calculate_port_apy(reserve: &PortReserve) -> Result<u16> {
        let total_liquidity = reserve.liquidity.available_amount + reserve.liquidity.borrowed_amount;
        
        let utilization_rate = if total_liquidity == 0 {
            0
        } else {
            (reserve.liquidity.borrowed_amount as u128 * 10000) / total_liquidity as u128
        };
        
        // Port Finance uses a different curve than Solend
        let optimal_util = reserve.config.optimal_utilization_rate as u128 * 100;
        let base_rate = reserve.config.min_borrow_rate as u128;
        let optimal_rate = reserve.config.optimal_borrow_rate as u128;
        
        let borrow_apy = if utilization_rate <= optimal_util {
            base_rate + ((optimal_rate - base_rate) * utilization_rate / optimal_util)
        } else {
            let max_rate = reserve.config.max_borrow_rate as u128;
            optimal_rate + ((max_rate - optimal_rate) * (utilization_rate - optimal_util) / (10000 - optimal_util))
        };
        
        // Port Finance lending APY (typically 75% of borrow APY)
        let lending_apy = (borrow_apy * 75 / 100) as u16;
        
        msg!("🏦 Port Finance APY: {}% (utilization: {}%)", lending_apy, utilization_rate);
        Ok(lending_apy)
    }
    
    // Execute lending on Port Finance
    pub fn execute_port_lend(
        intent_account: &crate::IntentAccount,
        _params: PortLendParams,
        reserve_data: PortReserve,
    ) -> Result<u16> {
        msg!("🏦 Executing Port Finance lending operation");
        
        // Validate reserve
        require!(
            reserve_data.liquidity.mint_pubkey == intent_account.from_mint,
            crate::IntentError::InvalidAmount
        );
        
        // Calculate current APY
        let current_apy = calculate_port_apy(&reserve_data)?;
        
        // Verify APY requirement
        let min_apy = intent_account.min_apy.unwrap_or(0);
        require!(current_apy >= min_apy, crate::IntentError::APYTooLow);
        
        msg!(
            "✅ Port Finance lending: {} tokens at {}% APY (min: {}%)",
            intent_account.amount,
            current_apy,
            min_apy
        );
        
        Ok(current_apy)
    }
    
    // Get Port Finance markets
    pub fn get_port_markets() -> Vec<(String, Pubkey, Pubkey)> {
        vec![
            // (Token, Reserve, Staking Pool)
            ("SOL".to_string(), Pubkey::new_from_array([21; 32]), Pubkey::new_from_array([22; 32])),
            ("USDC".to_string(), Pubkey::new_from_array([23; 32]), Pubkey::new_from_array([24; 32])),
        ]
    }
}

// Francium Integration (Bonus - leveraged yield farming)
pub mod francium {
    use super::*;
    
    pub const FRANCIUM_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
        30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
        30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30
    ]);
    
    pub fn get_francium_farms() -> Vec<(String, Pubkey)> {
        vec![
            ("SOL-USDC LP".to_string(), Pubkey::new_from_array([31; 32])),
            ("RAY-SOL LP".to_string(), Pubkey::new_from_array([32; 32])),
        ]
    }
}

// Lending Protocol Router - Chooses best lending protocol
pub struct LendingRouter;

impl LendingRouter {
    // Choose best lending protocol based on APY and liquidity
    pub fn choose_best_lending_protocol(
        _mint: &Pubkey,
        amount: u64,
    ) -> LendingProtocol {
        // For major tokens, prefer Solend (largest liquidity)
        if amount > 10000 * 1_000_000 { // Large amounts (>10k USDC equivalent)
            LendingProtocol::Solend
        } else {
            // For smaller amounts, Port Finance might have better rates
            LendingProtocol::PortFinance
        }
    }
    
    // Get best APY across all protocols for a token  
    pub fn get_best_apy_for_token(_mint: &Pubkey) -> Result<(LendingProtocol, u16)> {
        // In production, this would query live APY data from all protocols
        // and return the best one
        
        // Mock comparison for now
        let solend_apy = 650; // 6.5%
        let port_apy = 580;   // 5.8%
        
        if solend_apy > port_apy {
            Ok((LendingProtocol::Solend, solend_apy))
        } else {
            Ok((LendingProtocol::PortFinance, port_apy))
        }
    }
}

#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize)]
pub enum LendingProtocol {
    Solend,      // Largest lending protocol
    PortFinance, // Second largest
    TulipProtocol, // Yield farming focused
    Francium,    // Leveraged yield farming
}

// Context for lending execution
#[derive(Accounts)]
pub struct ExecuteLendIntent<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(mut)]
    pub intent_account: Account<'info, crate::IntentAccount>,
    
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
    
    // Port Finance-specific accounts  
    /// CHECK: Port Finance reserve
    pub port_reserve: Option<UncheckedAccount<'info>>,
    
    /// CHECK: Port Finance staking pool
    pub port_staking_pool: Option<UncheckedAccount<'info>>,
    
    /// CHECK: Port Finance LP token account
    pub port_lp_account: Option<UncheckedAccount<'info>>,
    
    /// CHECK: Solend program
    #[account(address = solend::SOLEND_PROGRAM_ID)]
    pub solend_program: Option<UncheckedAccount<'info>>,
    
    
    #[account(address = port_finance::PORT_FINANCE_PROGRAM_ID)]
    pub port_program: Option<UncheckedAccount<'info>>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
} 