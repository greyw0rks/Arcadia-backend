// Server-only configuration. Read secrets from env; never expose these to the client.

export const TRIVIA_TIME_LIMIT_SEC = 8;
export const WORD_TIME_LIMIT_SEC = 10;
export const GEO_TIME_LIMIT_SEC = 10;

// Grace period (ms) added to the server-side deadline to absorb network latency before an answer is
// counted as a timeout. Keeps honest players from being punished for round-trip lag.
export const ANSWER_GRACE_MS = 1_500;

export function getSignerPrivateKey(): `0x${string}` {
  const pk = process.env.SETTLEMENT_SIGNER_PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error(
      "SETTLEMENT_SIGNER_PRIVATE_KEY missing or malformed. Set it in web/.env.local (see .env.example)."
    );
  }
  return pk as `0x${string}`;
}

