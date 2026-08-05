"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useConnect, useSendTransaction, usePublicClient } from "wagmi";
import { injected } from "wagmi/connectors";
import { isMiniPay, ARCADIA_ATTRIBUTION_SUFFIX, usePool } from "../../../lib/useArcade";
import { BUY_IN_USD } from "../../../server/v2/economy";

// V2 weekly run dashboard.
//
// The V2 economy is mostly backend — multipliers, bands, bust, weekly settlement. This screen is
// what makes it legible to a tester: where they stand, how hard the next round will be, and how
// close they are to bust.
//
// Three things it has to communicate that V1 never needed:
//   - the multiplier is a WEEKLY position, not a per-session score
//   - difficulty rises as the multiplier rises (§4.1), so a good run gets harder by design
//   - bust ends the run and costs the week's progress; a rebuy restarts at 1.0x
//
// MiniPay rules apply: no "gas"/"crypto" copy, no raw 0x as an identifier, Add Cash deeplink on
// insufficient balance. The whole /v2 tree is 404'd by proxy.ts unless V2_ENABLED.

const BP = 10_000;

interface RunState {
  weekId: number;
  run: { id: string; multiplierBp: number; band: string; openedBy: string } | null;
  roundsPlayedToday?: number;
  freeRoundsLeft?: number;
  checkedInToday?: boolean;
  needsCheckIn?: boolean;
  checkIn?: { to: `0x${string}`; data: `0x${string}`; value: "0x0" } | null;
  passMark: number;
  questionsPerRound: number;
  freeRoundsPerDay: number;
}

/** Human labels for the §4.1 bands. The internal names are terse; these explain the stake. */
const BAND_COPY: Record<string, { title: string; blurb: string; tone: string }> = {
  recovery: { title: "Recovery", blurb: "Easier questions while you climb back", tone: "#6BCDCF" },
  climbing: { title: "Climbing", blurb: "Still forgiving, but tightening", tone: "#A78BFA" },
  baseline: { title: "Baseline", blurb: "An even fight", tone: "#FFD93D" },
  ahead:    { title: "Ahead",    blurb: "Harder — you're above the pack", tone: "#FF6B9D" },
  strong:   { title: "Strong",   blurb: "Mostly extreme questions now", tone: "#FF6B9D" },
  elite:    { title: "Elite",    blurb: "The hardest set in the game", tone: "#FF6B9D" },
};

export default function RunPage() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient();
  const pool = usePool();
  const [state, setState] = useState<RunState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsEntry, setNeedsEntry] = useState(false);
  const [buyingIn, setBuyingIn] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  useEffect(() => {
    if (isMiniPay()) connect({ connector: injected() });
  }, [connect]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/v2/run");
      if (res.status === 401) {
        setError("NEEDS_CODE");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Could not load your week.");
        return;
      }
      setState(await res.json());
    } catch {
      setError("Could not reach the server.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openRun() {
    setBusy(true);
    setError(null);
    setNeedsEntry(false);
    try {
      const res = await fetch("/api/v2/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.status === 402) {
        // Paid-entry check rejected this — the player has no unused buy-in for the week.
        setNeedsEntry(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Could not start your week.");
        return;
      }
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  // Pay the weekly buy-in on-chain, then open the run. The backend verifies the ArcadiaPool entry
  // event before it opens the run (server/v2/entry.ts), so the pay MUST land first — hence the await
  // on the receipt inside pool.buyIn before openRun re-checks. `rebuy` when the player already
  // started the week and busted; `enter` otherwise.
  async function buyIn() {
    if (!state) return;
    setBuyingIn(true);
    setError(null);
    try {
      const kind = state.run ? "rebuy" : "enter";
      await pool.buyIn(state.weekId, BUY_IN_USD, kind);
      setNeedsEntry(false);
      await openRun();
    } catch (e) {
      // A user-rejected wallet prompt is not an error worth alarming over.
      const msg = String((e as Error)?.message ?? "");
      if (/reject|denied|cancell?ed/i.test(msg)) {
        setError(null);
      } else if (/insufficient|balance|transfer amount exceeds/i.test(msg)) {
        setError("Not enough USDm to buy in. Add funds and try again.");
      } else {
        setError("Buy-in didn't go through. Please try again.");
      }
    } finally {
      setBuyingIn(false);
    }
  }

  async function checkIn() {
    if (!state?.checkIn) return;
    setCheckingIn(true);
    setError(null);
    try {
      // Zero value — this opens the day, it never moves money. The attribution suffix rides along
      // as it does on every other Arcadia transaction.
      const hash = await sendTransactionAsync({
        to: state.checkIn.to,
        value: 0n,
        data: (state.checkIn.data + ARCADIA_ATTRIBUTION_SUFFIX) as `0x${string}`,
        // MiniPay processes legacy (type 0) only and manages its own fee currency.
        ...(isMiniPay() ? { type: "legacy" as const } : {}),
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      await load();
    } catch {
      setError("Could not open today. Please try again.");
    } finally {
      setCheckingIn(false);
    }
  }

  if (error === "NEEDS_CODE") {
    return (
      <main style={wrap}>
        <h1 style={h1}>Ranked</h1>
        <div className="panel" style={panel}>
          <p style={{ marginBottom: 18, lineHeight: 1.5 }}>
            Unlock access to join this week&apos;s pool — it takes one wallet check and moves no money.
          </p>
          <a className="btn" href="/v2/redeem" style={{ ...btn, textDecoration: "none", display: "inline-block" }}>
            Unlock access
          </a>
        </div>
      </main>
    );
  }

  const run = state?.run ?? null;
  const multiplier = run ? run.multiplierBp / BP : null;
  const band = run ? BAND_COPY[run.band] ?? BAND_COPY.baseline : null;
  // Bust is at zero, so distance from 1.0x in 0.10x steps is how many bad rounds remain.
  const roundsFromBust = run ? Math.ceil(run.multiplierBp / 1000) : 0;

  return (
    <main style={wrap}>
      <h1 style={h1}>Ranked</h1>
      <p style={{ marginBottom: 24, lineHeight: 1.5, color: "var(--text-dim)" }}>
        {state ? `Week ${state.weekId}` : "Loading…"} · everyone plays the same $0.50 USDm entry, and the
        pot is split at the weekend by where you finish. (Prefer instant play? That&apos;s Casual.)
      </p>

      {!run && state && (
        <div className="panel" style={panel}>
          <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 10 }}>You haven&apos;t started</h2>
          <p style={{ marginBottom: 18, lineHeight: 1.5 }}>
            Buy in once for the week to begin at 1.00x. Answer{" "}
            <strong>{state.passMark} of {state.questionsPerRound}</strong> correctly in a round to gain
            +0.10x; miss it and you lose 0.10x. Reach zero and the run is over.
          </p>
          <button
            className="btn"
            onClick={openRun}
            disabled={busy || !isConnected}
            style={{ ...btn, width: "100%" }}
          >
            {busy ? "Starting…" : "Start this week"}
          </button>
          {!isConnected && (
            <p style={{ marginTop: 12, fontSize: 14 }}>Connect your wallet to begin.</p>
          )}
        </div>
      )}

      {run && band && (
        <>
          <div className="panel" style={{ ...panel, textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)" }}>
              Your multiplier
            </div>
            <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.1, margin: "6px 0 2px" }}>
              {multiplier!.toFixed(2)}x
            </div>
            <div style={{ fontSize: 14, color: "var(--text-dim)" }}>
              {roundsFromBust} bad {roundsFromBust === 1 ? "round" : "rounds"} from bust
            </div>
          </div>

          <div className="panel" style={{ ...panel, borderLeft: `10px solid ${band.tone}` }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)" }}>
              Difficulty
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, margin: "4px 0 6px" }}>{band.title}</div>
            <p style={{ lineHeight: 1.5, marginBottom: 0 }}>{band.blurb}</p>
            <p style={{ marginTop: 10, fontSize: 14, color: "var(--text-dim)", lineHeight: 1.5 }}>
              Questions get harder as your multiplier climbs — and easier if you fall back. It keeps
              a strong week competitive rather than runaway.
            </p>
          </div>

          <div className="panel" style={panel}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontWeight: 800 }}>Free rounds left today</span>
              <span style={{ fontWeight: 900 }}>
                {state?.freeRoundsLeft ?? 0} / {state?.freeRoundsPerDay ?? 10}
              </span>
            </div>
            <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 0 }}>
              Extra rounds after that can only help — they can raise your multiplier but never lower
              it.
            </p>
          </div>

          {state?.needsCheckIn ? (
            <div className="panel" style={{ ...panel, borderLeft: "10px solid #6BCDCF" }}>
              <p style={{ fontWeight: 900, fontSize: 20, marginBottom: 8 }}>Open today</p>
              <p style={{ lineHeight: 1.5, marginBottom: 14 }}>
                Confirm once to unlock today&apos;s {state.freeRoundsPerDay} free rounds. It costs
                nothing — no money leaves your wallet.
              </p>
              <button
                className="btn"
                onClick={checkIn}
                disabled={checkingIn || !isConnected || !state.checkIn}
                style={{ ...btn, width: "100%" }}
              >
                {checkingIn ? "Opening…" : "Open today"}
              </button>
              <p style={{ marginTop: 12, fontSize: 14, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 0 }}>
                Once a day, so your streak is a matter of public record rather than something we
                assert on your behalf.
              </p>
            </div>
          ) : (
            <a className="btn" href="/v2/play" style={{ ...btn, display: "block", textAlign: "center", textDecoration: "none" }}>
              Play a round
            </a>
          )}
        </>
      )}

      {needsEntry && (
        <div className="panel" style={{ ...panel, borderLeft: "10px solid var(--accent)" }}>
          <p style={{ fontWeight: 800, marginBottom: 8 }}>Buy in for the week</p>
          <p style={{ lineHeight: 1.5, marginBottom: 14 }}>
            One $0.50 USDm buy-in enters you into this week&apos;s pool and starts you at 1.00x. The
            pot is split at the weekend by where you finish.
          </p>
          <button
            className="btn"
            onClick={buyIn}
            disabled={buyingIn || !isConnected}
            style={{ ...btn, width: "100%" }}
          >
            {buyingIn ? "Confirming…" : "Buy in — $0.50 USDm"}
          </button>
          {!isConnected && (
            <p style={{ marginTop: 12, fontSize: 14 }}>Connect your wallet to buy in.</p>
          )}
          <p style={{ marginTop: 14, fontSize: 14, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 6 }}>
            Not enough USDm?
          </p>
          <a
            className="btn"
            href="https://link.minipay.xyz/add_cash?tokens=USDm,USDC,USDT"
            style={{ ...btn, display: "inline-block", textDecoration: "none", fontSize: 15, padding: "12px 20px" }}
          >
            Deposit
          </a>
        </div>
      )}

      {error && error !== "NEEDS_CODE" && (
        <p style={{ marginTop: 18, fontWeight: 700, color: "#c0392b" }} role="alert">
          {error}
        </p>
      )}

      {address && (
        <p style={{ marginTop: 28, fontSize: 13, color: "var(--text-dim)" }}>
          Playing as {address.slice(0, 6)}…{address.slice(-4)}
        </p>
      )}
    </main>
  );
}

const wrap: React.CSSProperties = { maxWidth: 560, margin: "0 auto", padding: "32px 20px 80px" };
const h1: React.CSSProperties = { fontSize: 32, fontWeight: 900, textTransform: "uppercase", marginBottom: 8 };
const panel: React.CSSProperties = { padding: 24, marginTop: 0, marginBottom: 18 };
const btn: React.CSSProperties = { fontSize: 17, padding: "16px 20px" };
