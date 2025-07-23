import React from 'react';
import { Text, TouchableOpacity, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

interface AnimatedButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  hapticFeedback?: boolean;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function AnimatedButton({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
  hapticFeedback = true,
}: AnimatedButtonProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
    opacity.value = withTiming(0.8, { duration: 100 });

    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    opacity.value = withTiming(1, { duration: 100 });
  };

  const handlePress = () => {
    if (disabled || loading) {
      console.log('⚠️ Button press ignored - button is disabled or loading');
      return;
    }

    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  const getButtonStyles = () => {
    const baseStyles = 'rounded-2xl items-center justify-center';
    const sizeStyles = {
      small: 'px-4 py-2',
      medium: 'px-6 py-4',
      large: 'px-8 py-5',
    };

    return `${baseStyles} ${sizeStyles[size]}`;
  };

  const getTextStyles = () => {
    const baseStyles = 'font-semibold text-center';
    const sizeStyles = {
      small: 'text-sm',
      medium: 'text-base',
      large: 'text-lg',
    };

    const variantStyles = {
      primary: 'text-white',
      secondary: 'text-white',
      outline: 'text-primary',
    };

    return `${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]}`;
  };

  const renderButton = () => {
    const buttonStyles = getButtonStyles();
    const textStyles = getTextStyles();

    if (variant === 'primary') {
      return (
        <LinearGradient
          colors={disabled ? ['#444', '#444'] : ['#FF4500', '#FF6B35']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className={buttonStyles}
          style={style}>
          <Text className={textStyles}>{title}</Text>
        </LinearGradient>
      );
    }

    if (variant === 'secondary') {
      return (
        <LinearGradient
          colors={disabled ? ['#333', '#333'] : ['#1A1A1A', '#2A2A2A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className={`${buttonStyles} border border-dark-border`}
          style={style}>
          <Text className={textStyles}>{title}</Text>
        </LinearGradient>
      );
    }

    // outline variant
    return (
      <Animated.View
        className={`${buttonStyles} border-2 border-primary bg-transparent`}
        style={style}>
        <Text className={textStyles}>{title}</Text>
      </Animated.View>
    );
  };

  return (
    <AnimatedTouchableOpacity
      style={animatedStyle}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={1}>
      {renderButton()}
    </AnimatedTouchableOpacity>
  );
}
