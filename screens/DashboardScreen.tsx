import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInDown, BounceIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import our custom components
import { SwipeableCard } from '../components/SwipeableCard';
import { AnimatedButton } from '../components/AnimatedButton';
import { PullToRefresh } from '../components/PullToRefresh';
import { WalletOnboardingScreen } from './WalletOnboardingScreen';
import { useSolana } from '../providers/SolanaProvider';

// Import IntentFI services
import { intentFiMobile, networkService, walletService } from '../services';

const { width } = Dimensions.get('window');

export function DashboardScreen() {
  const {
    connected,
    connecting,
    balance,
    tokenBalances,
    publicKey,
    refreshBalances,
    connectWallet,
  } = useSolana();

  const [showOnboarding, setShowOnboarding] = useState(!connected);
  const [isContractReady, setIsContractReady] = useState(false);
  const [userKeypair, setUserKeypair] = useState<Keypair | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [activeIntents, setActiveIntents] = useState<any[]>([]);
  const [launchpadState, setLaunchpadState] = useState<any>(null);
  const [protocolStats, setProtocolStats] = useState<any>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // Update onboarding visibility when connection status changes
  useEffect(() => {
    setShowOnboarding(!connected);
    if (connected) {
      initializeContracts();
    }
  }, [connected]);

  const initializeContracts = async () => {
    try {
      // Initialize IntentFI SDK
      await intentFiMobile.initialize('devnet');
      console.log('🚀 IntentFI SDK initialized');

      // Get or create a funded wallet seamlessly
      const { publicKey: walletPublicKey, hasFunds } =
        await intentFiMobile.getOrCreateFundedWallet();
      console.log('👤 Wallet ready:', walletPublicKey.toString().slice(0, 8) + '...');

      // Ensure wallet has minimum funds for operations
      if (!hasFunds) {
        console.log('💧 Ensuring wallet is funded...');
        const fundingResult = await intentFiMobile.ensureWalletFunded(walletPublicKey, 0.05);
        if (!fundingResult) {
          console.warn('⚠️ Wallet funding failed - some features may be limited');
        }
      }

      // Create Keypair object for backward compatibility
      const storedWallet = await AsyncStorage.getItem('secure_wallet_data');
      if (storedWallet) {
        const parsed = JSON.parse(storedWallet);
        if (parsed.privateKey && Array.isArray(parsed.privateKey)) {
          try {
            // Convert array back to Uint8Array and ensure it's exactly 64 bytes
            const secretKeyArray = new Uint8Array(parsed.privateKey);
            if (secretKeyArray.length === 64) {
              const testKeypair = Keypair.fromSecretKey(secretKeyArray);
              setUserKeypair(testKeypair);
            } else {
              console.error('Invalid secret key size:', secretKeyArray.length);
            }
          } catch (error) {
            console.error('Failed to reconstruct keypair:', error);
          }
        }
      }

      setIsContractReady(true);
      await fetchContractData();
      await fetchWalletBalance();

      console.log('✅ Dashboard contracts initialized');
    } catch (error) {
      console.error('❌ Failed to initialize contracts:', error);
      // Don't completely fail - allow users to still see the UI
      setIsContractReady(true);
    }
  };

  const fetchContractData = async () => {
    if (!userKeypair) {
      // Try to get wallet from storage if userKeypair is not set
      try {
        const storedWallet = await AsyncStorage.getItem('secure_wallet_data');
        if (storedWallet) {
          const parsed = JSON.parse(storedWallet);
          if (parsed.privateKey && Array.isArray(parsed.privateKey)) {
            try {
              const secretKeyArray = new Uint8Array(parsed.privateKey);
              if (secretKeyArray.length === 64) {
                const testKeypair = Keypair.fromSecretKey(secretKeyArray);
                setUserKeypair(testKeypair);
                return;
              }
            } catch (error) {
              console.error('Failed to reconstruct keypair in fetchContractData:', error);
            }
          }
        }
      } catch (error) {
        console.error('Failed to get stored wallet:', error);
      }
      return;
    }

    const targetKeypair = userKeypair;

    try {
      // Fetch user profile and intents
      const profile = await intentFiMobile.getUserProfile(targetKeypair.publicKey);
      setUserProfile(profile);

      // Format intents for display
      if (profile?.intents) {
        const formattedIntents = profile.intents.map((intent: any, index: number) => ({
          id: index + 1,
          type: intent.intentType,
          description: `${intent.intentType} ${(intent.amount / LAMPORTS_PER_SOL).toFixed(2)} SOL`,
          status: intent.status.toLowerCase(),
          value: `${(intent.amount / LAMPORTS_PER_SOL).toFixed(2)} SOL`,
          createdAt: new Date(intent.createdAt * 1000).toLocaleDateString(),
        }));
        setActiveIntents(formattedIntents);
      }

      // Fetch launchpad state
      const launchState = await intentFiMobile.advancedSDK.launchpad.getLaunchpadState();
      setLaunchpadState(launchState);

      // Create protocol stats
      setProtocolStats({
        totalIntents: profile?.account?.totalIntentsCreated || 0,
        totalVolume: profile?.account?.totalVolume || 0,
        activeIntents: profile?.account?.activeIntents || 0,
        totalLaunches: launchState?.totalLaunches || 0,
        totalRaised: launchState?.totalRaised || 0,
      });
    } catch (error) {
      console.error('❌ Failed to fetch contract data:', error);
    }
  };

  const fetchWalletBalance = async () => {
    try {
      // Try to get wallet from userKeypair or storage
      let targetKeypair = userKeypair;

      if (!targetKeypair) {
        const storedWallet = await AsyncStorage.getItem('secure_wallet_data');
        if (storedWallet) {
          const parsed = JSON.parse(storedWallet);
          if (parsed.privateKey && Array.isArray(parsed.privateKey)) {
            const secretKeyArray = new Uint8Array(parsed.privateKey);
            if (secretKeyArray.length === 64) {
              targetKeypair = Keypair.fromSecretKey(secretKeyArray);
            }
          }
        }
      }

      if (!targetKeypair) return;

      const connection = networkService.getConnection();
      const balance = await connection.getBalance(targetKeypair.publicKey);
      const balanceInSOL = balance / LAMPORTS_PER_SOL;
      setWalletBalance(balanceInSOL);
      console.log(`💰 Wallet balance: ${balanceInSOL.toFixed(4)} SOL`);
    } catch (error) {
      console.error('Failed to fetch wallet balance:', error);
    }
  };

  const getTotalPortfolioValue = () => {
    const tokenValue = tokenBalances.reduce((total, token) => {
      return total + token.uiAmount * (token.price || 0);
    }, 0);

    // Add SOL balance value (estimated at $189 per SOL for demo)
    const solValue = balance * 189;

    return tokenValue + solValue;
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

  const handleRefresh = async () => {
    if (!connected) return;
    await refreshBalances();
    if (isContractReady) {
      await fetchContractData();
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleQuickAction = (action: any) => {
    if (!connected) {
      Alert.alert('Wallet Required', 'Please connect your wallet first');
      return;
    }
    if (!isContractReady) {
      Alert.alert('Loading', 'Contracts are still initializing...');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    switch (action.title) {
      case 'Swap':
        Alert.alert('Swap Intent', 'Navigate to Intent tab to create swap intents');
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
      `${action} intent: ${intent.description}\nCreated: ${intent.createdAt}`
    );
  };

  // Show onboarding if not connected
  if (showOnboarding) {
    return (
      <Modal visible={true} animationType="slide" presentationStyle="fullScreen">
        <WalletOnboardingScreen onComplete={() => setShowOnboarding(false)} />
      </Modal>
    );
  }

  const portfolioValue = getTotalPortfolioValue();
  const portfolioChange = protocolStats
    ? `${(protocolStats.totalVolume / LAMPORTS_PER_SOL).toFixed(2)} SOL`
    : '$0.00';
  const portfolioChangePercent =
    activeIntents.length > 0 ? `+${activeIntents.length * 2.1}%` : '0%';

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'executed':
      case 'completed':
        return '#10B981';
      case 'pending':
      case 'active':
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
    <SafeAreaView className="bg-dark-bg flex-1">
      <PullToRefresh onRefresh={handleRefresh}>
        {/* Header */}
        <Animated.View
          entering={FadeInUp.duration(600)}
          className="flex-row items-center justify-between p-4 pt-2">
          <View>
            <Text className="text-dark-gray text-sm">Welcome back</Text>
            <Text className="text-xl font-bold text-white">IntentFI</Text>
            {isContractReady && (
              <Text className="text-primary text-xs">
                📡 {networkService.getCurrentNetwork().toUpperCase()}
              </Text>
            )}
          </View>
          <View className="flex-row items-center">
            {connected && (
              <View className="bg-success/20 mr-3 rounded-full px-3 py-1">
                <Text className="text-success text-xs font-medium">
                  {publicKey?.toString().slice(0, 4)}...{publicKey?.toString().slice(-4)}
                </Text>
              </View>
            )}
            {isContractReady && (
              <View className="bg-primary/20 mr-3 rounded-full px-2 py-1">
                <Text className="text-primary text-xs font-medium">Contract ✓</Text>
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
                  <Text className="text-sm text-white/90">Intent Volume: {portfolioChange}</Text>
                  <Text className="ml-2 text-sm text-white/90">{portfolioChangePercent}</Text>
                </View>
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
            <View className="bg-dark-card border-dark-border rounded-xl border p-4">
              <Text className="mb-3 font-semibold text-white">Protocol Statistics</Text>
              <View className="flex-row justify-between">
                <View className="items-center">
                  <Text className="text-primary text-lg font-bold">
                    {protocolStats.totalIntents}
                  </Text>
                  <Text className="text-xs text-gray-400">Total Intents</Text>
                </View>
                <View className="items-center">
                  <Text className="text-primary text-lg font-bold">
                    {protocolStats.activeIntents}
                  </Text>
                  <Text className="text-xs text-gray-400">Active</Text>
                </View>
                <View className="items-center">
                  <Text className="text-primary text-lg font-bold">
                    {protocolStats.totalLaunches}
                  </Text>
                  <Text className="text-xs text-gray-400">Launches</Text>
                </View>
                <View className="items-center">
                  <Text className="text-primary text-lg font-bold">
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
                  className="bg-dark-card border-dark-border w-20 items-center rounded-2xl border py-4">
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
              <Text className="text-primary text-sm">View All</Text>
            </TouchableOpacity>
          </View>

          {!isContractReady ? (
            <View className="bg-dark-card border-dark-border items-center rounded-xl border p-6">
              <Ionicons name="refresh" size={24} color="#8E8E93" />
              <Text className="mt-2 text-gray-400">Loading contract data...</Text>
            </View>
          ) : activeIntents.length === 0 ? (
            <View className="bg-dark-card border-dark-border items-center rounded-xl border p-6">
              <Ionicons name="flash-outline" size={32} color="#8E8E93" />
              <Text className="mt-2 text-center text-gray-400">
                {userProfile?.account
                  ? 'No active intents. Create your first intent!'
                  : 'Initialize your account to start creating intents'}
              </Text>
              <Text className="mt-1 text-xs text-gray-500">
                Navigate to Intent tab to get started
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
                  <View className="bg-dark-card border-dark-border mb-3 rounded-2xl border p-4">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <View className="mb-1 flex-row items-center">
                          <View
                            className="mr-3 h-3 w-3 rounded-full"
                            style={{ backgroundColor: getStatusColor(intent.status) }}
                          />
                          <Text className="font-semibold text-white">{intent.type} Intent</Text>
                        </View>
                        <Text className="text-dark-gray mb-1 text-sm">{intent.description}</Text>
                        <Text className="text-xs text-gray-500">Created: {intent.createdAt}</Text>
                      </View>
                      <View className="items-end">
                        <Text
                          className="font-semibold capitalize"
                          style={{ color: getStatusColor(intent.status) }}>
                          {intent.status}
                        </Text>
                        <Text className="text-sm text-white">{intent.value}</Text>
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

          {isContractReady && userKeypair ? (
            <View className="bg-dark-card border-dark-border rounded-xl border p-4">
              <View className="mb-3 flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="bg-primary/20 mr-3 h-8 w-8 items-center justify-center rounded-full">
                    <Ionicons name="person-add" size={16} color="#FF4500" />
                  </View>
                  <View>
                    <Text className="font-medium text-white">Account Created</Text>
                    <Text className="text-xs text-gray-400">Ready for IntentFI on devnet</Text>
                  </View>
                </View>
                <Text className="text-xs text-gray-400">Just now</Text>
              </View>

              <View className="border-dark-border border-t pt-3">
                <Text className="text-xs text-gray-400">
                  Wallet: {userKeypair.publicKey.toString().slice(0, 20)}...
                </Text>
                <Text className="text-xs text-gray-400">
                  Network: {networkService.getCurrentNetwork().toUpperCase()}
                </Text>
                <Text className="text-xs text-gray-400">
                  IntentFI: 2UPCMZ2LESPx8wU83wdng3Yjhx2yxRLEkEDYDkNUg1jd
                </Text>
                <Text className="text-xs text-gray-400">
                  Launchpad: 5y2X9WML5ttrWrxzUfGrLSxbXfEcKTyV1dDyw2jXW1Zg
                </Text>
              </View>
            </View>
          ) : (
            <View className="bg-dark-card border-dark-border items-center rounded-xl border p-6">
              <Ionicons name="time-outline" size={24} color="#8E8E93" />
              <Text className="mt-2 text-gray-400">No recent activity</Text>
              <Text className="text-xs text-gray-500">
                Start using IntentFI to see activity here
              </Text>
            </View>
          )}
        </Animated.View>
      </PullToRefresh>
    </SafeAreaView>
  );
}
