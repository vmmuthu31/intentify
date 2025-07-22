import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInUp,
  SlideInRight,
} from 'react-native-reanimated';

// Import components
import { FloatingActionButton } from '../components/FloatingActionButton';
import { IntentBuilder } from '../components/IntentBuilder';
import { PullToRefresh } from '../components/PullToRefresh';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

export function IntentScreen() {
  const [selectedTab, setSelectedTab] = useState(0);
  const [showIntentBuilder, setShowIntentBuilder] = useState(false);
  const [builderIntentType, setBuilderIntentType] = useState<'swap' | 'buy' | 'lend' | 'launch'>(
    'swap'
  );
  const translateX = useSharedValue(0);

  const intentTypes = [
    { id: 0, title: 'Swap', icon: 'swap-horizontal', description: 'Exchange tokens instantly' },
    { id: 1, title: 'Buy', icon: 'card', description: 'Purchase crypto with fiat' },
    { id: 2, title: 'Lend', icon: 'trending-up', description: 'Earn yield on your assets' },
    { id: 3, title: 'Launch', icon: 'rocket', description: 'Launch new tokens' },
  ];

  const swapExamples = [
    { from: 'SOL', to: 'USDC', description: 'Swap at best price across DEXs', amount: '10 SOL' },
    { from: 'USDC', to: 'BONK', description: 'Auto-route with low slippage', amount: '$500' },
    { from: 'mSOL', to: 'ETH', description: 'Cross-chain bridge automatically', amount: '5 mSOL' },
  ];

  const recentIntents = [
    {
      id: 1,
      type: 'Swap',
      description: 'Swap 5 SOL → 945 USDC',
      status: 'completed',
      timestamp: '2 hours ago',
      value: '+$945',
    },
    {
      id: 2,
      type: 'Lend',
      description: 'Lend 1000 USDC at 8.5% APY',
      status: 'active',
      timestamp: '1 day ago',
      value: '$1,000',
    },
    {
      id: 3,
      type: 'Buy',
      description: 'Buy $200 BONK when < $0.0008',
      status: 'pending',
      timestamp: '3 days ago',
      value: '$200',
    },
  ];

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
    setBuilderIntentType('swap');
    setShowIntentBuilder(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleFABPress = () => {
    setBuilderIntentType(intentTypes[selectedTab].title.toLowerCase() as any);
    setShowIntentBuilder(true);
  };

  const handleCreateIntent = (intentData: any) => {
    console.log('Creating intent:', intentData);
    setShowIntentBuilder(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const handleRefresh = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <SafeAreaView className="bg-dark-bg flex-1">
      {/* Header */}
      <Animated.View
        entering={FadeInUp.duration(600)}
        className="flex-row items-center justify-between p-4">
        <Text className="text-2xl font-bold text-white">Create Intent</Text>
        <TouchableOpacity className="p-2">
          <Ionicons name="help-circle-outline" size={24} color="#8E8E93" />
        </TouchableOpacity>
      </Animated.View>

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
              <Text className="text-xl font-bold text-white">{intentTypes[selectedTab].title}</Text>
              <Text className="text-dark-gray text-sm">{intentTypes[selectedTab].description}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Quick Intent Templates */}
        <Animated.View entering={FadeInUp.duration(600).delay(300)} className="mb-6 px-4">
          <Text className="mb-4 text-lg font-semibold text-white">Quick Templates</Text>

          {selectedTab === 0 && (
            <View>
              {swapExamples.map((example, index) => (
                <Animated.View
                  key={index}
                  entering={FadeInUp.duration(400).delay(index * 100)}
                  className="mb-3">
                  <TouchableOpacity
                    className="bg-dark-card border-dark-border rounded-2xl border p-4"
                    onPress={() => handleTemplatePress(example)}>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 flex-row items-center">
                        <View className="bg-primary/20 mr-3 h-10 w-10 items-center justify-center rounded-full">
                          <Text className="text-primary text-xs font-bold">{example.from}</Text>
                        </View>
                        <Ionicons name="arrow-forward" size={16} color="#8E8E93" />
                        <View className="bg-success/20 ml-3 mr-3 h-10 w-10 items-center justify-center rounded-full">
                          <Text className="text-success text-xs font-bold">{example.to}</Text>
                        </View>
                        <View className="flex-1">
                          <Text className="font-medium text-white">
                            {example.from} → {example.to}
                          </Text>
                          <Text className="text-dark-gray text-sm">{example.description}</Text>
                          <Text className="text-primary text-sm">{example.amount}</Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          )}
        </Animated.View>

        {/* Recent Intents */}
        <Animated.View entering={FadeInUp.duration(600).delay(500)} className="mb-6 px-4">
          <Text className="mb-4 text-lg font-semibold text-white">Recent Intents</Text>

          {recentIntents.map((intent, index) => (
            <Animated.View
              key={intent.id}
              entering={FadeInUp.duration(400).delay(index * 50)}
              className="mb-3">
              <View className="bg-dark-card border-dark-border rounded-2xl border p-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 flex-row items-center">
                    <View
                      className={`mr-3 h-8 w-8 items-center justify-center rounded-full ${
                        intent.status === 'completed'
                          ? 'bg-success/20'
                          : intent.status === 'active'
                            ? 'bg-warning/20'
                            : 'bg-primary/20'
                      }`}>
                      <Ionicons
                        name={
                          intent.status === 'completed'
                            ? 'checkmark'
                            : intent.status === 'active'
                              ? 'flash'
                              : 'time'
                        }
                        size={16}
                        color={
                          intent.status === 'completed'
                            ? '#00D4AA'
                            : intent.status === 'active'
                              ? '#FFB800'
                              : '#FF4500'
                        }
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="font-medium text-white">{intent.description}</Text>
                      <View className="mt-1 flex-row items-center">
                        <Text className="text-dark-gray text-sm">{intent.timestamp}</Text>
                        <Text
                          className={`ml-2 text-sm capitalize ${
                            intent.status === 'completed'
                              ? 'text-success'
                              : intent.status === 'active'
                                ? 'text-warning'
                                : 'text-primary'
                          }`}>
                          • {intent.status}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text
                    className={`font-semibold ${
                      intent.status === 'completed' ? 'text-success' : 'text-white'
                    }`}>
                    {intent.value}
                  </Text>
                </View>
              </View>
            </Animated.View>
          ))}
        </Animated.View>
      </PullToRefresh>

      {/* Floating Action Button */}
      <FloatingActionButton onPress={handleFABPress} icon="flash" />

      {/* Intent Builder Modal */}
      <Modal visible={showIntentBuilder} animationType="slide" presentationStyle="fullScreen">
        <IntentBuilder
          intentType={builderIntentType}
          onClose={() => setShowIntentBuilder(false)}
          onCreateIntent={handleCreateIntent}
        />
      </Modal>
    </SafeAreaView>
  );
}
