import { Connection, PublicKey, Keypair, clusterApiUrl } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

const PROGRAM_ID = new PublicKey('2UPCMZ2LESPx8wU83wdng3Yjhx2yxRLEkEDYDkNUg1jd');

async function initializeProtocol() {
  console.log('🚀 Initializing IntentFI Protocol on Devnet...');

  // Connect to devnet
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  // Load authority keypair
  const authorityKeypairPath = path.join(__dirname, 'authority-keypair.json');
  let authorityKeypair: Keypair;

  try {
    const keyData = JSON.parse(fs.readFileSync(authorityKeypairPath, 'utf8'));
    authorityKeypair = Keypair.fromSecretKey(new Uint8Array(keyData));
  } catch {
    console.log('📋 Creating new authority keypair...');
    authorityKeypair = Keypair.generate();
    fs.writeFileSync(authorityKeypairPath, JSON.stringify(Array.from(authorityKeypair.secretKey)));
    console.log('✅ Authority keypair saved to:', authorityKeypairPath);
  }

  console.log('👤 Authority:', authorityKeypair.publicKey.toString());

  // Check balance and airdrop if needed
  const balance = await connection.getBalance(authorityKeypair.publicKey);
  console.log('💰 Authority balance:', balance / 1e9, 'SOL');

  if (balance < 1e9) {
    // Less than 1 SOL
    console.log('💧 Requesting airdrop...');
    try {
      const signature = await connection.requestAirdrop(authorityKeypair.publicKey, 2e9); // 2 SOL
      await connection.confirmTransaction(signature);
      console.log('✅ Airdrop successful:', signature);
    } catch {
      console.error('❌ Airdrop failed');
      console.log(
        '💡 You may need to manually fund this address:',
        authorityKeypair.publicKey.toString()
      );
    }
  }

  console.log('🔑 Authority ready for contract operations');

  // For now, let's just check account states without using Anchor Program
  // You can extend this later when you have the full Anchor setup

  // Get protocol state PDA
  const [protocolStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('protocol_state')],
    PROGRAM_ID
  );

  console.log('📋 Protocol State PDA:', protocolStatePDA.toString());

  // Check if protocol state account exists
  try {
    const protocolAccount = await connection.getAccountInfo(protocolStatePDA);
    if (protocolAccount) {
      console.log('✅ Protocol state account exists!');
      console.log('📊 Account data length:', protocolAccount.data.length);
      console.log('👑 Account owner:', protocolAccount.owner.toString());
    } else {
      console.log('❌ Protocol state not initialized');
      console.log('� Run: cd devnet-contract && anchor run initialize-protocol');
    }
  } catch {
    console.log('❌ Failed to check protocol state');
  }
}

async function initializeUserAccount(userPublicKey: string) {
  console.log('👤 Checking user account for:', userPublicKey);

  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const userPubkey = new PublicKey(userPublicKey);

  // Get user account PDA
  const [userAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_account'), userPubkey.toBuffer()],
    PROGRAM_ID
  );

  console.log('📋 User Account PDA:', userAccountPDA.toString());

  // Check if user account exists
  try {
    const userAccount = await connection.getAccountInfo(userAccountPDA);
    if (userAccount) {
      console.log('✅ User account exists!');
      console.log('📊 Account data length:', userAccount.data.length);
      console.log('👑 Account owner:', userAccount.owner.toString());
    } else {
      console.log('❌ User account not initialized');
      console.log('� Run: cd devnet-contract && anchor run initialize-user --');
      console.log('💡 Or create it manually using your wallet');
    }
  } catch {
    console.log('❌ Failed to check user account');
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Initialize protocol
    await initializeProtocol();
  } else if (args[0] === 'user' && args[1]) {
    // Initialize user account
    await initializeUserAccount(args[1]);
  } else {
    console.log('Usage:');
    console.log('  npm run setup              # Initialize protocol');
    console.log('  npm run setup user <pubkey> # Initialize user account');
    console.log('');
    console.log('Example:');
    console.log('  npm run setup user 9buE18RoxH6DUFwXAxVw8mzSGXwX93TCG4mpXcWZabTX');
  }
}

main().catch(console.error);
