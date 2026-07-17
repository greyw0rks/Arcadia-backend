// server/bootstrap.ts — single-flight DB init + hydration
//
// Called at the top of any route that reads from a DB-backed store.
// Safe to call on every request — runs once, then no-ops.

import { initDb } from "./db";
import { hydrateProfiles } from "./profileStore";
import { hydrateGameHistory } from "./gameHistory";
import { hydrateDemoUsed } from "./sessions";
import { hydrateBlacklist } from "./blacklist";

let booted = false;
let bootPromise: Promise<void> | null = null;

export async function ensureBooted(): Promise<void> {
  if (booted) return;
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    await initDb();
    await Promise.all([hydrateProfiles(), hydrateGameHistory(), hydrateDemoUsed(), hydrateBlacklist()]);
    booted = true;
  })();
  return bootPromise;
}
