import { PublicKey, Connection } from '@solana/web3.js';

export interface NetworkConfig {
  name: string;
  rpcEndpoint: string;
  wsEndpoint: string;
  intentFiProgramId: string;
  launchpadProgramId: string;
  commitment: 'processed' | 'confirmed' | 'finalized';
}

// Multiple RPC endpoints to avoid rate limiting
export const DEVNET_RPC_ENDPOINTS = [
  'https://api.devnet.solana.com',
  'https://devnet.rpcpool.com',
  'https://solana-devnet.rpc.extrnode.com',
  'https://devnet.helius-rpc.com/?api-key=1decf74b-a45e-4667-8f1a-483b95929b03',
  'https://rpc-devnet.solflare.com',
];

export const MAINNET_RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana-api.projectserum.com',
  'https://mainnet.rpcpool.com',
  'https://rpc.hellomoon.io',
];

export const NETWORKS: Record<string, NetworkConfig> = {
  devnet: {
    name: 'Devnet',
    rpcEndpoint: DEVNET_RPC_ENDPOINTS[0], // Default, can rotate
    wsEndpoint: 'wss://api.devnet.solana.com',
    intentFiProgramId: '2UPCMZ2LESPx8wU83wdng3Yjhx2yxRLEkEDYDkNUg1jd',
    launchpadProgramId: '5y2X9WML5ttrWrxzUfGrLSxbXfEcKTyV1dDyw2jXW1Zg',
    commitment: 'confirmed',
  },
  'devnet-rpc-2': {
    name: 'Devnet (RPC Pool)',
    rpcEndpoint: DEVNET_RPC_ENDPOINTS[1],
    wsEndpoint: 'wss://api.devnet.solana.com',
    intentFiProgramId: '2UPCMZ2LESPx8wU83wdng3Yjhx2yxRLEkEDYDkNUg1jd',
    launchpadProgramId: '5y2X9WML5ttrWrxzUfGrLSxbXfEcKTyV1dDyw2jXW1Zg',
    commitment: 'confirmed',
  },
  'devnet-rpc-3': {
    name: 'Devnet (Alt RPC)',
    rpcEndpoint: DEVNET_RPC_ENDPOINTS[2],
    wsEndpoint: 'wss://api.devnet.solana.com',
    intentFiProgramId: '2UPCMZ2LESPx8wU83wdng3Yjhx2yxRLEkEDYDkNUg1jd',
    launchpadProgramId: '5y2X9WML5ttrWrxzUfGrLSxbXfEcKTyV1dDyw2jXW1Zg',
    commitment: 'confirmed',
  },
  mainnet: {
    name: 'Mainnet',
    rpcEndpoint: MAINNET_RPC_ENDPOINTS[0],
    wsEndpoint: 'wss://api.mainnet-beta.solana.com',
    // TODO: Replace with actual mainnet program IDs when deployed
    intentFiProgramId: '11111111111111111111111111111112',
    launchpadProgramId: '11111111111111111111111111111112',
    commitment: 'confirmed',
  },
  'mainnet-rpc': {
    name: 'Mainnet (RPC Pool)',
    rpcEndpoint: MAINNET_RPC_ENDPOINTS[1],
    wsEndpoint: 'wss://api.mainnet-beta.solana.com',
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
  private rpcIndex: number = 0; // Track current RPC endpoint index
  private rateLimitCount: number = 0; // Track rate limit hits

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
    this.rpcIndex = 0; // Reset RPC index
    this.rateLimitCount = 0; // Reset rate limit count
    this.connection = new Connection(NETWORKS[network].rpcEndpoint, NETWORKS[network].commitment);
    console.log(`🔄 Switched to ${network}: ${NETWORKS[network].rpcEndpoint}`);
  }

  /**
   * Rotate to next RPC endpoint when rate limited
   */
  public rotateRPC(): boolean {
    const rpcEndpoints = this.isDevnet() ? DEVNET_RPC_ENDPOINTS : MAINNET_RPC_ENDPOINTS;

    if (this.rpcIndex < rpcEndpoints.length - 1) {
      this.rpcIndex++;
      this.rateLimitCount++;

      // Create new connection with rotated RPC
      const newRpcEndpoint = rpcEndpoints[this.rpcIndex];
      this.connection = new Connection(newRpcEndpoint, NETWORKS[this.currentNetwork].commitment);

      console.log(
        `🔄 Rotated to RPC ${this.rpcIndex + 1}/${rpcEndpoints.length}: ${newRpcEndpoint}`
      );
      return true;
    }

    console.warn('⚠️ All RPC endpoints exhausted for rate limiting');
    return false;
  }

  /**
   * Handle RPC errors with automatic rotation
   */
  public async handleRPCError(error: any): Promise<boolean> {
    if (error?.message?.includes('429') || error?.code === 429) {
      console.warn(`🚰 Rate limit detected (${this.rateLimitCount + 1} times), rotating RPC...`);
      return this.rotateRPC();
    }
    return false;
  }

  public getConnection(): Connection {
    return this.connection;
  }

  /**
   * Reset RPC rotation (call when operations are successful)
   */
  public resetRPCRotation(): void {
    if (this.rpcIndex > 0) {
      console.log('✅ Resetting RPC to primary endpoint');
      this.rpcIndex = 0;
      this.rateLimitCount = 0;
      const rpcEndpoints = this.isDevnet() ? DEVNET_RPC_ENDPOINTS : MAINNET_RPC_ENDPOINTS;
      this.connection = new Connection(rpcEndpoints[0], NETWORKS[this.currentNetwork].commitment);
    }
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

  /**
   * Get current RPC status for debugging
   */
  public getRPCStatus(): { endpoint: string; index: number; rateLimitCount: number } {
    const rpcEndpoints = this.isDevnet() ? DEVNET_RPC_ENDPOINTS : MAINNET_RPC_ENDPOINTS;
    return {
      endpoint: rpcEndpoints[this.rpcIndex],
      index: this.rpcIndex,
      rateLimitCount: this.rateLimitCount,
    };
  }
}

// Export singleton instance
export const networkService = NetworkService.getInstance();
