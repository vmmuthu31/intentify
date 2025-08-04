import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInLeft, BounceIn } from 'react-native-reanimated';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

// Import Turnkey auth and Solana services
import { useTurnkeyAuth } from '../providers/TurnkeyAuthProvider';
import {
  turnkeySolanaService,
  TurnkeyPortfolioData,
  TurnkeyWalletData,
  TurnkeyTokenBalance,
} from '../services/turnkey-solana-service';
import { intentFiMobile, networkService } from '../services';

export function PortfolioScreen() {
  const [selectedTimeframe, setSelectedTimeframe] = useState('1D');
  const [selectedTab, setSelectedTab] = useState<'holdings' | 'transactions'>('holdings');
  const [portfolioData, setPortfolioData] = useState<TurnkeyPortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isContractReady, setIsContractReady] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [portfolioStats, setPortfolioStats] = useState<any>(null);

  const { isAuthenticated, user } = useTurnkeyAuth();

  const timeframes = ['1H', '1D', '1W', '1M', '1Y'];

  useEffect(() => {
    if (isAuthenticated && user) {
      initializePortfolioData();
    }
  }, [isAuthenticated, user]);

  const initializePortfolioData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('🔄 Initializing portfolio data with GoldRush API...');

      // Fetch real portfolio data from Turnkey wallets using GoldRush
      await fetchPortfolioData();

      // Initialize IntentFI SDK for additional stats
      try {
        await intentFiMobile.initialize('mainnet');
        setIsContractReady(true);
        console.log('✅ IntentFI SDK initialized for mainnet');
      } catch (contractError) {
        console.warn(
          '⚠️ IntentFI SDK initialization failed, continuing without contract data:',
          contractError
        );
        setIsContractReady(false);
      }

      console.log('✅ Portfolio data initialized with GoldRush');
    } catch (error) {
      console.error('❌ Failed to initialize portfolio:', error);
      setError(error instanceof Error ? error.message : 'Failed to load portfolio data');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPortfolioData = async () => {
    try {
      console.log('📊 Fetching real portfolio data from GoldRush API...');

      const data = await turnkeySolanaService.getPortfolioData();
      setPortfolioData(data);

      // Calculate portfolio stats
      const stats = {
        totalValue: data.totalPortfolioValue,
        totalValueChange24h: data.totalValueChange24h,
        solValue: data.totalSolBalance,
        tokenValue: data.totalTokenValue,
        walletCount: data.wallets.length,
        tokenCount: data.allTokenBalances.length,
        largestHolding: data.allTokenBalances.reduce(
          (largest, token) => {
            const value = token.value || 0;
            return value > largest.value ? { symbol: token.symbol, value } : largest;
          },
          { symbol: 'N/A', value: 0 }
        ),
        lastUpdated: data.lastUpdated,
      };

      setPortfolioStats(stats);

      // Try to fetch IntentFI profile if available
      if (isContractReady && data.wallets.length > 0) {
        try {
          const profile = await intentFiMobile.getUserProfile(data.wallets[0].publicKey);
          setUserProfile(profile);
        } catch (profileError) {
          console.warn('⚠️ Could not fetch IntentFI profile:', profileError);
        }
      }

      console.log('✅ Portfolio data fetched successfully from GoldRush');
    } catch (error) {
      console.error('❌ Failed to fetch portfolio data:', error);
      throw error;
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Clear cache to force fresh data
      turnkeySolanaService.clearCache();
      await fetchPortfolioData();
    } catch (error) {
      console.error('❌ Failed to refresh portfolio:', error);
      setError('Failed to refresh portfolio data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyAddress = async (address: string) => {
    try {
      await Clipboard.setStringAsync(address);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Alert.alert(
        'Copied! 📋',
        `Wallet address copied to clipboard\n\n${address.slice(0, 20)}...`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Failed to copy address:', error);
      Alert.alert('Error', 'Failed to copy address to clipboard');
    }
  };

  const handleAssetPress = (asset: TurnkeyTokenBalance) => {
    const value = asset.value || 0;
    const change24h = asset.valueChange24h || 0;
    const priceChange = asset.priceChange24h || 0;

    Alert.alert(
      `${asset.name || asset.symbol}`,
      `Symbol: ${asset.symbol}\nBalance: ${asset.uiAmount.toLocaleString()} ${asset.symbol}\nValue: $${value.toFixed(2)}\nPrice: $${(asset.price || 0).toFixed(asset.symbol === 'SOL' ? 2 : 6)}\n24h Change: ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%\n\nMint: ${asset.mint.slice(0, 20)}...`,
      [
        { text: 'OK' },
        {
          text: 'Copy Mint',
          onPress: () => handleCopyAddress(asset.mint),
        },
        {
          text: 'Create Intent',
          onPress: () =>
            Alert.alert('Navigate', 'Go to Intent tab to create swap/lend intents with this token'),
        },
      ]
    );
  };

  const handleWalletPress = (wallet: TurnkeyWalletData) => {
    const change24h = wallet.totalValueChange24h || 0;
    Alert.alert(
      wallet.walletName,
      `Address: ${wallet.address.slice(0, 20)}...\nSOL Balance: ${wallet.solBalance.toFixed(4)} SOL\nToken Count: ${wallet.tokenBalances.length}\nTotal Value: $${wallet.totalValue.toFixed(2)}\n24h Change: ${change24h >= 0 ? '+' : ''}$${change24h.toFixed(2)}\nLast Updated: ${new Date(wallet.lastUpdated).toLocaleString()}`,
      [
        { text: 'OK' },
        {
          text: 'Copy Address',
          onPress: () => handleCopyAddress(wallet.address),
        },
        {
          text: 'View Details',
          onPress: () =>
            Alert.alert(
              'Wallet Details',
              `Full Address: ${wallet.address}\nWallet ID: ${wallet.walletId}`
            ),
        },
      ]
    );
  };

  const getTotalPortfolioValue = () => {
    if (!portfolioData) return '$0.00';
    return `$${portfolioData.totalPortfolioValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getPortfolioChange = () => {
    if (!portfolioData || portfolioData.totalValueChange24h === undefined) {
      return { value: '$0.00', percent: '0%', color: '#8E8E93' };
    }

    const changeValue = portfolioData.totalValueChange24h;
    const changePercent =
      portfolioData.totalPortfolioValue > 0
        ? ((changeValue / portfolioData.totalPortfolioValue) * 100).toFixed(1)
        : '0.0';

    return {
      value: `$${Math.abs(changeValue).toFixed(2)}`,
      percent: `${changeValue >= 0 ? '+' : ''}${changePercent}%`,
      color: changeValue >= 0 ? '#00D4AA' : '#EF4444',
    };
  };

  // Show loading state
  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-dark-bg">
        <View className="flex-1 items-center justify-center">
          <Ionicons name="wallet" size={48} color="#FF4500" />
          <Text className="mt-4 text-lg text-white">Loading Portfolio...</Text>
          <Text className="mt-2 text-sm text-gray-400">Fetching data from Our API</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show error state
  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-dark-bg">
        <View className="flex-1 items-center justify-center p-6">
          <Ionicons name="alert-circle" size={48} color="#EF4444" />
          <Text className="mt-4 text-lg text-white">Error Loading Portfolio</Text>
          <Text className="mt-2 text-center text-sm text-gray-400">{error}</Text>
          <TouchableOpacity
            onPress={initializePortfolioData}
            className="mt-6 rounded-lg bg-primary px-6 py-3">
            <Text className="font-medium text-white">Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Show not authenticated state
  if (!isAuthenticated || !user) {
    return (
      <SafeAreaView className="flex-1 bg-dark-bg">
        <View className="flex-1 items-center justify-center p-6">
          <Ionicons name="lock-closed" size={48} color="#8E8E93" />
          <Text className="mt-4 text-lg text-white">Authentication Required</Text>
          <Text className="mt-2 text-center text-sm text-gray-400">
            Please log in to view your portfolio
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const portfolioChange = getPortfolioChange();
  const assets = portfolioData?.allTokenBalances || [];
  const wallets = portfolioData?.wallets || [];

  return (
    <SafeAreaView className="flex-1 bg-dark-bg">
      {/* Header */}
      <Animated.View
        entering={FadeInUp.duration(600)}
        className="flex-row items-center justify-between p-4">
        <View>
          <Text className="text-2xl font-bold text-white">Portfolio</Text>
          <Text className="text-sm text-gray-400">
            {wallets.length > 0 ? 'Your Solana Wallet' : 'No Wallets'}
          </Text>
        </View>
        <View className="flex-row items-center">
          {/* Copy Address Button */}
          {wallets.length > 0 && (
            <TouchableOpacity
              onPress={() => handleCopyAddress(wallets[0].address)}
              className="mr-3 rounded-lg bg-primary/20 p-2">
              <Ionicons name="copy" size={20} color="#FF4500" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleRefresh} className="p-2">
            <Ionicons name="refresh" size={24} color="#8E8E93" />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#FF4500"
            colors={['#FF4500']}
          />
        }>
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
                ({portfolioChange.percent}) 24h
              </Text>
            </View>
            {portfolioStats && (
              <View className="mt-3 flex-row justify-between">
                <View>
                  <Text className="text-xs text-gray-500">SOL Balance</Text>
                  <Text className="text-sm text-white">
                    {portfolioStats.solValue.toFixed(4)} SOL
                  </Text>
                </View>
                <View>
                  <Text className="text-xs text-gray-500">Last Updated</Text>
                  <Text className="text-sm text-white">
                    {portfolioStats.lastUpdated
                      ? new Date(portfolioStats.lastUpdated).toLocaleTimeString()
                      : 'Now'}
                  </Text>
                </View>
              </View>
            )}
          </LinearGradient>
        </Animated.View>

        {/* Portfolio Stats */}
        {portfolioStats && (
          <Animated.View entering={FadeInUp.duration(600).delay(150)} className="mx-4 mb-6">
            <View className="rounded-xl border border-dark-border bg-dark-card p-4">
              <Text className="mb-3 font-semibold text-white">Portfolio Overview</Text>
              <View className="flex-row justify-between">
                <View className="items-center">
                  <Text className="text-lg font-bold text-primary">
                    {portfolioStats.walletCount}
                  </Text>
                  <Text className="text-xs text-gray-400">Wallet</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-bold text-primary">
                    {portfolioStats.tokenCount}
                  </Text>
                  <Text className="text-xs text-gray-400">Assets</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-bold text-primary">
                    ${(portfolioStats.tokenValue / 1000).toFixed(1)}K
                  </Text>
                  <Text className="text-xs text-gray-400">Token Value</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-bold text-primary">
                    {isContractReady ? '✓' : '○'}
                  </Text>
                  <Text className="text-xs text-gray-400">IntentFI</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Wallet Section */}
        {wallets.length > 0 && (
          <Animated.View entering={FadeInLeft.duration(600).delay(250)} className="mb-6 px-4">
            <Text className="mb-4 text-lg font-semibold text-white">Your Solana Wallet</Text>
            {wallets.map((wallet, index) => (
              <Animated.View
                key={wallet.walletId}
                entering={BounceIn.duration(600).delay(index * 100)}>
                <TouchableOpacity
                  onPress={() => handleWalletPress(wallet)}
                  className="mb-3 flex-row items-center rounded-2xl border border-dark-border bg-dark-card p-4">
                  <View className="mr-4 h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                    <Ionicons name="wallet" size={20} color="#FF4500" />
                  </View>

                  <View className="flex-1">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <Text className="font-semibold text-white">{wallet.walletName}</Text>
                        <View className="flex-row items-center">
                          <Text className="text-sm text-gray-400">
                            {wallet.address.slice(0, 8)}...{wallet.address.slice(-8)}
                          </Text>
                          <TouchableOpacity
                            onPress={() => handleCopyAddress(wallet.address)}
                            className="ml-2 rounded p-1">
                            <Ionicons name="copy-outline" size={14} color="#8E8E93" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View className="items-end">
                        <Text className="font-semibold text-white">
                          ${wallet.totalValue.toFixed(2)}
                        </Text>
                        <Text className="text-sm text-gray-400">
                          {wallet.tokenBalances.length} assets
                        </Text>
                      </View>
                    </View>

                    <View className="mt-2 flex-row justify-between">
                      <Text className="text-xs text-gray-500">
                        SOL: {wallet.solBalance.toFixed(4)}
                      </Text>
                      {wallet.totalValueChange24h !== undefined && (
                        <Text
                          className="text-xs"
                          style={{
                            color: wallet.totalValueChange24h >= 0 ? '#00D4AA' : '#EF4444',
                          }}>
                          24h: {wallet.totalValueChange24h >= 0 ? '+' : ''}$
                          {wallet.totalValueChange24h.toFixed(2)}
                        </Text>
                      )}
                    </View>
                  </View>

                  <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
                </TouchableOpacity>
              </Animated.View>
            ))}
          </Animated.View>
        )}

        {/* Tab Navigation */}
        <Animated.View entering={FadeInLeft.duration(600).delay(300)} className="mb-4 px-4">
          <View className="flex-row rounded-xl border border-dark-border bg-dark-card p-1">
            <TouchableOpacity
              onPress={() => setSelectedTab('holdings')}
              className={`flex-1 rounded-lg py-3 ${
                selectedTab === 'holdings' ? 'bg-primary' : 'bg-transparent'
              }`}>
              <Text
                className={`text-center font-medium ${
                  selectedTab === 'holdings' ? 'text-white' : 'text-gray-400'
                }`}>
                Holdings ({assets.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSelectedTab('transactions')}
              className={`flex-1 rounded-lg py-3 ${
                selectedTab === 'transactions' ? 'bg-primary' : 'bg-transparent'
              }`}>
              <Text
                className={`text-center font-medium ${
                  selectedTab === 'transactions' ? 'text-white' : 'text-gray-400'
                }`}>
                Recent Transactions
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Tab Content */}
        <Animated.View entering={FadeInLeft.duration(600).delay(350)} className="mb-8 px-4">
          {selectedTab === 'holdings' ? (
            // Holdings Tab
            <>
              {assets.length === 0 ? (
                <View className="items-center rounded-xl border border-dark-border bg-dark-card p-8">
                  <Ionicons name="list-outline" size={48} color="#8E8E93" />
                  <Text className="mt-4 text-center text-gray-400">No assets found</Text>
                  <Text className="mt-2 text-xs text-gray-500">
                    Your Turnkey wallet doesn&apos;t contain any tokens
                  </Text>
                </View>
              ) : (
                assets.map((asset, index) => (
                  <Animated.View
                    key={`${asset.mint}-${index}`}
                    entering={BounceIn.duration(600).delay(index * 100)}>
                    <TouchableOpacity
                      onPress={() => handleAssetPress(asset)}
                      className="mb-3 flex-row items-center rounded-2xl border border-dark-border bg-dark-card p-4">
                      {/* Token Icon */}
                      <View className="mr-4 h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                        {asset.logoURI ? (
                          <Image
                            source={{ uri: asset.logoURI }}
                            className="h-8 w-8 rounded-full"
                            onError={() =>
                              console.log('Failed to load token image:', asset.logoURI)
                            }
                          />
                        ) : (
                          <Text className="text-sm font-bold text-primary">
                            {asset.symbol.slice(0, 3)}
                          </Text>
                        )}
                      </View>

                      <View className="flex-1">
                        <View className="flex-row items-center justify-between">
                          <View>
                            <Text className="font-semibold text-white">{asset.symbol}</Text>
                            <Text className="text-sm text-gray-400">
                              {asset.name || 'Unknown Token'}
                            </Text>
                          </View>
                          <View className="items-end">
                            <Text className="font-semibold text-white">
                              ${(asset.value || 0).toFixed(2)}
                            </Text>
                            <Text className="text-sm text-gray-400">
                              {asset.uiAmount.toLocaleString(undefined, {
                                minimumFractionDigits: asset.symbol === 'SOL' ? 4 : 0,
                                maximumFractionDigits: asset.symbol === 'SOL' ? 4 : 6,
                              })}{' '}
                              {asset.symbol}
                            </Text>
                          </View>
                        </View>

                        <View className="mt-2 flex-row items-center justify-between">
                          <Text className="text-xs text-gray-500">
                            Price: ${(asset.price || 0).toFixed(asset.symbol === 'SOL' ? 2 : 6)}
                          </Text>
                          {asset.priceChange24h !== undefined && (
                            <Text
                              className="text-xs"
                              style={{
                                color: asset.priceChange24h >= 0 ? '#00D4AA' : '#EF4444',
                              }}>
                              {asset.priceChange24h >= 0 ? '+' : ''}
                              {asset.priceChange24h.toFixed(2)}%
                            </Text>
                          )}
                        </View>
                      </View>

                      <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
                    </TouchableOpacity>
                  </Animated.View>
                ))
              )}
            </>
          ) : (
            // Recent Transactions Tab
            <>
              {portfolioData?.recentTransactions.length === 0 ? (
                <View className="items-center rounded-xl border border-dark-border bg-dark-card p-8">
                  <Ionicons name="time-outline" size={48} color="#8E8E93" />
                  <Text className="mt-4 text-center text-gray-400">No recent transactions</Text>
                  <Text className="mt-2 text-xs text-gray-500">
                    Your recent transactions will appear here
                  </Text>
                </View>
              ) : (
                portfolioData?.recentTransactions.slice(0, 5).map((transaction, index) => (
                  <Animated.View
                    key={`${transaction.hash}-${index}`}
                    entering={BounceIn.duration(600).delay(index * 100)}>
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert(
                          'Transaction Details',
                          `Hash: ${transaction.hash.slice(0, 20)}...\nType: ${transaction.type.toUpperCase()}\nValue: ${transaction.value.toFixed(4)} SOL (${transaction.valueUSD.toFixed(2)})\nGas Fee: ${transaction.gasFee.toFixed(6)} SOL (${transaction.gasFeeUSD.toFixed(4)})\nStatus: ${transaction.successful ? 'Success' : 'Failed'}\nBlock: ${transaction.blockHeight}\nTime: ${new Date(transaction.timestamp).toLocaleString()}`,
                          [
                            { text: 'OK' },
                            {
                              text: 'Copy Hash',
                              onPress: () => handleCopyAddress(transaction.hash),
                            },
                          ]
                        );
                      }}
                      className="mb-3 flex-row items-center rounded-2xl border border-dark-border bg-dark-card p-4">
                      {/* Transaction Icon */}
                      <View className="mr-4 h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                        <Ionicons
                          name={
                            transaction.type === 'sent'
                              ? 'arrow-up'
                              : transaction.type === 'received'
                                ? 'arrow-down'
                                : transaction.type === 'swap'
                                  ? 'swap-horizontal'
                                  : 'help'
                          }
                          size={20}
                          color={
                            transaction.type === 'sent'
                              ? '#EF4444'
                              : transaction.type === 'received'
                                ? '#00D4AA'
                                : '#FF4500'
                          }
                        />
                      </View>

                      <View className="flex-1">
                        <View className="flex-row items-center justify-between">
                          <View>
                            <Text className="font-semibold text-white">
                              {transaction.description.slice(0, 5)}...
                              {transaction.description.slice(42, -1)}
                            </Text>
                            <Text className="text-sm text-gray-400">
                              {new Date(transaction.timestamp).toLocaleDateString()} at{' '}
                              {new Date(transaction.timestamp).toLocaleTimeString()}
                            </Text>
                          </View>
                        </View>

                        <View className="mt-2 flex-row items-center justify-between">
                          <View className="flex-row items-center">
                            <View
                              className={`mr-2 h-2 w-2 rounded-full ${
                                transaction.successful ? 'bg-green-500' : 'bg-red-500'
                              }`}
                            />
                            <Text className="text-xs text-gray-500">
                              {transaction.successful ? 'Success' : 'Failed'}
                            </Text>
                          </View>
                          <Text className="text-xs text-gray-500">
                            Fee: {transaction.gasFee.toFixed(6)} SOL
                          </Text>
                        </View>
                      </View>

                      <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
                    </TouchableOpacity>
                  </Animated.View>
                ))
              )}
            </>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
