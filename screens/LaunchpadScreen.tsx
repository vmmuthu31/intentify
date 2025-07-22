import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInRight, BounceIn } from 'react-native-reanimated';

export function LaunchpadScreen() {
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'DeFi', 'NFT', 'Gaming', 'Infrastructure'];

  const featuredProjects = [
    {
      id: 1,
      name: 'SolanaFi Pro',
      symbol: 'SOLFIPRO',
      description: 'Next-gen yield aggregation protocol',
      raised: '$2.4M',
      target: '$5M',
      progress: 48,
      rugScore: 95,
      participants: 1420,
      timeLeft: '5d 12h',
      category: 'DeFi',
      verified: true,
    },
    {
      id: 2,
      name: 'MetaVerse World',
      symbol: 'METAV',
      description: 'Immersive gaming ecosystem on Solana',
      raised: '$890K',
      target: '$2M',
      progress: 44,
      rugScore: 88,
      participants: 856,
      timeLeft: '12d 8h',
      category: 'Gaming',
      verified: true,
    },
    {
      id: 3,
      name: 'QuickSwap V3',
      symbol: 'QSWAP3',
      description: 'Revolutionary DEX with AI routing',
      raised: '$1.8M',
      target: '$3.5M',
      progress: 51,
      rugScore: 92,
      participants: 2134,
      timeLeft: '3d 15h',
      category: 'DeFi',
      verified: true,
    },
  ];

  const getRugScoreColor = (score: number) => {
    if (score >= 90) return '#00D4AA';
    if (score >= 70) return '#FFB800';
    return '#FF4757';
  };

  const getRugScoreText = (score: number) => {
    if (score >= 90) return 'Safe';
    if (score >= 70) return 'Review';
    return 'Danger';
  };

  return (
    <SafeAreaView className="bg-dark-bg flex-1">
      {/* Header */}
      <Animated.View
        entering={FadeInUp.duration(600)}
        className="flex-row items-center justify-between p-4">
        <View>
          <Text className="text-2xl font-bold text-white">Launchpad</Text>
          <Text className="text-dark-gray text-sm">Rugproof token launches</Text>
        </View>
        <TouchableOpacity className="p-2">
          <Ionicons name="shield-checkmark-outline" size={24} color="#00D4AA" />
        </TouchableOpacity>
      </Animated.View>

      {/* Stats Banner */}
      <Animated.View entering={FadeInUp.duration(600).delay(100)} className="mx-4 mb-6">
        <LinearGradient
          colors={['#FF4500', '#FF6B35']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="rounded-2xl p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 items-center">
              <Text className="text-lg font-bold text-white">$47.2M</Text>
              <Text className="text-xs text-white/80">Total Raised</Text>
            </View>
            <View className="h-8 w-px bg-white/20" />
            <View className="flex-1 items-center">
              <Text className="text-lg font-bold text-white">156</Text>
              <Text className="text-xs text-white/80">Active Projects</Text>
            </View>
            <View className="h-8 w-px bg-white/20" />
            <View className="flex-1 items-center">
              <Text className="text-lg font-bold text-white">98.2%</Text>
              <Text className="text-xs text-white/80">Success Rate</Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Category Filter */}
      <Animated.View entering={FadeInRight.duration(600).delay(200)} className="mb-6 px-4">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row space-x-3">
            {categories.map((category) => (
              <TouchableOpacity
                key={category}
                onPress={() => setSelectedCategory(category)}
                className={`rounded-full border px-4 py-2 ${
                  selectedCategory === category
                    ? 'bg-primary border-primary'
                    : 'bg-dark-card border-dark-border'
                }`}>
                <Text
                  className={`font-medium ${
                    selectedCategory === category ? 'text-white' : 'text-dark-gray'
                  }`}>
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </Animated.View>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {/* Featured Projects */}
        <Animated.View entering={FadeInUp.duration(600).delay(300)} className="mb-6">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-white">Featured Projects</Text>
            <TouchableOpacity>
              <Text className="text-primary text-sm">View All</Text>
            </TouchableOpacity>
          </View>

          {featuredProjects.map((project, index) => (
            <Animated.View
              key={project.id}
              entering={BounceIn.duration(600).delay(index * 100)}
              className="mb-4">
              <TouchableOpacity className="bg-dark-card border-dark-border rounded-2xl border p-5">
                {/* Project Header */}
                <View className="mb-4 flex-row items-start justify-between">
                  <View className="flex-1">
                    <View className="mb-2 flex-row items-center">
                      <View className="bg-primary/20 mr-3 h-10 w-10 items-center justify-center rounded-full">
                        <Text className="text-primary text-sm font-bold">
                          {project.symbol.slice(0, 2)}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center">
                          <Text className="text-base font-bold text-white">{project.name}</Text>
                          {project.verified && (
                            <Ionicons
                              name="checkmark-circle"
                              size={16}
                              color="#00D4AA"
                              style={{ marginLeft: 6 }}
                            />
                          )}
                        </View>
                        <Text className="text-dark-gray text-sm">${project.symbol}</Text>
                      </View>
                    </View>
                    <Text className="text-dark-gray mb-3 text-sm">{project.description}</Text>
                  </View>

                  {/* Rug Score Badge */}
                  <View
                    className="rounded-full px-3 py-1"
                    style={{ backgroundColor: `${getRugScoreColor(project.rugScore)}20` }}>
                    <Text
                      className="text-xs font-bold"
                      style={{ color: getRugScoreColor(project.rugScore) }}>
                      {getRugScoreText(project.rugScore)} {project.rugScore}
                    </Text>
                  </View>
                </View>

                {/* Progress Bar */}
                <View className="mb-4">
                  <View className="mb-2 flex-row items-center justify-between">
                    <Text className="text-dark-gray text-sm">Progress</Text>
                    <Text className="text-sm font-medium text-white">{project.progress}%</Text>
                  </View>
                  <View className="bg-dark-bg h-2 overflow-hidden rounded-full">
                    <View
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${project.progress}%` }}
                    />
                  </View>
                </View>

                {/* Stats Row */}
                <View className="mb-4 flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <Text className="text-primary text-base font-bold">{project.raised}</Text>
                    <Text className="text-dark-gray ml-1 text-sm">raised</Text>
                  </View>
                  <View className="flex-row items-center">
                    <Ionicons name="people" size={14} color="#8E8E93" />
                    <Text className="text-dark-gray ml-1 text-sm">{project.participants}</Text>
                  </View>
                  <View className="flex-row items-center">
                    <Ionicons name="time" size={14} color="#8E8E93" />
                    <Text className="text-dark-gray ml-1 text-sm">{project.timeLeft}</Text>
                  </View>
                </View>

                {/* Action Button */}
                <TouchableOpacity className="bg-primary rounded-xl py-3">
                  <Text className="text-center font-semibold text-white">Participate Now</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </Animated.View>

        {/* Rugproof Features */}
        <Animated.View entering={FadeInUp.duration(600).delay(400)} className="mb-6">
          <Text className="mb-4 text-lg font-semibold text-white">Rugproof Security</Text>
          <View className="bg-dark-card border-dark-border rounded-2xl border p-5">
            <View className="mb-4 flex-row items-center">
              <View className="bg-success/20 mr-4 h-12 w-12 items-center justify-center rounded-full">
                <Ionicons name="shield-checkmark" size={24} color="#00D4AA" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-white">Protected Launches</Text>
                <Text className="text-dark-gray text-sm">
                  Every project undergoes comprehensive security audits
                </Text>
              </View>
            </View>

            <View className="space-y-3">
              <View className="flex-row items-center">
                <Ionicons name="checkmark-circle" size={16} color="#00D4AA" />
                <Text className="text-dark-gray ml-3 text-sm">
                  Smart contract security analysis
                </Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons name="checkmark-circle" size={16} color="#00D4AA" />
                <Text className="text-dark-gray ml-3 text-sm">Team KYC verification</Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons name="checkmark-circle" size={16} color="#00D4AA" />
                <Text className="text-dark-gray ml-3 text-sm">Token distribution transparency</Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons name="checkmark-circle" size={16} color="#00D4AA" />
                <Text className="text-dark-gray ml-3 text-sm">Liquidity lock guarantees</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Launch Your Project */}
        <Animated.View entering={FadeInUp.duration(600).delay(500)} className="mb-8">
          <TouchableOpacity className="bg-dark-card border-primary/50 rounded-2xl border-2 border-dashed p-6">
            <View className="items-center">
              <Ionicons name="rocket" size={48} color="#FF4500" />
              <Text className="mt-3 text-xl font-bold text-white">Launch Your Project</Text>
              <Text className="text-dark-gray mt-2 text-center text-sm">
                Start your rugproof token launch with comprehensive security features
              </Text>
              <View className="bg-primary mt-4 rounded-xl px-6 py-3">
                <Text className="font-semibold text-white">Get Started</Text>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
