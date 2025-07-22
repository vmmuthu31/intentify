# IntentFI Mobile Services 📱

TypeScript SDK for integrating IntentFI Protocol into mobile applications. Supports both **simplified swap intents** and **token launchpad** functionality on Solana devnet and mainnet.

## 🚀 Deployed Contracts

### Devnet (Testing)

- **IntentFI Contract**: `2UPCMZ2LESPx8wU83wdng3Yjhx2yxRLEkEDYDkNUg1jd`
- **Launchpad Contract**: `5y2X9WML5ttrWrxzUfGrLSxbXfEcKTyV1dDyw2jXW1Zg`

### Mainnet (Production)

- **IntentFI Contract**: `YOUR_MAINNET_INTENTFI_PROGRAM_ID` (Deploy when ready)
- **Launchpad Contract**: `YOUR_MAINNET_LAUNCHPAD_PROGRAM_ID` (Deploy when ready)

## 📦 Installation

```bash
npm install @intentfi/mobile-services
# or
yarn add @intentfi/mobile-services
```

### Peer Dependencies

```bash
npm install @solana/web3.js @solana/spl-token @coral-xyz/anchor
```

## 🛠 Quick Start

### Basic Setup

```typescript
import { intentFiMobile, networkService } from '@intentfi/mobile-services';
import { Keypair, PublicKey } from '@solana/web3.js';

// Initialize SDK for devnet
await intentFiMobile.initialize('devnet');

// Switch networks
networkService.switchNetwork('mainnet');
networkService.switchNetwork('devnet');
```

### 1. IntentFI - Swap Intents

```typescript
import { intentFiMobile } from '@intentfi/mobile-services';
import { Keypair, PublicKey } from '@solana/web3.js';

// Create user keypair (in production, use proper wallet integration)
const userKeypair = Keypair.generate();

// Initialize user account
const userTx = await intentFiMobile.advancedSDK.intentFi.initializeUser(userKeypair);
const userSig = await intentFiMobile.advancedSDK.sendTransaction(userTx, userKeypair);

// Create a swap intent: 1000 USDC → SOL
const swapSignature = await intentFiMobile.createAndExecuteSwapIntent(
  userKeypair,
  new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // USDC
  new PublicKey('So11111111111111111111111111111111111111112'), // SOL
  1000000000, // 1000 USDC (6 decimals)
  300 // 3% max slippage
);

console.log('Swap intent created:', swapSignature);

// Get user profile
const profile = await intentFiMobile.getUserProfile(userKeypair.publicKey);
console.log('User intents:', profile.intents.length);
```

### 2. Launchpad - Token Launch

```typescript
import { intentFiMobile } from '@intentfi/mobile-services';
import { Keypair } from '@solana/web3.js';

const creatorKeypair = Keypair.generate();

// Create a complete token launch
const launch = await intentFiMobile.createCompleteLaunch(creatorKeypair, {
  tokenName: 'My Awesome Token',
  tokenSymbol: 'MAT',
  tokenUri: 'https://my-domain.com/token-metadata.json',
  decimals: 9,
  softCap: 100 * 1e9, // 100 SOL
  hardCap: 500 * 1e9, // 500 SOL
  tokenPrice: 0.01 * 1e9, // 0.01 SOL per token
  tokensForSale: 1000000 * 1e9, // 1M tokens
  minContribution: 0.1 * 1e9, // 0.1 SOL min
  maxContribution: 10 * 1e9, // 10 SOL max
  launchDuration: 7 * 24 * 3600, // 7 days
});

console.log('Token mint:', launch.tokenMint.toString());
console.log('Launch created:', launch.launchSignature);

// Contribute to a launch
const contributorKeypair = Keypair.generate();
const contribution = await intentFiMobile.contributeToLaunch(
  contributorKeypair,
  creatorKeypair.publicKey,
  1 * 1e9 // 1 SOL
);

console.log('Contribution made:', contribution);
```

### 3. Launch Dashboard

```typescript
// Get comprehensive launch data
const dashboard = await intentFiMobile.getLaunchDashboard(creatorKeypair.publicKey);

if (dashboard) {
  console.log('Launch progress:', dashboard.progress.percentage + '%');
  console.log('Soft cap reached:', dashboard.progress.softCapReached);
  console.log('Can finalize:', dashboard.status.canFinalize);
  console.log('Can withdraw:', dashboard.status.canWithdraw);
}
```

## 🏗 Advanced Usage

### Direct SDK Access

```typescript
import { intentFiSDK } from '@intentfi/mobile-services';

// Access individual services
const intentFiService = intentFiSDK.intentFi;
const launchpadService = intentFiSDK.launchpad;

// Network management
const currentNetwork = intentFiSDK.getCurrentNetwork();
const isMainnet = intentFiSDK.isMainnet();

// Manual transaction building
const swapTx = await intentFiService.createSwapIntent(userKeypair, {
  fromMint: new PublicKey('...'),
  toMint: new PublicKey('...'),
  amount: 1000000,
  maxSlippage: 300,
});

const signature = await intentFiSDK.sendTransaction(swapTx, userKeypair);
```

### Custom Network Configuration

```typescript
import { networkService, NETWORKS } from '@intentfi/mobile-services';

// Add custom RPC endpoint
NETWORKS['custom-mainnet'] = {
  name: 'Custom Mainnet',
  rpcEndpoint: 'https://your-custom-rpc.com',
  wsEndpoint: 'wss://your-custom-rpc.com',
  intentFiProgramId: 'YOUR_MAINNET_INTENTFI_PROGRAM_ID',
  launchpadProgramId: 'YOUR_MAINNET_LAUNCHPAD_PROGRAM_ID',
  commitment: 'confirmed',
};

networkService.switchNetwork('custom-mainnet');
```

## 📱 React Native Integration

### Installation

```bash
# Install React Native specific dependencies
npm install react-native-get-random-values
npm install @react-native-async-storage/async-storage

# For wallet integration
npm install @solana/wallet-adapter-react-native
```

### Setup

```typescript
// App.tsx
import 'react-native-get-random-values'; // MUST be first import
import { intentFiMobile } from '@intentfi/mobile-services';

const App = () => {
  useEffect(() => {
    initializeSDK();
  }, []);

  const initializeSDK = async () => {
    try {
      await intentFiMobile.initialize('devnet');
      console.log('IntentFI SDK ready!');
    } catch (error) {
      console.error('SDK initialization failed:', error);
    }
  };

  return (
    <YourAppComponents />
  );
};
```

### Wallet Integration Example

```typescript
import { useConnection, useWallet } from '@solana/wallet-adapter-react-native';
import { intentFiMobile } from '@intentfi/mobile-services';

const SwapScreen = () => {
  const { publicKey, signTransaction } = useWallet();

  const createSwap = async () => {
    if (!publicKey || !signTransaction) return;

    try {
      // Create transaction
      const transaction = await intentFiMobile.advancedSDK.intentFi.createSwapIntent(
        { publicKey } as any, // Simplified - use proper wallet integration
        {
          fromMint: new PublicKey('...'),
          toMint: new PublicKey('...'),
          amount: 1000000,
          maxSlippage: 300,
        }
      );

      // Sign with wallet
      const signed = await signTransaction(transaction);

      // Send transaction
      const connection = intentFiMobile.advancedSDK.sdk.networkService.getConnection();
      const signature = await connection.sendRawTransaction(signed.serialize());

      console.log('Swap created:', signature);
    } catch (error) {
      console.error('Swap failed:', error);
    }
  };

  return (
    <View>
      <Button title="Create Swap Intent" onPress={createSwap} />
    </View>
  );
};
```

## 🔧 API Reference

### IntentFI Methods

| Method             | Description             | Parameters                      |
| ------------------ | ----------------------- | ------------------------------- |
| `initializeUser`   | Initialize user account | `userKeypair: Keypair`          |
| `createSwapIntent` | Create swap intent      | `userKeypair, SwapIntentParams` |
| `createLendIntent` | Create lending intent   | `userKeypair, LendIntentParams` |
| `cancelIntent`     | Cancel pending intent   | `userKeypair, intentAccount`    |
| `getUserAccount`   | Get user account data   | `userPublicKey: PublicKey`      |
| `getUserIntents`   | Get all user intents    | `userPublicKey: PublicKey`      |

### Launchpad Methods

| Method               | Description                | Parameters                             |
| -------------------- | -------------------------- | -------------------------------------- |
| `createTokenMint`    | Create token with metadata | `creator, decimals, name, symbol, uri` |
| `createTokenLaunch`  | Create token launch        | `creator, tokenMint, LaunchParams`     |
| `contributeToLaunch` | Contribute SOL to launch   | `contributor, launchState, amount`     |
| `claimTokens`        | Claim tokens after success | `contributor, launchState, tokenMint`  |
| `claimRefund`        | Claim refund after failure | `contributor, launchState`             |
| `finalizeLaunch`     | Finalize launch status     | `authority, launchState`               |
| `withdrawFunds`      | Withdraw raised funds      | `creator, launchState, treasury`       |

### Types

```typescript
interface SwapIntentParams {
  fromMint: PublicKey;
  toMint: PublicKey;
  amount: number;
  maxSlippage: number; // basis points
}

interface LaunchParams {
  tokenName: string;
  tokenSymbol: string;
  tokenUri: string;
  softCap: number; // lamports
  hardCap: number; // lamports
  tokenPrice: number; // lamports per token
  tokensForSale: number;
  minContribution: number; // lamports
  maxContribution: number; // lamports
  launchDuration: number; // seconds
}
```

## 🧪 Testing

### Devnet Testing

1. **Get Devnet SOL**:

   ```bash
   solana airdrop 2 YOUR_WALLET_ADDRESS --url devnet
   ```

2. **Create Test Tokens**:

   ```bash
   spl-token create-token --url devnet
   spl-token create-account TOKEN_MINT --url devnet
   spl-token mint TOKEN_MINT 1000 --url devnet
   ```

3. **Test Contracts**:

   ```typescript
   // Switch to devnet
   await intentFiMobile.initialize('devnet');

   // Test swap intent
   const swapSig = await intentFiMobile.createAndExecuteSwapIntent(
     testKeypair,
     testTokenMint,
     new PublicKey('So11111111111111111111111111111111111111112'),
     1000000,
     500
   );
   ```

## 🔒 Security Best Practices

1. **Never expose private keys** in production apps
2. **Use proper wallet adapters** for React Native
3. **Validate all inputs** before sending transactions
4. **Test thoroughly** on devnet before mainnet
5. **Keep dependencies updated** for security patches
6. **Use environment variables** for sensitive configuration

## 📚 Examples

Check out our example apps:

- [React Native Example](./examples/react-native)
- [Web App Example](./examples/web-app)
- [CLI Example](./examples/cli)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add some amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [docs.intentfi.com](https://docs.intentfi.com)
- **Discord**: [Join our community](https://discord.gg/intentfi)
- **Twitter**: [@IntentFI](https://twitter.com/intentfi)
- **Email**: support@intentfi.com

## 🗺 Roadmap

- [ ] **v1.1**: Enhanced error handling and retry logic
- [ ] **v1.2**: WebSocket real-time updates
- [ ] **v1.3**: Advanced analytics and reporting
- [ ] **v2.0**: Full mainnet protocol integration
- [ ] **v2.1**: Cross-chain intent support

---

Built with ❤️ by the IntentFI Team for the Solana ecosystem 🌟
