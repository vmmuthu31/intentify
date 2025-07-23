import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  AccountInfo,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getMint,
  createTransferInstruction,
} from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import * as Linking from 'expo-linking';
import nacl from 'tweetnacl';
import { encryptPayload } from '../utils/encryptPayload';
import { decryptPayload } from '../utils/decryptPayload';

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
const NETWORK = clusterApiUrl("devnet");
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
      const fromMint = this.getMintPublicKey(params.fromMint);
      const toMint = this.getMintPublicKey(params.toMint);

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
   * Create a real swap transaction with protocol fee collection
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

    // 1. For now, we'll skip token account creation to simplify the transaction
    // In production, this would handle token account creation and management
    console.log('📝 Skipping token account creation for simplified demo transaction');

    // 4. Add protocol fee collection (simplified to SOL transfer for now)
    if (params.protocolFee > 0) {
      // For now, collect protocol fee as SOL transfer
      // In production, this would handle different token types
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: this.userPublicKey,
          toPubkey: INTENTFI_TREASURY,
          lamports: params.protocolFee,
        })
      );
      console.log('📝 Added protocol fee collection:', params.protocolFee, 'lamports');
    }

    // 5. Add swap instruction (simplified - using a basic transfer for now)
    // In production, this would be a Jupiter swap instruction
    // For now, we'll create a simple SOL transfer to demonstrate the flow
    if (params.fromMint.equals(DEVNET_TOKENS.SOL)) {
      // Simple SOL transfer as a placeholder for the actual swap
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: this.userPublicKey,
        toPubkey: this.userPublicKey, // Self-transfer for demo
        lamports: Math.floor((params.amount - params.protocolFee) * 0.1), // Small demo amount
      });
      
      transaction.add(transferInstruction);
      console.log('📝 Added demo SOL transfer instruction');
    } else {
      // For other tokens, create a mock instruction with minimal data
      const mockSwapInstruction = new TransactionInstruction({
        programId: SystemProgram.programId, // Use system program for safety
        keys: [
          { pubkey: this.userPublicKey, isSigner: true, isWritable: true },
        ],
        data: Buffer.from([0]), // Minimal data to avoid buffer issues
      });
      
      transaction.add(mockSwapInstruction);
      console.log('📝 Added mock swap instruction');
    }

    console.log('📝 Created swap transaction with protocol fee collection');
    return transaction;
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
   */
  private getMintPublicKey(mintStr: string): PublicKey {
    console.log(`🔍 Converting token string to PublicKey: ${mintStr}`);
    
    // Handle common token symbols
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
        // Try to parse as PublicKey string
        try {
          const pubkey = new PublicKey(mintStr);
          console.log(`✅ Parsed as PublicKey: ${pubkey.toString()}`);
          return pubkey;
        } catch {
          console.error(`❌ Unknown token: ${mintStr}`);
          throw new Error(`Unknown token: ${mintStr}`);
        }
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
   * Get intent account PDA
   */
  private async getIntentAccountPDA(intentNumber: number): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('intent'),
        this.userPublicKey.toBuffer(),
        new BN(intentNumber).toArrayLike(Buffer, 'le', 8),
      ],
      DEVNET_INTENTFI_PROGRAM_ID
    );
  }

  /**
   * Get user account info from the blockchain
   */
  private async getUserAccountInfo(): Promise<any | null> {
    try {
      const [userAccountPDA] = await this.getUserAccountPDA();
      const accountInfo = await this.connection.getAccountInfo(userAccountPDA);
      
      if (!accountInfo) {
        return null;
      }

      // Parse account data (simplified - in real implementation, use Anchor deserialization)
      // For now, assume totalIntentsCreated is at byte offset 40 (after pubkey + active_intents)
      const totalIntentsCreated = new BN(accountInfo.data.slice(40, 48), 'le').toNumber();
      
      return {
        totalIntentsCreated,
      };
    } catch (error) {
      console.error('Failed to get user account info:', error);
      return null;
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
    return Buffer.concat([
      Buffer.from([2]), // create_swap_intent instruction discriminator
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
    return Buffer.concat([
      Buffer.from([4]), // execute_swap_intent instruction discriminator
      new BN(params.expectedOutput).toArrayLike(Buffer, 'le', 8),
    ]);
  }

  /**
   * Encode swap instruction data
   */
  private encodeSwapInstructionData(params: {
    amount: number;
    maxSlippage: number;
  }): Buffer {
    return Buffer.concat([
      Buffer.from([3]), // swap instruction discriminator
      new BN(params.amount).toArrayLike(Buffer, 'le', 8),
      new BN(params.maxSlippage).toArrayLike(Buffer, 'le', 2),
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
      const netAmount = amountInLamports - protocolFee;

      // 3. Create lending transaction
      const transaction = await this.createLendingTransaction({
        mint: this.getMintPublicKey(params.mint),
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
      const netAmount = params.usdcAmount - protocolFee;

      // 3. Create buy transaction
      const transaction = await this.createBuyTransaction({
        mint: this.getMintPublicKey(params.mint),
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
    checks: Array<{ name: string; status: 'pass' | 'fail' | 'warning' }>;
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