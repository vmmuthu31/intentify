import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
  Transaction,
} from '@solana/web3.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { TokenListProvider, TokenInfo } from '@solana/spl-token-registry';
import { usePhantomWallet } from './PhantomProvider';
import { getTokenMetadataService } from '../services/token-metadata-service';

import {
  IntentExecutor,
  createIntentExecutor,
  SwapIntentParams,
  LendIntentParams,
  BuyIntentParams,
  PhantomWalletInterface,
} from '../contracts/IntentExecutor';
import {
  LaunchpadExecutor,
  createLaunchpadExecutor,
  CreateLaunchParams,
  ContributeParams,
  LaunchData,
} from '../contracts/LaunchpadExecutor';

interface TokenBalance {
  mint: string;
  symbol: string;
  name?: string;
  balance: number;
  uiAmount: number;
  decimals: number;
  price?: number;
  uri?: string;
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
  activeLaunches: LaunchData[];
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  executeSwapIntent: (params: SwapIntentParams) => Promise<string>;
  executeLendIntent: (params: LendIntentParams) => Promise<string>;
  executeBuyIntent: (params: BuyIntentParams) => Promise<string>;
  getIntentHistory: () => ActiveIntent[];
  cancelIntent: (intentId: string) => Promise<void>;
  // Launchpad functions
  createTokenLaunch: (params: CreateLaunchParams) => Promise<string>;
  contributeToLaunch: (params: ContributeParams) => Promise<string>;
  finalizeLaunch: (launchPubkey: PublicKey) => Promise<string>;
  refreshLaunches: () => Promise<void>;
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
  const [activeLaunches, setActiveLaunches] = useState<LaunchData[]>([]);
  const [intentExecutor, setIntentExecutor] = useState<IntentExecutor | null>(null);
  const [launchpadExecutor, setLaunchpadExecutor] = useState<LaunchpadExecutor | null>(null);

  // Get Phantom wallet state
  const {
    isLoggedIn: phantomLoggedIn,
    solanaPublicKey: phantomPublicKey,
    signTransaction,
    sharedSecret,
    session,
    dappKeyPair,
  } = usePhantomWallet();

  const tokenMap: Record<string, TokenInfo> = {};

  const loadTokenList = async () => {
    const provider = new TokenListProvider();
    const tokenListContainer = await provider.resolve();
    const tokenList = tokenListContainer.filterByClusterSlug('mainnet-beta').getList();

    tokenList.forEach((token) => {
      tokenMap[token.address] = token;
    });

    return tokenMap;
  };
  // Check for existing connection on app start
  useEffect(() => {
    loadTokenList();
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
      // Create phantom wallet interface for IntentExecutor and LaunchpadExecutor
      const phantomWalletInterface: PhantomWalletInterface = {
        signTransaction: async (transaction: Transaction, onSuccess?: () => void) => {
          // Wrap the original signTransaction to handle success callbacks and ensure string return
          const result = await signTransaction(transaction, () => {
            console.log('✅ Transaction completed successfully in SolanaProvider');
            console.log('🔍 Success callback details:', {
              hasOnSuccess: !!onSuccess,
              callbackName: onSuccess?.name || 'anonymous',
            });

            if (onSuccess) {
              console.log('🔄 Calling onSuccess callback from SolanaProvider');
              try {
                onSuccess();
              } catch (error) {
                console.error('❌ Error in onSuccess callback:', error);
              }
            }
            // Refresh balances after successful transaction
            console.log('🔄 Refreshing balances after successful transaction');
            refreshBalances();
          });

          // Ensure we always return a string
          return result || 'transaction_failed';
        },
        sharedSecret,
        session,
        dappKeyPair,
        solanaPublicKey: phantomPublicKey,
      };

      const executor = createIntentExecutor(connection, publicKey, phantomWalletInterface);
      setIntentExecutor(executor);

      // Create launchpad executor
      const launchpadExec = createLaunchpadExecutor(connection, publicKey, phantomWalletInterface);
      setLaunchpadExecutor(launchpadExec);

      loadIntentHistory();
      refreshLaunches();
    } else {
      setIntentExecutor(null);
    }
  }, [
    publicKey,
    connection,
    signTransaction,
    phantomPublicKey,
    sharedSecret,
    session,
    dappKeyPair,
  ]);

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

  const fetchTokenPrices = async (mints: string[]) => {
    try {
      const endpoint = `https://public-api.birdeye.so/public/multi_price?list=${mints.join(',')}`;
      const response = await fetch(endpoint, {
        headers: {
          'X-API-KEY': 'birdeye-public-api-key',
        },
      });

      const data = await response.json();
      console.log('🔍 Token prices:', data);

      return data.data; // { [mint]: { value: price } }
    } catch (error) {
      console.error('❌ Failed to fetch prices:', error);
      return {};
    }
  };

  const refreshBalances = async () => {
    if (!publicKey) return;

    try {
      console.log('🔄 Refreshing balances...');

      const solBalance = await connection.getBalance(publicKey);
      setBalance(solBalance / LAMPORTS_PER_SOL);

      const balances: TokenBalance[] = [];

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      const mintList = tokenAccounts.value.map(({ account }) => account.data.parsed.info.mint);
      const isDevnet = connection.rpcEndpoint.includes('devnet');
      const prices = isDevnet
        ? {}
        : await fetchTokenPrices([...mintList, 'So11111111111111111111111111111111111111112']);

      balances.push({
        mint: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        balance: solBalance,
        uiAmount: solBalance / LAMPORTS_PER_SOL,
        decimals: 9,
        price: prices?.['So11111111111111111111111111111111111111112']?.value ?? 0,
      });

      // Get metadata service
      const metadataService = getTokenMetadataService(connection);

      // Fetch metadata for all tokens in parallel
      console.log('🔍 Fetching metadata for', mintList.length, 'tokens...');
      const metadataPromises = mintList.map((mint) => metadataService.fetchTokenMetadata(mint));
      const metadataResults = await Promise.allSettled(metadataPromises);

      // Create metadata map
      const metadataMap = new Map<string, any>();
      metadataResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          metadataMap.set(mintList[index], result.value);
        }
      });

      tokenAccounts.value.forEach(({ account }) => {
        const data = account.data.parsed.info;
        const mint = data.mint;
        const rawAmount = parseInt(data.tokenAmount.amount);
        const decimals = data.tokenAmount.decimals;

        if (rawAmount === 0) return;

        const uiAmount = rawAmount / Math.pow(10, decimals);

        const metadata = metadataMap.get(mint);
        const symbol = metadata?.symbol || tokenMap[mint]?.symbol || 'UNKNOWN';
        const price = prices?.[mint]?.value ?? 0;

        console.log(
          `📋 Token ${mint.slice(0, 8)}... - Symbol: ${symbol}${metadata ? ' (from metadata)' : ' (from registry)'}`
        );

        console.log('vmfthu', metadata);
        balances.push({
          mint,
          symbol,
          balance: rawAmount,
          uiAmount,
          decimals,
          price,
          name: metadata?.name,
          uri: metadata?.uri || '',
        });
      });

      setTokenBalances(balances);
      console.log('✅ Balances refreshed with metadata');
    } catch (error) {
      console.error('❌ Failed to refresh balances:', error);
    }
  };

  const executeSwapIntent = async (params: SwapIntentParams): Promise<string> => {
    if (!intentExecutor) {
      throw new Error('Intent executor not initialized');
    }

    if (!publicKey) {
      throw new Error('Wallet not connected');
    }

    console.log('🔍 executeSwapIntent called with params:', params);

    // Check for recent duplicate intents (within last 5 seconds) to prevent accidental double-execution
    const recentDuplicateIntent = activeIntents.find(
      (intent) =>
        intent.type === 'swap' &&
        intent.status === 'executing' &&
        Math.abs(intent.params.amount - params.amount) < 0.0001 && // Same amount
        intent.params.rugproofEnabled === params.rugproofEnabled && // Same rugproof setting
        Date.now() - new Date(intent.createdAt).getTime() < 5000 // Created within last 5 seconds
    );

    if (recentDuplicateIntent) {
      console.log(
        '⚠️ Recent duplicate swap intent detected (within 5 seconds), returning existing'
      );
      return recentDuplicateIntent.txId || 'pending_signature';
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

      console.log('🚀 Executing REAL swap intent with devnet contract and 0.3% protocol fee...');

      // Execute the real swap intent with a success callback to update status
      console.log('🔍 Setting up success callback for intent:', intentId);
      const successCallback = () => {
        console.log('🎉 SUCCESS CALLBACK TRIGGERED! Swap transaction confirmed on blockchain');
        console.log('🔄 Updating intent status from executing to completed for:', intentId);
        console.log(
          '🔍 Current activeIntents before update:',
          activeIntents.map((i) => ({ id: i.id, status: i.status }))
        );

        // Update intent status to completed when transaction is confirmed
        setActiveIntents((prev) => {
          console.log(
            '🔍 Previous intents in callback:',
            prev.map((i) => ({ id: i.id, status: i.status }))
          );
          const updated = prev.map((intent) =>
            intent.id === intentId ? { ...intent, status: 'completed' as const } : intent
          );
          console.log(
            '📝 Updated intents:',
            updated.map((i) => ({ id: i.id, status: i.status }))
          );
          const targetIntent = updated.find((i) => i.id === intentId);
          console.log('📝 Target intent after update:', targetIntent);
          return updated;
        });

        // Save updated history
        saveIntentHistory();
        console.log('✅ Intent status update completed for intentId:', intentId);
      };

      console.log('🚀 Calling executeSwapIntent with success callback');
      const txId = await intentExecutor.executeSwapIntent(params, successCallback);

      console.log('📦 Real swap intent result:', {
        txId,
        fromMint: params.fromMint,
        toMint: params.toMint,
        amount: params.amount,
      });

      if (txId === 'pending_signature' || txId === 'transaction_sent_to_phantom_for_signing') {
        console.log('📤 Transaction sent to Phantom for signing');

        // Update status to show it's pending signature with the transaction ID
        setActiveIntents((prev) =>
          prev.map((intent) =>
            intent.id === intentId
              ? { ...intent, status: 'executing' as const, txId: 'pending_signature' }
              : intent
          )
        );

        return 'pending_signature';
      } else {
        console.log('✅ Real swap transaction completed:', txId);

        // Update with completed transaction info
        setActiveIntents((prev) =>
          prev.map((intent) =>
            intent.id === intentId ? { ...intent, status: 'completed' as const, txId } : intent
          )
        );

        // Refresh balances after execution
        await refreshBalances();
        await saveIntentHistory();

        return txId;
      }
    } catch (error) {
      console.error('❌ Real swap intent execution failed:', error);

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

      const txId = await intentExecutor.executeLendIntent(params, () => {
        console.log('🎉 Lend transaction confirmed on blockchain, updating intent status');
        // Update intent status to completed when transaction is confirmed
        setActiveIntents((prev) =>
          prev.map((intent) =>
            intent.id === intentId ? { ...intent, status: 'completed' as const } : intent
          )
        );
        // Save updated history
        saveIntentHistory();
      });

      // Update with transaction ID immediately (status will be updated by callback)
      setActiveIntents((prev) =>
        prev.map((intent) => (intent.id === intentId ? { ...intent, txId } : intent))
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

      const txId = await intentExecutor.executeBuyIntent(params, () => {
        console.log('🎉 Buy transaction confirmed on blockchain, updating intent status');
        // Update intent status to completed when transaction is confirmed
        setActiveIntents((prev) =>
          prev.map((intent) =>
            intent.id === intentId ? { ...intent, status: 'completed' as const } : intent
          )
        );
        // Save updated history
        saveIntentHistory();
      });

      // Update with transaction ID immediately (status will be updated by callback)
      setActiveIntents((prev) =>
        prev.map((intent) => (intent.id === intentId ? { ...intent, txId } : intent))
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

  // Launchpad functions
  const createTokenLaunch = async (params: CreateLaunchParams): Promise<string> => {
    if (!launchpadExecutor) {
      throw new Error('Launchpad executor not initialized');
    }

    if (!publicKey) {
      throw new Error('Wallet not connected');
    }

    console.log('🚀 Creating token launch with params:', params);

    try {
      const txId = await launchpadExecutor.createTokenLaunch(params, () => {
        console.log('🎉 Launch creation confirmed on blockchain');
        // Refresh launches after successful creation
        refreshLaunches();
      });

      console.log('✅ Token launch created:', txId);
      return txId;
    } catch (error) {
      console.error('❌ Token launch creation failed:', error);
      throw error;
    }
  };

  const contributeToLaunch = async (params: ContributeParams): Promise<string> => {
    if (!launchpadExecutor) {
      throw new Error('Launchpad executor not initialized');
    }

    if (!publicKey) {
      throw new Error('Wallet not connected');
    }

    console.log('💰 Contributing to launch:', params);

    try {
      const txId = await launchpadExecutor.contributeToLaunch(params, () => {
        console.log('🎉 Contribution confirmed on blockchain');
        // Refresh launches and balances after successful contribution
        refreshLaunches();
        refreshBalances();
      });

      console.log('✅ Contribution successful:', txId);
      return txId;
    } catch (error) {
      console.error('❌ Contribution failed:', error);
      throw error;
    }
  };

  const finalizeLaunch = async (launchPubkey: PublicKey): Promise<string> => {
    if (!launchpadExecutor) {
      throw new Error('Launchpad executor not initialized');
    }

    if (!publicKey) {
      throw new Error('Wallet not connected');
    }

    console.log('🏁 Finalizing launch:', launchPubkey.toString());

    try {
      const txId = await launchpadExecutor.finalizeLaunch(launchPubkey, () => {
        console.log('🎉 Launch finalization confirmed on blockchain');
        // Refresh launches after finalization
        refreshLaunches();
      });

      console.log('✅ Launch finalized:', txId);
      return txId;
    } catch (error) {
      console.error('❌ Launch finalization failed:', error);
      throw error;
    }
  };

  const refreshLaunches = async () => {
    if (!launchpadExecutor) {
      console.log('⚠️ Launchpad executor not initialized, skipping launch refresh');
      return;
    }

    try {
      console.log('🔄 Refreshing active launches...');
      const launches = await launchpadExecutor.getActiveLaunches();
      setActiveLaunches(launches);
      console.log(`✅ Found ${launches.length} active launches`);
    } catch (error) {
      console.error('❌ Failed to refresh launches:', error);
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
    activeLaunches,
    connectWallet,
    disconnectWallet,
    refreshBalances,
    executeSwapIntent,
    executeLendIntent,
    executeBuyIntent,
    getIntentHistory,
    cancelIntent,
    // Launchpad functions
    createTokenLaunch,
    contributeToLaunch,
    finalizeLaunch,
    refreshLaunches,
  };

  return <SolanaContext.Provider value={value}>{children}</SolanaContext.Provider>;
}
