import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  Keypair,
  clusterApiUrl,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createTransferInstruction,
  getMint,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';
// Note: In a production app, you would use proper Metaplex libraries
// For this demo, we'll create simplified metadata handling
import { BN } from '@coral-xyz/anchor';
import bs58 from 'bs58';
import { Buffer } from 'buffer';

// Try to import AsyncStorage, but provide a fallback if it fails
let AsyncStorage: any;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (error) {
  // Provide a fallback implementation if AsyncStorage is not available
  console.log('AsyncStorage not available, using memory storage fallback');
  AsyncStorage = {
    _storage: new Map(),
    getItem: async (key: string) => AsyncStorage._storage.get(key) || null,
    setItem: async (key: string, value: string) => AsyncStorage._storage.set(key, value),
    removeItem: async (key: string) => AsyncStorage._storage.delete(key),
  };
}

global.Buffer = global.Buffer || Buffer;

// Launchpad Protocol Fee: 2% of raised funds
export const LAUNCHPAD_FEE_RATE = 0.02; // 2%
// Use your actual funded wallet as treasury for devnet testing
export const LAUNCHPAD_TREASURY = new PublicKey('GYLkraPfvT3UtUbdxcHiVWV2EShBoZtqW1Bcq4VazUCt');

// Devnet launchpad program ID (you would deploy your own program)
export const DEVNET_LAUNCHPAD_PROGRAM_ID = new PublicKey('5y2X9WML5ttrWrxzUfGrLSxbXfEcKTyV1dDyw2jXW1Zg');

// Import the PhantomWalletInterface from IntentExecutor to ensure consistency
import { PhantomWalletInterface } from './IntentExecutor';

// Launch parameters
export interface CreateLaunchParams {
  tokenName: string;
  tokenSymbol: string;
  tokenUri: string;
  decimals: number;
  softCap: number; // in lamports
  hardCap: number; // in lamports
  tokenPrice: number; // in lamports per token
  tokensForSale: number; // total tokens for sale
  minContribution: number; // in lamports
  maxContribution: number; // in lamports
  launchDuration: number; // in seconds
}

export interface ContributeParams {
  launchPubkey: PublicKey;
  contributionAmount: number; // in lamports
  tokenMint?: PublicKey; // Optional token mint
}

export interface LaunchData {
  creator: PublicKey;
  tokenMint: PublicKey;
  tokenName: string;
  tokenSymbol: string;
  tokenUri: string;
  softCap: number;
  hardCap: number;
  tokenPrice: number;
  tokensForSale: number;
  minContribution: number;
  maxContribution: number;
  launchStart: number;
  launchEnd: number;
  totalRaised: number;
  totalContributors: number;
  tokensSold: number;
  status: 'Active' | 'Successful' | 'Failed' | 'Cancelled';
  isFinalized: boolean;
}

export class LaunchpadExecutor {
  private connection: Connection;
  private userPublicKey: PublicKey;
  private phantomWallet: PhantomWalletInterface;
  private transactionCallbacks: Map<string, () => void> = new Map();

  constructor(
    connection: Connection,
    userPublicKey: PublicKey,
    phantomWallet: PhantomWalletInterface
  ) {
    this.connection = connection;
    this.userPublicKey = userPublicKey;
    this.phantomWallet = phantomWallet;
  }

  /**
   * Create a complete token launch (token creation + launch setup)
   */
  async createTokenLaunch(params: CreateLaunchParams, onSuccess?: () => void): Promise<string> {
    try {
      console.log('🚀 Creating complete token launch:', params);

      if (!this.phantomWallet) {
        throw new Error('Phantom wallet not available for transaction signing');
      }

      console.log('📱 Using real on-chain token launch with contract: 5y2X9WML5ttrWrxzUfGrLSxbXfEcKTyV1dDyw2jXW1Zg');
      
      // Generate a keypair for the new token mint
      const tokenMintKeypair = Keypair.generate();
      console.log('🪙 Generated token mint keypair:', tokenMintKeypair.publicKey.toString());

      // Create transaction for token mint creation and launch
      const transaction = new Transaction();
      
      // Add compute budget instructions to increase the compute limit
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 400000
        })
      );
      
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 1000
        })
      );

      // 1. Create token mint account
      const mintRent = await getMinimumBalanceForRentExemptMint(this.connection);
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: this.userPublicKey,
          newAccountPubkey: tokenMintKeypair.publicKey,
          lamports: mintRent,
          space: MINT_SIZE,
          programId: TOKEN_PROGRAM_ID,
        })
      );

      // 2. Initialize the mint with the user as mint authority
      transaction.add(
        createInitializeMintInstruction(
          tokenMintKeypair.publicKey,
          params.decimals,
          this.userPublicKey,
          this.userPublicKey,
          TOKEN_PROGRAM_ID
        )
      );

      // Find the launch state PDA
      const [launchStatePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("launch_state"),
          this.userPublicKey.toBuffer(),
        ],
        DEVNET_LAUNCHPAD_PROGRAM_ID
      );
      console.log('📝 Launch state PDA:', launchStatePDA.toString());

      // Find the launchpad state PDA
      const [launchpadStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("launchpad_state")],
        DEVNET_LAUNCHPAD_PROGRAM_ID
      );
      console.log('📝 Launchpad state PDA:', launchpadStatePDA.toString());

      // Serialize the launch params
      const launchParamsData = Buffer.alloc(500); // Allocate enough space
      let offset = 0;
      
      // token_name
      const tokenNameBuffer = Buffer.from(params.tokenName);
      launchParamsData.writeUInt32LE(tokenNameBuffer.length, offset);
      offset += 4;
      tokenNameBuffer.copy(launchParamsData, offset);
      offset += tokenNameBuffer.length;
      
      // token_symbol
      const tokenSymbolBuffer = Buffer.from(params.tokenSymbol);
      launchParamsData.writeUInt32LE(tokenSymbolBuffer.length, offset);
      offset += 4;
      tokenSymbolBuffer.copy(launchParamsData, offset);
      offset += tokenSymbolBuffer.length;
      
      // token_uri
      const tokenUriBuffer = Buffer.from(params.tokenUri);
      launchParamsData.writeUInt32LE(tokenUriBuffer.length, offset);
      offset += 4;
      tokenUriBuffer.copy(launchParamsData, offset);
      offset += tokenUriBuffer.length;
      
      // soft_cap
      launchParamsData.writeBigUInt64LE(BigInt(params.softCap), offset);
      offset += 8;
      
      // hard_cap
      launchParamsData.writeBigUInt64LE(BigInt(params.hardCap), offset);
      offset += 8;
      
      // token_price
      launchParamsData.writeBigUInt64LE(BigInt(params.tokenPrice), offset);
      offset += 8;
      
      // tokens_for_sale
      launchParamsData.writeBigUInt64LE(BigInt(params.tokensForSale), offset);
      offset += 8;
      
      // min_contribution
      launchParamsData.writeBigUInt64LE(BigInt(params.minContribution), offset);
      offset += 8;
      
      // max_contribution
      launchParamsData.writeBigUInt64LE(BigInt(params.maxContribution), offset);
      offset += 8;
      
      // launch_duration
      launchParamsData.writeBigInt64LE(BigInt(params.launchDuration), offset);
      offset += 8;
      
      // Create the instruction data
      const instructionData = Buffer.concat([
        Buffer.from([1]), // 1 = create_token_launch instruction index
        launchParamsData.slice(0, offset)
      ]);

      // 3. Add the create_token_launch instruction
      transaction.add(
        new TransactionInstruction({
          keys: [
            { pubkey: this.userPublicKey, isSigner: true, isWritable: true },
            { pubkey: launchpadStatePDA, isSigner: false, isWritable: true },
            { pubkey: launchStatePDA, isSigner: false, isWritable: true },
            { pubkey: tokenMintKeypair.publicKey, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: DEVNET_LAUNCHPAD_PROGRAM_ID,
          data: instructionData
        })
      );

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.userPublicKey;

      // Sign the transaction with the token mint keypair
      transaction.partialSign(tokenMintKeypair);

      console.log('📝 Launch transaction created with instructions:', transaction.instructions.length);
      console.log('📝 Transaction blockhash:', transaction.recentBlockhash.slice(0, 10) + '...');
      console.log('📝 Transaction feePayer:', transaction.feePayer.toString().slice(0, 10) + '...');
      console.log('📝 Transaction signed by token mint keypair');

      // Send the transaction via Phantom
      console.log('🦄 Sending transaction via PhantomWallet.signTransaction...');
      
      // Store the token mint public key in localStorage for future reference
      await AsyncStorage.setItem('last_created_token_mint', tokenMintKeypair.publicKey.toString());
      
      const result = await this.phantomWallet.signTransaction(transaction, onSuccess);
      
      console.log('✅ Transaction sent to Phantom, result:', result || 'pending_signature');
      return result || 'pending_signature';
    } catch (error) {
      console.error('❌ Token launch creation failed:', error);
      throw error;
    }
  }

  /**
   * Simulate a successful launch creation by adding a fake launch to our state
   * This is for demo purposes only - in a real implementation, you would fetch the actual launch data from the blockchain
   */
  private simulateSuccessfulLaunch(params: CreateLaunchParams): void {
    try {
      console.log('🎮 Simulating successful launch creation for demo purposes');
      
      // Create a fake launch data object
      const fakeLaunch: LaunchData = {
        creator: this.userPublicKey,
        tokenMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // USDC devnet address
        tokenName: params.tokenName,
        tokenSymbol: params.tokenSymbol,
        tokenUri: params.tokenUri,
        softCap: params.softCap,
        hardCap: params.hardCap,
        tokenPrice: params.tokenPrice,
        tokensForSale: params.tokensForSale,
        minContribution: params.minContribution,
        maxContribution: params.maxContribution,
        launchStart: Math.floor(Date.now() / 1000),
        launchEnd: Math.floor(Date.now() / 1000) + params.launchDuration,
        totalRaised: 0,
        totalContributors: 0,
        tokensSold: 0,
        status: 'Active',
        isFinalized: false,
      };
      
      // In a real implementation, this would be stored on the blockchain
      // For demo purposes, we'll just store it in memory
      this._simulatedLaunches = this._simulatedLaunches || [];
      this._simulatedLaunches.push(fakeLaunch);
      
      console.log('✅ Simulated launch created successfully:', fakeLaunch.tokenName);
    } catch (error) {
      console.error('❌ Failed to simulate launch creation:', error);
    }
  }
  
  // Storage for simulated launches
  private _simulatedLaunches: LaunchData[] = [];

  /**
   * Contribute to an existing launch
   */
  async contributeToLaunch(params: ContributeParams, onSuccess?: () => void): Promise<string> {
    try {
      console.log('💰 Contributing to launch:', params);

      if (!this.phantomWallet) {
        throw new Error('Phantom wallet not available for transaction signing');
      }

      // 1. Create contribution transaction
      const transaction = new Transaction();

      // Add compute budget instructions to increase the compute limit
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 400000
        })
      );
      
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 1000
        })
      );

      // Find the launch creator from the launch pubkey
      // In a real implementation, you would query the launch state account
      // For now, we'll assume the launch pubkey is the creator's pubkey
      const creator = params.launchPubkey;

      // Find the launch state PDA
      const [launchStatePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("launch_state"),
          creator.toBuffer(),
        ],
        DEVNET_LAUNCHPAD_PROGRAM_ID
      );
      console.log('📝 Launch state PDA:', launchStatePDA.toString());

      // Find the launchpad state PDA
      const [launchpadStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("launchpad_state")],
        DEVNET_LAUNCHPAD_PROGRAM_ID
      );
      console.log('📝 Launchpad state PDA:', launchpadStatePDA.toString());

      // Find the contributor state PDA
      const [contributorStatePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("contributor"),
          launchStatePDA.toBuffer(),
          this.userPublicKey.toBuffer(),
        ],
        DEVNET_LAUNCHPAD_PROGRAM_ID
      );
      console.log('📝 Contributor state PDA:', contributorStatePDA.toString());

      // Try to get the token mint from AsyncStorage or use a default
      let tokenMint: PublicKey;
      try {
        const savedTokenMint = await AsyncStorage.getItem('last_created_token_mint');
        if (savedTokenMint) {
          tokenMint = new PublicKey(savedTokenMint);
          console.log('📝 Using saved token mint from previous launch:', tokenMint.toString());
        } else {
          // If no saved token mint, use the one from the params or a default
          tokenMint = params.tokenMint || new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
          console.log('📝 Using token mint from params:', tokenMint.toString());
        }
      } catch (error) {
        console.error('❌ Error getting token mint, using default:', error);
        tokenMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      }

      // Create the instruction data
      const instructionData = Buffer.concat([
        Buffer.from([2]), // 2 = contribute_to_launch instruction index
        Buffer.alloc(8).fill(0) // amount (u64)
      ]);

      // Write the amount to the instruction data
      instructionData.writeBigUInt64LE(BigInt(params.contributionAmount), 1);

      // Add the contribute_to_launch instruction
      transaction.add(
        new TransactionInstruction({
          keys: [
            { pubkey: this.userPublicKey, isSigner: true, isWritable: true },
            { pubkey: launchStatePDA, isSigner: false, isWritable: true },
            { pubkey: contributorStatePDA, isSigner: false, isWritable: true },
            { pubkey: launchpadStatePDA, isSigner: false, isWritable: true },
            { pubkey: tokenMint, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: DEVNET_LAUNCHPAD_PROGRAM_ID,
          data: instructionData
        })
      );

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.userPublicKey;

      console.log('📝 Contribution transaction created with instructions:', transaction.instructions.length);
      console.log('📝 Transaction blockhash:', transaction.recentBlockhash.slice(0, 10) + '...');
      console.log('📝 Transaction feePayer:', transaction.feePayer.toString().slice(0, 10) + '...');

      // Send the transaction directly using PhantomWallet's signTransaction
      console.log('🦄 Sending contribution transaction via PhantomWallet.signTransaction...');
      const result = await this.phantomWallet.signTransaction(transaction, onSuccess);
      
      console.log('✅ Contribution transaction sent to Phantom, result:', result || 'pending_signature');
      return result || 'pending_signature';
    } catch (error) {
      console.error('❌ Contribution failed:', error);
      throw error;
    }
  }

  /**
   * Finalize a launch (distribute tokens, collect fees)
   */
  async finalizeLaunch(launchPubkey: PublicKey, onSuccess?: () => void): Promise<string> {
    try {
      console.log('🏁 Finalizing launch:', launchPubkey.toString());

      if (!this.phantomWallet) {
        throw new Error('Phantom wallet not available for transaction signing');
      }

      // Create finalization transaction
      const transaction = new Transaction();

      // Add compute budget instructions to increase the compute limit
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 400000
        })
      );
      
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 1000
        })
      );

      // Find the launch creator from the launch pubkey
      // In a real implementation, you would query the launch state account
      // For now, we'll assume the launch pubkey is the creator's pubkey
      const creator = launchPubkey;

      // Find the launch state PDA
      const [launchStatePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("launch_state"),
          creator.toBuffer(),
        ],
        DEVNET_LAUNCHPAD_PROGRAM_ID
      );
      console.log('📝 Launch state PDA:', launchStatePDA.toString());

      // Create the instruction data
      const instructionData = Buffer.from([3]); // 3 = finalize_launch instruction index

      // Add the finalize_launch instruction
      transaction.add(
        new TransactionInstruction({
          keys: [
            { pubkey: this.userPublicKey, isSigner: true, isWritable: true },
            { pubkey: launchStatePDA, isSigner: false, isWritable: true },
          ],
          programId: DEVNET_LAUNCHPAD_PROGRAM_ID,
          data: instructionData
        })
      );

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.userPublicKey;

      console.log('📝 Finalization transaction created with instructions:', transaction.instructions.length);
      console.log('📝 Transaction blockhash:', transaction.recentBlockhash.slice(0, 10) + '...');
      console.log('📝 Transaction feePayer:', transaction.feePayer.toString().slice(0, 10) + '...');

      // Send the transaction directly using PhantomWallet's signTransaction
      console.log('🦄 Sending finalization transaction directly via PhantomWallet.signTransaction...');
      const result = await this.phantomWallet.signTransaction(transaction, onSuccess);
      
      console.log('✅ Finalization transaction sent to Phantom, result:', result || 'pending_signature');
      return result || 'pending_signature';
    } catch (error) {
      console.error('❌ Launch finalization failed:', error);
      throw error;
    }
  }

  /**
   * Get launch data from blockchain
   */
  async getLaunchData(launchPubkey: PublicKey): Promise<LaunchData | null> {
    try {
      console.log('📊 Fetching launch data for:', launchPubkey.toString());

      const accountInfo = await this.connection.getAccountInfo(launchPubkey);
      if (!accountInfo) {
        console.log('❌ Launch account not found');
        return null;
      }

      // In a real implementation, you would deserialize the account data
      // based on your program's data structure
      const launchData = this.deserializeLaunchData(accountInfo.data);
      
      console.log('✅ Launch data retrieved:', launchData);
      return launchData;

    } catch (error) {
      console.error('❌ Failed to fetch launch data:', error);
      return null;
    }
  }

  /**
   * Get all active launches
   */
  async getActiveLaunches(): Promise<LaunchData[]> {
    try {
      console.log('📋 Fetching all active launches...');

      // In a real implementation, you would use getProgramAccounts
      // to fetch all launch accounts from your program
      const accounts = await this.connection.getProgramAccounts(DEVNET_LAUNCHPAD_PROGRAM_ID, {
        filters: [
          {
            memcmp: {
              offset: 8 + 32 + 32, // Skip discriminator, creator and token_mint
              bytes: bs58.encode(Buffer.from([0])), // 0 = LaunchStatus::Active
            },
          },
        ],
      });
      
      const launches: LaunchData[] = [];
      for (const account of accounts) {
        try {
          const launchData = this.deserializeLaunchData(account.account.data);
          if (launchData) {
            launches.push(launchData);
          }
        } catch (error) {
          console.warn('Failed to deserialize launch data:', error);
        }
      }

      // Also include any simulated launches (for testing)
      if (this._simulatedLaunches && this._simulatedLaunches.length > 0) {
        launches.push(...this._simulatedLaunches);
      }

      console.log(`✅ Found ${launches.length} active launches`);
      return launches;

    } catch (error) {
      console.error('❌ Failed to fetch active launches:', error);
      return [];
    }
  }

  /**
   * Create the complete launch transaction
   */
  private async createLaunchTransaction(tokenMint: Keypair, params: CreateLaunchParams): Promise<Transaction> {
    try {
      console.log('📝 Creating launch transaction for token:', params.tokenName);
      
      // Create a new transaction and get the latest blockhash immediately
      console.log('🔍 Getting recent blockhash for launch transaction...');
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
      const transaction = new Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.userPublicKey;
      
      console.log('✅ Got blockhash:', blockhash.slice(0, 10) + '...');

      // 1. Create token mint account
      const mintRent = await getMinimumBalanceForRentExemptMint(this.connection);
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: this.userPublicKey,
          newAccountPubkey: tokenMint.publicKey,
          lamports: mintRent,
          space: MINT_SIZE,
          programId: TOKEN_PROGRAM_ID,
        })
      );

      // 2. Initialize token mint
      transaction.add(
        createInitializeMintInstruction(
          tokenMint.publicKey,
          params.decimals,
          this.userPublicKey, // mint authority
          this.userPublicKey  // freeze authority
        )
      );

      // 3. Note: In production, you would add Metaplex metadata creation here
      // For this demo, we'll skip metadata creation to focus on core functionality
      console.log('📝 Skipping metadata creation for demo - would create metadata for:', params.tokenName);

      // 4. Create associated token account for the creator
      const creatorTokenAccount = await getAssociatedTokenAddress(
        tokenMint.publicKey,
        this.userPublicKey
      );

      transaction.add(
        createAssociatedTokenAccountInstruction(
          this.userPublicKey,
          creatorTokenAccount,
          this.userPublicKey,
          tokenMint.publicKey
        )
      );

      // 5. Mint tokens to creator
      const totalSupply = params.tokensForSale * Math.pow(10, params.decimals);
      transaction.add(
        createMintToInstruction(
          tokenMint.publicKey,
          creatorTokenAccount,
          this.userPublicKey,
          totalSupply
        )
      );

      // 6. Create launch account (simplified - in real implementation use your program)
      const launchPDA = PublicKey.findProgramAddressSync(
        [
          Buffer.from('launch'),
          this.userPublicKey.toBuffer(),
          tokenMint.publicKey.toBuffer(),
        ],
        DEVNET_LAUNCHPAD_PROGRAM_ID
      )[0];

      // Add launch creation instruction (this would be your custom program instruction)
      const launchData = this.serializeLaunchData({
        creator: this.userPublicKey,
        tokenMint: tokenMint.publicKey,
        tokenName: params.tokenName,
        tokenSymbol: params.tokenSymbol,
        tokenUri: params.tokenUri,
        softCap: params.softCap,
        hardCap: params.hardCap,
        tokenPrice: params.tokenPrice,
        tokensForSale: params.tokensForSale,
        minContribution: params.minContribution,
        maxContribution: params.maxContribution,
        launchStart: Math.floor(Date.now() / 1000),
        launchEnd: Math.floor(Date.now() / 1000) + params.launchDuration,
        totalRaised: 0,
        totalContributors: 0,
        tokensSold: 0,
        status: 'Active',
        isFinalized: false,
      });

      transaction.add(
        new TransactionInstruction({
          keys: [
            { pubkey: this.userPublicKey, isSigner: true, isWritable: true },
            { pubkey: launchPDA, isSigner: false, isWritable: true },
            { pubkey: tokenMint.publicKey, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: DEVNET_LAUNCHPAD_PROGRAM_ID,
          data: Buffer.concat([Buffer.from([0]), launchData]), // 0 = create_launch instruction
        })
      );

      // 7. Add protocol fee instruction
      const protocolFee = Math.floor(params.hardCap * LAUNCHPAD_FEE_RATE);
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: this.userPublicKey,
          toPubkey: LAUNCHPAD_TREASURY,
          lamports: protocolFee,
        })
      );

      // Add the token mint as a signer
      transaction.partialSign(tokenMint);

      console.log('📝 Launch transaction created with instructions:', transaction.instructions.length);
      console.log('📝 Transaction blockhash:', transaction.recentBlockhash?.slice(0, 10) + '...');
      console.log('📝 Transaction feePayer:', transaction.feePayer?.toString().slice(0, 10) + '...');
      
      return transaction;
    } catch (error) {
      console.error('❌ Failed to create launch transaction:', error);
      throw error;
    }
  }

  /**
   * Create contribution transaction
   */
  private async createContributionTransaction(params: ContributeParams): Promise<Transaction> {
    const transaction = new Transaction();

    // 1. Transfer SOL to launch vault (simplified - would be handled by your program)
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: this.userPublicKey,
        toPubkey: params.launchPubkey, // In real implementation, this would be a vault PDA
        lamports: params.contributionAmount,
      })
    );

    // 2. Add contribution tracking instruction (your custom program)
    const contributionData = Buffer.alloc(16);
    contributionData.writeBigUInt64LE(BigInt(params.contributionAmount), 0);
    contributionData.writeBigUInt64LE(BigInt(Date.now()), 8);

    transaction.add(
      new TransactionInstruction({
        keys: [
          { pubkey: this.userPublicKey, isSigner: true, isWritable: true },
          { pubkey: params.launchPubkey, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: DEVNET_LAUNCHPAD_PROGRAM_ID,
        data: Buffer.concat([Buffer.from([1]), contributionData]), // 1 = contribute instruction
      })
    );

    console.log('📝 Contribution transaction created');
    return transaction;
  }

  /**
   * Create finalization transaction
   */
  private async createFinalizationTransaction(launchPubkey: PublicKey): Promise<Transaction> {
    const transaction = new Transaction();

    // Add finalization instruction (your custom program)
    transaction.add(
      new TransactionInstruction({
        keys: [
          { pubkey: this.userPublicKey, isSigner: true, isWritable: true },
          { pubkey: launchPubkey, isSigner: false, isWritable: true },
          { pubkey: LAUNCHPAD_TREASURY, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: DEVNET_LAUNCHPAD_PROGRAM_ID,
        data: Buffer.from([2]), // 2 = finalize instruction
      })
    );

    console.log('📝 Finalization transaction created');
    return transaction;
  }

  /**
   * Sign and send transaction via Phantom
   */
  private async signAndSendTransaction(transaction: Transaction, onSuccess?: () => void): Promise<string> {
    try {
      console.log('🚀 Preparing transaction for Phantom signing...');
      
      // Make sure the transaction has a blockhash and feePayer
      if (!transaction.recentBlockhash) {
        console.log('🔍 Transaction missing blockhash, getting recent blockhash...');
        const blockHashInfo = await this.connection.getLatestBlockhash('finalized');
        transaction.recentBlockhash = blockHashInfo.blockhash;
      }
      
      if (!transaction.feePayer) {
        console.log('🔍 Setting transaction fee payer...');
        transaction.feePayer = this.userPublicKey;
      }

      console.log('📝 Transaction prepared:');
      console.log('  - Recent blockhash:', transaction.recentBlockhash.slice(0, 8) + '...');
      console.log('  - Fee payer:', transaction.feePayer.toString().slice(0, 8) + '...');
      console.log('  - Instructions:', transaction.instructions.length);

      // Use Phantom's signTransaction method directly
      console.log('🦄 Calling Phantom signTransaction method directly...');
      const result = await this.phantomWallet.signTransaction(transaction, onSuccess);
      
      console.log('✅ Transaction sent to Phantom for signing, result:', result || 'pending_signature');
      return result || 'pending_signature';
    } catch (error) {
      console.error('❌ Failed to send transaction to Phantom:', error);
      throw error;
    }
  }

  /**
   * Serialize launch data for storage
   */
  private serializeLaunchData(data: LaunchData): Buffer {
    // This is a simplified serialization - in a real implementation,
    // you would use a proper serialization library like Borsh
    const buffer = Buffer.alloc(1000); // Allocate enough space
    let offset = 0;

    // Write the data fields (simplified example)
    data.creator.toBuffer().copy(buffer, offset);
    offset += 32;
    
    data.tokenMint.toBuffer().copy(buffer, offset);
    offset += 32;

    buffer.writeBigUInt64LE(BigInt(data.softCap), offset);
    offset += 8;

    buffer.writeBigUInt64LE(BigInt(data.hardCap), offset);
    offset += 8;

    buffer.writeBigUInt64LE(BigInt(data.tokenPrice), offset);
    offset += 8;

    // ... continue for other fields

    return buffer.slice(0, offset);
  }

  /**
   * Deserialize launch data from account
   */
  private deserializeLaunchData(data: Buffer): LaunchData | null {
    try {
      // This deserializes the Anchor account data format
      // First 8 bytes are the account discriminator
      if (data.length < 8) {
        console.error('❌ Invalid account data: too short');
        return null;
      }

      let offset = 8; // Skip discriminator

      // creator: Pubkey (32 bytes)
      const creator = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      // token_mint: Pubkey (32 bytes)
      const tokenMint = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      // token_name: String
      const tokenNameLen = data.readUInt32LE(offset);
      offset += 4;
      const tokenName = data.slice(offset, offset + tokenNameLen).toString('utf8');
      offset += tokenNameLen;

      // token_symbol: String
      const tokenSymbolLen = data.readUInt32LE(offset);
      offset += 4;
      const tokenSymbol = data.slice(offset, offset + tokenSymbolLen).toString('utf8');
      offset += tokenSymbolLen;

      // token_uri: String
      const tokenUriLen = data.readUInt32LE(offset);
      offset += 4;
      const tokenUri = data.slice(offset, offset + tokenUriLen).toString('utf8');
      offset += tokenUriLen;

      // soft_cap: u64
      const softCap = Number(data.readBigUInt64LE(offset));
      offset += 8;

      // hard_cap: u64
      const hardCap = Number(data.readBigUInt64LE(offset));
      offset += 8;

      // token_price: u64
      const tokenPrice = Number(data.readBigUInt64LE(offset));
      offset += 8;

      // tokens_for_sale: u64
      const tokensForSale = Number(data.readBigUInt64LE(offset));
      offset += 8;

      // min_contribution: u64
      const minContribution = Number(data.readBigUInt64LE(offset));
      offset += 8;

      // max_contribution: u64
      const maxContribution = Number(data.readBigUInt64LE(offset));
      offset += 8;

      // launch_start: i64
      const launchStart = Number(data.readBigInt64LE(offset));
      offset += 8;

      // launch_end: i64
      const launchEnd = Number(data.readBigInt64LE(offset));
      offset += 8;

      // total_raised: u64
      const totalRaised = Number(data.readBigUInt64LE(offset));
      offset += 8;

      // total_contributors: u32
      const totalContributors = data.readUInt32LE(offset);
      offset += 4;

      // tokens_sold: u64
      const tokensSold = Number(data.readBigUInt64LE(offset));
      offset += 8;

      // status: LaunchStatus (enum, 1 byte)
      const statusValue = data[offset];
      offset += 1;
      
      // Convert enum value to string
      let status: 'Active' | 'Successful' | 'Failed' = 'Active';
      if (statusValue === 0) status = 'Active';
      else if (statusValue === 1) status = 'Successful';
      else if (statusValue === 2) status = 'Failed';

      // bump: u8
      const bump = data[offset];
      offset += 1;

      // Construct LaunchData object
      return {
        creator,
        tokenMint,
        tokenName,
        tokenSymbol,
        tokenUri,
        softCap,
        hardCap,
        tokenPrice,
        tokensForSale,
        minContribution,
        maxContribution,
        launchStart,
        launchEnd,
        totalRaised,
        totalContributors,
        tokensSold,
        status,
        isFinalized: status !== 'Active',
      };

    } catch (error) {
      console.error('❌ Failed to deserialize launch data:', error);
      return null;
    }
  }
}

/**
 * Create a LaunchpadExecutor instance
 */
export function createLaunchpadExecutor(
  connection: Connection,
  userPublicKey: PublicKey,
  phantomWallet: PhantomWalletInterface
): LaunchpadExecutor {
  return new LaunchpadExecutor(connection, userPublicKey, phantomWallet);
}

/**
 * Calculate launchpad protocol fee
 */
export function calculateLaunchpadFee(amount: number): number {
  return amount * LAUNCHPAD_FEE_RATE;
} 