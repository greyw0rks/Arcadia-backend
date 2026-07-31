// server/clawbackScheduler.ts — automatic trigger for the clawback sweep.
//
// runClawbackSweep() was written to be called by hand (admin API or Telegram) and so never ran
// unless someone remembered. This gives it a heartbeat.
//
// Two safety properties matter more than the scheduling itself:
//
//   1. DRY-RUN BY DEFAULT. The sweep blacklists wallets, which blocks play and settlement. Its
//      threshold (3 hard flags) sits on top of anti-cheat thresholds that have never been validated
//      against real play — see docs/V2_ANTICHEAT_AUDIT.md. Until they are, an unattended sweep that
//      blacklists automatically is a false-positive amplifier: it turns three uncertain judgements
//      into one certain ban, with no human in the loop. So the default is to REPORT candidates to
//      the operator and let them press Blacklist. Set CLAWBACK_AUTO_ENFORCE=true to actually ban.
//
//   2. BACKLOG GUARD. getRepeatOffenders() has no time window — it counts every flag ever recorded.
//      Flags have been accumulating since 2026-07-17 under detect-only operation, so the first
//      automatic run would act on the entire history at once. The first run is therefore always a
//      dry run regardless of configuration, and it says so in the alert.
//
// Single-replica assumption: the session store already assumes one always-on process (see
// server/sessions.ts), so an in-process timer is consistent with the rest of the service. A second
// replica would double-run the sweep — harmless because it is idempotent (already-blacklisted
// wallets are skipped) but it would double the Telegram alerts.

import { runClawbackSweep, clawbackThreshold } from "./clawback";
import { sendTelegramText } from "./telegram";

const DEFAULT_INTERVAL_MIN = 360; // 6h — the signal is a pattern across sessions, not a live event

let timer: ReturnType<typeof setInterval> | null = null;
let firstRunDone = false;

/** Minutes between sweeps. Override with CLAWBACK_SWEEP_MINUTES; 0 or unset disables the scheduler. */
export function sweepIntervalMinutes(): number {
  const raw = process.env.CLAWBACK_SWEEP_MINUTES;
  if (raw === undefined) return DEFAULT_INTERVAL_MIN;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_INTERVAL_MIN;
}

/** True when the scheduler may actually blacklist. Default false — report only. */
export function autoEnforceOn(): boolean {
  return String(process.env.CLAWBACK_AUTO_ENFORCE).toLowerCase() === "true";
}

/**
 * Run one scheduled sweep. Exported for the admin API and tests; `force` skips the first-run
 * dry-run guard so an operator can trigger a real run on demand.
 */
export async function scheduledSweep(opts?: { force?: boolean }): Promise<void> {
  // The first run after a restart is always a preview: it is the one most likely to face a large
  // backlog of flags recorded while nobody was acting on them.
  const dryRun = !autoEnforceOn() || (!firstRunDone && !opts?.force);
  firstRunDone = true;

  try {
    const result = await runClawbackSweep({ dryRun });
    if (result.newlyBlacklisted.length === 0) return; // nothing to say

    const threshold = clawbackThreshold();
    if (dryRun) {
      const why = autoEnforceOn()
        ? "first run since restart — previewing the backlog before acting"
        : "auto-enforce is off (CLAWBACK_AUTO_ENFORCE)";
      sendTelegramText(
        `🧹 <b>Clawback sweep — ${result.newlyBlacklisted.length} candidate(s)</b>\n` +
          `${why}.\n\n` +
          result.newlyBlacklisted.map((p) => `<code>${p}</code>`).join("\n") +
          `\n\nAt/over ${threshold} hard flags. Review before blacklisting — ` +
          `the flag thresholds are not yet calibrated against real play.`,
        result.newlyBlacklisted.slice(0, 5).map((p) => [
          { text: `🚫 Blacklist ${p.slice(0, 8)}…`, callback_data: `cheat|blacklist|${p.toLowerCase()}` },
        ])
      );
    }
    // A non-dry run already alerts per wallet from inside runClawbackSweep().
  } catch (err) {
    console.warn("[clawback] scheduled sweep failed:", (err as Error).message);
  }
}

/**
 * Start the periodic sweep. Idempotent — safe to call from ensureBooted() on every request.
 * No-op when the interval is 0.
 */
export function startClawbackScheduler(): void {
  if (timer) return;
  const minutes = sweepIntervalMinutes();
  if (minutes === 0) {
    console.log("[clawback] scheduler disabled (CLAWBACK_SWEEP_MINUTES=0)");
    return;
  }

  timer = setInterval(() => void scheduledSweep(), minutes * 60_000);
  // Don't hold the process open for a background sweep.
  timer.unref?.();

  console.log(
    `[clawback] scheduler started — every ${minutes}m, ` +
      `${autoEnforceOn() ? "auto-enforce ON (first run still previews)" : "report-only"}`
  );
}

/** Stop the scheduler. For tests and graceful shutdown. */
export function stopClawbackScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
