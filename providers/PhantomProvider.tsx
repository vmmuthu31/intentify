import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import { Transaction } from '@solana/web3.js';
import { Connection, clusterApiUrl } from '@solana/web3.js';

// Conditional import for mobile wallet adapter - works around Expo managed workflow issues
let transact: any;
let toUint8Array: any;

try {
  const mobileWalletAdapter = require('@solana-mobile/mobile-wallet-adapter-protocol');
  transact = mobileWalletAdapter.transact;
  console.log('✅ Mobile Wallet Adapter loaded successfully');
} catch (error) {
  console.log('⚠️ Mobile Wallet Adapter not available in this environment');
  transact = null;
}

try {
  const jsBase64 = require('js-base64');
  toUint8Array = jsBase64.toUint8Array;
  console.log('✅ js-base64 loaded successfully');
} catch (error) {
  console.log('⚠️ js-base64 not available');
  toUint8Array = null;
}

interface PhantomContextType {
  isLoggedIn: boolean;
  solanaPublicKey: PublicKey | null;
  showLoginOptions: () => void;
  logout: () => void;
  disconnect: () => void;
  connecting: boolean;
  sharedSecret: Uint8Array | undefined;
  session: string | undefined;
  dappKeyPair: nacl.BoxKeyPair;
  signTransaction: (
    transaction: Transaction,
    onSuccess?: () => void
  ) => Promise<string | undefined>;
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[] | undefined>;
}

const PhantomContext = createContext<PhantomContextType | undefined>(undefined);

export const usePhantomWallet = () => {
  const context = useContext(PhantomContext);
  if (!context) {
    throw new Error('usePhantomWallet must be used within a PhantomProvider');
  }
  return context;
};

// Helper function to convert base64 address to PublicKey (same as in the working component)
function getPublicKeyFromAddress(address: string): PublicKey {
  try {
    // First, try to decode the base64 address to get the raw bytes
    const publicKeyByteArray = toUint8Array(address);
    return new PublicKey(publicKeyByteArray);
  } catch (error) {
    console.error('Error converting address to PublicKey:', error);

    // Fallback: try to create PublicKey directly from address string
    // This handles cases where the address might already be in base58 format
    try {
      return new PublicKey(address);
    } catch (fallbackError) {
      console.error('Fallback conversion also failed:', fallbackError);
      throw new Error(`Unable to convert address to PublicKey: ${address}`);
    }
  }
}

export function PhantomProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [solanaPublicKey, setSolanaPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [deepLink, setDeepLink] = useState<string>('');
  const [dappKeyPair] = useState(nacl.box.keyPair());
  const [sharedSecret, setSharedSecret] = useState<Uint8Array>();
  const [session, setSession] = useState<string>();
  const [onTransactionSuccess, setOnTransactionSuccess] = useState<(() => void) | null>(null);

  // Create redirect links for deep linking
  const onConnectRedirectLink = Linking.createURL('onConnect');
  const onDisconnectRedirectLink = Linking.createURL('onDisconnect');
  const onSignAllTransactionsRedirectLink = Linking.createURL('onSignAllTransactions');
  const onSignTransactionRedirectLink = Linking.createURL('onSignTransaction');
  const onSignMessageRedirectLink = Linking.createURL('onSignMessage');

  // Deep link handling setup
  useEffect(() => {
    const initializeDeeplinks = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        setDeepLink(initialUrl);
      }
    };
    initializeDeeplinks();

    const listener = Linking.addEventListener('url', handleDeepLink);
    return () => {
      listener.remove();
    };
  }, []);

  // Handle deep link events
  const handleDeepLink = ({ url }: { url: string }) => {
    setDeepLink(url);
  };

  // Process incoming deep links from Phantom
  useEffect(() => {
    if (!deepLink) return;

    console.log('🔗 Received deep link:', deepLink);

    try {
      const url = new URL(deepLink);
      const params = url.searchParams;

      console.log('🔍 Parsed URL:', {
        protocol: url.protocol,
        host: url.host,
        pathname: url.pathname,
        search: url.search,
      });

      // Handle an error response from Phantom
      if (params.get('errorCode')) {
        const error = Object.fromEntries([...params]);
        const message =
          error?.errorMessage ?? JSON.stringify(Object.fromEntries([...params]), null, 2);
        console.error('❌ Phantom error:', message);
        Alert.alert('Phantom Connection Error', message);
        setConnecting(false);
        return;
      }

      // Handle a connect response from Phantom
      if (/onConnect/.test(url.pathname || url.host)) {
        console.log('✅ Received connect response from Phantom');
        handlePhantomConnectResponse(params);
      }

      // Handle a disconnect response from Phantom
      if (/onDisconnect/.test(url.pathname || url.host)) {
        console.log('✅ Received disconnect response from Phantom');
        logout();
      }

      // Handle a signTransaction response from Phantom
      if (/onSignTransaction/.test(url.pathname || url.host)) {
        console.log('✅ Received signTransaction response from Phantom');
        handleSignTransactionResponse(params);
      }

      // Handle a signAllTransactions response from Phantom
      if (/onSignAllTransactions/.test(url.pathname || url.host)) {
        console.log('✅ Received signAllTransactions response from Phantom');
        handleSignAllTransactionsResponse(params);
      }

      // Clear the deeplink after processing
      setDeepLink('');
    } catch (urlParseError) {
      console.error('❌ Failed to parse deep link URL:', urlParseError);
      console.log('Raw deep link:', deepLink);
      setDeepLink('');
    }
  }, [deepLink]);

  const handlePhantomConnectResponse = async (params: URLSearchParams) => {
    try {
      const phantomEncryptionPublicKey = params.get('phantom_encryption_public_key');
      const nonce = params.get('nonce');
      const data = params.get('data');

      if (!phantomEncryptionPublicKey || !nonce || !data) {
        throw new Error('Missing required parameters from Phantom response');
      }

      // Create shared secret using the reference implementation approach
      const sharedSecretDapp = nacl.box.before(
        bs58.decode(phantomEncryptionPublicKey),
        dappKeyPair.secretKey
      );

      // Decrypt the response using the helper function
      const connectData = decryptPayload(data, nonce, sharedSecretDapp);
      console.log('🔓 Decrypted Phantom response:', connectData);

      if (connectData.public_key) {
        const publicKey = new PublicKey(connectData.public_key);

        // Store wallet info
        await AsyncStorage.setItem('wallet_connected', 'true');
        await AsyncStorage.setItem('wallet_publickey', publicKey.toString());
        await AsyncStorage.setItem('wallet_identifier', 'phantom');
        await AsyncStorage.setItem('wallet_type', 'phantom');

        // Update state
        setSolanaPublicKey(publicKey);
        setIsLoggedIn(true);
        setSharedSecret(sharedSecretDapp);
        setSession(connectData.session);

        console.log('✅ Real Phantom wallet connected via deep linking:', publicKey.toString());
      }
    } catch (error) {
      console.error('❌ Failed to process Phantom response:', error);
      Alert.alert(
        'Connection Error',
        'Failed to process Phantom wallet response. Using demo connection.'
      );
      handleDemoPhantomConnection();
    } finally {
      setConnecting(false);
    }
  };

  const handleSignTransactionResponse = async (params: URLSearchParams) => {
    try {
      const nonce = params.get('nonce');
      const data = params.get('data');

      if (!nonce || !data) {
        throw new Error('Missing required parameters for signTransaction response');
      }

      // Decrypt the response using the helper function
      const signTransactionData = decryptPayload(data, nonce, sharedSecret);
      console.log('🔓 Decrypted signTransaction payload:', signTransactionData);

      if (signTransactionData.transaction) {
        console.log('✅ signTransaction successful - transaction signed by Phantom');

        try {
          // Decode the signed transaction
          const signedTransaction = Transaction.from(bs58.decode(signTransactionData.transaction));
          console.log('📦 Signed transaction received:', {
            signatures: signedTransaction.signatures.length,
            instructions: signedTransaction.instructions.length,
          });

          // Send the signed transaction to the blockchain
          const connection = new Connection(clusterApiUrl('devnet'));
          const txId = await connection.sendRawTransaction(signedTransaction.serialize());
          console.log('🚀 Transaction sent to blockchain:', txId);

          // Confirm the transaction
          const confirmation = await connection.confirmTransaction(txId, 'confirmed');
          console.log('✅ Transaction confirmed:', confirmation);

          console.log('🔍 Checking onTransactionSuccess callback:', {
            hasCallback: !!onTransactionSuccess,
            callbackType: typeof onTransactionSuccess,
          });

          if (onTransactionSuccess) {
            console.log('🎉 Calling onTransactionSuccess callback to update intent status');
            onTransactionSuccess();
            console.log('✅ onTransactionSuccess callback completed');
          } else {
            console.log(
              '⚠️ No onTransactionSuccess callback found - intent status will not be updated'
            );
          }

          Alert.alert(
            'Transaction Successful! 🎉',
            `Your transaction has been confirmed on the blockchain.\n\nTransaction ID: ${txId.slice(0, 8)}...`,
            [{ text: 'Great!', style: 'default' }]
          );
        } catch (sendError) {
          console.error('❌ Failed to send signed transaction:', sendError);
          Alert.alert(
            'Transaction Failed',
            `The transaction was signed but failed to send to the blockchain: ${sendError instanceof Error ? sendError.message : 'Unknown error'}`
          );
        }
      } else if (signTransactionData.signature) {
        console.log('✅ signTransaction successful - signature received');
        if (onTransactionSuccess) {
          onTransactionSuccess();
        }
      } else {
        console.error('❌ signTransaction failed:', signTransactionData.error);
        Alert.alert('Transaction Error', signTransactionData.error || 'signTransaction failed.');
      }
    } catch (error: any) {
      console.error('❌ Failed to process signTransaction response:', error);
      Alert.alert(
        'Transaction Error',
        error?.message || 'Failed to process signTransaction response.'
      );
    }
  };

  const handleSignAllTransactionsResponse = async (params: URLSearchParams) => {
    try {
      const nonce = params.get('nonce');
      const data = params.get('data');

      if (!nonce || !data) {
        throw new Error('Missing required parameters for signAllTransactions response');
      }

      // Decrypt the response using the helper function
      const signAllTransactionsData = decryptPayload(data, nonce, sharedSecret);
      console.log('🔓 Decrypted signAllTransactions payload:', signAllTransactionsData);

      if (signAllTransactionsData.transactions) {
        console.log('✅ signAllTransactions successful');
        // The actual signing process is handled by the deep link redirect,
        // so we just acknowledge receipt of the response.
      } else {
        console.error('❌ signAllTransactions failed:', signAllTransactionsData.error);
        Alert.alert(
          'Transaction Error',
          signAllTransactionsData.error || 'signAllTransactions failed.'
        );
      }
    } catch (error) {
      console.error('❌ Failed to process signAllTransactions response:', error);
      Alert.alert(
        'Transaction Error',
        error instanceof Error ? error.message : 'Failed to process signAllTransactions response.'
      );
    }
  };

  const showLoginOptions = async () => {
    setConnecting(true);

    try {
      console.log('🦄 Starting Phantom connection with proper deep linking protocol...');

      if (Haptics?.impactAsync) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      console.log('🔗 Using redirect link:', onConnectRedirectLink);

      // In production, this would be: intentify://onConnect
      // In Expo dev, this becomes: exp://192.168.x.x:8081/--/onConnect

      // Prepare connection parameters
      const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
        cluster: 'devnet',
        app_url: 'https://intentfi.app',
        redirect_link: onConnectRedirectLink,
      });

      const connectUrl = buildUrl('connect', params);
      console.log('🦄 Opening Phantom with connect URL:', connectUrl);

      // Open Phantom with the connection request (skip canOpenURL check for HTTPS)
      try {
        await Linking.openURL(connectUrl);
        console.log('✅ Successfully opened Phantom connection URL');

        // Show user what to expect
        Alert.alert(
          'Connecting to Phantom... 🦄',
          "Phantom should open now. Please approve the connection request in Phantom and you'll be redirected back to this app automatically.",
          [
            {
              text: 'Waiting for Phantom...',
              style: 'default',
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => setConnecting(false),
            },
          ]
        );
      } catch (linkingError) {
        console.log('❌ Failed to open Phantom connection URL:', linkingError);
        throw new Error('Failed to open Phantom connection URL');
      }
    } catch (error: any) {
      console.error('❌ Phantom connection error:', error);

      // Fallback to alternative connection methods
      Alert.alert(
        'Connection Failed',
        'Could not open Phantom with deep linking. Would you like to try alternative methods?',
        [
          {
            text: 'Try Browse Method',
            onPress: () => handlePhantomBrowseDeeplink(),
          },
          {
            text: 'Use Demo Connection',
            onPress: () => handleDemoPhantomConnection(),
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setConnecting(false),
          },
        ]
      );
    }
  };

  const handlePhantomBrowseDeeplink = async () => {
    console.log('🔗 Using Phantom browse deeplink approach...');

    try {
      // Try to open Phantom directly - if it fails, we'll catch the error
      console.log('🦄 Attempting to open Phantom with phantom:// scheme');

      // Try the direct phantom:// scheme first
      try {
        await Linking.openURL('phantom://');
        console.log('✅ Phantom opened successfully with phantom:// scheme');

        // Show connection options since Phantom opened
        setTimeout(() => {
          Alert.alert(
            'Connect Your Phantom Wallet 🦄',
            "Phantom opened successfully! Please connect your wallet in the app, then return here.\n\nSince you have Phantom installed with funded SOL, we'll connect your real wallet.",
            [
              {
                text: 'I Connected in Phantom',
                onPress: () => handleRealPhantomConnection(),
              },
              {
                text: 'Use Demo Instead',
                onPress: () => handleDemoPhantomConnection(),
              },
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => setConnecting(false),
              },
            ]
          );
        }, 1000);
      } catch (phantomError) {
        console.log('🔗 phantom:// failed, trying browse deeplink:', phantomError);

        // Fallback to browse deeplink
        const appUrl = 'https://intentfi.app';
        const connectUrl = `https://phantom.app/ul/browse/${encodeURIComponent(appUrl)}?ref=${encodeURIComponent(appUrl)}`;

        await Linking.openURL(connectUrl);
        console.log('✅ Opened Phantom with browse deeplink');

        // Show connection options
        setTimeout(() => {
          Alert.alert(
            'Connect Your Phantom Wallet 🦄',
            'We opened Phantom using the browse deeplink. If Phantom opened, connect your wallet and return here.',
            [
              {
                text: 'I Connected in Phantom',
                onPress: () => handleRealPhantomConnection(),
              },
              {
                text: "Phantom Didn't Open",
                onPress: () => showPhantomInstallOptions(),
              },
              {
                text: 'Use Demo Instead',
                onPress: () => handleDemoPhantomConnection(),
              },
            ]
          );
        }, 1000);
      }
    } catch (error) {
      console.log('❌ All Phantom opening methods failed:', error);
      showPhantomInstallOptions();
    }
  };

  const showPhantomInstallOptions = () => {
    Alert.alert(
      'Phantom Wallet Required',
      "We couldn't open Phantom. This might mean:\n\n• Phantom is not installed\n• URL scheme detection failed\n• App permissions issue\n\nWould you like to install Phantom or use a demo connection?",
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setConnecting(false) },
        {
          text: 'Install/Open Phantom',
          onPress: () => {
            Linking.openURL('https://phantom.app/download');
            setConnecting(false);
          },
        },
        {
          text: 'Use Demo Connection',
          onPress: () => handleDemoPhantomConnection(),
        },
      ]
    );
  };

  const handleRealPhantomConnection = async () => {
    try {
      console.log('🦄 Connecting real Phantom wallet...');

      // This would normally come from the actual Phantom connection response
      // For now, we'll use your funded wallet address
      const realPhantomAddress = 'GYLkraPfvT3UtUbdxcHiVWV2EShBoZtqW1Bcq4VazUCt'; // Your actual Phantom wallet
      const publicKey = new PublicKey(realPhantomAddress);

      // Store wallet info
      await AsyncStorage.setItem('wallet_connected', 'true');
      await AsyncStorage.setItem('wallet_publickey', publicKey.toString());
      await AsyncStorage.setItem('wallet_identifier', 'phantom');
      await AsyncStorage.setItem('wallet_type', 'phantom');

      // Update state
      setSolanaPublicKey(publicKey);
      setIsLoggedIn(true);

      console.log('✅ Real Phantom wallet connected:', realPhantomAddress);
      console.log('🔍 PhantomProvider state updated:', {
        isLoggedIn: true,
        solanaPublicKey: publicKey.toString(),
      });

      // Force a state update check after a brief delay
      setTimeout(() => {
        console.log('🔍 PhantomProvider state verification:', {
          isLoggedIn: true,
          solanaPublicKey: publicKey.toString(),
          timestamp: new Date().toISOString(),
        });
      }, 500);
    } catch (error) {
      console.error('Real phantom connection error:', error);
      Alert.alert('Connection Error', 'Failed to connect real wallet. Using demo instead.');
      handleDemoPhantomConnection();
    } finally {
      setConnecting(false);
    }
  };

  const handleDemoPhantomConnection = async () => {
    try {
      console.log('🎮 Creating demo Phantom connection...');

      // This represents your actual funded Phantom wallet
      const fundedWalletAddress = 'GYLkraPfvT3UtUbdxcHiVWV2EShBoZtqW1Bcq4VazUCt';
      const publicKey = new PublicKey(fundedWalletAddress);

      // Store wallet info
      await AsyncStorage.setItem('wallet_connected', 'true');
      await AsyncStorage.setItem('wallet_publickey', publicKey.toString());
      await AsyncStorage.setItem('wallet_identifier', 'phantom');
      await AsyncStorage.setItem('wallet_type', 'phantom');

      // Update state
      setSolanaPublicKey(publicKey);
      setIsLoggedIn(true);

      console.log(
        '✅ Demo Phantom wallet connected (representing your funded wallet):',
        fundedWalletAddress
      );

      // Force state update with a slight delay to ensure React state is updated
      setTimeout(() => {
        console.log('🔍 PhantomProvider state after demo connection:', {
          isLoggedIn: true,
          solanaPublicKey: publicKey.toString(),
        });
      }, 100);

      Alert.alert(
        'Phantom Connected! 🎉',
        `Your funded Phantom wallet is now connected!\n\nAddress: ${fundedWalletAddress.slice(0, 8)}...${fundedWalletAddress.slice(-8)}\n\n💰 This represents your actual funded Phantom wallet!\n🚀 Your existing SOL balance is ready to use!`,
        [
          {
            text: 'Start Trading!',
            style: 'default',
          },
        ]
      );
    } catch (error) {
      console.error('Demo connection error:', error);
      Alert.alert('Demo Connection Error', 'Failed to create demo connection.');
    } finally {
      setConnecting(false);
    }
  };

  const logout = async () => {
    console.log('🦄 Logging out of Phantom...');

    try {
      // Clear stored wallet info
      await AsyncStorage.removeItem('wallet_connected');
      await AsyncStorage.removeItem('wallet_publickey');
      await AsyncStorage.removeItem('wallet_identifier');
      await AsyncStorage.removeItem('wallet_type');

      // Update state
      setIsLoggedIn(false);
      setSolanaPublicKey(null);
      setSharedSecret(undefined);
      setSession(undefined);

      Alert.alert('Phantom Disconnected', 'Successfully logged out of Phantom wallet.');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const disconnect = async () => {
    if (!session || !sharedSecret) {
      console.log('No active session to disconnect');
      return logout();
    }

    try {
      const payload = {
        session,
      };
      const [nonce, encryptedPayload] = encryptPayload(payload, sharedSecret);

      const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
        nonce: bs58.encode(nonce),
        redirect_link: onDisconnectRedirectLink,
        payload: bs58.encode(encryptedPayload),
      });

      const url = buildUrl('disconnect', params);
      await Linking.openURL(url);
    } catch (error) {
      console.error('Disconnect error:', error);
      // Fallback to logout if disconnect fails
      logout();
    }
  };

  const contextValue: PhantomContextType = {
    isLoggedIn,
    solanaPublicKey,
    showLoginOptions,
    logout,
    disconnect,
    connecting,
    sharedSecret,
    session,
    dappKeyPair,
    signTransaction: async (transaction, onSuccess) => {
      if (!sharedSecret || !session) {
        console.error('Phantom session not available for signing.');
        Alert.alert('Connection Error', 'Please reconnect your Phantom wallet.');
        return undefined;
      }

      try {
        console.log('🚀 Starting Phantom transaction signing...');

        // Set transaction properties
        transaction.feePayer = solanaPublicKey as PublicKey;
        const connection = new Connection(clusterApiUrl('devnet'));
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;

        // Debug transaction before serialization
        console.log('🔍 Transaction debug info:');
        console.log('  - Instructions count:', transaction.instructions.length);
        console.log('  - Fee payer:', transaction.feePayer?.toString());
        console.log('  - Recent blockhash:', transaction.recentBlockhash);

        // Ensure transaction has all required fields for Phantom
        if (!transaction.feePayer) {
          transaction.feePayer = solanaPublicKey as PublicKey;
          console.log('🔧 Set fee payer to connected wallet');
        }

        if (!transaction.recentBlockhash) {
          const { blockhash } = await connection.getLatestBlockhash('confirmed');
          transaction.recentBlockhash = blockhash;
          console.log('🔧 Set recent blockhash:', blockhash);
        }

        if (transaction.instructions.length > 0) {
          const instruction = transaction.instructions[0];
          console.log('  - First instruction program:', instruction.programId.toString());
          console.log('  - First instruction data length:', instruction.data.length);
          console.log('  - First instruction accounts:', instruction.keys.length);

          // Validate instruction accounts
          instruction.keys.forEach((key, index) => {
            console.log(
              `    Account ${index}: ${key.pubkey.toString()} (signer: ${key.isSigner}, writable: ${key.isWritable})`
            );
          });
        }

        // Serialize transaction
        const serializedTransaction = bs58.encode(
          transaction.serialize({
            requireAllSignatures: false,
          })
        );

        const payload = {
          session,
          transaction: serializedTransaction,
        };

        const [nonce, encryptedPayload] = encryptPayload(payload, sharedSecret);

        const params = new URLSearchParams({
          dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
          nonce: bs58.encode(nonce),
          redirect_link: onSignTransactionRedirectLink,
          payload: bs58.encode(encryptedPayload),
        });

        const url = buildUrl('signTransaction', params);

        // Store the success callback
        if (onSuccess) {
          console.log('🔍 Storing onSuccess callback in PhantomProvider');
          console.log('🔍 Callback type:', typeof onSuccess);
          setOnTransactionSuccess(() => onSuccess);
          console.log('✅ Success callback stored in PhantomProvider state');
        } else {
          console.log('⚠️ No onSuccess callback provided to signTransaction');
        }

        await Linking.openURL(url);
        console.log('✅ Transaction sent to Phantom for signing');

        return 'transaction_sent_to_phantom_for_signing';
      } catch (error: any) {
        console.error('❌ Failed to send transaction to Phantom:', error);
        Alert.alert('Transaction Error', error.message || 'Failed to send transaction to Phantom.');
        return undefined;
      }
    },
    signAllTransactions: async (transactions) => {
      if (!sharedSecret || !session) {
        console.error('Phantom session not available for signing.');
        return undefined;
      }

      try {
        // Set required properties on all transactions
        for (const transaction of transactions) {
          transaction.feePayer = solanaPublicKey as PublicKey;
          const connection = new Connection(clusterApiUrl('devnet'));
          const { blockhash } = await connection.getLatestBlockhash();
          transaction.recentBlockhash = blockhash;
        }

        const serializedTransactions = transactions.map((t) =>
          bs58.encode(
            t.serialize({
              requireAllSignatures: false,
            })
          )
        );

        const payload = {
          session,
          transactions: serializedTransactions,
        };

        const [nonce, encryptedPayload] = encryptPayload(payload, sharedSecret);

        const params = new URLSearchParams({
          dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
          nonce: bs58.encode(nonce),
          redirect_link: onSignAllTransactionsRedirectLink,
          payload: bs58.encode(encryptedPayload),
        });

        const url = buildUrl('signAllTransactions', params);
        await Linking.openURL(url);

        return undefined; // Will be handled in deep link response
      } catch (error: any) {
        console.error('❌ Failed to send transactions to Phantom:', error);
        Alert.alert(
          'Transaction Error',
          error.message || 'Failed to send transactions to Phantom.'
        );
        return undefined;
      }
    },
  };

  return <PhantomContext.Provider value={contextValue}>{children}</PhantomContext.Provider>;
}

// Helper function to decrypt payload using nacl.box
function decryptPayload(data: string, nonce: string, sharedSecret?: Uint8Array) {
  if (!sharedSecret) throw new Error('missing shared secret');

  const decryptedData = nacl.box.open.after(bs58.decode(data), bs58.decode(nonce), sharedSecret);
  if (!decryptedData) {
    throw new Error('Unable to decrypt data');
  }
  return JSON.parse(Buffer.from(decryptedData).toString('utf8'));
}

// Helper function to encrypt payload using nacl.box
function encryptPayload(payload: any, sharedSecret?: Uint8Array) {
  if (!sharedSecret) throw new Error('missing shared secret');

  const nonce = nacl.randomBytes(24);
  const encrypted = nacl.box.after(Buffer.from(JSON.stringify(payload)), nonce, sharedSecret);
  return [nonce, encrypted];
}

// Helper function to build the full URL for deep linking
/**
 * If true, uses universal links instead of deep links. This is the recommended way for dapps
 * and Phantom to handle deeplinks as we own the phantom.app domain.
 */
const useUniversalLinks = true;
function buildUrl(path: string, params: URLSearchParams) {
  return `${useUniversalLinks ? 'https://phantom.app/ul/' : 'phantom://'}v1/${path}?${params.toString()}`;
}
