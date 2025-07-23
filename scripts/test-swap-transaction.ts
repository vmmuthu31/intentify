import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { IntentExecutor } from '../contracts/IntentExecutor';

async function testSwapTransaction() {
  console.log('🧪 Testing swap transaction creation...');

  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const testPublicKey = new PublicKey('HzGZtc4mbNqs9R6k8saTp8ZHEENVsFspHUDpzku9rqpr');

  const executor = new IntentExecutor(connection, testPublicKey);

  try {
    const transaction = await executor.createSwapTransaction({
      fromMint: 'So11111111111111111111111111111111111111112', // SOL
      toMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      amount: 0.01, // 0.01 SOL
      maxSlippage: 50, // 0.5%
      rugproofEnabled: true,
    });

    console.log('✅ Transaction created successfully!');
    console.log('📋 Transaction details:');
    console.log(`   - Instructions: ${transaction.instructions.length}`);
    console.log(`   - Fee payer: ${transaction.feePayer?.toString()}`);
    console.log(`   - Recent blockhash: ${transaction.recentBlockhash}`);

    // Simulate transaction size check
    const serialized = transaction.serialize({ requireAllSignatures: false });
    console.log(`   - Serialized size: ${serialized.length} bytes`);

    if (serialized.length > 1232) {
      console.warn('⚠️ Transaction size is large, might cause issues');
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSwapTransaction();
