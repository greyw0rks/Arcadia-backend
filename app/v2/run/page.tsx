"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { isMiniPay } from "../../../lib/useArcade";

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
  const [state, setState] = useState<RunState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsEntry, setNeedsEntry] = useState(false);

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

  if (error === "NEEDS_CODE") {
    return (
      <main style={wrap}>
        <h1 style={h1}>Private Beta</h1>
        <div className="panel" style={panel}>
          <p style={{ marginBottom: 18, lineHeight: 1.5 }}>
            You need an invite code to join the weekly pool.
          </p>
          <a className="btn" href="/v2/redeem" style={{ ...btn, textDecoration: "none", display: "inline-block" }}>
            Enter invite code
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
      <h1 style={h1}>This Week</h1>
      <p style={{ marginBottom: 24, lineHeight: 1.5, color: "var(--text-dim)" }}>
        {state ? `Week ${state.weekId}` : "Loading…"} · everyone plays the same $1 entry, and the
        pot is split at the weekend by where you finish.
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

          <a className="btn" href="/games" style={{ ...btn, display: "block", textAlign: "center", textDecoration: "none" }}>
            Play a round
          </a>
        </>
      )}

      {needsEntry && (
        <div className="panel" style={{ ...panel, borderLeft: "10px solid var(--accent)" }}>
          <p style={{ fontWeight: 800, marginBottom: 8 }}>You need to buy in first</p>
          <p style={{ lineHeight: 1.5, marginBottom: 14 }}>
            Your $1 entry for this week hasn&apos;t arrived yet. If you just paid, give it a moment
            and try again.
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
