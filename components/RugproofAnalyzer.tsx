import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInUp,
  BounceIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface SecurityCheck {
  name: string;
  status: 'safe' | 'warning' | 'danger';
  description: string;
  icon: string;
}

interface TokenSafety {
  symbol: string;
  address: string;
  overallScore: number;
  checks: SecurityCheck[];
  isVerified: boolean;
  liquidityLocked: boolean;
  auditStatus: 'audited' | 'pending' | 'unaudited';
}

interface RugproofAnalyzerProps {
  tokenAddress: string;
  onAnalysisComplete: (result: TokenSafety) => void;
}

export function RugproofAnalyzer({ tokenAddress, onAnalysisComplete }: RugproofAnalyzerProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [analysis, setAnalysis] = useState<TokenSafety | null>(null);
  const progressValue = useSharedValue(0);

  useEffect(() => {
    simulateAnalysis();
  }, [tokenAddress]);

  const simulateAnalysis = async () => {
    setIsAnalyzing(true);
    progressValue.value = withTiming(1, { duration: 2000 });

    // Simulate analysis delay
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const mockAnalysis: TokenSafety = {
      symbol: 'BONK',
      address: tokenAddress,
      overallScore: 85,
      isVerified: true,
      liquidityLocked: true,
      auditStatus: 'audited',
      checks: [
        {
          name: 'Contract Verification',
          status: 'safe',
          description: 'Smart contract is verified and open source',
          icon: 'checkmark-circle',
        },
        {
          name: 'Liquidity Lock',
          status: 'safe',
          description: 'Liquidity is locked for 12 months',
          icon: 'lock-closed',
        },
        {
          name: 'Mint Authority',
          status: 'warning',
          description: 'Mint authority is not renounced',
          icon: 'warning',
        },
        {
          name: 'Freeze Authority',
          status: 'safe',
          description: 'Freeze authority has been renounced',
          icon: 'checkmark-circle',
        },
        {
          name: 'Team Tokens',
          status: 'safe',
          description: 'Team tokens are properly vested',
          icon: 'people',
        },
        {
          name: 'Trading Activity',
          status: 'safe',
          description: 'Healthy trading volume and holders',
          icon: 'trending-up',
        },
      ],
    };

    setAnalysis(mockAnalysis);
    setIsAnalyzing(false);
    onAnalysisComplete(mockAnalysis);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const progressStyle = useAnimatedStyle(() => {
    return {
      width: `${progressValue.value * 100}%`,
    };
  });

  const getScoreColor = (score: number) => {
    if (score >= 90) return '#00D4AA';
    if (score >= 70) return '#FFB800';
    return '#FF4757';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'safe':
        return '#00D4AA';
      case 'warning':
        return '#FFB800';
      case 'danger':
        return '#FF4757';
      default:
        return '#8E8E93';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'safe':
        return 'checkmark-circle';
      case 'warning':
        return 'warning';
      case 'danger':
        return 'close-circle';
      default:
        return 'help-circle';
    }
  };

  if (isAnalyzing) {
    return (
      <View className="bg-dark-card border-dark-border rounded-2xl border p-6">
        <Animated.View entering={FadeInUp.duration(600)} className="items-center">
          <View className="bg-primary/20 mb-4 h-16 w-16 items-center justify-center rounded-full">
            <Ionicons name="shield-checkmark" size={32} color="#FF4500" />
          </View>
          <Text className="mb-2 text-lg font-bold text-white">Analyzing Token Safety</Text>
          <Text className="text-dark-gray mb-6 text-center text-sm">
            Running comprehensive security checks...
          </Text>

          {/* Progress Bar */}
          <View className="bg-dark-bg mb-4 h-2 w-full overflow-hidden rounded-full">
            <Animated.View style={[progressStyle]} className="bg-primary h-full rounded-full" />
          </View>
          <Text className="text-dark-gray text-xs">This may take a few seconds</Text>
        </Animated.View>
      </View>
    );
  }

  if (!analysis) return null;

  return (
    <ScrollView
      className="bg-dark-card border-dark-border rounded-2xl border"
      showsVerticalScrollIndicator={false}>
      <View className="p-6">
        {/* Header with Score */}
        <Animated.View entering={BounceIn.duration(800)} className="mb-6 items-center">
          <LinearGradient
            colors={[
              getScoreColor(analysis.overallScore) + '20',
              getScoreColor(analysis.overallScore) + '10',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="mb-4 h-24 w-24 items-center justify-center rounded-full">
            <Text
              className="text-3xl font-bold"
              style={{ color: getScoreColor(analysis.overallScore) }}>
              {analysis.overallScore}
            </Text>
          </LinearGradient>

          <View className="mb-2 flex-row items-center">
            <Text className="mr-2 text-xl font-bold text-white">{analysis.symbol}</Text>
            {analysis.isVerified && <Ionicons name="checkmark-circle" size={20} color="#00D4AA" />}
          </View>

          <Text className="text-dark-gray mb-4 text-center text-sm">
            Token Address: {analysis.address.slice(0, 6)}...{analysis.address.slice(-6)}
          </Text>

          <View className="flex-row items-center space-x-4">
            {analysis.liquidityLocked && (
              <View className="flex-row items-center">
                <Ionicons name="lock-closed" size={16} color="#00D4AA" />
                <Text className="text-success ml-1 text-sm">Liquidity Locked</Text>
              </View>
            )}
            <View className="flex-row items-center">
              <Ionicons name="document-text" size={16} color="#00D4AA" />
              <Text className="text-success ml-1 text-sm capitalize">{analysis.auditStatus}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Security Checks */}
        <Animated.View entering={FadeInUp.duration(600).delay(300)} className="mb-6">
          <Text className="mb-4 text-lg font-semibold text-white">Security Analysis</Text>

          {analysis.checks.map((check, index) => (
            <Animated.View
              key={check.name}
              entering={FadeInUp.duration(400).delay(index * 100)}
              className="bg-dark-bg mb-3 flex-row items-center rounded-xl p-3">
              <View
                className="mr-3 h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: getStatusColor(check.status) + '20' }}>
                <Ionicons name={check.icon as any} size={20} color={getStatusColor(check.status)} />
              </View>

              <View className="flex-1">
                <View className="mb-1 flex-row items-center justify-between">
                  <Text className="font-semibold text-white">{check.name}</Text>
                  <Ionicons
                    name={getStatusIcon(check.status) as any}
                    size={16}
                    color={getStatusColor(check.status)}
                  />
                </View>
                <Text className="text-dark-gray text-sm">{check.description}</Text>
              </View>
            </Animated.View>
          ))}
        </Animated.View>

        {/* Risk Assessment */}
        <Animated.View entering={FadeInUp.duration(600).delay(500)} className="mb-4">
          <View className="bg-dark-bg rounded-xl p-4">
            <View className="mb-3 flex-row items-center">
              <Ionicons name="information-circle" size={20} color="#FF4500" />
              <Text className="ml-2 font-semibold text-white">Risk Assessment</Text>
            </View>

            <Text className="text-dark-gray text-sm leading-5">
              {analysis.overallScore >= 90
                ? 'This token appears to be safe for trading with strong security fundamentals and proper tokenomics.'
                : analysis.overallScore >= 70
                  ? 'This token shows moderate risk. Review the warnings above before proceeding.'
                  : 'High risk token detected. Exercise extreme caution or consider avoiding this token.'}
            </Text>
          </View>
        </Animated.View>

        {/* Action Buttons */}
        <View className="flex-row space-x-3">
          <TouchableOpacity className="bg-primary flex-1 rounded-xl py-3">
            <Text className="text-center font-semibold text-white">Proceed with Caution</Text>
          </TouchableOpacity>

          <TouchableOpacity className="bg-dark-bg border-dark-border flex-1 rounded-xl border py-3">
            <Text className="text-dark-gray text-center font-semibold">Choose Different Token</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
