"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useArcade } from "../../../lib/useArcade";
import { formatMultiplier, CHAINS, celoTokenMeta } from "../../../lib/contract";
import { MAX_STAKE, difficultyFromStake, roundsFor } from "../../../server/difficulty";
import { useChain } from "../../../lib/chainContext";
import { useStacksWallet } from "../../../lib/stacksWallet";
import { ConnectControl } from "../../../components/ConnectControl";
import { soundManager } from "../../../lib/sounds";
import { createConfetti } from "../../../lib/confetti";

interface RoundView {
  roundIndex: number;
  totalRounds: number;
  prompt: string;
  imageUrl?: string;
  imageStyle?: 'hard' | 'extreme';
  options: string[];
  timeLimitSec: number;
}

type Phase = "setup" | "starting" | "playing" | "reveal" | "settling" | "done" | "error";

export default function PlayPage() {
  const { game } = useParams<{ game: string }>();
  const router = useRouter();
  const { chain, token } = useChain();
  const chainMeta = CHAINS[chain];
  // On Celo the staked asset is the selected token (cUSD/USDC/USDT); on Stacks it's STX.
  const stakeSymbol = chain === "celo" ? celoTokenMeta(token).symbol : chainMeta.stakeSymbol;

  // Active wallet identity comes from whichever chain is selected. Both hooks run unconditionally.
  const evm = useAccount();
  const stx = useStacksWallet();
  const address = chain === "stacks" ? stx.address ?? undefined : evm.address;
  const isConnected = chain === "stacks" ? stx.isConnected : evm.isConnected;

  const arcade = useArcade(chain, token);

  const [phase, setPhase] = useState<Phase>("setup");
  const [stake, setStake] = useState("1");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<{
    title: string;
    thumbnail: string;
    description: string;
    maxRounds: number;
    bankSize: number;
  } | null>(null);

  const [sessionId, setSessionId] = useState<`0x${string}` | null>(null);
  const [maxRounds, setMaxRounds] = useState(5);
  const [round, setRound] = useState<RoundView | null>(null);
  const [multiplierBp, setMultiplierBp] = useState(10000);
  const [selected, setSelected] = useState<number | null>(null);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<"correct" | "wrong" | null>(null);
  const [finalBp, setFinalBp] = useState<number | null>(null);
  const [secsLeft, setSecsLeft] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgRetry, setImgRetry] = useState(0);

  const IMAGE_GAMES = new Set(["geo", "landmark", "logo", "movie"]);

  const answeringRef = useRef(false);

  // Load the selected game's metadata so the setup screen works for any module.
  useEffect(() => {
    // Initialize sounds
    soundManager.init();

    fetch("/api/games")
      .then((r) => r.json())
      .then((d) => {
        const m = (d.games ?? []).find((g: any) => g.id === game);
        if (m) {
          setMeta(m);
          setMaxRounds(m.maxRounds);
        }
      })
      .catch(() => {});
  }, [game]);

  const fail = (msg: string) => {
    setError(msg);
    setPhase("error");
  };

  // ---- refund: cancel expired session ----
  async function refund() {
    if (!sessionId) return;
    try {
      setStatus("Requesting refund...");
      await arcade.cancelExpired(sessionId);
      setPhase("done");
      setError("");
      setStatus("Refund successful! Your stake has been returned.");
    } catch (e: any) {
      fail(e?.shortMessage ?? e?.message ?? "Refund failed. Session may not be expired yet.");
    }
  }

  // ---- start: create session, approve + stake on-chain, then load round 1 ----
  async function begin() {
    setError("");
    if (!address) return;
    const amt = Number(stake);
    if (!(amt > 0)) {
      setError("Enter a stake greater than 0.");
      return;
    }
    if (amt > MAX_STAKE[chain]) {
      setError(`Max bet is ${MAX_STAKE[chain]} ${stakeSymbol} per game.`);
      return;
    }
    setPhase("starting");
    try {
      setStatus("Creating session…");
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game, player: address, chain, token, stake: amt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "session failed");
      const sid = data.sessionId as `0x${string}`;
      setSessionId(sid);
      setMaxRounds(data.maxRounds);

      setStatus(
        chain === "stacks"
          ? "Confirm your STX stake in your wallet, then wait for the block…"
          : `Approve ${stakeSymbol} + confirm stake in your wallet…`
      );
      await arcade.startSession(sid, stake, data.maxRounds);

      setStatus("Stake confirmed. Loading first question…");
      await loadRound(sid);
      setPhase("playing");
    } catch (e: any) {
      fail(e?.shortMessage ?? e?.message ?? "Failed to start game.");
    }
  }

  // ---- round loading ----
  const loadRound = useCallback(async (sid: `0x${string}`) => {
    // The funding gate can lag a block behind the receipt; retry briefly.
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await fetch(`/api/round?sessionId=${sid}`);
      const d = await r.json();
      if (r.status === 402) {
        await new Promise((res) => setTimeout(res, 1500));
        continue;
      }
      if (!r.ok) throw new Error(d.error ?? "round failed");
      if (d.done) {
        await finalize(sid);
        return;
      }
      setRound(d.round);
      setMultiplierBp(d.multiplierBp);
      setSelected(null);
      setCorrectIndex(null);
      setLastResult(null);
      setSecsLeft(d.round.timeLimitSec);
      setImgLoaded(false);
      setImgError(false);
      setImgRetry(0);
      answeringRef.current = false;
      return;
    }
    throw new Error("Stake not detected on-chain. Check the transaction and retry.");
  }, []);

  // ---- answering ----
  const submit = useCallback(
    async (answerIndex: number) => {
      if (!sessionId || answeringRef.current) return;
      answeringRef.current = true;
      setSelected(answerIndex);
      try {
        const r = await fetch("/api/answer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, answerIndex }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "answer failed");
        setCorrectIndex(d.correctIndex);
        setLastResult(d.result);
        setMultiplierBp(d.multiplierBp);
        setPhase("reveal");

        // Play sound
        if (d.result === "correct") {
          soundManager.play('correct');
        } else {
          soundManager.play('wrong');
        }

        setTimeout(async () => {
          if (d.done) {
            await finalize(sessionId);
          } else {
            setPhase("playing");
            await loadRound(sessionId);
          }
        }, 1400);
      } catch (e: any) {
        fail(e?.message ?? "Failed to submit answer.");
      }
    },
    [sessionId, loadRound]
  );

  // ---- finalize + settle ----
  async function finalize(sid: `0x${string}`) {
    try {
      setPhase("settling");
      setStatus("Signing final result…");
      const r = await fetch("/api/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sid }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "finalize failed");
      setFinalBp(d.multiplierBp);
      setMultiplierBp(d.multiplierBp);

      setStatus("Confirm settlement in your wallet to claim your payout…");
      await arcade.settle(sid, d.multiplierBp, d.signature);
      setPhase("done");

      // Play win sound and show confetti if multiplier >= 1.0x
      if (d.multiplierBp >= 10000) {
        soundManager.play('win');
        createConfetti();
      }
    } catch (e: any) {
      fail(e?.shortMessage ?? e?.message ?? "Failed to settle.");
    }
  }

  // ---- countdown timer ----
  useEffect(() => {
    if (phase !== "playing" || !round) return;
    if (secsLeft <= 0) {
      submit(-1); // timeout = wrong
      return;
    }
    const t = setTimeout(() => setSecsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, round, secsLeft, submit]);

  const up = multiplierBp >= 10000;
  const estPayout = finalBp != null ? (Number(stake) * 0.97 * finalBp) / 10000 : null;

  // Live difficulty preview from the chosen stake (higher bet => harder session).
  const stakeNum = Number(stake) || 0;
  const overMax = stakeNum > MAX_STAKE[chain];
  const diff = difficultyFromStake(Math.min(stakeNum, MAX_STAKE[chain]), chain);
  const previewRounds = meta ? roundsFor(diff, meta.bankSize) : maxRounds;
  const diffLabel = diff < 0.34 ? "Easy" : diff < 0.67 ? "Medium" : "Hard";

  return (
    <div className="container">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            className="btn ghost"
            onClick={() => router.replace("/games")}
            style={{ padding: "12px 16px", fontSize: "20px" }}
            title="Back to lobby"
          >
            ←
          </button>
          <div className="brand" style={{ cursor: "pointer" }} onClick={() => router.replace("/games")}>
            Arcadia
          </div>
        </div>
        <ConnectControl />
      </div>

      {!isConnected ? (
        <div className="panel center">
          <h2>Connect your wallet to play</h2>
          <p className="muted">
            You&apos;ll stake {stakeSymbol} on {chainMeta.label} (max {MAX_STAKE[chain]}{" "}
            {stakeSymbol} per game).
          </p>
        </div>
      ) : phase === "setup" ? (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>
            {meta ? meta.title : "Loading…"}
          </h2>
          <p className="muted">
            {meta?.description} Start at 1.0x; +0.1x per correct answer, −0.1x per miss (you can drop
            below 1.0x). A 3% entry rake applies. Payout = stake × final multiplier.
          </p>
          <p className="muted" style={{ marginTop: 8 }}>
            <b>The higher your bet, the harder the session</b> — fewer seconds per question, tougher
            questions, and more rounds. Max bet is {MAX_STAKE[chain]} {stakeSymbol} per game.
          </p>
          <div className="row" style={{ marginTop: 20, justifyContent: "flex-start", gap: 16 }}>
            <input
              className="input"
              type="number"
              min="0"
              max={MAX_STAKE[chain]}
              step="0.1"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
            />
            <span className="muted">{stakeSymbol} stake</span>
            <button className="btn" onClick={begin}>
              Stake &amp; Play
            </button>
          </div>
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-start", gap: 16 }}>
            <span className={`difficulty-pill ${diffLabel.toLowerCase()}`}>
              Difficulty: <b>{diffLabel}</b>
            </span>
            <span className="muted">
              {previewRounds} rounds · up to {formatMultiplier(10000 + 1000 * previewRounds)} · shorter
              timer at higher bets
            </span>
          </div>
          {IMAGE_GAMES.has(game) && (
            <div className="info" style={{ marginTop: 16, fontWeight: 700 }}>
              ⚠️ This game loads images each round. Make sure you have a <strong>reliable and fast internet connection</strong> before playing — slow connections may cause images to fail mid-round.
            </div>
          )}
          {overMax && (
            <div className="error">Max bet is {MAX_STAKE[chain]} {stakeSymbol} per game.</div>
          )}
          {error && <div className="error">{error}</div>}
        </div>
      ) : phase === "starting" || phase === "settling" ? (
        <div className="panel center">
          <div className={`multiplier ${up ? "up" : "down"}`}>{formatMultiplier(multiplierBp)}</div>
          <p className="muted" style={{ marginTop: 16 }}>
            {status}
          </p>
          {phase === "settling" && sessionId && (
            <div style={{ marginTop: 24 }}>
              <p className="info">
                If settlement fails, you can request a refund after 1 hour.
              </p>
            </div>
          )}
        </div>
      ) : phase === "playing" || phase === "reveal" ? (
        <div className="panel">
          <div className="row">
            <span className="muted">
              Question {round ? round.roundIndex + 1 : 1} / {maxRounds}
            </span>
            <span className={`multiplier ${up ? "up" : "down"}`} style={{ fontSize: 28 }}>
              {formatMultiplier(multiplierBp)}
            </span>
          </div>

          <div className="timer-track">
            <div
              className="timer-fill"
              style={{ width: round ? `${(secsLeft / round.timeLimitSec) * 100}%` : "0%" }}
            />
          </div>

          <h2 style={{ marginTop: 4 }}>{round?.prompt}</h2>

          {round?.imageUrl && (
            <div
              style={{
                overflow: "hidden",
                borderRadius: 4,
                position: "relative",
                ...(round.imageStyle === 'extreme' && { maxHeight: 260 }),
              }}
            >
              {!imgLoaded && !imgError && (
                <div style={{
                  width: "100%",
                  height: 220,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--bg-alt)",
                  border: "8px solid var(--border)",
                  margin: "20px 0 28px",
                  fontSize: 14,
                  color: "var(--muted)",
                }}>
                  Loading image…
                </div>
              )}
              {imgError && (
                <div style={{
                  width: "100%",
                  height: 220,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--bg-alt)",
                  border: "8px solid var(--border)",
                  margin: "20px 0 28px",
                  gap: 12,
                }}>
                  <span style={{ fontSize: 28 }}>🖼️</span>
                  <span style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", maxWidth: 240 }}>
                    Image failed to load.
                  </span>
                  <button
                    className="btn"
                    style={{ fontSize: 13, padding: "8px 18px" }}
                    onClick={() => {
                      setImgError(false);
                      setImgLoaded(false);
                      setImgRetry((n) => n + 1);
                      if (round) setSecsLeft(round.timeLimitSec);
                    }}
                  >
                    ↺ Reload image
                  </button>
                </div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgRetry > 0 ? `${round.imageUrl}?r=${imgRetry}` : round.imageUrl}
                alt="Guess the answer"
                className="game-image"
                style={{
                  display: imgLoaded ? "block" : "none",
                  ...(round.imageStyle === 'hard' && {
                    filter: "grayscale(85%) contrast(1.05)",
                  }),
                  ...(round.imageStyle === 'extreme' && {
                    filter: "grayscale(100%) contrast(1.15) blur(0.8px)",
                    transform: "scale(1.55) translate(12%, -8%)",
                    transformOrigin: "center center",
                  }),
                }}
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgError(true)}
              />
            </div>
          )}

          {round?.options.map((opt, i) => {
            let cls = "option";
            if (phase === "reveal") {
              if (i === correctIndex) cls += " correct";
              else if (i === selected && lastResult === "wrong") cls += " wrong";
            }
            return (
              <button
                key={i}
                className={cls}
                disabled={phase === "reveal" || selected !== null}
                onClick={() => submit(i)}
              >
                {opt}
              </button>
            );
          })}
        </div>
      ) : phase === "done" ? (
        <div className="panel center">
          <p className="muted">Final multiplier</p>
          <div className={`multiplier ${up ? "up" : "down"}`}>
            {formatMultiplier(finalBp ?? multiplierBp)}
          </div>
          {estPayout != null && (
            <p style={{ fontSize: 18, marginTop: 16 }}>
              Payout ≈ <b>{estPayout.toFixed(3)} {stakeSymbol}</b>{" "}
              <span className="muted">(staked {stake}, settled on-chain)</span>
            </p>
          )}
          <div className="row center" style={{ justifyContent: "center", gap: 12, marginTop: 24 }}>
            <button className="btn" onClick={() => router.replace("/games")}>
              Back to lobby
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setPhase("setup");
                setFinalBp(null);
                setMultiplierBp(10000);
                setSessionId(null);
              }}
            >
              Play again
            </button>
          </div>
        </div>
      ) : phase === "error" ? (
        <div className="panel center">
          <h2>Something went wrong</h2>
          <p className="error">{error}</p>

          {sessionId && (
            <div style={{ marginTop: 20 }}>
              <p className="info">
                Your stake is safe! After 1 hour, you can request a refund to get your money back.
              </p>
            </div>
          )}

          <div className="row center" style={{ justifyContent: "center", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => router.replace("/games")}>
              Back to lobby
            </button>
            {sessionId && (
              <button
                className="btn"
                style={{ background: "var(--green)" }}
                onClick={refund}
              >
                Request Refund
              </button>
            )}
          </div>

          {sessionId && (
            <p className="muted" style={{ marginTop: 16, fontSize: 13, maxWidth: 500 }}>
              The refund button will work after your session expires (1 hour from when you started).
              It will return your stake minus the 3% entry fee.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
