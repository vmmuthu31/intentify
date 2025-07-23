import {
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import { networkService } from './config';

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

    const instruction = new TransactionInstruction({
      programId: networkService.getIntentFiProgramId(),
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: protocolState, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([
        0, // initialize_protocol instruction index
        ...treasuryAuthority.toBuffer(),
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

    const instruction = new TransactionInstruction({
      programId: networkService.getIntentFiProgramId(),
      keys: [
        { pubkey: publicKey, isSigner: true, isWritable: true },
        { pubkey: userAccount, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([1]), // initialize_user instruction index
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
        Buffer.from([2]), // create_swap_intent instruction index
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
        Buffer.from([3]), // create_lend_intent instruction index
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
        Buffer.from([4]), // execute_swap_intent instruction index
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

    const instruction = new TransactionInstruction({
      programId: networkService.getIntentFiProgramId(),
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: intentAccount, isSigner: false, isWritable: true },
        { pubkey: userAccount, isSigner: false, isWritable: true },
      ],
      data: Buffer.from([5]), // cancel_intent instruction index
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

      // Parse account data (simplified - you'd use proper deserialization)
      const data = accountInfo.data;
      return {
        authority,
        activeIntents: data.readUInt8(32),
        totalIntentsCreated: Number(data.readBigUInt64LE(33)),
        totalVolume: Number(data.readBigUInt64LE(41)),
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

      // Parse account data (simplified - you'd use proper deserialization)
      const data = accountInfo.data;

      return {
        authority: new PublicKey(data.slice(8, 40)),
        intentType: data.readUInt8(40) === 0 ? 'Swap' : 'Lend',
        status: ['Pending', 'Executed', 'Cancelled', 'Expired'][data.readUInt8(41)] as any,
        fromMint: new PublicKey(data.slice(42, 74)),
        toMint: new PublicKey(data.slice(74, 106)),
        amount: Number(data.readBigUInt64LE(106)),
        protocolFee: Number(data.readBigUInt64LE(114)),
        createdAt: Number(data.readBigInt64LE(122)),
        expiresAt: Number(data.readBigInt64LE(130)),
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
   * Add a sendTransaction method that accepts either a Keypair or a PublicKey
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
