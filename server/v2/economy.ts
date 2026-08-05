// server/v2/economy.ts — canonical V2 ("Ranked") pricing, one source of truth.
//
// Ranked is single-token: cUSD/USDm only (celopedia's canonical Mento Dollar, 18-dp, and its own
// CIP-64 fee-currency). Multi-token (USDm/USDC/USDT) lives in Casual/V1 — see docs/V2_MULTI_TOKEN.md.
//
// The ArcadiaPool contract takes `amount` as a parameter and does NOT hardcode a price (see
// ArcadiaPool.sol `enter`/`rebuy`/`buyRounds`), and server/v2/entry.ts verifies a paid entry by
// event KIND, not value — deliberately, so $0.10 tickets don't sum into a fake entry. That means the
// buy-in price lives at the app layer. This file is that layer: the entry UI builds its `enter()`
// amount from here, and any display copy should read these numbers rather than restating them.
//
// Prices are in whole USD. Convert to base units with `toBaseUnits`; USDm is 18-dp so $0.50 = 5e17.
// (The helper stays decimals-aware in case Ranked ever adds a token, but today it is USDm-only.)

/** Weekly buy-in to enter the pool. Flat — money cannot buy a larger share (skill-game framing). */
export const BUY_IN_USD = 0.5;

/** Re-entry after a bust. Same price as entry, no escalation (spec §6). */
export const REBUY_USD = 0.5;

/** Monday early-bird: a timing discount, not a difficulty tier (spec §2). 30% off, matching the
 *  original $1.00/$0.70 ratio. */
export const EARLY_BIRD_USD = 0.35;

/** Extra-round ticket after the daily free allowance is spent (spec §5.1). Separate, smaller
 *  mechanic — flows into the same pot/rake split as entries. */
export const EXTRA_ROUND_USD = 0.1;

/**
 * Convert a whole-USD price to a token's base units. `decimals` is the token's own (18 for USDm,
 * 6 for USDC/USDT). Returns a bigint because 18-decimal amounts exceed Number.MAX_SAFE_INTEGER.
 *
 * Priced to the cent (2 dp) to avoid float drift: $0.35 * 100 = 35 exactly, then scaled up.
 */
export function toBaseUnits(usd: number, decimals: number): bigint {
  const cents = BigInt(Math.round(usd * 100));
  return cents * 10n ** BigInt(decimals) / 100n;
}
