import React from 'react';
import { Modal, View, Text, TouchableOpacity, Alert, Linking, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PublicKey } from '@solana/web3.js';
import * as Haptics from 'expo-haptics';

interface FundingHelperModalProps {
  visible: boolean;
  onClose: () => void;
  onRetry?: () => void;
  publicKey?: PublicKey;
  networkName?: string;
}

export function FundingHelperModal({
  visible,
  onClose,
  onRetry,
  publicKey,
  networkName = 'devnet',
}: FundingHelperModalProps) {
  const handleCopyAddress = async () => {
    if (publicKey) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Address Selected', 'Long press to copy this address from the text field');
    }
  };

  const handleOpenFaucet = async () => {
    const faucetUrl = 'https://faucet.solana.com';
    const canOpen = await Linking.canOpenURL(faucetUrl);
    if (canOpen) {
      await Linking.openURL(faucetUrl);
    } else {
      Alert.alert('Cannot open browser', 'Please manually visit: https://faucet.solana.com');
    }
  };

  const handleOpenSolanaFM = async () => {
    if (publicKey) {
      const explorerUrl = `https://solana.fm/address/${publicKey.toString()}?cluster=${networkName}-alpha`;
      const canOpen = await Linking.canOpenURL(explorerUrl);
      if (canOpen) {
        await Linking.openURL(explorerUrl);
      }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="max-h-[80%] rounded-t-3xl bg-white px-6 py-8">
          <View className="mb-6 flex-row items-center justify-between">
            <Text className="text-2xl font-bold text-gray-900">💰 Wallet Funding Required</Text>
            <TouchableOpacity onPress={onClose} className="p-2">
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <Text className="mb-2 font-medium text-red-800">🚨 Automatic Funding Failed</Text>
              <Text className="text-sm text-red-700">
                The Solana devnet airdrop is rate-limited. Your wallet needs SOL to perform
                transactions.
              </Text>
            </View>

            {publicKey && (
              <View className="mb-6 rounded-lg bg-gray-50 p-4">
                <Text className="mb-2 font-medium text-gray-900">Your Wallet Address:</Text>
                <View className="flex-row items-center justify-between rounded-lg border border-gray-200 bg-white p-3">
                  <Text className="mr-2 flex-1 font-mono text-xs text-gray-600">
                    {publicKey.toString()}
                  </Text>
                  <TouchableOpacity onPress={handleCopyAddress} className="rounded bg-blue-100 p-2">
                    <Ionicons name="copy" size={16} color="#3B82F6" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Text className="mb-4 text-lg font-semibold text-gray-900">🔧 How to Fix This:</Text>

            <View className="mb-6 space-y-4">
              <View className="flex-row items-start">
                <View className="mr-3 mt-1 rounded-full bg-blue-100 p-2">
                  <Text className="text-sm font-bold text-blue-600">1</Text>
                </View>
                <View className="flex-1">
                  <Text className="mb-1 font-medium text-gray-900">Visit Solana Faucet</Text>
                  <Text className="mb-2 text-sm text-gray-600">
                    Get free SOL for testing on devnet
                  </Text>
                  <TouchableOpacity
                    onPress={handleOpenFaucet}
                    className="flex-row items-center self-start rounded-lg bg-blue-500 px-4 py-2">
                    <Ionicons
                      name="open-outline"
                      size={16}
                      color="white"
                      style={{ marginRight: 8 }}
                    />
                    <Text className="font-medium text-white">Open Faucet</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View className="flex-row items-start">
                <View className="mr-3 mt-1 rounded-full bg-green-100 p-2">
                  <Text className="text-sm font-bold text-green-600">2</Text>
                </View>
                <View className="flex-1">
                  <Text className="mb-1 font-medium text-gray-900">Paste Your Address</Text>
                  <Text className="text-sm text-gray-600">
                    Copy the wallet address above and paste it into the faucet
                  </Text>
                </View>
              </View>

              <View className="flex-row items-start">
                <View className="mr-3 mt-1 rounded-full bg-purple-100 p-2">
                  <Text className="text-sm font-bold text-purple-600">3</Text>
                </View>
                <View className="flex-1">
                  <Text className="mb-1 font-medium text-gray-900">Request 0.5-1 SOL</Text>
                  <Text className="text-sm text-gray-600">
                    You only need a small amount for testing transactions
                  </Text>
                </View>
              </View>
            </View>

            {publicKey && (
              <View className="mb-4 border-t border-gray-200 pt-4">
                <Text className="mb-2 text-sm font-medium text-gray-700">
                  💡 Alternative: Use Blockchain Explorer
                </Text>
                <TouchableOpacity
                  onPress={handleOpenSolanaFM}
                  className="flex-row items-center justify-center rounded-lg border border-gray-300 bg-gray-100 px-4 py-2">
                  <Ionicons
                    name="globe-outline"
                    size={16}
                    color="#6B7280"
                    style={{ marginRight: 8 }}
                  />
                  <Text className="font-medium text-gray-700">View in Explorer</Text>
                </TouchableOpacity>
              </View>
            )}

            <View className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <Text className="mb-1 font-medium text-blue-800">💡 Pro Tip</Text>
              <Text className="text-sm text-blue-700">
                Once funded, return to the app and try your action again. The funding will be
                detected automatically!
              </Text>
            </View>
          </ScrollView>

          <View className="mt-6 flex-row space-x-3 border-t border-gray-200 pt-4">
            <TouchableOpacity
              onPress={onClose}
              className="flex-1 items-center rounded-lg bg-gray-200 py-3">
              <Text className="font-medium text-gray-700">I&apos;ll Fund Later</Text>
            </TouchableOpacity>

            {onRetry && (
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  onRetry();
                }}
                className="flex-1 items-center rounded-lg bg-blue-500 py-3">
                <Text className="font-medium text-white">Check Again</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
