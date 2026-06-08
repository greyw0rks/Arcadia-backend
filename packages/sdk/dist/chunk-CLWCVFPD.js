import {
  ARCADE_ABI,
  CELO_TOKENS_MAINNET,
  ERC20_ABI,
  celoMainnet,
  celoTokenMeta
} from "./chunk-6RXO2AGS.js";

// src/celo.ts
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
async function signEvmSettlement({
  sessionId,
  multiplierBp,
  token = "cusd",
  signerPrivateKey,
  chainId = 42220,
  arcadeAddress,
  tokenRegistry = CELO_TOKENS_MAINNET
}) {
  const meta = celoTokenMeta(token, tokenRegistry);
  const verifyingContract = arcadeAddress ?? meta.arcadeAddress;
  const account = privateKeyToAccount(signerPrivateKey);
  return account.signTypedData({
    domain: {
      name: "QuizArcade",
      version: "1",
      chainId,
      verifyingContract
    },
    types: {
      Settlement: [
        { name: "sessionId", type: "bytes32" },
        { name: "multiplierBp", type: "uint256" }
      ]
    },
    primaryType: "Settlement",
    message: {
      sessionId,
      multiplierBp: BigInt(multiplierBp)
    }
  });
}
function createCeloClient(rpcUrl = "https://forno.celo.org") {
  return createPublicClient({
    chain: celoMainnet,
    transport: http(rpcUrl)
  });
}
function createArcadeReader(options = {}) {
  const {
    token = "cusd",
    rpcUrl = "https://forno.celo.org",
    tokenRegistry = CELO_TOKENS_MAINNET
  } = options;
  const meta = celoTokenMeta(token, tokenRegistry);
  const publicClient = createCeloClient(rpcUrl);
  return {
    meta,
    async freeTreasury() {
      return publicClient.readContract({
        address: meta.arcadeAddress,
        abi: ARCADE_ABI,
        functionName: "freeTreasury"
      });
    },
    async tokenBalance(address) {
      return publicClient.readContract({
        address: meta.tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address]
      });
    },
    async allowance(owner) {
      return publicClient.readContract({
        address: meta.tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [owner, meta.arcadeAddress]
      });
    }
  };
}
function createArcadeClient(options = {}) {
  const {
    token = "cusd",
    rpcUrl = "https://forno.celo.org",
    tokenRegistry = CELO_TOKENS_MAINNET
  } = options;
  const meta = celoTokenMeta(token, tokenRegistry);
  const publicClient = createCeloClient(rpcUrl);
  const reader = createArcadeReader(options);
  function walletClient(privateKey) {
    const account = privateKeyToAccount(privateKey);
    const wc = createWalletClient({
      account,
      chain: celoMainnet,
      transport: http(rpcUrl)
    });
    return { wc, account };
  }
  return {
    ...reader,
    async approve(playerKey, amount) {
      const { wc, account } = walletClient(playerKey);
      return wc.writeContract({
        account,
        chain: celoMainnet,
        address: meta.tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [meta.arcadeAddress, amount]
      });
    },
    async startSession(playerKey, sessionId, stake, maxRounds) {
      const { wc, account } = walletClient(playerKey);
      const stakeWei = parseUnits(stake, meta.decimals);
      return wc.writeContract({
        account,
        chain: celoMainnet,
        address: meta.arcadeAddress,
        abi: ARCADE_ABI,
        functionName: "startSession",
        args: [sessionId, stakeWei, maxRounds]
      });
    },
    async settle(playerKey, { sessionId, multiplierBp, signature }) {
      const { wc, account } = walletClient(playerKey);
      return wc.writeContract({
        account,
        chain: celoMainnet,
        address: meta.arcadeAddress,
        abi: ARCADE_ABI,
        functionName: "settle",
        args: [sessionId, BigInt(multiplierBp), signature]
      });
    },
    async cancelExpired(callerKey, sessionId) {
      const { wc, account } = walletClient(callerKey);
      return wc.writeContract({
        account,
        chain: celoMainnet,
        address: meta.arcadeAddress,
        abi: ARCADE_ABI,
        functionName: "cancelExpired",
        args: [sessionId]
      });
    }
  };
}
function parseStake(amount, token = "cusd") {
  return parseUnits(amount, celoTokenMeta(token).decimals);
}

export {
  signEvmSettlement,
  createCeloClient,
  createArcadeReader,
  createArcadeClient,
  parseStake
};
