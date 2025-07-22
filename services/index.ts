// Main export file for IntentFI Mobile Services
// This file provides a unified interface for both IntentFI and Launchpad contracts

// Import polyfills first to ensure Buffer is available
import '../polyfills';

export * from './config';
export * from './intentfi-service';
export * from './launchpad-service';
export * from './wallet-service';
export * from './transaction-service';

import { networkService } from './config';
import { intentFiService } from './intentfi-service';
import { launchpadService } from './launchpad-service';
import { PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';

/**
 * Unified IntentFI SDK for Mobile Applications
 */
export class IntentFiSDK {
  private static instance: IntentFiSDK;

  private constructor() {}

  public static getInstance(): IntentFiSDK {
    if (!IntentFiSDK.instance) {
      IntentFiSDK.instance = new IntentFiSDK();
    }
    return IntentFiSDK.instance;
  }

  // Network Management
  public switchToMainnet(): void {
    networkService.switchNetwork('mainnet');
  }

  public switchToDevnet(): void {
    networkService.switchNetwork('devnet');
  }

  public getCurrentNetwork(): string {
    return networkService.getCurrentNetwork();
  }

  public isMainnet(): boolean {
    return networkService.isMainnet();
  }

  public isDevnet(): boolean {
    return networkService.isDevnet();
  }

  // Transaction Helpers
  public async sendTransaction(
    transaction: Transaction,
    signer: Keypair,
    commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'
  ): Promise<string> {
    try {
      const connection = networkService.getConnection();

      // Get the latest blockhash and set it on the transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = signer.publicKey;

      const signature = await sendAndConfirmTransaction(connection, transaction, [signer], {
        commitment,
      });
      return signature;
    } catch (error) {
      console.error('Transaction failed:', error);
      throw error;
    }
  }

  // Airdrop SOL for testing on devnet with rate limit handling
  public async airdropSOL(publicKey: PublicKey, amount: number = 1): Promise<string> {
    try {
      const connection = networkService.getConnection();
      if (networkService.isMainnet()) {
        throw new Error('Airdrop not available on mainnet');
      }

      const lamports = amount * 1_000_000_000; // Convert SOL to lamports

      // Check current balance first
      const currentBalance = await connection.getBalance(publicKey);
      const currentSOL = currentBalance / 1_000_000_000;

      if (currentSOL >= 0.5) {
        console.log(`💰 Wallet already has ${currentSOL.toFixed(2)} SOL, skipping airdrop`);
        return 'balance-sufficient';
      }

      const signature = await connection.requestAirdrop(publicKey, lamports);

      // Wait for confirmation
      await connection.confirmTransaction(signature);
      console.log(`✅ Airdropped ${amount} SOL to ${publicKey.toString()}`);

      return signature;
    } catch (error: any) {
      // Handle rate limiting gracefully
      if (error.message && error.message.includes('429')) {
        console.warn('🚰 Airdrop rate limited - this is normal on devnet');
        // Check if user already has some balance
        try {
          const connection = networkService.getConnection();
          const currentBalance = await connection.getBalance(publicKey);
          const currentSOL = currentBalance / 1_000_000_000;
          if (currentSOL > 0) {
            console.log(`💰 User has ${currentSOL.toFixed(4)} SOL, continuing without airdrop`);
            return 'rate-limited-but-has-balance';
          }
        } catch (balanceError) {
          console.error('Could not check balance:', balanceError);
        }
        throw new Error(
          'Airdrop rate limited. Please try again later or visit https://faucet.solana.com'
        );
      }
      console.error('Airdrop failed:', error);
      throw error;
    }
  }

  // IntentFI Contract Methods
  public get intentFi() {
    return {
      // User Management
      initializeUser: intentFiService.initializeUser.bind(intentFiService),
      getUserAccount: intentFiService.getUserAccount.bind(intentFiService),
      getUserIntents: intentFiService.getUserIntents.bind(intentFiService),

      // Swap Intents
      createSwapIntent: intentFiService.createSwapIntent.bind(intentFiService),
      executeSwapIntent: intentFiService.executeSwapIntent.bind(intentFiService),

      // Lending Intents
      createLendIntent: intentFiService.createLendIntent.bind(intentFiService),

      // General Intent Management
      cancelIntent: intentFiService.cancelIntent.bind(intentFiService),
      getIntentAccount: intentFiService.getIntentAccount.bind(intentFiService),

      // Utility Functions
      getProtocolStatePDA: intentFiService.getProtocolStatePDA.bind(intentFiService),
      getUserAccountPDA: intentFiService.getUserAccountPDA.bind(intentFiService),
      getIntentAccountPDA: intentFiService.getIntentAccountPDA.bind(intentFiService),
      getOrCreateAssociatedTokenAccount:
        intentFiService.getOrCreateAssociatedTokenAccount.bind(intentFiService),
    };
  }

  // Launchpad Contract Methods
  public get launchpad() {
    return {
      // Platform Management
      getLaunchpadState: launchpadService.getLaunchpadState.bind(launchpadService),

      // Token Launch Lifecycle
      createTokenMint: launchpadService.createTokenMint.bind(launchpadService),
      createTokenLaunch: launchpadService.createTokenLaunch.bind(launchpadService),
      contributeToLaunch: launchpadService.contributeToLaunch.bind(launchpadService),
      finalizeLaunch: launchpadService.finalizeLaunch.bind(launchpadService),

      // Token and Fund Management
      claimTokens: launchpadService.claimTokens.bind(launchpadService),
      claimRefund: launchpadService.claimRefund.bind(launchpadService),
      withdrawFunds: launchpadService.withdrawFunds.bind(launchpadService),

      // Data Fetching
      getLaunchState: launchpadService.getLaunchState.bind(launchpadService),
      getContributorState: launchpadService.getContributorState.bind(launchpadService),
      getAllLaunches: launchpadService.getAllLaunches.bind(launchpadService),

      // Utility Functions
      getLaunchpadStatePDA: launchpadService.getLaunchpadStatePDA.bind(launchpadService),
      getLaunchStatePDA: launchpadService.getLaunchStatePDA.bind(launchpadService),
      getContributorStatePDA: launchpadService.getContributorStatePDA.bind(launchpadService),
      isLaunchEnded: launchpadService.isLaunchEnded.bind(launchpadService),
      isLaunchSuccessful: launchpadService.isLaunchSuccessful.bind(launchpadService),
      calculateTokensForContribution:
        launchpadService.calculateTokensForContribution.bind(launchpadService),
    };
  }
}

/**
 * Convenience wrapper for React Native / Mobile usage
 */
export class IntentFiMobile {
  private sdk: IntentFiSDK;

  constructor() {
    this.sdk = IntentFiSDK.getInstance();
  }

  /**
   * Initialize the SDK for mobile app
   */
  public async initialize(network: 'mainnet' | 'devnet' = 'devnet'): Promise<void> {
    try {
      if (network === 'mainnet') {
        this.sdk.switchToMainnet();
      } else {
        this.sdk.switchToDevnet();
      }
      console.log(`🚀 IntentFI SDK initialized on ${network}`);
    } catch (error) {
      console.error('Failed to initialize IntentFI SDK:', error);
      throw error;
    }
  }

  /**
   * Request airdrop for testing on devnet
   */
  public async requestAirdrop(publicKey: PublicKey, amount: number = 1): Promise<string> {
    try {
      return await this.sdk.airdropSOL(publicKey, amount);
    } catch (error) {
      console.error('Failed to request airdrop:', error);
      throw error;
    }
  }

  /**
   * Get or create a pre-funded demo wallet for seamless development
   */
  public async getOrCreateFundedWallet(): Promise<{ publicKey: PublicKey; hasFunds: boolean }> {
    try {
      const { walletService } = await import('./wallet-service');

      // Check if we have an existing wallet first
      let walletResult = await walletService.getStoredWallet();

      if (!walletResult) {
        // Create a new demo wallet without authentication barriers
        walletResult = await walletService.createDemoWallet();
      }

      // Check if wallet has funds
      const connection = networkService.getConnection();
      const balance = await connection.getBalance(walletResult.publicKey);
      const hasMinimumFunds = balance >= 100000000; // 0.1 SOL minimum

      console.log(
        `💰 Wallet ${walletResult.publicKey.toString().slice(0, 8)}... has ${(balance / 1_000_000_000).toFixed(4)} SOL`
      );

      return {
        publicKey: walletResult.publicKey,
        hasFunds: hasMinimumFunds,
      };
    } catch (error) {
      console.error('Failed to get or create funded wallet:', error);
      throw error;
    }
  }

  /**
   * Ensure wallet has minimum funds for operations
   */
  public async ensureWalletFunded(publicKey: PublicKey, minAmount: number = 0.1): Promise<boolean> {
    try {
      const connection = networkService.getConnection();
      const balance = await connection.getBalance(publicKey);
      const currentSOL = balance / 1_000_000_000;

      if (currentSOL >= minAmount) {
        console.log(`✅ Wallet sufficiently funded: ${currentSOL.toFixed(4)} SOL`);
        return true;
      }

      console.log(`⚠️ Wallet needs funding: ${currentSOL.toFixed(4)} SOL (need ${minAmount} SOL)`);

      // Try airdrop first
      try {
        const airdropResult = await this.sdk.airdropSOL(publicKey, Math.max(minAmount, 0.5));
        if (airdropResult !== 'rate-limited-but-has-balance') {
          console.log('💧 Wallet funded via airdrop');
          return true;
        }
      } catch (airdropError) {
        console.warn('Airdrop failed, checking alternative funding options');
      }

      // If airdrop fails, check if we can proceed with existing balance
      const newBalance = await connection.getBalance(publicKey);
      const newSOL = newBalance / 1_000_000_000;

      if (newSOL > 0.01) {
        // Even small amounts can do basic transactions
        console.log(`📈 Using existing balance: ${newSOL.toFixed(6)} SOL`);
        return true;
      }

      // Last resort: inform user about manual funding options
      console.warn(
        '⚠️ No funds available. User may need to manually fund wallet from faucet.solana.com'
      );
      return false;
    } catch (error) {
      console.error('Failed to ensure wallet funding:', error);
      return false;
    }
  }

  /**
   * Get user profile (combines user account and intent data)
   */
  public async getUserProfile(userPublicKey: PublicKey) {
    try {
      const [userAccount, userIntents] = await Promise.all([
        this.sdk.intentFi.getUserAccount(userPublicKey),
        this.sdk.intentFi.getUserIntents(userPublicKey),
      ]);

      return {
        account: userAccount,
        intents: userIntents,
        network: this.sdk.getCurrentNetwork(),
        isMainnet: this.sdk.isMainnet(),
      };
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      throw error;
    }
  }

  /**
   * Create and send a swap intent transaction
   */
  public async createAndExecuteSwapIntent(
    userKeypair: Keypair,
    fromMint: PublicKey,
    toMint: PublicKey,
    amount: number,
    maxSlippage: number = 300 // 3% default
  ): Promise<string> {
    try {
      const swapParams = {
        fromMint,
        toMint,
        amount,
        maxSlippage,
      };

      const transaction = await this.sdk.intentFi.createSwapIntent(userKeypair, swapParams);
      const signature = await this.sdk.sendTransaction(transaction, userKeypair);

      console.log(`✅ Swap intent created: ${signature}`);
      return signature;
    } catch (error) {
      console.error('Failed to create swap intent:', error);
      throw error;
    }
  }

  /**
   * Create and send a lending intent transaction
   */
  public async createAndExecuteLendIntent(
    userKeypair: Keypair,
    mint: PublicKey,
    amount: number,
    minApy: number = 500 // 5% default
  ): Promise<string> {
    try {
      const lendParams = {
        mint,
        amount,
        minApy,
      };

      const transaction = await this.sdk.intentFi.createLendIntent(userKeypair, lendParams);
      const signature = await this.sdk.sendTransaction(transaction, userKeypair);

      console.log(`✅ Lend intent created: ${signature}`);
      return signature;
    } catch (error) {
      console.error('Failed to create lend intent:', error);
      throw error;
    }
  }

  /**
   * Create a complete token launch (mint + launch setup)
   */
  public async createCompleteLaunch(
    creatorKeypair: Keypair,
    launchParams: {
      tokenName: string;
      tokenSymbol: string;
      tokenUri: string;
      decimals: number;
      softCap: number;
      hardCap: number;
      tokenPrice: number;
      tokensForSale: number;
      minContribution: number;
      maxContribution: number;
      launchDuration: number;
    }
  ): Promise<{ tokenMint: PublicKey; launchSignature: string; mintSignature: string }> {
    try {
      // Step 1: Create token mint with metadata
      const { transaction: mintTransaction, tokenMint } = await this.sdk.launchpad.createTokenMint(
        creatorKeypair,
        launchParams.decimals,
        launchParams.tokenName,
        launchParams.tokenSymbol,
        launchParams.tokenUri
      );

      const mintSignature = await this.sdk.sendTransaction(mintTransaction, creatorKeypair);
      console.log(`✅ Token mint created: ${tokenMint.toString()}`);

      // Step 2: Create token launch
      const launchTransaction = await this.sdk.launchpad.createTokenLaunch(
        creatorKeypair,
        tokenMint,
        {
          tokenName: launchParams.tokenName,
          tokenSymbol: launchParams.tokenSymbol,
          tokenUri: launchParams.tokenUri,
          softCap: launchParams.softCap,
          hardCap: launchParams.hardCap,
          tokenPrice: launchParams.tokenPrice,
          tokensForSale: launchParams.tokensForSale,
          minContribution: launchParams.minContribution,
          maxContribution: launchParams.maxContribution,
          launchDuration: launchParams.launchDuration,
        }
      );

      const launchSignature = await this.sdk.sendTransaction(launchTransaction, creatorKeypair);
      console.log(`✅ Token launch created: ${launchSignature}`);

      return {
        tokenMint,
        launchSignature,
        mintSignature,
      };
    } catch (error) {
      console.error('Failed to create complete launch:', error);
      throw error;
    }
  }

  /**
   * Contribute to a launch
   */
  public async contributeToLaunch(
    contributorKeypair: Keypair,
    launchCreator: PublicKey,
    amount: number // in lamports
  ): Promise<string> {
    try {
      const [launchStatePDA] = await this.sdk.launchpad.getLaunchStatePDA(launchCreator);
      const launchState = await this.sdk.launchpad.getLaunchState(launchCreator);

      if (!launchState) {
        throw new Error('Launch not found');
      }

      const transaction = await this.sdk.launchpad.contributeToLaunch(
        contributorKeypair,
        launchStatePDA,
        launchState.tokenMint,
        amount
      );

      const signature = await this.sdk.sendTransaction(transaction, contributorKeypair);
      console.log(`✅ Contributed ${amount} lamports to launch: ${signature}`);

      return signature;
    } catch (error) {
      console.error('Failed to contribute to launch:', error);
      throw error;
    }
  }

  /**
   * Get launch dashboard data
   */
  public async getLaunchDashboard(creatorPublicKey: PublicKey) {
    try {
      const launchState = await this.sdk.launchpad.getLaunchState(creatorPublicKey);
      const launchpadState = await this.sdk.launchpad.getLaunchpadState();

      if (!launchState) {
        return null;
      }

      const isEnded = this.sdk.launchpad.isLaunchEnded(launchState);
      const isSuccessful = this.sdk.launchpad.isLaunchSuccessful(launchState);

      return {
        launch: launchState,
        platform: launchpadState,
        status: {
          isEnded,
          isSuccessful,
          canFinalize: isEnded && launchState.status === 'Active',
          canWithdraw: isSuccessful && launchState.status === 'Successful',
        },
        progress: {
          percentage: Math.min((launchState.totalRaised / launchState.hardCap) * 100, 100),
          softCapReached: launchState.totalRaised >= launchState.softCap,
          hardCapReached: launchState.totalRaised >= launchState.hardCap,
        },
        network: this.sdk.getCurrentNetwork(),
      };
    } catch (error) {
      console.error('Failed to fetch launch dashboard:', error);
      throw error;
    }
  }

  // Direct access to SDK for advanced usage
  public get advancedSDK(): IntentFiSDK {
    return this.sdk;
  }
}

// Export singleton instances for easy usage
export const intentFiSDK = IntentFiSDK.getInstance();
export const intentFiMobile = new IntentFiMobile();

// Export types for TypeScript usage are handled by the wildcard exports above
