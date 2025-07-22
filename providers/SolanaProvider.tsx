import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { usePhantomWallet } from './PhantomProvider';

import {
  IntentExecutor,
  createIntentExecutor,
  SwapIntentParams,
  LendIntentParams,
  BuyIntentParams,
} from '../contracts/IntentExecutor';

interface TokenBalance {
  mint: string;
  symbol: string;
  balance: number;
  uiAmount: number;
  decimals: number;
  price?: number;
}

interface ActiveIntent {
  id: string;
  type: 'swap' | 'lend' | 'buy';
  status: 'pending' | 'executing' | 'completed' | 'failed';
  params: any;
  createdAt: string;
  txId?: string;
  error?: string;
}

interface SolanaContextType {
  connection: Connection;
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  balance: number;
  tokenBalances: TokenBalance[];
  activeIntents: ActiveIntent[];
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  executeSwapIntent: (params: SwapIntentParams) => Promise<string>;
  executeLendIntent: (params: LendIntentParams) => Promise<string>;
  executeBuyIntent: (params: BuyIntentParams) => Promise<string>;
  getIntentHistory: () => ActiveIntent[];
  cancelIntent: (intentId: string) => Promise<void>;
}

const SolanaContext = createContext<SolanaContextType | undefined>(undefined);

export const useSolana = () => {
  const context = useContext(SolanaContext);
  if (!context) {
    throw new Error('useSolana must be used within a SolanaProvider');
  }
  return context;
};

// Mock wallet addresses for devnet testing
const DEMO_WALLETS = [
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
  '6T8YNqBnkT8YCr9MZqHPGM4BcFHEhL7U9Q2Z8tGHJy7L',
  'HL1vbYQq8eP3DrJTyXGg45vHmFGjvf6zB1dVHWXADWZ',
];

interface SolanaProviderProps {
  children: ReactNode;
}

export function SolanaProvider({ children }: SolanaProviderProps) {
  const [connection] = useState(new Connection(clusterApiUrl('devnet'), 'confirmed'));
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [balance, setBalance] = useState(0);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [activeIntents, setActiveIntents] = useState<ActiveIntent[]>([]);
  const [intentExecutor, setIntentExecutor] = useState<IntentExecutor | null>(null);

  // Get Phantom wallet state
  const { isLoggedIn: phantomLoggedIn, solanaPublicKey: phantomPublicKey } = usePhantomWallet();

  // Check for existing connection on app start
  useEffect(() => {
    checkExistingConnection();
  }, []);

  // Auto-connect when Phantom wallet is connected
  useEffect(() => {
    console.log('🔍 Phantom state change:', {
      phantomLoggedIn,
      phantomPublicKey: phantomPublicKey?.toString(),
      connected,
    });

    if (phantomLoggedIn && phantomPublicKey && !connected) {
      console.log('✅ Phantom wallet detected, auto-connecting...');
      console.log('🔗 Setting SolanaProvider state:', {
        publicKey: phantomPublicKey.toString(),
        connected: true,
      });
      setPublicKey(phantomPublicKey);
      setConnected(true);
      // Save phantom connection
      AsyncStorage.setItem('connected_wallet', phantomPublicKey.toString());
      AsyncStorage.setItem('wallet_type', 'phantom');
      refreshBalances();
      if (Haptics?.impactAsync) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      console.log('✅ SolanaProvider connection completed');
    } else if (!phantomLoggedIn && connected) {
      // If Phantom disconnects, check if we should disconnect too
      AsyncStorage.getItem('wallet_type').then((type) => {
        if (type === 'phantom') {
          console.log('👋 Phantom disconnected, logging out...');
          disconnectWallet();
        }
      });
    } else {
      console.log('🔍 SolanaProvider auto-connect conditions not met:', {
        phantomLoggedIn,
        phantomPublicKey: phantomPublicKey?.toString(),
        connected,
        shouldConnect: phantomLoggedIn && phantomPublicKey && !connected,
      });
    }
  }, [phantomLoggedIn, phantomPublicKey, connected]);

  // Initialize intent executor when wallet connects
  useEffect(() => {
    if (publicKey) {
      const executor = createIntentExecutor(connection, publicKey);
      setIntentExecutor(executor);
      loadIntentHistory();
    } else {
      setIntentExecutor(null);
    }
  }, [publicKey, connection]);

  const checkExistingConnection = async () => {
    try {
      const savedWallet = await AsyncStorage.getItem('connected_wallet');
      if (savedWallet) {
        const pubKey = new PublicKey(savedWallet);
        setPublicKey(pubKey);
        setConnected(true);
        await refreshBalances();
      }
    } catch (error) {
      console.error('Error checking existing connection:', error);
    }
  };

  const connectWallet = async () => {
    if (connecting) return;

    setConnecting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      // For demo purposes, use a random demo wallet
      const randomWallet = DEMO_WALLETS[Math.floor(Math.random() * DEMO_WALLETS.length)];
      const pubKey = new PublicKey(randomWallet);

      // Save wallet connection
      await AsyncStorage.setItem('connected_wallet', randomWallet);

      setPublicKey(pubKey);
      setConnected(true);

      // Refresh balances after connection
      await refreshBalances();

      console.log('✅ Wallet connected:', randomWallet);
      console.log('🌐 Connected to Solana devnet');

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } finally {
      setConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    try {
      await AsyncStorage.removeItem('connected_wallet');
      await AsyncStorage.removeItem('intent_history');
      setPublicKey(null);
      setConnected(false);
      setBalance(0);
      setTokenBalances([]);
      setActiveIntents([]);
      setIntentExecutor(null);

      console.log('👋 Wallet disconnected');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };

  const refreshBalances = async () => {
    if (!publicKey) return;

    try {
      console.log('🔄 Refreshing balances...');

      // Get SOL balance
      const solBalance = await connection.getBalance(publicKey);
      setBalance(solBalance / LAMPORTS_PER_SOL);

      const balances: TokenBalance[] = [];

      // Add SOL as base token
      balances.push({
        mint: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        balance: solBalance,
        uiAmount: solBalance / LAMPORTS_PER_SOL,
        decimals: 9,
        price: 189.5,
      });

      // Add demo token balances for testing
      const demoTokens = [
        { symbol: 'USDC', balance: 2150000000, decimals: 6, price: 1.0 },
        { symbol: 'BONK', balance: 1250000000000, decimals: 5, price: 0.0009 },
        { symbol: 'mSOL', balance: 8700000000, decimals: 9, price: 189.91 },
        { symbol: 'RAY', balance: 125500000000, decimals: 6, price: 2.34 },
        { symbol: 'ORCA', balance: 67800000000, decimals: 6, price: 3.45 },
      ];

      demoTokens.forEach((token) => {
        balances.push({
          mint: `demo_${token.symbol}`,
          symbol: token.symbol,
          balance: token.balance,
          uiAmount: token.balance / Math.pow(10, token.decimals),
          decimals: token.decimals,
          price: token.price,
        });
      });

      setTokenBalances(balances);
      console.log('✅ Balances refreshed');
    } catch (error) {
      console.error('Failed to refresh balances:', error);
    }
  };

  const executeSwapIntent = async (params: SwapIntentParams): Promise<string> => {
    if (!intentExecutor) {
      throw new Error('Intent executor not initialized');
    }

    const intentId = `swap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Add to active intents
    const newIntent: ActiveIntent = {
      id: intentId,
      type: 'swap',
      status: 'pending',
      params,
      createdAt: new Date().toISOString(),
    };

    setActiveIntents((prev) => [...prev, newIntent]);

    try {
      // Update status to executing
      setActiveIntents((prev) =>
        prev.map((intent) =>
          intent.id === intentId ? { ...intent, status: 'executing' as const } : intent
        )
      );

      console.log('🚀 Executing swap intent with 0.3% protocol fee...');

      // Execute via contract
      const txId = await intentExecutor.executeSwapIntent(params);

      // Update status to completed
      setActiveIntents((prev) =>
        prev.map((intent) =>
          intent.id === intentId ? { ...intent, status: 'completed' as const, txId } : intent
        )
      );

      // Refresh balances after execution
      await refreshBalances();
      await saveIntentHistory();

      return txId;
    } catch (error) {
      // Update status to failed
      setActiveIntents((prev) =>
        prev.map((intent) =>
          intent.id === intentId
            ? {
                ...intent,
                status: 'failed' as const,
                error: error instanceof Error ? error.message : 'Unknown error',
              }
            : intent
        )
      );

      throw error;
    }
  };

  const executeLendIntent = async (params: LendIntentParams): Promise<string> => {
    if (!intentExecutor) {
      throw new Error('Intent executor not initialized');
    }

    const intentId = `lend_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newIntent: ActiveIntent = {
      id: intentId,
      type: 'lend',
      status: 'pending',
      params,
      createdAt: new Date().toISOString(),
    };

    setActiveIntents((prev) => [...prev, newIntent]);

    try {
      setActiveIntents((prev) =>
        prev.map((intent) =>
          intent.id === intentId ? { ...intent, status: 'executing' as const } : intent
        )
      );

      console.log('🏦 Executing lend intent with 0.3% protocol fee...');

      const txId = await intentExecutor.executeLendIntent(params);

      setActiveIntents((prev) =>
        prev.map((intent) =>
          intent.id === intentId ? { ...intent, status: 'completed' as const, txId } : intent
        )
      );

      await refreshBalances();
      await saveIntentHistory();

      return txId;
    } catch (error) {
      setActiveIntents((prev) =>
        prev.map((intent) =>
          intent.id === intentId
            ? {
                ...intent,
                status: 'failed' as const,
                error: error instanceof Error ? error.message : 'Unknown error',
              }
            : intent
        )
      );

      throw error;
    }
  };

  const executeBuyIntent = async (params: BuyIntentParams): Promise<string> => {
    if (!intentExecutor) {
      throw new Error('Intent executor not initialized');
    }

    const intentId = `buy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newIntent: ActiveIntent = {
      id: intentId,
      type: 'buy',
      status: 'pending',
      params,
      createdAt: new Date().toISOString(),
    };

    setActiveIntents((prev) => [...prev, newIntent]);

    try {
      setActiveIntents((prev) =>
        prev.map((intent) =>
          intent.id === intentId ? { ...intent, status: 'executing' as const } : intent
        )
      );

      console.log('💳 Executing buy intent with 0.3% protocol fee...');

      const txId = await intentExecutor.executeBuyIntent(params);

      setActiveIntents((prev) =>
        prev.map((intent) =>
          intent.id === intentId ? { ...intent, status: 'completed' as const, txId } : intent
        )
      );

      await refreshBalances();
      await saveIntentHistory();

      return txId;
    } catch (error) {
      setActiveIntents((prev) =>
        prev.map((intent) =>
          intent.id === intentId
            ? {
                ...intent,
                status: 'failed' as const,
                error: error instanceof Error ? error.message : 'Unknown error',
              }
            : intent
        )
      );

      throw error;
    }
  };

  const cancelIntent = async (intentId: string) => {
    setActiveIntents((prev) => prev.filter((intent) => intent.id !== intentId));
    await saveIntentHistory();

    console.log('❌ Intent cancelled:', intentId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const getIntentHistory = (): ActiveIntent[] => {
    return activeIntents.filter(
      (intent) => intent.status === 'completed' || intent.status === 'failed'
    );
  };

  const saveIntentHistory = async () => {
    try {
      await AsyncStorage.setItem('intent_history', JSON.stringify(activeIntents));
    } catch (error) {
      console.error('Failed to save intent history:', error);
    }
  };

  const loadIntentHistory = async () => {
    try {
      const saved = await AsyncStorage.getItem('intent_history');
      if (saved) {
        setActiveIntents(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load intent history:', error);
    }
  };

  const value: SolanaContextType = {
    connection,
    publicKey,
    connected,
    connecting,
    balance,
    tokenBalances,
    activeIntents,
    connectWallet,
    disconnectWallet,
    refreshBalances,
    executeSwapIntent,
    executeLendIntent,
    executeBuyIntent,
    getIntentHistory,
    cancelIntent,
  };

  return <SolanaContext.Provider value={value}>{children}</SolanaContext.Provider>;
}
