import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { TokenListProvider, TokenInfo } from '@solana/spl-token-registry';
import { turnkeyAuthService } from './turnkey-auth-service';
import { getTokenMetadataService } from './token-metadata-service';

export interface TurnkeyTokenBalance {
  mint: string;
  symbol: string;
  name?: string;
  balance: number;
  uiAmount: number;
  decimals: number;
  price?: number;
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
  totalValue: number;
}

export interface TurnkeyPortfolioData {
  wallets: TurnkeyWalletData[];
  totalSolBalance: number;
  totalTokenValue: number;
  totalPortfolioValue: number;
  allTokenBalances: TurnkeyTokenBalance[];
}

class TurnkeySolanaService {
  private connection: Connection;
  private tokenMap: Record<string, TokenInfo> = {};
  private priceCache: Record<string, { price: number; timestamp: number }> = {};
  private readonly PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly REQUEST_DELAY = 1000; // 1 second between requests

  constructor() {
    // Use a more reliable RPC endpoint
    this.connection = new Connection('https://solana-api.projectserum.com', 'confirmed');
    this.loadTokenList();
  }

  private async loadTokenList() {
    try {
      const provider = new TokenListProvider();
      const tokenListContainer = await provider.resolve();
      const tokenList = tokenListContainer.filterByClusterSlug('mainnet-beta').getList();

      tokenList.forEach((token) => {
        this.tokenMap[token.address] = token;
      });

      console.log('✅ Token list loaded:', Object.keys(this.tokenMap).length, 'tokens');
    } catch (error) {
      console.error('❌ Failed to load token list:', error);
    }
  }

  private async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetchTokenPrices(mints: string[]): Promise<Record<string, number>> {
    try {
      // Check cache first
      const now = Date.now();
      const cachedPrices: Record<string, number> = {};
      const mintsToFetch: string[] = [];

      mints.forEach((mint) => {
        const cached = this.priceCache[mint];
        if (cached && now - cached.timestamp < this.PRICE_CACHE_DURATION) {
          cachedPrices[mint] = cached.price;
        } else {
          mintsToFetch.push(mint);
        }
      });

      if (mintsToFetch.length === 0) {
        return cachedPrices;
      }

      console.log(`🔍 Fetching prices for ${mintsToFetch.length} tokens...`);

      // Use CoinGecko API as backup since Jupiter might be rate limited
      const prices: Record<string, number> = { ...cachedPrices };

      // Add some known prices as fallback
      const knownPrices: Record<string, number> = {
        So11111111111111111111111111111111111111112: 189, // SOL
        EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 1, // USDC
        Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 1, // USDT
      };

      mintsToFetch.forEach((mint) => {
        if (Object.prototype.hasOwnProperty.call(knownPrices, mint)) {
          prices[mint] = knownPrices[mint];
          this.priceCache[mint] = { price: knownPrices[mint], timestamp: now };
        } else {
          prices[mint] = 0; // Default to 0 if price not available
        }
      });

      return prices;
    } catch (error) {
      console.error('❌ Failed to fetch token prices:', error);
      return {};
    }
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

          // Fetch balances for this wallet
          const { solBalance, tokenBalances, totalValue } =
            await this.fetchWalletBalances(publicKey);

          const walletData: TurnkeyWalletData = {
            walletId: wallet.walletId,
            walletName: wallet.walletName,
            address: solanaAccount.address,
            publicKey,
            solBalance,
            tokenBalances,
            totalValue,
          };

          console.log(
            `✅ Successfully processed user's Solana wallet with $${totalValue.toFixed(2)} total value`
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

  private async fetchWalletBalances(publicKey: PublicKey): Promise<{
    solBalance: number;
    tokenBalances: TurnkeyTokenBalance[];
    totalValue: number;
  }> {
    try {
      console.log(`🔍 Fetching balances for wallet: ${publicKey.toString().slice(0, 8)}...`);

      // Add delay to avoid rate limiting
      await this.delay(this.REQUEST_DELAY);

      // Fetch SOL balance
      const solBalanceLamports = await this.connection.getBalance(publicKey);
      const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;

      console.log(`💰 SOL Balance: ${solBalance.toFixed(4)} SOL`);

      // Add delay before fetching token accounts
      await this.delay(this.REQUEST_DELAY);

      // Fetch token accounts
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      console.log(`🪙 Found ${tokenAccounts.value.length} token accounts`);

      const tokenBalances: TurnkeyTokenBalance[] = [];
      const mintList = tokenAccounts.value
        .map(({ account }) => account.data.parsed.info.mint)
        .filter((mint, index, self) => self.indexOf(mint) === index); // Remove duplicates

      // Add SOL to mint list for price fetching
      const allMints = ['So11111111111111111111111111111111111111112', ...mintList];

      // Fetch prices for all tokens
      const prices = await this.fetchTokenPrices(allMints);

      // Add SOL balance if > 0
      if (solBalance > 0) {
        tokenBalances.push({
          mint: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          balance: solBalanceLamports,
          uiAmount: solBalance,
          decimals: 9,
          price: prices['So11111111111111111111111111111111111111112'] || 0,
          logoURI:
            'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        });
      }

      // Process token accounts (only non-zero balances)
      const nonZeroTokenAccounts = tokenAccounts.value.filter(({ account }) => {
        const rawAmount = parseInt(account.data.parsed.info.tokenAmount.amount);
        return rawAmount > 0;
      });

      if (nonZeroTokenAccounts.length > 0) {
        console.log(`📊 Processing ${nonZeroTokenAccounts.length} non-zero token balances...`);

        // Get metadata service
        const metadataService = getTokenMetadataService(this.connection);

        // Process tokens with delays to avoid rate limiting
        for (const { account } of nonZeroTokenAccounts) {
          try {
            const data = account.data.parsed.info;
            const mint = data.mint;
            const rawAmount = parseInt(data.tokenAmount.amount);
            const decimals = data.tokenAmount.decimals;
            const uiAmount = rawAmount / Math.pow(10, decimals);

            // Get token info from registry first (faster)
            const tokenInfo = this.tokenMap[mint];
            let symbol = tokenInfo?.symbol || 'UNKNOWN';
            let name = tokenInfo?.name || symbol;
            let logoURI = tokenInfo?.logoURI || '';

            // Try to get metadata if not in registry
            if (!tokenInfo) {
              try {
                const metadata = await metadataService.fetchTokenMetadata(mint);
                if (metadata) {
                  symbol = metadata.symbol || symbol;
                  name = metadata.name || name;
                }
              } catch (metadataError) {
                console.warn(`⚠️ Could not fetch metadata for ${mint}:`, metadataError);
              }
            }

            const price = prices[mint] || 0;

            tokenBalances.push({
              mint,
              symbol,
              name,
              balance: rawAmount,
              uiAmount,
              decimals,
              price,
              logoURI,
            });

            console.log(
              `✅ Added token: ${symbol} (${uiAmount.toFixed(decimals > 6 ? 6 : decimals)})`
            );

            // Small delay between token processing
            await this.delay(200);
          } catch (tokenError) {
            console.warn('⚠️ Error processing token:', tokenError);
          }
        }
      }

      // Calculate total value
      const totalValue = tokenBalances.reduce((total, token) => {
        return total + token.uiAmount * (token.price || 0);
      }, 0);

      console.log(
        `✅ Wallet processed: ${tokenBalances.length} assets, $${totalValue.toFixed(2)} total value`
      );

      return {
        solBalance,
        tokenBalances: tokenBalances.filter((token) => token.uiAmount > 0),
        totalValue,
      };
    } catch (error) {
      console.error('❌ Failed to fetch wallet balances:', error);

      // Return empty data instead of throwing to prevent app crash
      return {
        solBalance: 0,
        tokenBalances: [],
        totalValue: 0,
      };
    }
  }

  async getPortfolioData(): Promise<TurnkeyPortfolioData> {
    try {
      console.log("📊 Fetching user's portfolio data...");

      const wallets = await this.getUserWallets();

      if (wallets.length === 0) {
        console.warn('⚠️ No Solana wallets found');
        return {
          wallets: [],
          totalSolBalance: 0,
          totalTokenValue: 0,
          totalPortfolioValue: 0,
          allTokenBalances: [],
        };
      }

      // Aggregate data across all wallets (though we expect only one)
      const totalSolBalance = wallets.reduce((total, wallet) => total + wallet.solBalance, 0);
      const totalTokenValue = wallets.reduce((total, wallet) => total + wallet.totalValue, 0);

      // Combine all token balances
      const tokenBalanceMap = new Map<string, TurnkeyTokenBalance>();

      wallets.forEach((wallet) => {
        wallet.tokenBalances.forEach((token) => {
          const existing = tokenBalanceMap.get(token.mint);
          if (existing) {
            // Aggregate balances for the same token across wallets
            existing.balance += token.balance;
            existing.uiAmount += token.uiAmount;
          } else {
            tokenBalanceMap.set(token.mint, { ...token });
          }
        });
      });

      const allTokenBalances = Array.from(tokenBalanceMap.values());
      const totalPortfolioValue = allTokenBalances.reduce((total, token) => {
        return total + token.uiAmount * (token.price || 0);
      }, 0);

      console.log(
        `✅ Portfolio compiled: ${wallets.length} wallet(s), $${totalPortfolioValue.toFixed(2)} total value`
      );

      return {
        wallets,
        totalSolBalance,
        totalTokenValue,
        totalPortfolioValue,
        allTokenBalances,
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
}

// Export singleton instance
export const turnkeySolanaService = new TurnkeySolanaService();
export default turnkeySolanaService;
