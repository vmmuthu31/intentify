// Import polyfills first, before any other imports
import './polyfills';

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DashboardScreen } from './screens/DashboardScreen';
import { IntentScreen } from './screens/IntentScreen';
import { PortfolioScreen } from './screens/PortfolioScreen';
import { LaunchpadScreen } from './screens/LaunchpadScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Colors } from './constants/Colors';

import { SolanaProvider, useSolana } from './providers/SolanaProvider';
import { PhantomProvider } from './providers/PhantomProvider';
import { WalletOnboardingScreen } from './screens/WalletOnboardingScreen';

import './global.css';

const Tab = createBottomTabNavigator();

function AppNavigator() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap;

            if (route.name === 'Dashboard') {
              iconName = focused ? 'home' : 'home-outline';
            } else if (route.name === 'Intent') {
              iconName = focused ? 'flash' : 'flash-outline';
            } else if (route.name === 'Portfolio') {
              iconName = focused ? 'pie-chart' : 'pie-chart-outline';
            } else if (route.name === 'Launchpad') {
              iconName = focused ? 'rocket' : 'rocket-outline';
            } else if (route.name === 'Settings') {
              iconName = focused ? 'settings' : 'settings-outline';
            } else {
              iconName = 'help-outline';
            }

            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: Colors.dark.primary,
          tabBarInactiveTintColor: Colors.dark.tabIconDefault,
          tabBarStyle: {
            backgroundColor: Colors.dark.card,
            borderTopColor: Colors.dark.border,
            paddingBottom: 5,
            paddingTop: 5,
            height: 60,
          },
          headerShown: false,
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '500',
          },
        })}>
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Intent" component={IntentScreen} />
        <Tab.Screen name="Portfolio" component={PortfolioScreen} />
        <Tab.Screen name="Launchpad" component={LaunchpadScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function MainApp() {
  const { connected } = useSolana();

  // Show onboarding screen if wallet is not connected
  if (!connected) {
    return (
      <NavigationContainer>
        <StatusBar style="light" />
        <WalletOnboardingScreen
          onComplete={() => {
            // The onComplete callback isn't needed since wallet connection
            // will automatically trigger a re-render showing the main app
            console.log('✅ Wallet onboarding completed');
          }}
        />
      </NavigationContainer>
    );
  }

  // Show main app if wallet is connected
  return <AppNavigator />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PhantomProvider>
        <SolanaProvider>
          <MainApp />
        </SolanaProvider>
      </PhantomProvider>
    </GestureHandlerRootView>
  );
}
