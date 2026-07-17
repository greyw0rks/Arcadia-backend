// server/alerts.ts — outbound cheat-detection notifications.
//
// When a session is flagged by the anti-cheat classifier, send an alert so the operator is notified
// in real time. Delivery is a webhook set via ALERT_WEBHOOK_URL — works with Discord, Slack, or any
// generic JSON webhook. Fire-and-forget: a delivery failure NEVER blocks or delays gameplay.
//
// Discord: paste a channel webhook URL (…/api/webhooks/…). We detect it and send Discord's {content}.
// Slack:   paste an incoming-webhook URL (hooks.slack.com/…). We send Slack's {text}.
// Other:   any URL gets a generic JSON body with the full structured payload.

import type { Classification } from "./anticheat";
import { sendTelegramCheatAlert } from "./telegram";

export interface CheatAlert {
  player: string;
  gameId: string;
  gameTitle: string;
  sessionId: string;
  chain: string;
  stake?: number;
  unit?: string;
  multiplierBp: number;
  enforced: boolean; // true = settlement was actually denied; false = detect-only (still paid)
  watched?: boolean; // wallet is on the watchlist → raise a louder alert
  classification: Classification;
}

function human(a: CheatAlert): string {
  const s = a.classification.stats;
  const reasons = a.classification.reasons.map((r) => `• ${r}`).join("\n");
  const money = a.stake != null ? `${a.stake} ${a.unit ?? ""}`.trim() : "n/a";
  return [
    `🚨 Arcadia cheat ${a.enforced ? "BLOCKED" : "DETECTED"} (${a.classification.verdict})`,
    `Game: ${a.gameTitle} (${a.gameId})`,
    `Wallet: ${a.player}`,
    `Stake: ${money} · final ${(a.multiplierBp / 10000).toFixed(1)}x`,
    `Timing: ${s.answers} answers, ${(s.accuracy * 100).toFixed(0)}% correct, mean ${s.meanMs}ms, min ${s.minMs}ms, ${s.subFloorCount} sub-floor`,
    reasons ? `Flags:\n${reasons}` : "",
    `Session: ${a.sessionId}`,
    a.enforced ? "Settlement DENIED — funds refundable via cancelExpired." : "Detect-only: payout allowed (ANTICHEAT_ENFORCE off).",
  ].filter(Boolean).join("\n");
}

/** Send a cheat alert to ALERT_WEBHOOK_URL if configured. Fire-and-forget; errors are swallowed. */
export function sendCheatAlert(a: CheatAlert): void {
  // Telegram (with Ignore/Blacklist buttons) is the interactive channel; send it in parallel.
  sendTelegramCheatAlert({
    player: a.player,
    gameId: a.gameId,
    gameTitle: a.gameTitle,
    sessionId: a.sessionId,
    chain: a.chain,
    stake: a.stake,
    unit: a.unit,
    multiplierBp: a.multiplierBp,
    enforced: a.enforced,
    watched: a.watched,
    classification: a.classification,
  });

  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return; // no generic webhook — Telegram (above) and stdout logging still happen

  const text = human(a);
  let body: string;
  if (url.includes("discord.com") || url.includes("discordapp.com")) {
    body = JSON.stringify({ content: text.slice(0, 1900) }); // Discord 2000-char limit
  } else if (url.includes("hooks.slack.com")) {
    body = JSON.stringify({ text });
  } else {
    body = JSON.stringify({ text, alert: a }); // generic: human text + full structured payload
  }

  // Fire-and-forget with a short timeout; never throw into the caller.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    signal: controller.signal,
  })
    .catch((e) => console.warn("[alerts] cheat alert delivery failed:", (e as Error).message))
    .finally(() => clearTimeout(timer));
}
