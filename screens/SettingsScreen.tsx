import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeInLeft } from 'react-native-reanimated';

export function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [rugproofAlerts, setRugproofAlerts] = useState(true);
  const [autoExecute, setAutoExecute] = useState(false);

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
      { text: 'Logout', style: 'destructive', onPress: () => console.log('Logout') },
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
          className="bg-dark-card border-dark-border rounded-xl border p-4"
          onPress={
            item.type === 'navigation' ? () => console.log(`Navigate to ${item.title}`) : undefined
          }>
          <View className="flex-row items-center">
            <View className="bg-primary/20 mr-4 h-10 w-10 items-center justify-center rounded-full">
              <Ionicons name={item.icon as any} size={20} color="#FF4500" />
            </View>

            <View className="flex-1">
              <Text className="text-base font-medium text-white">{item.title}</Text>
              <Text className="text-dark-gray text-sm">{item.subtitle}</Text>
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
    <SafeAreaView className="bg-dark-bg flex-1">
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
          <View className="bg-dark-card border-dark-border rounded-2xl border p-5">
            <View className="mb-4 flex-row items-center">
              <View className="bg-primary mr-4 h-16 w-16 items-center justify-center rounded-full">
                <Text className="text-xl font-bold text-white">IF</Text>
              </View>
              <View className="flex-1">
                <Text className="text-xl font-bold text-white">IntentFI User</Text>
                <Text className="text-dark-gray text-sm">0x5b...801A</Text>
              </View>
            </View>

            <View className="flex-row space-x-3">
              <TouchableOpacity
                className="bg-primary/20 flex-1 items-center rounded-xl py-3"
                onPress={handleBackup}>
                <Text className="text-primary font-semibold">Backup Wallet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-dark-bg flex-1 items-center rounded-xl py-3"
                onPress={handleLogout}>
                <Text className="text-danger font-semibold">Logout</Text>
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
          <Text className="text-dark-gray mb-2 text-sm">IntentFI v1.0.0</Text>
          <Text className="text-dark-gray text-center text-xs">
            Built for Solana Mobile Hackathon
          </Text>
          <TouchableOpacity className="mt-3">
            <Text className="text-primary text-sm">View Open Source License</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
