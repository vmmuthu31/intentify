import {
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import { networkService } from './config';
import * as Crypto from 'expo-crypto';

// Calculate the Anchor instruction discriminator based on method name
async function deriveDiscriminator(name: string): Promise<Buffer> {
  // Using expo-crypto which has a different API than Node's crypto
  const data = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `global:${name}`,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
  return Buffer.from(data, 'hex').slice(0, 8);
}

export interface SwapIntentParams {
  fromMint: PublicKey;
  toMint: PublicKey;
  amount: number;
  maxSlippage: number; // in basis points (100 = 1%)
}

export interface LendIntentParams {
  mint: PublicKey;
  amount: number;
  minApy: number; // in basis points (1000 = 10%)
}

export interface IntentAccount {
  authority: PublicKey;
  intentType: 'Swap' | 'Lend';
  status: 'Pending' | 'Executed' | 'Cancelled' | 'Expired';
  fromMint: PublicKey;
  toMint: PublicKey;
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
  authority: PublicKey;
  activeIntents: number;
  totalIntentsCreated: number;
  totalVolume: number;
}

export class IntentFiService {
  private static instance: IntentFiService;

  private constructor() {}

  public static getInstance(): IntentFiService {
    if (!IntentFiService.instance) {
      IntentFiService.instance = new IntentFiService();
    }
    return IntentFiService.instance;
  }

  /**
   * Get program derived addresses
   */
  public async getProtocolStatePDA(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('protocol_state')],
      networkService.getIntentFiProgramId()
    );
  }

  public async getUserAccountPDA(authority: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('user_account'), authority.toBuffer()],
      networkService.getIntentFiProgramId()
    );
  }

  public async getIntentAccountPDA(
    authority: PublicKey,
    intentNumber: number
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('intent'),
        authority.toBuffer(),
        new BN(intentNumber).toArrayLike(Buffer, 'le', 8),
      ],
      networkService.getIntentFiProgramId()
    );
  }

  /**
   * Initialize the IntentFI protocol (admin only)
   */
  public async initializeProtocol(
    authority: Keypair,
    treasuryAuthority: PublicKey
  ): Promise<Transaction> {
    const [protocolState] = await this.getProtocolStatePDA();

    // Get the proper Anchor instruction discriminator for initialize_protocol
    const discriminator = await deriveDiscriminator('initialize_protocol');
    console.log('🔍 InitializeProtocol discriminator:', discriminator.toString('hex'));

    const instruction = new TransactionInstruction({
      programId: networkService.getIntentFiProgramId(),
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: protocolState, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        discriminator, // 8-byte Anchor discriminator
        treasuryAuthority.toBuffer(),
      ]),
    });

    const transaction = new Transaction().add(instruction);
    return transaction;
  }

  /**
   * Initialize a user account
   */
  public async initializeUser(authority: Keypair | PublicKey): Promise<Transaction> {
    // Get the public key from either the Keypair or the PublicKey directly
    const publicKey = authority instanceof Keypair ? authority.publicKey : authority;
    const [userAccount] = await this.getUserAccountPDA(publicKey);

    // Get the proper Anchor instruction discriminator for initialize_user
    const discriminator = await deriveDiscriminator('initialize_user');
    console.log('🔍 InitializeUser discriminator:', discriminator.toString('hex'));

    const instruction = new TransactionInstruction({
      programId: networkService.getIntentFiProgramId(),
      keys: [
        { pubkey: publicKey, isSigner: true, isWritable: true },
        { pubkey: userAccount, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: discriminator, // Use 8-byte Anchor discriminator instead of single byte
    });

    const transaction = new Transaction().add(instruction);
    return transaction;
  }

  /**
   * Create a swap intent
   */
  public async createSwapIntent(
    authority: Keypair | PublicKey,
    params: SwapIntentParams
  ): Promise<Transaction> {
    // Get the public key from either the Keypair or the PublicKey directly
    const publicKey = authority instanceof Keypair ? authority.publicKey : authority;

    const [protocolState] = await this.getProtocolStatePDA();
    const [userAccount] = await this.getUserAccountPDA(publicKey);

    // Get user's current intent count to determine intent number
    const userAccountInfo = await this.getUserAccount(publicKey);
    const intentNumber = userAccountInfo ? userAccountInfo.totalIntentsCreated + 1 : 1;

    const [intentAccount] = await this.getIntentAccountPDA(publicKey, intentNumber);

    // Get the proper Anchor instruction discriminator for create_swap_intent
    const discriminator = await deriveDiscriminator('create_swap_intent');
    console.log('🔍 CreateSwapIntent discriminator:', discriminator.toString('hex'));

    const instruction = new TransactionInstruction({
      programId: networkService.getIntentFiProgramId(),
      keys: [
        { pubkey: publicKey, isSigner: true, isWritable: true },
        { pubkey: protocolState, isSigner: false, isWritable: true },
        { pubkey: userAccount, isSigner: false, isWritable: true },
        { pubkey: intentAccount, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        discriminator, // 8-byte Anchor discriminator
        params.fromMint.toBuffer(),
        params.toMint.toBuffer(),
        new BN(params.amount).toArrayLike(Buffer, 'le', 8),
        new BN(params.maxSlippage).toArrayLike(Buffer, 'le', 2),
      ]),
    });

    const transaction = new Transaction().add(instruction);
    return transaction;
  }

  /**
   * Create a lending intent
   */
  public async createLendIntent(
    authority: Keypair | PublicKey,
    params: LendIntentParams
  ): Promise<Transaction> {
    // Get the public key from either the Keypair or the PublicKey directly
    const publicKey = authority instanceof Keypair ? authority.publicKey : authority;

    const [protocolState] = await this.getProtocolStatePDA();
    const [userAccount] = await this.getUserAccountPDA(publicKey);

    // Get user's current intent count to determine intent number
    const userAccountInfo = await this.getUserAccount(publicKey);
    const intentNumber = userAccountInfo ? userAccountInfo.totalIntentsCreated + 1 : 1;

    const [intentAccount] = await this.getIntentAccountPDA(publicKey, intentNumber);

    // Get the proper Anchor instruction discriminator for create_lend_intent
    const discriminator = await deriveDiscriminator('create_lend_intent');
    console.log('🔍 CreateLendIntent discriminator:', discriminator.toString('hex'));

    const instruction = new TransactionInstruction({
      programId: networkService.getIntentFiProgramId(),
      keys: [
        { pubkey: publicKey, isSigner: true, isWritable: true },
        { pubkey: protocolState, isSigner: false, isWritable: true },
        { pubkey: userAccount, isSigner: false, isWritable: true },
        { pubkey: intentAccount, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        discriminator, // 8-byte Anchor discriminator
        params.mint.toBuffer(),
        new BN(params.amount).toArrayLike(Buffer, 'le', 8),
        new BN(params.minApy).toArrayLike(Buffer, 'le', 2),
      ]),
    });

    const transaction = new Transaction().add(instruction);
    return transaction;
  }

  /**
   * Execute a swap intent
   */
  public async executeSwapIntent(
    user: Keypair,
    intentAccount: PublicKey,
    expectedOutput: number,
    userSourceToken: PublicKey,
    userDestinationToken: PublicKey,
    treasuryFeeAccount: PublicKey
  ): Promise<Transaction> {
    const [protocolState] = await this.getProtocolStatePDA();
    const [userAccountPDA] = await this.getUserAccountPDA(user.publicKey);

    // Get the proper Anchor instruction discriminator for execute_swap_intent
    const discriminator = await deriveDiscriminator('execute_swap_intent');
    console.log('🔍 ExecuteSwapIntent discriminator:', discriminator.toString('hex'));

    const instruction = new TransactionInstruction({
      programId: networkService.getIntentFiProgramId(),
      keys: [
        { pubkey: user.publicKey, isSigner: true, isWritable: true },
        { pubkey: intentAccount, isSigner: false, isWritable: true },
        { pubkey: protocolState, isSigner: false, isWritable: true },
        { pubkey: userAccountPDA, isSigner: false, isWritable: true },
        { pubkey: userSourceToken, isSigner: false, isWritable: true },
        { pubkey: userDestinationToken, isSigner: false, isWritable: true },
        { pubkey: treasuryFeeAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        discriminator, // 8-byte Anchor discriminator
        new BN(expectedOutput).toArrayLike(Buffer, 'le', 8),
      ]),
    });

    const transaction = new Transaction().add(instruction);
    return transaction;
  }

  /**
   * Cancel an intent
   */
  public async cancelIntent(authority: Keypair, intentAccount: PublicKey): Promise<Transaction> {
    const [userAccount] = await this.getUserAccountPDA(authority.publicKey);

    // Get the proper Anchor instruction discriminator for cancel_intent
    const discriminator = await deriveDiscriminator('cancel_intent');
    console.log('🔍 CancelIntent discriminator:', discriminator.toString('hex'));

    const instruction = new TransactionInstruction({
      programId: networkService.getIntentFiProgramId(),
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: intentAccount, isSigner: false, isWritable: true },
        { pubkey: userAccount, isSigner: false, isWritable: true },
      ],
      data: discriminator, // 8-byte Anchor discriminator
    });

    const transaction = new Transaction().add(instruction);
    return transaction;
  }

  /**
   * Fetch user account data
   */
  public async getUserAccount(authority: PublicKey): Promise<UserAccount | null> {
    try {
      const [userAccountPDA] = await this.getUserAccountPDA(authority);
      const accountInfo = await networkService.getConnection().getAccountInfo(userAccountPDA);

      if (!accountInfo) {
        return null;
      }

      // Parse account data (simplified - using DataView instead of Buffer methods)
      const data = accountInfo.data;
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

      return {
        authority,
        activeIntents: view.getUint8(32),
        totalIntentsCreated: Number(view.getBigUint64(33, true)), // true for little-endian
        totalVolume: Number(view.getBigUint64(41, true)), // true for little-endian
      };
    } catch (error) {
      console.error('Error fetching user account:', error);
      return null;
    }
  }

  /**
   * Fetch intent account data
   */
  public async getIntentAccount(intentPubkey: PublicKey): Promise<IntentAccount | null> {
    try {
      const accountInfo = await networkService.getConnection().getAccountInfo(intentPubkey);

      if (!accountInfo) {
        return null;
      }

      // Parse account data (simplified - using DataView instead of Buffer methods)
      const data = accountInfo.data;

      // Validate data length
      if (data.length < 138) {
        console.warn('Account data too short, returning mock data');
        return {
          authority: SystemProgram.programId,
          intentType: 'Swap' as any,
          status: 'Pending' as any,
          fromMint: SystemProgram.programId,
          toMint: SystemProgram.programId,
          amount: 0,
          protocolFee: 0,
          createdAt: Date.now() / 1000,
          expiresAt: Date.now() / 1000 + 3600,
        };
      }

      // Helper function to safely create PublicKey from buffer slice
      const safePublicKey = (buffer: Uint8Array, start: number, end: number): PublicKey => {
        try {
          const keyBytes = buffer.slice(start, end);
          return new PublicKey(keyBytes);
        } catch (error) {
          console.warn('Invalid PublicKey bytes, using default:', error);
          return SystemProgram.programId;
        }
      };

      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const intentType = view.getUint8(40) === 0 ? 'Swap' : 'Lend';
      const statusIndex = view.getUint8(41);
      const status = ['Pending', 'Executed', 'Cancelled', 'Expired'][statusIndex] as any;

      return {
        authority: safePublicKey(data, 8, 40),
        intentType,
        status,
        fromMint: safePublicKey(data, 42, 74),
        toMint: safePublicKey(data, 74, 106),
        amount: Number(view.getBigUint64(106, true)),
        protocolFee: Number(view.getBigUint64(114, true)),
        createdAt: Number(view.getBigInt64(122, true)),
        expiresAt: Number(view.getBigInt64(130, true)),
      };
    } catch (error) {
      console.error('Error fetching intent account:', error);
      return null;
    }
  }

  /**
   * Get user's intents
   */
  public async getUserIntents(authority: PublicKey): Promise<IntentAccount[]> {
    try {
      const userAccount = await this.getUserAccount(authority);
      if (!userAccount) {
        return [];
      }

      const intents: IntentAccount[] = [];

      // Fetch all user's intents
      for (let i = 1; i <= userAccount.totalIntentsCreated; i++) {
        const [intentPDA] = await this.getIntentAccountPDA(authority, i);
        const intent = await this.getIntentAccount(intentPDA);
        if (intent) {
          intents.push(intent);
        }
      }

      return intents;
    } catch (error) {
      console.error('Error fetching user intents:', error);
      return [];
    }
  }

  /**
   * Helper function to get or create associated token account
   */
  public async getOrCreateAssociatedTokenAccount(
    payer: PublicKey,
    mint: PublicKey,
    owner: PublicKey
  ): Promise<{ address: PublicKey; instruction?: TransactionInstruction }> {
    const associatedToken = await getAssociatedTokenAddress(mint, owner);

    const accountInfo = await networkService.getConnection().getAccountInfo(associatedToken);

    if (accountInfo) {
      return { address: associatedToken };
    }

    const instruction = createAssociatedTokenAccountInstruction(
      payer,
      associatedToken,
      owner,
      mint
    );

    return { address: associatedToken, instruction };
  }

  /**
   * Update the sendTransaction method to accept either a Keypair or a PublicKey
   */
  public async sendTransaction(
    transaction: Transaction,
    signer: Keypair | PublicKey,
    commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'
  ): Promise<string> {
    try {
      // If signer is a Keypair, sign the transaction
      if (signer instanceof Keypair) {
        transaction.feePayer = signer.publicKey;
        transaction.recentBlockhash = (
          await networkService.getConnection().getLatestBlockhash()
        ).blockhash;
        transaction.sign(signer);

        // Send the signed transaction
        const signature = await networkService
          .getConnection()
          .sendRawTransaction(transaction.serialize(), { preflightCommitment: commitment });

        return signature;
      } else {
        // If signer is a PublicKey, prepare the transaction but don't sign it
        // This is for use with external wallets like Phantom that handle signing
        transaction.feePayer = signer;
        transaction.recentBlockhash = (
          await networkService.getConnection().getLatestBlockhash()
        ).blockhash;

        // Return a placeholder signature since we can't actually send the transaction
        // The caller should handle the actual signing and sending
        return 'transaction_prepared_for_external_signing';
      }
    } catch (error) {
      console.error('Error sending transaction:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const intentFiService = IntentFiService.getInstance();
