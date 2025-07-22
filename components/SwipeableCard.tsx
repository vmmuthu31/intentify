import React from 'react';
import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedGestureHandler,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const SWIPE_THRESHOLD = width * 0.3;

interface SwipeableCardProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftAction?: {
    icon: string;
    color: string;
    label: string;
  };
  rightAction?: {
    icon: string;
    color: string;
    label: string;
  };
}

export function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftAction,
  rightAction,
}: SwipeableCardProps) {
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  const gestureHandler = useAnimatedGestureHandler({
    onStart: () => {
      opacity.value = withSpring(0.9);
    },
    onActive: (event) => {
      translateX.value = event.translationX;
    },
    onEnd: (event) => {
      opacity.value = withSpring(1);

      if (event.translationX > SWIPE_THRESHOLD && onSwipeRight) {
        translateX.value = withSpring(width, {}, () => {
          runOnJS(onSwipeRight)();
        });
      } else if (event.translationX < -SWIPE_THRESHOLD && onSwipeLeft) {
        translateX.value = withSpring(-width, {}, () => {
          runOnJS(onSwipeLeft)();
        });
      } else {
        translateX.value = withSpring(0);
      }
    },
  });

  const cardStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
      opacity: opacity.value,
    };
  });

  const leftActionStyle = useAnimatedStyle(() => {
    const opacity = interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolate.CLAMP);

    return {
      opacity,
    };
  });

  const rightActionStyle = useAnimatedStyle(() => {
    const opacity = interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0], Extrapolate.CLAMP);

    return {
      opacity,
    };
  });

  return (
    <View className="relative">
      {/* Left Action */}
      {leftAction && (
        <Animated.View
          style={[leftActionStyle]}
          className="absolute bottom-0 left-4 top-0 z-0 items-center justify-center">
          <View
            className="h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${leftAction.color}20` }}>
            <Ionicons name={leftAction.icon as any} size={24} color={leftAction.color} />
            <Text className="mt-1 text-xs font-semibold" style={{ color: leftAction.color }}>
              {leftAction.label}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Right Action */}
      {rightAction && (
        <Animated.View
          style={[rightActionStyle]}
          className="absolute bottom-0 right-4 top-0 z-0 items-center justify-center">
          <View
            className="h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${rightAction.color}20` }}>
            <Ionicons name={rightAction.icon as any} size={24} color={rightAction.color} />
            <Text className="mt-1 text-xs font-semibold" style={{ color: rightAction.color }}>
              {rightAction.label}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Card Content */}
      <PanGestureHandler onGestureEvent={gestureHandler}>
        <Animated.View style={cardStyle} className="z-10">
          {children}
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}
