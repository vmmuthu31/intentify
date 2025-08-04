import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { turnkeyAuthService } from './turnkey-auth-service';
import { goldRushService, ProcessedWalletData, ProcessedTransaction } from './goldrush-service';

export interface TurnkeyTokenBalance {
  mint: string;
  symbol: string;
  name?: string;
  balance: number;
  uiAmount: number;
  decimals: number;
  price?: number;
  priceChange24h?: number;
  value?: number;
  valueChange24h?: number;
  uri?: string;
  logoURI?: string;
}

export interface TurnkeyWalletData {
  walletId: string;
  walletName: string;
  address: string;
  publicKey: PublicKey;
  solBalance: number;
  tokenBalances: TurnkeyTokenBalance[];
  recentTransactions: ProcessedTransaction[];
  totalValue: number;
  totalValueChange24h: number;
  lastUpdated: string;
}

export interface TurnkeyPortfolioData {
  wallets: TurnkeyWalletData[];
  totalSolBalance: number;
  totalTokenValue: number;
  totalPortfolioValue: number;
  totalValueChange24h: number;
  allTokenBalances: TurnkeyTokenBalance[];
  recentTransactions: ProcessedTransaction[];
  lastUpdated: string;
}

class TurnkeySolanaService {
  private connection: Connection;
  private readonly REQUEST_DELAY = 1000; // 1 second between requests

  constructor() {
    // Use a reliable RPC endpoint for basic operations
    this.connection = new Connection('https://solana-api.projectserum.com', 'confirmed');
  }

  private async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getUserWallets(): Promise<TurnkeyWalletData[]> {
    try {
      console.log("🔍 Fetching user's Solana wallet from Turnkey...");

      // Get wallets from Turnkey
      const walletsResponse = await turnkeyAuthService.getUserWallets();

      if (!walletsResponse.success || !walletsResponse.wallets) {
        throw new Error('Failed to fetch wallets from Turnkey');
      }

      console.log(
        `📋 Found ${walletsResponse.wallets.length} total wallets, looking for Solana wallet...`
      );

      // Find the first wallet with a Solana account (user's primary wallet)
      for (const wallet of walletsResponse.wallets) {
        try {
          console.log(`🔍 Checking wallet: ${wallet.walletName} (${wallet.walletId})`);

          // Get wallet accounts (addresses) for this wallet
          const accountsResponse = await turnkeyAuthService.getWalletAccounts(wallet.walletId);

          if (!accountsResponse.success || !accountsResponse.accounts) {
            console.warn(`⚠️ No accounts found for wallet ${wallet.walletId}`);
            continue;
          }

          // Find Solana account
          const solanaAccount = accountsResponse.accounts.find(
            (account) =>
              account.curve === 'CURVE_ED25519' ||
              account.addressFormat === 'ADDRESS_FORMAT_SOLANA' ||
              account.path?.includes("m/44'/501'") // Solana derivation path
          );

          if (!solanaAccount) {
            console.warn(`⚠️ No Solana account found for wallet ${wallet.walletId}`);
            continue;
          }

          console.log(`✅ Found user's Solana wallet: ${wallet.walletName}`);
          console.log(`📍 Address: ${solanaAccount.address}`);

          const publicKey = new PublicKey(solanaAccount.address);

          // Fetch balances using GoldRush API
          const goldRushData = await goldRushService.getWalletBalances(solanaAccount.address);

          // Convert GoldRush data to our format
          const walletData = this.convertGoldRushToWalletData(
            wallet,
            solanaAccount.address,
            publicKey,
            goldRushData
          );

          console.log(
            `✅ Successfully processed user's Solana wallet with $${walletData.totalValue.toFixed(2)} total value`
          );
          return [walletData]; // Return only the user's primary Solana wallet
        } catch (error) {
          console.error(`❌ Failed to process wallet ${wallet.walletId}:`, error);
          continue;
        }
      }

      console.warn("⚠️ No Solana wallets found in user's Turnkey account");
      return [];
    } catch (error) {
      console.error("❌ Failed to fetch user's Solana wallet:", error);
      throw error;
    }
  }

  private convertGoldRushToWalletData(
    wallet: any,
    address: string,
    publicKey: PublicKey,
    goldRushData: ProcessedWalletData
  ): TurnkeyWalletData {
    // Convert GoldRush token balances to our format
    const tokenBalances: TurnkeyTokenBalance[] = goldRushData.tokenBalances.map((token) => ({
      mint: token.mint,
      symbol: token.symbol,
      name: token.name,
      balance: token.balance,
      uiAmount: token.uiAmount,
      decimals: token.decimals,
      price: token.price,
      priceChange24h: token.priceChange24h,
      value: token.value,
      valueChange24h: token.valueChange24h,
      logoURI: token.logoUrl,
    }));

    // Calculate SOL balance from the tokens
    const solToken = tokenBalances.find((token) => token.symbol === 'SOL');
    const solBalance = solToken ? solToken.uiAmount : 0;

    return {
      walletId: wallet.walletId,
      walletName: wallet.walletName,
      address,
      publicKey,
      solBalance,
      tokenBalances,
      recentTransactions: goldRushData.recentTransactions,
      totalValue: goldRushData.totalValue,
      totalValueChange24h: goldRushData.totalValueChange24h,
      lastUpdated: goldRushData.lastUpdated,
    };
  }

  async getPortfolioData(): Promise<TurnkeyPortfolioData> {
    try {
      console.log("📊 Fetching user's portfolio data with GoldRush...");

      const wallets = await this.getUserWallets();

      if (wallets.length === 0) {
        console.warn('⚠️ No Solana wallets found');
        return {
          wallets: [],
          totalSolBalance: 0,
          totalTokenValue: 0,
          totalPortfolioValue: 0,
          totalValueChange24h: 0,
          allTokenBalances: [],
          recentTransactions: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      // Aggregate data across all wallets (though we expect only one)
      const totalSolBalance = wallets.reduce((total, wallet) => total + wallet.solBalance, 0);
      const totalTokenValue = wallets.reduce((total, wallet) => total + wallet.totalValue, 0);
      const totalValueChange24h = wallets.reduce(
        (total, wallet) => total + wallet.totalValueChange24h,
        0
      );

      // Combine all token balances
      const tokenBalanceMap = new Map<string, TurnkeyTokenBalance>();

      wallets.forEach((wallet) => {
        wallet.tokenBalances.forEach((token) => {
          const existing = tokenBalanceMap.get(token.mint);
          if (existing) {
            // Aggregate balances for the same token across wallets
            existing.balance += token.balance;
            existing.uiAmount += token.uiAmount;
            existing.value = (existing.value || 0) + (token.value || 0);
            existing.valueChange24h = (existing.valueChange24h || 0) + (token.valueChange24h || 0);
          } else {
            tokenBalanceMap.set(token.mint, { ...token });
          }
        });
      });

      const allTokenBalances = Array.from(tokenBalanceMap.values());
      const totalPortfolioValue = allTokenBalances.reduce((total, token) => {
        return total + (token.value || 0);
      }, 0);

      // Combine recent transactions from all wallets
      const allRecentTransactions: ProcessedTransaction[] = [];
      wallets.forEach((wallet) => {
        allRecentTransactions.push(...wallet.recentTransactions);
      });

      // Sort transactions by timestamp (newest first) and take the most recent 3
      const recentTransactions = allRecentTransactions
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 3);

      const lastUpdated = wallets.length > 0 ? wallets[0].lastUpdated : new Date().toISOString();

      console.log(
        `✅ Portfolio compiled with GoldRush: ${wallets.length} wallet(s), $${totalPortfolioValue.toFixed(2)} total value, ${recentTransactions.length} recent transactions`
      );

      return {
        wallets,
        totalSolBalance,
        totalTokenValue,
        totalPortfolioValue,
        totalValueChange24h,
        allTokenBalances,
        recentTransactions,
        lastUpdated,
      };
    } catch (error) {
      console.error('❌ Failed to get portfolio data:', error);
      throw error;
    }
  }

  // Get connection for other services
  getConnection(): Connection {
    return this.connection;
  }

  // Switch network (for testing)
  switchNetwork(network: 'mainnet-beta' | 'devnet' | 'testnet') {
    const endpoints = {
      'mainnet-beta': 'https://solana-api.projectserum.com',
      devnet: 'https://api.devnet.solana.com',
      testnet: 'https://api.testnet.solana.com',
    };

    this.connection = new Connection(endpoints[network], 'confirmed');
    console.log(`🔄 Switched to ${network}: ${endpoints[network]}`);
  }

  // Clear GoldRush cache
  clearCache(): void {
    goldRushService.clearCache();
    console.log('🧹 Portfolio cache cleared');
  }

  // Get cache stats
  getCacheStats() {
    return goldRushService.getCacheStats();
  }
}

// Export singleton instance
export const turnkeySolanaService = new TurnkeySolanaService();
export default turnkeySolanaService;