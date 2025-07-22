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
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import components
import { FloatingActionButton } from '../components/FloatingActionButton';
import { IntentBuilder } from '../components/IntentBuilder';
import { PullToRefresh } from '../components/PullToRefresh';
import * as Haptics from 'expo-haptics';

// Import IntentFI services
import { intentFiMobile, networkService, transactionService } from '../services';

const { width } = Dimensions.get('window');

export function IntentScreen() {
  const [selectedTab, setSelectedTab] = useState(0);
  const [showIntentBuilder, setShowIntentBuilder] = useState(false);
  const [builderIntentType, setBuilderIntentType] = useState<'swap' | 'buy' | 'lend' | 'launch'>(
    'swap'
  );

  // IntentFI state
  const [isInitialized, setIsInitialized] = useState(false);
  const [userKeypair, setUserKeypair] = useState<Keypair | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [recentIntents, setRecentIntents] = useState<any[]>([]);

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

  useEffect(() => {
    initializeIntentFI();
  }, []);

  const initializeIntentFI = async () => {
    try {
      setLoading(true);

      // Initialize SDK for devnet
      await intentFiMobile.initialize('devnet');
      console.log('✅ IntentFI SDK initialized on devnet');

      // Create test user (in production, use wallet integration)
      const testKeypair = Keypair.generate();
      setUserKeypair(testKeypair);

      console.log('👤 Test user created:', testKeypair.publicKey.toString());
      setIsInitialized(true);

      // Try to fetch user profile (will be null until user is initialized)
      await fetchUserProfile(testKeypair);
    } catch (error) {
      console.error('❌ Failed to initialize IntentFI:', error);
      Alert.alert('Error', 'Failed to initialize IntentFI SDK');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async (keypair?: Keypair) => {
    const targetKeypair = keypair || userKeypair;
    if (!targetKeypair) return;

    try {
      const profile = await intentFiMobile.getUserProfile(targetKeypair.publicKey);
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
    if (!userKeypair) {
      Alert.alert('No Wallet', 'Please create a wallet first');
      return;
    }

    try {
      setLoading(true);

      // Check wallet status
      const walletStatus = await transactionService.getWalletStatusMessage(userKeypair.publicKey);
      console.log('💳 Wallet status:', walletStatus);

      // Prepare wallet for transaction
      const isReady = await transactionService.prepareWalletForTransaction(
        userKeypair.publicKey,
        0.01 // Need at least 0.01 SOL for initialization
      );

      if (!isReady) {
        Alert.alert(
          'Need Wallet Funding 💰',
          `${walletStatus}\n\nYour wallet needs SOL to activate your IntentFI account.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Auto-Fund', onPress: () => attemptFunding() },
            { text: 'Quick Demo', onPress: () => switchToQuickDemo() },
          ]
        );
        return;
      }

      console.log('🚀 Wallet ready, initializing user account...');

      const userTx = await intentFiMobile.advancedSDK.intentFi.initializeUser(userKeypair);
      const signature = await intentFiMobile.advancedSDK.sendTransaction(userTx, userKeypair);

      console.log('✅ User initialized:', signature);
      Alert.alert(
        'Success! 🎉',
        `User account initialized on devnet!\n\nTransaction: ${signature.slice(0, 8)}...${signature.slice(-8)}\n\n✨ You can now create intents!`
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

      Alert.alert('Initialization Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const attemptFunding = async () => {
    if (!userKeypair) return;

    try {
      console.log('💧 Attempting to fund wallet...');
      const fundingSuccess = await intentFiMobile.ensureWalletFunded(userKeypair.publicKey, 0.05);

      if (fundingSuccess) {
        Alert.alert(
          'Funding Successful! 💰',
          'Your wallet has been funded. You can now initialize your account.',
          [{ text: 'Initialize Now', onPress: initializeUserAccount }]
        );
      } else {
        Alert.alert(
          'Auto-Funding Failed',
          'Unable to fund wallet automatically due to rate limits.\n\nTry Quick Demo mode for a pre-funded wallet!',
          [{ text: 'OK' }, { text: 'Quick Demo', onPress: switchToQuickDemo }]
        );
      }
    } catch (error) {
      console.error('Funding attempt failed:', error);
      Alert.alert(
        'Funding Error',
        'Automatic funding failed. Try Quick Demo mode for instant access!',
        [{ text: 'OK' }, { text: 'Quick Demo', onPress: switchToQuickDemo }]
      );
    }
  };

  const switchToQuickDemo = async () => {
    try {
      console.log('🚀 Switching to Quick Demo mode...');

      // Get or create a pre-funded demo wallet
      const { publicKey, hasFunds } = await intentFiMobile.getOrCreateFundedWallet();

      // Update the current user keypair to use the demo wallet
      const storedWallet = await AsyncStorage.getItem('secure_wallet_data');
      if (storedWallet) {
        const parsed = JSON.parse(storedWallet);
        if (parsed.privateKey && Array.isArray(parsed.privateKey)) {
          const secretKeyArray = new Uint8Array(parsed.privateKey);
          if (secretKeyArray.length === 64) {
            const demoKeypair = Keypair.fromSecretKey(secretKeyArray);
            setUserKeypair(demoKeypair);
          }
        }
      }

      // Try to fund if needed
      if (!hasFunds) {
        await intentFiMobile.ensureWalletFunded(publicKey, 0.05);
      }

      Alert.alert(
        'Quick Demo Ready! 🚀',
        `Demo wallet activated: ${publicKey.toString().slice(0, 8)}...\n\n✨ You can now try IntentFI features!`,
        [{ text: 'Start Using', onPress: () => setShowIntentBuilder(true) }]
      );

      // Refresh user profile
      await fetchUserProfile();
    } catch (error) {
      console.error('Failed to switch to Quick Demo:', error);
      Alert.alert('Demo Setup Error', 'Please restart the app to try again.');
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
    if (!userProfile?.account) {
      Alert.alert('Setup Required', 'Please initialize your user account first');
      return;
    }

    setBuilderIntentType('swap');
    setShowIntentBuilder(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleFABPress = () => {
    if (!userProfile?.account) {
      Alert.alert('Setup Required', 'Please initialize your user account first');
      return;
    }

    setBuilderIntentType(intentTypes[selectedTab].title.toLowerCase() as any);
    setShowIntentBuilder(true);
  };

  const handleCreateIntent = async (intentData: any) => {
    if (!userKeypair) return;

    try {
      setLoading(true);
      let signature = '';

      if (intentData.type === 'swap') {
        // Create swap intent
        signature = await intentFiMobile.createAndExecuteSwapIntent(
          userKeypair,
          new PublicKey('So11111111111111111111111111111111111111112'), // SOL
          new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // USDC
          parseFloat(intentData.amount) * LAMPORTS_PER_SOL,
          intentData.slippage || 300
        );

        Alert.alert('Swap Intent Created!', `Transaction: ${signature.slice(0, 20)}...`);
      } else if (intentData.type === 'lend') {
        // Create lending intent
        signature = await intentFiMobile.createAndExecuteLendIntent(
          userKeypair,
          new PublicKey('So11111111111111111111111111111111111111112'), // SOL
          parseFloat(intentData.amount) * LAMPORTS_PER_SOL,
          intentData.minApy || 500
        );

        Alert.alert('Lend Intent Created!', `Transaction: ${signature.slice(0, 20)}...`);
      }

      console.log('Creating intent:', intentData, 'Signature:', signature);
      setShowIntentBuilder(false);

      // Refresh user profile
      await fetchUserProfile();

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (error: any) {
      console.error('❌ Intent creation failed:', error);
      Alert.alert('Error', error.message || 'Failed to create intent');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await fetchUserProfile();
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

  return (
    <SafeAreaView className="bg-dark-bg flex-1">
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

      {/* User Account Status */}
      {isInitialized && userKeypair && (
        <Animated.View entering={FadeInUp.duration(600).delay(50)} className="mx-4 mb-4">
          <View className="bg-dark-card border-dark-border rounded-xl border p-4">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="font-semibold text-white">User Account</Text>
                <Text className="font-mono text-xs text-gray-400">
                  {userKeypair.publicKey.toString().slice(0, 20)}...
                </Text>
              </View>

              {!userProfile?.account ? (
                <TouchableOpacity
                  onPress={initializeUserAccount}
                  disabled={loading}
                  className="bg-primary rounded-lg px-4 py-2">
                  <Text className="font-semibold text-white">
                    {loading ? 'Setting up...' : 'Activate Account'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View className="items-end">
                  <Text className="text-primary font-semibold">✓ Active</Text>
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
        <View className="bg-dark-card border-dark-border relative flex-row rounded-2xl border p-2">
          {/* Animated Tab Indicator */}
          <Animated.View
            style={[animatedTabStyle]}
            className="bg-primary absolute left-2 top-2 h-12 w-1/4 rounded-xl"
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
          className="bg-dark-card border-dark-border mx-4 mb-6 rounded-2xl border p-6">
          <View className="mb-3 flex-row items-center">
            <View className="bg-primary/20 mr-4 h-12 w-12 items-center justify-center rounded-full">
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
                  className="bg-dark-card border-dark-border mr-4 w-64 rounded-xl border p-4">
                  <View className="mb-2 flex-row items-center">
                    <Text className="text-primary mr-2 font-semibold">{template.from}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#8E8E93" />
                    <Text className="text-primary ml-2 font-semibold">{template.to}</Text>
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
            <View className="bg-dark-card border-dark-border items-center rounded-xl border p-6">
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
                className="bg-dark-card border-dark-border mb-3 flex-row items-center justify-between rounded-xl border p-4">
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
