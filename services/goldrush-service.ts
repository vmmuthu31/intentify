import { GOLDRUSH_API_KEY, HELIUS_API_KEY } from '@env';

export interface GoldRushTokenBalance {
  contract_decimals: number;
  contract_name: string;
  contract_ticker_symbol: string;
  contract_address: string;
  supports_erc: string[] | null;
  logo_url: string;
  balance: string;
  balance_24h: string;
  quote_rate: number;
  quote_rate_24h: number;
  quote: number;
  quote_24h: number;
  nft_data: any[] | null;
}

export interface GoldRushWalletBalance {
  address: string;
  updated_at: string;
  next_update_at: string;
  quote_currency: string;
  chain_id: number;
  chain_name: string;
  items: GoldRushTokenBalance[];
  pagination: {
    has_more: boolean;
    page_number: number;
    page_size: number;
    total_count: number;
  };
}

export interface GoldRushResponse {
  data: GoldRushWalletBalance;
  error: boolean;
  error_message: string | null;
  error_code: number | null;
}

export interface ProcessedTokenBalance {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  uiAmount: number;
  decimals: number;
  price: number;
  priceChange24h: number;
  value: number;
  valueChange24h: number;
  logoUrl: string;
}

export interface GoldRushTransaction {
  block_signed_at: string;
  block_height: number;
  tx_hash: string;
  tx_offset: number;
  successful: boolean;
  from_address: string;
  from_address_label: string | null;
  to_address: string;
  to_address_label: string | null;
  value: string;
  value_quote: number;
  gas_offered: number;
  gas_spent: number;
  gas_price: number;
  fees_paid: string;
  gas_quote: number;
  gas_quote_rate: number;
  log_events: any[];
}

export interface GoldRushTransactionsResponse {
  address: string;
  updated_at: string;
  next_update_at: string;
  quote_currency: string;
  chain_id: number;
  chain_name: string;
  items: GoldRushTransaction[];
  pagination: {
    has_more: boolean;
    page_number: number;
    page_size: number;
    total_count: number;
  };
}

export interface ProcessedTransaction {
  hash: string;
  timestamp: string;
  blockHeight: number;
  successful: boolean;
  fromAddress: string;
  toAddress: string;
  value: number;
  valueUSD: number;
  gasUsed: number;
  gasFee: number;
  gasFeeUSD: number;
  type: 'sent' | 'received' | 'swap' | 'unknown';
  description: string;
}

export interface ProcessedWalletData {
  address: string;
  totalValue: number;
  totalValueChange24h: number;
  tokenBalances: ProcessedTokenBalance[];
  recentTransactions: ProcessedTransaction[];
  lastUpdated: string;
}

class GoldRushService {
  private static instance: GoldRushService;
  private readonly baseUrl = 'https://api.covalenthq.com/v1';
  private readonly apiKey = GOLDRUSH_API_KEY;
  private readonly heliusapiKey = HELIUS_API_KEY;
  private cache: Map<string, { data: ProcessedWalletData; timestamp: number }> = new Map();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    if (!this.apiKey) {
      console.error('❌ GoldRush API key not found in environment variables');
    }
  }

  public static getInstance(): GoldRushService {
    if (!GoldRushService.instance) {
      GoldRushService.instance = new GoldRushService();
    }
    return GoldRushService.instance;
  }

  /**
   * Get wallet token balances for Solana
   */
  async getWalletBalances(address: string): Promise<ProcessedWalletData> {
    try {
      // Check cache first
      const cacheKey = `solana_${address}`;
      const cached = this.cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log('📋 Using cached GoldRush data for:', address.slice(0, 8) + '...');
        return cached.data;
      }

      console.log('🔍 Fetching wallet balances from GoldRush for:', address.slice(0, 8) + '...');

      if (!this.apiKey) {
        throw new Error('GoldRush API key not configured');
      }

      // Fetch both balances and transactions in parallel
      const [balancesData, transactionsData] = await Promise.allSettled([
        this.fetchWalletBalances(address),
        this.fetchWalletTransactions(address, 5), // Get last 5 transactions
      ]);

      let processedData: ProcessedWalletData;

      if (balancesData.status === 'fulfilled') {
        processedData = this.processWalletData(balancesData.value);
      } else {
        console.error('❌ Failed to fetch balances:', balancesData.reason);
        processedData = {
          address,
          totalValue: 0,
          totalValueChange24h: 0,
          tokenBalances: [],
          recentTransactions: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      // Add transactions if available
      if (transactionsData.status === 'fulfilled') {
        processedData.recentTransactions = this.processTransactions(
          transactionsData.value,
          address
        );
      } else {
        console.error('❌ Failed to fetch transactions:', transactionsData.reason);
        processedData.recentTransactions = [];
      }

      // Cache the result
      this.cache.set(cacheKey, {
        data: processedData,
        timestamp: Date.now(),
      });

      console.log(
        `✅ GoldRush data fetched: ${processedData.tokenBalances.length} tokens, ${processedData.recentTransactions.length} transactions, ${processedData.totalValue.toFixed(2)} total value`
      );

      return processedData;
    } catch (error) {
      console.error('❌ Failed to fetch GoldRush wallet data:', error);

      // Return empty data instead of throwing to prevent app crash
      return {
        address,
        totalValue: 0,
        totalValueChange24h: 0,
        tokenBalances: [],
        recentTransactions: [],
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  /**
   * Fetch wallet balances from GoldRush API
   */
  private async fetchWalletBalances(address: string): Promise<GoldRushWalletBalance> {
    // Solana mainnet chain ID is 1399811149 in Covalent
    const chainId = 1399811149;
    const url = `${this.baseUrl}/${chainId}/address/${address}/balances_v2/`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`GoldRush API error: ${response.status} ${response.statusText}`);
    }

    const result: GoldRushResponse = await response.json();

    if (result.error) {
      throw new Error(`GoldRush API error: ${result.error_message}`);
    }

    return result.data;
  }

  /**
   * Fetch wallet transactions from GoldRush API
   */
  private async fetchWalletTransactions(address: string, limit: number = 5): Promise<any[]> {
    try {
      const heliusUrl = `https://api.helius.xyz/v0/addresses/${address}/transactions?limit=${limit}&api-key=${this.heliusapiKey}`;

      const response = await fetch(heliusUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.log(`❌ Helius API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const txs: any[] = await response.json();

      const parsed = txs.map((tx) => ({
        signature: tx.signature,
        slot: tx.slot,
        timestamp: tx.timestamp,
        fee: tx.fee,
        type: tx.type,
        source: tx.source,
        description: tx.description,
        feePayer: tx.feePayer,
        tokenTransfers: tx.tokenTransfers || [],
        nativeTransfers: tx.nativeTransfers || [],
        accountData: tx.accountData || [],
      }));

      console.log(`✅ Successfully fetched ${parsed.length} transactions from Helius`);
      return parsed;
    } catch (error) {
      console.log(`⚠️ Failed to fetch transactions from Helius: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Process transactions data from Helius API
   */
  private processTransactions(
    transactions: any[],
    userAddress: string
  ): ProcessedTransaction[] {
    return transactions.map((tx) => {
      // Handle Helius transaction structure
      const fee = tx.fee || 0;
      const gasFee = fee / Math.pow(10, 9); // Convert lamports to SOL
      
      // Get transaction type and description from Helius data
      let type: ProcessedTransaction['type'] = 'unknown';
      let description = tx.description || 'Transaction';
      
      // Map Helius transaction types to our types
      if (tx.type) {
        switch (tx.type.toUpperCase()) {
          case 'SWAP':
            type = 'swap';
            break;
          case 'TRANSFER':
            // Determine if sent or received based on native transfers
            if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
              const userTransfer = tx.nativeTransfers.find((transfer: any) => 
                transfer.fromUserAccount === userAddress || transfer.toUserAccount === userAddress
              );
              if (userTransfer) {
                type = userTransfer.fromUserAccount === userAddress ? 'sent' : 'received';
              }
            }
            break;
          default:
            type = 'unknown';
        }
      }

      // Calculate transaction value from native transfers
      let value = 0;
      if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
        const userTransfers = tx.nativeTransfers.filter((transfer: any) => 
          transfer.fromUserAccount === userAddress || transfer.toUserAccount === userAddress
        );
        
        // Sum up the amounts for user-related transfers
        value = userTransfers.reduce((sum: number, transfer: any) => {
          const amount = transfer.amount || 0;
          return sum + (amount / Math.pow(10, 9)); // Convert lamports to SOL
        }, 0);
      }

      // Get addresses from fee payer and account data
      const fromAddress = tx.feePayer || userAddress;
      const toAddress = tx.accountData && tx.accountData.length > 1 
        ? tx.accountData[1].account 
        : userAddress;

      return {
        hash: tx.signature || '',
        timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : new Date().toISOString(),
        blockHeight: tx.slot || 0,
        successful: !tx.transactionError,
        fromAddress,
        toAddress,
        value,
        valueUSD: 0, // Helius doesn't provide USD values directly
        gasUsed: 0, // Not available in Helius format
        gasFee,
        gasFeeUSD: 0, // Not available in Helius format
        type,
        description,
      };
    });
  }

  /**
   * Process raw GoldRush data into our format
   */
  private processWalletData(data: GoldRushWalletBalance): ProcessedWalletData {
    const tokenBalances: ProcessedTokenBalance[] = [];
    let totalValue = 0;
    let totalValueChange24h = 0;

    data.items.forEach((item) => {
      // Skip tokens with zero balance
      if (!item.balance || item.balance === '0') {
        return;
      }

      const decimals = item.contract_decimals;
      const rawBalance = parseFloat(item.balance);
      const uiAmount = rawBalance / Math.pow(10, decimals);

      // Skip very small balances (dust)
      if (uiAmount < 0.000001) {
        return;
      }

      const price = item.quote_rate || 0;
      const priceChange24h =
        ((item.quote_rate - (item.quote_rate_24h || 0)) / (item.quote_rate_24h || 1)) * 100;
      const value = item.quote || 0;
      const valueChange24h = (item.quote || 0) - (item.quote_24h || 0);

      // Handle SOL specially (native token)
      const isSOL =
        item.contract_address === '11111111111111111111111111111111' ||
        item.contract_ticker_symbol === 'SOL';

      tokenBalances.push({
        mint: isSOL ? 'So11111111111111111111111111111111111111112' : item.contract_address,
        symbol: item.contract_ticker_symbol || 'UNKNOWN',
        name: item.contract_name || item.contract_ticker_symbol || 'Unknown Token',
        balance: rawBalance,
        uiAmount,
        decimals,
        price,
        priceChange24h,
        value,
        valueChange24h,
        logoUrl: item.logo_url || '',
      });

      totalValue += value;
      totalValueChange24h += valueChange24h;
    });

    // Sort by value (highest first)
    tokenBalances.sort((a, b) => b.value - a.value);

    return {
      address: data.address,
      totalValue,
      totalValueChange24h,
      tokenBalances,
      recentTransactions: [], // Will be populated by the main method
      lastUpdated: data.updated_at,
    };
  }

  /**
   * Get multiple wallet balances (for multiple wallets)
   */
  async getMultipleWalletBalances(addresses: string[]): Promise<ProcessedWalletData[]> {
    console.log(`🔍 Fetching balances for ${addresses.length} wallet(s) from GoldRush...`);

    const promises = addresses.map((address) => this.getWalletBalances(address));
    const results = await Promise.allSettled(promises);

    const successfulResults: ProcessedWalletData[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfulResults.push(result.value);
      } else {
        console.error(`❌ Failed to fetch balances for wallet ${addresses[index]}:`, result.reason);
        // Add empty data for failed wallets
        successfulResults.push({
          address: addresses[index],
          totalValue: 0,
          totalValueChange24h: 0,
          tokenBalances: [],
          lastUpdated: new Date().toISOString(),
          recentTransactions: [],
        });
      }
    });

    return successfulResults;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🧹 GoldRush cache cleared');
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Export singleton instance
export const goldRushService = GoldRushService.getInstance();
export default goldRushService;
