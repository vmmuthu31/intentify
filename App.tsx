// Import polyfills first, before any other imports
import './polyfills';

import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Modal } from 'react-native';

// Import screens
import { DashboardScreen } from './screens/DashboardScreen';
import { IntentScreen } from './screens/IntentScreen';
import { LaunchpadScreen } from './screens/LaunchpadScreen';
import { PortfolioScreen } from './screens/PortfolioScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { WalletOnboardingScreen } from './screens/WalletOnboardingScreen';

// Import providers
import { SolanaProvider } from './providers/SolanaProvider';
import { PhantomProvider } from './providers/PhantomProvider';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors } from './constants/Colors';

import './global.css';

const Tab = createBottomTabNavigator();

export default function App() {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user has completed onboarding
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      try {
        const onboardingComplete = await AsyncStorage.getItem('onboarding_complete');
        const connectedWallet = await AsyncStorage.getItem('connected_wallet');

        // Only consider onboarding complete if there's a connected wallet
        setIsOnboardingComplete(onboardingComplete === 'true' && !!connectedWallet);
      } catch (error) {
        console.error('Error checking onboarding status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkOnboardingStatus();
  }, []);

  const handleOnboardingComplete = async () => {
    try {
      await AsyncStorage.setItem('onboarding_complete', 'true');
      setIsOnboardingComplete(true);
    } catch (error) {
      console.error('Error saving onboarding status:', error);
    }
  };

  // Show loading screen while checking onboarding status
  if (isLoading) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#121212' }} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <PhantomProvider>
        <SolanaProvider>
          <StatusBar style="light" />

          {!isOnboardingComplete ? (
            <Modal visible={true} animationType="slide" presentationStyle="fullScreen">
              <WalletOnboardingScreen onComplete={handleOnboardingComplete} />
            </Modal>
          ) : (
            <NavigationContainer>
              <Tab.Navigator
                screenOptions={{
                  tabBarActiveTintColor: '#FF4500',
                  tabBarInactiveTintColor: '#8E8E93',
                  tabBarStyle: {
                    backgroundColor: '#1C1C1E',
                    borderTopColor: '#2C2C2E',
                    height: 60,
                    paddingBottom: 10,
                  },
                  tabBarShowLabel: true,
                  tabBarLabelStyle: {
                    fontSize: 12,
                  },
                  headerShown: false,
                }}>
                <Tab.Screen
                  name="Dashboard"
                  component={DashboardScreen}
                  options={{
                    tabBarIcon: ({ color, size }) => (
                      <Ionicons name="home" color={color} size={size} />
                    ),
                  }}
                />
                <Tab.Screen
                  name="Intent"
                  component={IntentScreen}
                  options={{
                    tabBarIcon: ({ color, size }) => (
                      <Ionicons name="flash" color={color} size={size} />
                    ),
                  }}
                />
                <Tab.Screen
                  name="Launchpad"
                  component={LaunchpadScreen}
                  options={{
                    tabBarIcon: ({ color, size }) => (
                      <Ionicons name="rocket" color={color} size={size} />
                    ),
                  }}
                />
                <Tab.Screen
                  name="Portfolio"
                  component={PortfolioScreen}
                  options={{
                    tabBarIcon: ({ color, size }) => (
                      <Ionicons name="wallet" color={color} size={size} />
                    ),
                  }}
                />
                <Tab.Screen
                  name="Settings"
                  component={SettingsScreen}
                  options={{
                    tabBarIcon: ({ color, size }) => (
                      <Ionicons name="settings" color={color} size={size} />
                    ),
                  }}
                />
              </Tab.Navigator>
            </NavigationContainer>
          )}
        </SolanaProvider>
      </PhantomProvider>
    </SafeAreaProvider>
  );
}
