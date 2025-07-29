import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInLeft, BounceIn } from 'react-native-reanimated';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Import Solana provider and IntentFI services
import { useSolana } from '../providers/SolanaProvider';
import { intentFiMobile, networkService } from '../services';

export function PortfolioScreen() {
  const [selectedTimeframe, setSelectedTimeframe] = useState('1D');
  const [isContractReady, setIsContractReady] = useState(false);
  const [userKeypair, setUserKeypair] = useState<Keypair | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [portfolioStats, setPortfolioStats] = useState<any>(null);
  const [launchpadStats, setLaunchpadStats] = useState<any>(null);

  const { connected, balance, tokenBalances, refreshBalances } = useSolana();

  const timeframes = ['1H', '1D', '1W', '1M', '1Y'];

  useEffect(() => {
    if (connected) {
      initializePortfolioData();
    }
  }, [connected]);

  const initializePortfolioData = async () => {
    try {
      await refreshBalances();
      // Initialize IntentFI SDK
      await intentFiMobile.initialize('devnet');

      // Create test user for demo (in production, use actual wallet)
      const testKeypair = Keypair.generate();
      setUserKeypair(testKeypair);

      setIsContractReady(true);
      await fetchPortfolioData(testKeypair);

      console.log('✅ Portfolio data initialized');
    } catch (error) {
      console.error('❌ Failed to initialize portfolio:', error);
    }
  };

  const fetchPortfolioData = async (keypair?: Keypair) => {
    const targetKeypair = keypair || userKeypair;
    if (!targetKeypair) return;

    try {
      // Fetch user profile from IntentFI
      const profile = await intentFiMobile.getUserProfile(targetKeypair.publicKey);
      setUserProfile(profile);

      // Fetch launchpad data
      const launchState = await intentFiMobile.advancedSDK.launchpad.getLaunchpadState();
      setLaunchpadStats(launchState);

      // Calculate portfolio stats
      const totalTokenValue = tokenBalances.reduce((total, token) => {
        return total + token.uiAmount * (token.price || 0);
      }, 0);

      setPortfolioStats({
        totalValue: totalTokenValue,
        solValue: balance,
        tokenValue: totalTokenValue,
        intentVolume: profile?.account?.totalVolume || 0,
        activeIntents: profile?.account?.activeIntents || 0,
        totalIntentsCreated: profile?.account?.totalIntentsCreated || 0,
        launchContributions: 0, // Would fetch from launchpad contract
      });
    } catch (error) {
      console.error('❌ Failed to fetch portfolio data:', error);
    }
  };

  // Format real token balances with estimated prices
  const formatAssets = () => {
    const assets = tokenBalances.map((token) => ({
      symbol: token.symbol,
      name: token.name ?? 'Solana',
      balance: token.uiAmount.toLocaleString('en-US', {
        minimumFractionDigits: token.symbol === 'SOL' ? 4 : 0,
        maximumFractionDigits: token.symbol === 'SOL' ? 4 : 0,
      }),
      value: `$${(token.uiAmount * (token.price || 0)).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      change: '+0.0%', // Would need historical data for real changes
      changeColor: '#8E8E93',
      price: token.price ? `$${token.price.toFixed(token.symbol === 'SOL' ? 2 : 6)}` : 'N/A',
      uiAmount: token.uiAmount,
      mint: token.mint,
    }));

    // Add SOL if not already present
    if (!assets.find((asset) => asset.symbol === 'SOL') && balance > 0) {
      assets.unshift({
        symbol: 'SOL',
        name: 'Solana',
        balance: balance.toFixed(4),
        value: `$${(balance * 189).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
        change: '+0.0%',
        changeColor: '#8E8E93',
        price: '$189.00',
        uiAmount: balance,
        mint: 'So11111111111111111111111111111111111111112',
      });
    }

    return assets.filter((asset) => asset.uiAmount > 0);
  };

  const handleAssetPress = (asset: any) => {
    Alert.alert(
      `${asset.name} (${asset.symbol})`,
      `Balance: ${asset.balance}\nValue: ${asset.value}\nPrice: ${asset.price}\nMint: ${asset.mint.slice(0, 20)}...`,
      [
        { text: 'OK' },
        {
          text: 'Create Intent',
          onPress: () => Alert.alert('Navigate', 'Go to Intent tab to create swap/lend intents'),
        },
      ]
    );
  };

  const getTotalPortfolioValue = () => {
    if (!portfolioStats) return '$0.00';
    return `$${portfolioStats.totalValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getPortfolioChange = () => {
    if (!portfolioStats || !userProfile?.account)
      return { value: '$0.00', percent: '0%', color: '#8E8E93' };

    const intentVolumeValue = (portfolioStats.intentVolume / LAMPORTS_PER_SOL) * 189;
    const changePercent =
      portfolioStats.totalValue > 0
        ? ((intentVolumeValue / portfolioStats.totalValue) * 100).toFixed(1)
        : '0.0';

    return {
      value: `$${intentVolumeValue.toFixed(2)}`,
      percent: `+${changePercent}%`,
      color: intentVolumeValue > 0 ? '#00D4AA' : '#8E8E93',
    };
  };

  const assets = formatAssets();
  const portfolioChange = getPortfolioChange();

  return (
    <SafeAreaView className="flex-1 bg-dark-bg">
      {/* Header */}
      <Animated.View
        entering={FadeInUp.duration(600)}
        className="flex-row items-center justify-between p-4">
        <View>
          <Text className="text-2xl font-bold text-white">Portfolio</Text>
          <Text className="text-sm text-gray-400">
            {connected ? 'Connected' : 'Not Connected'} •{' '}
            {isContractReady ? networkService.getCurrentNetwork().toUpperCase() : 'Loading...'}
          </Text>
        </View>
        <TouchableOpacity onPress={refreshBalances} className="p-2">
          <Ionicons name="refresh" size={24} color="#8E8E93" />
        </TouchableOpacity>
      </Animated.View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Portfolio Value Card */}
        <Animated.View entering={FadeInUp.duration(600).delay(100)} className="mx-4 mb-6">
          <LinearGradient
            colors={['#1F1F23', '#2A2A2E']}
            className="rounded-2xl border border-dark-border p-6">
            <Text className="text-sm text-gray-400">Total Portfolio Value</Text>
            <Text className="mb-2 text-3xl font-bold text-white">{getTotalPortfolioValue()}</Text>
            <View className="flex-row items-center">
              <Ionicons
                name={portfolioChange.value !== '$0.00' ? 'trending-up' : 'remove'}
                size={16}
                color={portfolioChange.color}
              />
              <Text className="ml-1 text-sm" style={{ color: portfolioChange.color }}>
                {portfolioChange.value}
              </Text>
              <Text className="ml-2 text-sm" style={{ color: portfolioChange.color }}>
                ({portfolioChange.percent})
              </Text>
            </View>
            {userProfile?.account && (
              <Text className="mt-2 text-xs text-gray-500">
                Intent Volume: {(portfolioStats?.intentVolume / LAMPORTS_PER_SOL || 0).toFixed(2)}{' '}
                SOL
              </Text>
            )}
          </LinearGradient>
        </Animated.View>

        {/* Contract Stats */}
        {isContractReady && portfolioStats && (
          <Animated.View entering={FadeInUp.duration(600).delay(150)} className="mx-4 mb-6">
            <View className="rounded-xl border border-dark-border bg-dark-card p-4">
              <Text className="mb-3 font-semibold text-white">IntentFI Activity</Text>
              <View className="flex-row justify-between">
                <View className="items-center">
                  <Text className="text-lg font-bold text-primary">
                    {portfolioStats.totalIntentsCreated}
                  </Text>
                  <Text className="text-xs text-gray-400">Total Intents</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-bold text-primary">
                    {portfolioStats.activeIntents}
                  </Text>
                  <Text className="text-xs text-gray-400">Active</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-bold text-primary">
                    {(portfolioStats.intentVolume / LAMPORTS_PER_SOL).toFixed(1)}
                  </Text>
                  <Text className="text-xs text-gray-400">SOL Volume</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-bold text-primary">
                    {portfolioStats.launchContributions}
                  </Text>
                  <Text className="text-xs text-gray-400">Launches</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Timeframe Selector */}
        <Animated.View entering={FadeInUp.duration(600).delay(200)} className="mb-6 px-4">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row space-x-3">
              {timeframes.map((timeframe) => (
                <TouchableOpacity
                  key={timeframe}
                  onPress={() => setSelectedTimeframe(timeframe)}
                  className={`rounded-full px-4 py-2 ${
                    selectedTimeframe === timeframe
                      ? 'bg-primary'
                      : 'border border-dark-border bg-dark-card'
                  }`}>
                  <Text
                    className={`font-medium ${
                      selectedTimeframe === timeframe ? 'text-white' : 'text-gray-400'
                    }`}>
                    {timeframe}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </Animated.View>

        {/* Holdings */}
        <Animated.View entering={FadeInLeft.duration(600).delay(300)} className="mb-8 px-4">
          <Text className="mb-4 text-lg font-semibold text-white">Holdings ({assets.length})</Text>

          {!connected ? (
            <View className="items-center rounded-xl border border-dark-border bg-dark-card p-8">
              <Ionicons name="wallet-outline" size={48} color="#8E8E93" />
              <Text className="mt-4 text-center text-gray-400">
                Connect your wallet to view holdings
              </Text>
            </View>
          ) : assets.length === 0 ? (
            <View className="items-center rounded-xl border border-dark-border bg-dark-card p-8">
              <Ionicons name="list-outline" size={48} color="#8E8E93" />
              <Text className="mt-4 text-center text-gray-400">No tokens found in your wallet</Text>
              <Text className="mt-2 text-xs text-gray-500">
                Add some SOL or SPL tokens to get started
              </Text>
            </View>
          ) : (
            assets.map((asset, index) => (
              <Animated.View
                key={asset.symbol}
                entering={BounceIn.duration(600).delay(index * 100)}>
                <TouchableOpacity
                  onPress={() => handleAssetPress(asset)}
                  className="mb-3 flex-row items-center rounded-2xl border border-dark-border bg-dark-card p-4">
                  <View className="mr-4 h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                    <Text className="text-sm font-bold text-primary">
                      {asset.symbol.slice(0, 3)}
                    </Text>
                  </View>

                  <View className="flex-1">
                    <View className="flex-row items-center justify-between">
                      <View>
                        <Text className="font-semibold text-white">{asset.symbol}</Text>
                        <Text className="text-sm text-gray-400">{asset.name}</Text>
                      </View>
                      <View className="items-end">
                        <Text className="font-semibold text-white">{asset.value}</Text>
                        <Text className="text-sm text-gray-400">
                          {asset.balance} {asset.symbol}
                        </Text>
                      </View>
                    </View>

                    <View className="mt-2 flex-row items-center justify-between">
                      <Text className="text-xs text-gray-500">Price: {asset.price}</Text>
                      <Text className="text-xs" style={{ color: asset.changeColor }}>
                        {asset.change}
                      </Text>
                    </View>
                  </View>

                  <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
                </TouchableOpacity>
              </Animated.View>
            ))
          )}
        </Animated.View>

        {/* Contract Information */}
        {isContractReady && userKeypair && (
          <Animated.View entering={FadeInUp.duration(600).delay(400)} className="mb-8 px-4">
            <Text className="mb-4 text-lg font-semibold text-white">Contract Information</Text>
            <View className="rounded-xl border border-dark-border bg-dark-card p-4">
              <View className="space-y-3">
                <View className="flex-row justify-between">
                  <Text className="text-gray-400">Network</Text>
                  <Text className="text-white">
                    {networkService.getCurrentNetwork().toUpperCase()}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-gray-400">Your Wallet</Text>
                  <Text className="font-mono text-xs text-white">
                    {userKeypair.publicKey.toString().slice(0, 20)}...
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-gray-400">IntentFI Contract</Text>
                  <Text className="font-mono text-xs text-white">2UPCMZ2L...</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-gray-400">Launchpad Contract</Text>
                  <Text className="font-mono text-xs text-white">5y2X9WML...</Text>
                </View>
                <View className="border-t border-dark-border pt-3">
                  <Text className="text-center text-xs text-gray-500">
                    All contracts deployed on Solana Devnet for testing
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
