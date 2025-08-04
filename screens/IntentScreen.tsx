import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  Linking,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInLeft, BounceIn, SlideInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Markdown from 'react-native-markdown-display';

// Import services
import { useTurnkeyAuth } from '../providers/TurnkeyAuthProvider';
import { turnkeySolanaService, TurnkeyTokenBalance } from '../services/turnkey-solana-service';
import { intentApiService, IntentToken, QuoteResponse } from '../services/intent-api-service';
import { groqAIService, SwapIntent, PortfolioAnalysis } from '../services/groq-ai-service';

const { width } = Dimensions.get('window');

interface ChatMessage {
  id: string;
  type: 'user' | 'bot' | 'system' | 'portfolio';
  content: string;
  timestamp: Date;
  data?: any;
}

interface SwapState {
  step: 'idle' | 'selecting_from' | 'selecting_to' | 'entering_amount' | 'confirming' | 'executing';
  fromToken?: IntentToken;
  toToken?: IntentToken;
  amount?: string;
  quote?: QuoteResponse['quote'][0];
  userTokens?: TurnkeyTokenBalance[];
}

export function IntentScreen() {
  const { isAuthenticated, user } = useTurnkeyAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableTokens, setAvailableTokens] = useState<IntentToken[]>([]);
  const [userTokens, setUserTokens] = useState<TurnkeyTokenBalance[]>([]);
  const [swapState, setSwapState] = useState<SwapState>({ step: 'idle' });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [portfolioAnalysis, setPortfolioAnalysis] = useState<PortfolioAnalysis | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (isAuthenticated && user) {
      initializeChat();
    }
  }, [isAuthenticated, user]);

  const initializeChat = async () => {
    try {
      setIsLoading(true);

      // Fetch available tokens and user portfolio
      const [tokensResponse, portfolioData] = await Promise.all([
        intentApiService.getTokens(),
        turnkeySolanaService.getPortfolioData(),
      ]);

      if (tokensResponse.success) {
        setAvailableTokens(tokensResponse.tokens);
      }

      if (portfolioData.wallets.length > 0) {
        setUserTokens(portfolioData.allTokenBalances);

        // Generate AI portfolio analysis
        try {
          const analysis = await groqAIService.analyzePortfolio(portfolioData.allTokenBalances);
          setPortfolioAnalysis(analysis);
        } catch (error) {
          console.log('Portfolio analysis failed:', error);
        }
      }

      // Generate smart suggestions
      const welcomeSuggestions = await groqAIService.generateSuggestions(
        portfolioData.allTokenBalances || [],
        tokensResponse.tokens || [],
        'welcome'
      );
      setSuggestions(welcomeSuggestions);

      // Add welcome message with portfolio summary
      const totalValue =
        portfolioData.allTokenBalances?.reduce((sum, token) => sum + (token.value || 0), 0) || 0;
      const tokenCount = portfolioData.allTokenBalances?.filter((t) => t.uiAmount > 0).length || 0;

      addBotMessage(
        `# 👋 Welcome to IntentFI!

I'm your **AI-powered DeFi assistant** for Solana.

## 💰 Portfolio Summary
- **Total Value:** ${totalValue.toFixed(2)}
- **Active Tokens:** ${tokenCount}
- **Network:** Solana Mainnet

## 🚀 What I Can Do
- **Token Swaps** with real-time quotes
- **Portfolio Analysis** and insights
- **Personalized Recommendations**
- **Natural Language** processing

*What would you like to do?*`
      );
    } catch (error) {
      console.error('❌ Failed to initialize chat:', error);
      addBotMessage('❌ Sorry, I had trouble loading. Please try refreshing the screen.');
    } finally {
      setIsLoading(false);
    }
  };

  const addMessage = (message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);

    // Auto-scroll to bottom
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const addBotMessage = (content: string, data?: any) => {
    addMessage({ type: 'bot', content, data });
  };

  const addUserMessage = (content: string) => {
    addMessage({ type: 'user', content });
  };

  const addSystemMessage = (content: string) => {
    addMessage({ type: 'system', content });
  };

  const addPortfolioMessage = (content: string, data?: any) => {
    addMessage({ type: 'portfolio', content, data });
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userInput = inputText.trim();
    setInputText('');
    addUserMessage(userInput);

    await processUserInput(userInput);
  };

  const processUserInput = async (input: string) => {
    setIsLoading(true);

    try {
      // Use AI to parse user intent
      const intent = await groqAIService.parseSwapIntent(input, userTokens, availableTokens);

      // Update suggestions based on intent
      setSuggestions(intent.suggestions || []);

      switch (intent.action) {
        case 'swap':
          await handleAISwapIntent(intent);
          break;
        case 'portfolio':
          await handlePortfolioRequest();
          break;
        case 'help':
          await handleHelpRequest();
          break;
        default:
          if (swapState.step !== 'idle') {
            await handleSwapFlow(input);
          } else {
            await handleGeneralQuery(input);
          }
      }
    } catch (error) {
      console.error('❌ Error processing input:', error);
      addBotMessage('❌ Sorry, I encountered an error. Please try again.');

      // Generate error suggestions
      const errorSuggestions = await groqAIService.generateSuggestions(
        userTokens,
        availableTokens,
        'error'
      );
      setSuggestions(errorSuggestions);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAISwapIntent = async (intent: SwapIntent) => {
    if (intent.fromToken && intent.toToken && intent.amount) {
      // Complete swap instruction
      await startSwapWithTokens(intent.fromToken, intent.toToken, intent.amount.toString());
    } else if (intent.fromToken && intent.amount) {
      // Partial instruction - need to token
      await startSwapFlow(intent.fromToken, intent.amount.toString());
    } else if (intent.fromToken) {
      // Only from token specified
      await startSwapFlow(intent.fromToken);
    } else {
      // General swap request
      await startSwapFlow();
    }
  };

  const handlePortfolioRequest = async () => {
    if (userTokens.length === 0) {
      addBotMessage("❌ You don't have any tokens in your wallet. Please fund your wallet first.");
      return;
    }

    const totalValue = userTokens.reduce((sum, token) => sum + (token.value || 0), 0);
    const activeTokens = userTokens.filter((token) => token.uiAmount > 0);

    // Create portfolio summary
    const portfolioSummary = activeTokens
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .slice(0, 8) // Show top 8 tokens
      .map((token) => {
        const percentage = ((token.value || 0) / totalValue) * 100;
        return `• ${token.symbol}: ${token.uiAmount.toFixed(4)} (${percentage.toFixed(1)}% �� $${(token.value || 0).toFixed(2)})`;
      })
      .join('\n');

    addPortfolioMessage(
      `📊 **Your Portfolio Analysis**\n\n💰 **Total Value:** $${totalValue.toFixed(2)}\n🪙 **Active Tokens:** ${activeTokens.length}\n\n**Top Holdings:**\n${portfolioSummary}`,
      { portfolioAnalysis, totalValue, activeTokens }
    );

    // Add AI insights if available
    if (portfolioAnalysis) {
      addBotMessage(
        `🤖 **AI Insights:**\n\n${portfolioAnalysis.recommendations
          .slice(0, 3)
          .map((rec) => `• ${rec}`)
          .join('\n')}\n\n📈 **Risk Level:** ${portfolioAnalysis.riskLevel.toUpperCase()}`
      );
    }

    // Generate portfolio-specific suggestions
    const portfolioSuggestions = await groqAIService.generateSuggestions(
      userTokens,
      availableTokens,
      'portfolio'
    );
    setSuggestions(portfolioSuggestions);
  };

  const handleHelpRequest = async () => {
    addBotMessage(
      `# 🤖 I'm here to help!

Here's what I can do for you:

## 🔄 Token Swaps
- *"Swap 1 SOL to USDC"*
- *"Exchange 100 MELANIA for SOL"*
- *"Trade my BONK for USDC"*

## 📊 Portfolio Analysis
- *"Show my portfolio"*
- *"Analyze my holdings"*
- *"Check my balances"*

## 💡 Smart Features
- **Natural language processing**
- **Real-time quotes**
- **Portfolio insights**
- **Risk analysis**

Just tell me what you want to do in **plain English**!`
    );
  };

  const handleGeneralQuery = async (input: string) => {
    const lowerInput = input.toLowerCase();

    if (lowerInput.includes('balance') || lowerInput.includes('token')) {
      await handlePortfolioRequest();
    } else if (lowerInput.includes('price') || lowerInput.includes('value')) {
      addBotMessage(
        '💰 I can help you check token prices through swaps! Try asking "What can I get for 1 SOL?" or start a swap to see current rates.'
      );
    } else {
      addBotMessage(
        `🤔 I'm not sure what you're looking for. Here are some things you can try:\n\n• "Swap [amount] [token] to [token]"\n• "Show my portfolio"\n• "What tokens can I swap?"\n• "Help me trade tokens"\n\nWhat would you like to do?`
      );
    }
  };

  const startSwapWithTokens = async (fromSymbol: string, toSymbol: string, amount: string) => {
    // Find tokens
    const fromToken = findToken(fromSymbol);
    const toToken = findToken(toSymbol);

    if (!fromToken) {
      addBotMessage(
        `❌ I couldn't find the token "${fromSymbol}". Let me show you your available tokens:`
      );
      showUserTokens();
      return;
    }

    if (!toToken) {
      addBotMessage(
        `❌ I couldn't find the token "${toSymbol}". Here are the tokens you can swap to:`
      );
      showAvailableTokens('to');
      return;
    }

    // Validate user balance
    const userBalance = getUserTokenBalance(fromToken.symbol);
    const requiredAmount = parseFloat(amount);

    if (!userBalance || userBalance.uiAmount < requiredAmount) {
      addBotMessage(
        `❌ **Insufficient Balance**\n\nYou need ${amount} ${fromSymbol} but you only have ${userBalance ? userBalance.uiAmount.toFixed(4) : '0'} ${fromSymbol}.\n\n💡 Try a smaller amount or choose a different token.`
      );

      // Show available balance for this token
      if (userBalance) {
        const maxAmount = (userBalance.uiAmount * 0.95).toFixed(4); // Leave 5% buffer
        setSuggestions([
          `Swap ${maxAmount} ${fromSymbol} to ${toSymbol}`,
          'Show my available tokens',
          'Check my portfolio',
          'Help me swap tokens',
        ]);
      }
      return;
    }

    // Get quote and confirm
    await getQuoteAndConfirm(fromToken, toToken, amount);
  };

  const startSwapFlow = async (fromSymbol?: string, amount?: string) => {
    if (fromSymbol) {
      const fromToken = findToken(fromSymbol);
      if (fromToken) {
        setSwapState({ step: 'selecting_to', fromToken, amount });
        addBotMessage(
          `✅ Great! You want to swap ${amount || 'some'} ${fromSymbol}.\n\nWhat token would you like to receive?`
        );
        showAvailableTokens('to');
      } else {
        addBotMessage(`❌ I couldn't find "${fromSymbol}". Here are your available tokens:`);
        showUserTokens();
      }
    } else {
      setSwapState({ step: 'selecting_from' });
      addBotMessage("🚀 Let's start a swap! Which token would you like to swap FROM?");
      showUserTokens();
    }
  };

  const handleSwapFlow = async (input: string) => {
    const { step } = swapState;

    switch (step) {
      case 'selecting_from':
        await handleFromTokenSelection(input);
        break;
      case 'selecting_to':
        await handleToTokenSelection(input);
        break;
      case 'entering_amount':
        await handleAmountEntry(input);
        break;
      case 'confirming':
        await handleConfirmation(input);
        break;
    }
  };

  const handleFromTokenSelection = async (input: string) => {
    const token = findToken(input.toUpperCase());
    if (!token) {
      addBotMessage(`❌ I couldn't find "${input}". Please choose from your available tokens:`);
      showUserTokens();
      return;
    }

    const userBalance = getUserTokenBalance(token.symbol);
    if (!userBalance || userBalance.uiAmount === 0) {
      addBotMessage(`❌ You don't have any ${token.symbol}. Please choose a token you own:`);
      showUserTokens();
      return;
    }

    setSwapState((prev) => ({ ...prev, step: 'selecting_to', fromToken: token }));
    addBotMessage(`✅ Selected ${token.symbol}! What token would you like to receive?`);
    showAvailableTokens('to');
  };

  const handleToTokenSelection = async (input: string) => {
    const token = findToken(input.toUpperCase());
    if (!token) {
      addBotMessage(`❌ I couldn't find "${input}". Please choose from available tokens:`);
      showAvailableTokens('to');
      return;
    }

    if (token.symbol === swapState.fromToken?.symbol) {
      addBotMessage(
        `❌ You can't swap ${token.symbol} for the same token. Please choose a different token:`
      );
      showAvailableTokens('to');
      return;
    }

    setSwapState((prev) => ({ ...prev, step: 'entering_amount', toToken: token }));

    const userBalance = getUserTokenBalance(swapState.fromToken!.symbol);
    const maxAmount = (userBalance!.uiAmount * 0.95).toFixed(4);

    addBotMessage(
      `✅ Perfect! ${swapState.fromToken!.symbol} → ${token.symbol}\n\n💰 Available: ${userBalance?.uiAmount.toFixed(4)} ${swapState.fromToken!.symbol}\n\nHow much ${swapState.fromToken!.symbol} would you like to swap?`
    );

    // Set amount suggestions
    setSuggestions([
      `${maxAmount}`,
      `${(userBalance!.uiAmount * 0.5).toFixed(4)}`,
      `${(userBalance!.uiAmount * 0.25).toFixed(4)}`,
      '1',
    ]);
  };

  const handleAmountEntry = async (input: string) => {
    const amount = parseFloat(input);

    if (isNaN(amount) || amount <= 0) {
      addBotMessage(`❌ Please enter a valid amount (e.g., "1.5" or "100")`);
      return;
    }

    const userBalance = getUserTokenBalance(swapState.fromToken!.symbol);
    if (!userBalance || userBalance.uiAmount < amount) {
      addBotMessage(
        `❌ Insufficient balance! You only have ${userBalance?.uiAmount.toFixed(4)} ${swapState.fromToken!.symbol}.\n\nPlease enter a smaller amount:`
      );
      return;
    }

    await getQuoteAndConfirm(swapState.fromToken!, swapState.toToken!, input);
  };

  const getQuoteAndConfirm = async (
    fromToken: IntentToken,
    toToken: IntentToken,
    amount: string
  ) => {
    try {
      addBotMessage(
        `🔄 **Getting Quote**\n\nFinding the best rate for ${amount} ${fromToken.symbol} → ${toToken.symbol}...`
      );

      const userOrgId = intentApiService.getUserOrganizationId();
      if (!userOrgId) {
        addBotMessage('❌ Authentication error. Please log in again.');
        return;
      }

      // Convert amount to base units
      const amountInBaseUnits = (parseFloat(amount) * Math.pow(10, fromToken.decimals)).toString();

      const quoteRequest = {
        amountIn: amountInBaseUnits,
        fromToken: fromToken.contract,
        toToken:
          toToken.contract === '0x0000000000000000000000000000000000000000'
            ? '0x0000000000000000000000000000000000000000'
            : toToken.contract,
        fromChain: 'solana',
        toChain: 'solana',
        slippageBps: 100, // 1% slippage
        userOrganizationId: userOrgId,
      };

      const quoteResponse = await intentApiService.getQuote(quoteRequest);

      if (!quoteResponse.success || !quoteResponse.quote.length) {
        addBotMessage(
          '❌ Unable to get a quote for this swap. Please try different tokens or amounts.'
        );
        return;
      }

      const quote = quoteResponse.quote[0];

      setSwapState((prev) => ({
        ...prev,
        step: 'confirming',
        amount,
        quote,
        fromToken,
        toToken,
      }));

      const priceImpact = quote.priceImpact > 0 ? ` (${quote.priceImpact.toFixed(2)}% impact)` : '';
      const rate = quote.price.toFixed(6);

      addBotMessage(
        `✅ **Quote Ready!**\n\n📊 **Swap Details:**\n• From: ${amount} ${fromToken.symbol}\n• To: ~${quote.expectedAmountOut.toFixed(6)} ${toToken.symbol}\n• Rate: 1 ${fromToken.symbol} = ${rate} ${toToken.symbol}${priceImpact}\n• Route: ${quote.meta.title}\n• ETA: ${quote.clientEta}\n\n🚀 **Ready to execute this swap?**`,
        { quote, fromToken, toToken, amount }
      );

      // Set confirmation suggestions
      setSuggestions(['Yes, execute swap', 'No, cancel', 'Get new quote', 'Change amount']);
    } catch (error) {
      console.error('❌ Failed to get quote:', error);
      addBotMessage('❌ Failed to get quote. Please try again.');
    }
  };

  const handleConfirmation = async (input: string) => {
    const lowerInput = input.toLowerCase();

    if (
      lowerInput.includes('yes') ||
      lowerInput.includes('confirm') ||
      lowerInput.includes('execute') ||
      lowerInput.includes('swap')
    ) {
      await executeSwap();
    } else if (lowerInput.includes('no') || lowerInput.includes('cancel')) {
      setSwapState({ step: 'idle' });
      addBotMessage('❌ Swap cancelled. What else can I help you with?');

      // Generate post-cancel suggestions
      const suggestions = await groqAIService.generateSuggestions(
        userTokens,
        availableTokens,
        'welcome'
      );
      setSuggestions(suggestions);
    } else {
      addBotMessage('Please type "yes" to confirm the swap or "no" to cancel.');
    }
  };

  const executeSwap = async () => {
    try {
      setSwapState((prev) => ({ ...prev, step: 'executing' }));
      addBotMessage('🚀 **Executing Swap**\n\nProcessing your transaction...');

      const userOrgId = intentApiService.getUserOrganizationId();
      const portfolioData = await turnkeySolanaService.getPortfolioData();

      if (!userOrgId || !portfolioData.wallets.length) {
        addBotMessage('❌ Authentication or wallet error. Please try again.');
        return;
      }

      const userAddress = portfolioData.wallets[0].address;

      const swapRequest = {
        quote: swapState.quote!,
        originAddress: userAddress,
        destinationAddress: userAddress,
        userOrganizationId: userOrgId,
      };

      const swapResponse = await intentApiService.executeSwap(swapRequest);

      if (swapResponse.success && swapResponse.result.success) {
        addBotMessage(
          `🎉 **Swap Successful!**\n\n✅ **Transaction:** ${swapResponse.result.signature.slice(0, 8)}...${swapResponse.result.signature.slice(-8)}\n\n🔍 Track on Solscan\n💫 Tokens will arrive shortly!`,
          {
            signature: swapResponse.result.signature,
            explorerUrl: swapResponse.result.explorerUrl,
          }
        );

        // Reset state
        setSwapState({ step: 'idle' });

        // Generate post-swap suggestions
        const afterSwapSuggestions = await groqAIService.generateSuggestions(
          userTokens,
          availableTokens,
          'after_swap'
        );
        setSuggestions(afterSwapSuggestions);

        // Refresh user tokens
        setTimeout(async () => {
          try {
            const newPortfolioData = await turnkeySolanaService.getPortfolioData();
            setUserTokens(newPortfolioData.allTokenBalances);
            addSystemMessage('💫 Portfolio refreshed with latest balances');
          } catch (error) {
            console.log('Failed to refresh portfolio:', error);
          }
        }, 3000);
      } else {
        addBotMessage('❌ Swap failed. Please try again or contact support.');
        setSwapState({ step: 'idle' });
      }
    } catch (error) {
      console.error('❌ Failed to execute swap:', error);
      addBotMessage('❌ Failed to execute swap. Please try again.');
      setSwapState({ step: 'idle' });
    }
  };

  const findToken = (symbol: string): IntentToken | undefined => {
    // Check available tokens first
    const token = availableTokens.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
    if (token) return token;

    // Check for SOL
    if (symbol.toUpperCase() === 'SOL') {
      return intentApiService.getSolToken() as IntentToken;
    }

    return undefined;
  };

  const getUserTokenBalance = (symbol: string): TurnkeyTokenBalance | undefined => {
    return userTokens.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
  };

  const showUserTokens = () => {
    if (userTokens.length === 0) {
      addBotMessage("❌ You don't have any tokens in your wallet. Please fund your wallet first.");
      return;
    }

    const activeTokens = userTokens.filter((token) => token.uiAmount > 0);

    if (activeTokens.length === 0) {
      addBotMessage(
        "❌ You don't have any tokens with positive balances. Please fund your wallet first."
      );
      return;
    }

    const tokenList = activeTokens
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .slice(0, 8) // Show top 8 tokens
      .map(
        (token) =>
          `• ${token.symbol}: ${token.uiAmount.toFixed(4)} (≈$${(token.value || 0).toFixed(2)})`
      )
      .join('\n');

    addBotMessage(
      `💰 **Your Available Tokens:**\n\n${tokenList}\n\n💡 Just type the symbol (e.g., "SOL" or "USDC")`
    );

    // Set token suggestions
    setSuggestions(activeTokens.slice(0, 4).map((token) => token.symbol));
  };

  const showAvailableTokens = (type: 'from' | 'to') => {
    const popularTokens = ['USDC', 'MELANIA', 'BONK', 'WIF', 'POPCAT', 'FIDA', 'RAY', 'ORCA'];
    const availablePopular = popularTokens.filter((symbol) =>
      availableTokens.some((token) => token.symbol === symbol)
    );

    const tokenList = availablePopular
      .map((symbol) => {
        const token = availableTokens.find((t) => t.symbol === symbol);
        return `• ${symbol}: ${token?.name || symbol}`;
      })
      .join('\n');

    addBotMessage(
      `🪙 **Popular Tokens ${type === 'to' ? 'to Receive' : 'to Swap'}:**\n\n${tokenList}\n• SOL: Solana\n\n💡 Just type the symbol (e.g., "MELANIA" or "SOL")`
    );

    // Set token suggestions
    setSuggestions([...availablePopular.slice(0, 4), 'SOL']);
  };

  const handleQuickAction = async (action: string) => {
    setInputText(action);
    await handleSendMessage();
  };

  // Markdown styles for different message types
  const getMarkdownStyles = (messageType: string) => {
    const baseStyles = {
      body: {
        color:
          messageType === 'user'
            ? '#FFFFFF'
            : messageType === 'system'
              ? '#D1D5DB'
              : messageType === 'portfolio'
                ? '#D1FAE5'
                : '#FFFFFF',
        fontSize: 16,
        lineHeight: 22,
      },
      heading1: {
        color:
          messageType === 'user' ? '#FFFFFF' : messageType === 'portfolio' ? '#10B981' : '#3B82F6',
        fontSize: 20,
        fontWeight: 'bold' as 'bold',
        marginBottom: 8,
      },
      heading2: {
        color:
          messageType === 'user' ? '#FFFFFF' : messageType === 'portfolio' ? '#10B981' : '#3B82F6',
        fontSize: 18,
        fontWeight: 'bold' as 'bold',
        marginBottom: 6,
      },
      heading3: {
        color:
          messageType === 'user' ? '#FFFFFF' : messageType === 'portfolio' ? '#10B981' : '#3B82F6',
        fontSize: 16,
        fontWeight: 'bold' as 'bold',
        marginBottom: 4,
      },
      strong: {
        color:
          messageType === 'user' ? '#FFFFFF' : messageType === 'portfolio' ? '#10B981' : '#3B82F6',
        fontWeight: 'bold' as 'bold',
      },
      em: {
        fontStyle: 'italic' as 'italic',
        color:
          messageType === 'user' ? '#E5E7EB' : messageType === 'portfolio' ? '#A7F3D0' : '#E5E7EB',
      },
      code_inline: {
        backgroundColor:
          messageType === 'user'
            ? 'rgba(255,255,255,0.1)'
            : messageType === 'portfolio'
              ? 'rgba(16,185,129,0.1)'
              : 'rgba(59,130,246,0.1)',
        color:
          messageType === 'user' ? '#FFFFFF' : messageType === 'portfolio' ? '#10B981' : '#3B82F6',
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        fontSize: 14,
        fontFamily: 'monospace',
      },
      code_block: {
        backgroundColor:
          messageType === 'user'
            ? 'rgba(255,255,255,0.05)'
            : messageType === 'portfolio'
              ? 'rgba(16,185,129,0.05)'
              : 'rgba(59,130,246,0.05)',
        padding: 12,
        borderRadius: 8,
        marginVertical: 8,
      },
      fence: {
        backgroundColor:
          messageType === 'user'
            ? 'rgba(255,255,255,0.05)'
            : messageType === 'portfolio'
              ? 'rgba(16,185,129,0.05)'
              : 'rgba(59,130,246,0.05)',
        padding: 12,
        borderRadius: 8,
        marginVertical: 8,
      },
      list_item: {
        marginBottom: 4,
      },
      bullet_list: {
        marginVertical: 8,
      },
      ordered_list: {
        marginVertical: 8,
      },
      paragraph: {
        marginBottom: 8,
        lineHeight: 22,
      },
      link: {
        color: messageType === 'portfolio' ? '#10B981' : '#3B82F6',
        textDecorationLine: 'underline' as 'underline',
      },
      blockquote: {
        backgroundColor:
          messageType === 'user'
            ? 'rgba(255,255,255,0.05)'
            : messageType === 'portfolio'
              ? 'rgba(16,185,129,0.05)'
              : 'rgba(59,130,246,0.05)',
        borderLeftWidth: 4,
        borderLeftColor: messageType === 'portfolio' ? '#10B981' : '#3B82F6',
        paddingLeft: 12,
        paddingVertical: 8,
        marginVertical: 8,
      },
    };

    return baseStyles;
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.type === 'user';
    const isSystem = message.type === 'system';
    const isPortfolio = message.type === 'portfolio';

    return (
      <Animated.View
        key={message.id}
        entering={FadeInLeft.duration(300)}
        className={`mb-4 flex-row ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && !isSystem && (
          <View
            className={`mr-3 h-8 w-8 items-center justify-center rounded-full ${
              isPortfolio ? 'bg-green-500' : 'bg-primary'
            }`}>
            <Ionicons name={isPortfolio ? 'pie-chart' : 'flash'} size={16} color="white" />
          </View>
        )}

        <View
          className={`max-w-[85%] rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-primary'
              : isSystem
                ? 'border border-gray-500 bg-gray-600/50'
                : isPortfolio
                  ? 'border border-green-500/30 bg-green-500/10'
                  : 'border border-dark-border bg-dark-card'
          }`}>
          {/* Render message content with Markdown */}
          {isUser ? (
            <Text className="text-white">{message.content}</Text>
          ) : (
            <Markdown
              style={getMarkdownStyles(message.type)}
              onLinkPress={(url) => {
                Linking.openURL(url);
                return true;
              }}>
              {message.content}
            </Markdown>
          )}

          {/* Special rendering for quotes and transactions */}
          {message.data?.signature && (
            <TouchableOpacity
              onPress={() => {
                if (message.data.explorerUrl) {
                  Linking.openURL(message.data.explorerUrl);
                }
              }}
              className="mt-3 rounded-lg bg-primary/20 p-3">
              <Text className="text-center font-medium text-primary">View on Solscan 🔍</Text>
            </TouchableOpacity>
          )}

          {/* Enhanced data visualization for portfolio and quotes */}
          {message.data?.quote && (
            <View className="mt-3 rounded-lg bg-primary/10 p-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-gray-300">Expected Output</Text>
                <Text className="font-bold text-primary">
                  {message.data.quote.expectedAmountOut.toFixed(6)} {message.data.toToken?.symbol}
                </Text>
              </View>
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-sm text-gray-300">Price Impact</Text>
                <Text
                  className={`font-medium ${message.data.quote.priceImpact > 5 ? 'text-red-400' : 'text-green-400'}`}>
                  {message.data.quote.priceImpact.toFixed(2)}%
                </Text>
              </View>
            </View>
          )}

          {message.data?.portfolioAnalysis && (
            <View className="mt-3 rounded-lg bg-green-500/10 p-3">
              <Text className="mb-2 font-bold text-green-400">📊 Quick Stats</Text>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-green-200">Risk Level</Text>
                <Text
                  className={`font-medium ${
                    message.data.portfolioAnalysis.riskLevel === 'high'
                      ? 'text-red-400'
                      : message.data.portfolioAnalysis.riskLevel === 'medium'
                        ? 'text-yellow-400'
                        : 'text-green-400'
                  }`}>
                  {message.data.portfolioAnalysis.riskLevel.toUpperCase()}
                </Text>
              </View>
              <View className="mt-1 flex-row items-center justify-between">
                <Text className="text-sm text-green-200">Holdings</Text>
                <Text className="font-medium text-green-400">
                  {message.data.portfolioAnalysis.topHoldings?.length || 0} tokens
                </Text>
              </View>
            </View>
          )}

          <Text
            className={`mt-2 text-xs ${
              isUser ? 'text-white/70' : isPortfolio ? 'text-green-300/70' : 'text-gray-500'
            }`}>
            {message.timestamp.toLocaleTimeString()}
          </Text>
        </View>

        {isUser && (
          <View className="ml-3 h-8 w-8 items-center justify-center rounded-full bg-gray-600">
            <Ionicons name="person" size={16} color="white" />
          </View>
        )}
      </Animated.View>
    );
  };

  if (!isAuthenticated || !user) {
    return (
      <SafeAreaView className="flex-1 bg-dark-bg">
        <View className="flex-1 items-center justify-center p-6">
          <Ionicons name="lock-closed" size={48} color="#8E8E93" />
          <Text className="mt-4 text-lg text-white">Authentication Required</Text>
          <Text className="mt-2 text-center text-sm text-gray-400">
            Please log in to use the Intent Chat
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-dark-bg">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <Animated.View
          entering={FadeInUp.duration(600)}
          className="flex-row items-center justify-between border-b border-dark-border p-4">
          <View>
            <Text className="text-2xl font-bold text-white">Intent Chat</Text>
            <Text className="text-sm text-gray-400">🤖 AI-powered DeFi assistant • Solana</Text>
          </View>
          <View className="flex-row space-x-2">
            <TouchableOpacity
              onPress={() => handleQuickAction('Show my portfolio')}
              className="p-2">
              <Ionicons name="pie-chart" size={24} color="#8E8E93" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setMessages([]);
                setSwapState({ step: 'idle' });
                initializeChat();
              }}
              className="p-2">
              <Ionicons name="refresh" size={24} color="#8E8E93" />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Chat Messages */}
        <ScrollView
          ref={scrollViewRef}
          className="flex-1 px-4 py-4"
          showsVerticalScrollIndicator={false}>
          {messages.map(renderMessage)}

          {isLoading && (
            <Animated.View
              entering={BounceIn.duration(600)}
              className="mb-4 flex-row justify-start">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-primary">
                <Ionicons name="flash" size={16} color="white" />
              </View>
              <View className="rounded-2xl border border-dark-border bg-dark-card px-4 py-3">
                <Text className="text-gray-400">AI is thinking...</Text>
              </View>
            </Animated.View>
          )}
        </ScrollView>

        {/* Smart Suggestions */}
        {suggestions.length > 0 && swapState.step === 'idle' && (
          <Animated.View entering={SlideInRight.duration(400)} className="px-4 py-2">
            <Text className="mb-2 text-xs font-medium text-gray-400">💡 SUGGESTIONS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row space-x-2">
                {suggestions.map((suggestion, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => handleQuickAction(suggestion)}
                    className="rounded-full bg-primary/20 px-3 py-2">
                    <Text className="text-sm font-medium text-primary">{suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </Animated.View>
        )}

        {/* Input Area */}
        <Animated.View
          entering={FadeInUp.duration(600).delay(200)}
          className="flex-row items-center border-t border-dark-border p-4">
          <View className="flex-1 flex-row items-center rounded-2xl border border-dark-border bg-dark-card px-4 py-3">
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder={
                swapState.step === 'selecting_from'
                  ? 'Type token symbol (e.g., SOL)...'
                  : swapState.step === 'selecting_to'
                    ? 'Type token to receive...'
                    : swapState.step === 'entering_amount'
                      ? 'Enter amount...'
                      : swapState.step === 'confirming'
                        ? 'Type "yes" to confirm...'
                        : 'Ask me anything about your tokens...'
              }
              placeholderTextColor="#8E8E93"
              className="flex-1 text-white"
              multiline={false}
              onSubmitEditing={handleSendMessage}
              editable={!isLoading}
            />
          </View>

          <TouchableOpacity
            onPress={handleSendMessage}
            disabled={!inputText.trim() || isLoading}
            className={`ml-3 h-12 w-12 items-center justify-center rounded-full ${
              inputText.trim() && !isLoading ? 'bg-primary' : 'bg-gray-600'
            }`}>
            <Ionicons name={isLoading ? 'hourglass' : 'send'} size={20} color="white" />
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
