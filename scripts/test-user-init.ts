#!/usr/bin/env ts-node

import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { intentFiService } from '../services/intentfi-service';
import { networkService } from '../services/config';

/**
 * Test script to debug user initialization transaction
 */

async function testUserInitialization() {
  try {
    console.log('🧪 Testing User Initialization Transaction...\n');

    // Switch to devnet
    networkService.switchNetwork('devnet');
    console.log('🌐 Network:', networkService.getCurrentNetwork());
    console.log('🔗 RPC Endpoint:', networkService.getNetworkConfig().rpcEndpoint);
    console.log('📋 Program ID:', networkService.getIntentFiProgramId().toString());
    console.log('');

    // Use the same wallet that's having issues
    const testWalletPubkey = new PublicKey('HzGZtc4mbNqs9R6k8saTp8ZHEENVsFspHUDpzku9rqpr');
    console.log('👤 Test Wallet:', testWalletPubkey.toString());

    // Check wallet balance
    const connection = networkService.getConnection();
    const balance = await connection.getBalance(testWalletPubkey);
    console.log('💰 Wallet Balance:', balance / 1e9, 'SOL');

    // Check protocol state
    const [protocolStatePDA] = await intentFiService.getProtocolStatePDA();
    console.log('📍 Protocol State PDA:', protocolStatePDA.toString());

    const protocolStateInfo = await connection.getAccountInfo(protocolStatePDA);
    if (protocolStateInfo) {
      console.log('✅ Protocol state exists');
      console.log('📦 Data length:', protocolStateInfo.data.length);
      console.log('👑 Owner:', protocolStateInfo.owner.toString());
    } else {
      console.log('❌ Protocol state does not exist');
      return;
    }

    // Check user account PDA
    const [userAccountPDA] = await intentFiService.getUserAccountPDA(testWalletPubkey);
    console.log('👤 User Account PDA:', userAccountPDA.toString());

    const userAccountInfo = await connection.getAccountInfo(userAccountPDA);
    if (userAccountInfo) {
      console.log('⚠️ User account already exists!');
      console.log('📦 Data length:', userAccountInfo.data.length);
      console.log('👑 Owner:', userAccountInfo.owner.toString());
      return;
    } else {
      console.log('✅ User account does not exist - ready for initialization');
    }

    // Create the transaction
    console.log('\n🔧 Creating user initialization transaction...');
    const transaction = await intentFiService.initializeUser(testWalletPubkey);

    console.log('📦 Transaction created');
    console.log('🔧 Instruction count:', transaction.instructions.length);

    if (transaction.instructions.length > 0) {
      const instruction = transaction.instructions[0];
      console.log('📋 Instruction details:');
      console.log('  Program ID:', instruction.programId.toString());
      console.log('  Data length:', instruction.data.length);
      console.log('  Data (hex):', Buffer.from(instruction.data).toString('hex'));
      console.log('  Accounts:');
      instruction.keys.forEach((key, index) => {
        console.log(
          `    ${index + 1}. ${key.pubkey.toString()} (signer: ${key.isSigner}, writable: ${key.isWritable})`
        );
      });
    }

    // Set transaction properties for simulation
    transaction.feePayer = testWalletPubkey;
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    console.log('\n🔍 Simulating transaction...');

    try {
      // Simulate the transaction to see what error we get
      const simulation = await connection.simulateTransaction(transaction);

      if (simulation.value.err) {
        console.log('❌ Simulation failed:');
        console.log('Error:', simulation.value.err);
        console.log('Logs:');
        simulation.value.logs?.forEach((log, index) => {
          console.log(`  ${index + 1}. ${log}`);
        });
      } else {
        console.log('✅ Simulation successful!');
        console.log('Compute units used:', simulation.value.unitsConsumed);
        console.log('Logs:');
        simulation.value.logs?.forEach((log, index) => {
          console.log(`  ${index + 1}. ${log}`);
        });
      }
    } catch (simError) {
      console.error('❌ Simulation error:', simError);
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testUserInitialization()
    .then(() => {
      console.log('\n🎉 Test completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}
