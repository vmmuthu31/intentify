import AsyncStorage from '@react-native-async-storage/async-storage';

// Base URL for the API
const BASE_URL = 'https://www.intentifi.xyz';

// Storage keys
const STORAGE_KEYS = {
  SESSION_TOKEN: 'turnkey_session_token',
  USER_DATA: 'turnkey_user_data',
  SUB_ORG_ID: 'turnkey_sub_org_id',
  TURNKEY_USER_ID: 'turnkey_user_id',
  API_KEY_ID: 'turnkey_api_key_id',
  ORGANIZATION_ID: 'turnkey_organization_id',
} as const;

// Types
export interface TurnkeyUser {
  id: string;
  username: string;
  email: string;
}

export interface LoginResponse {
  success: boolean;
  email: string;
  user: TurnkeyUser;
  subOrganizationId: string;
  turnkeyUserId: string;
}

export interface OTPInitResponse {
  success: boolean;
  message: string;
  otpId: string;
}

export interface OTPVerifyResponse {
  success: boolean;
  message: string;
  token: string;
  userId: string;
}

export interface OTPLoginResponse {
  success: boolean;
  message: string;
  sessionToken: string;
  activity: any;
  apiKeyId: string;
  organizationId: string;
  organizationName: string;
  userId: string;
  userName: string;
}

export interface Wallet {
  id: string;
  walletId: string;
  walletName: string;
  organizationId: string;
  createdAt: string;
}

export interface WalletsResponse {
  success: boolean;
  subOrganizationId: string;
  user: TurnkeyUser;
  wallets: Wallet[];
}

export interface WalletAccount {
  walletAccountId: string;
  organizationId: string;
  walletId: string;
  curve: string;
  pathFormat: string;
  path: string;
  addressFormat: string;
  address: string;
  createdAt: {
    seconds: string;
    nanos: string;
  };
  updatedAt: {
    seconds: string;
    nanos: string;
  };
  publicKey: string;
}

export interface WalletAccountsResponse {
  success: boolean;
  message: string;
  accounts: WalletAccount[];
}

export interface AuthState {
  isAuthenticated: boolean;
  user: TurnkeyUser | null;
  sessionToken: string | null;
  subOrganizationId: string | null;
  turnkeyUserId: string | null;
  apiKeyId: string | null;
  organizationId: string | null;
}

class TurnkeyAuthService {
  private static instance: TurnkeyAuthService;
  private authState: AuthState = {
    isAuthenticated: false,
    user: null,
    sessionToken: null,
    subOrganizationId: null,
    turnkeyUserId: null,
    apiKeyId: null,
    organizationId: null,
  };
  private initialized = false;

  private constructor() {
    // Initialize from storage asynchronously
    this.initializeFromStorage().catch((error) => {
      console.error('Failed to initialize TurnkeyAuthService from storage:', error);
    });
  }

  public static getInstance(): TurnkeyAuthService {
    if (!TurnkeyAuthService.instance) {
      TurnkeyAuthService.instance = new TurnkeyAuthService();
    }
    return TurnkeyAuthService.instance;
  }

  /**
   * Wait for initialization to complete
   */
  public async waitForInitialization(): Promise<void> {
    while (!this.initialized) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /**
   * Initialize auth state from AsyncStorage
   */
  private async initializeFromStorage(): Promise<void> {
    try {
      console.log('🔄 Initializing TurnkeyAuthService from storage...');

      const [sessionToken, userData, subOrgId, turnkeyUserId, apiKeyId, organizationId] =
        await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.SESSION_TOKEN),
          AsyncStorage.getItem(STORAGE_KEYS.USER_DATA),
          AsyncStorage.getItem(STORAGE_KEYS.SUB_ORG_ID),
          AsyncStorage.getItem(STORAGE_KEYS.TURNKEY_USER_ID),
          AsyncStorage.getItem(STORAGE_KEYS.API_KEY_ID),
          AsyncStorage.getItem(STORAGE_KEYS.ORGANIZATION_ID),
        ]);

      console.log('🔍 Storage data found:', {
        hasSessionToken: !!sessionToken,
        hasUserData: !!userData,
        hasSubOrgId: !!subOrgId,
      });

      if (sessionToken && userData) {
        this.authState = {
          isAuthenticated: true,
          user: JSON.parse(userData),
          sessionToken,
          subOrganizationId: subOrgId,
          turnkeyUserId,
          apiKeyId,
          organizationId,
        };
        console.log('✅ Auth state restored from storage:', {
          isAuthenticated: true,
          userEmail: this.authState.user?.email,
        });
      } else {
        console.log('ℹ️ No valid auth data found in storage');
      }
    } catch (error) {
      console.error('Failed to initialize auth state from storage:', error);
      await this.clearAuthData();
    } finally {
      this.initialized = true;
    }
  }

  /**
   * Check if user exists and get user data
   */
  public async checkUserExists(email: string): Promise<LoginResponse> {
    try {
      const response = await fetch(
        `${BASE_URL}/api/turnkey/users/suborg/${encodeURIComponent(email)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: LoginResponse = await response.json();

      if (!data.success) {
        throw new Error('User not found or no sub-organization associated');
      }

      return data;
    } catch (error) {
      console.error('Check user exists error:', error);
      throw error;
    }
  }

  /**
   * Initialize OTP authentication
   */
  public async initializeOTP(email: string): Promise<OTPInitResponse> {
    try {
      const response = await fetch(`${BASE_URL}/api/turnkey/auth/otp/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contact: email,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: OTPInitResponse = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to initialize OTP');
      }

      return data;
    } catch (error) {
      console.error('Initialize OTP error:', error);
      throw error;
    }
  }

  /**
   * Verify OTP code
   */
  public async verifyOTP(
    otpId: string,
    otpCode: string,
    email: string
  ): Promise<OTPVerifyResponse> {
    try {
      const response = await fetch(`${BASE_URL}/api/turnkey/auth/otp/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          otpId,
          otpCode,
          email,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: OTPVerifyResponse = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'OTP verification failed');
      }

      return data;
    } catch (error) {
      console.error('Verify OTP error:', error);
      throw error;
    }
  }

  /**
   * Complete login with OTP
   */
  public async completeLogin(email: string): Promise<OTPLoginResponse> {
    try {
      const response = await fetch(`${BASE_URL}/api/turnkey/auth/otp/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: OTPLoginResponse = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Login failed');
      }

      // Store auth data
      await this.storeAuthData(data, email);

      return data;
    } catch (error) {
      console.error('Complete login error:', error);
      throw error;
    }
  }

  /**
   * Full login flow: check user -> init OTP -> return otpId
   */
  public async login(email: string): Promise<{ otpId: string; user: TurnkeyUser }> {
    try {
      // First check if user exists
      const userResponse = await this.checkUserExists(email);

      // Initialize OTP
      const otpResponse = await this.initializeOTP(email);

      return {
        otpId: otpResponse.otpId,
        user: userResponse.user,
      };
    } catch (error) {
      console.error('Login flow error:', error);
      throw error;
    }
  }

  /**
   * Get user wallets
   */
  public async getUserWallets(subOrganizationId?: string): Promise<WalletsResponse> {
    const subOrgId = subOrganizationId || this.authState.subOrganizationId;

    if (!subOrgId) {
      throw new Error('No sub-organization ID available');
    }

    try {
      const response = await fetch(
        `${BASE_URL}/api/turnkey/users/suborg/subOrgId/${subOrgId}/wallets`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(this.authState.sessionToken && {
              Authorization: `Bearer ${this.authState.sessionToken}`,
            }),
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: WalletsResponse = await response.json();

      if (!data.success) {
        throw new Error('Failed to fetch wallets');
      }

      return data;
    } catch (error) {
      console.error('Get user wallets error:', error);
      throw error;
    }
  }

  /**
   * Get wallet accounts
   */
  public async getWalletAccounts(walletId: string): Promise<WalletAccountsResponse> {
    try {
      const response = await fetch(`${BASE_URL}/api/turnkey/wallets/${walletId}/accounts`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authState.sessionToken && {
            Authorization: `Bearer ${this.authState.sessionToken}`,
          }),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: WalletAccountsResponse = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch wallet accounts');
      }

      return data;
    } catch (error) {
      console.error('Get wallet accounts error:', error);
      throw error;
    }
  }

  /**
   * Store authentication data
   */
  private async storeAuthData(loginData: OTPLoginResponse, email: string): Promise<void> {
    try {
      console.log('💾 Storing auth data...');

      // Get user data first
      const userData = await this.checkUserExists(email);

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, loginData.sessionToken),
        AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData.user)),
        AsyncStorage.setItem(STORAGE_KEYS.SUB_ORG_ID, userData.subOrganizationId),
        AsyncStorage.setItem(STORAGE_KEYS.TURNKEY_USER_ID, userData.turnkeyUserId),
        AsyncStorage.setItem(STORAGE_KEYS.API_KEY_ID, loginData.apiKeyId),
        AsyncStorage.setItem(STORAGE_KEYS.ORGANIZATION_ID, loginData.organizationId),
      ]);

      this.authState = {
        isAuthenticated: true,
        user: userData.user,
        sessionToken: loginData.sessionToken,
        subOrganizationId: userData.subOrganizationId,
        turnkeyUserId: userData.turnkeyUserId,
        apiKeyId: loginData.apiKeyId,
        organizationId: loginData.organizationId,
      };

      console.log('✅ Auth data stored successfully');
    } catch (error) {
      console.error('Failed to store auth data:', error);
      throw error;
    }
  }

  /**
   * Clear authentication data
   */
  private async clearAuthData(): Promise<void> {
    try {
      console.log('🧹 Clearing auth data...');

      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN),
        AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA),
        AsyncStorage.removeItem(STORAGE_KEYS.SUB_ORG_ID),
        AsyncStorage.removeItem(STORAGE_KEYS.TURNKEY_USER_ID),
        AsyncStorage.removeItem(STORAGE_KEYS.API_KEY_ID),
        AsyncStorage.removeItem(STORAGE_KEYS.ORGANIZATION_ID),
      ]);

      this.authState = {
        isAuthenticated: false,
        user: null,
        sessionToken: null,
        subOrganizationId: null,
        turnkeyUserId: null,
        apiKeyId: null,
        organizationId: null,
      };

      console.log('✅ Auth data cleared successfully');
    } catch (error) {
      console.error('Failed to clear auth data:', error);
    }
  }

  /**
   * Logout user
   */
  public async logout(): Promise<void> {
    await this.clearAuthData();
  }

  /**
   * Get current auth state
   */
  public getAuthState(): AuthState {
    return { ...this.authState };
  }

  /**
   * Check if user is authenticated
   */
  public isAuthenticated(): boolean {
    return this.authState.isAuthenticated && !!this.authState.sessionToken;
  }

  /**
   * Get current user
   */
  public getCurrentUser(): TurnkeyUser | null {
    return this.authState.user;
  }

  /**
   * Get session token
   */
  public getSessionToken(): string | null {
    return this.authState.sessionToken;
  }

  /**
   * Get sub-organization ID
   */
  public getSubOrganizationId(): string | null {
    return this.authState.subOrganizationId;
  }
}

// Export singleton instance
export const turnkeyAuthService = TurnkeyAuthService.getInstance();
export default turnkeyAuthService;
