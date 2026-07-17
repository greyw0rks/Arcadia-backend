// server/telegram.ts — Telegram cheat alerts with inline Ignore / Blacklist buttons.
//
// On a flagged session we send a Telegram message to the operator with two inline buttons. Tapping a
// button makes Telegram POST to our callback webhook (app/api/telegram/callback), which executes the
// decision (ignore = dismiss; blacklist = ban the wallet) and edits the message to record it.
//
// Setup (one-time):
//   1. Create a bot via @BotFather → get TELEGRAM_BOT_TOKEN.
//   2. Get your chat id (message the bot, then read /getUpdates, or use @userinfobot) → TELEGRAM_CHAT_ID.
//   3. Set a random TELEGRAM_WEBHOOK_SECRET.
//   4. Register the webhook (once), pointing Telegram at our callback with the secret header:
//        curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//          -d "url=https://<backend>/api/telegram/callback" \
//          -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
//
// All sends are fire-and-forget: a Telegram outage never blocks gameplay.

import type { Classification } from "./anticheat";

const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

export interface TelegramCheatAlert {
  player: string;
  gameId: string;
  gameTitle: string;
  sessionId: string;
  chain: string;
  stake?: number;
  unit?: string;
  multiplierBp: number;
  enforced: boolean;
  watched?: boolean;
  classification: Classification;
}

function esc(s: string): string {
  // Minimal HTML escaping for Telegram parse_mode=HTML.
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function messageHtml(a: TelegramCheatAlert): string {
  const s = a.classification.stats;
  const money = a.stake != null ? `${a.stake} ${a.unit ?? ""}`.trim() : "n/a";
  const reasons = a.classification.reasons.map((r) => `• ${esc(r)}`).join("\n");
  const header = a.enforced ? "🚫 <b>Cheat BLOCKED</b>" : "🚨 <b>Suspected cheating</b>";
  const watchLine = a.watched ? "👁️ <b>ON WATCHLIST</b>\n" : "";
  return [
    `${watchLine}${header} (${esc(a.classification.verdict)})`,
    ``,
    `<b>Game:</b> ${esc(a.gameTitle)}`,
    `<b>Wallet:</b> <code>${esc(a.player)}</code>`,
    `<b>Stake:</b> ${esc(money)} · final ${(a.multiplierBp / 10000).toFixed(1)}x`,
    `<b>Timing:</b> ${s.answers} answers, ${(s.accuracy * 100).toFixed(0)}% correct, mean ${s.meanMs}ms, min ${s.minMs}ms`,
    reasons ? `\n${reasons}` : "",
    `\n<b>Session:</b> <code>${esc(a.sessionId)}</code>`,
  ].filter(Boolean).join("\n");
}

// callback_data is limited to 64 bytes by Telegram — too small for a full 66-char session id +
// address. So we encode only an action + the session id's short prefix and full player address is
// looked up from the DB on callback via the session id. Format: "act:<action>:<sessionId>".
// Session ids are 32-byte hex (66 chars) which alone exceeds 64 bytes, so we pass a compact ref:
// the callback handler resolves the wallet from cheat_flags by session id. We therefore send the
// session id truncated is NOT safe; instead we store the mapping and pass a short token.
//
// Simplest robust approach: pass action + the LAST 40 hex chars of the session id is still >64 with
// prefix. Instead we pass action + player address (42 chars) which fits: "cheat|<action>|<addr>".
function buttons(a: TelegramCheatAlert) {
  const addr = a.player.toLowerCase();
  return {
    inline_keyboard: [
      [
        { text: "✅ Ignore", callback_data: `cheat|ignore|${addr}` },
        { text: "🚫 Blacklist", callback_data: `cheat|blacklist|${addr}` },
      ],
    ],
  };
}

/** Send a Telegram cheat alert with Ignore/Blacklist buttons. Fire-and-forget. */
export function sendTelegramCheatAlert(a: TelegramCheatAlert): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // not configured

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  void fetch(API(token, "sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: messageHtml(a),
      parse_mode: "HTML",
      reply_markup: buttons(a),
      disable_web_page_preview: true,
    }),
    signal: controller.signal,
  })
    .then(async (r) => {
      if (!r.ok) console.warn("[telegram] sendMessage failed:", r.status, (await r.text()).slice(0, 200));
    })
    .catch((e) => console.warn("[telegram] send error:", (e as Error).message))
    .finally(() => clearTimeout(timer));
}

/** Send an arbitrary HTML message with an optional inline keyboard. Fire-and-forget. */
export function sendTelegramText(
  html: string,
  inlineKeyboard?: { text: string; callback_data: string }[][]
): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (inlineKeyboard) body.reply_markup = { inline_keyboard: inlineKeyboard };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  void fetch(API(token, "sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .catch((e) => console.warn("[telegram] send error:", (e as Error).message))
    .finally(() => clearTimeout(timer));
}

/** Answer a callback query (removes the "loading" spinner on the tapped button). Fire-and-forget. */
export function answerCallbackQuery(callbackQueryId: string, text: string): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  void fetch(API(token, "answerCallbackQuery"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  }).catch(() => {});
}

/** Edit a message's text (used to record the operator's decision on the alert). Optionally sets an
 *  inline keyboard (e.g. an Undo button). Fire-and-forget. */
export function editMessageText(
  chatId: number | string,
  messageId: number,
  html: string,
  inlineKeyboard?: { text: string; callback_data: string }[][]
): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const bodyObj: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  // Always set reply_markup: an empty keyboard REMOVES the old buttons; a provided one replaces them.
  bodyObj.reply_markup = { inline_keyboard: inlineKeyboard ?? [] };
  void fetch(API(token, "editMessageText"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bodyObj),
  }).catch(() => {});
}
