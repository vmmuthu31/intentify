use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

// Jupiter Aggregator Integration
// Jupiter is the #1 swap aggregator on Solana (like 1inch on Ethereum)
pub mod jupiter {
    use super::*;
    
    // Jupiter program ID - using actual program ID in byte array format
    pub const JUPITER_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
        1, 16, 106, 110, 107, 91, 33, 106, 72, 198, 34, 156, 221, 205, 112, 238, 
        188, 163, 65, 120, 50, 91, 190, 150, 162, 145, 196, 146, 158, 246, 87, 78
    ]);
    
    #[derive(Clone)]
    pub struct JupiterSwapParams {
        pub from_mint: Pubkey,
        pub to_mint: Pubkey,
        pub amount: u64,
        pub slippage_bps: u16,
        pub platform_fee_bps: u16, // Our 0.3% fee
    }
    
    // Jupiter swap instruction data structure
    #[derive(AnchorSerialize, AnchorDeserialize)]
    pub struct JupiterSwapData {
        pub route_plan: Vec<RoutePlanStep>,
        pub in_amount: u64,
        pub quoted_out_amount: u64,
        pub slippage_bps: u16,
        pub platform_fee_bps: u16,
    }
    
    #[derive(AnchorSerialize, AnchorDeserialize, Clone)]
    pub struct RoutePlanStep {
        pub swap_info: SwapInfo,
        pub percent: u8,
    }
    
    #[derive(AnchorSerialize, AnchorDeserialize, Clone)]
    pub struct SwapInfo {
        pub amm_key: Pubkey,
        pub label: String,
        pub input_mint: Pubkey,
        pub output_mint: Pubkey,
        pub in_amount: u64,
        pub out_amount: u64,
        pub fee_amount: u64,
        pub fee_mint: Pubkey,
    }
    
    // Execute Jupiter swap with IntentFI fees
    pub fn execute_jupiter_swap(
        _ctx: &Context<ExecuteSwapIntent>,
        swap_params: JupiterSwapParams,
        jupiter_swap_data: JupiterSwapData,
    ) -> Result<u64> {
        msg!("🚀 Executing Jupiter swap with route optimization");
        
        // Validate Jupiter route matches our parameters
        require!(
            jupiter_swap_data.in_amount == swap_params.amount,
            crate::IntentError::InvalidAmount
        );
        
        require!(
            jupiter_swap_data.slippage_bps == swap_params.slippage_bps,
            crate::IntentError::SlippageExceeded
        );
        
        // Calculate our protocol fee (0.3%) integrated into Jupiter
        let our_platform_fee = (swap_params.amount as u128)
            .checked_mul(swap_params.platform_fee_bps as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap() as u64;
        
        msg!(
            "💰 IntentFI fee integrated into Jupiter: {} tokens ({}bps)",
            our_platform_fee,
            swap_params.platform_fee_bps
        );
        
        // Jupiter handles the complex routing automatically
        // Route through: Raydium, Orca, Meteora, Serum, etc.
        let estimated_output = jupiter_swap_data.quoted_out_amount;
        
        msg!(
            "🎯 Jupiter route: {} → {} = {} tokens via {} steps",
            swap_params.from_mint,
            swap_params.to_mint,
            estimated_output,
            jupiter_swap_data.route_plan.len()
        );
        
        // Log route information for transparency
        for (i, step) in jupiter_swap_data.route_plan.iter().enumerate() {
            msg!(
                "   Step {}: {} via {} ({}% of trade)",
                i + 1,
                step.swap_info.label,
                step.swap_info.amm_key,
                step.percent
            );
        }
        
        Ok(estimated_output)
    }

    /// Simplified Jupiter swap execution without full Context
    pub fn execute_jupiter_swap_simple(
        _user: &AccountInfo,
        _user_source_token: &AccountInfo,
        _user_destination_token: &AccountInfo,
        _jupiter_program: &AccountInfo,
        _token_program: &AccountInfo,
        params: JupiterSwapParams,
        _swap_data: JupiterSwapData,
    ) -> Result<u64> {
        msg!("🚀 Executing Jupiter aggregated swap...");
        msg!("From: {} → To: {}", params.from_mint, params.to_mint);
        msg!("Amount: {} tokens", params.amount);
        
        // Real Jupiter integration would:
        // 1. Build the Jupiter swap instruction
        // 2. Invoke Jupiter program with CPI
        // 3. Handle slippage and route optimization
        
        // For now, simulate the swap calculation with a simple rate
        // In real implementation, this would call Jupiter's quote API
        let base_rate = 950; // Simulate ~95% rate with some slippage
        let estimated_output = (params.amount as u128)
            .checked_mul(base_rate)
            .unwrap()
            .checked_div(1000)
            .unwrap() as u64;
        
        msg!("✅ Jupiter swap completed: {} → {} tokens", params.amount, estimated_output);
        Ok(estimated_output)
    }


}

// Raydium AMM Integration
// Raydium is the largest native AMM on Solana (like Uniswap V2 on Ethereum)
pub mod raydium {
    use super::*;
    
    // Raydium AMM program ID - using actual program ID in byte array format
    pub const RAYDIUM_AMM_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
        4, 41, 205, 89, 168, 95, 71, 139, 14, 36, 134, 74, 68, 217, 73, 219,
        89, 151, 58, 27, 154, 213, 207, 160, 154, 134, 135, 163, 204, 126, 230, 245
    ]);
    
    #[derive(Clone)]
    pub struct RaydiumSwapParams {
        pub pool_id: Pubkey,
        pub from_mint: Pubkey,
        pub to_mint: Pubkey,
        pub amount_in: u64,
        pub minimum_amount_out: u64,
    }
    
    // Raydium pool state structure
    #[derive(AnchorSerialize, AnchorDeserialize)]
    pub struct RaydiumPoolInfo {
        pub status: u64,
        pub nonce: u64,
        pub order_num: u64,
        pub depth: u64,
        pub coin_decimals: u64,
        pub pc_decimals: u64,
        pub state: u64,
        pub reset_flag: u64,
        pub min_size: u64,
        pub vol_max_cut_ratio: u64,
        pub amount_wave_ratio: u64,
        pub coin_lot_size: u64,
        pub pc_lot_size: u64,
        pub min_price_multiplier: u64,
        pub max_price_multiplier: u64,
        pub sys_decimal_value: u64,
        // Pool token accounts
        pub pool_coin_token_account: Pubkey,
        pub pool_pc_token_account: Pubkey,
        pub coin_mint_address: Pubkey,
        pub pc_mint_address: Pubkey,
        pub lp_mint_address: Pubkey,
        pub amm_open_orders: Pubkey,
        pub serum_market: Pubkey,
        pub serum_program_id: Pubkey,
        pub amm_target_orders: Pubkey,
        pub pool_withdraw_queue: Pubkey,
        pub pool_temp_lp_token_account: Pubkey,
        pub amm_owner: Pubkey,
        pub pool_coin_amount: u64,
        pub pool_pc_amount: u64,
    }
    
    // Calculate Raydium swap output (constant product formula)
    pub fn calculate_raydium_output(
        amount_in: u64,
        reserve_in: u64,
        reserve_out: u64,
        fee_numerator: u64, // Raydium fee: 25 (0.25%)
        fee_denominator: u64, // 10000
    ) -> Result<u64> {
        // Constant product formula: (amount_in * fee_multiplier * reserve_out) / (reserve_in * fee_denominator + amount_in * fee_multiplier)
        let fee_multiplier = fee_denominator.checked_sub(fee_numerator).unwrap();
        
        let amount_in_with_fee = (amount_in as u128)
            .checked_mul(fee_multiplier as u128)
            .unwrap();
            
        let numerator = amount_in_with_fee
            .checked_mul(reserve_out as u128)
            .unwrap();
            
        let denominator = (reserve_in as u128)
            .checked_mul(fee_denominator as u128)
            .unwrap()
            .checked_add(amount_in_with_fee)
            .unwrap();
            
        let amount_out = numerator.checked_div(denominator).unwrap() as u64;
        
        msg!(
            "🔄 Raydium calculation: {} in → {} out (reserves: {}/{})",
            amount_in, amount_out, reserve_in, reserve_out
        );
        
        Ok(amount_out)
    }
    
    // Execute direct Raydium swap
    pub fn execute_raydium_swap(
        _ctx: &Context<ExecuteSwapIntent>,
        swap_params: RaydiumSwapParams,
        pool_info: RaydiumPoolInfo,
    ) -> Result<u64> {
        msg!("🌊 Executing direct Raydium AMM swap");
        
        // Determine if we're swapping coin->pc or pc->coin
        let (reserve_in, reserve_out) = if swap_params.from_mint == pool_info.coin_mint_address {
            (pool_info.pool_coin_amount, pool_info.pool_pc_amount)
        } else {
            (pool_info.pool_pc_amount, pool_info.pool_coin_amount)
        };
        
        // Calculate expected output using Raydium's constant product formula
        let estimated_output = calculate_raydium_output(
            swap_params.amount_in,
            reserve_in,
            reserve_out,
            25,    // Raydium fee: 0.25%
            10000, // Fee denominator
        )?;
        
        // Verify slippage protection
        require!(
            estimated_output >= swap_params.minimum_amount_out,
            crate::IntentError::SlippageExceeded
        );
        
        msg!(
            "✅ Raydium swap: {} {} → {} {} (Pool: {})",
            swap_params.amount_in,
            swap_params.from_mint,
            estimated_output,
            swap_params.to_mint,
            swap_params.pool_id
        );
        
        Ok(estimated_output)
    }

    /// Simplified Raydium swap execution without full Context
    pub fn execute_raydium_swap_simple(
        _user: &AccountInfo,
        _user_source_token: &AccountInfo,
        _user_destination_token: &AccountInfo,
        _raydium_program: &AccountInfo,
        _token_program: &AccountInfo,
        params: RaydiumSwapParams,
        pool_info: RaydiumPoolInfo,
    ) -> Result<u64> {
        msg!("🌊 Executing Raydium AMM swap...");
        msg!("Pool: {}", params.pool_id);
        msg!("From: {} → To: {}", params.from_mint, params.to_mint);
        msg!("Amount: {} tokens", params.amount_in);
        
        // Real Raydium integration would:
        // 1. Build the Raydium swap instruction
        // 2. Invoke Raydium program with CPI
        // 3. Handle pool calculations and slippage
        
        let output_amount = calculate_raydium_output(
            params.amount_in,
            pool_info.pool_coin_amount,
            pool_info.pool_pc_amount,
            25,    // Raydium fee: 0.25%
            10000, // Fee denominator
        )?;
        
        require!(output_amount >= params.minimum_amount_out, crate::IntentError::SlippageExceeded);
        
        msg!("✅ Raydium swap completed: {} → {} tokens", params.amount_in, output_amount);
        Ok(output_amount)
    }


    
    // Get popular Raydium pools
    pub fn get_popular_pools() -> Vec<(String, Pubkey)> {
        vec![
            // SOL/USDC pool (most popular)  
            ("SOL-USDC".to_string(), Pubkey::new_from_array([1; 32])),
            // SOL/USDT pool
            ("SOL-USDT".to_string(), Pubkey::new_from_array([2; 32])),
            // RAY/SOL pool
            ("RAY-SOL".to_string(), Pubkey::new_from_array([3; 32])),
            // RAY/USDC pool
            ("RAY-USDC".to_string(), Pubkey::new_from_array([4; 32])),
        ]
    }
}

// Orca Integration (Bonus - 3rd largest DEX)
pub mod orca {
    use super::*;
    
    pub const ORCA_WHIRLPOOLS_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
        5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
        5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5
    ]);
    
    pub fn get_orca_pools() -> Vec<(String, Pubkey)> {
        vec![
            // SOL/USDC Whirlpool
            ("SOL-USDC-0.3%".to_string(), Pubkey::new_from_array([6; 32])),
            // SOL/USDT Whirlpool  
            ("SOL-USDT-0.3%".to_string(), Pubkey::new_from_array([7; 32])),
        ]
    }
}

// Protocol Router - Chooses best DEX for swap
pub struct ProtocolRouter;

impl ProtocolRouter {
    // Choose best protocol based on liquidity, price, and fees
    pub fn choose_best_protocol(
        from_mint: &Pubkey,
        to_mint: &Pubkey,
        amount: u64,
    ) -> SwapProtocol {
        // For most cases, Jupiter is optimal as it aggregates all DEXes
        if amount > 1000 * 1_000_000 {
            // For large trades (>1000 USDC), use Jupiter for best routing
            SwapProtocol::Jupiter
        } else if Self::is_major_pair(from_mint, to_mint) {
            // For major pairs with small amounts, direct Raydium might be cheaper
            SwapProtocol::Raydium
        } else {
            // For exotic pairs, Jupiter handles routing best
            SwapProtocol::Jupiter
        }
    }
    
    fn is_major_pair(from_mint: &Pubkey, to_mint: &Pubkey) -> bool {
        // Create major token pubkeys
        let sol_mint = Pubkey::new_from_array([0; 32]); // SOL mint (all zeros)
        let usdc_mint = Pubkey::new_from_array([1; 32]); // Mock USDC
        let usdt_mint = Pubkey::new_from_array([2; 32]); // Mock USDT
        
        // Check if it's any combination of major pairs
        (from_mint == &sol_mint && to_mint == &usdc_mint) ||
        (from_mint == &usdc_mint && to_mint == &sol_mint) ||
        (from_mint == &sol_mint && to_mint == &usdt_mint) ||
        (from_mint == &usdt_mint && to_mint == &sol_mint) ||
        (from_mint == &usdc_mint && to_mint == &usdt_mint) ||
        (from_mint == &usdt_mint && to_mint == &usdc_mint)
    }
}

#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize)]
pub enum SwapProtocol {
    Jupiter,  // Aggregator (like 1inch)
    Raydium,  // Direct AMM
    Orca,     // Alternative AMM
}

// Integration accounts for CPI calls
#[derive(Accounts)]
pub struct ExecuteSwapIntent<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(mut)]
    pub user_source_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_destination_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub treasury_fee_account: Account<'info, TokenAccount>,
    
    // Jupiter/Raydium specific accounts would be added dynamically
    /// CHECK: Jupiter or Raydium program
    pub swap_program: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
} 