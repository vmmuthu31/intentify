/**
 * Enhanced Groq AI Service using Groq Node SDK
 *
 */

import Groq from 'groq-sdk';
import { IntentToken } from './intent-api-service';
import { TurnkeyTokenBalance } from './turnkey-solana-service';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || '',
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

class GroqAIService {
  private static instance: GroqAIService;
  private conversationHistory: Array<{ role: string; content: string }> = [];

  private constructor() {}

  public static getInstance(): GroqAIService {
    if (!GroqAIService.instance) {
      GroqAIService.instance = new GroqAIService();
    }
    return GroqAIService.instance;
  }

  private getSystemPrompt(): string {
    return `You are a professional DeFi assistant specializing in Solana token swaps and portfolio management. 

CORE RULES:
1. NEVER make up or mock data - only use real information provided
2. NEVER execute actions - only analyze and suggest
3. Be honest about limitations and uncertainties
4. Provide clear, actionable responses
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
- Be concise but informative`;
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

Available tokens for swapping: ${availableTokenSymbols}

USER MESSAGE: "${userInput}"

TASK: Analyze the user's intent and respond with JSON.

ANALYSIS RULES:
1. Only suggest fromToken if user actually owns it (check balances above)
2. Only suggest toToken from available tokens list
3. If unclear, ask for clarification rather than guessing
4. Consider conversation context and user's actual capabilities
5. Be specific about what information is missing

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
- 0.9+: All required info clear and valid
- 0.7-0.8: Most info clear, minor ambiguity
- 0.5-0.6: Intent clear but missing details
- 0.3-0.4: Unclear intent, need clarification
- 0.1-0.2: Very unclear or impossible request`;

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
        return this.fallbackParseIntent(userInput, userTokens, availableTokens);
      }

      return parsed as SwapIntent;
    } catch (error) {
      console.error('❌ Failed to parse intent:', error);
      return this.fallbackParseIntent(userInput, userTokens, availableTokens);
    }
  }

  /**
   * Analyze user's portfolio and provide insights
   */
  async analyzePortfolio(userTokens: TurnkeyTokenBalance[]): Promise<PortfolioAnalysis> {
    try {
      const totalValue = userTokens.reduce((sum, token) => sum + (token.value || 0), 0);

      const portfolioData = userTokens
        .filter((token) => token.uiAmount > 0)
        .map((token) => ({
          symbol: token.symbol,
          amount: token.uiAmount,
          value: token.value || 0,
          percentage: totalValue > 0 ? ((token.value || 0) / totalValue) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value);

      const prompt = `PORTFOLIO ANALYSIS REQUEST

Current Holdings:
${portfolioData
  .map(
    (token) =>
      `• ${token.symbol}: ${token.amount.toFixed(4)} tokens = $${token.value.toFixed(2)} (${token.percentage.toFixed(1)}%)`
  )
  .join('\n')}

Total Portfolio Value: $${totalValue.toFixed(2)}

ANALYSIS REQUIREMENTS:
1. Assess diversification quality
2. Identify concentration risks
3. Evaluate token type distribution (stablecoins, meme coins, utility tokens)
4. Provide specific, actionable recommendations
5. Assess overall risk level based on holdings

Respond with JSON:
{
  "totalValue": ${totalValue},
  "topHoldings": [
    {"symbol": "TOKEN", "value": actual_value, "percentage": actual_percentage}
  ],
  "recommendations": [
    "specific_actionable_recommendation",
    "another_specific_recommendation"
  ],
  "riskLevel": "low" | "medium" | "high",
  "insights": [
    "key_insight_about_portfolio",
    "another_important_insight"
  ]
}

RECOMMENDATION GUIDELINES:
- Be specific about amounts or percentages
- Focus on risk management and diversification
- Consider Solana ecosystem specifics
- Suggest concrete next steps
- Keep recommendations practical and achievable`;

      const response = await this.callGroqAPI(
        [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        {
          temperature: 0.3,
          maxTokens: 800,
        }
      );

      const parsed = JSON.parse(response);
      return parsed as PortfolioAnalysis;
    } catch (error) {
      console.error('❌ Failed to analyze portfolio:', error);
      return this.fallbackPortfolioAnalysis(userTokens);
    }
  }

  /**
   * Generate smart suggestions based on context
   */
  async generateSuggestions(
    userTokens: TurnkeyTokenBalance[],
    availableTokens: IntentToken[],
    context: 'welcome' | 'after_swap' | 'error' | 'portfolio'
  ): Promise<string[]> {
    let topUserTokens;
    try {
      topUserTokens = userTokens
        .filter((t) => t.uiAmount > 0 && t.value && t.value > 1)
        .sort((a, b) => (b.value || 0) - (a.value || 0))
        .slice(0, 3);

      const prompt = `SUGGESTION CONTEXT:
User's top tokens: ${topUserTokens.map((t) => `${t.symbol} ($${t.value?.toFixed(2)})`).join(', ')}
Context: ${context}
Available tokens: ${availableTokens
        .slice(0, 15)
        .map((t) => t.symbol)
        .join(', ')}

Generate 4 specific, actionable suggestions that:
1. Are relevant to the current context
2. Use actual token symbols the user owns
3. Are practical and achievable
4. Guide the user toward valuable actions

Respond with JSON array:
["specific_suggestion_1", "specific_suggestion_2", "specific_suggestion_3", "specific_suggestion_4"]

SUGGESTION QUALITY:
- Use exact token symbols and realistic amounts
- Avoid generic phrases like "manage your portfolio"
- Include specific actions like "Swap 50 BONK to USDC"
- Consider user's actual holdings and context`;

      const response = await this.callGroqAPI(
        [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        {
          temperature: 0.5,
          maxTokens: 400,
        }
      );

      const suggestions = JSON.parse(response);
      return Array.isArray(suggestions)
        ? suggestions.slice(0, 4)
        : this.getFallbackSuggestions(context, topUserTokens);
    } catch (error) {
      console.error('❌ Failed to generate suggestions:', error);
      return this.getFallbackSuggestions(context, topUserTokens || []);
    }
  }

  /**
   * Generate contextual conversation responses
   */
  async generateResponse(
    userInput: string,
    context: {
      userTokens: TurnkeyTokenBalance[];
      availableTokens: IntentToken[];
      lastAction?: string;
      portfolioValue?: number;
    }
  ): Promise<{
    message: string;
    suggestions: string[];
    actionRequired?: string;
  }> {
    try {
      const { userTokens, availableTokens, lastAction, portfolioValue } = context;

      const prompt = `CONVERSATION CONTEXT:
User has ${userTokens.length} different tokens
Portfolio value: $${portfolioValue?.toFixed(2) || 'unknown'}
Last action: ${lastAction || 'none'}
Available tokens: ${availableTokens
        .slice(0, 20)
        .map((t) => t.symbol)
        .join(', ')}

USER MESSAGE: "${userInput}"

TASK: Generate a helpful, natural response that:
1. Directly addresses the user's message
2. Provides specific information or guidance
3. Suggests concrete next steps
4. Maintains conversational flow

RESPONSE RULES:
- Be conversational but professional
- Don't repeat information unnecessarily
- Provide specific token names and amounts when relevant
- Ask clarifying questions if needed
- Be honest about limitations

Respond with JSON:
{
  "message": "natural_conversational_response",
  "suggestions": ["specific_suggestion1", "specific_suggestion2"],
  "actionRequired": "swap" | "portfolio" | "help" | null
}`;

      const response = await this.callGroqAPI(
        [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        {
          temperature: 0.4,
          maxTokens: 600,
        }
      );

      return JSON.parse(response);
    } catch (error) {
      console.error('❌ Failed to generate response:', error);
      return {
        message:
          "I'm having trouble processing your request right now. Could you please rephrase what you'd like to do?",
        suggestions: ['Show my portfolio', 'Help me swap tokens', 'What tokens can I trade?'],
      };
    }
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
      const { temperature = 0.1, maxTokens = 1000, model = 'llama-3.1-70b-versatile' } = options;

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

    // Validate token ownership and availability
    if (intent.fromToken) {
      const hasToken = userTokens.some((t) => t.symbol === intent.fromToken && t.uiAmount > 0);
      if (!hasToken) return false;
    }

    if (intent.toToken) {
      const isAvailable = availableTokens.some((t) => t.symbol === intent.toToken);
      if (!isAvailable) return false;
    }

    return true;
  }

  /**
   * Fallback intent parsing without AI
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

      // Simple token extraction
      const userTokenSymbols = userTokens.map((t) => t.symbol.toLowerCase());
      const availableTokenSymbols = availableTokens.map((t) => t.symbol.toLowerCase());

      let fromToken: string | undefined;
      let toToken: string | undefined;

      // Look for "from" token
      for (const symbol of userTokenSymbols) {
        if (lowerInput.includes(symbol.toLowerCase())) {
          fromToken = symbol.toUpperCase();
          break;
        }
      }

      // Look for "to" token
      const toPatterns = ['to ', 'for ', 'into '];
      for (const pattern of toPatterns) {
        const index = lowerInput.indexOf(pattern);
        if (index !== -1) {
          const afterPattern = lowerInput.substring(index + pattern.length);
          for (const symbol of availableTokenSymbols) {
            if (afterPattern.includes(symbol.toLowerCase())) {
              toToken = symbol.toUpperCase();
              break;
            }
          }
        }
      }

      return {
        action: 'swap',
        fromToken,
        toToken,
        amount,
        confidence: fromToken && toToken ? 0.7 : 0.4,
        reasoning: 'Detected swap intent but missing specific details',
        suggestions: [
          'Specify both tokens to swap',
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
   * Fallback portfolio analysis
   */
  private fallbackPortfolioAnalysis(userTokens: TurnkeyTokenBalance[]): PortfolioAnalysis {
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

  private getFallbackSuggestions(context: string, topTokens: TurnkeyTokenBalance[]): string[] {
    const baseToken = topTokens[0]?.symbol || 'SOL';

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
export const groqAIService = GroqAIService.getInstance();
export default groqAIService;
