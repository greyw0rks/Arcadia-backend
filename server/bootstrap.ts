// server/bootstrap.ts — single-flight DB init + hydration
//
// Called at the top of any route that reads from a DB-backed store.
// Safe to call on every request — runs once, then no-ops.

import { initDb } from "./db";
import { hydrateProfiles } from "./profileStore";
import { hydrateGameHistory } from "./gameHistory";
import { hydrateDemoUsed } from "./sessions";
import { hydrateBlacklist } from "./blacklist";
import { hydrateWatchlist } from "./watchlist";
import { hydrateAccessGate } from "./accessGate";
import { V2_ENABLED } from "./v2/flag";
import { initV2Schema } from "./v2/schema";
import { startClawbackScheduler } from "./clawbackScheduler";

let booted = false;
let bootPromise: Promise<void> | null = null;

// Staging must never point at the production database. PROD_DB_HOST_GUARD holds a substring of the
// prod Neon host (set it on the STAGING deploy only); if the staging DATABASE_URL contains it, the
// deploy is misconfigured and refuses to boot rather than silently writing V2 tables into prod.
function assertNotProdDb(): void {
  const guard = process.env.PROD_DB_HOST_GUARD;
  if (!guard) return;
  if (process.env.ARCADIA_ENV === "staging" && process.env.DATABASE_URL?.includes(guard)) {
    throw new Error(
      "[bootstrap] FATAL: staging deploy is pointed at the production database — refusing to start"
    );
  }
}

export async function ensureBooted(): Promise<void> {
  if (booted) return;
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    assertNotProdDb();
    await initDb();
    if (V2_ENABLED) await initV2Schema(); // V2 tables exist only where the flag is on
    await Promise.all([
      hydrateProfiles(),
      hydrateGameHistory(),
      hydrateDemoUsed(),
      hydrateBlacklist(),
      hydrateWatchlist(),
      ...(V2_ENABLED ? [hydrateAccessGate()] : []),
    ]);
    // Started after hydration: the sweep reads the blacklist to skip already-banned wallets, so it
    // must not run against an empty in-memory mirror.
    startClawbackScheduler();
    booted = true;
  })();
  return bootPromise;
}
