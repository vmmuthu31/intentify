// Transaction Service for handling pre-flight checks and ensuring successful transactions
import { PublicKey, Transaction, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { networkService } from './config';
import { intentFiMobile } from './index';

export interface TransactionPreflightResult {
  canProceed: boolean;
  balance: number;
  estimatedFee: number;
  hasMinimumBalance: boolean;
  message: string;
}

export class TransactionService {
  private static instance: TransactionService;

  private constructor() {}

  public static getInstance(): TransactionService {
    if (!TransactionService.instance) {
      TransactionService.instance = new TransactionService();
    }
    return TransactionService.instance;
  }

  /**
   * Check if wallet can perform a transaction
   */
  public async checkTransactionViability(
    publicKey: PublicKey,
    estimatedFee: number = 0.001 // Default 0.001 SOL for transaction fee
  ): Promise<TransactionPreflightResult> {
    try {
      const connection = networkService.getConnection();
      const balance = await connection.getBalance(publicKey);
      const balanceInSOL = balance / LAMPORTS_PER_SOL;
      const estimatedFeeSOL = estimatedFee;

      const hasMinimumBalance = balanceInSOL >= estimatedFeeSOL;

      return {
        canProceed: hasMinimumBalance,
        balance: balanceInSOL,
        estimatedFee: estimatedFeeSOL,
        hasMinimumBalance,
        message: hasMinimumBalance
          ? `✅ Ready to transact (${balanceInSOL.toFixed(4)} SOL available)`
          : `❌ Insufficient balance: ${balanceInSOL.toFixed(6)} SOL (need ${estimatedFeeSOL} SOL for fees)`,
      };
    } catch (error) {
      console.error('Failed to check transaction viability:', error);
      return {
        canProceed: false,
        balance: 0,
        estimatedFee: estimatedFee,
        hasMinimumBalance: false,
        message: '❌ Unable to check wallet balance',
      };
    }
  }

  /**
   * Prepare wallet for transaction by ensuring sufficient funds
   */
  public async prepareWalletForTransaction(
    publicKey: PublicKey,
    requiredAmount: number = 0.01 // Minimum SOL needed
  ): Promise<boolean> {
    try {
      console.log('🔍 Checking wallet readiness for transaction...');

      const preflight = await this.checkTransactionViability(publicKey, requiredAmount);
      console.log(preflight.message);

      if (preflight.canProceed) {
        return true;
      }

      // Try to fund the wallet if it's insufficient
      console.log('💧 Attempting to fund wallet...');
      const fundingSuccess = await intentFiMobile.ensureWalletFunded(publicKey, requiredAmount);

      if (fundingSuccess) {
        const recheckPreflight = await this.checkTransactionViability(publicKey, requiredAmount);
        console.log('🔄 Recheck result:', recheckPreflight.message);
        return recheckPreflight.canProceed;
      }

      console.warn('⚠️ Unable to fund wallet sufficiently');
      return false;
    } catch (error) {
      console.error('Failed to prepare wallet for transaction:', error);
      return false;
    }
  }

  /**
   * Execute transaction with pre-flight checks
   */
  public async executeTransactionSafely(
    publicKey: PublicKey,
    transactionBuilder: () => Promise<Transaction>,
    requiredAmount: number = 0.01
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    try {
      // Pre-flight check
      const isReady = await this.prepareWalletForTransaction(publicKey, requiredAmount);

      if (!isReady) {
        return {
          success: false,
          error: 'Wallet insufficient funds and funding failed',
        };
      }

      // Build and execute transaction
      const transaction = await transactionBuilder();

      // Here you would typically sign and send the transaction
      console.log('🚀 Transaction ready for execution');
      return {
        success: true,
        signature: 'simulated-signature', // In real implementation, return actual signature
      };
    } catch (error) {
      console.error('Transaction execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown transaction error',
      };
    }
  }

  /**
   * Get user-friendly wallet status message
   */
  public async getWalletStatusMessage(publicKey: PublicKey): Promise<string> {
    try {
      const preflight = await this.checkTransactionViability(publicKey);

      if (preflight.balance === 0) {
        return '🔴 Wallet is empty - needs funding to transact';
      } else if (preflight.balance < 0.001) {
        return `🟡 Low balance: ${preflight.balance.toFixed(6)} SOL - may need funding`;
      } else if (preflight.balance < 0.01) {
        return `🟡 Limited funds: ${preflight.balance.toFixed(4)} SOL - good for basic transactions`;
      } else {
        return `🟢 Well funded: ${preflight.balance.toFixed(4)} SOL - ready for all operations`;
      }
    } catch (error) {
      return '⚫ Unable to check wallet status';
    }
  }
}

// Export singleton instance
export const transactionService = TransactionService.getInstance();
