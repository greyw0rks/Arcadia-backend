import { Hash, PublicClient } from 'viem';
import { a as CeloToken, C as CELO_TOKENS_MAINNET, b as CeloTokenMeta, f as SettlementParams } from './types-DwOAA0r4.cjs';

interface SignEvmSettlementOptions {
    sessionId: `0x${string}`;
    multiplierBp: number;
    token?: CeloToken;
    signerPrivateKey: `0x${string}`;
    chainId?: number;
    arcadeAddress?: `0x${string}`;
    tokenRegistry?: typeof CELO_TOKENS_MAINNET;
}
/**
 * Sign a settlement for the Celo QuizArcade contract using EIP-712.
 * The verifyingContract is the arcade contract for the given token.
 */
declare function signEvmSettlement({ sessionId, multiplierBp, token, signerPrivateKey, chainId, arcadeAddress, tokenRegistry, }: SignEvmSettlementOptions): Promise<`0x${string}`>;
declare function createCeloClient(rpcUrl?: string): PublicClient;
interface ArcadeClientOptions {
    token?: CeloToken;
    rpcUrl?: string;
    tokenRegistry?: typeof CELO_TOKENS_MAINNET;
}
interface ArcadeReadClient {
    meta: CeloTokenMeta;
    freeTreasury(): Promise<bigint>;
    tokenBalance(address: `0x${string}`): Promise<bigint>;
    allowance(owner: `0x${string}`): Promise<bigint>;
}
interface ArcadeWriteClient extends ArcadeReadClient {
    startSession(playerKey: `0x${string}`, sessionId: `0x${string}`, stake: string, maxRounds: number): Promise<Hash>;
    settle(playerKey: `0x${string}`, params: SettlementParams): Promise<Hash>;
    cancelExpired(callerKey: `0x${string}`, sessionId: `0x${string}`): Promise<Hash>;
    approve(playerKey: `0x${string}`, amount: bigint): Promise<Hash>;
}
/**
 * Create a read-only Arcade client for a given token.
 */
declare function createArcadeReader(options?: ArcadeClientOptions): ArcadeReadClient;
/**
 * Create a full read+write Arcade client for a given token.
 */
declare function createArcadeClient(options?: ArcadeClientOptions): ArcadeWriteClient;
/** Parse a human-readable stake amount to wei for the given token */
declare function parseStake(amount: string, token?: CeloToken): bigint;

export { type ArcadeClientOptions, type ArcadeReadClient, type ArcadeWriteClient, type SignEvmSettlementOptions, createArcadeClient, createArcadeReader, createCeloClient, parseStake, signEvmSettlement };
