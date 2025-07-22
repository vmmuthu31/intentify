// Funded Wallet Pool Service - Manages pre-funded demo wallets to avoid airdrop dependency
import { PublicKey, Keypair } from '@solana/web3.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { networkService } from './config';

interface PooledWallet {
  publicKey: string;
  privateKey: number[]; // Array format for JSON storage
  balance: number;
  lastChecked: number;
  isInUse: boolean;
}

export class FundedWalletPool {
  private static instance: FundedWalletPool;
  private walletPool: PooledWallet[] = [];
  private currentWalletIndex: number = 0;

  private constructor() {}

  public static getInstance(): FundedWalletPool {
    if (!FundedWalletPool.instance) {
      FundedWalletPool.instance = new FundedWalletPool();
    }
    return FundedWalletPool.instance;
  }

  /**
   * Initialize the wallet pool with pre-funded demo wallets
   */
  public async initializePool(): Promise<void> {
    try {
      console.log('🏊 Initializing funded wallet pool...');

      // Try to load existing pool from storage
      const existingPool = await AsyncStorage.getItem('funded_wallet_pool');
      if (existingPool) {
        this.walletPool = JSON.parse(existingPool);
        console.log(`📦 Loaded ${this.walletPool.length} wallets from pool`);

        // Check balances of existing wallets
        await this.refreshWalletBalances();

        // If we have funded wallets, we're good
        const fundedWallets = this.walletPool.filter((w) => w.balance > 0.01);
        if (fundedWallets.length > 0) {
          console.log(`✅ Pool has ${fundedWallets.length} funded wallets ready`);
          return;
        }
      }

      // Create initial demo wallets with known private keys (for demo purposes)
      await this.createDemoWalletPool();
    } catch (error) {
      console.error('Failed to initialize wallet pool:', error);
      // Create fallback demo wallet
      await this.createDemoWalletPool();
    }
  }

  /**
   * Create a pool of demo wallets with some that might have funds
   */
  private async createDemoWalletPool(): Promise<void> {
    console.log('🔧 Creating demo wallet pool...');

    // Pre-defined demo wallets for development (these would be funded manually or have existing balances)
    const demoWallets = [
      // You can manually fund these wallets or use them as template
      {
        // Demo wallet 1 - manually fund this one on devnet
        keypair: Keypair.generate(),
        priority: 1,
      },
      {
        // Demo wallet 2 - backup
        keypair: Keypair.generate(),
        priority: 2,
      },
      {
        // Demo wallet 3 - fallback
        keypair: Keypair.generate(),
        priority: 3,
      },
    ];

    this.walletPool = [];

    for (const demo of demoWallets) {
      const walletData: PooledWallet = {
        publicKey: demo.keypair.publicKey.toString(),
        privateKey: Array.from(demo.keypair.secretKey),
        balance: 0,
        lastChecked: Date.now(),
        isInUse: false,
      };

      this.walletPool.push(walletData);
      console.log(`📝 Added demo wallet: ${demo.keypair.publicKey.toString().slice(0, 8)}...`);
    }

    // Save to storage
    await this.savePoolToStorage();

    // Check balances
    await this.refreshWalletBalances();
  }

  /**
   * Get a funded wallet from the pool
   */
  public async getFundedWallet(): Promise<{
    publicKey: PublicKey;
    keypair?: Keypair;
    hasFunds: boolean;
  }> {
    try {
      await this.refreshWalletBalances();

      // Find first wallet with sufficient funds
      const fundedWallet = this.walletPool.find((w) => w.balance >= 0.01 && !w.isInUse);

      if (fundedWallet) {
        // Mark as in use
        fundedWallet.isInUse = true;
        await this.savePoolToStorage();

        console.log(
          `✅ Using funded wallet: ${fundedWallet.publicKey.slice(0, 8)}... (${fundedWallet.balance.toFixed(4)} SOL)`
        );

        const keypair = Keypair.fromSecretKey(new Uint8Array(fundedWallet.privateKey));
        return {
          publicKey: keypair.publicKey,
          keypair,
          hasFunds: true,
        };
      }

      // If no funded wallets, try to get the best available wallet
      const bestWallet = this.walletPool
        .filter((w) => !w.isInUse)
        .sort((a, b) => b.balance - a.balance)[0];

      if (bestWallet) {
        console.log(
          `⚠️ Using best available wallet: ${bestWallet.publicKey.slice(0, 8)}... (${bestWallet.balance.toFixed(4)} SOL)`
        );

        bestWallet.isInUse = true;
        await this.savePoolToStorage();

        const keypair = Keypair.fromSecretKey(new Uint8Array(bestWallet.privateKey));
        return {
          publicKey: keypair.publicKey,
          keypair,
          hasFunds: bestWallet.balance >= 0.001, // Even small amounts can work
        };
      }

      // Fallback: create new wallet
      console.log('🆕 Creating new wallet as fallback');
      const newKeypair = Keypair.generate();
      return {
        publicKey: newKeypair.publicKey,
        keypair: newKeypair,
        hasFunds: false,
      };
    } catch (error) {
      console.error('Error getting funded wallet:', error);

      // Ultimate fallback
      const fallbackKeypair = Keypair.generate();
      return {
        publicKey: fallbackKeypair.publicKey,
        keypair: fallbackKeypair,
        hasFunds: false,
      };
    }
  }

  /**
   * Release a wallet back to the pool
   */
  public async releaseWallet(publicKey: PublicKey): Promise<void> {
    const wallet = this.walletPool.find((w) => w.publicKey === publicKey.toString());
    if (wallet) {
      wallet.isInUse = false;
      await this.savePoolToStorage();
      console.log(`🔄 Released wallet back to pool: ${publicKey.toString().slice(0, 8)}...`);
    }
  }

  /**
   * Refresh balances of all wallets in pool
   */
  private async refreshWalletBalances(): Promise<void> {
    try {
      const connection = networkService.getConnection();

      for (const wallet of this.walletPool) {
        try {
          const publicKey = new PublicKey(wallet.publicKey);
          const balance = await connection.getBalance(publicKey);
          wallet.balance = balance / 1_000_000_000; // Convert to SOL
          wallet.lastChecked = Date.now();
        } catch (error) {
          console.warn(`Failed to check balance for ${wallet.publicKey.slice(0, 8)}:`, error);
          wallet.balance = 0;
        }
      }

      await this.savePoolToStorage();

      const fundedCount = this.walletPool.filter((w) => w.balance > 0.01).length;
      console.log(
        `💰 Pool status: ${fundedCount}/${this.walletPool.length} wallets have sufficient funds`
      );
    } catch (error) {
      console.error('Failed to refresh wallet balances:', error);
    }
  }

  /**
   * Get pool status for debugging
   */
  public async getPoolStatus(): Promise<{
    totalWallets: number;
    fundedWallets: number;
    totalBalance: number;
    walletsInUse: number;
  }> {
    await this.refreshWalletBalances();

    return {
      totalWallets: this.walletPool.length,
      fundedWallets: this.walletPool.filter((w) => w.balance > 0.01).length,
      totalBalance: this.walletPool.reduce((sum, w) => sum + w.balance, 0),
      walletsInUse: this.walletPool.filter((w) => w.isInUse).length,
    };
  }

  /**
   * Add manually funded wallet to pool
   */
  public async addFundedWallet(keypair: Keypair): Promise<void> {
    const connection = networkService.getConnection();
    const balance = await connection.getBalance(keypair.publicKey);

    const walletData: PooledWallet = {
      publicKey: keypair.publicKey.toString(),
      privateKey: Array.from(keypair.secretKey),
      balance: balance / 1_000_000_000,
      lastChecked: Date.now(),
      isInUse: false,
    };

    this.walletPool.push(walletData);
    await this.savePoolToStorage();

    console.log(
      `➕ Added funded wallet to pool: ${keypair.publicKey.toString().slice(0, 8)}... (${walletData.balance.toFixed(4)} SOL)`
    );
  }

  /**
   * Save pool to storage
   */
  private async savePoolToStorage(): Promise<void> {
    try {
      await AsyncStorage.setItem('funded_wallet_pool', JSON.stringify(this.walletPool));
    } catch (error) {
      console.error('Failed to save wallet pool:', error);
    }
  }

  /**
   * Print funding instructions for demo wallets
   */
  public printFundingInstructions(): void {
    console.log('💡 FUNDING INSTRUCTIONS:');
    console.log('To fund demo wallets, visit https://faucet.solana.com and fund these addresses:');

    this.walletPool.forEach((wallet, index) => {
      console.log(`${index + 1}. ${wallet.publicKey} (${wallet.balance.toFixed(4)} SOL)`);
    });

    console.log('\nOr use: solana airdrop 1 <address> --url devnet');
  }
}

// Export singleton instance
export const fundedWalletPool = FundedWalletPool.getInstance();
