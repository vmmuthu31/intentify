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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeInUp,
  SlideInRight,
  BounceIn,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { AnimatedButton } from './AnimatedButton';

const { width } = Dimensions.get('window');

interface Token {
  symbol: string;
  name: string;
  balance: string;
  price: string;
  rugScore: number;
  icon?: string;
}

interface IntentBuilderProps {
  intentType: 'swap' | 'buy' | 'lend' | 'launch';
  onClose: () => void;
  onCreateIntent: (intentData: any) => void;
}

export function IntentBuilder({ intentType, onClose, onCreateIntent }: IntentBuilderProps) {
  const [fromToken, setFromToken] = useState<Token | null>(null);
  const [toToken, setToToken] = useState<Token | null>(null);
  const [amount, setAmount] = useState('');
  const [conditions, setConditions] = useState({
    maxSlippage: '0.5',
    minPrice: '',
    maxPrice: '',
    timeLimit: '24h',
  });
  const [rugproofEnabled, setRugproofEnabled] = useState(true);

  const popularTokens: Token[] = [
    { symbol: 'SOL', name: 'Solana', balance: '45.2', price: '$189.50', rugScore: 98 },
    { symbol: 'USDC', name: 'USD Coin', balance: '2,150.00', price: '$1.00', rugScore: 100 },
    { symbol: 'BONK', name: 'Bonk', balance: '1,250,000', price: '$0.0009', rugScore: 85 },
    { symbol: 'mSOL', name: 'Marinade SOL', balance: '8.7', price: '$189.91', rugScore: 96 },
    { symbol: 'RAY', name: 'Raydium', balance: '125.5', price: '$2.34', rugScore: 92 },
    { symbol: 'ORCA', name: 'Orca', balance: '67.8', price: '$3.45', rugScore: 94 },
  ];

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

  const handleCreateIntent = () => {
    if (!fromToken || !toToken || !amount) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    const intentData = {
      type: intentType,
      fromToken,
      toToken,
      amount,
      conditions,
      rugproofEnabled,
      createdAt: new Date().toISOString(),
    };

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onCreateIntent(intentData);
  };

  const renderTokenSelector = (title: string, selectedToken: Token | null, type: 'from' | 'to') => (
    <Animated.View entering={FadeInUp.duration(400)} className="mb-6">
      <Text className="mb-3 text-base font-semibold text-white">{title}</Text>

      {selectedToken ? (
        <TouchableOpacity
          onPress={() => (type === 'from' ? setFromToken(null) : setToToken(null))}
          className="bg-dark-card border-primary rounded-2xl border p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 flex-row items-center">
              <View className="bg-primary/20 mr-3 h-12 w-12 items-center justify-center rounded-full">
                <Text className="text-primary text-sm font-bold">{selectedToken.symbol}</Text>
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-white">{selectedToken.symbol}</Text>
                <Text className="text-dark-gray text-sm">{selectedToken.name}</Text>
                <Text className="text-dark-gray text-xs">Balance: {selectedToken.balance}</Text>
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
          <View className="flex-row space-x-3">
            {popularTokens.map((token, index) => (
              <Animated.View key={token.symbol} entering={BounceIn.duration(400).delay(index * 50)}>
                <TouchableOpacity
                  onPress={() => handleTokenSelect(token, type)}
                  className="bg-dark-card border-dark-border min-w-[100px] rounded-2xl border p-3">
                  <View className="items-center">
                    <View className="bg-primary/20 mb-2 h-10 w-10 items-center justify-center rounded-full">
                      <Text className="text-primary text-xs font-bold">{token.symbol}</Text>
                    </View>
                    <Text className="text-sm font-medium text-white">{token.symbol}</Text>
                    <Text className="text-dark-gray text-xs">{token.price}</Text>
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

  return (
    <SafeAreaView className="bg-dark-bg flex-1">
      {/* Header */}
      <Animated.View
        entering={FadeInUp.duration(600)}
        className="border-dark-border flex-row items-center justify-between border-b p-4">
        <View>
          <Text className="text-xl font-bold text-white">
            Create {intentType.charAt(0).toUpperCase() + intentType.slice(1)} Intent
          </Text>
          <Text className="text-dark-gray text-sm">Build your automated trading strategy</Text>
        </View>
        <TouchableOpacity onPress={onClose} className="p-2">
          <Ionicons name="close" size={24} color="#8E8E93" />
        </TouchableOpacity>
      </Animated.View>

      <ScrollView className="flex-1 px-4 py-6" showsVerticalScrollIndicator={false}>
        {/* Token Selection */}
        {renderTokenSelector('From Token', fromToken, 'from')}

        {/* Swap Arrow */}
        <Animated.View entering={FadeInUp.duration(400)} className="mb-6 items-center">
          <TouchableOpacity
            onPress={() => {
              const temp = fromToken;
              setFromToken(toToken);
              setToToken(temp);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            className="bg-primary/20 rounded-full p-3">
            <Ionicons name="arrow-down" size={20} color="#FF4500" />
          </TouchableOpacity>
        </Animated.View>

        {renderTokenSelector('To Token', toToken, 'to')}

        {/* Amount Input */}
        <Animated.View entering={FadeInUp.duration(400)} className="mb-6">
          <Text className="mb-3 text-base font-semibold text-white">Amount</Text>
          <View className="bg-dark-card border-dark-border rounded-2xl border p-4">
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.0"
              placeholderTextColor="#8E8E93"
              className="text-xl font-semibold text-white"
              keyboardType="numeric"
            />
            {fromToken && (
              <Text className="text-dark-gray mt-2 text-sm">
                Available: {fromToken.balance} {fromToken.symbol}
              </Text>
            )}
          </View>
        </Animated.View>

        {/* Advanced Conditions */}
        <Animated.View entering={SlideInRight.duration(400)} className="mb-6">
          <Text className="mb-3 text-base font-semibold text-white">Conditions</Text>
          <View className="bg-dark-card border-dark-border rounded-2xl border p-4">
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
          <View className="bg-dark-card border-dark-border rounded-2xl border p-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 flex-row items-center">
                <View className="bg-success/20 mr-3 h-10 w-10 items-center justify-center rounded-full">
                  <Ionicons name="shield-checkmark" size={20} color="#00D4AA" />
                </View>
                <View>
                  <Text className="font-semibold text-white">Rugproof Protection</Text>
                  <Text className="text-dark-gray text-sm">
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
            className="border-dark-border rounded-2xl border p-4">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-dark-gray">You&apos;ll receive approximately</Text>
              <Ionicons name="information-circle-outline" size={16} color="#8E8E93" />
            </View>
            <Text className="text-2xl font-bold text-white">
              {amount && toToken
                ? `~${(parseFloat(amount) * 189.5).toFixed(2)} ${toToken.symbol}`
                : '0.00'}
            </Text>
            <Text className="text-dark-gray mt-1 text-sm">Best route via Jupiter Aggregator</Text>
          </LinearGradient>
        </Animated.View>
      </ScrollView>

      {/* Create Button */}
      <View className="border-dark-border border-t p-4">
        <AnimatedButton
          title={`Create ${intentType.charAt(0).toUpperCase() + intentType.slice(1)} Intent`}
          onPress={handleCreateIntent}
          variant="primary"
          size="large"
        />
      </View>
    </SafeAreaView>
  );
}
