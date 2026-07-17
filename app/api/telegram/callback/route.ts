import { NextRequest, NextResponse } from "next/server";
import { ensureBooted } from "../../../../server/bootstrap";
import { blacklistPlayer, unblacklistPlayer } from "../../../../server/blacklist";
import { answerCallbackQuery, editMessageText, sendTelegramText } from "../../../../server/telegram";
import { handleCommand, isAdminUser } from "../../../../server/telegramCommands";

// POST /api/telegram/callback
// Telegram's webhook target for inline-button taps on cheat alerts. Registered once via setWebhook
// with a secret_token; Telegram sends that token back in the X-Telegram-Bot-Api-Secret-Token header,
// which we verify to reject spoofed calls.
//
// callback_data format (set in server/telegram.ts): "cheat|<action>|<address>"
//   action = "ignore"    → dismiss the alert (no state change)
//   action = "blacklist" → ban the wallet (blocks future sessions + settlement)
//
// We always answer the callback query and edit the original message to record the decision.
export async function POST(req: NextRequest) {
  // Verify the shared secret so only Telegram (configured with our secret) can trigger actions.
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureBooted();

  let update: any;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // ignore malformed; ack so Telegram doesn't retry forever
  }

  const cb = update?.callback_query;
  if (!cb) {
    // Not a button tap — check for a text command message from an allowlisted admin.
    const msg = update?.message;
    const text: string = msg?.text ?? "";
    if (text.startsWith("/")) {
      const fromId = msg?.from?.id;
      if (!isAdminUser(fromId)) {
        // Silently ignore commands from non-admins (don't leak that the bot exists).
        return NextResponse.json({ ok: true });
      }
      const who = msg.from?.username ? `@${msg.from.username}` : String(fromId);
      try {
        const reply = await handleCommand(text, who);
        if (reply) sendTelegramText(reply);
      } catch (e) {
        console.warn("[telegram] command failed:", (e as Error).message);
        sendTelegramText("⚠️ Command failed — check server logs.");
      }
    }
    return NextResponse.json({ ok: true });
  }

  const data: string = cb.data ?? "";
  const parts = data.split("|");
  const chain = "celo" as const;

  // Expect "cheat|<action>|<address>".
  if (parts[0] !== "cheat" || parts.length < 3) {
    answerCallbackQuery(cb.id, "Unrecognized action");
    return NextResponse.json({ ok: true });
  }

  const action = parts[1];
  const address = parts[2];
  const who = cb.from?.username ? `@${cb.from.username}` : String(cb.from?.id ?? "operator");
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const originalHtml: string = cb.message?.text ? cb.message.text : "";

  try {
    if (action === "blacklist") {
      await blacklistPlayer(address, chain, "Telegram cheat alert", undefined, who);
      answerCallbackQuery(cb.id, "Wallet blacklisted");
      if (chatId && messageId) {
        editMessageText(
          chatId,
          messageId,
          `🚫 <b>BLACKLISTED</b> by ${who}\n<code>${address}</code>\n\nThis wallet can no longer play or settle.`,
          [[{ text: "♻️ Undo", callback_data: `cheat|unblacklist|${address}` }]]
        );
      }
    } else if (action === "ignore") {
      answerCallbackQuery(cb.id, "Dismissed");
      if (chatId && messageId) {
        editMessageText(chatId, messageId, `✅ <b>Ignored</b> by ${who}\n<code>${address}</code>\n\nNo action taken.`);
      }
    } else if (action === "unblacklist") {
      await unblacklistPlayer(address, chain);
      answerCallbackQuery(cb.id, "Blacklist removed");
      if (chatId && messageId) {
        editMessageText(chatId, messageId, `♻️ <b>Un-blacklisted</b> by ${who}\n<code>${address}</code>\n\nThis wallet can play again.`);
      }
    } else {
      answerCallbackQuery(cb.id, "Unknown action");
    }
  } catch (e) {
    answerCallbackQuery(cb.id, "Action failed — check server logs");
    console.warn("[telegram] callback action failed:", (e as Error).message);
  }

  return NextResponse.json({ ok: true });
}
