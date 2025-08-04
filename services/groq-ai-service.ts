/**
 * Enhanced Groq AI Service with Intent API Integration
 */

import Groq from 'groq-sdk';
import { IntentToken, intentApiService } from './intent-api-service';
import { TurnkeyTokenBalance, turnkeySolanaService } from './turnkey-solana-service';
import { GROQ_API_KEY } from '@env';

const groq = new Groq({
  apiKey: GROQ_API_KEY || '',
});

export interface SwapIntent {
  action: 'swap' | 'portfolio' | 'help' | 'unknown';
  fromToken?: string;
  toToken?: string;
  amount?: number;
  confidence: number;
  suggestions?: string[];
  reasoning?: string;
}

export interface PortfolioAnalysis {
  totalValue: number;
  topHoldings: Array<{
    symbol: string;
    value: number;
    percentage: number;
  }>;
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high';
  insights?: string[];
}

export interface SwapExecutionResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

class EnhancedGroqAIService {
  private static instance: EnhancedGroqAIService;
  private conversationHistory: Array<{ role: string; content: string }> = [];

  private constructor() {}

  public static getInstance(): EnhancedGroqAIService {
    if (!EnhancedGroqAIService.instance) {
      EnhancedGroqAIService.instance = new EnhancedGroqAIService();
    }
    return EnhancedGroqAIService.instance;
  }

  private getSystemPrompt(): string {
    return `You are a professional DeFi assistant specializing in Solana token swaps and portfolio management. 

CORE RULES:
1. NEVER make up or mock data - only use real information provided
2. PRIORITIZE SWAP ACTIONS - if user mentions swap with tokens, always return action: "swap"
3. Be honest about limitations and uncertainties
4. Provide clear, actionable responses with proper markdown formatting
5. Always validate token symbols against provided lists
6. Maintain conversation context for better user experience

BEHAVIOR GUIDELINES:
- Respond naturally like a knowledgeable human advisor
- Ask clarifying questions when intent is unclear
- Explain your reasoning briefly
- Suggest specific next steps
- Be conservative with confidence scores
- Acknowledge when you don't have enough information

RESPONSE FORMAT:
- Always respond with valid JSON
- Include reasoning for transparency
- Provide helpful suggestions
- Be concise but informative
- Use markdown formatting for better readability (headers, bold, lists, etc.)`;
  }

  /**
   * Parse user input and execute swap if intent is clear
   */
  async parseAndExecuteSwapIntent(
    userInput: string,
    userTokens: TurnkeyTokenBalance[],
    availableTokens: IntentToken[]
  ): Promise<{
    intent: SwapIntent;
    executionResult?: SwapExecutionResult;
  }> {
    try {
      // Parse the intent first
      const intent = await this.parseSwapIntent(userInput, userTokens, availableTokens);

      console.log('🤖 Parsed intent:', intent);

      // If it's a clear swap intent with all required info, execute it immediately
      if (
        intent.action === 'swap' &&
        intent.fromToken &&
        intent.toToken &&
        intent.amount &&
        intent.confidence >= 0.8
      ) {
        console.log('🚀 Executing swap immediately:', intent);

        const executionResult = await this.executeSwapIntent(
          intent.fromToken,
          intent.toToken,
          intent.amount,
          availableTokens
        );

        return {
          intent,
          executionResult,
        };
      }

      // Otherwise, just return the intent for further processing
      return { intent };
    } catch (error) {
      console.error('❌ Error in parseAndExecuteSwapIntent:', error);

      // Return fallback intent
      const fallbackIntent = this.fallbackParseIntent(userInput, userTokens, availableTokens);
      return { intent: fallbackIntent };
    }
  }

  /**
   * Parse user input to extract swap intent
   */
  async parseSwapIntent(
    userInput: string,
    userTokens: TurnkeyTokenBalance[],
    availableTokens: IntentToken[]
  ): Promise<SwapIntent> {
    try {
      // First try fallback parsing for immediate results
      const fallbackResult = this.fallbackParseIntent(userInput, userTokens, availableTokens);

      // If fallback found a clear swap intent, use it immediately
      if (fallbackResult.action === 'swap' && fallbackResult.confidence >= 0.7) {
        console.log('🚀 Using fallback parsing for immediate swap:', fallbackResult);
        return fallbackResult;
      }

      // Filter and format user tokens
      const userTokensWithBalance = userTokens
        .filter((t) => t.uiAmount > 0)
        .map((t) => `${t.symbol} (${t.uiAmount.toFixed(4)} tokens, $${(t.value || 0).toFixed(2)})`)
        .join('\n');

      const availableTokenSymbols = availableTokens
        .slice(0, 30)
        .map((t) => t.symbol)
        .join(', ');

      const prompt = `CONTEXT:
User's tokens with balances:
${userTokensWithBalance || 'No tokens with balance found'}
SOL: Always available for swapping

Available tokens for swapping: ${availableTokenSymbols}, SOL

USER MESSAGE: "${userInput}"

TASK: Analyze the user's intent and respond with JSON.

ANALYSIS RULES:
1. If user mentions "swap", "exchange", "trade" with tokens and amounts, ALWAYS return action: "swap"
2. SOL is always available as both fromToken and toToken
3. Only suggest fromToken if user actually owns it (check balances above) OR if it's SOL
4. Only suggest toToken from available tokens list OR SOL
5. Extract exact amounts mentioned (e.g., "0.001", "1", "100")
6. Be specific about what information is missing

Required JSON format:
{
  "action": "swap" | "portfolio" | "help" | "unknown",
  "fromToken": "SYMBOL_OR_NULL",
  "toToken": "SYMBOL_OR_NULL", 
  "amount": number_or_null,
  "confidence": 0.0_to_1.0,
  "reasoning": "brief_explanation_of_analysis",
  "suggestions": ["specific_actionable_suggestion1", "suggestion2"]
}

CONFIDENCE SCORING:
- 0.9+: All required info clear and valid (action=swap, tokens identified, amount specified)
- 0.7-0.8: Most info clear, minor ambiguity
- 0.5-0.6: Intent clear but missing details
- 0.3-0.4: Unclear intent, need clarification
- 0.1-0.2: Very unclear or impossible request

EXAMPLES:
"swap 0.001 sol to melania" → {"action": "swap", "fromToken": "SOL", "toToken": "MELANIA", "amount": 0.001, "confidence": 0.9}
"exchange 1 SOL for USDC" → {"action": "swap", "fromToken": "SOL", "toToken": "USDC", "amount": 1, "confidence": 0.9}`;

      const response = await this.callGroqAPI(
        [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        {
          temperature: 0.1,
          maxTokens: 500,
        }
      );

      const parsed = JSON.parse(response);

      // Validate the response
      if (!this.validateSwapIntent(parsed, userTokens, availableTokens)) {
        console.log('❌ AI parsing failed validation, using fallback');
        return fallbackResult;
      }

      console.log('✅ AI parsing successful:', parsed);
      return parsed as SwapIntent;
    } catch (error) {
      console.error('❌ Failed to parse intent:', error);
      return this.fallbackParseIntent(userInput, userTokens, availableTokens);
    }
  }

  /**
   * Execute a swap using the intent API service
   */
  async executeSwapIntent(
    fromTokenSymbol: string,
    toTokenSymbol: string,
    amount: number,
    availableTokens: IntentToken[]
  ): Promise<SwapExecutionResult> {
    try {
      console.log('🚀 executeSwapIntent called:', { fromTokenSymbol, toTokenSymbol, amount });

      // Get user organization ID
      const userOrgId = intentApiService.getUserOrganizationId();
      if (!userOrgId) {
        return {
          success: false,
          message: '❌ Authentication error. Please log in again.',
          error: 'No user organization ID found',
        };
      }

      // Get user portfolio data
      const portfolioData = await turnkeySolanaService.getPortfolioData();
      if (!portfolioData.wallets.length) {
        return {
          success: false,
          message: '❌ No wallet found. Please set up your wallet first.',
          error: 'No wallets found',
        };
      }

      const userAddress = portfolioData.wallets[0].address;

      // Find token contracts
      const fromToken = this.findTokenBySymbol(fromTokenSymbol, availableTokens);
      const toToken = this.findTokenBySymbol(toTokenSymbol, availableTokens);

      if (!fromToken) {
        return {
          success: false,
          message: `❌ Token "${fromTokenSymbol}" not found or not supported.`,
          error: 'From token not found',
        };
      }

      if (!toToken) {
        return {
          success: false,
          message: `❌ Token "${toTokenSymbol}" not found or not supported.`,
          error: 'To token not found',
        };
      }

      // Convert amount to base units
      const amountInBaseUnits = (amount * Math.pow(10, fromToken.decimals)).toString();

      // Create quote request
      const quoteRequest = {
        amountIn: amountInBaseUnits,
        fromToken: fromToken.contract,
        toToken: toToken.contract,
        fromChain: 'solana',
        toChain: 'solana',
        slippageBps: 100, // 1% slippage
        userOrganizationId: userOrgId,
      };

      console.log('📊 Getting quote:', quoteRequest);

      // Get quote
      const quoteResponse = await intentApiService.getQuote(quoteRequest);

      if (!quoteResponse.success || !quoteResponse.quote.length) {
        return {
          success: false,
          message:
            '❌ Unable to get a quote for this swap. Please try different tokens or amounts.',
          error: 'No quote available',
        };
      }

      const quote = quoteResponse.quote[0];

      console.log('✅ Quote received:', {
        expectedAmountOut: quote.expectedAmountOut,
        price: quote.price,
        priceImpact: quote.priceImpact,
      });

      // Create swap request
      const swapRequest = {
        quote,
        originAddress: userAddress,
        destinationAddress: userAddress,
        userOrganizationId: userOrgId,
      };

      console.log('🔄 Executing swap...');

      // Execute swap
      const swapResponse = await intentApiService.executeSwap(swapRequest);

      if (swapResponse.success && swapResponse.result.success) {
        return {
          success: true,
          message: `# 🎉 Swap Successful!

**Transaction:** \`${swapResponse.result.signature.slice(0, 8)}...${swapResponse.result.signature.slice(-8)}\`

**Details:**
- **From:** ${amount} ${fromTokenSymbol}
- **To:** ~${quote.expectedAmountOut.toFixed(6)} ${toTokenSymbol}
- **Rate:** 1 ${fromTokenSymbol} = ${quote.price.toFixed(6)} ${toTokenSymbol}

🔍 **[Track on Solscan](${swapResponse.result.explorerUrl})**

💫 Tokens will arrive shortly!`,
          data: {
            signature: swapResponse.result.signature,
            explorerUrl: swapResponse.result.explorerUrl,
            quote,
            fromToken,
            toToken,
            amount,
          },
        };
      } else {
        return {
          success: false,
          message: '❌ Swap failed. Please try again or contact support.',
          error: 'Swap execution failed',
          data: swapResponse,
        };
      }
    } catch (error) {
      console.error('❌ Failed to execute swap intent:', error);
      return {
        success: false,
        message: '❌ Failed to execute swap. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Helper method to find token by symbol
   */
  private findTokenBySymbol(symbol: string, availableTokens: IntentToken[]): IntentToken | null {
    // Check available tokens first
    const token = availableTokens.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
    if (token) return token;

    // Check for SOL
    if (symbol.toUpperCase() === 'SOL') {
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

    return null;
  }

  /**
   * Enhanced fallback intent parsing without AI
   */
  private fallbackParseIntent(
    userInput: string,
    userTokens: TurnkeyTokenBalance[],
    availableTokens: IntentToken[]
  ): SwapIntent {
    const lowerInput = userInput.toLowerCase();

    // Check for portfolio requests
    if (
      lowerInput.includes('portfolio') ||
      lowerInput.includes('balance') ||
      lowerInput.includes('holdings')
    ) {
      return {
        action: 'portfolio',
        confidence: 0.8,
        reasoning: 'Detected portfolio-related keywords',
        suggestions: ['Show detailed portfolio', 'Analyze my holdings', 'Check token values'],
      };
    }

    // Check for swap intent
    if (
      lowerInput.includes('swap') ||
      lowerInput.includes('exchange') ||
      lowerInput.includes('trade')
    ) {
      // Try to extract tokens and amounts
      const amountMatch = lowerInput.match(/(\d+(?:\.\d+)?)/);
      const amount = amountMatch ? parseFloat(amountMatch[1]) : undefined;

      // Create comprehensive token lists including SOL
      const allUserTokens = [...userTokens.map((t) => t.symbol.toLowerCase()), 'sol'];
      const allAvailableTokens = [
        ...availableTokens.map((t) => t.symbol.toLowerCase()),
        'sol',
        'melania',
      ];

      let fromToken: string | undefined;
      let toToken: string | undefined;

      // Enhanced token extraction - look for tokens in the input
      // First, try to find tokens before "to" keyword
      const toIndex = lowerInput.indexOf(' to ');
      if (toIndex !== -1) {
        const beforeTo = lowerInput.substring(0, toIndex);
        const afterTo = lowerInput.substring(toIndex + 4);

        // Find from token in the part before "to"
        for (const symbol of allUserTokens) {
          if (beforeTo.includes(symbol)) {
            fromToken = symbol.toUpperCase();
            break;
          }
        }

        // Find to token in the part after "to"
        for (const symbol of allAvailableTokens) {
          if (afterTo.includes(symbol)) {
            toToken = symbol.toUpperCase();
            break;
          }
        }
      } else {
        // If no "to" keyword, try to find any tokens mentioned
        for (const symbol of allUserTokens) {
          if (lowerInput.includes(symbol)) {
            fromToken = symbol.toUpperCase();
            break;
          }
        }
      }

      console.log('🔍 Fallback parsing:', {
        input: userInput,
        fromToken,
        toToken,
        amount,
        allUserTokens: allUserTokens.slice(0, 5),
        allAvailableTokens: allAvailableTokens.slice(0, 5),
      });

      return {
        action: 'swap',
        fromToken,
        toToken,
        amount,
        confidence: fromToken && toToken && amount ? 0.9 : fromToken && toToken ? 0.7 : 0.4,
        reasoning: `Detected swap intent: ${fromToken || '?'} → ${toToken || '?'} (${amount || '?'})`,
        suggestions: [
          fromToken && toToken && amount
            ? `Execute swap: ${amount} ${fromToken} to ${toToken}`
            : 'Specify both tokens to swap',
          'Include the amount you want to swap',
          'Check your available balances',
        ],
      };
    }

    // Default to help
    return {
      action: 'help',
      confidence: 0.5,
      reasoning: 'Intent unclear, providing general guidance',
      suggestions: [
        'Try "swap 1 SOL to USDC"',
        'Say "show my portfolio"',
        'Ask "what tokens can I swap?"',
      ],
    };
  }

  /**
   * Validate swap intent response
   */
  private validateSwapIntent(
    intent: any,
    userTokens: TurnkeyTokenBalance[],
    availableTokens: IntentToken[]
  ): boolean {
    if (!intent || typeof intent !== 'object') return false;
    if (!['swap', 'portfolio', 'help', 'unknown'].includes(intent.action)) return false;
    if (typeof intent.confidence !== 'number' || intent.confidence < 0 || intent.confidence > 1)
      return false;

    // For swap actions, validate tokens more thoroughly
    if (intent.action === 'swap') {
      // Validate from token (must be owned by user or be SOL)
      if (intent.fromToken) {
        const hasToken = userTokens.some(
          (t) => t.symbol.toUpperCase() === intent.fromToken.toUpperCase() && t.uiAmount > 0
        );
        const isSOL = intent.fromToken.toUpperCase() === 'SOL';
        if (!hasToken && !isSOL) {
          console.log('❌ Validation failed: fromToken not owned', intent.fromToken);
          return false;
        }
      }

      // Validate to token (must be available or be SOL)
      if (intent.toToken) {
        const isAvailable = availableTokens.some(
          (t) => t.symbol.toUpperCase() === intent.toToken.toUpperCase()
        );
        const isSOL = intent.toToken.toUpperCase() === 'SOL';
        if (!isAvailable && !isSOL) {
          console.log('❌ Validation failed: toToken not available', intent.toToken);
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Call Groq API using the official SDK with proper error handling
   */
  private async callGroqAPI(
    messages: Array<{ role: string; content: string }>,
    options: {
      temperature?: number;
      maxTokens?: number;
      model?: string;
    } = {}
  ): Promise<string> {
    try {
      const { temperature = 0.1, maxTokens = 1000, model = 'llama3-8b-8192' } = options;

      const params = {
        messages: messages as Groq.Chat.ChatCompletionMessageParam[],
        model,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' as const },
      };

      const chatCompletion: Groq.Chat.ChatCompletion = await groq.chat.completions.create(params);

      const content = chatCompletion.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No response content from Groq API');
      }

      return content;
    } catch (error) {
      console.error('❌ Groq SDK error:', error);

      // Handle specific Groq SDK errors
      if (error instanceof Error) {
        if (error.message.includes('API key')) {
          throw new Error('Invalid or missing Groq API key');
        }
        if (error.message.includes('rate limit')) {
          throw new Error('Groq API rate limit exceeded');
        }
        if (error.message.includes('quota')) {
          throw new Error('Groq API quota exceeded');
        }
      }

      throw new Error(
        `Groq API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Legacy methods for backward compatibility
  async analyzePortfolio(userTokens: TurnkeyTokenBalance[]): Promise<PortfolioAnalysis> {
    const totalValue = userTokens.reduce((sum, token) => sum + (token.value || 0), 0);

    const topHoldings = userTokens
      .filter((token) => token.uiAmount > 0)
      .map((token) => ({
        symbol: token.symbol,
        value: token.value || 0,
        percentage: totalValue > 0 ? ((token.value || 0) / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      totalValue,
      topHoldings,
      recommendations: [
        'Consider diversifying across different asset types',
        'Keep some SOL for transaction fees',
        'Monitor your largest positions regularly',
        'Consider stablecoins for stability',
      ],
      riskLevel: totalValue > 1000 ? 'medium' : 'low',
      insights: [
        `Portfolio concentrated in ${topHoldings[0]?.symbol || 'unknown'} token`,
        `Total of ${userTokens.filter((t) => t.uiAmount > 0).length} different tokens held`,
      ],
    };
  }

  async generateSuggestions(
    userTokens: TurnkeyTokenBalance[],
    availableTokens: IntentToken[],
    context: 'welcome' | 'after_swap' | 'error' | 'portfolio'
  ): Promise<string[]> {
    const topUserTokens = userTokens
      .filter((t) => t.uiAmount > 0 && t.value && t.value > 1)
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .slice(0, 3);

    const baseToken = topUserTokens[0]?.symbol || 'SOL';

    switch (context) {
      case 'welcome':
        return [
          `Swap ${baseToken} to USDC`,
          'Show my portfolio',
          'Exchange SOL for MELANIA',
          'What tokens can I swap?',
        ];
      case 'after_swap':
        return [
          'Show updated portfolio',
          'Swap more tokens',
          'Check my balances',
          'What else can I do?',
        ];
      case 'portfolio':
        return [
          `Swap ${baseToken} to USDC`,
          'Diversify my holdings',
          'Show swap options',
          'Analyze my risk',
        ];
      case 'error':
        return [
          'Show my available tokens',
          'Help me swap tokens',
          'Check my balances',
          'Start over',
        ];
      default:
        return ['Show my portfolio', 'Swap SOL to USDC', 'Help me swap tokens', 'What can I do?'];
    }
  }
}

// Export singleton instance
export const groqAIService = EnhancedGroqAIService.getInstance();
export default groqAIService;
