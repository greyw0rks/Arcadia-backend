// server/clawback.ts — statistical clawback sweep.
//
// Batch job over cheat_flags: any wallet with >= CLAWBACK_FLAG_THRESHOLD hard "flagged" verdicts that
// isn't already blacklisted gets auto-blacklisted (blocks future play + settlement) and the operator
// is notified on Telegram with an Undo button. This catches serial cheaters that slip past a single
// borderline session — the pattern across many games is the giveaway.
//
// Idempotent: re-running skips already-blacklisted wallets. Trigger it via the admin API (manually or
// from an external cron / uptime pinger). DRY-RUN supported so you can preview before enforcing.

import { getRepeatOffenders } from "./cheatLog";
import { isBlacklisted, blacklistPlayer } from "./blacklist";
import { sendTelegramText } from "./telegram";
import type { ChainId } from "../lib/contract";

/** Hard-flag count at which a wallet is auto-blacklisted. Override via CLAWBACK_FLAG_THRESHOLD. */
export function clawbackThreshold(): number {
  const n = Number(process.env.CLAWBACK_FLAG_THRESHOLD);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 3;
}

export interface ClawbackResult {
  threshold: number;
  dryRun: boolean;
  candidates: number;      // repeat offenders at/over the threshold
  newlyBlacklisted: string[];
  alreadyBlacklisted: string[];
}

/**
 * Run the sweep. When `dryRun` is true, report who WOULD be blacklisted without changing anything.
 */
export async function runClawbackSweep(opts?: { chain?: ChainId; dryRun?: boolean }): Promise<ClawbackResult> {
  const chain = opts?.chain ?? ("celo" as ChainId);
  const dryRun = opts?.dryRun ?? false;
  const threshold = clawbackThreshold();

  const offenders = await getRepeatOffenders(threshold, chain);
  const newlyBlacklisted: string[] = [];
  const alreadyBlacklisted: string[] = [];

  for (const o of offenders) {
    if (isBlacklisted(o.player, chain)) {
      alreadyBlacklisted.push(o.player);
      continue;
    }
    if (dryRun) {
      newlyBlacklisted.push(o.player); // "would blacklist"
      continue;
    }
    await blacklistPlayer(
      o.player,
      chain,
      `clawback sweep: ${o.flaggedVerdicts} hard flags across ${o.games.length} game(s)`,
      undefined,
      "clawback-sweep"
    );
    newlyBlacklisted.push(o.player);

    // Notify the operator with an Undo button (reuses the Telegram callback's unblacklist action).
    sendTelegramText(
      `🧹 <b>Clawback auto-blacklist</b>\n<code>${o.player}</code>\n\n${o.flaggedVerdicts} hard flags (${o.totalFlags} total) across ${o.games.length} game(s). Last flagged ${new Date(o.lastFlaggedAt).toISOString()}.`,
      [[{ text: "♻️ Undo", callback_data: `cheat|unblacklist|${o.player.toLowerCase()}` }]]
    );
  }

  const result: ClawbackResult = {
    threshold,
    dryRun,
    candidates: offenders.length,
    newlyBlacklisted,
    alreadyBlacklisted,
  };

  if (!dryRun && newlyBlacklisted.length > 0) {
    console.warn(`[clawback] blacklisted ${newlyBlacklisted.length} wallet(s) at threshold ${threshold}:`, newlyBlacklisted);
  }
  return result;
}
