import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInUp,
  SlideInRight,
} from 'react-native-reanimated';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as Haptics from 'expo-haptics';

// Import components
import { FloatingActionButton } from '../components/FloatingActionButton';
import { IntentBuilder } from '../components/IntentBuilder';
import { PullToRefresh } from '../components/PullToRefresh';

// Import IntentFI services
import { intentFiMobile, networkService, transactionService } from '../services';
import { useSolana } from '../providers/SolanaProvider';
import { usePhantomWallet } from '../providers/PhantomProvider';

// Import types
import type { UserProfile, IntentBuilderData } from '../types';

const { width } = Dimensions.get('window');

export function IntentScreen() {
  const {
    publicKey,
    connected,
    balance,
    refreshBalances,
    executeSwapIntent,
    executeLendIntent,
    activeIntents,
  } = useSolana();
  const { sharedSecret, session, dappKeyPair, signTransaction } = usePhantomWallet();

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

  const fetchUserProfile = useCallback(async () => {
    if (!publicKey) return;

    const timeout = (ms: number) =>
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${ms / 1000} seconds`)), ms)
      );

    try {
      console.log('👤 Fetching user profile...');
      console.log('👤 Public key:', publicKey.toString());

      const [userAccountPDA] =
        await intentFiMobile.advancedSDK.intentFi.getUserAccountPDA(publicKey);
      console.log('👤 User Account PDA:', userAccountPDA.toString());

      const userAccountInfo = await networkService.getConnection().getAccountInfo(userAccountPDA);

      if (userAccountInfo) {
        console.log('✅ User account PDA exists!');
        console.log('📦 Account data length:', userAccountInfo.data.length);
        console.log('👑 Account owner:', userAccountInfo.owner.toString());

        const basicProfile: UserProfile = {
          account: {
            authority: publicKey,
            activeIntents: 0,
            totalIntentsCreated: 0,
            totalVolume: 0,
          },
          intents: [],
          network: 'devnet',
          isMainnet: false,
        };

        console.log('✅ Creating basic profile from existing account');
        setUserProfile(basicProfile);
        setRecentIntents([]);

        // Background full profile fetch
        setTimeout(async () => {
          try {
            const fullProfile = (await Promise.race([
              intentFiMobile.getUserProfile(publicKey),
              timeout(5000),
            ])) as UserProfile;

            console.log('✅ Background profile fetch successful');
            setUserProfile(fullProfile);

            if (fullProfile?.intents) {
              const formattedIntents = fullProfile.intents.map((intent: any, index: number) => ({
                id: index + 1,
                type: intent.intentType,
                description: `${intent.intentType} ${intent.amount / LAMPORTS_PER_SOL} SOL`,
                status: intent.status.toLowerCase(),
                timestamp: new Date(intent.createdAt * 1000).toLocaleString(),
                value: `${intent.amount / LAMPORTS_PER_SOL} SOL`,
              }));
              setRecentIntents(formattedIntents);
              console.log('👤 Formatted intents:', formattedIntents.length);
            } else {
              console.log('👤 No intents found in profile');
              setRecentIntents([]);
            }
          } catch {
            console.log('⚠️ Background profile fetch failed, keeping basic profile');
          }
        }, 100);

        return;
      }

      // User account doesn't exist
      console.log('❌ User account PDA does not exist yet');
      const emptyProfile: UserProfile = {
        account: null,
        intents: [],
        network: 'devnet',
        isMainnet: false,
      };
      setUserProfile(emptyProfile);
      setRecentIntents([]);
      console.log('✅ Set empty user profile (account not created yet)');
    } catch (error: any) {
      console.error('❌ Failed to fetch user profile:', error);
      console.error('❌ Error message:', error?.message);

      const fallbackProfile: UserProfile = {
        account: null,
        intents: [],
        network: 'devnet',
        isMainnet: false,
      };
      setUserProfile(fallbackProfile);
      setRecentIntents([]);
      console.log('⚠️ Set fallback empty profile due to error');
    }
  }, [publicKey]);

  const initializeIntentFI = useCallback(async () => {
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
  }, [publicKey, fetchUserProfile]);

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

      console.log('🚀 Wallet ready, checking protocol state...');

      // Check if protocol state exists
      const [protocolStatePDA] = await intentFiMobile.advancedSDK.intentFi.getProtocolStatePDA();
      const protocolStateInfo = await networkService
        .getConnection()
        .getAccountInfo(protocolStatePDA);

      if (!protocolStateInfo) {
        console.log('⚠️ Protocol state not found, this might be the issue');
        Alert.alert(
          'Protocol Not Initialized',
          'The IntentFI protocol has not been initialized on devnet yet. This could be why the transaction is failing.',
          [
            { text: 'OK' },
            {
              text: 'Try Anyway',
              onPress: async () => {
                console.log('🔄 User chose to try anyway, proceeding...');
                await proceedWithUserInitialization();
              },
            },
          ]
        );
        return;
      }

      console.log('✅ Protocol state found, proceeding with user initialization');
      await proceedWithUserInitialization();
    } catch (error: any) {
      console.error('❌ Failed to check protocol state:', error);

      // Still try to proceed - the error might be something else
      console.log('🔄 Proceeding despite protocol check error...');
      await proceedWithUserInitialization();
    } finally {
      setLoading(false);
    }
  };

  const proceedWithUserInitialization = async () => {
    try {
      console.log('🚀 Creating IntentFI user initialization transaction...');

      // Ensure publicKey is not null before proceeding
      if (!publicKey) {
        console.error('❌ PublicKey is null, cannot proceed');
        Alert.alert('Error', 'Wallet public key is not available. Please reconnect your wallet.');
        return;
      }

      // Create the actual IntentFI user initialization transaction
      const transaction = await intentFiMobile.advancedSDK.intentFi.initializeUser(publicKey);

      console.log('📦 IntentFI user initialization transaction created');
      console.log('🔧 Transaction details:', {
        instructionCount: transaction.instructions.length,
        programId: networkService.getIntentFiProgramId().toString(),
      });

      // Log the accounts in the instruction for debugging
      if (transaction.instructions.length > 0) {
        const instruction = transaction.instructions[0];
        console.log(
          '🔍 Instruction accounts:',
          instruction.keys.map((key) => ({
            pubkey: key.pubkey.toString(),
            isSigner: key.isSigner,
            isWritable: key.isWritable,
          }))
        );

        // Also check if the user account PDA already exists
        const [userAccountPDA] =
          await intentFiMobile.advancedSDK.intentFi.getUserAccountPDA(publicKey);
        console.log('👤 User Account PDA:', userAccountPDA.toString());

        const userAccountInfo = await networkService.getConnection().getAccountInfo(userAccountPDA);
        if (userAccountInfo) {
          console.log(
            '⚠️ User account already exists! This might be why initialization is failing.'
          );
          console.log('📦 Existing account data length:', userAccountInfo.data.length);
          console.log('👑 Account owner:', userAccountInfo.owner.toString());
        } else {
          console.log('✅ User account does not exist yet - initialization should work');
        }
      }

      // Use the signTransaction function from PhantomProvider
      if (signTransaction) {
        const result = await signTransaction(transaction, async () => {
          // This callback will be called when the transaction is successfully processed
          console.log('🔄 Transaction successful, refreshing user profile...');
          await fetchUserProfile();
          await refreshBalances();
          console.log('✅ User profile refreshed after successful initialization');
        });

        if (result) {
          console.log('✅ Transaction sent to Phantom for signing:', result);
          Alert.alert(
            'Account Initialization',
            'IntentFI user account initialization sent to Phantom for signing. Please check your wallet app.',
            [{ text: 'OK' }]
          );

          // Also refresh after a delay to catch successful transactions
          setTimeout(async () => {
            console.log('🔄 Auto-refreshing user profile after transaction...');
            await fetchUserProfile();
            await refreshBalances();
          }, 3000); // Wait 3 seconds for transaction to be processed
        } else {
          console.error('❌ Transaction signing failed or was rejected');
          Alert.alert('Transaction Failed', 'Failed to sign the transaction. Please try again.', [
            { text: 'OK' },
          ]);
        }
      } else {
        console.error('❌ signTransaction function not available');
        Alert.alert(
          'Wallet Error',
          'Unable to send transaction to Phantom. Please reconnect your wallet.',
          [{ text: 'OK' }]
        );
      }
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
    }
  };

  useEffect(() => {
    if (publicKey && connected) {
      initializeIntentFI();
    }
  }, [publicKey, connected, initializeIntentFI]);

  useEffect(() => {
    if (sharedSecret && session && dappKeyPair) {
      console.log('🔑 Shared secret:', sharedSecret);
      console.log('🔑 Session:', session);
      console.log('🔑 Dapp key pair:', dappKeyPair);
    }
  }, [sharedSecret, session, dappKeyPair]);

  useEffect(() => {
    if (publicKey && connected && isInitialized) {
      testProtocolState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, connected, isInitialized]);

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
    console.log('🎯 FAB pressed');
    console.log('🔍 Current state:', {
      publicKey: !!publicKey,
      connected,
      userProfileAccount: !!userProfile?.account,
      selectedTab,
      showIntentBuilder,
    });

    if (!publicKey || !connected) {
      Alert.alert('Setup Required', 'Please connect your wallet first');
      return;
    }

    if (!userProfile?.account) {
      Alert.alert('Setup Required', 'Please initialize your user account first');
      return;
    }

    const intentType = intentTypes[selectedTab].title.toLowerCase() as any;
    console.log('🎯 Setting intent type:', intentType);

    setBuilderIntentType(intentType);

    // Small delay to ensure component is ready
    setTimeout(() => {
      setShowIntentBuilder(true);
      console.log('🎯 Modal should now be visible');
    }, 50);
  };

  const handleCreateIntent = async (intentData: IntentBuilderData) => {
    console.log('📝 IntentScreen.handleCreateIntent called with:', intentData);

    // The IntentBuilder already executed the intent and created the transaction
    // This callback is just for UI updates and cleanup
    console.log('✅ Intent already executed by IntentBuilder, just updating UI');

    try {
      setLoading(true);

      // Close the modal
      setShowIntentBuilder(false);

      // Refresh user profile and balances
      await fetchUserProfile();
      await refreshBalances();

      // Show success feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      console.log('✅ IntentScreen UI updated after intent creation');
    } catch (error: any) {
      console.error('❌ Failed to update UI after intent creation:', error);
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

  const testProtocolState = async () => {
    if (!publicKey) return;

    try {
      console.log('🔍 Testing protocol state...');
      const [protocolStatePDA] = await intentFiMobile.advancedSDK.intentFi.getProtocolStatePDA();
      console.log('📍 Protocol State PDA:', protocolStatePDA.toString());

      const protocolStateInfo = await networkService
        .getConnection()
        .getAccountInfo(protocolStatePDA);
      console.log('📊 Protocol State Info:', protocolStateInfo);

      if (protocolStateInfo) {
        console.log('✅ Protocol state exists');
        console.log('📦 Data length:', protocolStateInfo.data.length);
        console.log('👑 Owner:', protocolStateInfo.owner.toString());
      } else {
        console.log('❌ Protocol state does not exist');
      }
    } catch (error) {
      console.error('❌ Error checking protocol state:', error);
    }
  };

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
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={initializeUserAccount}
                    disabled={loading}
                    className="rounded-lg  bg-primary px-4 py-2">
                    <Text className="text-center font-semibold text-white">
                      {loading ? 'Initializing...' : 'Initialize IntentFI Account'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      console.log('🔄 Manual refresh triggered...');
                      await fetchUserProfile();
                      await refreshBalances();
                    }}
                    disabled={loading}
                    className="rounded-lg bg-gray-600 px-3 py-2">
                    <Ionicons name="refresh" size={20} color="white" />
                  </TouchableOpacity>
                </View>
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
            Recent Intents ({recentIntents.length + activeIntents.length})
          </Text>

          {recentIntents.length === 0 && activeIntents.length === 0 ? (
            <View className="items-center rounded-xl border border-dark-border bg-dark-card p-6">
              <Ionicons name="flash-outline" size={48} color="#8E8E93" />
              <Text className="mt-4 text-center text-gray-400">
                {!userProfile?.account
                  ? 'Initialize your account to start creating intents'
                  : 'No intents created yet. Create your first intent!'}
              </Text>
            </View>
          ) : (
            <>
              {/* Show active intents from SolanaProvider first */}
              {activeIntents
                .slice()
                .reverse()
                .map((intent) => (
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
                        <Text className="ml-2 text-xs text-gray-500">
                          {intent.status === 'completed' ? 'Blockchain' : 'Processing'}
                        </Text>
                      </View>
                      <Text className="mb-1 text-sm text-gray-400">
                        {intent.params?.amount || 'N/A'}{' '}
                        {intent.params?.fromMint === 'So11111111111111111111111111111111111111112'
                          ? 'SOL'
                          : 'tokens'}
                      </Text>
                      <Text className="text-xs text-gray-500">
                        {new Date(intent.createdAt).toLocaleString()}
                      </Text>
                      {intent.txId &&
                        intent.txId !== 'pending_signature' &&
                        intent.status === 'completed' && (
                          <TouchableOpacity
                            onPress={() => {
                              if (intent.txId?.length === 88) {
                                // Real Solana signature length
                                Linking.openURL(
                                  `https://explorer.solana.com/tx/${intent.txId}?cluster=devnet`
                                );
                              }
                            }}
                            className="mt-1">
                            <Text className="text-xs text-blue-400 underline">
                              View on Explorer: {intent.txId?.slice(0, 8)}...
                              {intent.txId?.slice(-8)}
                            </Text>
                          </TouchableOpacity>
                        )}
                    </View>
                    <Text
                      className="font-semibold"
                      style={{ color: getStatusColor(intent.status) }}>
                      {intent.status.toUpperCase()}
                    </Text>
                  </View>
                ))}

              {/* Show IntentFI intents */}
              {recentIntents.map((intent) => (
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
                      <Text className="ml-2 text-xs text-gray-500">IntentFI</Text>
                    </View>
                    <Text className="mb-1 text-sm text-gray-400">{intent.description}</Text>
                    <Text className="text-xs text-gray-500">{intent.timestamp}</Text>
                  </View>
                  <Text className="font-semibold" style={{ color: getStatusColor(intent.status) }}>
                    {intent.value}
                  </Text>
                </View>
              ))}
            </>
          )}
        </Animated.View>
      </PullToRefresh>

      {/* Floating Action Button */}
      {userProfile?.account && !loading && (
        <FloatingActionButton onPress={handleFABPress} icon="flash" />
      )}

      {/* Intent Builder Modal */}
      <Modal
        visible={showIntentBuilder}
        animationType="slide"
        presentationStyle="fullScreen"
        transparent={false}
        statusBarTranslucent={true}
        onRequestClose={() => {
          console.log('🚪 Modal onRequestClose called');
          setShowIntentBuilder(false);
        }}>
        <IntentBuilder
          key={`${builderIntentType}-${showIntentBuilder}`}
          intentType={builderIntentType}
          onClose={() => {
            console.log('🚪 IntentBuilder onClose called');
            setShowIntentBuilder(false);
          }}
          onCreateIntent={handleCreateIntent}
        />
      </Modal>
    </SafeAreaView>
  );
}
