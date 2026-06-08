import { Chain } from 'viem';

type ChainId = "celo" | "stacks";
type CeloToken = "cusd" | "usdc" | "usdt";
interface CeloTokenMeta {
    id: CeloToken;
    label: string;
    symbol: string;
    decimals: number;
    arcadeAddress: `0x${string}`;
    tokenAddress: `0x${string}`;
}
declare const DEFAULT_CELO_TOKEN: CeloToken;
/** Mainnet token + arcade contract registry. Override addresses via env or explicit config. */
declare const CELO_TOKENS_MAINNET: Record<CeloToken, CeloTokenMeta>;
declare function celoTokenMeta(token?: CeloToken, registry?: Record<CeloToken, CeloTokenMeta>): CeloTokenMeta;
declare const STACKS_CONTRACT_MAINNET: {
    readonly address: "SP1SY1E599GN04XRD2DQBKV7E62HYBJR2CT9S5QKK";
    readonly name: "quiz-arcade";
    readonly trustedSignerPubkey: "0x024563149f07fdcdffb5bed5dc367c690ea7ee6491f7ed5edcbcbcb3b6354ead62";
};
declare const celoMainnet: Chain;
declare const ARCADE_ABI: readonly [{
    readonly type: "function";
    readonly name: "startSession";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "sessionId";
        readonly type: "bytes32";
    }, {
        readonly name: "stake";
        readonly type: "uint256";
    }, {
        readonly name: "maxRounds";
        readonly type: "uint8";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "settle";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "sessionId";
        readonly type: "bytes32";
    }, {
        readonly name: "multiplierBp";
        readonly type: "uint256";
    }, {
        readonly name: "signature";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "cancelExpired";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "sessionId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "freeTreasury";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "fundTreasury";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "withdrawFree";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "trustedSigner";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly type: "function";
    readonly name: "owner";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}];
declare const ERC20_ABI: readonly [{
    readonly type: "function";
    readonly name: "balanceOf";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "account";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "approve";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "spender";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly type: "function";
    readonly name: "allowance";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly name: "spender";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "transfer";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "to";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}];
interface SessionMeta {
    sessionId: `0x${string}`;
    player: `0x${string}`;
    stake: bigint;
    effectiveStake: bigint;
    maxRounds: number;
    expiry: number;
    token: CeloToken;
    chain: ChainId;
}
interface SettlementParams {
    sessionId: `0x${string}`;
    multiplierBp: number;
    signature: `0x${string}`;
}
declare const BPS = 10000;
declare const STEP_BPS = 1000;
/** Clamp a multiplier to the session's ceiling: BPS + STEP_BPS * maxRounds */
declare function clampMultiplierBp(bp: number, maxRounds: number): number;
/** Max possible multiplier for a given round count */
declare function maxMultiplierBp(maxRounds: number): number;
/** Compute payout from effectiveStake and multiplierBp */
declare function computePayout(effectiveStake: bigint, multiplierBp: number): bigint;

export { ARCADE_ABI as A, BPS as B, CELO_TOKENS_MAINNET as C, DEFAULT_CELO_TOKEN as D, ERC20_ABI as E, STACKS_CONTRACT_MAINNET as S, type CeloToken as a, type CeloTokenMeta as b, type ChainId as c, STEP_BPS as d, type SessionMeta as e, type SettlementParams as f, celoMainnet as g, celoTokenMeta as h, clampMultiplierBp as i, computePayout as j, maxMultiplierBp as m };
