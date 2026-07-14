// Minimal ABI for the parts of QuizArcade v2 the frontend and server call.
export const ARCADE_ABI = [
  {
    type: "function",
    name: "startSession",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sessionId", type: "bytes32" },
      { name: "token",     type: "address" },
      { name: "stake",     type: "uint256" },
      { name: "maxRounds", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sessionId",    type: "bytes32" },
      { name: "multiplierBp", type: "uint256" },
      { name: "signature",    type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelExpired",
    stateMutability: "nonpayable",
    inputs: [{ name: "sessionId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getSession",
    stateMutability: "view",
    inputs: [{ name: "sessionId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "player",         type: "address" },
          { name: "token",          type: "address" },
          { name: "effectiveStake", type: "uint256" },
          { name: "reserve",        type: "uint256" },
          { name: "expiry",         type: "uint64" },
          { name: "maxRounds",      type: "uint8" },
          { name: "settled",        type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "freeTreasury",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "payoutPool",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Events the leaderboard/profile indexer reads. SessionStarted carries the gross + effective stake;
  // SessionSettled carries the final multiplier + payout. Both now include `token` (indexed) so the
  // indexer can filter by token and the multi-token contract emits events the leaderboard can parse.
  {
    type: "event",
    name: "SessionStarted",
    inputs: [
      { name: "sessionId",     type: "bytes32", indexed: true },
      { name: "player",        type: "address", indexed: true },
      { name: "token",         type: "address", indexed: true },
      { name: "stake",         type: "uint256", indexed: false },
      { name: "effectiveStake",type: "uint256", indexed: false },
      { name: "reserve",       type: "uint256", indexed: false },
      { name: "maxRounds",     type: "uint8",   indexed: false },
      { name: "expiry",        type: "uint64",  indexed: false },
    ],
  },
  {
    type: "event",
    name: "SessionSettled",
    inputs: [
      { name: "sessionId",   type: "bytes32", indexed: true },
      { name: "player",      type: "address", indexed: true },
      { name: "token",       type: "address", indexed: true },
      { name: "multiplierBp",type: "uint256", indexed: false },
      { name: "payout",      type: "uint256", indexed: false },
    ],
  },
] as const;

// Standard ERC20 subset (approve / allowance / balance / decimals).
export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner",   type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;
