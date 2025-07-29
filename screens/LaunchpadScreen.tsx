import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInRight, BounceIn } from 'react-native-reanimated';
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import launchpad services
import { intentFiMobile, networkService, walletService } from '../services';
import { useSolana } from '../providers/SolanaProvider';
import { usePhantomWallet } from '../providers/PhantomProvider';
import { CreateLaunchParams, ContributeParams } from '../contracts/LaunchpadExecutor';

// Use the LaunchData from LaunchpadExecutor to avoid type conflicts
import type { LaunchData } from '../contracts/LaunchpadExecutor';

export function LaunchpadScreen() {
  const {
    connected,
    publicKey,
    createTokenLaunch: createLaunchOnChain,
    contributeToLaunch: contributeOnChain,
    activeLaunches: realActiveLaunches,
    refreshLaunches,
  } = useSolana();
  const { signTransaction } = usePhantomWallet();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isInitialized, setIsInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userKeypair, setUserKeypair] = useState<Keypair | null>(null);
  const [launchpadState, setLaunchpadState] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showContributeModal, setShowContributeModal] = useState(false);
  const [selectedLaunch, setSelectedLaunch] = useState<LaunchData | null>(null);

  // Create launch form
  const [launchForm, setLaunchForm] = useState({
    tokenName: '',
    tokenSymbol: '',
    tokenUri: '',
    decimals: 9,
    softCap: '',
    hardCap: '',
    tokenPrice: '',
    tokensForSale: '',
    minContribution: '',
    maxContribution: '',
    launchDuration: '7', // days
  });

  // Contribute form
  const [contributeAmount, setContributeAmount] = useState('');

  const categories = ['All', 'DeFi', 'Gaming', 'Infrastructure', 'Meme'];

  useEffect(() => {
    initializeLaunchpad();
  }, []);

  useEffect(() => {
    // Only refresh launches once when initially connected
    if (connected && publicKey && !isInitialized) {
      refreshLaunches();
    }
  }, [connected, publicKey, isInitialized]);

  const initializeLaunchpad = async () => {
    try {
      setLoading(true);

      // Initialize SDK for devnet
      await intentFiMobile.initialize('devnet');
      console.log('✅ Launchpad SDK initialized on devnet');

      // Use the connected Phantom wallet if available
      if (connected && publicKey) {
        console.log(
          '✅ Using connected Phantom wallet for Launchpad:',
          publicKey.toString().slice(0, 8) + '...'
        );
        // No need to create or fund wallet - user has their own Phantom wallet with funds
      } else {
        // Fallback: Get or create a funded wallet seamlessly
        const { publicKey: walletPublicKey, hasFunds } =
          await intentFiMobile.getOrCreateFundedWallet();
        console.log(
          '👤 Launchpad fallback wallet ready:',
          walletPublicKey.toString().slice(0, 8) + '...'
        );

        // Ensure wallet has minimum funds for operations
        if (!hasFunds) {
          console.log('💧 Ensuring launchpad wallet is funded...');
          const fundingResult = await intentFiMobile.ensureWalletFunded(walletPublicKey, 0.1);
          if (!fundingResult) {
            console.warn('⚠️ Wallet funding failed - some launchpad features may be limited');
          }
        }
      }

      // Create Keypair object for backward compatibility
      const storedWallet = await AsyncStorage.getItem('secure_wallet_data');
      if (storedWallet) {
        const parsed = JSON.parse(storedWallet);
        if (parsed.privateKey && Array.isArray(parsed.privateKey)) {
          try {
            const secretKeyArray = new Uint8Array(parsed.privateKey);
            if (secretKeyArray.length === 64) {
              const testKeypair = Keypair.fromSecretKey(secretKeyArray);
              setUserKeypair(testKeypair);
            } else {
              console.error('Invalid secret key size in Launchpad:', secretKeyArray.length);
            }
          } catch (error) {
            console.error('Failed to reconstruct keypair in Launchpad:', error);
          }
        }
      }

      setIsInitialized(true);

      // Fetch launchpad state
      await fetchLaunchpadData();

      // Fetch launches only once during initialization
      await refreshLaunches();
    } catch (error) {
      console.error('❌ Failed to initialize Launchpad:', error);
      // Don't show error alert - allow user to continue with limited functionality
      setIsInitialized(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchLaunchpadData = async () => {
    try {
      const state = await intentFiMobile.advancedSDK.launchpad.getLaunchpadState();
      setLaunchpadState(state);

      // For demo, we'll show some example launches
      // In production, you'd fetch all launches from the blockchain
      console.log('📊 Launchpad state:', state);
    } catch (error) {
      console.error('❌ Failed to fetch launchpad data:', error);
    }
  };

  const createTokenLaunch = async () => {
    if (!connected || !publicKey) {
      Alert.alert('Wallet Required', 'Please connect your Phantom wallet first');
      return;
    }

    // Validate form
    if (
      !launchForm.tokenName ||
      !launchForm.tokenSymbol ||
      !launchForm.softCap ||
      !launchForm.hardCap
    ) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);

      const launchParams: CreateLaunchParams = {
        tokenName: launchForm.tokenName,
        tokenSymbol: launchForm.tokenSymbol,
        tokenUri:
          launchForm.tokenUri ||
          `https://metadata.example.com/${launchForm.tokenSymbol.toLowerCase()}.json`,
        decimals: parseInt(launchForm.decimals.toString()),
        softCap: parseFloat(launchForm.softCap) * LAMPORTS_PER_SOL,
        hardCap: parseFloat(launchForm.hardCap) * LAMPORTS_PER_SOL,
        tokenPrice: parseFloat(launchForm.tokenPrice || '0.01') * LAMPORTS_PER_SOL,
        tokensForSale: parseFloat(launchForm.tokensForSale || '1000000'),
        minContribution: parseFloat(launchForm.minContribution || '0.1') * LAMPORTS_PER_SOL,
        maxContribution: parseFloat(launchForm.maxContribution || '10') * LAMPORTS_PER_SOL,
        launchDuration: parseInt(launchForm.launchDuration) * 24 * 3600, // convert days to seconds
      };

      console.log('🚀 Creating token launch with real on-chain transaction:', launchParams);

      // Use the real on-chain function from SolanaProvider
      const txId = await createLaunchOnChain(launchParams);

      if (txId === 'pending_signature') {
        Alert.alert(
          'Launch Sent to Phantom! 🚀',
          'Your token launch transaction has been sent to Phantom for signing. Please check your wallet app to complete the transaction.',
          [{ text: 'Got it!', onPress: () => setShowCreateModal(false) }]
        );
      } else {
        Alert.alert(
          'Launch Created! 🎉',
          `Your token launch has been created successfully!\n\nTransaction: ${txId.slice(0, 8)}...`,
          [{ text: 'Awesome!', onPress: () => setShowCreateModal(false) }]
        );
      }

      resetCreateForm();
      // Refresh will be called by the success callback
    } catch (error: any) {
      console.error('❌ Launch creation failed:', error);
      Alert.alert('Launch Failed', error.message || 'Failed to create token launch', [
        { text: 'Try Again' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const contributeToLaunch = async () => {
    if (!connected || !publicKey) {
      Alert.alert('Wallet Required', 'Please connect your Phantom wallet first');
      return;
    }

    if (!selectedLaunch || !contributeAmount) {
      Alert.alert('Error', 'Please enter a contribution amount');
      return;
    }

    try {
      setLoading(true);

      // Convert SOL to lamports
      const contributionLamports = Math.floor(parseFloat(contributeAmount) * LAMPORTS_PER_SOL);

      // Validate contribution amount against launch requirements
      if (contributionLamports < selectedLaunch.minContribution) {
        const minSOL = selectedLaunch.minContribution / LAMPORTS_PER_SOL;
        Alert.alert(
          'Contribution Too Low',
          `Minimum contribution is ${minSOL} SOL (${selectedLaunch.minContribution} lamports). You entered ${contributeAmount} SOL (${contributionLamports} lamports).`,
          [{ text: 'OK' }]
        );
        return;
      }

      if (contributionLamports > selectedLaunch.maxContribution) {
        const maxSOL = selectedLaunch.maxContribution / LAMPORTS_PER_SOL;
        Alert.alert(
          'Contribution Too High',
          `Maximum contribution is ${maxSOL} SOL (${selectedLaunch.maxContribution} lamports). You entered ${contributeAmount} SOL (${contributionLamports} lamports).`,
          [{ text: 'OK' }]
        );
        return;
      }

      // Check token availability (using same calculation as contract)
      const contributionInLamports = parseFloat(contributeAmount) * LAMPORTS_PER_SOL;
      const decimals = 9; // Assuming 9 decimals - should match contract
      const tokensToReceive = Math.floor(
        (contributionInLamports * Math.pow(10, decimals)) / selectedLaunch.tokenPrice
      );
      const availableTokens = selectedLaunch.tokensForSale - selectedLaunch.tokensSold;

      if (tokensToReceive > availableTokens) {
        const maxAvailableSOL =
          Math.floor((availableTokens * selectedLaunch.tokenPrice) / Math.pow(10, decimals)) /
          LAMPORTS_PER_SOL;
        Alert.alert(
          'Not Enough Tokens Available',
          `You're trying to buy ${tokensToReceive.toFixed(0)} tokens, but only ${availableTokens.toLocaleString()} ${selectedLaunch.tokenSymbol} are available.\n\nMaximum you can contribute: ${maxAvailableSOL.toFixed(4)} SOL`,
          [{ text: 'OK' }]
        );
        return;
      }

      const contributionParams: ContributeParams = {
        launchPubkey: new PublicKey(selectedLaunch.creator), // In real implementation, this would be the launch PDA
        contributionAmount: contributionLamports,
        tokenMint: selectedLaunch.tokenMint, // Pass the token mint for proper validation
      };

      console.log('💰 Contributing to launch with real on-chain transaction:', contributionParams);
      console.log('💰 Validation passed:', {
        contributionSOL: contributeAmount,
        contributionLamports,
        minRequired: selectedLaunch.minContribution,
        maxAllowed: selectedLaunch.maxContribution,
      });

      // Use the real on-chain function from SolanaProvider
      const txId = await contributeOnChain(contributionParams);

      if (txId === 'pending_signature') {
        Alert.alert(
          'Contribution Sent to Phantom! 💰',
          `Your contribution of ${contributeAmount} SOL has been sent to Phantom for signing. Please check your wallet app to complete the transaction.`,
          [{ text: 'Got it!', onPress: () => setShowContributeModal(false) }]
        );
      } else {
        Alert.alert(
          'Contribution Successful! 🎉',
          `Successfully contributed ${contributeAmount} SOL to the launch!\n\nTransaction: ${txId.slice(0, 8)}...`,
          [{ text: 'Great!', onPress: () => setShowContributeModal(false) }]
        );
      }

      setContributeAmount('');
      // Refresh will be called by the success callback
    } catch (error: any) {
      console.error('❌ Contribution failed:', error);
      Alert.alert('Contribution Failed', error.message || 'Failed to contribute to launch', [
        { text: 'Try Again' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const resetCreateForm = () => {
    setLaunchForm({
      tokenName: '',
      tokenSymbol: '',
      tokenUri: '',
      decimals: 9,
      softCap: '',
      hardCap: '',
      tokenPrice: '',
      tokensForSale: '',
      minContribution: '',
      maxContribution: '',
      launchDuration: '7',
    });
  };

  const formatSOL = (lamports: number) => {
    return (lamports / LAMPORTS_PER_SOL).toFixed(2);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
        return '#F59E0B';
      case 'Successful':
        return '#10B981';
      case 'Failed':
        return '#EF4444';
      default:
        return '#8E8E93';
    }
  };

  const calculateProgress = (raised: number, target: number) => {
    return Math.min((raised / target) * 100, 100);
  };

  if (!isInitialized) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-dark-bg">
        <ActivityIndicator size="large" color="#FF4500" />
        <Text className="mt-4 text-white">Initializing Launchpad...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-dark-bg">
      {/* Header */}
      <Animated.View
        entering={FadeInUp.duration(600)}
        className="flex-row items-center justify-between p-4">
        <View>
          <Text className="text-2xl font-bold text-white">🚀 Launchpad</Text>
        </View>
        <View className="flex-row">
          <TouchableOpacity
            onPress={() => {
              setLoading(true);
              refreshLaunches().finally(() => setLoading(false));
            }}
            className="mr-3 rounded-lg border border-dark-border bg-dark-card px-4 py-2"
            disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color="#FF4500" />
            ) : (
              <Ionicons name="refresh" size={18} color="#8E8E93" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowCreateModal(true)}
            className="rounded-lg bg-primary px-4 py-2"
            disabled={loading}>
            <Text className="font-semibold text-white">Create Launch</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* User Info */}
      {userKeypair && (
        <Animated.View entering={FadeInUp.duration(600).delay(50)} className="mx-4 mb-4">
          <View className="rounded-xl border border-dark-border bg-dark-card p-4">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="font-semibold text-white">Your Wallet</Text>
                <Text className="font-mono text-xs text-gray-400">
                  {userKeypair.publicKey.toString().slice(0, 20)}...
                </Text>
              </View>
              <View className="items-end">
                <Text className="font-semibold text-primary">✓ Connected</Text>
                <Text className="text-xs text-gray-400">Devnet Ready</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Platform Stats */}
      {launchpadState && (
        <Animated.View entering={FadeInUp.duration(600).delay(100)} className="mx-4 mb-6">
          <View className="rounded-xl border border-dark-border bg-dark-card p-4">
            <Text className="mb-3 font-semibold text-white">Platform Statistics</Text>
            <View className="flex-row justify-between">
              <View className="items-center">
                <Text className="text-lg font-bold text-primary">
                  {launchpadState.totalLaunches || 0}
                </Text>
                <Text className="text-xs text-gray-400">Total Launches</Text>
              </View>
              <View className="items-center">
                <Text className="text-lg font-bold text-primary">
                  {formatSOL(launchpadState.totalRaised || 0)} SOL
                </Text>
                <Text className="text-xs text-gray-400">Total Raised</Text>
              </View>
              <View className="items-center">
                <Text className="text-lg font-bold text-primary">
                  {launchpadState.platformFeeBps / 100 || 0}%
                </Text>
                <Text className="text-xs text-gray-400">Platform Fee</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Category Filter */}
      <Animated.View entering={FadeInRight.duration(600).delay(200)} className="mb-6 px-4">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {categories.map((category) => (
            <TouchableOpacity
              key={category}
              onPress={() => setSelectedCategory(category)}
              className={`mr-3 rounded-full px-4 py-2 ${
                selectedCategory === category
                  ? 'bg-primary'
                  : 'border border-dark-border bg-dark-card'
              }`}>
              <Text
                className={`font-semibold ${
                  selectedCategory === category ? 'text-white' : 'text-gray-400'
                }`}>
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>

      {/* Active Launches */}
      <ScrollView className="flex-1 px-4">
        <Text className="mb-4 text-xl font-bold text-white">
          Active Launches ({realActiveLaunches.length})
        </Text>

        {realActiveLaunches.length === 0 ? (
          <View className="items-center rounded-xl border border-dark-border bg-dark-card p-8">
            <Ionicons name="rocket-outline" size={48} color="#8E8E93" />
            <Text className="mt-4 text-center text-gray-400">
              No active launches yet. Be the first to create one!
            </Text>
          </View>
        ) : (
          <>
            {/* Real on-chain launches */}
            {realActiveLaunches.map((launch, index) => (
              <Animated.View
                key={`real-${launch.tokenMint.toString()}`}
                entering={BounceIn.duration(600).delay(index * 100)}
                className="mb-4">
                <View className="rounded-xl border border-dark-border bg-dark-card p-6">
                  <View className="mb-4 flex-row items-start justify-between">
                    <View className="flex-1">
                      <View className="mb-2 flex-row items-center">
                        <Text className="mr-2 text-lg font-bold text-white">
                          {launch.tokenName}
                        </Text>
                        <Text className="font-semibold text-primary">${launch.tokenSymbol}</Text>
                        <View className="ml-2 rounded bg-green-500/20 px-2 py-1">
                          <Text className="text-xs font-semibold text-green-400">REAL</Text>
                        </View>
                      </View>
                      <Text className="mb-2 text-sm text-gray-400">
                        Creator: {launch.creator.toString().slice(0, 20)}...
                      </Text>
                      <Text className="text-sm text-gray-400">
                        Token Mint: {launch.tokenMint.toString().slice(0, 20)}...
                      </Text>
                    </View>
                    <View
                      className="rounded-full px-3 py-1"
                      style={{ backgroundColor: getStatusColor(launch.status) + '20' }}>
                      <Text
                        className="text-xs font-semibold"
                        style={{ color: getStatusColor(launch.status) }}>
                        {launch.status}
                      </Text>
                    </View>
                  </View>

                  {/* Progress */}
                  <View className="mb-4">
                    <View className="mb-2 flex-row justify-between">
                      <Text className="font-semibold text-white">
                        {formatSOL(launch.totalRaised)} SOL raised
                      </Text>
                      <Text className="text-gray-400">{formatSOL(launch.hardCap)} SOL goal</Text>
                    </View>
                    <View className="h-2 overflow-hidden rounded-full bg-gray-700">
                      <View
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${calculateProgress(launch.totalRaised, launch.hardCap)}%`,
                        }}
                      />
                    </View>
                    <Text className="mt-1 text-xs text-gray-400">
                      {calculateProgress(launch.totalRaised, launch.hardCap).toFixed(1)}% complete
                    </Text>
                  </View>

                  {/* Stats */}
                  <View className="mb-4 flex-row justify-between">
                    <View className="items-center">
                      <Text className="font-semibold text-white">{launch.totalContributors}</Text>
                      <Text className="text-xs text-gray-400">Contributors</Text>
                    </View>
                    <View className="items-center">
                      <Text className="font-semibold text-white">
                        {formatSOL(launch.tokenPrice)} SOL
                      </Text>
                      <Text className="text-xs text-gray-400">Price/Token</Text>
                    </View>
                    <View className="items-center">
                      <Text className="font-semibold text-white">
                        {formatSOL(launch.minContribution)}-{formatSOL(launch.maxContribution)}
                      </Text>
                      <Text className="text-xs text-gray-400">SOL Range</Text>
                    </View>
                  </View>

                  {/* Action Button */}
                  {launch.status === 'Active' && (
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedLaunch(launch);
                        setShowContributeModal(true);
                      }}
                      className="rounded-lg bg-primary py-3"
                      disabled={loading}>
                      <Text className="text-center font-semibold text-white">
                        Contribute to Launch
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Animated.View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Create Launch Modal */}
      <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-dark-bg">
          <View className="flex-row items-center justify-between border-b border-dark-border p-4">
            <Text className="text-xl font-bold text-white">Create Token Launch</Text>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Ionicons name="close" size={24} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 p-4">
            <View className="space-y-4">
              <View>
                <Text className="mb-2 font-semibold text-white">Token Name *</Text>
                <TextInput
                  className="rounded-lg border border-dark-border bg-dark-card p-3 text-white"
                  placeholder="e.g., My Awesome Token"
                  placeholderTextColor="#8E8E93"
                  value={launchForm.tokenName}
                  onChangeText={(text) => setLaunchForm({ ...launchForm, tokenName: text })}
                />
              </View>

              <View>
                <Text className="mb-2 font-semibold text-white">Token Symbol *</Text>
                <TextInput
                  className="rounded-lg border border-dark-border bg-dark-card p-3 text-white"
                  placeholder="e.g., MAT"
                  placeholderTextColor="#8E8E93"
                  value={launchForm.tokenSymbol}
                  onChangeText={(text) =>
                    setLaunchForm({ ...launchForm, tokenSymbol: text.toUpperCase() })
                  }
                />
              </View>

              <View>
                <Text className="mb-2 font-semibold text-white">Soft Cap (SOL) *</Text>
                <TextInput
                  className="rounded-lg border border-dark-border bg-dark-card p-3 text-white"
                  placeholder="e.g., 10"
                  placeholderTextColor="#8E8E93"
                  keyboardType="numeric"
                  value={launchForm.softCap}
                  onChangeText={(text) => setLaunchForm({ ...launchForm, softCap: text })}
                />
              </View>

              <View>
                <Text className="mb-2 font-semibold text-white">Hard Cap (SOL) *</Text>
                <TextInput
                  className="rounded-lg border border-dark-border bg-dark-card p-3 text-white"
                  placeholder="e.g., 100"
                  placeholderTextColor="#8E8E93"
                  keyboardType="numeric"
                  value={launchForm.hardCap}
                  onChangeText={(text) => setLaunchForm({ ...launchForm, hardCap: text })}
                />
              </View>

              <View>
                <Text className="mb-2 font-semibold text-white">Token Price (SOL) *</Text>
                <TextInput
                  className="rounded-lg border border-dark-border bg-dark-card p-3 text-white"
                  placeholder="e.g., 0.01"
                  placeholderTextColor="#8E8E93"
                  keyboardType="numeric"
                  value={launchForm.tokenPrice}
                  onChangeText={(text) => setLaunchForm({ ...launchForm, tokenPrice: text })}
                />
              </View>

              <View>
                <Text className="mb-2 font-semibold text-white">Tokens for Sale *</Text>
                <TextInput
                  className="rounded-lg border border-dark-border bg-dark-card p-3 text-white"
                  placeholder="e.g., 1000000"
                  placeholderTextColor="#8E8E93"
                  keyboardType="numeric"
                  value={launchForm.tokensForSale}
                  onChangeText={(text) => setLaunchForm({ ...launchForm, tokensForSale: text })}
                />
              </View>

              <View className="flex-row space-x-4">
                <View className="flex-1">
                  <Text className="mb-2 font-semibold text-white">Min Contribution (SOL)</Text>
                  <TextInput
                    className="rounded-lg border border-dark-border bg-dark-card p-3 text-white"
                    placeholder="0.1"
                    placeholderTextColor="#8E8E93"
                    keyboardType="numeric"
                    value={launchForm.minContribution}
                    onChangeText={(text) => setLaunchForm({ ...launchForm, minContribution: text })}
                  />
                </View>
                <View className="flex-1">
                  <Text className="mb-2 font-semibold text-white">Max Contribution (SOL)</Text>
                  <TextInput
                    className="rounded-lg border border-dark-border bg-dark-card p-3 text-white"
                    placeholder="10"
                    placeholderTextColor="#8E8E93"
                    keyboardType="numeric"
                    value={launchForm.maxContribution}
                    onChangeText={(text) => setLaunchForm({ ...launchForm, maxContribution: text })}
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={createTokenLaunch}
                disabled={loading}
                className="mt-6 rounded-lg bg-primary py-4">
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-center text-lg font-bold text-white">Create Launch</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Contribute Modal */}
      <Modal visible={showContributeModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-dark-bg">
          <View className="flex-row items-center justify-between border-b border-dark-border p-4">
            <Text className="text-xl font-bold text-white">Contribute to Launch</Text>
            <TouchableOpacity onPress={() => setShowContributeModal(false)}>
              <Ionicons name="close" size={24} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          {selectedLaunch && (
            <View className="flex-1 p-4">
              <View className="mb-6 rounded-xl border border-dark-border bg-dark-card p-4">
                <Text className="mb-2 text-lg font-bold text-white">
                  {selectedLaunch.tokenName} (${selectedLaunch.tokenSymbol})
                </Text>
                <Text className="mb-2 text-gray-400">
                  Price: {formatSOL(selectedLaunch.tokenPrice)} SOL per token
                </Text>
                <Text className="mb-2 text-yellow-400">
                  Minimum: {formatSOL(selectedLaunch.minContribution)} SOL
                </Text>
                <Text className="mb-2 text-green-400">
                  Maximum: {formatSOL(selectedLaunch.maxContribution)} SOL
                </Text>
                <Text className="text-purple-400">
                  Available:{' '}
                  {(selectedLaunch.tokensForSale - selectedLaunch.tokensSold).toLocaleString()}{' '}
                  {selectedLaunch.tokenSymbol}
                </Text>
              </View>

              <View className="mb-6">
                <Text className="mb-2 font-semibold text-white">Amount to Contribute (SOL)</Text>
                <TextInput
                  className="rounded-lg border border-dark-border bg-dark-card p-4 text-lg text-white"
                  placeholder={`Min: ${formatSOL(selectedLaunch.minContribution)} SOL`}
                  placeholderTextColor="#8E8E93"
                  keyboardType="numeric"
                  value={contributeAmount}
                  onChangeText={setContributeAmount}
                />

                {/* Quick amount buttons */}
                <View className="mt-2 flex-row space-x-2">
                  <TouchableOpacity
                    onPress={() => setContributeAmount(formatSOL(selectedLaunch.minContribution))}
                    className="flex-1 rounded-lg border border-yellow-400 py-2">
                    <Text className="text-center text-yellow-400">Min Amount</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      setContributeAmount(formatSOL(selectedLaunch.minContribution * 2))
                    }
                    className="flex-1 rounded-lg border border-blue-400 py-2">
                    <Text className="text-center text-blue-400">2x Min</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      // Calculate max based on available tokens (using contract formula)
                      const availableTokens =
                        selectedLaunch.tokensForSale - selectedLaunch.tokensSold;
                      const decimals = 9; // Should match contract
                      const maxSOLForAvailableTokens =
                        Math.floor(
                          (availableTokens * selectedLaunch.tokenPrice) / Math.pow(10, decimals)
                        ) / LAMPORTS_PER_SOL;
                      const maxContribution = Math.min(
                        maxSOLForAvailableTokens,
                        selectedLaunch.maxContribution / LAMPORTS_PER_SOL
                      );
                      setContributeAmount(maxContribution.toFixed(6));
                    }}
                    className="flex-1 rounded-lg border border-green-400 py-2">
                    <Text className="text-center text-green-400">Max Available</Text>
                  </TouchableOpacity>
                </View>

                {contributeAmount && (
                  <View className="mt-2">
                    <Text className="text-gray-400">
                      You will receive: ~
                      {(() => {
                        const contributionInLamports =
                          parseFloat(contributeAmount) * LAMPORTS_PER_SOL;
                        const decimals = 9; // Should match contract
                        const tokens = Math.floor(
                          (contributionInLamports * Math.pow(10, decimals)) /
                            selectedLaunch.tokenPrice
                        );
                        return tokens.toLocaleString();
                      })()}{' '}
                      {selectedLaunch.tokenSymbol} units
                    </Text>

                    {/* Validation warnings */}
                    {parseFloat(contributeAmount) * LAMPORTS_PER_SOL <
                      selectedLaunch.minContribution && (
                      <Text className="mt-1 text-red-400">
                        ⚠️ Below minimum contribution of {formatSOL(selectedLaunch.minContribution)}{' '}
                        SOL
                      </Text>
                    )}
                    {parseFloat(contributeAmount) * LAMPORTS_PER_SOL >
                      selectedLaunch.maxContribution && (
                      <Text className="mt-1 text-red-400">
                        ⚠️ Above maximum contribution of {formatSOL(selectedLaunch.maxContribution)}{' '}
                        SOL
                      </Text>
                    )}

                    {/* Token availability check */}
                    {(() => {
                      const contributionInLamports =
                        parseFloat(contributeAmount) * LAMPORTS_PER_SOL;
                      const decimals = 9; // Should match contract
                      const tokensToReceive = Math.floor(
                        (contributionInLamports * Math.pow(10, decimals)) /
                          selectedLaunch.tokenPrice
                      );
                      const availableTokens =
                        selectedLaunch.tokensForSale - selectedLaunch.tokensSold;
                      return tokensToReceive > availableTokens ? (
                        <Text className="mt-1 text-red-400">
                          ⚠️ Not enough tokens available! Only {availableTokens.toLocaleString()}{' '}
                          {selectedLaunch.tokenSymbol} left
                        </Text>
                      ) : null;
                    })()}
                  </View>
                )}
              </View>

              <TouchableOpacity
                onPress={contributeToLaunch}
                disabled={loading || !contributeAmount}
                className="rounded-lg bg-primary py-4">
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-center text-lg font-bold text-white">
                    Contribute {contributeAmount || '0'} SOL
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
