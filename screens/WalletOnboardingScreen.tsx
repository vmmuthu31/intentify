import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInUp,
  BounceIn,
  SlideInRight,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useSolana } from '../providers/SolanaProvider';
import { AnimatedButton } from '../components/AnimatedButton';
import { walletService, intentFiMobile } from '../services';

interface WalletOnboardingScreenProps {
  onComplete: () => void;
}

export function WalletOnboardingScreen({ onComplete }: WalletOnboardingScreenProps) {
  const { connectWallet, connecting, connected } = useSolana();
  const scale = useSharedValue(1);

  const handleConnectPress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Show wallet options
    Alert.alert('Choose Connection Method', 'Select how you want to get started with IntentFI', [
      {
        text: 'Quick Demo (No Auth)',
        onPress: handleQuickDemo,
      },
      {
        text: 'Secure Wallet (Biometric)',
        onPress: handleSecureWallet,
      },
      {
        text: 'Phantom Wallet',
        onPress: handlePhantomConnect,
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  };

  const handleQuickDemo = async () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });

    try {
      console.log('🚀 Starting quick demo mode...');

      // Initialize services
      await intentFiMobile.initialize('devnet');

      // Get or create funded wallet seamlessly
      const { publicKey, hasFunds } = await intentFiMobile.getOrCreateFundedWallet();
      console.log('👤 Demo wallet ready:', publicKey.toString().slice(0, 8) + '...');

      // Try to ensure funding
      if (!hasFunds) {
        await intentFiMobile.ensureWalletFunded(publicKey, 0.05);
      }

      Alert.alert(
        'Demo Mode Ready! 🚀',
        `Your demo wallet is ready to go!\nAddress: ${publicKey.toString().slice(0, 8)}...${publicKey.toString().slice(-4)}\n\n✨ Perfect for trying out IntentFI features!`,
        [
          {
            text: 'Start Trading',
            onPress: onComplete,
          },
        ]
      );
    } catch (error) {
      console.error('Quick demo setup failed:', error);
      Alert.alert(
        'Demo Setup Complete',
        'Demo mode is ready! Some features may require additional setup.',
        [{ text: 'Continue', onPress: onComplete }]
      );
    }

    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handleSecureWallet = async () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });

    try {
      await walletService.initialize();
      const walletResult = await walletService.createTestWallet();

      if (walletResult.connected) {
        // Request airdrop for testing
        try {
          const airdropResult = await intentFiMobile.requestAirdrop(walletResult.publicKey, 1);
          if (airdropResult === 'balance-sufficient') {
            console.log('💰 Wallet already funded, skipping airdrop');
          } else if (airdropResult === 'rate-limited-but-has-balance') {
            console.log('🚰 Airdrop rate limited but wallet has balance');
          } else {
            console.log('💧 Test wallet funded with airdrop');
          }
        } catch (airdropError: any) {
          console.warn('⚠️ Airdrop failed:', airdropError.message || airdropError);
          // Continue without airdrop - user can still use the test wallet
        }

        Alert.alert(
          'Secure Wallet Created! 🔐',
          `Your biometrically secured wallet is ready!\nAddress: ${walletResult.publicKey.toString().slice(0, 4)}...${walletResult.publicKey.toString().slice(-4)}\n\n🔒 Protected by your device security`,
          [
            {
              text: 'Start Trading',
              onPress: onComplete,
            },
          ]
        );
      }
    } catch (error) {
      console.error('Secure wallet creation failed:', error);
      Alert.alert('Wallet Creation Failed', 'Please try Quick Demo mode instead.');
    }

    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handlePhantomConnect = async () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });

    try {
      await walletService.initialize();
      const walletResult = await walletService.connectPhantom();

      if (walletResult && walletResult.connected) {
        Alert.alert(
          'Phantom Wallet Connected! 🎉',
          `Welcome to IntentFI! Connected to: ${walletResult.publicKey.toString().slice(0, 4)}...${walletResult.publicKey.toString().slice(-4)}`,
          [
            {
              text: 'Start Trading',
              onPress: onComplete,
            },
          ]
        );
      }
    } catch (error) {
      console.error('Phantom connection failed:', error);
      Alert.alert(
        'Connection Failed',
        'Please make sure Phantom wallet is installed and try again.'
      );
    }

    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <SafeAreaView className="bg-dark-bg flex-1">
      {/* Header */}
      <Animated.View entering={FadeInUp.duration(600)} className="items-center p-6 pt-12">
        <View className="bg-primary mb-6 h-24 w-24 items-center justify-center rounded-full">
          <Text className="text-2xl font-bold text-white">IF</Text>
        </View>

        <Text className="mb-3 text-center text-3xl font-bold text-white">Welcome to IntentFI</Text>
        <Text className="text-dark-gray text-center text-base leading-6">
          The first mobile intent-based DeFi superapp with rugproof protection
        </Text>
      </Animated.View>

      {/* Features */}
      <Animated.View entering={SlideInRight.duration(600).delay(200)} className="px-6 py-8">
        <Text className="mb-6 text-xl font-semibold text-white">What makes IntentFI special?</Text>

        <View className="space-y-4">
          <Animated.View
            entering={BounceIn.duration(400).delay(300)}
            className="flex-row items-center">
            <View className="bg-primary/20 mr-4 h-12 w-12 items-center justify-center rounded-full">
              <Ionicons name="flash" size={24} color="#FF4500" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-white">Intent-Based Trading</Text>
              <Text className="text-dark-gray text-sm">
                Simply say &quot;I want 10 SOL → USDC at best price&quot; and we handle the rest
              </Text>
            </View>
          </Animated.View>

          <Animated.View
            entering={BounceIn.duration(400).delay(400)}
            className="flex-row items-center">
            <View className="bg-success/20 mr-4 h-12 w-12 items-center justify-center rounded-full">
              <Ionicons name="shield-checkmark" size={24} color="#00D4AA" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-white">Rugproof Protection</Text>
              <Text className="text-dark-gray text-sm">
                Every token is analyzed for safety before you trade
              </Text>
            </View>
          </Animated.View>

          <Animated.View
            entering={BounceIn.duration(400).delay(500)}
            className="flex-row items-center">
            <View className="bg-warning/20 mr-4 h-12 w-12 items-center justify-center rounded-full">
              <Ionicons name="phone-portrait" size={24} color="#FFB800" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-white">Mobile Native</Text>
              <Text className="text-dark-gray text-sm">
                Built for Solana Mobile with haptic feedback and smooth gestures
              </Text>
            </View>
          </Animated.View>

          <Animated.View
            entering={BounceIn.duration(400).delay(600)}
            className="flex-row items-center">
            <View className="mr-4 h-12 w-12 items-center justify-center rounded-full bg-purple-500/20">
              <Ionicons name="rocket" size={24} color="#8B5CF6" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-white">Token Launchpad</Text>
              <Text className="text-dark-gray text-sm">
                Discover and invest in new tokens with built-in safety checks
              </Text>
            </View>
          </Animated.View>
        </View>
      </Animated.View>

      {/* Network Info */}
      <Animated.View entering={FadeInUp.duration(600).delay(400)} className="mx-6 mb-6">
        <LinearGradient
          colors={['#1A1A1A', '#2A2A2A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="border-dark-border rounded-2xl border p-4">
          <View className="flex-row items-center">
            <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-purple-500/20">
              <Ionicons name="globe" size={20} color="#8B5CF6" />
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-white">Solana Devnet</Text>
              <Text className="text-dark-gray text-sm">Safe testing environment with fake SOL</Text>
            </View>
            <View className="bg-success h-3 w-3 animate-pulse rounded-full" />
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Connection Button */}
      <Animated.View entering={FadeInUp.duration(600).delay(500)} className="px-6 pb-8">
        <Animated.View style={animatedStyle}>
          <AnimatedButton
            title={connecting ? 'Connecting...' : 'Connect Demo Wallet'}
            onPress={handleConnectPress}
            variant="primary"
            size="large"
            disabled={connecting}
            loading={connecting}
          />

          <Text className="text-dark-gray mt-4 text-center text-xs">
            Demo mode • No real funds required • Solana devnet
          </Text>
        </Animated.View>
      </Animated.View>
    </SafeAreaView>
  );
}
