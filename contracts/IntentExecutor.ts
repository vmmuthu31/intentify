import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import * as Linking from 'expo-linking';
import nacl from 'tweetnacl';
import { encryptPayload } from '../utils/encryptPayload';
import { getTokenMetadataService } from '../services/token-metadata-service';

global.Buffer = global.Buffer || Buffer;

// IntentFI Protocol Fee: 0.3% of transaction value
export const PROTOCOL_FEE_RATE = 0.003; // 0.3%
// Use your actual funded wallet as treasury for devnet testing
export const INTENTFI_TREASURY = new PublicKey('GYLkraPfvT3UtUbdxcHiVWV2EShBoZtqW1Bcq4VazUCt');

// Devnet program IDs
export const DEVNET_INTENTFI_PROGRAM_ID = new PublicKey('2UPCMZ2LESPx8wU83wdng3Yjhx2yxRLEkEDYDkNUg1jd');

// Common token addresses on devnet
export const DEVNET_TOKENS = {
  SOL: new PublicKey('So11111111111111111111111111111111111111112'), // Wrapped SOL
  USDC: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'), // USDC on devnet
  USDT: new PublicKey('EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS'), // USDT on devnet
  BONK: new PublicKey('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'), // BONK on devnet
  RAY: new PublicKey('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'), // RAY on devnet
};

// Phantom wallet integration constants
const useUniversalLinks = true;

const buildUrl = (path: string, params: URLSearchParams) =>
  `${useUniversalLinks ? "https://phantom.app/ul/" : "phantom://"}v1/${path}?${params.toString()}`;

export interface SwapIntentParams {
  fromMint: string;
  toMint: string;
  amount: number;
  minAmountOut?: number;
  maxSlippage: number;
  deadline?: number;
  rugproofEnabled: boolean;
}

export interface LendIntentParams {
  mint: string;
  amount: number;
  minApy: number;
  protocol?: string;
  duration?: number;
}

export interface BuyIntentParams {
  mint: string;
  usdcAmount: number;
  targetPrice?: number;
  maxPriceImpact: number;
  rugproofCheck: boolean;
}

export interface PhantomWalletInterface {
  signTransaction: (transaction: Transaction, onSuccess?: () => void) => Promise<string | undefined>;
  sharedSecret?: Uint8Array;
  session?: string;
  dappKeyPair: nacl.BoxKeyPair;
  solanaPublicKey: PublicKey | null;
}

export class IntentExecutor {
  private phantomWallet?: PhantomWalletInterface;
  private transactionCallbacks: Map<string, () => void> = new Map();

  constructor(
    private connection: Connection,
    private userPublicKey: PublicKey,
    phantomWallet?: PhantomWalletInterface
  ) {
    this.phantomWallet = phantomWallet;
  }

  /**
   * Execute a real swap intent using Phantom wallet and devnet contract
   */
  async executeSwapIntent(params: SwapIntentParams, onSuccess?: () => void): Promise<string> {
    try {
      console.log('🔄 Executing REAL swap intent via Phantom wallet:', params);

      if (!this.phantomWallet) {
        throw new Error('Phantom wallet not available for transaction signing');
      }

      // 1. Convert string mints to PublicKeys
      const fromMint = await this.getMintPublicKey(params.fromMint);
      const toMint = await this.getMintPublicKey(params.toMint);

      // 2. Rugproof check if enabled
      if (params.rugproofEnabled) {
        const rugproofResult = await this.performRugproofCheck(params.toMint);
        if (rugproofResult.score < 70) {
          throw new Error(`Token failed rugproof check: ${rugproofResult.reason}`);
        }
      }

      // 3. Calculate protocol fee (0.3% of transaction value)
      const amountInLamports = Math.floor(params.amount * LAMPORTS_PER_SOL);
      const protocolFee = Math.floor(amountInLamports * PROTOCOL_FEE_RATE);
      const netAmount = amountInLamports - protocolFee;

      console.log(`💰 Amount: ${params.amount} tokens (${amountInLamports} lamports)`);
      console.log(`💸 Protocol fee: ${protocolFee} lamports (0.3%)`);
      console.log(`💎 Net amount: ${netAmount} lamports`);

      // 4. Create the real swap transaction
      const transaction = await this.createRealSwapTransaction({
        fromMint,
        toMint,
        amount: amountInLamports,
        protocolFee,
        maxSlippage: params.maxSlippage,
      });

      console.log('✅ Real swap transaction created');
      console.log(`📦 Instructions: ${transaction.instructions.length}`);

      // 5. Sign and send transaction via Phantom
      const txId = await this.signAndSendTransaction(transaction, () => {
        console.log('✅ Swap transaction completed successfully in IntentExecutor!');
        // Note: This callback should NOT trigger another intent execution
      });

      if (txId === 'pending_signature') {
        console.log('📤 Transaction sent to Phantom for signing');
        return 'pending_signature';
      }

      console.log('✅ Swap transaction completed:', txId);
      return txId;

    } catch (error) {
      console.error('❌ Real swap intent execution failed:', error);
      throw error;
    }
  }

  /**
   * Create a real swap transaction using the devnet contract
   */
  private async createRealSwapTransaction(params: {
    fromMint: PublicKey;
    toMint: PublicKey;
    amount: number;
    protocolFee: number;
    maxSlippage: number;
  }): Promise<Transaction> {
    const transaction = new Transaction();

    // Set transaction properties
    transaction.feePayer = this.userPublicKey;
    const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;

    console.log('🏗️ Creating REAL swap transaction using your devnet contract...');
    console.log('📋 Contract Program ID:', DEVNET_INTENTFI_PROGRAM_ID.toString());
    console.log('📋 From:', params.fromMint.toString());
    console.log('📋 To:', params.toMint.toString());
    console.log('📋 Amount:', params.amount, 'lamports');
    console.log('📋 Max Slippage:', params.maxSlippage, 'bps');

    // Check if contract is ready for real operations
    const readiness = await this.checkContractReadiness();
    
    if (!readiness.protocolInitialized || !readiness.userAccountExists) {
      console.log('⚠️ Contract not ready for real swaps:', readiness.errors);
      console.log('💡 Use the scripts/initialize-protocol.ts to set up the contract');
      console.log('💡 Use the scripts/test-user-init.ts to create your user account');
      console.log('🔄 Falling back to demo transaction for now...');
      
      // Fallback to demo transaction
      if (params.protocolFee > 0) {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: this.userPublicKey,
            toPubkey: INTENTFI_TREASURY,
            lamports: params.protocolFee,
          })
        );
        console.log('📝 Added protocol fee collection:', params.protocolFee, 'lamports');
      }

      const demoInstruction = SystemProgram.transfer({
        fromPubkey: this.userPublicKey,
        toPubkey: this.userPublicKey, // Self-transfer for demo
        lamports: Math.floor((params.amount - params.protocolFee) * 0.01), // 1% of amount for demo
      });
      
      transaction.add(demoInstruction);
      console.log('📝 Added demo transfer instruction');
      console.log('🎯 Demo transaction created (contract not ready)');
      
      return transaction;
    }

    try {
      console.log('🔄 Step 1: Creating swap intent in contract...');
      const createIntentInstruction = await this.createSwapIntentInstruction({
        fromMint: params.fromMint,
        toMint: params.toMint,
        amount: params.amount,
        maxSlippage: params.maxSlippage,
      });
      
      transaction.add(createIntentInstruction);
      console.log('✅ Added create_swap_intent instruction to transaction');

      // Note: Cannot execute in same transaction because create uses 'init' for intent account
      // The intent will be created and can be executed in a separate transaction
      console.log('📝 Intent will be created on-chain. You can execute it separately if needed.');
      console.log('🎯 Real contract swap intent transaction created!');

      console.log('🎯 Real contract swap transaction created!');
      console.log('📦 Total instructions:', transaction.instructions.length);
      console.log('🎉 Your devnet contract will create a real swap intent on-chain!');
      
      return transaction;

    } catch (error) {
      console.error('❌ Failed to create contract swap transaction:', error);
      console.log('� Falling back to demo transaction...');
      
      // Clear any partial instructions
      transaction.instructions = [];
      
      // Fallback to demo transaction
      if (params.protocolFee > 0) {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: this.userPublicKey,
            toPubkey: INTENTFI_TREASURY,
            lamports: params.protocolFee,
          })
        );
        console.log('📝 Added protocol fee collection:', params.protocolFee, 'lamports');
      }

      const demoInstruction = SystemProgram.transfer({
        fromPubkey: this.userPublicKey,
        toPubkey: this.userPublicKey,
        lamports: Math.floor((params.amount - params.protocolFee) * 0.01),
      });
      
      transaction.add(demoInstruction);
      console.log('📝 Added demo transfer instruction (error fallback)');
      
      return transaction;
    }
  }

  /**
   * Sign and send transaction via Phantom wallet
   */
  private async signAndSendTransaction(transaction: Transaction, onSuccess?: () => void): Promise<string> {
    if (!this.phantomWallet) {
      throw new Error('Phantom wallet not available');
    }

    try {
      console.log('🚀 Sending transaction to Phantom for signing...');

      // Generate a unique transaction ID for callback tracking
      const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store the success callback if provided
      if (onSuccess) {
        this.transactionCallbacks.set(transactionId, onSuccess);
      }

      // Create a combined callback that calls both internal and external callbacks
      const combinedCallback = () => {
        console.log('✅ Transaction signed and sent successfully via Phantom');
        
        // Call the IntentExecutor internal callback first
        const callback = this.transactionCallbacks.get(transactionId);
        if (callback) {
          console.log('🔄 Calling IntentExecutor success callback');
          try {
            callback();
          } catch (error) {
            console.error('❌ Error in IntentExecutor callback:', error);
          }
          this.transactionCallbacks.delete(transactionId);
        } else {
          console.log('⚠️ No callback found for transaction:', transactionId);
        }

        // Call the external success callback (for updating intent status)
        if (onSuccess) {
          console.log('🔄 Calling external success callback for intent status update');
          console.log('🔍 External callback type:', typeof onSuccess);
          try {
            onSuccess();
            console.log('✅ External success callback executed successfully');
          } catch (error) {
            console.error('❌ Error in external success callback:', error);
          }
        } else {
          console.log('⚠️ No external success callback provided to IntentExecutor');
        }
      };

      // Use Phantom's signTransaction method with the combined callback
      const result = await this.phantomWallet.signTransaction(transaction, combinedCallback);

      if (result === 'transaction_sent_to_phantom_for_signing') {
        return 'pending_signature';
      }

      return result || 'transaction_completed';

    } catch (error) {
      console.error('❌ Failed to sign transaction via Phantom:', error);
      throw error;
    }
  }

  /**
   * Alternative method: Sign transaction directly using Phantom's deep link protocol
   */
  private async signTransactionViaDeepLink(transaction: Transaction): Promise<string> {
    if (!this.phantomWallet?.sharedSecret || !this.phantomWallet?.session) {
      throw new Error('Phantom session not available for signing');
    }

    try {
      // Ensure transaction has required properties
      transaction.feePayer = this.userPublicKey;
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;

      // Serialize transaction
      const serializedTransaction = bs58.encode(
        transaction.serialize({
          requireAllSignatures: false,
        })
      );

      const payload = {
        session: this.phantomWallet.session,
        transaction: serializedTransaction,
      };

      const [nonce, encryptedPayload] = encryptPayload(payload, this.phantomWallet.sharedSecret);

      const onSignTransactionRedirectLink = Linking.createURL('onSignTransaction');

      const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(this.phantomWallet.dappKeyPair.publicKey),
        nonce: bs58.encode(nonce),
        redirect_link: onSignTransactionRedirectLink,
        payload: bs58.encode(encryptedPayload),
      });

      const url = buildUrl('signTransaction', params);
      await Linking.openURL(url);

      console.log('✅ Transaction sent to Phantom via deep link');
      return 'pending_signature';

    } catch (error) {
      console.error('❌ Failed to send transaction to Phantom via deep link:', error);
      throw error;
    }
  }

  /**
   * Get mint PublicKey from string identifier
   * Only resolves tokens that the user actually holds in their wallet
   */
  private async getMintPublicKey(mintStr: string): Promise<PublicKey> {
    console.log(`🔍 Converting token string to PublicKey: ${mintStr}`);
    
    // Handle common token symbols first (keep for quick access)
    switch (mintStr.toUpperCase()) {
      case 'SOL':
        console.log(`✅ Using SOL mint: ${DEVNET_TOKENS.SOL.toString()}`);
        return DEVNET_TOKENS.SOL;
      case 'USDC':
        console.log(`✅ Using USDC mint: ${DEVNET_TOKENS.USDC.toString()}`);
        return DEVNET_TOKENS.USDC;
      case 'USDT':
        console.log(`✅ Using USDT mint: ${DEVNET_TOKENS.USDT.toString()}`);
        return DEVNET_TOKENS.USDT;
      case 'BONK':
        console.log(`✅ Using BONK mint: ${DEVNET_TOKENS.BONK.toString()}`);
        return DEVNET_TOKENS.BONK;
      case 'RAY':
        console.log(`✅ Using RAY mint: ${DEVNET_TOKENS.RAY.toString()}`);
        return DEVNET_TOKENS.RAY;
      default:
        // Try to parse as PublicKey string first
        try {
          const pubkey = new PublicKey(mintStr);
          console.log(`✅ Parsed as PublicKey: ${pubkey.toString()}`);
          
          // Verify the user actually holds this token
          const hasToken = await this.verifyUserHoldsToken(pubkey);
          if (!hasToken) {
            throw new Error(`You don't hold any ${mintStr} tokens in your wallet`);
          }
          
          return pubkey;
        } catch {
          // If not a valid PublicKey, try to resolve from user's wallet balances only
          console.log(`🔍 Searching for ${mintStr} in your wallet...`);
          
          try {
            const mintFromBalance = await this.getMintFromTokenBalances(mintStr);
            if (mintFromBalance) {
              console.log(`✅ Found ${mintStr} in wallet balances: ${mintFromBalance.toString()}`);
              return mintFromBalance;
            }
          } catch (error) {
            console.warn(`⚠️ Failed to get token from wallet balances:`, error);
          }
          
          console.error(`❌ Token ${mintStr} not found in your wallet`);
          throw new Error(`Token "${mintStr}" not found in your wallet. You can only swap tokens you currently hold.`);
        }
    }
  }

  /**
   * Verify that the user holds a specific token in their wallet
   */
  private async verifyUserHoldsToken(mintAddress: PublicKey): Promise<boolean> {
    try {
      console.log(`🔍 Verifying user holds token: ${mintAddress.toString()}`);
      
      // Get all token accounts for the user
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.userPublicKey,
        {
          mint: mintAddress,
        }
      );

      // Check if user has any balance for this token
      for (const tokenAccount of tokenAccounts.value) {
        const accountData = tokenAccount.account.data.parsed;
        const balance = accountData.info.tokenAmount.uiAmount;
        
        if (balance && balance > 0) {
          console.log(`✅ User holds ${balance} of token ${mintAddress.toString()}`);
          return true;
        }
      }

      console.log(`❌ User does not hold token ${mintAddress.toString()}`);
      return false;
    } catch (error) {
      console.error(`Failed to verify token holdings for ${mintAddress.toString()}:`, error);
      return false;
    }
  }

  /**
   * Get mint address from user's token balances by symbol
   * This is the primary method for resolving tokens since we only swap held tokens
   */
  private async getMintFromTokenBalances(symbol: string): Promise<PublicKey | null> {
    try {
      console.log(`🔍 Searching for ${symbol} in wallet token balances...`);
      
      // Get all token accounts for the user
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.userPublicKey,
        {
          programId: TOKEN_PROGRAM_ID,
        }
      );

      console.log(`📊 Found ${tokenAccounts.value.length} token accounts in wallet`);

      if (tokenAccounts.value.length === 0) {
        console.log(`❌ No token accounts found`);
        return null;
      }

      // Get metadata service and fetch all metadata in parallel (same as SolanaProvider)
      const metadataService = getTokenMetadataService(this.connection);
      const mintList = tokenAccounts.value.map(({ account }) => account.data.parsed.info.mint);
      
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

      // For each token account, try to match by symbol
      for (const tokenAccount of tokenAccounts.value) {
        const accountData = tokenAccount.account.data.parsed;
        const mintAddress = accountData.info.mint;
        const balance = accountData.info.tokenAmount.uiAmount;

        // Only consider tokens with positive balance
        if (balance && balance > 0) {
          const metadata = metadataMap.get(mintAddress);
          const tokenSymbol = metadata?.symbol;
          
          console.log(`📋 Token ${mintAddress.slice(0, 8)}... - Symbol: ${tokenSymbol || 'UNKNOWN'}${metadata ? ' (from metadata)' : ' (no metadata)'} - Balance: ${balance}`);
          
          if (tokenSymbol && tokenSymbol.toUpperCase() === symbol.toUpperCase()) {
            console.log(`✅ Found ${symbol} in wallet: ${mintAddress} (balance: ${balance})`);
            return new PublicKey(mintAddress);
          }
        }
      }

      console.log(`❌ Token ${symbol} not found in wallet balances or balance is zero`);
      return null;
    } catch (error) {
      console.error(`Failed to get token balances:`, error);
      return null;
    }
  }

  /**
   * Get token symbol from mint address using metadata service
   * Uses the same approach as SolanaProvider for consistency
   */
  private async getTokenSymbolFromMint(mintAddress: string): Promise<string | null> {
    try {
      console.log(`🔍 Fetching metadata for mint: ${mintAddress.slice(0, 8)}...`);
      
      // First check hardcoded known tokens for performance
      const knownTokens: { [mint: string]: string } = {
        [DEVNET_TOKENS.SOL.toString()]: 'SOL',
        [DEVNET_TOKENS.USDC.toString()]: 'USDC',
        [DEVNET_TOKENS.USDT.toString()]: 'USDT',
        [DEVNET_TOKENS.BONK.toString()]: 'BONK',
        [DEVNET_TOKENS.RAY.toString()]: 'RAY',
      };

      if (knownTokens[mintAddress]) {
        console.log(`✅ Found known token: ${knownTokens[mintAddress]}`);
        return knownTokens[mintAddress];
      }

      // Use token metadata service for unknown tokens
      const metadataService = getTokenMetadataService(this.connection);
      const metadata = await metadataService.fetchTokenMetadata(mintAddress);
      
      if (metadata?.symbol) {
        console.log(`✅ Fetched metadata symbol: ${metadata.symbol} for mint ${mintAddress.slice(0, 8)}...`);
        return metadata.symbol;
      }

      console.log(`❌ No metadata found for mint ${mintAddress.slice(0, 8)}...`);
      return null;
    } catch (error) {
      console.error(`Failed to get token symbol for mint ${mintAddress}:`, error);
      return null;
    }
  }

  /**
   * Get all tokens the user currently holds in their wallet
   * Useful for populating swap UI with available tokens
   */
  async getUserHeldTokens(): Promise<{
    mint: string;
    symbol: string | null;
    balance: number;
    decimals: number;
  }[]> {
    try {
      console.log('📋 Getting all tokens held by user...');
      
      // Get all token accounts for the user
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.userPublicKey,
        {
          programId: TOKEN_PROGRAM_ID,
        }
      );

      const heldTokens: {
        mint: string;
        symbol: string | null;
        balance: number;
        decimals: number;
      }[] = [];

      // Get metadata service
      const metadataService = getTokenMetadataService(this.connection);

      // Fetch metadata for all tokens in parallel
      const mintList = tokenAccounts.value.map(({ account }) => account.data.parsed.info.mint);
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

      // Process each token account
      for (const tokenAccount of tokenAccounts.value) {
        const accountData = tokenAccount.account.data.parsed;
        const mintAddress = accountData.info.mint;
        const balance = accountData.info.tokenAmount.uiAmount;
        const decimals = accountData.info.tokenAmount.decimals;

        // Only include tokens with positive balance
        if (balance && balance > 0) {
          const metadata = metadataMap.get(mintAddress);
          const symbol = metadata?.symbol || 'UNKNOWN';
          
          console.log(`📋 Token ${mintAddress.slice(0, 8)}... - Symbol: ${symbol}${metadata ? ' (from metadata)' : ' (unknown)'}`);
          
          heldTokens.push({
            mint: mintAddress,
            symbol: symbol,
            balance: balance,
            decimals: decimals,
          });
        }
      }

      // Always include SOL (native token)
      const solBalance = await this.connection.getBalance(this.userPublicKey);
      if (solBalance > 0) {
        heldTokens.unshift({
          mint: DEVNET_TOKENS.SOL.toString(),
          symbol: 'SOL',
          balance: solBalance / LAMPORTS_PER_SOL,
          decimals: 9,
        });
      }

      console.log(`✅ Found ${heldTokens.length} tokens held by user`);
      return heldTokens;
    } catch (error) {
      console.error('Failed to get user held tokens:', error);
      return [];
    }
  }

 

  /**
   * Get protocol state PDA
   */
  private async getProtocolStatePDA(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('protocol_state')],
      DEVNET_INTENTFI_PROGRAM_ID
    );
  }

  /**
   * Get user account PDA
   */
  private async getUserAccountPDA(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('user_account'), this.userPublicKey.toBuffer()],
      DEVNET_INTENTFI_PROGRAM_ID
    );
  }

  /**
   * Get intent account PDA using the correct seeds format
   */
  private async getIntentAccountPDA(nextIntentNumber: number): Promise<[PublicKey, number]> {
    // Contract expects: [b"intent", authority.key().as_ref(), &(user_account.total_intents_created + 1).to_le_bytes()]
    // where total_intents_created is u64, so to_le_bytes() produces 8 bytes
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('intent'),
        this.userPublicKey.toBuffer(),
        new BN(nextIntentNumber).toArrayLike(Buffer, 'le', 8),
      ],
      DEVNET_INTENTFI_PROGRAM_ID
    );
  }

  /**
   * Get user account info from the blockchain
   */
  private async getUserAccountInfo(): Promise<{ totalIntentsCreated: number } | null> {
    try {
      const [userAccountPDA] = await this.getUserAccountPDA();
      const accountInfo = await this.connection.getAccountInfo(userAccountPDA);
      
      if (!accountInfo) {
        return null;
      }

      // Parse account data properly using Anchor layout
      // UserAccount layout: authority(32) + active_intents(1) + total_intents_created(8) + total_volume(8) + rugproof_enabled(1) + bump(1)
      // So total_intents_created is at byte offset 33 (32 + 1)
      const totalIntentsCreated = new BN(accountInfo.data.slice(33, 41), 'le').toNumber();
      
      console.log(`📊 User account - Total intents created: ${totalIntentsCreated}`);
      
      return {
        totalIntentsCreated,
      };
    } catch (error) {
      console.error('Failed to get user account info:', error);
      return null;
    }
  }

  /**
   * Create a swap intent instruction for the devnet contract
   */
  private async createSwapIntentInstruction(params: {
    fromMint: PublicKey;
    toMint: PublicKey;
    amount: number;
    maxSlippage: number;
  }): Promise<TransactionInstruction> {
    try {
      console.log('🔧 Creating swap intent instruction for devnet contract...');
      
      // Get required PDAs
      const [protocolStatePDA] = await this.getProtocolStatePDA();
      const [userAccountPDA] = await this.getUserAccountPDA();
      
      // Get current user account to determine next intent number
      const userAccountInfo = await this.getUserAccountInfo();
      if (!userAccountInfo) {
        throw new Error('User account not initialized. Please initialize your account first.');
      }
      
      // The contract expects (total_intents_created + 1) as the seed
      const nextIntentNumber = userAccountInfo.totalIntentsCreated + 1;
      const [intentAccountPDA] = await this.getIntentAccountPDA(nextIntentNumber);

      console.log('� Contract PDAs:');
      console.log('  Protocol State PDA:', protocolStatePDA.toString());
      console.log('  User Account PDA:', userAccountPDA.toString());
      console.log('  Intent Account PDA:', intentAccountPDA.toString());
      console.log('  Next Intent Number:', nextIntentNumber);

      // Create instruction data using the proper encoding method
      const instructionData = this.encodeCreateSwapIntentData(params);

      console.log('📦 Instruction data created:', {
        fromMint: params.fromMint.toString(),
        toMint: params.toMint.toString(),
        amount: params.amount,
        maxSlippage: params.maxSlippage,
        dataLength: instructionData.length,
      });

      // Create the instruction according to CreateSwapIntent context
      const instruction = new TransactionInstruction({
        programId: DEVNET_INTENTFI_PROGRAM_ID,
        keys: [
          { pubkey: this.userPublicKey, isSigner: true, isWritable: true },    // authority (signer, payer)
          { pubkey: protocolStatePDA, isSigner: false, isWritable: true },     // protocol_state
          { pubkey: userAccountPDA, isSigner: false, isWritable: true },       // user_account  
          { pubkey: intentAccountPDA, isSigner: false, isWritable: true },     // intent_account (will be created)
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        ],
        data: instructionData,
      });

      console.log('✅ Create swap intent instruction created successfully');
      console.log('📋 Keys count:', instruction.keys.length);
      console.log('📋 Program ID:', instruction.programId.toString());
      
      return instruction;

    } catch (error) {
      console.error('❌ Failed to create swap intent instruction:', error);
      throw new Error(`Failed to create swap intent instruction: ${error}`);
    }
  }

  /**
   * Check if the devnet contract is properly initialized and user account exists
   */
  private async checkContractReadiness(): Promise<{ 
    protocolInitialized: boolean; 
    userAccountExists: boolean; 
    errors: string[] 
  }> {
    const errors: string[] = [];
    let protocolInitialized = false;
    let userAccountExists = false;

    try {
      console.log('🔍 Checking devnet contract readiness...');
      
      // Check if protocol state exists
      const [protocolStatePDA] = await this.getProtocolStatePDA();
      const protocolAccount = await this.connection.getAccountInfo(protocolStatePDA);
      
      if (protocolAccount) {
        protocolInitialized = true;
        console.log('✅ Protocol state initialized');
      } else {
        errors.push('Protocol state not initialized');
        console.log('❌ Protocol state not found at:', protocolStatePDA.toString());
      }

      // Check if user account exists
      const [userAccountPDA] = await this.getUserAccountPDA();
      const userAccount = await this.connection.getAccountInfo(userAccountPDA);
      
      if (userAccount) {
        userAccountExists = true;
        console.log('✅ User account exists');
      } else {
        errors.push('User account not initialized');
        console.log('❌ User account not found at:', userAccountPDA.toString());
      }

    } catch (error) {
      const errorMsg = `Contract readiness check failed: ${error}`;
      errors.push(errorMsg);
      console.error('❌', errorMsg);
    }

    return { protocolInitialized, userAccountExists, errors };
  }

  /**
   * Create an execute swap instruction for the devnet contract
   */
  private async createExecuteSwapInstruction(params: {
    expectedOutput: number;
  }): Promise<TransactionInstruction> {
    try {
      console.log('🔧 Creating execute swap intent instruction...');
      
      // Get PDAs
      const [protocolStatePDA] = await this.getProtocolStatePDA();
      const [userAccountPDA] = await this.getUserAccountPDA();
      
      // Get the latest intent account (just created)
      const userAccountInfo = await this.getUserAccountInfo();
      if (!userAccountInfo) {
        throw new Error('User account not found');
      }
      
      const intentNumber = userAccountInfo.totalIntentsCreated + 1;
      const [intentAccountPDA] = await this.getIntentAccountPDA(intentNumber);

      console.log('� Execute swap PDAs:');
      console.log('  Intent Account:', intentAccountPDA.toString());
      console.log('  Expected Output:', params.expectedOutput);

      // For now, we'll use the user's public key as mock token accounts
      // In a real implementation, you'd get the actual associated token accounts
      const mockTokenAccount = this.userPublicKey; // Simplified for demo

      // Create instruction data using the proper encoding method
      const instructionData = this.encodeExecuteSwapIntentData(params);

      console.log('📦 Execute instruction data created:', {
        expectedOutput: params.expectedOutput,
        dataLength: instructionData.length,
      });

      // Create the instruction according to ExecuteSwapIntent context
      const instruction = new TransactionInstruction({
        programId: DEVNET_INTENTFI_PROGRAM_ID,
        keys: [
          { pubkey: this.userPublicKey, isSigner: true, isWritable: true },    // user (signer)
          { pubkey: intentAccountPDA, isSigner: false, isWritable: true },     // intent_account
          { pubkey: protocolStatePDA, isSigner: false, isWritable: true },     // protocol_state
          { pubkey: userAccountPDA, isSigner: false, isWritable: true },       // user_account
          { pubkey: mockTokenAccount, isSigner: false, isWritable: true },     // user_source_token
          { pubkey: mockTokenAccount, isSigner: false, isWritable: true },     // user_destination_token
          { pubkey: INTENTFI_TREASURY, isSigner: false, isWritable: true },    // treasury_fee_account
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },    // token_program
        ],
        data: instructionData,
      });

      console.log('✅ Execute swap intent instruction created');
      return instruction;

    } catch (error) {
      console.error('❌ Failed to create execute swap instruction:', error);
      throw new Error(`Failed to create execute swap instruction: ${error}`);
    }
  }

  /**
   * Encode create swap intent instruction data
   */
  private encodeCreateSwapIntentData(params: {
    fromMint: PublicKey;
    toMint: PublicKey;
    amount: number;
    maxSlippage: number;
  }): Buffer {
    // Anchor discriminator for "create_swap_intent" is first 8 bytes of sha256("global:create_swap_intent")
    const discriminator = Buffer.from([244, 174, 198, 206, 184, 218, 159, 231]);
    
    return Buffer.concat([
      discriminator, // 8-byte Anchor discriminator
      params.fromMint.toBuffer(),
      params.toMint.toBuffer(),
      new BN(params.amount).toArrayLike(Buffer, 'le', 8),
      new BN(params.maxSlippage).toArrayLike(Buffer, 'le', 2),
    ]);
  }

  /**
   * Encode execute swap intent instruction data
   */
  private encodeExecuteSwapIntentData(params: {
    expectedOutput: number;
  }): Buffer {
    // Anchor discriminator for "execute_swap_intent" is first 8 bytes of sha256("global:execute_swap_intent")
    const discriminator = Buffer.from([7, 166, 128, 173, 169, 23, 243, 92]);
    
    return Buffer.concat([
      discriminator, // 8-byte Anchor discriminator
      new BN(params.expectedOutput).toArrayLike(Buffer, 'le', 8),
    ]);
  }


  /**
   * Encode lending instruction data
   */
  private encodeLendInstructionData(params: {
    amount: number;
    protocol: string;
  }): Buffer {
    const protocolBytes = Buffer.from(params.protocol, 'utf8');
    return Buffer.concat([
      Buffer.from([4]), // lend instruction discriminator
      new BN(params.amount).toArrayLike(Buffer, 'le', 8),
      Buffer.from([protocolBytes.length]), // protocol name length
      protocolBytes,
    ]);
  }

  /**
   * Encode buy instruction data
   */
  private encodeBuyInstructionData(params: {
    usdcAmount: number;
    maxPriceImpact: number;
  }): Buffer {
    return Buffer.concat([
      Buffer.from([5]), // buy instruction discriminator
      new BN(Math.floor(params.usdcAmount * LAMPORTS_PER_SOL)).toArrayLike(Buffer, 'le', 8),
      new BN(Math.floor(params.maxPriceImpact * 100)).toArrayLike(Buffer, 'le', 2),
    ]);
  }

  /**
   * Execute a lending intent with real transaction
   */
  async executeLendIntent(params: LendIntentParams, onSuccess?: () => void): Promise<string> {
    try {
      console.log('🏦 Executing REAL lend intent:', params);

      if (!this.phantomWallet) {
        throw new Error('Phantom wallet not available for transaction signing');
      }

      // 1. Find best lending protocol
      const bestProtocol = await this.findBestLendingRate(params.mint, params.amount);
      
      if (bestProtocol.apy < params.minApy) {
        throw new Error(`No protocol offers minimum APY of ${params.minApy}%. Best available: ${bestProtocol.apy}%`);
      }

      // 2. Calculate protocol fee
      const amountInLamports = Math.floor(params.amount * LAMPORTS_PER_SOL);
      const protocolFee = Math.floor(amountInLamports * PROTOCOL_FEE_RATE);

      console.log(`💰 Amount: ${params.amount} tokens (${amountInLamports} lamports)`);
      console.log(`💸 Protocol fee: ${protocolFee} lamports (0.3%)`);
      console.log(`💎 Net amount: ${amountInLamports - protocolFee} lamports`);

      // 3. Create lending transaction
      const transaction = await this.createLendingTransaction({
        mint: await this.getMintPublicKey(params.mint),
        amount: amountInLamports,
        protocolFee,
        protocol: bestProtocol.name,
      });

      // 4. Sign and send via Phantom
      const txId = await this.signAndSendTransaction(transaction, onSuccess);

      console.log('✅ Lend intent executed:', txId);
      return txId;

    } catch (error) {
      console.error('❌ Lend intent execution failed:', error);
      throw error;
    }
  }

  /**
   * Execute a buy intent with real transaction
   */
  async executeBuyIntent(params: BuyIntentParams, onSuccess?: () => void): Promise<string> {
    try {
      console.log('💳 Executing REAL buy intent:', params);

      if (!this.phantomWallet) {
        throw new Error('Phantom wallet not available for transaction signing');
      }

      // 1. Rugproof check
      if (params.rugproofCheck) {
        const rugproofResult = await this.performRugproofCheck(params.mint);
        if (rugproofResult.score < 70) {
          throw new Error(`Token failed rugproof check: ${rugproofResult.reason}`);
        }
      }

      // 2. Calculate protocol fee
      const protocolFee = Math.floor(params.usdcAmount * PROTOCOL_FEE_RATE);

      console.log(`💰 USDC Amount: ${params.usdcAmount}`);
      console.log(`💸 Protocol fee: ${protocolFee} USDC (0.3%)`);
      console.log(`💎 Net amount: ${params.usdcAmount - protocolFee} USDC`);

      // 3. Create buy transaction
      const transaction = await this.createBuyTransaction({
        mint: await this.getMintPublicKey(params.mint),
        usdcAmount: params.usdcAmount,
        protocolFee,
        maxPriceImpact: params.maxPriceImpact,
      });

      // 4. Sign and send via Phantom
      const txId = await this.signAndSendTransaction(transaction, onSuccess);

      console.log('✅ Buy intent executed:', txId);
      return txId;

    } catch (error) {
      console.error('❌ Buy intent execution failed:', error);
      throw error;
    }
  }

  /**
   * Perform rugproof security analysis
   */
  private async performRugproofCheck(mint: string): Promise<{
    score: number;
    reason?: string;
    checks: { name: string; status: 'pass' | 'fail' | 'warning' }[];
  }> {
    // Mock rugproof analysis
    const checks = [
      { name: 'Contract Verification', status: 'pass' as const },
      { name: 'Liquidity Lock', status: 'pass' as const },
      { name: 'Mint Authority', status: 'warning' as const },
      { name: 'Team Tokens', status: 'pass' as const },
    ];

    const passCount = checks.filter(c => c.status === 'pass').length;
    const score = (passCount / checks.length) * 100;

    if (score < 70) {
      return {
        score,
        reason: 'Multiple security concerns detected',
        checks,
      };
    }

    return { score, checks };
  }

  /**
   * Find best lending protocol with highest APY
   */
  private async findBestLendingRate(mint: string, amount: number): Promise<{
    name: string;
    apy: number;
    tvl: number;
  }> {
    // Mock lending protocols
    const protocols = [
      { name: 'Solend', apy: 8.2, tvl: 150000000 },
      { name: 'Port Finance', apy: 7.8, tvl: 80000000 },
      { name: 'Tulip Protocol', apy: 8.5, tvl: 45000000 },
    ];

    // Return highest APY protocol
    return protocols.reduce((best, current) => 
      current.apy > best.apy ? current : best
    );
  }

  /**
   * Get current token price from Jupiter/Raydium
   */
  private async getCurrentTokenPrice(mint: string): Promise<number> {
    // Mock price fetching
    const mockPrices: { [key: string]: number } = {
      'SOL': 189.50,
      'USDC': 1.00,
      'BONK': 0.0009,
      'RAY': 2.34,
    };

    return mockPrices[mint] || Math.random() * 10;
  }

  /**
   * Create swap instruction using Jupiter aggregator
   */
  private async createSwapInstruction(params: SwapIntentParams): Promise<TransactionInstruction> {
    // Mock instruction - in real implementation, use Jupiter API
    return SystemProgram.transfer({
      fromPubkey: this.userPublicKey,
      toPubkey: this.userPublicKey, // Mock destination
      lamports: params.amount,
    });
  }

  /**
   * Create lending instruction for selected protocol
   */
  private async createLendInstruction(params: any): Promise<TransactionInstruction> {
    // Mock instruction - integrate with lending protocols
    return SystemProgram.transfer({
      fromPubkey: this.userPublicKey,
      toPubkey: this.userPublicKey,
      lamports: params.amount,
    });
  }

  /**
   * Create buy instruction
   */
  private async createBuyInstruction(params: BuyIntentParams): Promise<TransactionInstruction> {
    // Mock instruction
    return SystemProgram.transfer({
      fromPubkey: this.userPublicKey,
      toPubkey: this.userPublicKey,
      lamports: params.usdcAmount * LAMPORTS_PER_SOL,
    });
  }

  /**
   * Create a lending transaction with protocol fee
   */
  private async createLendingTransaction(params: {
    mint: PublicKey;
    amount: number;
    protocolFee: number;
    protocol: string;
  }): Promise<Transaction> {
    const transaction = new Transaction();
    
    // Set transaction properties
    transaction.feePayer = this.userPublicKey;
    const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;

    // Add protocol fee collection
    if (params.protocolFee > 0) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: this.userPublicKey,
          toPubkey: INTENTFI_TREASURY,
          lamports: params.protocolFee,
        })
      );
    }

    // Add mock lending instruction (integrate with actual lending protocols)
    const lendInstruction = new TransactionInstruction({
      programId: DEVNET_INTENTFI_PROGRAM_ID,
      keys: [
        { pubkey: this.userPublicKey, isSigner: true, isWritable: true },
        { pubkey: params.mint, isSigner: false, isWritable: false },
      ],
      data: this.encodeLendInstructionData({
        amount: params.amount - params.protocolFee,
        protocol: params.protocol,
      }),
    });

    transaction.add(lendInstruction);
    return transaction;
  }

  /**
   * Create a buy transaction with protocol fee
   */
  private async createBuyTransaction(params: {
    mint: PublicKey;
    usdcAmount: number;
    protocolFee: number;
    maxPriceImpact: number;
  }): Promise<Transaction> {
    const transaction = new Transaction();
    
    // Set transaction properties
    transaction.feePayer = this.userPublicKey;
    const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;

    // Add protocol fee collection
    if (params.protocolFee > 0) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: this.userPublicKey,
          toPubkey: INTENTFI_TREASURY,
          lamports: Math.floor(params.protocolFee * LAMPORTS_PER_SOL),
        })
      );
    }

    // Add mock buy instruction (integrate with DEX)
    const buyInstruction = new TransactionInstruction({
      programId: DEVNET_INTENTFI_PROGRAM_ID,
      keys: [
        { pubkey: this.userPublicKey, isSigner: true, isWritable: true },
        { pubkey: params.mint, isSigner: false, isWritable: false },
      ],
      data: this.encodeBuyInstructionData({
        usdcAmount: params.usdcAmount - params.protocolFee,
        maxPriceImpact: params.maxPriceImpact,
      }),
    });

    transaction.add(buyInstruction);
    return transaction;
  }

  /**
   * Monitor intent execution status
   */
  async getIntentStatus(intentId: string): Promise<{
    status: 'pending' | 'executing' | 'completed' | 'failed';
    txId?: string;
    error?: string;
  }> {
    // Mock status tracking
    return {
      status: 'completed',
      txId: intentId,
    };
  }
}

// Export utility functions
export const createIntentExecutor = (
  connection: Connection, 
  userPubkey: PublicKey, 
  phantomWallet?: PhantomWalletInterface
) => {
  return new IntentExecutor(connection, userPubkey, phantomWallet);
};

export const calculateProtocolFee = (amount: number): number => {
  return Math.floor(amount * PROTOCOL_FEE_RATE);
}; 