import { Connection, PublicKey, Transaction } from '@solana/web3.js';

export interface JupiterSwapParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number; // Slippage in basis points (50 = 0.5%)
  userPublicKey: PublicKey;
}

export interface JupiterQuoteResponse {
  data: {
    inAmount: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: string;
    slippageBps: number;
    platformFee: null;
    priceImpactPct: string;
    routePlan: {
      swapInfo: {
        ammKey: string;
        label: string;
        inputMint: string;
        outputMint: string;
        inAmount: string;
        outAmount: string;
        feeAmount: string;
        feeMint: string;
      };
      percent: number;
    }[];
    contextSlot: number;
    timeTaken: number;
  }[];
  timeTaken: number;
}

export interface JupiterSwapResponse {
  swapTransaction: string; // Base64 encoded transaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

/**
 * Jupiter Swap Service for Devnet
 * Provides real token swaps using Jupiter aggregator on Solana devnet
 */
export class JupiterSwapService {
  private baseUrl = 'https://quote-api.jup.ag/v6';

  constructor(private connection: Connection) {}

  /**
   * Get swap quote from Jupiter
   */
  async getSwapQuote(params: JupiterSwapParams): Promise<JupiterQuoteResponse> {
    try {
      console.log('🔍 Getting Jupiter swap quote...');
      console.log('  Input:', params.inputMint, 'Amount:', params.amount);
      console.log('  Output:', params.outputMint);
      console.log('  Slippage:', params.slippageBps, 'bps');

      // Convert amount to smallest unit (e.g., lamports for SOL)
      const amountInSmallestUnit = Math.floor(params.amount * 1e9); // Assuming 9 decimals

      const queryParams = new URLSearchParams({
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: amountInSmallestUnit.toString(),
        slippageBps: params.slippageBps.toString(),
        onlyDirectRoutes: 'false',
        asLegacyTransaction: 'false',
      });

      const quoteUrl = `${this.baseUrl}/quote?${queryParams}`;
      console.log('🌐 Jupiter Quote URL:', quoteUrl);

      const response = await fetch(quoteUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jupiter quote failed: ${response.status} ${errorText}`);
      }

      const quote = await response.json();
      console.log('✅ Jupiter quote received:', {
        routes: quote.data?.length || 0,
        bestRoute: quote.data?.[0]
          ? {
              inAmount: quote.data[0].inAmount,
              outAmount: quote.data[0].outAmount,
              priceImpact: quote.data[0].priceImpactPct,
            }
          : null,
      });

      return quote;
    } catch (error) {
      console.error('❌ Failed to get Jupiter quote:', error);
      throw error;
    }
  }

  /**
   * Get swap transaction from Jupiter
   */
  async getSwapTransaction(
    params: JupiterSwapParams & {
      quoteResponse: JupiterQuoteResponse;
    }
  ): Promise<JupiterSwapResponse> {
    try {
      console.log('🔄 Getting swap transaction from Jupiter...');

      const bestQuote = params.quoteResponse.data[0];
      if (!bestQuote) {
        throw new Error('No route found for this swap');
      }

      const swapRequestBody = {
        quoteResponse: bestQuote,
        userPublicKey: params.userPublicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      };

      console.log('📤 Sending swap request to Jupiter API...');
      const response = await fetch(`${this.baseUrl}/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(swapRequestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jupiter swap failed: ${response.status} ${errorText}`);
      }

      const swapResponse = await response.json();
      console.log('✅ Jupiter swap transaction received');

      return swapResponse;
    } catch (error) {
      console.error('❌ Failed to get Jupiter swap transaction:', error);
      throw error;
    }
  }

  /**
   * Execute a complete swap using Jupiter
   */
  async executeSwap(params: JupiterSwapParams): Promise<Transaction> {
    try {
      console.log('🚀 Executing Jupiter swap...');

      // 1. Get quote
      const quote = await this.getSwapQuote(params);

      // 2. Get swap transaction
      const swapResponse = await this.getSwapTransaction({
        ...params,
        quoteResponse: quote,
      });

      // 3. Deserialize transaction
      const transaction = Transaction.from(Buffer.from(swapResponse.swapTransaction, 'base64'));

      console.log('✅ Jupiter swap transaction ready:', {
        instructions: transaction.instructions.length,
        lastValidBlockHeight: swapResponse.lastValidBlockHeight,
      });

      return transaction;
    } catch (error) {
      console.error('❌ Jupiter swap execution failed:', error);
      throw error;
    }
  }

  /**
   * Check if Jupiter supports a token pair on devnet
   */
  async checkTokenSupport(inputMint: string, outputMint: string): Promise<boolean> {
    try {
      // Try to get a small quote to check if the pair is supported
      const testParams: JupiterSwapParams = {
        inputMint,
        outputMint,
        amount: 0.001, // Very small amount for testing
        slippageBps: 50,
        userPublicKey: new PublicKey('11111111111111111111111111111111'), // Dummy key
      };

      const quote = await this.getSwapQuote(testParams);
      return quote.data && quote.data.length > 0;
    } catch {
      console.log('⚠️ Token pair not supported by Jupiter:', inputMint, '→', outputMint);
      return false;
    }
  }

  /**
   * Get estimated output amount for a swap
   */
  async getEstimatedOutput(
    inputMint: string,
    outputMint: string,
    inputAmount: number,
    slippageBps: number = 50
  ): Promise<{ outputAmount: number; priceImpact: number } | null> {
    try {
      const params: JupiterSwapParams = {
        inputMint,
        outputMint,
        amount: inputAmount,
        slippageBps,
        userPublicKey: new PublicKey('11111111111111111111111111111111'), // Dummy key for quote
      };

      const quote = await this.getSwapQuote(params);
      const bestRoute = quote.data[0];

      if (!bestRoute) return null;

      return {
        outputAmount: parseInt(bestRoute.outAmount) / 1e9, // Convert from lamports
        priceImpact: parseFloat(bestRoute.priceImpactPct),
      };
    } catch (error) {
      console.error('Failed to get estimated output:', error);
      return null;
    }
  }
}

/**
 * Create Jupiter swap service instance
 */
export const createJupiterSwapService = (connection: Connection) => {
  return new JupiterSwapService(connection);
};
