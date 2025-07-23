#!/usr/bin/env ts-node

import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { intentFiService } from '../services/intentfi-service';
import { networkService } from '../services/config';
import fs from 'fs';
import path from 'path';

/**
 * CLI Script to Initialize IntentFI Protocol on Devnet
 *
 * This script initializes the IntentFI protocol state on devnet,
 * which is required before users can create accounts.
 */

async function initializeProtocol() {
  try {
    console.log('🚀 Initializing IntentFI Protocol on Devnet...\n');

    // Switch to devnet
    networkService.switchNetwork('devnet');
    console.log('🌐 Network:', networkService.getCurrentNetwork());
    console.log('🔗 RPC Endpoint:', networkService.getNetworkConfig().rpcEndpoint);
    console.log('📋 Program ID:', networkService.getIntentFiProgramId().toString());
    console.log('');

    // Load or create authority keypair
    const authorityKeypair = await loadOrCreateAuthorityKeypair();
    console.log('👑 Authority Public Key:', authorityKeypair.publicKey.toString());

    // Check authority balance
    const connection = networkService.getConnection();
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

    // Check if protocol is already initialized
    const [protocolStatePDA] = await intentFiService.getProtocolStatePDA();
    console.log('📍 Protocol State PDA:', protocolStatePDA.toString());

    const protocolStateInfo = await connection.getAccountInfo(protocolStatePDA);
    if (protocolStateInfo) {
      console.log('⚠️ Protocol already initialized!');
      console.log('📦 Data length:', protocolStateInfo.data.length);
      console.log('👑 Owner:', protocolStateInfo.owner.toString());

      // Verify it's owned by our program
      if (protocolStateInfo.owner.equals(networkService.getIntentFiProgramId())) {
        console.log('✅ Protocol state is owned by IntentFI program');
        console.log('🎉 Protocol initialization is complete!');
        return;
      } else {
        console.log('❌ Protocol state is owned by wrong program!');
        console.log('Expected:', networkService.getIntentFiProgramId().toString());
        console.log('Actual:', protocolStateInfo.owner.toString());
        return;
      }
    }

    console.log('🔧 Creating protocol initialization transaction...');

    // Create treasury authority (for now, use the same keypair)
    const treasuryAuthority = authorityKeypair.publicKey;
    console.log('🏦 Treasury Authority:', treasuryAuthority.toString());

    // Create initialization transaction
    const transaction = await intentFiService.initializeProtocol(
      authorityKeypair,
      treasuryAuthority
    );

    console.log('📦 Transaction created with', transaction.instructions.length, 'instructions');

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

    console.log('✅ Protocol initialized successfully!');
    console.log('🔗 Transaction signature:', signature);
    console.log('🌐 Explorer:', `https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    // Verify initialization
    const verifyProtocolState = await connection.getAccountInfo(protocolStatePDA);
    if (verifyProtocolState) {
      console.log('✅ Verification: Protocol state account created');
      console.log('📦 Data length:', verifyProtocolState.data.length);
      console.log('👑 Owner:', verifyProtocolState.owner.toString());
    } else {
      console.log('❌ Verification failed: Protocol state account not found');
    }
  } catch (error) {
    console.error('❌ Failed to initialize protocol:', error);

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
  const keypairPath = path.join(process.cwd(), 'scripts', 'authority-keypair.json');

  try {
    // Try to load existing keypair
    if (fs.existsSync(keypairPath)) {
      console.log('📂 Loading existing authority keypair...');
      const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
      return Keypair.fromSecretKey(new Uint8Array(keypairData));
    }
  } catch (error) {
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
  } catch (error) {
    console.log('⚠️ Could not save keypair, will use temporary keypair');
  }

  return newKeypair;
}

// Run the script
if (require.main === module) {
  initializeProtocol()
    .then(() => {
      console.log('\n🎉 Protocol initialization completed successfully!');
      console.log('💡 You can now create user accounts in the mobile app.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Protocol initialization failed:', error);
      process.exit(1);
    });
}
