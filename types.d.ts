// Type declarations for React Native global polyfills

declare global {
  const Buffer: any;
  const TextEncoder: any;
  const TextDecoder: any;
  const crypto: any;
  const process: any;
}

// Type declarations for Expo modules
declare module 'expo-local-authentication' {
  export interface AuthenticationResult {
    success: boolean;
    error?: string;
  }

  export enum AuthenticationType {
    FINGERPRINT = 1,
    FACIAL_RECOGNITION = 2,
    IRIS = 3,
  }

  export function hasHardwareAsync(): Promise<boolean>;
  export function isEnrolledAsync(): Promise<boolean>;
  export function supportedAuthenticationTypesAsync(): Promise<AuthenticationType[]>;
  export function authenticateAsync(options: {
    promptMessage?: string;
    subtitle?: string;
    fallbackLabel?: string;
    cancelLabel?: string;
  }): Promise<AuthenticationResult>;
}

declare module 'expo-crypto' {
  export function getRandomBytesAsync(length: number): Promise<Uint8Array>;
}

// IntentFI Service Types
export interface IntentAccount {
  authority: import('@solana/web3.js').PublicKey;
  intentType: 'Swap' | 'Lend';
  status: 'Pending' | 'Executed' | 'Cancelled' | 'Expired';
  fromMint: import('@solana/web3.js').PublicKey;
  toMint: import('@solana/web3.js').PublicKey;
  amount: number;
  protocolFee: number;
  maxSlippage?: number;
  minApy?: number;
  executionOutput?: number;
  executionApy?: number;
  createdAt: number;
  expiresAt: number;
  executedAt?: number;
  cancelledAt?: number;
}

export interface UserAccount {
  authority: import('@solana/web3.js').PublicKey;
  activeIntents: number;
  totalIntentsCreated: number;
  totalVolume: number;
}

export interface UserProfile {
  account: UserAccount | null;
  intents: IntentAccount[];
  network: string;
  isMainnet: boolean;
}

export interface SwapIntentParams {
  fromMint: import('@solana/web3.js').PublicKey;
  toMint: import('@solana/web3.js').PublicKey;
  amount: number;
  maxSlippage: number;
}

export interface LendIntentParams {
  mint: import('@solana/web3.js').PublicKey;
  amount: number;
  minApy: number;
}

export interface IntentBuilderData {
  type: 'swap' | 'buy' | 'lend' | 'launch';
  amount: string;
  slippage?: number;
  minApy?: number;
  [key: string]: any;
}
