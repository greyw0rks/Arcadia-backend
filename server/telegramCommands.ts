// server/telegramCommands.ts — text-command router for the Telegram admin bot.
//
// The bot is two-way: besides the Ignore/Blacklist buttons on cheat alerts, an allowlisted operator
// can type commands to query the database (profiles, plays, flags, offenders) and manage the
// blacklist / watchlist. Only user ids in TELEGRAM_ADMIN_IDS (comma-separated) may run commands.
//
// Returns an HTML string to send back. Pure-ish (touches DB via the query modules); no direct I/O —
// the callback route sends the reply.

import { isAddress } from "viem";
import type { ChainId } from "../lib/contract";
import { getPlayerProfile } from "./leaderboard";
import { getPlaysByAddress } from "./cooldown";
import { listFlags, getRepeatOffenders } from "./cheatLog";
import { blacklistPlayer, unblacklistPlayer, listBlacklist, isBlacklisted } from "./blacklist";
import { watchPlayer, unwatchPlayer, listWatchlist, isWatched } from "./watchlist";
import { runClawbackSweep } from "./clawback";

const CHAIN = "celo" as ChainId;

/** Comma-separated allowlist of Telegram user ids permitted to run commands. */
export function isAdminUser(userId: number | string | undefined): boolean {
  if (userId == null) return false;
  const raw = process.env.TELEGRAM_ADMIN_IDS ?? "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.includes(String(userId));
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function short(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
function needAddr(arg: string | undefined): string | null {
  return arg && isAddress(arg) ? arg : null;
}

const HELP = [
  "<b>Arcadia admin bot</b>",
  "",
  "<b>Lookup</b>",
  "/profile &lt;addr&gt; — stats for a wallet",
  "/plays &lt;addr&gt; — games a wallet played",
  "",
  "<b>Anti-cheat</b>",
  "/flags [flagged|suspect] — recent flags",
  "/offenders [min] — repeat offenders",
  "/sweep [dry] — run clawback (dry = preview)",
  "",
  "<b>Blacklist</b> (blocks play + settle)",
  "/blacklist &lt;addr&gt; [reason] · /unblacklist &lt;addr&gt; · /blacklist",
  "",
  "<b>Watchlist</b> (observe, don't block)",
  "/watch &lt;addr&gt; [note] · /unwatch &lt;addr&gt; · /watchlist",
].join("\n");

/**
 * Handle a text command. `text` is the raw message (e.g. "/profile 0xabc..."). `who` is the operator
 * label used in audit trails. Returns the HTML reply.
 */
export async function handleCommand(text: string, who: string): Promise<string> {
  const parts = text.trim().split(/\s+/);
  // Strip a bot @mention suffix (e.g. "/profile@MyBot").
  const cmd = (parts[0] ?? "").toLowerCase().split("@")[0];
  const args = parts.slice(1);

  switch (cmd) {
    case "/start":
    case "/help":
      return HELP;

    case "/profile": {
      const addr = needAddr(args[0]);
      if (!addr) return "Usage: /profile &lt;address&gt;";
      const p = await getPlayerProfile(addr);
      const s = p.stats;
      const flags = [isBlacklisted(addr, CHAIN) ? "🚫 blacklisted" : "", isWatched(addr, CHAIN) ? "👁️ watched" : ""].filter(Boolean).join(" · ");
      return [
        `<b>Profile</b> <code>${esc(addr)}</code>`,
        p.username ? `Name: ${esc(p.username)}` : "",
        flags,
        `Games: ${s.totalGamesPlayed} played, ${s.totalGamesWon} won`,
        `Staked: ${s.totalStaked} · Winnings: ${s.totalWinnings} · Losses: ${s.totalLosses}`,
        `Best multiplier: ${(s.highestMultiplier / 10000).toFixed(1)}x · Longest streak: ${s.longestStreak}`,
        s.favoriteGame ? `Favorite: ${esc(s.favoriteGame)}` : "",
      ].filter(Boolean).join("\n");
    }

    case "/plays": {
      const addr = needAddr(args[0]);
      if (!addr) return "Usage: /plays &lt;address&gt;";
      const plays = await getPlaysByAddress(addr, CHAIN);
      if (plays.length === 0) return `No plays recorded for <code>${esc(addr)}</code>.`;
      const counts: Record<string, number> = {};
      for (const p of plays) counts[p.gameId] = (counts[p.gameId] ?? 0) + 1;
      const summary = Object.entries(counts).map(([g, n]) => `${esc(g)}×${n}`).join(", ");
      const recent = plays.slice(0, 10).map((p) => {
        const when = new Date(p.playedAt).toISOString().slice(0, 16).replace("T", " ");
        const bet = p.isDemo ? "demo" : `${p.stake ?? "?"} ${p.unit ?? ""}`.trim();
        return `• ${esc(p.gameId)} — ${bet} — ${when}`;
      }).join("\n");
      return [`<b>Plays</b> <code>${esc(addr)}</code> (${plays.length} total)`, summary, "", recent].join("\n");
    }

    case "/flags": {
      const verdict = args[0] === "flagged" || args[0] === "suspect" ? args[0] : undefined;
      const rows = await listFlags({ verdict, chain: CHAIN, limit: 15 });
      if (rows.length === 0) return "No flags recorded.";
      const lines = rows.map((r) => {
        const when = new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ");
        return `• ${r.verdict === "flagged" ? "🚩" : "⚠️"} <code>${short(r.player)}</code> ${esc(r.gameId)} — ${(r.stats.accuracy * 100).toFixed(0)}%/${r.stats.meanMs}ms — ${when}`;
      });
      return [`<b>Recent flags</b>${verdict ? ` (${verdict})` : ""}`, ...lines].join("\n");
    }

    case "/offenders": {
      const min = args[0] ? Math.max(1, parseInt(args[0], 10) || 2) : 2;
      const off = await getRepeatOffenders(min, CHAIN);
      if (off.length === 0) return `No wallets with ≥${min} hard flags.`;
      const lines = off.slice(0, 20).map((o) => {
        const banned = isBlacklisted(o.player, CHAIN) ? " 🚫" : "";
        return `• <code>${short(o.player)}</code> — ${o.flaggedVerdicts} hard / ${o.totalFlags} total, ${o.games.length} game(s)${banned}`;
      });
      return [`<b>Repeat offenders</b> (≥${min} hard flags)`, ...lines].join("\n");
    }

    case "/sweep": {
      const dry = args[0] === "dry" || args[0] === "dryrun";
      const r = await runClawbackSweep({ dryRun: dry });
      return [
        `<b>Clawback sweep</b> ${dry ? "(dry run)" : ""}`,
        `Threshold: ${r.threshold} hard flags`,
        `Candidates: ${r.candidates}`,
        `${dry ? "Would blacklist" : "Newly blacklisted"}: ${r.newlyBlacklisted.length}`,
        r.newlyBlacklisted.length ? r.newlyBlacklisted.map((a) => `• <code>${short(a)}</code>`).join("\n") : "",
        `Already blacklisted: ${r.alreadyBlacklisted.length}`,
      ].filter(Boolean).join("\n");
    }

    case "/blacklist": {
      if (args.length === 0) {
        const list = await listBlacklist();
        if (list.length === 0) return "Blacklist is empty.";
        const lines = list.slice(0, 30).map((e) => `• <code>${esc(e.address)}</code>${e.reason ? ` — ${esc(e.reason)}` : ""}`);
        return [`<b>Blacklist</b> (${list.length})`, ...lines].join("\n");
      }
      const addr = needAddr(args[0]);
      if (!addr) return "Usage: /blacklist &lt;address&gt; [reason]  (or /blacklist to list)";
      const reason = args.slice(1).join(" ") || "Telegram command";
      await blacklistPlayer(addr, CHAIN, reason, undefined, who);
      return `🚫 Blacklisted <code>${esc(addr)}</code>\nReason: ${esc(reason)}`;
    }

    case "/unblacklist": {
      const addr = needAddr(args[0]);
      if (!addr) return "Usage: /unblacklist &lt;address&gt;";
      await unblacklistPlayer(addr, CHAIN);
      return `♻️ Un-blacklisted <code>${esc(addr)}</code>`;
    }

    case "/watch": {
      const addr = needAddr(args[0]);
      if (!addr) return "Usage: /watch &lt;address&gt; [note]  (or /watchlist to list)";
      const note = args.slice(1).join(" ") || undefined;
      await watchPlayer(addr, CHAIN, note, who);
      return `👁️ Watching <code>${esc(addr)}</code>${note ? `\nNote: ${esc(note)}` : ""}`;
    }

    case "/unwatch": {
      const addr = needAddr(args[0]);
      if (!addr) return "Usage: /unwatch &lt;address&gt;";
      await unwatchPlayer(addr, CHAIN);
      return `Removed <code>${esc(addr)}</code> from the watchlist.`;
    }

    case "/watchlist": {
      const list = await listWatchlist();
      if (list.length === 0) return "Watchlist is empty.";
      const lines = list.slice(0, 30).map((e) => `• <code>${esc(e.address)}</code>${e.note ? ` — ${esc(e.note)}` : ""}`);
      return [`<b>Watchlist</b> (${list.length})`, ...lines].join("\n");
    }

    default:
      return cmd.startsWith("/") ? `Unknown command ${esc(cmd)}. Try /help.` : "";
  }
}
