import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import * as Crypto from 'expo-crypto';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  Keypair,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';
import { Buffer } from 'buffer';

global.Buffer = global.Buffer || Buffer;

// Test configuration
const DEVNET_RPC = 'https://api.devnet.solana.com';
const DEVNET_LAUNCHPAD_PROGRAM_ID = new PublicKey('5y2X9WML5ttrWrxzUfGrLSxbXfEcKTyV1dDyw2jXW1Zg');

// Calculate the Anchor instruction discriminator based on method name
async function deriveDiscriminator(name: string): Promise<Buffer> {
  const data = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `global:${name}`
  );
  return Buffer.from(data, 'hex').slice(0, 8);
}

interface TestLaunchParams {
  tokenName: string;
  tokenSymbol: string;
  tokenUri: string;
  decimals: number;
  softCap: number;
  hardCap: number;
  tokenPrice: number;
  tokensForSale: number;
  minContribution: number;
  maxContribution: number;
  launchDuration: number;
}

async function testTokenLaunchCreation() {
  console.log('🧪 Testing Token Launch Creation Script');

  try {
    // Connect to devnet
    const connection = new Connection(DEVNET_RPC, 'confirmed');
    console.log('✅ Connected to Solana devnet');

    // Create a test keypair (in real app, this would be user's wallet)
    const testUser = Keypair.generate();
    console.log('👤 Test user:', testUser.publicKey.toString());

    // Airdrop some SOL for testing
    console.log('💰 Requesting airdrop...');
    const airdropSig = await connection.requestAirdrop(testUser.publicKey, 2_000_000_000); // 2 SOL
    await connection.confirmTransaction(airdropSig);
    console.log('✅ Airdrop confirmed');

    // Test params
    const params: TestLaunchParams = {
      tokenName: 'Test Token',
      tokenSymbol: 'TEST',
      tokenUri: 'https://test.com/metadata.json',
      decimals: 9,
      softCap: 1_000_000_000, // 1 SOL
      hardCap: 10_000_000_000, // 10 SOL
      tokenPrice: 1_000_000, // 0.001 SOL per token
      tokensForSale: 100_000_000, // 100M tokens
      minContribution: 10_000_000, // 0.01 SOL
      maxContribution: 1_000_000_000, // 1 SOL
      launchDuration: 604800, // 1 week
    };

    console.log('🚀 Creating token launch with params:', params);

    // Generate token mint keypair
    const tokenMintKeypair = Keypair.generate();
    console.log('🪙 Token mint:', tokenMintKeypair.publicKey.toString());

    // Calculate rent for mint account
    const mintRent = await getMinimumBalanceForRentExemptMint(connection);
    console.log('💸 Mint rent:', mintRent, 'lamports');

    // Find PDAs
    const [launchStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('launch_state'), testUser.publicKey.toBuffer()],
      DEVNET_LAUNCHPAD_PROGRAM_ID
    );
    console.log('📝 Launch state PDA:', launchStatePDA.toString());

    const [launchpadStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('launchpad_state')],
      DEVNET_LAUNCHPAD_PROGRAM_ID
    );
    console.log('📝 Launchpad state PDA:', launchpadStatePDA.toString());

    // Create transaction
    const transaction = new Transaction();

    // Add compute budget instructions
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 400000,
      })
    );

    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1000,
      })
    );

    // Step 1: Create token mint account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: testUser.publicKey,
        newAccountPubkey: tokenMintKeypair.publicKey,
        space: MINT_SIZE,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    // Step 2: Initialize the mint
    transaction.add(
      createInitializeMintInstruction(
        tokenMintKeypair.publicKey,
        params.decimals,
        testUser.publicKey, // mint authority
        testUser.publicKey // freeze authority
      )
    );

    // Step 3: Serialize launch params
    const launchParamsData = Buffer.alloc(500);
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

    // Get instruction discriminator
    const discriminator = await deriveDiscriminator('create_token_launch');
    console.log('🔍 Discriminator:', discriminator.toString('hex'));

    // Create instruction data
    const instructionData = Buffer.concat([discriminator, launchParamsData.slice(0, offset)]);

    // Step 4: Add create_token_launch instruction
    transaction.add(
      new TransactionInstruction({
        keys: [
          { pubkey: testUser.publicKey, isSigner: true, isWritable: true }, // creator
          { pubkey: launchpadStatePDA, isSigner: false, isWritable: true }, // launchpad_state
          { pubkey: launchStatePDA, isSigner: false, isWritable: true }, // launch_state
          { pubkey: tokenMintKeypair.publicKey, isSigner: false, isWritable: false }, // token_mint
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        ],
        programId: DEVNET_LAUNCHPAD_PROGRAM_ID,
        data: instructionData,
      })
    );

    console.log('📋 Transaction details:');
    console.log('  - Instructions:', transaction.instructions.length);
    console.log('  - Data size:', instructionData.length, 'bytes');

    // Send and confirm transaction with both signers
    console.log('📤 Sending transaction...');
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [testUser, tokenMintKeypair], // Both signers: user + token mint
      {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
      }
    );

    console.log('✅ Transaction successful!');
    console.log('🔗 Signature:', signature);
    console.log('🌐 Explorer:', `https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    console.log('🪙 Token Mint:', tokenMintKeypair.publicKey.toString());
    console.log('📝 Launch State:', launchStatePDA.toString());

    return {
      success: true,
      signature,
      tokenMint: tokenMintKeypair.publicKey.toString(),
      launchState: launchStatePDA.toString(),
    };
  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Run the test
testTokenLaunchCreation()
  .then((result) => {
    console.log('🏁 Test completed:', result);
  })
  .catch((error) => {
    console.error('💥 Test crashed:', error);
  });
