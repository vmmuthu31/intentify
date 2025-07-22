import {
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import { networkService, COMMON_PROGRAM_IDS } from './config';

export interface LaunchParams {
  tokenName: string;
  tokenSymbol: string;
  tokenUri: string;
  softCap: number; // in SOL
  hardCap: number; // in SOL
  tokenPrice: number; // price per token in lamports
  tokensForSale: number;
  minContribution: number; // in lamports
  maxContribution: number; // in lamports
  launchDuration: number; // in seconds
}

export interface LaunchState {
  creator: PublicKey;
  tokenMint: PublicKey;
  tokenName: string;
  tokenSymbol: string;
  tokenUri: string;
  softCap: number;
  hardCap: number;
  tokenPrice: number;
  tokensForSale: number;
  minContribution: number;
  maxContribution: number;
  launchStart: number;
  launchEnd: number;
  totalRaised: number;
  totalContributors: number;
  tokensSold: number;
  status: 'Active' | 'Successful' | 'Failed';
}

export interface ContributorState {
  contributor: PublicKey;
  launch: PublicKey;
  totalContributed: number;
  tokensOwed: number;
  claimed: boolean;
}

export interface LaunchpadState {
  authority: PublicKey;
  treasuryAuthority: PublicKey;
  platformFeeBps: number;
  totalLaunches: number;
  totalRaised: number;
  isPaused: boolean;
}

export class LaunchpadService {
  private static instance: LaunchpadService;

  private constructor() {}

  public static getInstance(): LaunchpadService {
    if (!LaunchpadService.instance) {
      LaunchpadService.instance = new LaunchpadService();
    }
    return LaunchpadService.instance;
  }

  /**
   * Get program derived addresses
   */
  public async getLaunchpadStatePDA(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('launchpad_state')],
      networkService.getLaunchpadProgramId()
    );
  }

  public async getLaunchStatePDA(creator: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('launch_state'), creator.toBuffer()],
      networkService.getLaunchpadProgramId()
    );
  }

  public async getContributorStatePDA(
    launch: PublicKey,
    contributor: PublicKey
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('contributor'), launch.toBuffer(), contributor.toBuffer()],
      networkService.getLaunchpadProgramId()
    );
  }

  /**
   * Initialize the launchpad protocol (admin only)
   */
  public async initializeLaunchpad(
    authority: Keypair,
    platformFeeBps: number,
    treasuryAuthority: PublicKey
  ): Promise<Transaction> {
    const [launchpadState] = await this.getLaunchpadStatePDA();

    const instruction = new TransactionInstruction({
      programId: networkService.getLaunchpadProgramId(),
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: launchpadState, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([0]), // initialize_launchpad instruction index
        new BN(platformFeeBps).toArrayLike(Buffer, 'le', 2),
        treasuryAuthority.toBuffer(),
      ]),
    });

    const transaction = new Transaction().add(instruction);
    return transaction;
  }

  /**
   * Create a new token launch
   */
  public async createTokenLaunch(
    creator: Keypair,
    tokenMint: PublicKey,
    params: LaunchParams
  ): Promise<Transaction> {
    const [launchpadState] = await this.getLaunchpadStatePDA();
    const [launchState] = await this.getLaunchStatePDA(creator.publicKey);

    // Serialize launch params
    const nameBytes = Buffer.from(params.tokenName, 'utf8');
    const symbolBytes = Buffer.from(params.tokenSymbol, 'utf8');
    const uriBytes = Buffer.from(params.tokenUri, 'utf8');

    const instruction = new TransactionInstruction({
      programId: networkService.getLaunchpadProgramId(),
      keys: [
        { pubkey: creator.publicKey, isSigner: true, isWritable: true },
        { pubkey: launchpadState, isSigner: false, isWritable: true },
        { pubkey: launchState, isSigner: false, isWritable: true },
        { pubkey: tokenMint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([1]), // create_token_launch instruction index
        // Serialize LaunchParams struct
        new BN(nameBytes.length).toArrayLike(Buffer, 'le', 4),
        nameBytes,
        new BN(symbolBytes.length).toArrayLike(Buffer, 'le', 4),
        symbolBytes,
        new BN(uriBytes.length).toArrayLike(Buffer, 'le', 4),
        uriBytes,
        new BN(params.softCap).toArrayLike(Buffer, 'le', 8),
        new BN(params.hardCap).toArrayLike(Buffer, 'le', 8),
        new BN(params.tokenPrice).toArrayLike(Buffer, 'le', 8),
        new BN(params.tokensForSale).toArrayLike(Buffer, 'le', 8),
        new BN(params.minContribution).toArrayLike(Buffer, 'le', 8),
        new BN(params.maxContribution).toArrayLike(Buffer, 'le', 8),
        new BN(params.launchDuration).toArrayLike(Buffer, 'le', 8),
      ]),
    });

    const transaction = new Transaction().add(instruction);
    return transaction;
  }

  /**
   * Create token mint with metadata
   */
  public async createTokenMint(
    creator: Keypair,
    decimals: number,
    name: string,
    symbol: string,
    uri: string
  ): Promise<{ transaction: Transaction; tokenMint: PublicKey }> {
    const tokenMint = Keypair.generate();
    const [launchState] = await this.getLaunchStatePDA(creator.publicKey);

    // Get metadata PDA
    const [metadata] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        new PublicKey(COMMON_PROGRAM_IDS.METADATA_PROGRAM_ID).toBuffer(),
        tokenMint.publicKey.toBuffer(),
      ],
      new PublicKey(COMMON_PROGRAM_IDS.METADATA_PROGRAM_ID)
    );

    const instruction = new TransactionInstruction({
      programId: networkService.getLaunchpadProgramId(),
      keys: [
        { pubkey: creator.publicKey, isSigner: true, isWritable: true },
        { pubkey: launchState, isSigner: false, isWritable: false },
        { pubkey: tokenMint.publicKey, isSigner: true, isWritable: true },
        { pubkey: metadata, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        {
          pubkey: new PublicKey(COMMON_PROGRAM_IDS.METADATA_PROGRAM_ID),
          isSigner: false,
          isWritable: false,
        },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        {
          pubkey: new PublicKey(COMMON_PROGRAM_IDS.SYSVAR_RENT_PUBKEY),
          isSigner: false,
          isWritable: false,
        },
      ],
      data: Buffer.concat([
        Buffer.from([2]), // create_token_mint instruction index
        Buffer.from([decimals]),
        new BN(Buffer.from(name, 'utf8').length).toArrayLike(Buffer, 'le', 4),
        Buffer.from(name, 'utf8'),
        new BN(Buffer.from(symbol, 'utf8').length).toArrayLike(Buffer, 'le', 4),
        Buffer.from(symbol, 'utf8'),
        new BN(Buffer.from(uri, 'utf8').length).toArrayLike(Buffer, 'le', 4),
        Buffer.from(uri, 'utf8'),
      ]),
    });

    const transaction = new Transaction().add(instruction);
    transaction.sign(tokenMint);

    return { transaction, tokenMint: tokenMint.publicKey };
  }

  /**
   * Contribute to a token launch
   */
  public async contributeToLaunch(
    contributor: Keypair,
    launchState: PublicKey,
    tokenMint: PublicKey,
    amount: number
  ): Promise<Transaction> {
    const [launchpadState] = await this.getLaunchpadStatePDA();
    const [contributorState] = await this.getContributorStatePDA(
      launchState,
      contributor.publicKey
    );

    const instruction = new TransactionInstruction({
      programId: networkService.getLaunchpadProgramId(),
      keys: [
        { pubkey: contributor.publicKey, isSigner: true, isWritable: true },
        { pubkey: launchState, isSigner: false, isWritable: true },
        { pubkey: contributorState, isSigner: false, isWritable: true },
        { pubkey: launchpadState, isSigner: false, isWritable: true },
        { pubkey: tokenMint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([3]), // contribute_to_launch instruction index
        new BN(amount).toArrayLike(Buffer, 'le', 8),
      ]),
    });

    const transaction = new Transaction().add(instruction);
    return transaction;
  }

  /**
   * Finalize a launch
   */
  public async finalizeLaunch(authority: Keypair, launchState: PublicKey): Promise<Transaction> {
    const instruction = new TransactionInstruction({
      programId: networkService.getLaunchpadProgramId(),
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: launchState, isSigner: false, isWritable: true },
      ],
      data: Buffer.from([4]), // finalize_launch instruction index
    });

    const transaction = new Transaction().add(instruction);
    return transaction;
  }

  /**
   * Claim tokens after successful launch
   */
  public async claimTokens(
    contributor: Keypair,
    launchState: PublicKey,
    tokenMint: PublicKey
  ): Promise<Transaction> {
    const [contributorState] = await this.getContributorStatePDA(
      launchState,
      contributor.publicKey
    );
    const contributorTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      contributor.publicKey
    );

    const instruction = new TransactionInstruction({
      programId: networkService.getLaunchpadProgramId(),
      keys: [
        { pubkey: contributor.publicKey, isSigner: true, isWritable: true },
        { pubkey: launchState, isSigner: false, isWritable: false },
        { pubkey: contributorState, isSigner: false, isWritable: true },
        { pubkey: tokenMint, isSigner: false, isWritable: true },
        { pubkey: contributorTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([5]), // claim_tokens instruction index
    });

    const transaction = new Transaction().add(instruction);
    return transaction;
  }

  /**
   * Claim refund after failed launch
   */
  public async claimRefund(contributor: Keypair, launchState: PublicKey): Promise<Transaction> {
    const [contributorState] = await this.getContributorStatePDA(
      launchState,
      contributor.publicKey
    );

    const instruction = new TransactionInstruction({
      programId: networkService.getLaunchpadProgramId(),
      keys: [
        { pubkey: contributor.publicKey, isSigner: true, isWritable: true },
        { pubkey: launchState, isSigner: false, isWritable: false },
        { pubkey: contributorState, isSigner: false, isWritable: true },
      ],
      data: Buffer.from([6]), // claim_refund instruction index
    });

    const transaction = new Transaction().add(instruction);
    return transaction;
  }

  /**
   * Withdraw funds (creator only, after successful launch)
   */
  public async withdrawFunds(
    creator: Keypair,
    launchState: PublicKey,
    treasury: PublicKey
  ): Promise<Transaction> {
    const [launchpadState] = await this.getLaunchpadStatePDA();

    const instruction = new TransactionInstruction({
      programId: networkService.getLaunchpadProgramId(),
      keys: [
        { pubkey: creator.publicKey, isSigner: true, isWritable: true },
        { pubkey: launchState, isSigner: false, isWritable: false },
        { pubkey: launchpadState, isSigner: false, isWritable: false },
        { pubkey: treasury, isSigner: false, isWritable: true },
      ],
      data: Buffer.from([7]), // withdraw_funds instruction index
    });

    const transaction = new Transaction().add(instruction);
    return transaction;
  }

  /**
   * Fetch launchpad state data
   */
  public async getLaunchpadState(): Promise<LaunchpadState | null> {
    try {
      const [launchpadStatePDA] = await this.getLaunchpadStatePDA();
      const accountInfo = await networkService.getConnection().getAccountInfo(launchpadStatePDA);

      if (!accountInfo) {
        return null;
      }

      // Parse account data (simplified - you'd use proper deserialization)
      const data = accountInfo.data;
      return {
        authority: new PublicKey(data.slice(8, 40)),
        treasuryAuthority: new PublicKey(data.slice(40, 72)),
        platformFeeBps: data.readUInt16LE(72),
        totalLaunches: Number(data.readBigUInt64LE(74)),
        totalRaised: Number(data.readBigUInt64LE(82)),
        isPaused: data.readUInt8(90) === 1,
      };
    } catch (error) {
      console.error('Error fetching launchpad state:', error);
      return null;
    }
  }

  /**
   * Fetch launch state data
   */
  public async getLaunchState(creator: PublicKey): Promise<LaunchState | null> {
    try {
      const [launchStatePDA] = await this.getLaunchStatePDA(creator);
      const accountInfo = await networkService.getConnection().getAccountInfo(launchStatePDA);

      if (!accountInfo) {
        return null;
      }

      // Parse account data (simplified - you'd use proper deserialization)
      const data = accountInfo.data;

      return {
        creator: new PublicKey(data.slice(8, 40)),
        tokenMint: new PublicKey(data.slice(40, 72)),
        tokenName: '', // Would need proper string deserialization
        tokenSymbol: '', // Would need proper string deserialization
        tokenUri: '', // Would need proper string deserialization
        softCap: Number(data.readBigUInt64LE(200)), // Approximate offset
        hardCap: Number(data.readBigUInt64LE(208)),
        tokenPrice: Number(data.readBigUInt64LE(216)),
        tokensForSale: Number(data.readBigUInt64LE(224)),
        minContribution: Number(data.readBigUInt64LE(232)),
        maxContribution: Number(data.readBigUInt64LE(240)),
        launchStart: Number(data.readBigInt64LE(248)),
        launchEnd: Number(data.readBigInt64LE(256)),
        totalRaised: Number(data.readBigUInt64LE(264)),
        totalContributors: data.readUInt32LE(272),
        tokensSold: Number(data.readBigUInt64LE(276)),
        status: ['Active', 'Successful', 'Failed'][data.readUInt8(284)] as any,
      };
    } catch (error) {
      console.error('Error fetching launch state:', error);
      return null;
    }
  }

  /**
   * Fetch contributor state data
   */
  public async getContributorState(
    launch: PublicKey,
    contributor: PublicKey
  ): Promise<ContributorState | null> {
    try {
      const [contributorStatePDA] = await this.getContributorStatePDA(launch, contributor);
      const accountInfo = await networkService.getConnection().getAccountInfo(contributorStatePDA);

      if (!accountInfo) {
        return null;
      }

      // Parse account data (simplified - you'd use proper deserialization)
      const data = accountInfo.data;

      return {
        contributor: new PublicKey(data.slice(8, 40)),
        launch: new PublicKey(data.slice(40, 72)),
        totalContributed: Number(data.readBigUInt64LE(72)),
        tokensOwed: Number(data.readBigUInt64LE(80)),
        claimed: data.readUInt8(88) === 1,
      };
    } catch (error) {
      console.error('Error fetching contributor state:', error);
      return null;
    }
  }

  /**
   * Get all launches (simplified - in production you'd use proper indexing)
   */
  public async getAllLaunches(): Promise<LaunchState[]> {
    try {
      // This is a simplified implementation
      // In production, you'd use proper account filtering and indexing
      const launches: LaunchState[] = [];

      // You could implement proper account fetching here
      // For now, this is just a placeholder structure

      return launches;
    } catch (error) {
      console.error('Error fetching all launches:', error);
      return [];
    }
  }

  /**
   * Helper function to check if launch has ended
   */
  public isLaunchEnded(launch: LaunchState): boolean {
    return Date.now() / 1000 > launch.launchEnd;
  }

  /**
   * Helper function to check if launch is successful
   */
  public isLaunchSuccessful(launch: LaunchState): boolean {
    return launch.totalRaised >= launch.softCap;
  }

  /**
   * Helper function to calculate tokens for contribution
   */
  public calculateTokensForContribution(launch: LaunchState, contribution: number): number {
    return Math.floor((contribution * Math.pow(10, 9)) / launch.tokenPrice); // Assuming 9 decimals
  }
}

// Export singleton instance
export const launchpadService = LaunchpadService.getInstance();
