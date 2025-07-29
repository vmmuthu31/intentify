import { Connection, PublicKey } from '@solana/web3.js';
import { MPL_TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';

export interface TokenMetadata {
  name: string;
  symbol: string;
  uri: string;
  mint: string;
}

/**
 * Service to fetch token metadata from Metaplex Token Metadata Program
 */
export class TokenMetadataService {
  private connection: Connection;
  private metadataCache: Map<string, TokenMetadata> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Fetch token metadata for a given mint address
   */
  async fetchTokenMetadata(mintAddress: string): Promise<TokenMetadata | null> {
    try {
      // Check cache first
      const cached = this.metadataCache.get(mintAddress);
      if (cached) {
        console.log('📋 Using cached metadata for:', mintAddress);
        return cached;
      }

      console.log('🔍 Fetching metadata for token:', mintAddress);

      const mintPubkey = new PublicKey(mintAddress);

      // Find metadata PDA
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID).toBuffer(),
          mintPubkey.toBuffer(),
        ],
        new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID)
      );

      console.log('📝 Metadata PDA:', metadataPDA.toString());

      // Get account info
      const accountInfo = await this.connection.getAccountInfo(metadataPDA);
      if (!accountInfo) {
        console.log('❌ No metadata account found for:', mintAddress);
        return null;
      }

      console.log('✅ Found metadata account, data length:', accountInfo.data.length);

      // Parse metadata manually - simplified parser for DataV2 struct
      const data = accountInfo.data;
      let offset = 1 + 32 + 32; // Skip account discriminator + key + update_authority

      // Read name length and name
      if (offset + 4 > data.length) return null;
      const nameLength = data.readUInt32LE(offset);
      offset += 4;

      if (offset + nameLength > data.length) return null;
      const name = data
        .slice(offset, offset + nameLength)
        .toString('utf8')
        .trim()
        .replace(/\0/g, '');
      offset += nameLength;

      // Read symbol length and symbol
      if (offset + 4 > data.length) return null;
      const symbolLength = data.readUInt32LE(offset);
      offset += 4;

      if (offset + symbolLength > data.length) return null;
      const symbol = data
        .slice(offset, offset + symbolLength)
        .toString('utf8')
        .trim()
        .replace(/\0/g, '');
      offset += symbolLength;

      // Read URI length and URI
      if (offset + 4 > data.length) return null;
      const uriLength = data.readUInt32LE(offset);
      offset += 4;

      if (offset + uriLength > data.length) return null;
      const uri = data
        .slice(offset, offset + uriLength)
        .toString('utf8')
        .trim()
        .replace(/\0/g, '');

      const metadata: TokenMetadata = {
        name: name || 'Unknown Token',
        symbol: symbol || 'UNKNOWN',
        uri: uri || '',
        mint: mintAddress,
      };

      console.log('✅ Successfully parsed metadata:', metadata);

      // Cache the metadata
      this.metadataCache.set(mintAddress, metadata);

      return metadata;
    } catch (error) {
      console.warn('⚠️ Failed to fetch metadata for token:', mintAddress, error);
      return null;
    }
  }

  /**
   * Fetch metadata for multiple tokens in parallel
   */
  async fetchMultipleTokenMetadata(mintAddresses: string[]): Promise<Map<string, TokenMetadata>> {
    const results = new Map<string, TokenMetadata>();

    console.log('🔍 Fetching metadata for', mintAddresses.length, 'tokens');

    const promises = mintAddresses.map(async (mint) => {
      const metadata = await this.fetchTokenMetadata(mint);
      if (metadata) {
        results.set(mint, metadata);
      }
      return { mint, metadata };
    });

    await Promise.allSettled(promises);

    console.log('✅ Fetched metadata for', results.size, 'out of', mintAddresses.length, 'tokens');

    return results;
  }

  /**
   * Clear metadata cache
   */
  clearCache(): void {
    this.metadataCache.clear();
    console.log('🧹 Metadata cache cleared');
  }

  /**
   * Get cached metadata without fetching
   */
  getCachedMetadata(mintAddress: string): TokenMetadata | null {
    return this.metadataCache.get(mintAddress) || null;
  }
}

// Create a singleton instance
let tokenMetadataService: TokenMetadataService | null = null;

export function getTokenMetadataService(connection: Connection): TokenMetadataService {
  if (!tokenMetadataService) {
    tokenMetadataService = new TokenMetadataService(connection);
  }
  return tokenMetadataService;
}
