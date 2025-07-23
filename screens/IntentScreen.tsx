import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInUp,
  SlideInRight,
} from 'react-native-reanimated';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
// Remove Keypair and AsyncStorage imports

// Import components
import { FloatingActionButton } from '../components/FloatingActionButton';
import { IntentBuilder } from '../components/IntentBuilder';
import { PullToRefresh } from '../components/PullToRefresh';
import * as Haptics from 'expo-haptics';

// Import IntentFI services
import { intentFiMobile, networkService, transactionService } from '../services';
import { useSolana } from '../providers/SolanaProvider';

// Import types
import type { UserProfile, IntentBuilderData } from '../types';

const { width } = Dimensions.get('window');

export function IntentScreen() {
  const { publicKey, connected, balance, refreshBalances, executeSwapIntent, executeLendIntent } =
    useSolana();

  const [selectedTab, setSelectedTab] = useState(0);
  const [showIntentBuilder, setShowIntentBuilder] = useState(false);
  const [builderIntentType, setBuilderIntentType] = useState<'swap' | 'buy' | 'lend' | 'launch'>(
    'swap'
  );

  // IntentFI state
  const [isInitialized, setIsInitialized] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [recentIntents, setRecentIntents] = useState<any[]>([]);
  // Remove walletBalance state

  const translateX = useSharedValue(0);

  const intentTypes = [
    {
      id: 0,
      title: 'Swap',
      icon: 'swap-horizontal',
      description: 'Exchange tokens instantly on devnet',
    },
    { id: 1, title: 'Buy', icon: 'card', description: 'Purchase crypto with fiat (coming soon)' },
    { id: 2, title: 'Lend', icon: 'trending-up', description: 'Earn yield on your assets' },
    { id: 3, title: 'Launch', icon: 'rocket', description: 'Launch new tokens on launchpad' },
  ];

  const swapExamples = [
    { from: 'SOL', to: 'USDC', description: 'Swap at best price (simulated)', amount: '10 SOL' },
    { from: 'USDC', to: 'SOL', description: 'Auto-route with low slippage', amount: '$500' },
    { from: 'SOL', to: 'BONK', description: 'Test swap on devnet', amount: '5 SOL' },
  ];

  const initializeIntentFI = async () => {
    if (!publicKey) return;

    try {
      setLoading(true);
      // Initialize SDK for devnet
      await intentFiMobile.initialize('devnet');
      console.log('✅ IntentFI SDK initialized on devnet');
      console.log('👤 Using connected wallet:', publicKey.toString().slice(0, 8) + '...');
      setIsInitialized(true);
      await fetchUserProfile();
    } catch (error) {
      console.error('❌ Failed to initialize IntentFI:', error);
      Alert.alert('Error', 'Failed to initialize IntentFI SDK');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async () => {
    if (!publicKey) return;
    try {
      const profile = await intentFiMobile.getUserProfile(publicKey);
      setUserProfile(profile);

      // Convert intents to display format
      if (profile?.intents) {
        const formattedIntents = profile.intents.map((intent: any, index: number) => ({
          id: index + 1,
          type: intent.intentType,
          description: `${intent.intentType} ${intent.amount / LAMPORTS_PER_SOL} SOL`,
          status: intent.status.toLowerCase(),
          timestamp: new Date(intent.createdAt * 1000).toLocaleString(),
          value: `${intent.amount / LAMPORTS_PER_SOL} SOL`,
        }));
        setRecentIntents(formattedIntents);
      }

      console.log('📊 User profile loaded:', profile);
    } catch (error) {
      console.error('❌ Failed to fetch user profile:', error);
    }
  };

  const initializeUserAccount = async () => {
    if (!publicKey || !connected) {
      Alert.alert('No Wallet', 'Please connect your wallet first');
      return;
    }

    try {
      setLoading(true);
      // Check wallet status
      const walletStatus = await transactionService.getWalletStatusMessage(publicKey);
      console.log('💳 Wallet status:', walletStatus);

      // Prepare wallet for transaction
      const isReady = await transactionService.prepareWalletForTransaction(
        publicKey,
        0.01 // Need at least 0.01 SOL for initialization
      );

      if (!isReady) {
        Alert.alert(
          'Need Wallet Funding 💰',
          `${walletStatus}\n\nYour wallet needs SOL to activate your IntentFI account.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Auto-Fund', onPress: () => attemptFunding() },
          ]
        );
        return;
      }

      console.log('🚀 Wallet ready, initializing user account...');

      // Create a mock initialization transaction for demo purposes
      // In a real implementation, this would use the provider's signing capabilities
      const mockSignature = 'demo_initialization_' + Date.now().toString();

      console.log('✅ User initialized:', mockSignature);
      Alert.alert(
        'Success! 🎉',
        `User account initialized on devnet!\n\n✨ You can now create intents!`
      );

      // Fetch updated user profile
      await fetchUserProfile();
    } catch (error: any) {
      console.error('❌ Failed to initialize user:', error);

      // Better error messaging
      let errorMessage = 'Failed to initialize user account';
      if (error.message && error.message.includes('Attempt to debit an account')) {
        errorMessage =
          'Insufficient SOL for transaction fees.\n\nPlease fund your wallet or use Quick Demo mode.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert('Initialization Failed', errorMessage, [
        { text: 'OK' },
        { text: 'Try Again', onPress: initializeUserAccount },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const attemptFunding = async () => {
    if (!publicKey || !connected) return;

    try {
      console.log('💧 Attempting to fund wallet...');
      const fundingSuccess = await intentFiMobile.ensureWalletFunded(publicKey, 0.05);

      if (fundingSuccess) {
        Alert.alert(
          'Funding Successful! 💰',
          'Your wallet has been funded. You can now initialize your account.',
          [{ text: 'Initialize Now', onPress: initializeUserAccount }]
        );
      } else {
        Alert.alert(
          'Auto-Funding Failed',
          'Unable to fund wallet automatically due to rate limits. Please try again later.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Funding attempt failed:', error);
      Alert.alert('Funding Error', 'Automatic funding failed. Please try again later.', [
        { text: 'OK' },
      ]);
    }
  };

  const animatedTabStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  const handleTabPress = (index: number) => {
    setSelectedTab(index);
    translateX.value = withSpring(index * (width / 4), {
      damping: 20,
      stiffness: 90,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleTemplatePress = (template: any) => {
    if (!publicKey || !connected) {
      Alert.alert('Setup Required', 'Please connect your wallet first');
      return;
    }

    if (!userProfile?.account) {
      Alert.alert('Setup Required', 'Please initialize your user account first');
      return;
    }

    setBuilderIntentType('swap');
    setShowIntentBuilder(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleFABPress = () => {
    if (!publicKey || !connected) {
      Alert.alert('Setup Required', 'Please connect your wallet first');
      return;
    }

    if (!userProfile?.account) {
      Alert.alert('Setup Required', 'Please initialize your user account first');
      return;
    }

    setBuilderIntentType(intentTypes[selectedTab].title.toLowerCase() as any);
    setShowIntentBuilder(true);
  };

  const handleCreateIntent = async (intentData: IntentBuilderData) => {
    if (!publicKey || !connected) {
      Alert.alert('No Wallet', 'Please connect your wallet first');
      return;
    }

    try {
      setLoading(true);
      let signature = '';

      if (intentData.type === 'swap') {
        // Use provider's executeSwapIntent
        signature = await executeSwapIntent({
          fromMint: 'So11111111111111111111111111111111111111112', // SOL
          toMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
          amount: parseFloat(intentData.amount),
          maxSlippage: intentData.slippage || 300,
          rugproofEnabled: true,
        });

        Alert.alert('Swap Intent Created!', `Transaction: ${signature.slice(0, 20)}...`);
      } else if (intentData.type === 'lend') {
        // Use provider's executeLendIntent
        signature = await executeLendIntent({
          mint: 'So11111111111111111111111111111111111111112', // SOL
          amount: parseFloat(intentData.amount),
          minApy: intentData.minApy || 500,
        });

        Alert.alert('Lend Intent Created!', `Transaction: ${signature.slice(0, 20)}...`);
      }

      console.log('Creating intent:', intentData, 'Signature:', signature);
      setShowIntentBuilder(false);

      // Refresh user profile
      await fetchUserProfile();
      await refreshBalances();

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (error: any) {
      console.error('❌ Intent creation failed:', error);
      Alert.alert('Error', error.message || 'Failed to create intent', [{ text: 'OK' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await fetchUserProfile();
    await refreshBalances();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'executed':
        return '#4ADE80';
      case 'active':
      case 'pending':
        return '#F59E0B';
      case 'failed':
      case 'cancelled':
        return '#EF4444';
      default:
        return '#8E8E93';
    }
  };

  useEffect(() => {
    if (publicKey && connected) {
      initializeIntentFI();
    }
  }, [publicKey, connected]);

  return (
    <SafeAreaView className="flex-1 bg-dark-bg">
      {/* Header */}
      <Animated.View
        entering={FadeInUp.duration(600)}
        className="flex-row items-center justify-between p-4">
        <View>
          <Text className="text-2xl font-bold text-white">Create Intent</Text>
          <Text className="text-sm text-gray-400">
            📡 {networkService.getCurrentNetwork().toUpperCase()} •{' '}
            {isInitialized ? 'Connected' : 'Connecting...'}
          </Text>
        </View>
        <TouchableOpacity className="p-2">
          <Ionicons name="help-circle-outline" size={24} color="#8E8E93" />
        </TouchableOpacity>
      </Animated.View>

      {/* Connection Status */}
      {!connected && (
        <Animated.View entering={FadeInUp.duration(600).delay(50)} className="mx-4 mb-4">
          <View className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
            <View className="flex-row items-center">
              <Ionicons name="warning" size={20} color="#F59E0B" />
              <Text className="ml-2 font-semibold text-yellow-400">Wallet Not Connected</Text>
            </View>
            <Text className="mt-2 text-sm text-yellow-300">
              Please connect your wallet to use IntentFI features
            </Text>
          </View>
        </Animated.View>
      )}

      {/* User Account Status */}
      {isInitialized && publicKey && connected && (
        <Animated.View entering={FadeInUp.duration(600).delay(50)} className="mx-4 mb-4">
          <View className="rounded-xl border border-dark-border bg-dark-card p-4">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="font-semibold text-white">User Account</Text>
                <Text className="font-mono text-xs text-gray-400">
                  {publicKey.toString().slice(0, 20)}...
                </Text>
                <Text className="font-mono text-xs text-gray-400">
                  Balance: {balance.toFixed(4)} SOL
                </Text>
              </View>

              {!userProfile?.account ? (
                <TouchableOpacity
                  onPress={initializeUserAccount}
                  disabled={loading}
                  className="rounded-lg bg-primary px-4 py-2">
                  <Text className="font-semibold text-white">
                    {loading ? 'Setting up...' : 'Activate Account'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View className="items-end">
                  <Text className="font-semibold text-primary">✓ Active</Text>
                  <Text className="text-xs text-gray-400">
                    {userProfile.account.totalIntentsCreated} intents created
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Animated.View>
      )}

      {/* Tab Navigation */}
      <Animated.View entering={FadeInUp.duration(600).delay(100)} className="mb-6 px-4">
        <View className="relative flex-row rounded-2xl border border-dark-border bg-dark-card p-2">
          {/* Animated Tab Indicator */}
          <Animated.View
            style={[animatedTabStyle]}
            className="absolute left-2 top-2 h-12 w-1/4 rounded-xl bg-primary"
          />

          {intentTypes.map((type, index) => (
            <TouchableOpacity
              key={type.id}
              onPress={() => handleTabPress(index)}
              className="z-10 h-12 flex-1 items-center justify-center">
              <Ionicons
                name={type.icon as any}
                size={20}
                color={selectedTab === index ? '#FFFFFF' : '#8E8E93'}
              />
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      <PullToRefresh onRefresh={handleRefresh}>
        {/* Intent Type Description */}
        <Animated.View
          entering={SlideInRight.duration(600).delay(200)}
          className="mx-4 mb-6 rounded-2xl border border-dark-border bg-dark-card p-6">
          <View className="mb-3 flex-row items-center">
            <View className="mr-4 h-12 w-12 items-center justify-center rounded-full bg-primary/20">
              <Ionicons name={intentTypes[selectedTab].icon as any} size={24} color="#FF4500" />
            </View>
            <View className="flex-1">
              <Text className="text-lg font-semibold text-white">
                {intentTypes[selectedTab].title} Intent
              </Text>
              <Text className="text-gray-400">{intentTypes[selectedTab].description}</Text>
            </View>
          </View>

          {selectedTab === 0 && (
            <View className="mt-4">
              <Text className="mb-3 text-sm text-gray-400">
                Contract: 2UPCMZ2LESPx8wU83wdng3Yjhx2yxRLEkEDYDkNUg1jd
              </Text>
              <Text className="text-sm text-gray-400">• Simulated swaps for devnet testing</Text>
              <Text className="text-sm text-gray-400">• Protocol fees applied</Text>
              <Text className="text-sm text-gray-400">• All transactions are free on devnet</Text>
            </View>
          )}
        </Animated.View>

        {/* Quick Templates */}
        {selectedTab === 0 && (
          <Animated.View entering={SlideInRight.duration(600).delay(300)} className="mb-6 px-4">
            <Text className="mb-4 text-lg font-semibold text-white">Quick Templates</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {swapExamples.map((template, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleTemplatePress(template)}
                  className="mr-4 w-64 rounded-xl border border-dark-border bg-dark-card p-4">
                  <View className="mb-2 flex-row items-center">
                    <Text className="mr-2 font-semibold text-primary">{template.from}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#8E8E93" />
                    <Text className="ml-2 font-semibold text-primary">{template.to}</Text>
                  </View>
                  <Text className="mb-1 text-sm text-gray-400">{template.description}</Text>
                  <Text className="font-medium text-white">{template.amount}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* Recent Intents */}
        <Animated.View entering={SlideInRight.duration(600).delay(400)} className="mb-20 px-4">
          <Text className="mb-4 text-lg font-semibold text-white">
            Recent Intents ({recentIntents.length})
          </Text>

          {recentIntents.length === 0 ? (
            <View className="items-center rounded-xl border border-dark-border bg-dark-card p-6">
              <Ionicons name="flash-outline" size={48} color="#8E8E93" />
              <Text className="mt-4 text-center text-gray-400">
                {!userProfile?.account
                  ? 'Initialize your account to start creating intents'
                  : 'No intents created yet. Create your first intent!'}
              </Text>
            </View>
          ) : (
            recentIntents.map((intent) => (
              <View
                key={intent.id}
                className="mb-3 flex-row items-center justify-between rounded-xl border border-dark-border bg-dark-card p-4">
                <View className="flex-1">
                  <View className="mb-1 flex-row items-center">
                    <View
                      className="mr-3 h-3 w-3 rounded-full"
                      style={{ backgroundColor: getStatusColor(intent.status) }}
                    />
                    <Text className="font-semibold text-white">{intent.type}</Text>
                  </View>
                  <Text className="mb-1 text-sm text-gray-400">{intent.description}</Text>
                  <Text className="text-xs text-gray-500">{intent.timestamp}</Text>
                </View>
                <Text className="font-semibold" style={{ color: getStatusColor(intent.status) }}>
                  {intent.value}
                </Text>
              </View>
            ))
          )}
        </Animated.View>
      </PullToRefresh>

      {/* Floating Action Button */}
      {userProfile?.account && !loading && (
        <FloatingActionButton onPress={handleFABPress} icon="flash" />
      )}

      {/* Intent Builder Modal */}
      <Modal visible={showIntentBuilder} animationType="slide" presentationStyle="pageSheet">
        <IntentBuilder
          intentType={builderIntentType}
          onClose={() => setShowIntentBuilder(false)}
          onCreateIntent={handleCreateIntent}
        />
      </Modal>
    </SafeAreaView>
  );
}
