import React, { useEffect, useState } from 'react';
import { View, Text, Image, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useTurnkeyAuth } from '../providers/TurnkeyAuthProvider';
import { AnimatedButton } from '../components/AnimatedButton';

interface WalletOnboardingScreenProps {
  onComplete: () => void;
}

export function WalletOnboardingScreen({ onComplete }: WalletOnboardingScreenProps) {
  const { isAuthenticated, user, login, verifyOTP, completeLogin, clearError } = useTurnkeyAuth();

  const [step, setStep] = useState<'email' | 'verification'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpId, setOtpId] = useState('');
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes

  // Local loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const scale = useSharedValue(1);

  // Auto-complete onboarding when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log('✅ User authenticated, completing onboarding...');
      onComplete();
    }
  }, [isAuthenticated, user, onComplete]);

  // Timer effect for OTP expiration
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === 'verification' && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [step, timeLeft]);

  // Format time display
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleEmailSubmit = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    try {
      setIsLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      clearError();

      const result = await login(email);
      setOtpId(result.otpId);
      setStep('verification');
      setTimeLeft(600); // Reset timer
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';

      if (
        errorMessage.includes('User not found') ||
        errorMessage.includes('no sub-organization associated')
      ) {
        Alert.alert(
          'Account Not Found',
          'No account found for this email. Please create an account first.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPSubmit = async () => {
    if (!otp || otp.length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-character code');
      return;
    }

    if (!otpId) {
      Alert.alert('Error', 'OTP session expired. Please request a new code.');
      return;
    }

    try {
      setIsLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      clearError();

      await verifyOTP(otpId, otp, email);
      await completeLogin(email);

      // Authentication successful, onComplete will be called by useEffect
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Verification failed';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    try {
      setIsResending(true);
      clearError();
      const result = await login(email);
      setOtpId(result.otpId);
      setTimeLeft(600); // Reset timer
      Alert.alert('Success', 'Verification code sent!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to resend code';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsResending(false);
    }
  };

  const handleBackToEmail = () => {
    setStep('email');
    setOtp('');
    setOtpId('');
    setTimeLeft(600);
    clearError();
  };

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <SafeAreaView className="flex-1 bg-dark-bg">
      {/* Header */}
      <Animated.View entering={FadeInUp.duration(600)} className="z-10 items-center p-6 pt-12">
        <Image source={require('../assets/logo.png')} className="h-12 w-12" resizeMode="contain" />

        <Text className="mb-3 mt-6 text-center text-3xl font-bold text-white">
          Welcome to IntentiFI
        </Text>
        <Text className="text-center text-base leading-6 text-dark-gray">
          The first mobile intent-based DeFi superapp with rugproof protection
        </Text>
      </Animated.View>

      {/* Authentication Section */}
      <Animated.View entering={FadeInUp.duration(600).delay(650)} className="px-6 pb-8">
        {step === 'email' ? (
          <Animated.View style={animatedStyle} className="flex flex-col gap-4">
            {/* Email Input */}
            <View className="flex flex-col gap-3">
              <Text className="text-base font-medium text-white">Email Address</Text>
              <View className="relative">
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color="#9CA3AF"
                  style={{ position: 'absolute', left: 16, top: 16, zIndex: 1 }}
                />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email address"
                  placeholderTextColor="#6B7280"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="rounded-lg border border-gray-700 bg-gray-800/50 py-4 pl-12 pr-4 text-base text-white"
                  editable={!isLoading}
                />
              </View>
            </View>

            <AnimatedButton
              title={isLoading ? 'Sending verification...' : 'Send Verification Code'}
              onPress={handleEmailSubmit}
              variant="primary"
              size="large"
              disabled={isLoading || !email.trim()}
              loading={isLoading}
            />

            <Text className="mt-4 text-center text-xs text-dark-gray">
              Secure wallet authentication • Solana Mainnet
            </Text>
          </Animated.View>
        ) : (
          <Animated.View style={animatedStyle} className="flex flex-col gap-4">
            {/* Email Display */}
            <View className="rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3">
              <View className="flex-row items-center space-x-3">
                <Ionicons name="mail" size={20} color="#FF4500" />
                <View className="flex-1">
                  <Text className="text-sm text-gray-400">Verification code sent to:</Text>
                  <Text className="text-base font-medium text-white">{email}</Text>
                </View>
              </View>
            </View>

            {/* OTP Input */}
            <View className="flex flex-col gap-3">
              <Text className="text-base font-medium text-white">Verification Code</Text>
              <View className="relative">
                <Ionicons
                  name="shield-checkmark-outline"
                  size={20}
                  color="#9CA3AF"
                  style={{ position: 'absolute', left: 16, top: 16, zIndex: 1 }}
                />
                <TextInput
                  value={otp}
                  onChangeText={(text) =>
                    setOtp(
                      text
                        .replace(/[^a-zA-Z0-9]/g, '')
                        .toUpperCase()
                        .slice(0, 6)
                    )
                  }
                  placeholder="Enter 6-character code"
                  placeholderTextColor="#6B7280"
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  className="rounded-lg border border-gray-700 bg-gray-800/50 py-4 pl-12 pr-4 text-center font-mono text-base tracking-widest text-white"
                  editable={!isLoading}
                />
              </View>
              <Text className="text-center text-sm text-gray-400">
                Enter the 6-character code from your email
              </Text>
            </View>

            <AnimatedButton
              title={isLoading ? 'Verifying...' : 'Launch App'}
              onPress={handleOTPSubmit}
              variant="primary"
              size="large"
              disabled={isLoading || otp.length !== 6}
              loading={isLoading}
            />

            {/* Timer and Info */}
            <View className="items-center gap-3">
              <View className="flex-row items-center space-x-2 rounded-lg border border-gray-700 bg-gray-800/30 px-3 py-2">
                <Ionicons name="time-outline" size={16} color="#9CA3AF" />
                <Text className="text-sm text-gray-400">
                  Code expires in{' '}
                  <Text
                    className={`font-mono ${timeLeft < 60 ? 'text-red-400' : 'text-orange-500'}`}>
                    {formatTime(timeLeft)}
                  </Text>
                </Text>
              </View>

              {timeLeft === 0 && (
                <View className="rounded-lg border border-red-800/50 bg-red-950/50 p-3">
                  <Text className="text-center text-sm text-red-400">
                    Your verification code has expired. Please request a new one.
                  </Text>
                </View>
              )}
            </View>

            {/* Resend and Back buttons */}
            <View className="gap-3 border-t border-gray-800 pt-4">
              <Text className="text-center text-base text-gray-400">
                Didn&apos;t receive the code?
              </Text>

              <AnimatedButton
                title={
                  isResending
                    ? 'Sending...'
                    : timeLeft > 540
                      ? `Resend in ${540 - timeLeft}s`
                      : 'Resend verification code'
                }
                onPress={handleResendCode}
                variant="secondary"
                size="medium"
                disabled={isResending || timeLeft > 540 || isLoading}
                loading={isResending}
              />

              <Text
                onPress={handleBackToEmail}
                className="py-2 text-center text-base text-gray-400">
                ← Back to email
              </Text>
            </View>
          </Animated.View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}
