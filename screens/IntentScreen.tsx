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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInLeft, BounceIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

// Import services
import { useTurnkeyAuth } from '../providers/TurnkeyAuthProvider';
import { turnkeySolanaService, TurnkeyTokenBalance } from '../services/turnkey-solana-service';
import { intentApiService, IntentToken, QuoteResponse } from '../services/intent-api-service';

interface ChatMessage {
  id: string;
  type: 'user' | 'bot' | 'system';
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
      }

      // Add welcome message
      addBotMessage(
        `👋 Welcome to IntentFI! I'm here to help you swap tokens on Solana.\n\n💡 Just tell me what you want to do, like:\n• "Swap 1 SOL to USDC"\n• "Exchange MELANIA for SOL"\n• "I want to swap tokens"\n\nWhat would you like to do today?`
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
      const lowerInput = input.toLowerCase();

      // Check for swap intent
      if (
        lowerInput.includes('swap') ||
        lowerInput.includes('exchange') ||
        lowerInput.includes('trade')
      ) {
        await handleSwapIntent(input);
      } else if (swapState.step !== 'idle') {
        await handleSwapFlow(input);
      } else {
        // General help
        addBotMessage(
          `I can help you swap tokens! Here are some things you can say:\n\n• "Swap 1 SOL to USDC"\n• "Exchange 100 MELANIA for SOL"\n• "I want to swap tokens"\n\nTry one of these or tell me what tokens you'd like to swap!`
        );
      }
    } catch (error) {
      console.error('❌ Error processing input:', error);
      addBotMessage('❌ Sorry, I encountered an error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwapIntent = async (input: string) => {
    // Parse swap intent from natural language
    const swapPattern = /swap|exchange|trade/i;
    const amountPattern = /(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/gi;
    const toPattern = /(?:to|for|into)\s+([a-zA-Z]+)/i;

    if (!swapPattern.test(input)) {
      addBotMessage('I can help you swap tokens! What would you like to swap?');
      return;
    }

    // Try to extract amount and tokens
    const matches = [...input.matchAll(amountPattern)];
    const toMatch = input.match(toPattern);

    if (matches.length > 0) {
      const amount = matches[0][1];
      const fromSymbol = matches[0][2].toUpperCase();
      const toSymbol = toMatch ? toMatch[1].toUpperCase() : null;

      if (toSymbol) {
        // Complete swap instruction
        await startSwapWithTokens(fromSymbol, toSymbol, amount);
      } else {
        // Partial instruction
        await startSwapFlow(fromSymbol, amount);
      }
    } else {
      // No specific tokens mentioned
      await startSwapFlow();
    }
  };

  const startSwapWithTokens = async (fromSymbol: string, toSymbol: string, amount: string) => {
    // Find tokens
    const fromToken = findToken(fromSymbol);
    const toToken = findToken(toSymbol);

    if (!fromToken) {
      addBotMessage(
        `❌ I couldn't find the token "${fromSymbol}". Let me show you available tokens:`
      );
      showAvailableTokens('from');
      return;
    }

    if (!toToken) {
      addBotMessage(
        `❌ I couldn't find the token "${toSymbol}". Let me show you available tokens:`
      );
      showAvailableTokens('to');
      return;
    }

    // Validate user balance
    const userBalance = getUserTokenBalance(fromToken.symbol);
    const requiredAmount = parseFloat(amount);

    if (!userBalance || userBalance.uiAmount < requiredAmount) {
      addBotMessage(
        `❌ Insufficient balance!\n\nYou need ${amount} ${fromSymbol} but you only have ${userBalance ? userBalance.uiAmount.toFixed(4) : '0'} ${fromSymbol}.\n\nPlease enter a smaller amount or choose a different token.`
      );
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
          `Great! You want to swap ${amount || 'some'} ${fromSymbol}. What token would you like to receive?`
        );
        showAvailableTokens('to');
      } else {
        addBotMessage(`❌ I couldn't find "${fromSymbol}". Let me show you your available tokens:`);
        showUserTokens();
      }
    } else {
      setSwapState({ step: 'selecting_from' });
      addBotMessage("Perfect! Let's start a swap. Which token would you like to swap FROM?");
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
    addBotMessage(`Great! You selected ${token.symbol}. What token would you like to receive?`);
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
    addBotMessage(
      `Perfect! You want to swap ${swapState.fromToken!.symbol} → ${token.symbol}\n\nYou have ${userBalance?.uiAmount.toFixed(4)} ${swapState.fromToken!.symbol} available.\n\nHow much ${swapState.fromToken!.symbol} would you like to swap?`
    );
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
        `🔄 Getting the best quote for ${amount} ${fromToken.symbol} → ${toToken.symbol}...`
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

      const priceImpact =
        quote.priceImpact > 0 ? ` (${quote.priceImpact.toFixed(2)}% price impact)` : '';

      addBotMessage(
        `✅ Quote received!\n\n📊 **Swap Details:**\n• From: ${amount} ${fromToken.symbol}\n• To: ~${quote.expectedAmountOut.toFixed(6)} ${toToken.symbol}\n• Rate: 1 ${fromToken.symbol} = ${quote.price.toFixed(6)} ${toToken.symbol}${priceImpact}\n• Route: ${quote.meta.title}\n• ETA: ${quote.clientEta}\n\n💡 This is the best available rate!\n\n**Ready to execute this swap?**`,
        { quote, fromToken, toToken, amount }
      );
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
    } else {
      addBotMessage('Please type "yes" to confirm the swap or "no" to cancel.');
    }
  };

  const executeSwap = async () => {
    try {
      setSwapState((prev) => ({ ...prev, step: 'executing' }));
      addBotMessage('🚀 Executing your swap...');

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
          `🎉 **Swap Executed Successfully!**\n\n✅ Transaction: ${swapResponse.result.signature.slice(0, 8)}...${swapResponse.result.signature.slice(-8)}\n\n🔍 You can track your transaction on Solscan.\n\n💡 Your tokens should arrive shortly!`,
          {
            signature: swapResponse.result.signature,
            explorerUrl: swapResponse.result.explorerUrl,
          }
        );

        // Reset state
        setSwapState({ step: 'idle' });

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

    const tokenList = userTokens
      .filter((token) => token.uiAmount > 0)
      .map(
        (token) =>
          `• ${token.symbol}: ${token.uiAmount.toFixed(4)} (≈$${(token.value || 0).toFixed(2)})`
      )
      .join('\n');

    addBotMessage(
      `💰 **Your Available Tokens:**\n\n${tokenList}\n\nJust type the symbol of the token you want to swap (e.g., "SOL" or "USDC")`
    );
  };

  const showAvailableTokens = (type: 'from' | 'to') => {
    const tokenList = availableTokens
      .slice(0, 10) // Show top 10
      .map((token) => `• ${token.symbol}: ${token.name}`)
      .join('\n');

    addBotMessage(
      `🪙 **Available Tokens ${type === 'to' ? 'to Receive' : 'to Swap'}:**\n\n${tokenList}\n• SOL: Solana\n\nJust type the symbol (e.g., "MELANIA" or "SOL")`
    );
  };

  const handleQuickAction = (action: string) => {
    setInputText(action);
    handleSendMessage();
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.type === 'user';
    const isSystem = message.type === 'system';

    return (
      <Animated.View
        key={message.id}
        entering={FadeInLeft.duration(300)}
        className={`mb-4 flex-row ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && !isSystem && (
          <View className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-primary">
            <Ionicons name="flash" size={16} color="white" />
          </View>
        )}

        <View
          className={`max-w-[80%] rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-primary'
              : isSystem
                ? 'border border-gray-500 bg-gray-600/50'
                : 'border border-dark-border bg-dark-card'
          }`}>
          <Text className={`${isUser ? 'text-white' : isSystem ? 'text-gray-300' : 'text-white'}`}>
            {message.content}
          </Text>

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

          <Text className={`mt-2 text-xs ${isUser ? 'text-white/70' : 'text-gray-500'}`}>
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
            <Text className="text-sm text-gray-400">
              💬 AI-powered token swaps • Solana Mainnet
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setMessages([]);
              setSwapState({ step: 'idle' });
              initializeChat();
            }}
            className="p-2">
            <Ionicons name="refresh" size={24} color="#8E8E93" />
          </TouchableOpacity>
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
                <Text className="text-gray-400">Thinking...</Text>
              </View>
            </Animated.View>
          )}
        </ScrollView>

        {/* Quick Actions */}
        {swapState.step === 'idle' && messages.length > 1 && (
          <Animated.View entering={FadeInUp.duration(400)} className="px-4 py-2">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row space-x-3">
                <TouchableOpacity
                  onPress={() => handleQuickAction('Swap SOL to USDC')}
                  className="rounded-full bg-primary/20 px-4 py-2">
                  <Text className="font-medium text-primary">Swap SOL to USDC</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleQuickAction('Show my tokens')}
                  className="rounded-full bg-primary/20 px-4 py-2">
                  <Text className="font-medium text-primary">Show my tokens</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleQuickAction('Swap MELANIA for SOL')}
                  className="rounded-full bg-primary/20 px-4 py-2">
                  <Text className="font-medium text-primary">Swap MELANIA</Text>
                </TouchableOpacity>
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
                        : 'Type your message...'
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
