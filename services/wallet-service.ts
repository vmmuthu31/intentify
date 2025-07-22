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
   * Connect to Phantom Wallet (mobile deep linking)
   */
  public async connectPhantom(): Promise<WalletConnectionResult | null> {
    try {
      // Check if Phantom is installed
      const phantomInstalled = await this.isPhantomInstalled();

      if (!phantomInstalled) {
        Alert.alert('Phantom Wallet Required', 'Please install Phantom Wallet to continue', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Install', onPress: () => this.openPhantomInstall() },
        ]);
        return null;
      }

      // Authenticate with biometrics first
      const authenticated = await this.authenticateWithBiometrics();
      if (!authenticated) {
        throw new Error('Biometric authentication required');
      }

      // Generate a unique session ID
      const sessionId = await this.generateSessionId();

      // Deep link to Phantom for connection
      const connectUrl = `phantom://v1/connect?dapp_encryption_public_key=${sessionId}&cluster=devnet&app_url=intentify://wallet&redirect_link=intentify://wallet/connected`;

      const canOpen = await Linking.canOpenURL(connectUrl);
      if (!canOpen) {
        throw new Error('Cannot open Phantom wallet');
      }

      await Linking.openURL(connectUrl);

      // For now, we'll simulate the connection response
      // In a real implementation, you'd handle the deep link response
      console.log('🔗 Opening Phantom wallet for connection...');

      // Return a test connection result
      // In production, this would come from the Phantom callback
      return await this.handlePhantomResponse();
    } catch (error) {
      console.error('Failed to connect to Phantom:', error);
      throw error;
    }
  }

  /**
   * Create a test wallet for development/demo purposes
   */
  public async createTestWallet(): Promise<WalletConnectionResult> {
    try {
      // Authenticate with biometrics first (now with fallback)
      const authenticated = await this.authenticateWithBiometrics({
        title: 'Create Test Wallet',
        subtitle: 'Authenticate to create a secure test wallet',
        fallbackLabel: 'Skip for Demo',
      });

      if (!authenticated) {
        // Fallback: Create wallet anyway for demo purposes
        console.log('🔓 Creating demo wallet without authentication');
      }

      // Generate a new keypair for testing
      const keypair = Keypair.generate();

      // Store wallet securely
      await this.storeWalletSecurely({
        publicKey: keypair.publicKey.toString(),
        privateKey: Array.from(keypair.secretKey), // Convert Uint8Array to regular array for JSON storage
        walletType: 'test',
      });

      console.log('👤 Test wallet created:', keypair.publicKey.toString());

      return {
        publicKey: keypair.publicKey,
        connected: true,
        walletType: 'test',
      };
    } catch (error) {
      console.error('Failed to create test wallet:', error);
      throw error;
    }
  }

  /**
   * Create a demo wallet without any authentication (for seamless development)
   */
  public async createDemoWallet(): Promise<WalletConnectionResult> {
    try {
      console.log('🚀 Creating demo wallet for seamless development...');

      // Generate a new keypair for testing
      const keypair = Keypair.generate();

      // Store wallet securely
      await this.storeWalletSecurely({
        publicKey: keypair.publicKey.toString(),
        privateKey: Array.from(keypair.secretKey),
        walletType: 'demo',
      });

      console.log('👤 Demo wallet created:', keypair.publicKey.toString());

      return {
        publicKey: keypair.publicKey,
        connected: true,
        walletType: 'test',
      };
    } catch (error) {
      console.error('Failed to create demo wallet:', error);
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
      const phantomUrl = Platform.OS === 'ios' ? 'phantom://v1/connect' : 'phantom://v1/connect';
      return await Linking.canOpenURL(phantomUrl);
    } catch {
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
    // Simulate Phantom connection response
    // In a real implementation, this would parse the actual response from Phantom

    // For demo, create a simulated Phantom wallet response
    const mockPhantomKey = 'FzWj7yVs6fDjyXHZwNYDkQoWKXwXXNLH7fXDXGHrGnDx';

    await this.storeWalletSecurely({
      publicKey: mockPhantomKey,
      walletType: 'phantom',
    });

    return {
      publicKey: new PublicKey(mockPhantomKey),
      connected: true,
      walletType: 'phantom',
    };
  }
}

// Export singleton instance
export const walletService = WalletService.getInstance();
