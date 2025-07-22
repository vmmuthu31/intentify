import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeInLeft } from 'react-native-reanimated';

import { useSolana } from '../providers/SolanaProvider';
import { usePhantomWallet } from '../providers/PhantomProvider';

export function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [rugproofAlerts, setRugproofAlerts] = useState(true);
  const [autoExecute, setAutoExecute] = useState(false);

  // Get wallet state and disconnect functions
  const { disconnectWallet } = useSolana();
  const { logout: phantomLogout, isLoggedIn: phantomLoggedIn } = usePhantomWallet();

  const settingSections = [
    {
      title: 'Security',
      items: [
        {
          icon: 'finger-print',
          title: 'Biometric Authentication',
          subtitle: 'Use fingerprint or Face ID for app access',
          type: 'toggle',
          value: biometricEnabled,
          onToggle: setBiometricEnabled,
        },
        {
          icon: 'shield-checkmark',
          title: 'Rugproof Alerts',
          subtitle: 'Get notified about suspicious tokens',
          type: 'toggle',
          value: rugproofAlerts,
          onToggle: setRugproofAlerts,
        },
        {
          icon: 'key',
          title: 'Wallet Management',
          subtitle: 'Manage connected wallets',
          type: 'navigation',
        },
        {
          icon: 'lock-closed',
          title: 'Auto-Lock Timer',
          subtitle: '5 minutes',
          type: 'navigation',
        },
      ],
    },
    {
      title: 'Notifications',
      items: [
        {
          icon: 'notifications',
          title: 'Push Notifications',
          subtitle: 'Intent updates and market alerts',
          type: 'toggle',
          value: notificationsEnabled,
          onToggle: setNotificationsEnabled,
        },
        {
          icon: 'flash',
          title: 'Intent Completion',
          subtitle: 'Notify when intents are executed',
          type: 'toggle',
          value: true,
          onToggle: () => {},
        },
        {
          icon: 'trending-up',
          title: 'Price Alerts',
          subtitle: 'Asset price movement notifications',
          type: 'navigation',
        },
      ],
    },
    {
      title: 'Trading',
      items: [
        {
          icon: 'flash-outline',
          title: 'Auto-Execute Intents',
          subtitle: 'Automatically execute when conditions are met',
          type: 'toggle',
          value: autoExecute,
          onToggle: setAutoExecute,
        },
        {
          icon: 'settings',
          title: 'Slippage Tolerance',
          subtitle: '0.5%',
          type: 'navigation',
        },
        {
          icon: 'speedometer',
          title: 'Gas Settings',
          subtitle: 'Medium priority',
          type: 'navigation',
        },
        {
          icon: 'swap-horizontal',
          title: 'DEX Preferences',
          subtitle: 'Configure preferred exchanges',
          type: 'navigation',
        },
      ],
    },
    {
      title: 'General',
      items: [
        {
          icon: 'moon',
          title: 'Theme',
          subtitle: 'Dark mode',
          type: 'navigation',
        },
        {
          icon: 'language',
          title: 'Language',
          subtitle: 'English',
          type: 'navigation',
        },
        {
          icon: 'globe',
          title: 'Currency',
          subtitle: 'USD',
          type: 'navigation',
        },
        {
          icon: 'help-circle',
          title: 'Help & Support',
          subtitle: 'FAQ and contact support',
          type: 'navigation',
        },
      ],
    },
  ];

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            console.log('👋 Logging out user...');

            // Disconnect from Phantom if connected
            if (phantomLoggedIn) {
              console.log('🦄 Disconnecting from Phantom...');
              phantomLogout();
            }

            // Disconnect from SolanaProvider (this also clears storage)
            await disconnectWallet();

            console.log('✅ Logout complete - returning to welcome screen');
          } catch (error) {
            console.error('Logout error:', error);
            Alert.alert('Logout Failed', 'There was an issue logging out. Please try again.');
          }
        },
      },
    ]);
  };

  const handleBackup = () => {
    Alert.alert('Backup Wallet', 'Make sure to securely store your recovery phrase', [
      { text: 'OK' },
    ]);
  };

  const renderSettingItem = (item: any, index: number) => {
    return (
      <Animated.View
        key={item.title}
        entering={FadeInLeft.duration(400).delay(index * 50)}
        className="mb-1">
        <TouchableOpacity
          className="rounded-xl border border-dark-border bg-dark-card p-4"
          onPress={
            item.type === 'navigation' ? () => console.log(`Navigate to ${item.title}`) : undefined
          }>
          <View className="flex-row items-center">
            <View className="mr-4 h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <Ionicons name={item.icon as any} size={20} color="#FF4500" />
            </View>

            <View className="flex-1">
              <Text className="text-base font-medium text-white">{item.title}</Text>
              <Text className="text-sm text-dark-gray">{item.subtitle}</Text>
            </View>

            {item.type === 'toggle' ? (
              <Switch
                value={item.value}
                onValueChange={item.onToggle}
                trackColor={{ false: '#2A2A2A', true: '#FF4500' }}
                thumbColor={'#FFFFFF'}
              />
            ) : (
              <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-dark-bg">
      {/* Header */}
      <Animated.View
        entering={FadeInUp.duration(600)}
        className="flex-row items-center justify-between p-4">
        <Text className="text-2xl font-bold text-white">Settings</Text>
        <TouchableOpacity className="p-2">
          <Ionicons name="information-circle-outline" size={24} color="#8E8E93" />
        </TouchableOpacity>
      </Animated.View>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {/* Profile Section */}
        <Animated.View entering={FadeInUp.duration(600).delay(100)} className="mb-8">
          <View className="rounded-2xl border border-dark-border bg-dark-card p-5">
            <View className="mb-4 flex-row items-start gap-4">
              <Image
                source={require('../assets/logo.png')}
                className="h-10 w-10"
                resizeMode="contain"
              />
              <View className="flex-1">
                <Text className="text-xl font-bold text-white">IntentFI User</Text>
                <Text className="text-sm text-dark-gray"></Text>
              </View>
            </View>

            <View className="flex-row space-x-3">
              <TouchableOpacity
                className="flex-1 items-center rounded-xl bg-primary/20 py-3"
                onPress={handleBackup}>
                <Text className="font-semibold text-primary">Backup Wallet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 items-center rounded-xl bg-dark-bg py-3"
                onPress={handleLogout}>
                <Text className="font-semibold text-danger">Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {/* Settings Sections */}
        {settingSections.map((section, sectionIndex) => (
          <Animated.View
            key={section.title}
            entering={FadeInUp.duration(400).delay((sectionIndex + 1) * 100)}
            className="mb-6">
            <Text className="mb-3 px-1 text-lg font-semibold text-white">{section.title}</Text>
            <View className="space-y-2">
              {section.items.map((item, itemIndex) => renderSettingItem(item, itemIndex))}
            </View>
          </Animated.View>
        ))}

        {/* App Info */}
        <Animated.View entering={FadeInUp.duration(600).delay(600)} className="mb-8 items-center">
          <Text className="mb-2 text-sm text-dark-gray">IntentFI v1.0.0</Text>
          <Text className="text-center text-xs text-dark-gray">
            Built for Solana Mobile Hackathon
          </Text>
          <TouchableOpacity className="mt-3">
            <Text className="text-sm text-primary">View Open Source License</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
