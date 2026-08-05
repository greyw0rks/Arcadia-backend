"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// V2 round: 15 questions, one ±0.10x move.
//
// Deliberately separate from /play/[game], which is V1's flow — that one takes a stake, waits for an
// on-chain funding gate, and settles per session. A V2 round is paid for by the weekly entry and
// banks into a weekly position instead, so the two share the question-serving API and nothing else.
//
// The design problem this screen solves: the player must feel a round as ONE outcome, not fifteen.
// Under §4.2 individual answers no longer move the banked multiplier — only crossing the pass mark
// does. So progress is shown against the pass mark throughout, and the multiplier only moves at the
// end.

const BP = 10_000;

interface RoundView {
  roundIndex: number;
  totalRounds: number;
  prompt: string;
  imageUrl?: string;
  imageStyle?: "hard" | "extreme";
  options: string[];
  timeLimitSec: number;
}

interface BankResult {
  correct: number;
  questionsPerRound: number;
  passed: boolean;
  deltaBp: number;
  multiplierBp: number;
  band: string;
  busted: boolean;
  purchased: boolean;
  freeRoundsLeft: number;
  passMark: number;
  replayed: boolean;
}

type Phase = "loading" | "playing" | "reveal" | "banking" | "done" | "error";

export default function V2PlayPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [game, setGame] = useState<{ title: string; thumbnail: string } | null>(null);
  const [round, setRound] = useState<RoundView | null>(null);
  const [passMark, setPassMark] = useState(9);
  const [correctSoFar, setCorrectSoFar] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [result, setResult] = useState<BankResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── start ────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/v2/run/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        if (res.status === 401) {
          router.replace("/v2/redeem");
          return;
        }
        if (res.status === 409) {
          router.replace("/v2/run");
          return;
        }
        if (res.status === 428) {
          // Day not opened yet. The check-in button lives on the run dashboard.
          router.replace("/v2/run");
          return;
        }
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          setError(b?.error ?? "Could not start a round.");
          setPhase("error");
          return;
        }
        const data = await res.json();
        setSessionId(data.sessionId);
        setGame(data.game);
        await loadRound(data.sessionId);
      } catch {
        setError("Could not reach the server.");
        setPhase("error");
      }
    })();
    // Intentionally once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRound = useCallback(async (sid: string) => {
    const r = await fetch(`/api/round?sessionId=${sid}`);
    if (!r.ok) {
      setError("Could not load the next question.");
      setPhase("error");
      return;
    }
    // /api/round wraps the view: { done, round, multiplierBp }. Reading the body as the view itself
    // yields a RoundView with every field undefined, which renders as a blank question.
    const data: { done: boolean; round?: RoundView } = await r.json();
    if (data.done || !data.round) {
      await bankRound();
      return;
    }
    setRound(data.round);
    setSecondsLeft(data.round.timeLimitSec);
    setLastCorrect(null);
    setPhase("playing");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── countdown ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          // Time up counts as wrong; the server enforces this authoritatively too.
          void answer(-1);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round?.roundIndex]);

  async function answer(index: number) {
    if (!sessionId || phase !== "playing") return;
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase("reveal");

    try {
      const r = await fetch("/api/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, answerIndex: index }),
      });
      const outcome = await r.json();
      const wasCorrect = outcome?.result === "correct";
      setLastCorrect(wasCorrect);
      if (wasCorrect) setCorrectSoFar((n) => n + 1);
      const nowAnswered = answered + 1;
      setAnswered(nowAnswered);

      setTimeout(async () => {
        if (outcome?.done || nowAnswered >= (round?.totalRounds ?? 15)) {
          await bankRound();
        } else {
          await loadRound(sessionId);
        }
      }, 700);
    } catch {
      setError("Lost connection mid-round.");
      setPhase("error");
    }
  }

  async function bankRound() {
    setPhase("banking");
    try {
      const r = await fetch("/api/v2/run/round", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setError(b?.error ?? "Could not record your round.");
        setPhase("error");
        return;
      }
      const banked: BankResult = await r.json();
      setResult(banked);
      setPassMark(banked.passMark);
      setPhase("done");
    } catch {
      setError("Could not record your round.");
      setPhase("error");
    }
  }

  // ── render ───────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <main style={wrap}>
        <div className="panel" style={panel}>
          <p style={{ fontWeight: 800, marginBottom: 14 }}>{error}</p>
          <a className="btn" href="/v2/run" style={{ ...btn, textDecoration: "none", display: "inline-block" }}>
            Back to my week
          </a>
        </div>
      </main>
    );
  }

  if (phase === "loading") {
    return (
      <main style={wrap}>
        <p style={{ fontWeight: 800 }}>Dealing your round…</p>
      </main>
    );
  }

  if (phase === "done" && result) {
    const multiplier = result.multiplierBp / BP;
    const gained = result.deltaBp > 0;
    return (
      <main style={wrap}>
        <div className="panel" style={{ ...panel, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)" }}>
            {result.correct} of {result.questionsPerRound} correct
          </div>
          <div style={{ fontSize: 56, fontWeight: 900, margin: "10px 0 4px" }}>
            {gained ? "+0.10x" : result.deltaBp === 0 ? "No change" : "−0.10x"}
          </div>
          <p style={{ marginBottom: 16, lineHeight: 1.5 }}>
            {result.passed
              ? `You needed ${result.passMark}. You got there.`
              : result.purchased
                ? `You needed ${result.passMark}. Extra rounds can't cost you anything, so nothing was lost.`
                : `You needed ${result.passMark}.`}
          </p>
          <div style={{ fontSize: 15, color: "var(--text-dim)" }}>Now at</div>
          <div style={{ fontSize: 36, fontWeight: 900 }}>{multiplier.toFixed(2)}x</div>
        </div>

        {result.busted && (
          <div className="panel" style={{ ...panel, borderLeft: "10px solid var(--accent)" }}>
            <p style={{ fontWeight: 900, fontSize: 20, marginBottom: 8 }}>You&apos;re out</p>
            <p style={{ lineHeight: 1.5, marginBottom: 0 }}>
              Your run ended at zero. Buy in again to start over at 1.00x — your week isn&apos;t
              finished, but this run is.
            </p>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {!result.busted && (
            <button className="btn" onClick={() => window.location.reload()} style={{ ...btn, flex: 1 }}>
              Next round
            </button>
          )}
          <a className="btn ghost" href="/v2/run" style={{ ...btn, flex: 1, textDecoration: "none", textAlign: "center" }}>
            My week
          </a>
        </div>

        <p style={{ marginTop: 18, fontSize: 14, color: "var(--text-dim)" }}>
          {result.freeRoundsLeft} free {result.freeRoundsLeft === 1 ? "round" : "rounds"} left today
        </p>
      </main>
    );
  }

  if (phase === "banking") {
    return (
      <main style={wrap}>
        <p style={{ fontWeight: 800 }}>Scoring your round…</p>
      </main>
    );
  }

  // playing / reveal
  const needed = passMark - correctSoFar;
  const remaining = (round?.totalRounds ?? 15) - answered;
  const stillPossible = needed <= remaining;

  return (
    <main style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontWeight: 900 }}>
          {game?.thumbnail} {game?.title}
        </span>
        <span style={{ fontWeight: 800 }}>
          {answered + 1} / {round?.totalRounds ?? 15}
        </span>
      </div>

      {/* Progress toward the pass mark — the only thing that decides the round's outcome. */}
      <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 700, color: stillPossible ? "var(--text-dim)" : "#c0392b" }}>
        {stillPossible
          ? `${correctSoFar} right · need ${Math.max(0, needed)} more to gain`
          : `${correctSoFar} right · this round can't reach ${passMark}`}
      </div>
      <div style={{ height: 10, border: "3px solid var(--border)", background: "#fff", marginBottom: 16 }}>
        <div
          style={{
            width: `${Math.min(100, (correctSoFar / passMark) * 100)}%`,
            height: "100%",
            background: correctSoFar >= passMark ? "#6BCDCF" : "var(--yellow)",
          }}
        />
      </div>

      <div className="panel" style={{ ...panel, minHeight: 120 }}>
        {round?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={round.imageUrl}
            alt=""
            style={{
              width: "100%",
              maxHeight: 200,
              objectFit: "cover",
              marginBottom: 14,
              filter:
                round.imageStyle === "extreme"
                  ? "grayscale(1) blur(3px)"
                  : round.imageStyle === "hard"
                    ? "grayscale(1)"
                    : undefined,
            }}
          />
        )}
        <p style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.4, marginBottom: 0 }}>{round?.prompt}</p>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {round?.options.map((opt, i) => (
          <button
            key={i}
            className="btn"
            onClick={() => answer(i)}
            disabled={phase !== "playing"}
            style={{ ...btn, fontSize: 16, padding: "14px 18px", textAlign: "left" }}
          >
            {opt}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
        <span>{secondsLeft}s</span>
        {phase === "reveal" && lastCorrect !== null && (
          <span style={{ color: lastCorrect ? "#0a7d4f" : "#c0392b" }}>
            {lastCorrect ? "Correct" : "Missed"}
          </span>
        )}
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = { maxWidth: 560, margin: "0 auto", padding: "24px 20px 80px" };
const panel: React.CSSProperties = { padding: 20, marginTop: 0, marginBottom: 16 };
const btn: React.CSSProperties = { fontSize: 17, padding: "16px 20px" };
