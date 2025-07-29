import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import * as Crypto from 'expo-crypto';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  Keypair,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';
// Note: In a production app, you would use proper Metaplex libraries
// For this demo, we'll create simplified metadata handling
import { Buffer } from 'buffer';
import { PhantomWalletInterface } from './IntentExecutor';

// Try to import AsyncStorage, but provide a fallback if it fails
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
let AsyncStorage: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
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

// Calculate the Anchor instruction discriminator based on method name
async function deriveDiscriminator(name: string): Promise<Buffer> {
  // Using expo-crypto which has a different API than Node's crypto
  const data = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `global:${name}`
  );
  // Convert hex string to Buffer and take first 8 bytes
  return Buffer.from(data, 'hex').slice(0, 8);
}

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
   * Test token launch creation with simulation (for debugging)
   */
  async testTokenLaunchCreation(params: CreateLaunchParams): Promise<{success: boolean, tokenMint?: string, error?: string}> {
    try {
      console.log('🧪 Testing token launch creation...');
      
      // Use same approach as createTokenLaunch - CREATE_WITH_SEED
      const mintSeed = "token_mint_" + Date.now().toString().slice(-8);
      const mintPubkey = await PublicKey.createWithSeed(
        this.userPublicKey,
        mintSeed,
        TOKEN_PROGRAM_ID
      );
      
      console.log('🪙 Deterministic token mint:', mintPubkey.toString());
      console.log('🔑 Mint seed:', mintSeed);
      
      // Find PDAs (using same pattern as contract)
      const [launchStatePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("launch_state"),
          this.userPublicKey.toBuffer(),
          // Removed mint - contract uses [launch_state, creator] pattern
        ],
        DEVNET_LAUNCHPAD_PROGRAM_ID
      );
      
      const [launchpadStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("launchpad_state")],
        DEVNET_LAUNCHPAD_PROGRAM_ID
      );
      
      console.log('📝 Launch state PDA:', launchStatePDA.toString());
      console.log('📝 Launchpad state PDA:', launchpadStatePDA.toString());
      
      // Check if launchpad state exists
      const launchpadInfo = await this.connection.getAccountInfo(launchpadStatePDA);
      if (!launchpadInfo) {
        return {
          success: false,
          error: 'Launchpad state account not found - protocol may not be initialized'
        };
      }
      
      console.log('✅ Launchpad state exists');
      
      // Get instruction discriminator
      const discriminator = await deriveDiscriminator('create_token_launch');
      console.log('🔍 Instruction discriminator:', discriminator.toString('hex'));
      
      // Test data serialization
      const launchParamsData = Buffer.alloc(500);
      let offset = 0;
      
      // Serialize all fields (same as in createTokenLaunch)
      const tokenNameBuffer = Buffer.from(params.tokenName);
      launchParamsData.writeUInt32LE(tokenNameBuffer.length, offset);
      offset += 4;
      tokenNameBuffer.copy(launchParamsData, offset);
      offset += tokenNameBuffer.length;
      
      const tokenSymbolBuffer = Buffer.from(params.tokenSymbol);
      launchParamsData.writeUInt32LE(tokenSymbolBuffer.length, offset);
      offset += 4;
      tokenSymbolBuffer.copy(launchParamsData, offset);
      offset += tokenSymbolBuffer.length;
      
      const tokenUriBuffer = Buffer.from(params.tokenUri);
      launchParamsData.writeUInt32LE(tokenUriBuffer.length, offset);
      offset += 4;
      tokenUriBuffer.copy(launchParamsData, offset);
      offset += tokenUriBuffer.length;
      
      launchParamsData.writeBigUInt64LE(BigInt(params.softCap), offset);
      offset += 8;
      launchParamsData.writeBigUInt64LE(BigInt(params.hardCap), offset);
      offset += 8;
      launchParamsData.writeBigUInt64LE(BigInt(params.tokenPrice), offset);
      offset += 8;
      // tokens_for_sale (store raw value - contract will handle decimal scaling in calculations)
      launchParamsData.writeBigUInt64LE(BigInt(params.tokensForSale), offset);
      offset += 8;
      launchParamsData.writeBigUInt64LE(BigInt(params.minContribution), offset);
      offset += 8;
      launchParamsData.writeBigUInt64LE(BigInt(params.maxContribution), offset);
      offset += 8;
      launchParamsData.writeBigInt64LE(BigInt(params.launchDuration), offset);
      offset += 8;
      
      const instructionData = Buffer.concat([
        discriminator,
        launchParamsData.slice(0, offset)
      ]);
      
      console.log('📊 Serialized data size:', instructionData.length, 'bytes');
      console.log('✅ Token launch test completed successfully');
      
      return {
        success: true,
        tokenMint: mintPubkey.toString()
      };
      
    } catch (error) {
      console.error('❌ Token launch test failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
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
      
      // APPROACH: Use createAccountWithSeed to avoid multiple signers
      // Phantom mobile wallet cannot handle transactions with multiple keypair signers
      
      console.log('🪙 Creating deterministic token mint...');
      
      // Create deterministic mint address using user's pubkey + timestamp for uniqueness
      const timestamp = Date.now().toString().slice(-8);
      const mintSeed = `token_mint_${timestamp}`;
      const mintPubkey = await PublicKey.createWithSeed(
        this.userPublicKey,
        mintSeed,
        TOKEN_PROGRAM_ID
      );
      
      console.log('🪙 Deterministic mint address:', mintPubkey.toString());
      console.log('🔑 Mint seed:', mintSeed);

      // Calculate rent for mint account
      const mintRent = await getMinimumBalanceForRentExemptMint(this.connection);
      console.log('💸 Mint rent:', mintRent, 'lamports');

      // Create single transaction for complete token launch
      const transaction = new Transaction();
      
      // Add compute budget instructions
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

      // Step 1: Create token mint account using createAccountWithSeed
      transaction.add(
        SystemProgram.createAccountWithSeed({
          fromPubkey: this.userPublicKey,
          basePubkey: this.userPublicKey,
          seed: mintSeed,
          newAccountPubkey: mintPubkey,
          space: MINT_SIZE,
          lamports: mintRent,
          programId: TOKEN_PROGRAM_ID,
        })
      );

      // Step 2: Initialize the mint
      transaction.add(
        createInitializeMintInstruction(
          mintPubkey,
          params.decimals,
          this.userPublicKey, // mint authority
          this.userPublicKey // freeze authority
        )
      );

      const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
      
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          METADATA_PROGRAM_ID.toBuffer(),
          mintPubkey.toBuffer(),
        ],
        METADATA_PROGRAM_ID
      );

      console.log('📝 Metadata PDA:', metadataPDA.toString());

      const metadataInstruction = new TransactionInstruction({
        keys: [
          { pubkey: metadataPDA, isSigner: false, isWritable: true }, 
          { pubkey: mintPubkey, isSigner: false, isWritable: false },
          { pubkey: this.userPublicKey, isSigner: true, isWritable: false }, // mint authority
          { pubkey: this.userPublicKey, isSigner: true, isWritable: true }, // payer
          { pubkey: this.userPublicKey, isSigner: false, isWritable: false }, // update authority
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
          { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false }, // rent
        ],
        programId: METADATA_PROGRAM_ID,
        data: this.createMetadataInstructionData(params.tokenName, params.tokenSymbol, params.tokenUri)
      });

      transaction.add(metadataInstruction);
      console.log('✅ Added metadata creation instruction');

      // Step 3: Create associated token account for the creator (to hold tokens for sale)
      const creatorTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        this.userPublicKey
      );

      transaction.add(
        createAssociatedTokenAccountInstruction(
          this.userPublicKey,
          creatorTokenAccount,
          this.userPublicKey,
          mintPubkey
        )
      );

      // Step 4: Mint tokens to creator's account (tokens for sale)
      const tokensToMint = BigInt(params.tokensForSale) * BigInt(Math.pow(10, params.decimals));
      transaction.add(
        createMintToInstruction(
          mintPubkey,
          creatorTokenAccount,
          this.userPublicKey,
          tokensToMint
        )
      );

      // Find PDAs using same pattern as test script
      const [launchStatePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("launch_state"),
          this.userPublicKey.toBuffer(),
        ],
        DEVNET_LAUNCHPAD_PROGRAM_ID
      );
      console.log('📝 Launch state PDA:', launchStatePDA.toString());

      const [launchpadStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("launchpad_state")],
        DEVNET_LAUNCHPAD_PROGRAM_ID
      );
      console.log('📝 Launchpad state PDA:', launchpadStatePDA.toString());

      // Check if launch state already exists (each wallet can only create one launch)
      const existingLaunchState = await this.connection.getAccountInfo(launchStatePDA);
      if (existingLaunchState) {
        throw new Error(
          `Launch state already exists for this wallet. Each wallet can only create one token launch. ` +
          `Launch State PDA: ${launchStatePDA.toString()}. ` +
          `Use a different wallet to create additional launches.`
        );
      }
      console.log('✅ Launch state PDA is available - proceeding with creation');

      // Step 3: Serialize launch params (like test script)
      const launchParamsData = Buffer.alloc(500);
      let launchOffset = 0;
      
      // token_name
      const tokenNameBuffer = Buffer.from(params.tokenName);
      launchParamsData.writeUInt32LE(tokenNameBuffer.length, launchOffset);
      launchOffset += 4;
      tokenNameBuffer.copy(launchParamsData, launchOffset);
      launchOffset += tokenNameBuffer.length;
      
      // token_symbol
      const tokenSymbolBuffer = Buffer.from(params.tokenSymbol);
      launchParamsData.writeUInt32LE(tokenSymbolBuffer.length, launchOffset);
      launchOffset += 4;
      tokenSymbolBuffer.copy(launchParamsData, launchOffset);
      launchOffset += tokenSymbolBuffer.length;
      
      // token_uri
      const tokenUriBuffer = Buffer.from(params.tokenUri);
      launchParamsData.writeUInt32LE(tokenUriBuffer.length, launchOffset);
      launchOffset += 4;
      tokenUriBuffer.copy(launchParamsData, launchOffset);
      launchOffset += tokenUriBuffer.length;
      
      // soft_cap
      launchParamsData.writeBigUInt64LE(BigInt(params.softCap), launchOffset);
      launchOffset += 8;
      
      // hard_cap
      launchParamsData.writeBigUInt64LE(BigInt(params.hardCap), launchOffset);
      launchOffset += 8;
      
      // token_price
      launchParamsData.writeBigUInt64LE(BigInt(params.tokenPrice), launchOffset);
      launchOffset += 8;
      
      // tokens_for_sale (store raw value - contract will handle decimal scaling in calculations)
      launchParamsData.writeBigUInt64LE(BigInt(params.tokensForSale), launchOffset);
      launchOffset += 8;
      
      // min_contribution
      launchParamsData.writeBigUInt64LE(BigInt(params.minContribution), launchOffset);
      launchOffset += 8;
      
      // max_contribution
      launchParamsData.writeBigUInt64LE(BigInt(params.maxContribution), launchOffset);
      launchOffset += 8;
      
      // launch_duration
      launchParamsData.writeBigInt64LE(BigInt(params.launchDuration), launchOffset);
      launchOffset += 8;
      
      // Get the instruction discriminator for create_token_launch
      const launchDiscriminator = await deriveDiscriminator('create_token_launch');
      console.log('🔍 Launch discriminator:', launchDiscriminator.toString('hex'));

      // Create the instruction data with proper Anchor discriminator
      const launchInstructionData = Buffer.concat([
        launchDiscriminator, // 8-byte Anchor discriminator for create_token_launch
        launchParamsData.slice(0, launchOffset)
      ]);

      // Step 5: Add create_token_launch instruction (like test script)
      transaction.add(
        new TransactionInstruction({
          keys: [
            { pubkey: this.userPublicKey, isSigner: true, isWritable: true }, // creator
            { pubkey: launchpadStatePDA, isSigner: false, isWritable: true }, // launchpad_state
            { pubkey: launchStatePDA, isSigner: false, isWritable: true }, // launch_state (will be created)
            { pubkey: mintPubkey, isSigner: false, isWritable: false }, // token_mint
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
          ],
          programId: DEVNET_LAUNCHPAD_PROGRAM_ID,
          data: launchInstructionData
        })
      );

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.userPublicKey;

      console.log('📋 Transaction details:');
      console.log('  - Instructions:', transaction.instructions.length);
      console.log('  - Token Mint:', mintPubkey.toString());
      console.log('  - Creator Token Account (for minting):', creatorTokenAccount.toString());
      console.log('  - Launch State PDA:', launchStatePDA.toString());
      console.log('  - Launchpad State PDA:', launchpadStatePDA.toString());
      console.log('  - Tokens for Sale:', params.tokensForSale);
      console.log('  - Data Size:', launchInstructionData.length, 'bytes');
      
      // Store the token mint public key for future reference
      await AsyncStorage.setItem('last_created_token_mint', mintPubkey.toString());
      
      // NO partialSign needed - user is the only signer!
      // This was the source of the signature verification error
      
      console.log('🦄 Sending complete token launch transaction to Phantom...');
      const result = await this.phantomWallet.signTransaction(transaction, onSuccess);
      
      console.log('✅ Token launch created successfully:', result || 'pending_signature');
      
      // Additional success logging
      if (result) {
        console.log('🎉 Complete token launch process finished!');
        console.log('  - Token Mint Address:', mintPubkey.toString());
        console.log('  - Launch Transaction:', result);
        console.log('  - View on Explorer:', `https://explorer.solana.com/tx/${result}?cluster=devnet`);
      }
      
      return result || 'pending_signature';
    } catch (error) {
      console.error('❌ Token launch creation failed:', error);
      throw error;
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

      // First, get the token mint from params or storage to construct the correct PDA
      let tokenMint: PublicKey;
      try {
        if (params.tokenMint) {
          tokenMint = params.tokenMint;
          console.log('📝 Using token mint from params:', tokenMint.toString());
        } else {
          // Fallback to saved token mint
          const savedTokenMint = await AsyncStorage.getItem('last_created_token_mint');
          if (savedTokenMint) {
            tokenMint = new PublicKey(savedTokenMint);
            console.log('📝 Using saved token mint:', tokenMint.toString());
          } else {
            throw new Error('Token mint not provided and no saved token mint found');
          }
        }
      } catch (error) {
        console.error('❌ Error determining token mint:', error);
        throw new Error('Could not determine token mint for contribution');
      }

      // Find the launch state PDA (using same pattern as contract expects)
      const [launchStatePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("launch_state"),
          creator.toBuffer(),
          // Removed mint - contract uses [launch_state, creator] pattern
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

      // Get token mint from launch data (removed duplicate declaration)
      try {
        // Get the launch data to find the token mint
        const launchAccountInfo = await this.connection.getAccountInfo(launchStatePDA);
        if (launchAccountInfo) {
          const launchData = await this.deserializeLaunchData(launchAccountInfo.data);
          if (launchData) {
            tokenMint = launchData.tokenMint;
            console.log('📝 Verified token mint from launch data:', tokenMint.toString());
          } else {
            throw new Error('Could not deserialize launch data');
          }
        } else {
          throw new Error('Launch account not found');
        }
      } catch (error) {
        console.error('❌ Error getting launch token mint:', error);
        // Fallback to saved token mint
        const savedTokenMint = await AsyncStorage.getItem('last_created_token_mint');
        if (savedTokenMint) {
          tokenMint = new PublicKey(savedTokenMint);
          console.log('📝 Using fallback saved token mint:', tokenMint.toString());
        } else {
          throw new Error('Could not determine token mint for contribution');
        }
      }

      // Get the instruction discriminator for contribute_to_launch
      const discriminator = await deriveDiscriminator('contribute_to_launch');
      console.log('🔍 Instruction discriminator:', discriminator.toString('hex'));
      
      // Create amount buffer
      const amountBuffer = Buffer.alloc(8);
      amountBuffer.writeBigUInt64LE(BigInt(params.contributionAmount));

      // Create the instruction data with proper Anchor discriminator
      const instructionData = Buffer.concat([
        discriminator, // 8-byte Anchor discriminator for contribute_to_launch
        amountBuffer // amount (u64)
      ]);

      // Add the contribute_to_launch instruction (exactly matching contract structure)
      transaction.add(
        new TransactionInstruction({
          keys: [
            { pubkey: this.userPublicKey, isSigner: true, isWritable: true }, // contributor
            { pubkey: launchStatePDA, isSigner: false, isWritable: true }, // launch_state
            { pubkey: contributorStatePDA, isSigner: false, isWritable: true }, // contributor_state
            { pubkey: launchpadStatePDA, isSigner: false, isWritable: true }, // launchpad_state
            { pubkey: tokenMint, isSigner: false, isWritable: false }, // token_mint
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
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

      // Find the launch state PDA (using same pattern as contract)
      const [launchStatePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("launch_state"),
          creator.toBuffer(),
          // Removed mint - contract uses [launch_state, creator] pattern
        ],
        DEVNET_LAUNCHPAD_PROGRAM_ID
      );
      console.log('📝 Launch state PDA:', launchStatePDA.toString());

      // Get the instruction discriminator for finalize_launch
      const discriminator = await deriveDiscriminator('finalize_launch');
      console.log('🔍 Instruction discriminator:', discriminator.toString('hex'));
      
      // Create the instruction data with proper Anchor discriminator
      const instructionData = discriminator; // Just the discriminator is needed for this instruction

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

      // Fetch all program accounts without filters first
      // The previous memcmp filter was using wrong offset due to variable-length strings
      console.log('🔍 Fetching all program accounts for:', DEVNET_LAUNCHPAD_PROGRAM_ID.toString());
      const accounts = await this.connection.getProgramAccounts(DEVNET_LAUNCHPAD_PROGRAM_ID);
      
      console.log(`📊 Found ${accounts.length} total program accounts`);
      
      const launches: LaunchData[] = [];
      for (const account of accounts) {
        try {
          // Try to deserialize each account as launch data
          const launchData = await this.deserializeLaunchData(account.account.data);
          if (launchData) {
            // Only include active launches
            if (launchData.status === 'Active') {
              launches.push(launchData);
              console.log(`✅ Found active launch: ${launchData.tokenName} (${launchData.tokenSymbol})`);
            } else {
              console.log(`📝 Skipped non-active launch: ${launchData.tokenName} - status: ${launchData.status}`);
            }
          }
        } catch (error) {
          console.warn('⚠️ Failed to deserialize account data (might not be a launch account):', error);
        }
      }

      // Also include any simulated launches (for testing)
      if (this._simulatedLaunches && this._simulatedLaunches.length > 0) {
        launches.push(...this._simulatedLaunches);
        console.log(`📝 Added ${this._simulatedLaunches.length} simulated launches`);
      }

      console.log(`✅ Found ${launches.length} active launches total`);
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
      const { blockhash } = await this.connection.getLatestBlockhash('finalized');
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
   * Create Metaplex metadata instruction data for CreateMetadataAccountV3
   */
  private createMetadataInstructionData(name: string, symbol: string, uri: string): Buffer {
    // Instruction discriminator for CreateMetadataAccountV3 (first 8 bytes)
    const discriminator = Buffer.from([51, 57, 225, 47, 182, 146, 137, 166]);
    
    // Serialize the DataV2 struct
    const nameBuffer = Buffer.from(name, 'utf8');
    const symbolBuffer = Buffer.from(symbol, 'utf8');
    const uriBuffer = Buffer.from(uri, 'utf8');
    
    // Create the data buffer
    const data = Buffer.alloc(4 + nameBuffer.length + 4 + symbolBuffer.length + 4 + uriBuffer.length + 50); // extra space for other fields
    let offset = 0;
    
    // DataV2 fields
    // name (String)
    data.writeUInt32LE(nameBuffer.length, offset);
    offset += 4;
    nameBuffer.copy(data, offset);
    offset += nameBuffer.length;
    
    // symbol (String) 
    data.writeUInt32LE(symbolBuffer.length, offset);
    offset += 4;
    symbolBuffer.copy(data, offset);
    offset += symbolBuffer.length;
    
    // uri (String)
    data.writeUInt32LE(uriBuffer.length, offset);
    offset += 4;
    uriBuffer.copy(data, offset);
    offset += uriBuffer.length;
    
    // seller_fee_basis_points (u16)
    data.writeUInt16LE(0, offset);
    offset += 2;
    
    // creators (Option<Vec<Creator>>) - None
    data.writeUInt8(0, offset); // None
    offset += 1;
    
    // collection (Option<Collection>) - None
    data.writeUInt8(0, offset); // None
    offset += 1;
    
    // uses (Option<Uses>) - None
    data.writeUInt8(0, offset); // None
    offset += 1;
    
    // Additional parameters for CreateMetadataAccountV3
    // is_mutable (bool)
    data.writeUInt8(1, offset); // true
    offset += 1;
    
    // update_authority_is_signer (bool)
    data.writeUInt8(1, offset); // true
    offset += 1;
    
    // collection_details (Option<CollectionDetails>) - None
    data.writeUInt8(0, offset); // None
    offset += 1;
    
    return Buffer.concat([discriminator, data.slice(0, offset)]);
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
  private async deserializeLaunchData(data: Buffer): Promise<LaunchData | null> {
    try {
      // This deserializes the Anchor account data format
      // First 8 bytes are the account discriminator
      if (data.length < 8) {
        console.error('❌ Invalid account data: too short');
        return null;
      }

      console.log('🔍 Attempting to deserialize account data:');
      console.log('  - Data length:', data.length, 'bytes');
      console.log('  - First 16 bytes (hex):', data.slice(0, 16).toString('hex'));

      let offset = 8; // Skip discriminator
      
      // Check if we have enough data for basic structure
      if (data.length < 8 + 32 + 32 + 4) {
        console.warn('⚠️ Account data too short for launch state structure');
        return null;
      }

      // creator: Pubkey (32 bytes)
      const creator = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      console.log('  - Creator:', creator.toString());

      // token_mint: Pubkey (32 bytes)
      const tokenMint = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      console.log('  - Token mint:', tokenMint.toString());

      // token_name: String
      if (offset + 4 > data.length) {
        console.warn('⚠️ Not enough data for token_name length');
        return null;
      }
      
      const tokenNameLen = data.readUInt32LE(offset);
      offset += 4;
      
      if (tokenNameLen > 1000 || offset + tokenNameLen > data.length) {
        console.warn('⚠️ Invalid token_name length:', tokenNameLen);
        return null;
      }
      
      const tokenName = data.slice(offset, offset + tokenNameLen).toString('utf8');
      offset += tokenNameLen;
      console.log('  - Token name:', tokenName);

      // token_symbol: String
      if (offset + 4 > data.length) {
        console.warn('⚠️ Not enough data for token_symbol length');
        return null;
      }
      
      const tokenSymbolLen = data.readUInt32LE(offset);
      offset += 4;
      
      if (tokenSymbolLen > 100 || offset + tokenSymbolLen > data.length) {
        console.warn('⚠️ Invalid token_symbol length:', tokenSymbolLen);
        return null;
      }
      
      const tokenSymbol = data.slice(offset, offset + tokenSymbolLen).toString('utf8');
      offset += tokenSymbolLen;
      console.log('  - Token symbol:', tokenSymbol);

      // token_uri: String
      if (offset + 4 > data.length) {
        console.warn('⚠️ Not enough data for token_uri length');
        return null;
      }
      
      const tokenUriLen = data.readUInt32LE(offset);
      offset += 4;
      
      if (tokenUriLen > 1000 || offset + tokenUriLen > data.length) {
        console.warn('⚠️ Invalid token_uri length:', tokenUriLen);
        return null;
      }
      
      const tokenUri = data.slice(offset, offset + tokenUriLen).toString('utf8');
      offset += tokenUriLen;
      console.log('  - Token URI:', tokenUri);

      // Verify we have enough remaining data for all the u64 and other fields
      const remainingBytes = data.length - offset;
      const requiredBytes = 8 * 8 + 4 + 1; // 8 u64s + 1 u32 + 1 u8
      
      if (remainingBytes < requiredBytes) {
        console.warn(`⚠️ Not enough remaining data. Have: ${remainingBytes}, need: ${requiredBytes}`);
        return null;
      }

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
      
      console.log('  - Status value (raw):', statusValue);
      
      // Convert enum value to string
      let status: 'Active' | 'Successful' | 'Failed' = 'Active';
      if (statusValue === 0) status = 'Active';
      else if (statusValue === 1) status = 'Successful';
      else if (statusValue === 2) status = 'Failed';

      console.log('  - Status (converted):', status);

      // bump: u8 - Skip bump value as it's not needed in the UI
      // const bump = data[offset]; 
      offset += 1;

      // Get token mint info for display purposes but use tokensForSale as-is since contract expects raw values
      // The contract handles decimal scaling in its calculations, so we store raw token amounts
      const humanReadableTokensForSale = tokensForSale; // Use raw value - do not apply decimals

      // Construct LaunchData object
      const launchData = {
        creator,
        tokenMint,
        tokenName,
        tokenSymbol,
        tokenUri,
        softCap,
        hardCap,
        tokenPrice,
        tokensForSale: humanReadableTokensForSale,
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

      console.log('✅ Successfully deserialized launch data:', {
        tokenName: launchData.tokenName,
        tokenSymbol: launchData.tokenSymbol,
        status: launchData.status,
        creator: launchData.creator.toString(),
        tokenMint: launchData.tokenMint.toString()
      });

      return launchData;

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