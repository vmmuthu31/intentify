import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, SlideInRight, BounceIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { AnimatedButton } from './AnimatedButton';
import { useSolana } from '../providers/SolanaProvider';
import { calculateProtocolFee } from '../contracts/IntentExecutor';

interface Token {
  symbol: string;
  name: string;
  balance: string;
  price: string;
  rugScore: number;
  mint?: string;
  icon?: string;
}

interface IntentBuilderProps {
  intentType: 'swap' | 'buy' | 'lend' | 'launch';
  onClose: () => void;
  onCreateIntent: (intentData: any) => void;
}

export function IntentBuilder({ intentType, onClose, onCreateIntent }: IntentBuilderProps) {
  const { tokenBalances, executeSwapIntent, executeLendIntent, executeBuyIntent } = useSolana();
  const [fromToken, setFromToken] = useState<Token | null>(null);
  const [toToken, setToToken] = useState<Token | null>(null);
  const [amount, setAmount] = useState('');
  const [executing, setExecuting] = useState(false);
  const [conditions, setConditions] = useState({
    maxSlippage: '0.5',
    minPrice: '',
    maxPrice: '',
    timeLimit: '24h',
  });
  const [rugproofEnabled, setRugproofEnabled] = useState(true);

  // Convert tokenBalances to Token interface
  const availableTokens: Token[] = tokenBalances.map((token) => ({
    symbol: token.symbol,
    name: token.name ?? '',
    balance: token.uiAmount.toFixed(token.decimals || 6),
    price: `$${token.price?.toFixed(token.symbol === 'BONK' ? 6 : 2) || '0.00'}`,
    rugScore: token.symbol === 'SOL' ? 98 : token.symbol === 'USDC' ? 100 : 85,
    mint: token.mint,
  }));

  const getRugScoreColor = (score: number) => {
    if (score >= 90) return '#00D4AA';
    if (score >= 70) return '#FFB800';
    return '#FF4757';
  };

  const handleTokenSelect = (token: Token, type: 'from' | 'to') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (type === 'from') {
      setFromToken(token);
    } else {
      setToToken(token);
    }
  };

  const handleCreateIntent = async () => {
    // Prevent double execution
    if (executing) {
      console.log('⚠️ Intent creation already in progress, ignoring duplicate call');
      console.log('📍 Call stack trace:', new Error().stack);
      return;
    }

    if (!fromToken || !toToken || !amount) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    console.log('🚀 Starting intent creation process...');
    console.log('📝 Current token state:', {
      fromToken: fromToken.symbol,
      toToken: toToken.symbol,
      amount: numericAmount,
    });
    setExecuting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      let txId = '';
      const protocolFee = calculateProtocolFee(numericAmount);
      const netAmount = numericAmount - protocolFee;

      console.log(`🚀 Creating REAL ${intentType} intent with devnet contract:`);
      console.log(`📊 Amount: ${numericAmount} ${fromToken.symbol}`);
      console.log(`💰 Protocol Fee (0.3%): ${protocolFee} ${fromToken.symbol}`);
      console.log(`💎 Net Amount: ${netAmount} ${fromToken.symbol}`);

      if (intentType === 'swap') {
        // Convert slippage percentage to basis points (e.g., 0.5% = 50 basis points)
        const slippageBasisPoints = Math.floor(parseFloat(conditions.maxSlippage) * 100);

        console.log('📝 Executing swap intent with params:', {
          fromMint: fromToken.symbol,
          toMint: toToken.symbol,
          amount: numericAmount,
          maxSlippage: slippageBasisPoints,
          rugproofEnabled,
        });

        txId = await executeSwapIntent({
          fromMint: fromToken.symbol, // This will be converted to proper mint address in IntentExecutor
          toMint: toToken.symbol,
          amount: numericAmount,
          maxSlippage: slippageBasisPoints,
          rugproofEnabled,
        });

        console.log('✅ Swap intent execution completed with txId:', txId);

        if (txId === 'pending_signature' || txId === 'transaction_sent_to_phantom_for_signing') {
          Alert.alert(
            'Swap Intent Sent to Phantom! 🦄',
            `Your swap intent has been sent to Phantom for signing:\n\n` +
              `• ${netAmount.toFixed(4)} ${fromToken.symbol} → ${toToken.symbol}\n` +
              `• Protocol Fee: ${protocolFee.toFixed(4)} ${fromToken.symbol} (0.3%)\n` +
              `• Max Slippage: ${conditions.maxSlippage}%\n` +
              `• Rugproof: ${rugproofEnabled ? 'Enabled' : 'Disabled'}\n\n` +
              `Please check your Phantom wallet to sign the transaction.`,
            [{ text: 'Got it!', onPress: () => onClose() }]
          );
        } else {
          Alert.alert(
            'Swap Intent Created! 🎉',
            `Successfully created swap intent:\n\n` +
              `• ${netAmount.toFixed(4)} ${fromToken.symbol} → ${toToken.symbol}\n` +
              `• Protocol Fee: ${protocolFee.toFixed(4)} ${fromToken.symbol} (0.3%)\n` +
              `• Max Slippage: ${conditions.maxSlippage}%\n` +
              `• Rugproof: ${rugproofEnabled ? 'Enabled' : 'Disabled'}\n` +
              `• Transaction: ${txId?.slice(0, 8)}...`,
            [{ text: 'Great!', onPress: () => onClose() }]
          );
        }
      } else if (intentType === 'lend') {
        const minApy = 8.0; // Default minimum APY

        txId = await executeLendIntent({
          mint: fromToken.symbol,
          amount: numericAmount,
          minApy,
        });

        Alert.alert(
          'Lend Intent Created! 🏦',
          `Successfully created lending intent:\n\n` +
            `• ${netAmount.toFixed(4)} ${fromToken.symbol}\n` +
            `• Min APY: ${minApy}%\n` +
            `• Protocol Fee: ${protocolFee.toFixed(4)} ${fromToken.symbol} (0.3%)\n` +
            `• Transaction: ${txId.slice(0, 8)}...`,
          [{ text: 'Excellent!', onPress: () => onClose() }]
        );
      } else if (intentType === 'buy') {
        const usdcAmount = numericAmount; // Assuming amount is in USDC

        txId = await executeBuyIntent({
          mint: toToken.symbol,
          usdcAmount,
          maxPriceImpact: parseFloat(conditions.maxSlippage),
          rugproofCheck: rugproofEnabled,
        });

        Alert.alert(
          'Buy Intent Created! 💳',
          `Successfully created buy intent:\n\n` +
            `• Buy ${toToken.symbol} with $${netAmount.toFixed(2)}\n` +
            `• Protocol Fee: $${protocolFee.toFixed(2)} (0.3%)\n` +
            `• Rugproof: ${rugproofEnabled ? 'Enabled' : 'Disabled'}\n` +
            `• Transaction: ${txId.slice(0, 8)}...`,
          [{ text: 'Awesome!', onPress: () => onClose() }]
        );
      }

      // Call the callback with intent data
      console.log('Creating intent:', {
        type: intentType,
        fromToken,
        toToken,
        amount: numericAmount,
        conditions,
        rugproofEnabled,
        txId,
        createdAt: new Date().toISOString(),
      });

      onCreateIntent({
        type: intentType,
        fromToken,
        toToken,
        amount: numericAmount,
        conditions,
        rugproofEnabled,
        txId,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('❌ Intent execution failed:', errorMessage);

      Alert.alert('Intent Failed', `Failed to execute ${intentType} intent:\n\n${errorMessage}`, [
        { text: 'Try Again' },
      ]);
    } finally {
      setExecuting(false);
    }
  };

  const renderTokenSelector = (title: string, selectedToken: Token | null, type: 'from' | 'to') => (
    <Animated.View entering={FadeInUp.duration(400)} className="mb-6">
      <Text className="mb-3 text-base font-semibold text-white">{title}</Text>

      {selectedToken ? (
        <TouchableOpacity
          onPress={() => (type === 'from' ? setFromToken(null) : setToToken(null))}
          className="rounded-2xl border border-primary bg-dark-card p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 flex-row items-center">
              <View className="mr-3 h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                <Text className="text-sm font-bold text-primary">{selectedToken.symbol}</Text>
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-white">{selectedToken.symbol}</Text>
                <Text className="text-sm text-dark-gray">{selectedToken.name}</Text>
                <Text className="text-xs text-dark-gray">Balance: {selectedToken.balance}</Text>
              </View>
            </View>
            <View className="items-end">
              <Text className="font-semibold text-white">{selectedToken.price}</Text>
              <View className="mt-1 flex-row items-center">
                <View
                  className="mr-2 h-2 w-2 rounded-full"
                  style={{ backgroundColor: getRugScoreColor(selectedToken.rugScore) }}
                />
                <Text
                  className="text-xs"
                  style={{ color: getRugScoreColor(selectedToken.rugScore) }}>
                  {selectedToken.rugScore}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
          <View className="flex-row gap-3">
            {availableTokens.map((token, index) => (
              <Animated.View key={token.symbol} entering={BounceIn.duration(400).delay(index * 50)}>
                <TouchableOpacity
                  onPress={() => handleTokenSelect(token, type)}
                  className="min-w-[100px] rounded-2xl border border-dark-border bg-dark-card p-3">
                  <View className="items-center">
                    <View className="mb-2 h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                      <Text className="text-xs font-bold text-primary">{token.symbol}</Text>
                    </View>
                    <Text className="text-sm font-medium text-white">{token.symbol}</Text>
                    <Text className="text-xs text-dark-gray">{token.price}</Text>
                    <View className="mt-1 flex-row items-center">
                      <View
                        className="mr-1 h-1 w-1 rounded-full"
                        style={{ backgroundColor: getRugScoreColor(token.rugScore) }}
                      />
                      <Text className="text-xs" style={{ color: getRugScoreColor(token.rugScore) }}>
                        {token.rugScore}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </ScrollView>
      )}
    </Animated.View>
  );

  const estimatedOutput = () => {
    if (!amount || !fromToken || !toToken) return '0.00';

    const numericAmount = parseFloat(amount);
    const protocolFee = calculateProtocolFee(numericAmount);
    const netAmount = numericAmount - protocolFee;

    // Mock exchange rate calculation
    const fromPrice = parseFloat(fromToken.price.replace('$', ''));
    const toPrice = parseFloat(toToken.price.replace('$', ''));
    const estimatedTokens = (netAmount * fromPrice) / toPrice;

    return estimatedTokens.toFixed(6);
  };

  return (
    <SafeAreaView className="flex-1 bg-dark-bg">
      {/* Header */}
      <Animated.View
        entering={FadeInUp.duration(600)}
        className="flex-row items-center justify-between border-b border-dark-border p-4">
        <View>
          <Text className="text-xl font-bold text-white">
            Create {intentType.charAt(0).toUpperCase() + intentType.slice(1)} Intent
          </Text>
          <Text className="text-sm text-dark-gray">Execute with 0.3% protocol fee</Text>
        </View>
        <TouchableOpacity onPress={onClose} className="p-2">
          <Ionicons name="close" size={24} color="#8E8E93" />
        </TouchableOpacity>
      </Animated.View>

      <ScrollView className="flex-1 px-4 py-6" showsVerticalScrollIndicator={false}>
        {/* Token Selection */}
        {renderTokenSelector('From Token', fromToken, 'from')}

        {/* Swap Arrow */}
        {intentType === 'swap' && (
          <Animated.View entering={FadeInUp.duration(400)} className="mb-6 items-center">
            <TouchableOpacity
              onPress={() => {
                const temp = fromToken;
                setFromToken(toToken);
                setToToken(temp);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              className="rounded-full bg-primary/20 p-3">
              <Ionicons name="arrow-down" size={20} color="#FF4500" />
            </TouchableOpacity>
          </Animated.View>
        )}

        {(intentType === 'swap' || intentType === 'buy') &&
          renderTokenSelector('To Token', toToken, 'to')}

        {/* Amount Input */}
        <Animated.View entering={FadeInUp.duration(400)} className="mb-6">
          <Text className="mb-3 text-base font-semibold text-white">
            Amount {intentType === 'buy' ? '(USD)' : fromToken ? `(${fromToken.symbol})` : ''}
          </Text>
          <View className="rounded-2xl border border-dark-border bg-dark-card p-4">
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.0"
              placeholderTextColor="#8E8E93"
              className="text-xl font-semibold text-white"
              keyboardType="numeric"
            />
            {fromToken && (
              <Text className="mt-2 text-sm text-dark-gray">
                Available: {fromToken.balance} {fromToken.symbol}
              </Text>
            )}
          </View>
        </Animated.View>

        {/* Protocol Fee Display */}
        {amount && (
          <Animated.View entering={FadeInUp.duration(400)} className="mb-6">
            <View className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="font-semibold text-primary">Protocol Fee (0.3%)</Text>
                <Ionicons name="information-circle" size={16} color="#FF4500" />
              </View>
              <Text className="text-lg font-bold text-white">
                {calculateProtocolFee(parseFloat(amount) || 0).toFixed(6)}{' '}
                {fromToken?.symbol || 'tokens'}
              </Text>
              <Text className="mt-1 text-sm text-dark-gray">
                Net amount:{' '}
                {(
                  (parseFloat(amount) || 0) - calculateProtocolFee(parseFloat(amount) || 0)
                ).toFixed(6)}{' '}
                {fromToken?.symbol || 'tokens'}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Advanced Conditions */}
        <Animated.View entering={SlideInRight.duration(400)} className="mb-6">
          <Text className="mb-3 text-base font-semibold text-white">Conditions</Text>
          <View className="rounded-2xl border border-dark-border bg-dark-card p-4">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-dark-gray">Max Slippage</Text>
              <View className="flex-row items-center">
                <TextInput
                  value={conditions.maxSlippage}
                  onChangeText={(value) => setConditions({ ...conditions, maxSlippage: value })}
                  className="mr-2 text-right text-white"
                  keyboardType="numeric"
                />
                <Text className="text-dark-gray">%</Text>
              </View>
            </View>

            <View className="flex-row items-center justify-between">
              <Text className="text-dark-gray">Time Limit</Text>
              <Text className="text-white">{conditions.timeLimit}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Rugproof Protection */}
        <Animated.View entering={FadeInUp.duration(400)} className="mb-6">
          <View className="rounded-2xl border border-dark-border bg-dark-card p-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 flex-row items-center">
                <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-success/20">
                  <Ionicons name="shield-checkmark" size={20} color="#00D4AA" />
                </View>
                <View>
                  <Text className="font-semibold text-white">Rugproof Protection</Text>
                  <Text className="text-sm text-dark-gray">
                    Automatically scan tokens for safety
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setRugproofEnabled(!rugproofEnabled);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                className={`h-6 w-12 rounded-full ${rugproofEnabled ? 'bg-primary' : 'bg-dark-border'}`}>
                <View
                  className={`h-6 w-6 transform rounded-full bg-white ${rugproofEnabled ? 'translate-x-6' : 'translate-x-0'}`}
                />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {/* Estimated Output */}
        <Animated.View entering={FadeInUp.duration(400)} className="mb-8">
          <Text className="mb-3 text-base font-semibold text-white">Estimated Output</Text>
          <LinearGradient
            colors={['#1A1A1A', '#2A2A2A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="rounded-2xl border border-dark-border p-4">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-dark-gray">You will receive approximately</Text>
              <Ionicons name="information-circle-outline" size={16} color="#8E8E93" />
            </View>
            <Text className="text-2xl font-bold text-white">
              {estimatedOutput()} {toToken?.symbol || 'tokens'}
            </Text>
            <Text className="mt-1 text-sm text-dark-gray">
              Route via Jupiter Aggregator + 0.3% fee
            </Text>
          </LinearGradient>
        </Animated.View>
      </ScrollView>

      {/* Create Button */}
      <View className="border-t border-dark-border p-4">
        <AnimatedButton
          title={
            executing
              ? 'Executing...'
              : `Create ${intentType.charAt(0).toUpperCase() + intentType.slice(1)} Intent`
          }
          onPress={handleCreateIntent}
          variant="primary"
          size="large"
          disabled={executing}
          loading={executing}
        />
      </View>
    </SafeAreaView>
  );
}
