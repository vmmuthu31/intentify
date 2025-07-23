// Main export file for IntentFI Mobile Services
// This file provides a unified interface for both IntentFI and Launchpad contracts

export * from './config';
export * from './intentfi-service';
export * from './launchpad-service';

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
    signer: Keypair | PublicKey,
    commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'
  ): Promise<string> {
    try {
      const connection = networkService.getConnection();

      // If signer is a Keypair, use sendAndConfirmTransaction
      if (signer instanceof Keypair) {
        const signature = await sendAndConfirmTransaction(connection, transaction, [signer], {
          commitment,
        });
        return signature;
      } else {
        // If signer is a PublicKey, prepare the transaction but don't sign it
        // This is for use with external wallets like Phantom that handle signing
        transaction.feePayer = signer;
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

        // Return a placeholder signature since we can't actually send the transaction
        // The caller should handle the actual signing and sending
        return 'transaction_prepared_for_external_signing';
      }
    } catch (error) {
      console.error('Transaction failed:', error);
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
    userKeypair: Keypair | PublicKey,
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

      // Using the updated SDK methods that accept both Keypair and PublicKey
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
    userKeypair: Keypair | PublicKey,
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

      // Using the updated SDK methods that accept both Keypair and PublicKey
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
