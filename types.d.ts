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
