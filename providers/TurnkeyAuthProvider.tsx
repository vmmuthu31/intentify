import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import { turnkeyAuthService, TurnkeyUser, AuthState } from '../services/turnkey-auth-service';

interface TurnkeyAuthContextType {
  // Auth state
  isAuthenticated: boolean;
  user: TurnkeyUser | null;
  error: string | null;

  // Auth methods
  login: (email: string) => Promise<{ otpId: string; user: TurnkeyUser }>;
  verifyOTP: (otpId: string, otpCode: string, email: string) => Promise<void>;
  completeLogin: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;

  // Wallet methods
  getUserWallets: () => Promise<any>;
  getWalletAccounts: (walletId: string) => Promise<any>;

  // Auth state getters
  getSessionToken: () => string | null;
  getSubOrganizationId: () => string | null;
}

const TurnkeyAuthContext = createContext<TurnkeyAuthContextType | undefined>(undefined);

interface TurnkeyAuthProviderProps {
  children: ReactNode;
}

export function TurnkeyAuthProvider({ children }: TurnkeyAuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    sessionToken: null,
    subOrganizationId: null,
    turnkeyUserId: null,
    apiKeyId: null,
    organizationId: null,
  });

  const [error, setError] = useState<string | null>(null);

  // Memoized auth state updater to prevent unnecessary re-renders
  const updateAuthState = useCallback(() => {
    const currentAuthState = turnkeyAuthService.getAuthState();
    setAuthState((prevState) => {
      // Only update if state actually changed
      if (
        prevState.isAuthenticated !== currentAuthState.isAuthenticated ||
        prevState.user?.id !== currentAuthState.user?.id ||
        prevState.sessionToken !== currentAuthState.sessionToken
      ) {
        return currentAuthState;
      }
      return prevState;
    });
  }, []);

  // Initialize auth state on mount
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        console.log('🔄 Initializing TurnkeyAuth provider...');

        // Wait a bit for AsyncStorage to initialize
        await new Promise((resolve) => setTimeout(resolve, 300));

        if (!isMounted) return;

        const currentAuthState = turnkeyAuthService.getAuthState();
        console.log('🔍 Current auth state:', {
          isAuthenticated: currentAuthState.isAuthenticated,
          hasUser: !!currentAuthState.user,
          hasSessionToken: !!currentAuthState.sessionToken,
          userEmail: currentAuthState.user?.email,
        });

        setAuthState(currentAuthState);
      } catch (err) {
        if (!isMounted) return;
        console.error('Failed to initialize auth:', err);
        setError('Failed to initialize authentication');
      } finally {
        if (isMounted) {
          console.log('✅ TurnkeyAuth provider initialized');
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email: string): Promise<{ otpId: string; user: TurnkeyUser }> => {
    try {
      setError(null);
      console.log('🔐 Starting login for:', email);

      const result = await turnkeyAuthService.login(email);
      console.log('✅ Login successful, OTP sent');
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      console.error('❌ Login failed:', errorMessage);
      setError(errorMessage);
      throw err;
    }
  };

  const verifyOTP = async (otpId: string, otpCode: string, email: string): Promise<void> => {
    try {
      setError(null);
      console.log('🔐 Verifying OTP for:', email);

      await turnkeyAuthService.verifyOTP(otpId, otpCode, email);
      console.log('✅ OTP verification successful');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'OTP verification failed';
      console.error('❌ OTP verification failed:', errorMessage);
      setError(errorMessage);
      throw err;
    }
  };

  const completeLogin = async (email: string): Promise<void> => {
    try {
      setError(null);
      console.log('🔐 Completing login for:', email);

      await turnkeyAuthService.completeLogin(email);

      // Update auth state using the memoized function
      updateAuthState();

      const newAuthState = turnkeyAuthService.getAuthState();
      console.log('✅ Login completed, new auth state:', {
        isAuthenticated: newAuthState.isAuthenticated,
        hasUser: !!newAuthState.user,
        userEmail: newAuthState.user?.email,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login completion failed';
      console.error('❌ Login completion failed:', errorMessage);
      setError(errorMessage);
      throw err;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      setError(null);
      console.log('👋 Logging out user...');

      await turnkeyAuthService.logout();

      // Reset auth state immediately
      setAuthState({
        isAuthenticated: false,
        user: null,
        sessionToken: null,
        subOrganizationId: null,
        turnkeyUserId: null,
        apiKeyId: null,
        organizationId: null,
      });
      console.log('✅ Logout successful');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Logout failed';
      console.error('❌ Logout failed:', errorMessage);
      setError(errorMessage);
      throw err;
    }
  };

  const getUserWallets = async () => {
    try {
      setError(null);
      console.log('💼 Fetching user wallets...');
      const result = await turnkeyAuthService.getUserWallets();
      console.log('✅ Wallets fetched successfully');
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch wallets';
      console.error('❌ Failed to fetch wallets:', errorMessage);
      setError(errorMessage);
      throw err;
    }
  };

  const getWalletAccounts = async (walletId: string) => {
    try {
      setError(null);
      console.log('💼 Fetching wallet accounts for:', walletId);
      const result = await turnkeyAuthService.getWalletAccounts(walletId);
      console.log('✅ Wallet accounts fetched successfully');
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch wallet accounts';
      console.error('❌ Failed to fetch wallet accounts:', errorMessage);
      setError(errorMessage);
      throw err;
    }
  };

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const getSessionToken = useCallback(() => {
    return turnkeyAuthService.getSessionToken();
  }, []);

  const getSubOrganizationId = useCallback(() => {
    return turnkeyAuthService.getSubOrganizationId();
  }, []);

  const contextValue: TurnkeyAuthContextType = {
    // Auth state
    isAuthenticated: authState.isAuthenticated,
    user: authState.user,
    error,

    // Auth methods
    login,
    verifyOTP,
    completeLogin,
    logout,
    clearError,

    // Wallet methods
    getUserWallets,
    getWalletAccounts,

    // Auth state getters
    getSessionToken,
    getSubOrganizationId,
  };

  return <TurnkeyAuthContext.Provider value={contextValue}>{children}</TurnkeyAuthContext.Provider>;
}

export function useTurnkeyAuth(): TurnkeyAuthContextType {
  const context = useContext(TurnkeyAuthContext);
  if (context === undefined) {
    throw new Error('useTurnkeyAuth must be used within a TurnkeyAuthProvider');
  }
  return context;
}

export default TurnkeyAuthProvider;
