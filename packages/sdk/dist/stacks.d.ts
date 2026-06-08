import * as _stacks_transactions from '@stacks/transactions';
import * as _stacks_network from '@stacks/network';
export { S as STACKS_CONTRACT_MAINNET } from './types-DwOAA0r4.js';
import 'viem';

type StacksNetworkName = "mainnet" | "testnet";
/**
 * Returns a StacksMainnet or StacksTestnet instance.
 * Requires @stacks/network as a peer dependency.
 */
declare function stacksNetwork(network?: StacksNetworkName, apiUrl?: string): Promise<_stacks_network.StacksMainnet | _stacks_network.StacksTestnet>;
interface SignStacksSettlementOptions {
    sessionId: string;
    multiplierBp: number;
    signerPrivateKey: string;
}
/**
 * Sign a Stacks settlement using secp256k1 over the Clarity consensus buffer.
 * Produces a 65-byte RSV signature accepted by quiz-arcade.clar's secp256k1-verify.
 * Requires @stacks/transactions as a peer dependency.
 */
declare function signStacksSettlement({ sessionId, multiplierBp, signerPrivateKey, }: SignStacksSettlementOptions): Promise<string>;
interface StacksSessionParams {
    sessionId: string;
    stakeUstx: number;
    maxRounds: number;
}
interface StacksSettleParams {
    sessionId: string;
    multiplierBp: number;
    signature: string;
}
/**
 * Build Clarity function args for start-session.
 * Requires @stacks/transactions as a peer dependency.
 */
declare function buildStartSessionArgs({ sessionId, stakeUstx, maxRounds }: StacksSessionParams): Promise<(_stacks_transactions.BufferCV | _stacks_transactions.UIntCV)[]>;
/**
 * Build Clarity function args for settle.
 * Requires @stacks/transactions as a peer dependency.
 */
declare function buildSettleArgs({ sessionId, multiplierBp, signature }: StacksSettleParams): Promise<(_stacks_transactions.BufferCV | _stacks_transactions.UIntCV)[]>;

export { type SignStacksSettlementOptions, type StacksNetworkName, type StacksSessionParams, type StacksSettleParams, buildSettleArgs, buildStartSessionArgs, signStacksSettlement, stacksNetwork };
