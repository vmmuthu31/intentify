import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInLeft, BounceIn } from 'react-native-reanimated';

export function PortfolioScreen() {
  const [selectedTimeframe, setSelectedTimeframe] = useState('1D');

  const timeframes = ['1H', '1D', '1W', '1M', '1Y'];

  const assets = [
    {
      symbol: 'SOL',
      name: 'Solana',
      balance: '45.2',
      value: '$8,558.40',
      change: '+5.2%',
      changeColor: '#00D4AA',
      price: '$189.50',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      balance: '2,150.00',
      value: '$2,150.00',
      change: '+0.1%',
      changeColor: '#00D4AA',
      price: '$1.00',
    },
    {
      symbol: 'BONK',
      name: 'Bonk',
      balance: '1,250,000',
      value: '$1,125.50',
      change: '+12.4%',
      changeColor: '#00D4AA',
      price: '$0.0009',
    },
    {
      symbol: 'mSOL',
      name: 'Marinade SOL',
      balance: '8.7',
      value: '$1,652.23',
      change: '-2.1%',
      changeColor: '#FF4757',
      price: '$189.91',
    },
  ];

  const activePositions = [
    {
      type: 'Lending',
      protocol: 'Solend',
      asset: 'USDC',
      amount: '500.00',
      apy: '8.2%',
      earnings: '+$12.50',
    },
    {
      type: 'Staking',
      protocol: 'Marinade',
      asset: 'SOL',
      amount: '10.5',
      apy: '6.8%',
      earnings: '+$89.20',
    },
  ];

  return (
    <SafeAreaView className="bg-dark-bg flex-1">
      {/* Header */}
      <Animated.View
        entering={FadeInUp.duration(600)}
        className="flex-row items-center justify-between p-4">
        <Text className="text-2xl font-bold text-white">Portfolio</Text>
        <TouchableOpacity className="p-2">
          <Ionicons name="refresh-outline" size={24} color="#8E8E93" />
        </TouchableOpacity>
      </Animated.View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Portfolio Value Card */}
        <Animated.View entering={FadeInUp.duration(600).delay(100)} className="mx-4 mb-6">
          <LinearGradient
            colors={['#1A1A1A', '#2A2A2A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="border-dark-border rounded-2xl border p-6">
            <Text className="text-dark-gray mb-1 text-sm">Total Portfolio Value</Text>
            <Text className="mb-2 text-3xl font-bold text-white">$12,486.73</Text>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Ionicons name="trending-up" size={16} color="#00D4AA" />
                <Text className="text-success ml-1 text-sm">+$1,234.56 (8.4%)</Text>
              </View>
              <Text className="text-dark-gray text-sm">24h</Text>
            </View>

            {/* Chart Timeframe Selector */}
            <View className="bg-dark-bg mt-4 flex-row rounded-xl p-1">
              {timeframes.map((timeframe) => (
                <TouchableOpacity
                  key={timeframe}
                  onPress={() => setSelectedTimeframe(timeframe)}
                  className={`flex-1 rounded-lg py-2 ${
                    selectedTimeframe === timeframe ? 'bg-primary' : ''
                  }`}>
                  <Text
                    className={`text-center text-sm font-medium ${
                      selectedTimeframe === timeframe ? 'text-white' : 'text-dark-gray'
                    }`}>
                    {timeframe}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Holdings */}
        <Animated.View entering={FadeInLeft.duration(600).delay(200)} className="mb-6 px-4">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-white">Holdings</Text>
            <TouchableOpacity>
              <Text className="text-primary text-sm">Rebalance</Text>
            </TouchableOpacity>
          </View>

          {assets.map((asset, index) => (
            <Animated.View
              key={asset.symbol}
              entering={BounceIn.duration(600).delay(index * 100)}
              className="mb-3">
              <TouchableOpacity className="bg-dark-card border-dark-border rounded-2xl border p-4">
                <View className="flex-row items-center">
                  <View className="bg-primary/20 mr-4 h-12 w-12 items-center justify-center rounded-full">
                    <Text className="text-primary text-sm font-bold">{asset.symbol}</Text>
                  </View>

                  <View className="flex-1">
                    <View className="mb-1 flex-row items-center justify-between">
                      <Text className="text-base font-semibold text-white">{asset.symbol}</Text>
                      <Text className="text-base font-semibold text-white">{asset.value}</Text>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-dark-gray text-sm">
                        {asset.balance} {asset.symbol}
                      </Text>
                      <Text className="text-sm font-medium" style={{ color: asset.changeColor }}>
                        {asset.change}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </Animated.View>

        {/* Active Positions */}
        <Animated.View entering={FadeInUp.duration(600).delay(300)} className="mb-6 px-4">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-white">Active Positions</Text>
            <TouchableOpacity>
              <Text className="text-primary text-sm">View All</Text>
            </TouchableOpacity>
          </View>

          {activePositions.map((position, index) => (
            <Animated.View
              key={index}
              entering={FadeInUp.duration(400).delay(index * 100)}
              className="mb-3">
              <TouchableOpacity className="bg-dark-card border-dark-border rounded-2xl border p-4">
                <View className="mb-3 flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <View className="bg-success/20 mr-3 h-8 w-8 items-center justify-center rounded-full">
                      <Ionicons name="trending-up" size={16} color="#00D4AA" />
                    </View>
                    <View>
                      <Text className="font-semibold text-white">{position.type}</Text>
                      <Text className="text-dark-gray text-sm">{position.protocol}</Text>
                    </View>
                  </View>
                  <Text className="text-success font-semibold">{position.earnings}</Text>
                </View>

                <View className="flex-row items-center justify-between">
                  <Text className="text-dark-gray text-sm">
                    {position.amount} {position.asset} at {position.apy} APY
                  </Text>
                  <View className="flex-row items-center">
                    <View className="bg-success mr-2 h-2 w-2 rounded-full" />
                    <Text className="text-dark-gray text-sm">Active</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </Animated.View>

        {/* Portfolio Actions */}
        <Animated.View entering={FadeInUp.duration(600).delay(400)} className="mb-8 px-4">
          <Text className="mb-4 text-lg font-semibold text-white">Quick Actions</Text>

          <View className="mb-4 flex-row justify-between">
            <TouchableOpacity className="bg-primary mr-2 flex-1 rounded-2xl p-4">
              <View className="items-center">
                <Ionicons name="swap-horizontal" size={24} color="#FFFFFF" />
                <Text className="mt-2 font-semibold text-white">Swap</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity className="bg-dark-card border-dark-border ml-2 flex-1 rounded-2xl border p-4">
              <View className="items-center">
                <Ionicons name="trending-up" size={24} color="#00D4AA" />
                <Text className="mt-2 font-semibold text-white">Lend</Text>
              </View>
            </TouchableOpacity>
          </View>

          <TouchableOpacity className="bg-dark-card border-dark-border rounded-2xl border p-4">
            <View className="flex-row items-center justify-center">
              <Ionicons name="download-outline" size={20} color="#8E8E93" />
              <Text className="text-dark-gray ml-2 font-medium">Export Portfolio</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
