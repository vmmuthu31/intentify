// IntentFI API Service for chat-based intent execution
import { turnkeyAuthService } from './turnkey-auth-service';

const BASE_URL = 'https://www.intentifi.xyz';

export interface IntentToken {
  contract: string;
  symbol: string;
  decimals: number;
  name: string;
  logoURI: string;
  chainName: string;
  standard: string;
}

export interface QuoteRequest {
  amountIn: string;
  fromToken: string;
  toToken: string;
  fromChain: string;
  toChain: string;
  slippageBps: number;
  userOrganizationId: string;
}

export interface QuoteResponse {
  success: boolean;
  quote: Array<{
    type: string;
    slippageBps: number;
    effectiveAmountIn64: string;
    expectedAmountOut: number;
    minAmountOut: number;
    minReceived: number;
    price: number;
    bridgeFee: number;
    effectiveAmountIn: number;
    clientEta: string;
    priceImpact: number;
    fromToken: IntentToken & {
      mint: string;
      verified: boolean;
      chainId: number;
      wChainId: number;
      coingeckoId: string;
      pythUsdPriceId: string;
      realOriginContractAddress: string;
      realOriginChainId: number;
      supportsPermit: boolean;
    };
    toToken: IntentToken & {
      mint: string;
      verified: boolean;
      chainId: number;
      wChainId: number;
      wrappedAddress: string;
      coingeckoId: string;
      pythUsdPriceId: string;
      realOriginContractAddress: string;
      realOriginChainId: number;
      supportsPermit: boolean;
      hasAuction?: boolean;
    };
    eta: number;
    etaSeconds: number;
    gasDrop: number;
    fromChain: string;
    gasless: boolean;
    maxUserGasDrop: number;
    toChain: string;
    priceStat: {
      ratio: number;
      status: string;
    };
    mintDecimals: {
      from: number;
      to: number;
    };
    meta: {
      advertisedDescription: string;
      advertisedTitle: string;
      icon: string;
      switchText: string;
      title: string;
    };
  }>;
}

export interface SwapRequest {
  quote: QuoteResponse['quote'][0];
  originAddress: string;
  destinationAddress: string;
  userOrganizationId: string;
}

export interface SwapResponse {
  success: boolean;
  result: {
    success: boolean;
    signature: string;
    statusCheckEnabled: boolean;
    explorerUrl: string;
  };
  addresses: {
    origin: string;
    destination: string;
  };
  referralInfo: {
    referrerAddresses: {
      solana: string;
    };
    referrerBps: number;
  };
  statusTracking: {
    enabled: boolean;
    message: string;
    explorerUrl: string;
  };
}

class IntentApiService {
  private static instance: IntentApiService;

  private constructor() {}

  public static getInstance(): IntentApiService {
    if (!IntentApiService.instance) {
      IntentApiService.instance = new IntentApiService();
    }
    return IntentApiService.instance;
  }

  /**
   * Get available tokens for Solana
   */
  async getTokens(): Promise<{ success: boolean; tokens: IntentToken[] }> {
    try {
      const response = await fetch(`${BASE_URL}/api/intent/tokens?chain=solana`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('❌ Failed to fetch tokens:', error);
      throw error;
    }
  }

  /**
   * Get quote for token swap
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    try {
      const response = await fetch(`${BASE_URL}/api/intent/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('❌ Failed to get quote:', error);
      throw error;
    }
  }

  /**
   * Execute swap intent
   */
  async executeSwap(request: SwapRequest): Promise<SwapResponse> {
    try {
      const response = await fetch(`${BASE_URL}/api/intent/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('❌ Failed to execute swap:', error);
      throw error;
    }
  }

  /**
   * Get user's organization ID from Turnkey auth
   */
  getUserOrganizationId(): string | null {
    const authState = turnkeyAuthService.getAuthState();
    return authState.organizationId;
  }

  /**
   * Validate if user has sufficient balance for swap
   */
  validateBalance(userBalance: number, requiredAmount: number, decimals: number = 9): boolean {
    const requiredInBaseUnits = requiredAmount * Math.pow(10, decimals);
    const userBalanceInBaseUnits = userBalance * Math.pow(10, decimals);
    
    // Add small buffer for fees (0.01 SOL = 0.01 * 10^9 lamports)
    const feeBuffer = 0.01 * Math.pow(10, 9);
    
    return userBalanceInBaseUnits >= (requiredInBaseUnits + feeBuffer);
  }

  /**
   * Format token amount for display
   */
  formatTokenAmount(amount: number, decimals: number, symbol: string): string {
    const formatted = (amount / Math.pow(10, decimals)).toFixed(
      symbol === 'SOL' ? 4 : decimals > 6 ? 6 : decimals
    );
    return `${formatted} ${symbol}`;
  }

  /**
   * Get SOL native token representation
   */
  getSolToken(): Partial<IntentToken> {
    return {
      contract: '0x0000000000000000000000000000000000000000',
      symbol: 'SOL',
      decimals: 9,
      name: 'SOL',
      logoURI: 'https://statics.mayan.finance/SOL.png',
      chainName: 'solana',
      standard: 'native',
    };
  }
}

// Export singleton instance
export const intentApiService = IntentApiService.getInstance();
export default intentApiService;