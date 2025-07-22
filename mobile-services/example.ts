/**
 * IntentFI Mobile Services Example
 *
 * This example demonstrates how to use the IntentFI mobile services
 * for both swap intents and token launchpad functionality.
 */

import { intentFiMobile, intentFiSDK, networkService, NETWORKS } from './index';
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Example: Initialize and test IntentFI swap functionality
async function exampleSwapIntent() {
  console.log('🔄 Testing IntentFI Swap Intent...');

  try {
    // Initialize SDK for devnet
    await intentFiMobile.initialize('devnet');
    console.log('✅ SDK initialized on', networkService.getCurrentNetwork());

    // Create test user (in production, use wallet integration)
    const userKeypair = Keypair.generate();
    console.log('👤 Test user:', userKeypair.publicKey.toString());

    // Initialize user account first
    const userTx = await intentFiSDK.intentFi.initializeUser(userKeypair);
    const userSig = await intentFiSDK.sendTransaction(userTx, userKeypair);
    console.log('✅ User initialized:', userSig);

    // Example: Create a swap intent (SOL → USDC)
    const swapSignature = await intentFiMobile.createAndExecuteSwapIntent(
      userKeypair,
      new PublicKey('So11111111111111111111111111111111111111112'), // SOL
      new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // USDC
      1 * LAMPORTS_PER_SOL, // 1 SOL
      300 // 3% max slippage
    );

    console.log('✅ Swap intent created:', swapSignature);

    // Get user profile
    const profile = await intentFiMobile.getUserProfile(userKeypair.publicKey);
    console.log('📊 User Profile:');
    console.log('  - Active intents:', profile.account?.activeIntents || 0);
    console.log('  - Total intents:', profile.account?.totalIntentsCreated || 0);
    console.log('  - Total intents found:', profile.intents.length);
  } catch (error) {
    console.error('❌ Swap intent failed:', error);
  }
}

// Example: Test launchpad functionality
async function exampleTokenLaunch() {
  console.log('🚀 Testing Token Launchpad...');

  try {
    // Initialize SDK for devnet
    await intentFiMobile.initialize('devnet');

    // Create test creator
    const creatorKeypair = Keypair.generate();
    console.log('👨‍💼 Launch creator:', creatorKeypair.publicKey.toString());

    // Create a complete token launch
    const launch = await intentFiMobile.createCompleteLaunch(creatorKeypair, {
      tokenName: 'Example Token',
      tokenSymbol: 'EXAMPLE',
      tokenUri: 'https://example.com/token-metadata.json',
      decimals: 9,
      softCap: 10 * LAMPORTS_PER_SOL, // 10 SOL
      hardCap: 100 * LAMPORTS_PER_SOL, // 100 SOL
      tokenPrice: 0.001 * LAMPORTS_PER_SOL, // 0.001 SOL per token
      tokensForSale: 100000 * 1e9, // 100K tokens
      minContribution: 0.1 * LAMPORTS_PER_SOL, // 0.1 SOL min
      maxContribution: 5 * LAMPORTS_PER_SOL, // 5 SOL max
      launchDuration: 7 * 24 * 3600, // 7 days
    });

    console.log('✅ Launch created:');
    console.log('  - Token mint:', launch.tokenMint.toString());
    console.log('  - Launch signature:', launch.launchSignature);
    console.log('  - Mint signature:', launch.mintSignature);

    // Example: Contribute to the launch
    const contributorKeypair = Keypair.generate();
    console.log('👨‍💰 Contributor:', contributorKeypair.publicKey.toString());

    const contribution = await intentFiMobile.contributeToLaunch(
      contributorKeypair,
      creatorKeypair.publicKey,
      1 * LAMPORTS_PER_SOL // 1 SOL contribution
    );

    console.log('✅ Contribution made:', contribution);

    // Get launch dashboard
    const dashboard = await intentFiMobile.getLaunchDashboard(creatorKeypair.publicKey);

    if (dashboard) {
      console.log('📊 Launch Dashboard:');
      console.log('  - Status:', dashboard.launch.status);
      console.log('  - Progress:', dashboard.progress.percentage.toFixed(2) + '%');
      console.log('  - Total raised:', dashboard.launch.totalRaised / LAMPORTS_PER_SOL, 'SOL');
      console.log('  - Soft cap reached:', dashboard.progress.softCapReached);
      console.log('  - Can finalize:', dashboard.status.canFinalize);
    }
  } catch (error) {
    console.error('❌ Token launch failed:', error);
  }
}

// Example: Advanced SDK usage
async function exampleAdvancedUsage() {
  console.log('⚡ Testing Advanced SDK Usage...');

  try {
    // Direct service access
    const intentFiService = intentFiSDK.intentFi;
    const launchpadService = intentFiSDK.launchpad;

    // Get protocol state PDAs
    const [protocolStatePDA] = await intentFiService.getProtocolStatePDA();
    const [launchpadStatePDA] = await launchpadService.getLaunchpadStatePDA();

    console.log('📍 Protocol PDAs:');
    console.log('  - IntentFI Protocol State:', protocolStatePDA.toString());
    console.log('  - Launchpad State:', launchpadStatePDA.toString());

    // Network information
    console.log('🌐 Network Info:');
    console.log('  - Current network:', networkService.getCurrentNetwork());
    console.log('  - Is mainnet:', networkService.isMainnet());
    console.log('  - Is devnet:', networkService.isDevnet());
    console.log('  - RPC endpoint:', networkService.getNetworkConfig().rpcEndpoint);

    // Program IDs
    console.log('🏭 Program IDs:');
    console.log('  - IntentFI:', networkService.getIntentFiProgramId().toString());
    console.log('  - Launchpad:', networkService.getLaunchpadProgramId().toString());
  } catch (error) {
    console.error('❌ Advanced usage failed:', error);
  }
}

// Example: Network switching
async function exampleNetworkSwitching() {
  console.log('🔀 Testing Network Switching...');

  try {
    console.log('Starting network:', networkService.getCurrentNetwork());

    // Switch to mainnet (for demonstration - no contracts deployed yet)
    networkService.switchNetwork('mainnet');
    console.log('Switched to:', networkService.getCurrentNetwork());
    console.log('Mainnet IntentFI Program:', networkService.getIntentFiProgramId().toString());

    // Switch back to devnet
    networkService.switchNetwork('devnet');
    console.log('Switched back to:', networkService.getCurrentNetwork());
    console.log('Devnet IntentFI Program:', networkService.getIntentFiProgramId().toString());

    // Add custom network configuration
    NETWORKS['custom-devnet'] = {
      name: 'Custom Devnet',
      rpcEndpoint: 'https://api.devnet.solana.com',
      wsEndpoint: 'wss://api.devnet.solana.com',
      intentFiProgramId: '2UPCMZ2LESPx8wU83wdng3Yjhx2yxRLEkEDYDkNUg1jd',
      launchpadProgramId: '5y2X9WML5ttrWrxzUfGrLSxbXfEcKTyV1dDyw2jXW1Zg',
      commitment: 'confirmed',
    };

    networkService.switchNetwork('custom-devnet');
    console.log('✅ Custom network configured:', networkService.getCurrentNetwork());
  } catch (error) {
    console.error('❌ Network switching failed:', error);
  }
}

// Main example runner
async function runExamples() {
  console.log('🌟 IntentFI Mobile Services Examples\n');
  console.log('📍 Deployed Contracts:');
  console.log('  - IntentFI (Devnet): 2UPCMZ2LESPx8wU83wdng3Yjhx2yxRLEkEDYDkNUg1jd');
  console.log('  - Launchpad (Devnet): 5y2X9WML5ttrWrxzUfGrLSxbXfEcKTyV1dDyw2jXW1Zg\n');

  // Note: These examples will fail on mainnet since contracts aren't deployed there yet
  // Uncomment the examples you want to test:

  // await exampleSwapIntent();
  // console.log('\n' + '='.repeat(50) + '\n');

  // await exampleTokenLaunch();
  // console.log('\n' + '='.repeat(50) + '\n');

  await exampleAdvancedUsage();
  console.log('\n' + '='.repeat(50) + '\n');

  await exampleNetworkSwitching();

  console.log('\n✨ Examples completed!');
}

// Export for external usage
export {
  exampleSwapIntent,
  exampleTokenLaunch,
  exampleAdvancedUsage,
  exampleNetworkSwitching,
  runExamples,
};

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}
