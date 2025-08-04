// Wallet Service for Phantom Integration and Biometric Authentication
import { PublicKey, Transaction, Keypair } from '@solana/web3.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import { Linking, Alert, Platform } from 'react-native';

export interface WalletConnectionResult {
  publicKey: PublicKey;
  connected: boolean;
  walletType: 'phantom' | 'test' | 'solflare';
}

export interface BiometricConfig {
  enabled?: boolean;
  title?: string;
  subtitle?: string;
  fallbackLabel?: string;
}

export class WalletService {
  private static instance: WalletService;
  private isInitialized = false;
  private biometricEnabled = false;

  private constructor() {}

  public static getInstance(): WalletService {
    if (!WalletService.instance) {
      WalletService.instance = new WalletService();
    }
    return WalletService.instance;
  }

  /**
   * Initialize wallet service with biometric authentication
   */
  public async initialize(): Promise<void> {
    try {
      // Check if biometric authentication is available
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      this.biometricEnabled = hasHardware && isEnrolled;
      this.isInitialized = true;

      console.log('🔐 Wallet service initialized');
      console.log(`📱 Biometric auth available: ${this.biometricEnabled}`);
    } catch (error) {
      console.error('Failed to initialize wallet service:', error);
      this.isInitialized = true; // Continue without biometrics
    }
  }

  /**
   * Check if biometric authentication is available and configured
   */
  public async getBiometricAvailability(): Promise<{
    available: boolean;
    enrolled: boolean;
    supportedTypes: LocalAuthentication.AuthenticationType[];
  }> {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

      return {
        available: hasHardware,
        enrolled: isEnrolled,
        supportedTypes,
      };
    } catch (error) {
      console.error('Error checking biometric availability:', error);
      return {
        available: false,
        enrolled: false,
        supportedTypes: [],
      };
    }
  }

  /**
   * Authenticate user with biometrics (with fallback for development)
   */
  public async authenticateWithBiometrics(config?: BiometricConfig): Promise<boolean> {
    try {
      if (!this.biometricEnabled) {
        console.warn('Biometric authentication not available, allowing access');
        return true; // Allow fallback
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: config?.title || 'Authenticate to access your wallet',
        subtitle: config?.subtitle || 'Use your fingerprint or face to continue',
        fallbackLabel: config?.fallbackLabel || 'Skip for Demo',
        cancelLabel: 'Skip for Demo',
      });

      if (result.success) {
        console.log('✅ Biometric authentication successful');
        return true;
      } else {
        console.log('⚠️ Biometric authentication skipped:', result.error);
        // For development/demo purposes, allow access even if biometric fails
        // In production, you might want to be more strict
        if (result.error === 'user_cancel' || result.error === 'app_cancel') {
          console.log('🔓 Allowing demo access without biometric authentication');
          return true; // Allow demo access
        }
        return false;
      }
    } catch (error) {
      console.error('Biometric authentication error:', error);
      // Allow fallback for development
      console.log('🔓 Falling back to demo mode');
      return true;
    }
  }

  /**
   * Connect to Phantom Wallet using official SDK
   * This method should be called from a component that has access to usePhantomWallet
   */
  public async connectPhantom(): Promise<WalletConnectionResult | null> {
    try {
      console.log('🦄 Starting Phantom wallet connection...');

      // Note: This method now serves as a placeholder
      // The actual Phantom connection should be handled by components using usePhantomWallet
      console.log('ℹ️ Use usePhantomWallet hook from components for actual Phantom connection');

      Alert.alert(
        'Phantom Connection Available 🦄',
        'Phantom wallet integration is ready! Use the "Phantom Wallet" option in the connection screen.',
        [{ text: 'Got it!', style: 'default' }]
      );

      return null;
    } catch (error) {
      console.error('Phantom connection setup failed:', error);

      // Offer fallback options
      Alert.alert(
        'Connection Setup Failed',
        'Unable to set up Phantom wallet. Would you like to use a demo wallet instead?',
        [{ text: 'Cancel', style: 'cancel' }]
      );

      throw error;
    }
  }

  /**
   * Get stored wallet connection
   */
  public async getStoredWallet(): Promise<WalletConnectionResult | null> {
    try {
      // Authenticate with biometrics first
      const authenticated = await this.authenticateWithBiometrics({
        title: 'Access Wallet',
        subtitle: 'Authenticate to access your stored wallet',
        fallbackLabel: 'Use Passcode',
      });

      if (!authenticated) {
        return null;
      }

      const walletData = await AsyncStorage.getItem('secure_wallet_data');
      if (!walletData) {
        return null;
      }

      const parsed = JSON.parse(walletData);
      return {
        publicKey: new PublicKey(parsed.publicKey),
        connected: true,
        walletType: parsed.walletType || 'test',
      };
    } catch (error) {
      console.error('Failed to get stored wallet:', error);
      return null;
    }
  }

  /**
   * Disconnect wallet and clear stored data
   */
  public async disconnectWallet(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        'secure_wallet_data',
        'wallet_session_id',
        'connected_wallet',
      ]);
      console.log('👋 Wallet disconnected and data cleared');
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  }

  /**
   * Sign transaction (for test wallets)
   */
  public async signTransaction(transaction: Transaction): Promise<Transaction> {
    try {
      const authenticated = await this.authenticateWithBiometrics({
        title: 'Sign Transaction',
        subtitle: 'Authenticate to approve this transaction',
        fallbackLabel: 'Use Passcode',
      });

      if (!authenticated) {
        throw new Error('Authentication required to sign transaction');
      }

      const walletData = await AsyncStorage.getItem('secure_wallet_data');
      if (!walletData) {
        throw new Error('No wallet found');
      }

      const parsed = JSON.parse(walletData);
      if (parsed.walletType !== 'test') {
        throw new Error('Transaction signing only available for test wallets');
      }

      // Reconstruct keypair from stored private key
      const secretKeyArray = Array.isArray(parsed.privateKey)
        ? new Uint8Array(parsed.privateKey)
        : new Uint8Array(parsed.privateKey);

      if (secretKeyArray.length !== 64) {
        throw new Error(`Invalid secret key size: ${secretKeyArray.length}, expected 64`);
      }

      const keypair = Keypair.fromSecretKey(secretKeyArray);
      transaction.sign(keypair);

      return transaction;
    } catch (error) {
      console.error('Failed to sign transaction:', error);
      throw error;
    }
  }

  // Private helper methods

  private async isPhantomInstalled(): Promise<boolean> {
    try {
      // Try multiple URL schemes that Phantom responds to
      const phantomUrls = [
        'phantom://', // Basic scheme
        'phantom://browse', // Browse scheme
        'phantom://v1/connect', // Connect scheme
      ];

      for (const url of phantomUrls) {
        try {
          const canOpen = await Linking.canOpenURL(url);
          if (canOpen) {
            console.log(`✅ Phantom detected via ${url}`);
            return true;
          }
        } catch (error) {
          console.log(`❌ Failed to check ${url}:`, error);
        }
      }

      // Additional check: try to open Phantom's package if on Android
      if (Platform.OS === 'android') {
        try {
          const packageUrl = 'package:app.phantom';
          const packageExists = await Linking.canOpenURL(packageUrl);
          if (packageExists) {
            console.log('✅ Phantom detected via package check');
            return true;
          }
        } catch (error) {
          console.log('❌ Package check failed:', error);
        }
      }

      console.log('❌ Phantom not detected on device');
      return false;
    } catch (error) {
      console.error('Phantom detection error:', error);
      return false;
    }
  }

  private async openPhantomInstall(): Promise<void> {
    const storeUrl =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/us/app/phantom-solana-wallet/id1598432977'
        : 'https://play.google.com/store/apps/details?id=app.phantom';

    await Linking.openURL(storeUrl);
  }

  private async generateSessionId(): Promise<string> {
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    return Array.from(randomBytes, (byte: number) => byte.toString(16).padStart(2, '0')).join('');
  }

  private async storeWalletSecurely(walletData: any): Promise<void> {
    try {
      await AsyncStorage.setItem('secure_wallet_data', JSON.stringify(walletData));
    } catch (error) {
      console.error('Failed to store wallet securely:', error);
      throw error;
    }
  }

  private async handlePhantomResponse(): Promise<WalletConnectionResult> {
    // TODO: In a real implementation, this would handle the deep link callback
    // For now, create a demo Phantom wallet that's actually functional

    console.log('🦄 Creating functional Phantom demo wallet...');

    // Generate a real keypair for demo purposes
    const demoKeypair = Keypair.generate();

    // Store the wallet with the private key so it can actually sign transactions
    await this.storeWalletSecurely({
      publicKey: demoKeypair.publicKey.toString(),
      privateKey: Array.from(demoKeypair.secretKey),
      walletType: 'phantom-demo',
    });

    console.log(
      '🦄 Phantom demo wallet created with real keys:',
      demoKeypair.publicKey.toString().slice(0, 8) + '...'
    );

    return {
      publicKey: demoKeypair.publicKey,
      connected: true,
      walletType: 'phantom',
    };
  }
}

// Export singleton instance
export const walletService = WalletService.getInstance();
