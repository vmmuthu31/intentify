import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInDown, BounceIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

// Import our custom components
import { SwipeableCard } from '../components/SwipeableCard';
import { AnimatedButton } from '../components/AnimatedButton';
import { PullToRefresh } from '../components/PullToRefresh';
import { WalletOnboardingScreen } from './WalletOnboardingScreen';
import { useSolana } from '../providers/SolanaProvider';

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

  // Update onboarding visibility when connection status changes
  useEffect(() => {
    setShowOnboarding(!connected);
  }, [connected]);

  const getTotalPortfolioValue = () => {
    return tokenBalances.reduce((total, token) => {
      return total + token.uiAmount * (token.price || 0);
    }, 0);
  };

  const quickActions = [
    { id: 1, title: 'Swap', icon: 'swap-horizontal', color: '#FF4500' },
    { id: 2, title: 'Buy', icon: 'card', color: '#00D4AA' },
    { id: 3, title: 'Lend', icon: 'trending-up', color: '#FFB800' },
    { id: 4, title: 'Launch', icon: 'rocket', color: '#FF6B35' },
  ];

  const activeIntents = [
    {
      id: 1,
      type: 'Swap',
      description: 'Swap 10 SOL → USDC when price > $195',
      status: 'pending',
      value: '$1,950',
    },
    {
      id: 2,
      type: 'Lend',
      description: 'Lend 500 USDC at 8.2% APY on Solend',
      status: 'active',
      value: '$500',
    },
  ];

  const handleRefresh = async () => {
    if (!connected) return;
    await refreshBalances();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleQuickAction = (action: any) => {
    if (!connected) {
      Alert.alert('Wallet Required', 'Please connect your wallet first');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Quick Action', `Opening ${action.title}...`);
  };

  const handleIntentAction = (intent: any, action: string) => {
    Alert.alert('Intent Action', `${action} intent: ${intent.description}`);
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
  const portfolioChange = '+$1,234.56'; // Mock for now
  const portfolioChangePercent = '+8.4%';

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
          </View>
          <View className="flex-row items-center">
            {connected && (
              <View className="bg-success/20 mr-3 rounded-full px-3 py-1">
                <Text className="text-success text-xs font-medium">
                  {publicKey?.toString().slice(0, 4)}...{publicKey?.toString().slice(-4)}
                </Text>
              </View>
            )}
            <TouchableOpacity className="p-2">
              <Ionicons name="notifications-outline" size={24} color="#8E8E93" />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Balance Card */}
        <Animated.View entering={FadeInUp.duration(600).delay(100)} className="mx-4 mb-6">
          <LinearGradient
            colors={['#FF4500', '#FF6B35']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="rounded-2xl p-6">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-sm text-white/80">Total Portfolio</Text>
              <TouchableOpacity>
                <Ionicons name="eye-outline" size={20} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            </View>
            <Text className="mb-2 text-3xl font-bold text-white">
              $
              {portfolioValue.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            <View className="flex-row items-center">
              <Ionicons name="trending-up" size={16} color="#00D4AA" />
              <Text className="text-success ml-1 text-sm">{portfolioChange}</Text>
              <Text className="text-success ml-2 text-sm">({portfolioChangePercent})</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Top Holdings */}
        <Animated.View entering={FadeInUp.duration(600).delay(150)} className="mb-6 px-4">
          <Text className="mb-4 text-lg font-semibold text-white">Top Holdings</Text>
          <View className="flex-row space-x-3">
            {tokenBalances.slice(0, 4).map((token, index) => (
              <Animated.View
                key={token.mint}
                entering={BounceIn.duration(400).delay(index * 100)}
                className="bg-dark-card border-dark-border flex-1 rounded-2xl border p-3">
                <View className="items-center">
                  <View className="bg-primary/20 mb-2 h-10 w-10 items-center justify-center rounded-full">
                    <Text className="text-primary text-xs font-bold">{token.symbol}</Text>
                  </View>
                  <Text className="text-sm font-medium text-white">{token.symbol}</Text>
                  <Text className="text-dark-gray text-xs">
                    {token.uiAmount.toLocaleString('en-US', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: token.symbol === 'SOL' ? 3 : 0,
                    })}
                  </Text>
                  <Text className="text-xs font-semibold text-white">
                    $
                    {(token.uiAmount * (token.price || 0)).toLocaleString('en-US', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </View>
        </Animated.View>

        {/* Quick Actions */}
        <Animated.View entering={FadeInUp.duration(600).delay(200)} className="mb-6 px-4">
          <Text className="mb-4 text-lg font-semibold text-white">Quick Actions</Text>
          <View className="flex-row flex-wrap justify-between">
            {quickActions.map((action, index) => (
              <Animated.View
                key={action.id}
                entering={BounceIn.duration(600).delay(index * 100)}
                className="mb-3 w-[48%]">
                <TouchableOpacity
                  className="bg-dark-card border-dark-border items-center rounded-2xl border p-4"
                  onPress={() => handleQuickAction(action)}>
                  <View
                    className="mb-3 h-12 w-12 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${action.color}20` }}>
                    <Ionicons name={action.icon as any} size={24} color={action.color} />
                  </View>
                  <Text className="font-medium text-white">{action.title}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </Animated.View>

        {/* Active Intents with Swipe Actions */}
        <Animated.View entering={FadeInDown.duration(600).delay(300)} className="mb-6 px-4">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-white">Active Intents</Text>
            <TouchableOpacity>
              <Text className="text-primary text-sm">View All</Text>
            </TouchableOpacity>
          </View>

          {activeIntents.map((intent) => (
            <View key={intent.id} className="mb-3">
              <SwipeableCard
                leftAction={{
                  icon: 'pause',
                  color: '#FFB800',
                  label: 'Pause',
                }}
                rightAction={{
                  icon: 'trash',
                  color: '#FF4757',
                  label: 'Cancel',
                }}
                onSwipeLeft={() => handleIntentAction(intent, 'Cancel')}
                onSwipeRight={() => handleIntentAction(intent, 'Pause')}>
                <View className="bg-dark-card border-dark-border rounded-2xl border p-4">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <View className="mb-1 flex-row items-center">
                        <View
                          className={`mr-2 h-2 w-2 rounded-full ${
                            intent.status === 'active' ? 'bg-success' : 'bg-warning'
                          }`}
                        />
                        <Text className="text-primary text-sm font-medium">{intent.type}</Text>
                      </View>
                      <Text className="mb-1 text-base text-white">{intent.description}</Text>
                      <Text className="text-dark-gray text-sm capitalize">{intent.status}</Text>
                    </View>
                    <Text className="text-lg font-semibold text-white">{intent.value}</Text>
                  </View>
                </View>
              </SwipeableCard>
            </View>
          ))}

          {/* Create New Intent Button */}
          <View className="mt-4">
            <AnimatedButton
              title="Create New Intent"
              onPress={() => Alert.alert('Create Intent', 'Opening intent creation...')}
              variant="outline"
            />
          </View>
        </Animated.View>

        {/* Market Overview */}
        <Animated.View entering={FadeInDown.duration(600).delay(400)} className="mb-8 px-4">
          <Text className="mb-4 text-lg font-semibold text-white">Market Overview</Text>
          <View className="bg-dark-card border-dark-border rounded-2xl border p-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-dark-gray">SOL/USD</Text>
              <View className="flex-row items-center">
                <Ionicons name="trending-up" size={14} color="#00D4AA" />
                <Text className="text-success ml-1 text-sm">+5.2%</Text>
              </View>
            </View>
            <Text className="text-xl font-bold text-white">$189.50</Text>

            {/* Quick Trade Button */}
            <View className="mt-4">
              <AnimatedButton
                title="Quick Trade SOL"
                onPress={() => Alert.alert('Quick Trade', 'Opening SOL trading...')}
                variant="primary"
                size="small"
              />
            </View>
          </View>
        </Animated.View>
      </PullToRefresh>
    </SafeAreaView>
  );
}
