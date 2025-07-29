#!/usr/bin/env ts-node

import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  Transaction,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import * as crypto from 'crypto';

/**
 * CLI Script to Initialize Launchpad Protocol on Devnet
 *
 * This script initializes the launchpad protocol on devnet,
 * which is required before users can create token launches.
 */

// Launchpad program ID on devnet
const LAUNCHPAD_PROGRAM_ID = new PublicKey('5y2X9WML5ttrWrxzUfGrLSxbXfEcKTyV1dDyw2jXW1Zg');

// Calculate the Anchor instruction discriminator based on method name
function deriveDiscriminator(name: string): Buffer {
  return Buffer.from(crypto.createHash('sha256').update(`global:${name}`).digest()).slice(0, 8);
}

async function initializeLaunchpad() {
  try {
    console.log('🚀 Initializing Launchpad Protocol on Devnet...\n');

    // Connect to devnet
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    console.log('🌐 Network: devnet');
    console.log('🔗 RPC Endpoint:', clusterApiUrl('devnet'));
    console.log('📋 Launchpad Program ID:', LAUNCHPAD_PROGRAM_ID.toString());
    console.log('');

    // Load or create authority keypair
    const authorityKeypair = await loadOrCreateAuthorityKeypair();
    console.log('👑 Authority Public Key:', authorityKeypair.publicKey.toString());

    // Check authority balance
    const balance = await connection.getBalance(authorityKeypair.publicKey);
    console.log('💰 Authority Balance:', balance / 1e9, 'SOL');

    if (balance < 0.01 * 1e9) {
      console.log('💧 Requesting airdrop...');
      const airdropSignature = await connection.requestAirdrop(
        authorityKeypair.publicKey,
        1 * 1e9 // 1 SOL
      );
      await connection.confirmTransaction(airdropSignature);
      console.log('✅ Airdrop completed');
    }

    // Find the launchpad state PDA
    const [launchpadStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('launchpad_state')],
      LAUNCHPAD_PROGRAM_ID
    );
    console.log('📍 Launchpad State PDA:', launchpadStatePDA.toString());

    // Check if launchpad is already initialized
    const launchpadStateInfo = await connection.getAccountInfo(launchpadStatePDA);
    if (launchpadStateInfo) {
      console.log('⚠️ Launchpad already initialized!');
      console.log('📦 Data length:', launchpadStateInfo.data.length);
      console.log('👑 Owner:', launchpadStateInfo.owner.toString());

      // Verify it's owned by our program
      if (launchpadStateInfo.owner.equals(LAUNCHPAD_PROGRAM_ID)) {
        console.log('✅ Launchpad state is owned by Launchpad program');
        console.log('🎉 Launchpad initialization is complete!');
        return;
      } else {
        console.log('❌ Launchpad state is owned by wrong program!');
        console.log('Expected:', LAUNCHPAD_PROGRAM_ID.toString());
        console.log('Actual:', launchpadStateInfo.owner.toString());
        return;
      }
    }

    console.log('🔧 Creating launchpad initialization transaction...');

    // Create treasury authority (for now, use the same keypair)
    const treasuryAuthority = authorityKeypair.publicKey;
    console.log('🏦 Treasury Authority:', treasuryAuthority.toString());

    // Platform fee (2% = 200 basis points)
    const platformFeeBps = 200;
    console.log('💰 Platform Fee:', platformFeeBps / 100, '%');

    // Get the instruction discriminator for initialize_launchpad
    const discriminator = deriveDiscriminator('initialize_launchpad');
    console.log('🔍 Instruction discriminator:', Buffer.from(discriminator).toString('hex'));

    // Create data buffer for the initialize_launchpad instruction
    // Format is [discriminator(8), platform_fee_bps(2), treasury_authority(32)]
    const platformFeeBuffer = Buffer.alloc(2);
    platformFeeBuffer.writeUInt16LE(platformFeeBps);

    const data = Buffer.concat([discriminator, platformFeeBuffer, treasuryAuthority.toBuffer()]);

    // Create instruction with Anchor-formatted data
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: authorityKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: launchpadStatePDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: LAUNCHPAD_PROGRAM_ID,
      data: data,
    });

    // Create transaction and add the instruction
    const transaction = new Transaction();
    transaction.add(instruction);

    // Set transaction properties
    transaction.feePayer = authorityKeypair.publicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    // Sign and send transaction
    console.log('✍️ Signing transaction...');
    transaction.sign(authorityKeypair);

    console.log('📡 Sending transaction...');
    const signature = await connection.sendRawTransaction(transaction.serialize());

    console.log('⏳ Confirming transaction...');
    await connection.confirmTransaction(signature, 'confirmed');

    console.log('✅ Launchpad initialized successfully!');
    console.log('🔗 Transaction signature:', signature);
    console.log('🌐 Explorer:', `https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    // Verify initialization
    const verifyLaunchpadState = await connection.getAccountInfo(launchpadStatePDA);
    if (verifyLaunchpadState) {
      console.log('✅ Verification: Launchpad state account created');
      console.log('📦 Data length:', verifyLaunchpadState.data.length);
      console.log('👑 Owner:', verifyLaunchpadState.owner.toString());
    } else {
      console.log('❌ Verification failed: Launchpad state account not found');
    }
  } catch (error: any) {
    console.error('❌ Failed to initialize launchpad:', error);

    if (error instanceof Error) {
      console.error('Error message:', error.message);

      // Common error handling
      if (error.message.includes('0x1')) {
        console.log('💡 This error usually means the account already exists or insufficient funds');
      } else if (error.message.includes('0x0')) {
        console.log('💡 This error usually means the program instruction failed');
      }
    }

    process.exit(1);
  }
}

async function loadOrCreateAuthorityKeypair(): Promise<Keypair> {
  const keypairPath = path.join(process.cwd(), 'scripts', 'launchpad-authority-keypair.json');

  try {
    // Try to load existing keypair
    if (fs.existsSync(keypairPath)) {
      console.log('📂 Loading existing authority keypair...');
      const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
      return Keypair.fromSecretKey(new Uint8Array(keypairData));
    }
  } catch (e) {
    console.log('⚠️ Could not load existing keypair, creating new one...');
  }

  // Create new keypair
  console.log('🔑 Generating new authority keypair...');
  const newKeypair = Keypair.generate();

  // Save keypair for reuse
  try {
    const scriptsDir = path.join(process.cwd(), 'scripts');
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
    }

    fs.writeFileSync(keypairPath, JSON.stringify(Array.from(newKeypair.secretKey)), 'utf8');
    console.log('💾 Authority keypair saved to:', keypairPath);
  } catch (e) {
    console.log('⚠️ Could not save keypair, will use temporary keypair');
  }

  return newKeypair;
}

// Run the script
if (require.main === module) {
  initializeLaunchpad()
    .then(() => {
      console.log('\n🎉 Launchpad initialization completed successfully!');
      console.log('💡 You can now create token launches in the mobile app.');
      process.exit(0);
    })
    .catch((e) => {
      console.error('\n❌ Launchpad initialization failed:', e);
      process.exit(1);
    });
}
