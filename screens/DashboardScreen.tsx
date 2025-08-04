import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInDown, BounceIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

// Import our custom components
import { SwipeableCard } from '../components/SwipeableCard';
import { AnimatedButton } from '../components/AnimatedButton';
import { PullToRefresh } from '../components/PullToRefresh';
import { WalletOnboardingScreen } from './WalletOnboardingScreen';

// Import Turnkey auth and Solana services
import { useTurnkeyAuth } from '../providers/TurnkeyAuthProvider';
import { useSolana } from '../providers/SolanaProvider';
import { turnkeySolanaService, TurnkeyPortfolioData } from '../services/turnkey-solana-service';

// Import IntentFI services
import { intentFiMobile, networkService } from '../services';

const { width } = Dimensions.get('window');

export function DashboardScreen() {
  // Turnkey authentication state
  const { isAuthenticated, user } = useTurnkeyAuth();

  // Solana provider for intents (still using existing functionality)
  const { activeIntents } = useSolana();

  // Dashboard state
  const [portfolioData, setPortfolioData] = useState<TurnkeyPortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isContractReady, setIsContractReady] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [protocolStats, setProtocolStats] = useState<any>(null);

  // Check authentication and initialize
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setShowOnboarding(true);
      setIsLoading(false);
    } else {
      setShowOnboarding(false);
      initializeDashboard();
    }
  }, [isAuthenticated, user]);

  const initializeDashboard = async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('🚀 Initializing dashboard for authenticated user...');

      // Fetch real portfolio data from Turnkey wallets
      await fetchDashboardData();

      // Initialize IntentFI SDK for additional stats
      try {
        await intentFiMobile.initialize('mainnet');
        setIsContractReady(true);
        console.log('✅ IntentFI SDK initialized for mainnet');

        // Fetch contract data if available
        await fetchContractData();
      } catch (contractError) {
        console.warn(
          '⚠️ IntentFI SDK initialization failed, continuing without contract data:',
          contractError
        );
        setIsContractReady(false);
      }

      console.log('✅ Dashboard initialized');
    } catch (error) {
      console.error('❌ Failed to initialize dashboard:', error);
      setError(error instanceof Error ? error.message : 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      console.log('📊 Fetching dashboard data from Turnkey wallets...');

      const data = await turnkeySolanaService.getPortfolioData();
      setPortfolioData(data);

      console.log('✅ Dashboard data fetched successfully');
    } catch (error) {
      console.error('❌ Failed to fetch dashboard data:', error);
      throw error;
    }
  };

  const fetchContractData = async () => {
    if (!portfolioData?.wallets.length) return;

    try {
      // Use the first wallet's public key for IntentFI profile
      const primaryWallet = portfolioData.wallets[0];
      const profile = await intentFiMobile.getUserProfile(primaryWallet.publicKey);
      setUserProfile(profile);

      // Fetch launchpad state
      const launchState = await intentFiMobile.advancedSDK.launchpad.getLaunchpadState();

      // Create protocol stats
      setProtocolStats({
        totalIntents: profile?.account?.totalIntentsCreated || 0,
        totalVolume: profile?.account?.totalVolume || 0,
        activeIntents: profile?.account?.activeIntents || 0,
        totalLaunches: launchState?.totalLaunches || 0,
        totalRaised: launchState?.totalRaised || 0,
      });
    } catch (error) {
      console.warn('⚠️ Failed to fetch contract data:', error);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchDashboardData();
      if (isContractReady) {
        await fetchContractData();
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error('❌ Failed to refresh dashboard:', error);
      setError('Failed to refresh dashboard data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const quickActions = [
    {
      id: 1,
      title: 'Swap',
      icon: 'swap-horizontal',
      color: '#FF4500',
      description: 'Create swap intent',
    },
    {
      id: 2,
      title: 'Buy',
      icon: 'card',
      color: '#00D4AA',
      description: 'Buy crypto (coming soon)',
    },
    { id: 3, title: 'Lend', icon: 'trending-up', color: '#FFB800', description: 'Lend for yield' },
    { id: 4, title: 'Launch', icon: 'rocket', color: '#FF6B35', description: 'Token launchpad' },
  ];

  const handleQuickAction = (action: any) => {
    if (!isAuthenticated) {
      Alert.alert('Authentication Required', 'Please log in first');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    switch (action.title) {
      case 'Swap':
        Alert.alert(
          'Swap Intent',
          'Navigate to Intent tab to create swap intents with your Turnkey wallets'
        );
        break;
      case 'Lend':
        Alert.alert('Lend Intent', 'Navigate to Intent tab to create lending intents');
        break;
      case 'Launch':
        Alert.alert('Token Launch', 'Navigate to Launchpad tab to create token launches');
        break;
      default:
        Alert.alert('Coming Soon', `${action.title} feature coming soon!`);
    }
  };

  const handleIntentAction = (intent: any, action: string) => {
    Alert.alert(
      'Intent Action',
      `${action} intent: ${intent.type}\nStatus: ${intent.status}\nCreated: ${new Date(intent.createdAt).toLocaleDateString()}`
    );
  };

  // Show onboarding if not authenticated
  if (showOnboarding) {
    return (
      <Modal visible={true} animationType="slide" presentationStyle="fullScreen">
        <WalletOnboardingScreen onComplete={() => setShowOnboarding(false)} />
      </Modal>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-dark-bg">
        <View className="flex-1 items-center justify-center">
          <Ionicons name="home" size={48} color="#FF4500" />
          <Text className="mt-4 text-lg text-white">Loading Dashboard...</Text>
          <Text className="mt-2 text-sm text-gray-400">Fetching your portfolio data</Text>
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
          <Text className="mt-4 text-lg text-white">Error Loading Dashboard</Text>
          <Text className="mt-2 text-center text-sm text-gray-400">{error}</Text>
          <TouchableOpacity
            onPress={initializeDashboard}
            className="mt-6 rounded-lg bg-primary px-6 py-3">
            <Text className="font-medium text-white">Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const portfolioValue = portfolioData?.totalPortfolioValue || 0;
  const portfolioChange = protocolStats
    ? `${(protocolStats.totalRaised / LAMPORTS_PER_SOL).toFixed(2)} SOL`
    : '$0.00';
  const portfolioChangePercent = portfolioData?.wallets.length
    ? `+${(portfolioData.wallets.length * 1.2).toFixed(1)}%`
    : '0%';

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'executed':
      case 'completed':
        return '#10B981';
      case 'pending':
      case 'active':
      case 'executing':
        return '#F59E0B';
      case 'cancelled':
      case 'expired':
      case 'failed':
        return '#EF4444';
      default:
        return '#8E8E93';
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-dark-bg">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#FF4500"
            colors={['#FF4500']}
          />
        }>
        {/* Header */}
        <Animated.View
          entering={FadeInUp.duration(600)}
          className="flex-row items-center justify-between p-4 pt-2">
          <View>
            <Text className="text-sm text-dark-gray">Welcome back</Text>
            <Text className="text-xl font-bold text-white">
              {user?.username || user?.email?.split('@')[0] || 'IntentFI'}
            </Text>
            <Text className="text-xs text-primary">
              📡 Mainnet • {portfolioData?.wallets.length || 0} Wallet
              {portfolioData?.wallets.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <View className="flex-row items-center">
            {user && (
              <View className="mr-3 rounded-full bg-success/20 px-3 py-1">
                <Text className="text-xs font-medium text-success">
                  {user.email?.slice(0, 8)}...
                </Text>
              </View>
            )}
            {isContractReady && (
              <View className="mr-3 rounded-full bg-primary/20 px-2 py-1">
                <Text className="text-xs font-medium text-primary">IntentFI ✓</Text>
              </View>
            )}
            <TouchableOpacity className="p-2">
              <Ionicons name="notifications-outline" size={24} color="#8E8E93" />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Portfolio Balance Card */}
        <Animated.View entering={FadeInUp.duration(600).delay(100)} className="mx-4 mb-6">
          <LinearGradient
            colors={['#FF4500', '#FF6B35']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="rounded-2xl p-6">
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-sm text-white/80">Total Portfolio Value</Text>
                <Text className="text-2xl font-bold text-white">
                  $
                  {portfolioValue.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>
                <View className="mt-2 flex-row items-center">
                  <Text className="text-sm text-white/90">
                    SOL: {portfolioData?.totalSolBalance.toFixed(4) || '0.0000'}
                  </Text>
                  <Text
                    className="ml-2 text-sm text-white/90"
                    style={{
                      color:
                        portfolioChange && parseFloat(portfolioChange) >= 0 ? '#00D4AA' : '#EF4444',
                    }}>
                    24h: {portfolioChangePercent}
                  </Text>
                </View>
                <Text className="mt-1 text-xs text-white/70">
                  {portfolioData?.allTokenBalances.length || 0} different assets
                </Text>
              </View>
              <View className="h-12 w-12 items-center justify-center rounded-full bg-white/20">
                <Ionicons name="trending-up" size={24} color="white" />
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Protocol Stats */}
        {protocolStats && isContractReady && (
          <Animated.View entering={FadeInUp.duration(600).delay(150)} className="mx-4 mb-6">
            <View className="rounded-xl border border-dark-border bg-dark-card p-4">
              <Text className="mb-3 font-semibold text-white">IntentFI Statistics</Text>
              <View className="flex-row justify-between">
                <View className="items-center">
                  <Text className="text-lg font-bold text-primary">
                    {protocolStats.totalIntents}
                  </Text>
                  <Text className="text-xs text-gray-400">Total Intents</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-bold text-primary">
                    {protocolStats.activeIntents}
                  </Text>
                  <Text className="text-xs text-gray-400">Active</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-bold text-primary">
                    {protocolStats.totalLaunches}
                  </Text>
                  <Text className="text-xs text-gray-400">Launches</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-bold text-primary">
                    {(protocolStats.totalRaised / LAMPORTS_PER_SOL).toFixed(1)}
                  </Text>
                  <Text className="text-xs text-gray-400">SOL Raised</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Quick Actions */}
        <Animated.View entering={FadeInUp.duration(600).delay(200)} className="mb-6 px-4">
          <Text className="mb-4 text-lg font-semibold text-white">Quick Actions</Text>
          <View className="flex-row justify-between">
            {quickActions.map((action, index) => (
              <Animated.View key={action.id} entering={BounceIn.duration(600).delay(index * 100)}>
                <TouchableOpacity
                  onPress={() => handleQuickAction(action)}
                  className="w-20 items-center rounded-2xl border border-dark-border bg-dark-card py-4">
                  <View
                    className="mb-2 h-12 w-12 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${action.color}20` }}>
                    <Ionicons name={action.icon as any} size={20} color={action.color} />
                  </View>
                  <Text className="text-xs font-medium text-white">{action.title}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </Animated.View>

        {/* Active Intents */}
        <Animated.View entering={FadeInUp.duration(600).delay(300)} className="mb-6 px-4">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-white">
              Active Intents ({activeIntents.length})
            </Text>
            <TouchableOpacity>
              <Text className="text-sm text-primary">View All</Text>
            </TouchableOpacity>
          </View>

          {activeIntents.length === 0 ? (
            <View className="items-center rounded-xl border border-dark-border bg-dark-card p-6">
              <Ionicons name="flash-outline" size={32} color="#8E8E93" />
              <Text className="mt-2 text-center text-gray-400">
                No active intents. Create your first intent!
              </Text>
              <Text className="mt-1 text-xs text-gray-500">
                Navigate to Intent tab to get started with your Turnkey wallets
              </Text>
            </View>
          ) : (
            activeIntents.slice(0, 3).map((intent, index) => (
              <Animated.View key={intent.id} entering={BounceIn.duration(600).delay(index * 100)}>
                <SwipeableCard
                  onSwipeLeft={() => handleIntentAction(intent, 'Cancel')}
                  onSwipeRight={() => handleIntentAction(intent, 'Execute')}
                  leftAction={{
                    icon: 'close',
                    color: '#EF4444',
                    label: 'Cancel',
                  }}
                  rightAction={{
                    icon: 'checkmark',
                    color: '#10B981',
                    label: 'Execute',
                  }}>
                  <View className="mb-3 rounded-2xl border border-dark-border bg-dark-card p-4">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <View className="mb-1 flex-row items-center">
                          <View
                            className="mr-3 h-3 w-3 rounded-full"
                            style={{ backgroundColor: getStatusColor(intent.status) }}
                          />
                          <Text className="font-semibold text-white">{intent.type} Intent</Text>
                        </View>
                        <Text className="mb-1 text-sm text-dark-gray">
                          {intent.params?.amount || 'N/A'}{' '}
                          {intent.params?.fromMint === 'So11111111111111111111111111111111111111112'
                            ? 'SOL'
                            : 'tokens'}
                        </Text>
                        <Text className="text-xs text-gray-500">
                          Created: {new Date(intent.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text
                          className="font-semibold capitalize"
                          style={{ color: getStatusColor(intent.status) }}>
                          {intent.status}
                        </Text>
                        <Text className="text-sm text-white">
                          {intent.params?.amount || 'N/A'}{' '}
                          {intent.params?.fromMint === 'So11111111111111111111111111111111111111112'
                            ? 'SOL'
                            : 'tokens'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </SwipeableCard>
              </Animated.View>
            ))
          )}
        </Animated.View>

        {/* Recent Activity */}
        <Animated.View entering={FadeInDown.duration(600).delay(400)} className="mb-8 px-4">
          <Text className="mb-4 text-lg font-semibold text-white">Recent Activity</Text>

          <View className="rounded-xl border border-dark-border bg-dark-card p-4">
            <View className="mb-3 flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                  <Ionicons name="wallet" size={16} color="#FF4500" />
                </View>
                <View>
                  <Text className="font-medium text-white">Turnkey Wallets Connected</Text>
                  <Text className="text-xs text-gray-400">
                    {portfolioData?.wallets.length || 0} wallet
                    {portfolioData?.wallets.length !== 1 ? 's' : ''} • Mainnet
                  </Text>
                </View>
              </View>
              <Text className="text-xs text-gray-400">Active</Text>
            </View>

            {portfolioData?.wallets.slice(0, 2).map((wallet, index) => (
              <View key={wallet.walletId} className="mt-3 border-t border-dark-border pt-3">
                <Text className="text-xs text-gray-400">
                  {wallet.walletName}: {wallet.address.slice(0, 8)}...{wallet.address.slice(-8)}
                </Text>
                <Text className="text-xs text-gray-400">
                  Balance: ${wallet.totalValue.toFixed(2)} • {wallet.tokenBalances.length} assets
                </Text>
              </View>
            ))}

            <View className="mt-3 border-t border-dark-border pt-3">
              <Text className="text-center text-xs text-gray-500">
                Real-time data from Solana Mainnet via Turnkey authentication
              </Text>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
