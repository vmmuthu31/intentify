import { PublicKey, Connection } from '@solana/web3.js';

export interface NetworkConfig {
  name: string;
  rpcEndpoint: string;
  wsEndpoint: string;
  intentFiProgramId: string;
  launchpadProgramId: string;
  commitment: 'processed' | 'confirmed' | 'finalized';
}

export const NETWORKS: Record<string, NetworkConfig> = {
  devnet: {
    name: 'Devnet',
    rpcEndpoint: 'https://api.devnet.solana.com',
    wsEndpoint: 'wss://api.devnet.solana.com',
    intentFiProgramId: '2UPCMZ2LESPx8wU83wdng3Yjhx2yxRLEkEDYDkNUg1jd',
    launchpadProgramId: '5y2X9WML5ttrWrxzUfGrLSxbXfEcKTyV1dDyw2jXW1Zg',
    commitment: 'confirmed',
  },
  mainnet: {
    name: 'Mainnet',
    rpcEndpoint: 'https://api.mainnet-beta.solana.com',
    wsEndpoint: 'wss://api.mainnet-beta.solana.com',
    // TODO: Replace with actual mainnet program IDs when deployed
    intentFiProgramId: '11111111111111111111111111111112',
    launchpadProgramId: '11111111111111111111111111111112',
    commitment: 'confirmed',
  },
  'mainnet-rpc': {
    name: 'Mainnet (RPC Pool)',
    rpcEndpoint: 'https://rpc.helius.xyz/?api-key=YOUR_API_KEY',
    wsEndpoint: 'wss://rpc.helius.xyz/?api-key=YOUR_API_KEY',
    // TODO: Replace with actual mainnet program IDs when deployed
    intentFiProgramId: '11111111111111111111111111111112',
    launchpadProgramId: '11111111111111111111111111111112',
    commitment: 'confirmed',
  },
};

export const DEFAULT_NETWORK = 'devnet';

export const COMMON_PROGRAM_IDS = {
  TOKEN_PROGRAM_ID: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  ASSOCIATED_TOKEN_PROGRAM_ID: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  SYSTEM_PROGRAM_ID: '11111111111111111111111111111112',
  SYSVAR_RENT_PUBKEY: 'SysvarRent111111111111111111111111111111111',
  SYSVAR_CLOCK_PUBKEY: 'SysvarC1ock11111111111111111111111111111111',
  METADATA_PROGRAM_ID: 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
};

export class NetworkService {
  private static instance: NetworkService;
  private currentNetwork: string = DEFAULT_NETWORK;
  private connection: Connection;

  private constructor() {
    this.connection = new Connection(
      NETWORKS[this.currentNetwork].rpcEndpoint,
      NETWORKS[this.currentNetwork].commitment
    );
  }

  public static getInstance(): NetworkService {
    if (!NetworkService.instance) {
      NetworkService.instance = new NetworkService();
    }
    return NetworkService.instance;
  }

  public getCurrentNetwork(): string {
    return this.currentNetwork;
  }

  public getNetworkConfig(): NetworkConfig {
    return NETWORKS[this.currentNetwork];
  }

  public switchNetwork(network: string): void {
    if (!NETWORKS[network]) {
      throw new Error(`Unknown network: ${network}`);
    }
    this.currentNetwork = network;
    this.connection = new Connection(NETWORKS[network].rpcEndpoint, NETWORKS[network].commitment);
  }

  public getConnection(): Connection {
    return this.connection;
  }

  public getIntentFiProgramId(): PublicKey {
    try {
      return new PublicKey(NETWORKS[this.currentNetwork].intentFiProgramId);
    } catch (error) {
      console.error(
        'Invalid IntentFI Program ID:',
        NETWORKS[this.currentNetwork].intentFiProgramId,
        error
      );
      // Return a default system program ID if invalid
      return new PublicKey('11111111111111111111111111111112');
    }
  }

  public getLaunchpadProgramId(): PublicKey {
    try {
      return new PublicKey(NETWORKS[this.currentNetwork].launchpadProgramId);
    } catch (error) {
      console.error(
        'Invalid Launchpad Program ID:',
        NETWORKS[this.currentNetwork].launchpadProgramId,
        error
      );
      // Return a default system program ID if invalid
      return new PublicKey('11111111111111111111111111111112');
    }
  }

  public isMainnet(): boolean {
    return this.currentNetwork.includes('mainnet');
  }

  public isDevnet(): boolean {
    return this.currentNetwork === 'devnet';
  }
}

// Export singleton instance
export const networkService = NetworkService.getInstance();
