"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConnect, useSendTransaction, usePublicClient } from "wagmi";
import { injected } from "wagmi/connectors";
import { isMiniPay } from "../../../lib/useArcade";

// V2 private-beta redemption.
//
// Two-step because MiniPay supports neither personal_sign nor eth_signTypedData
// (docs/MINIPAY_V2_CONSTRAINTS.md), so ownership of the wallet is proven with a TRANSACTION
// instead of a signed message:
//
//   1. ask the backend for a proof nonce bound to this address
//   2. send a 0-value transaction to yourself carrying that nonce as calldata
//   3. POST the code + tx hash; the backend checks on-chain that `from` is this address
//
// The code itself never goes on-chain — calldata is public in the mempool, so a code sent there
// could be copied and redeemed by an observer. Only the address-bound nonce is published.
//
// The whole /v2 route tree is 404'd by proxy.ts unless V2_ENABLED=true, so this page does not
// exist in production.

type Phase = "idle" | "proving" | "sending" | "confirming" | "redeeming" | "done";

interface ProofChallenge {
  nonce: string;
  calldata: `0x${string}`;
  expiresAt: number;
}

export default function RedeemPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();

  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [inMiniPay, setInMiniPay] = useState(false);

  // Zero-click connect: MiniPay requires no "Connect Wallet" button.
  useEffect(() => {
    if (isMiniPay()) {
      setInMiniPay(true);
      connect({ connector: injected() });
    }
  }, [connect]);

  const busy = phase !== "idle" && phase !== "done";

  async function handleRedeem() {
    setError(null);
    if (!address) {
      setError("Wallet not connected yet — give it a moment and try again.");
      return;
    }
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter your invite code.");
      return;
    }

    try {
      // ── 1. proof challenge, bound to this wallet ──────────────────────────
      setPhase("proving");
      const challengeRes = await fetch(
        `/api/v2/access/redeem?player=${encodeURIComponent(address)}`
      );
      const challenge = await challengeRes.json();
      const proof: ProofChallenge | null = challenge?.proof ?? null;
      if (!proof) {
        // The backend explains why (usually a malformed address); surface it rather than a
        // generic failure the tester can do nothing with.
        console.warn("[redeem] no proof challenge:", challenge?.proofUnavailable);
        setError("Could not start verification. Refresh and try again.");
        setPhase("idle");
        return;
      }

      // ── 2. prove ownership by sending a transaction ───────────────────────
      // Zero value to self: the tester risks nothing beyond the network fee, which MiniPay pays
      // in stablecoins via fee abstraction.
      setPhase("sending");
      const txHash = await sendTransactionAsync({
        to: address,
        value: 0n,
        data: proof.calldata,
        // MiniPay only processes legacy (type 0) transactions and manages its own fee currency —
        // passing either an EIP-1559 fee field or a custom feeCurrency gets the tx rejected.
        ...(isMiniPay() ? { type: "legacy" as const } : {}),
      });

      setPhase("confirming");
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }

      // ── 3. redeem ─────────────────────────────────────────────────────────
      setPhase("redeeming");
      const res = await fetch("/api/v2/access/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: trimmed,
          player: address,
          proofNonce: proof.nonce,
          txHash,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Could not redeem that code.");
        setPhase("idle");
        return;
      }

      setPhase("done");
      setTimeout(() => router.push("/games"), 1400);
    } catch (e) {
      const message = (e as Error)?.message ?? "";
      // A rejected transaction is a user choice, not a failure worth alarming them about.
      if (/user rejected|denied|rejected the request/i.test(message)) {
        setError("Verification cancelled.");
      } else if (/insufficient/i.test(message)) {
        // MiniPay listing requirement: send users to Add Cash rather than showing a dead end.
        setError("INSUFFICIENT_BALANCE");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setPhase("idle");
    }
  }

  const statusText: Record<Phase, string> = {
    idle: "",
    proving: "Preparing verification…",
    sending: "Confirm the verification in your wallet",
    confirming: "Verifying on-chain…",
    redeeming: "Unlocking your access…",
    done: "You're in! Taking you to the games…",
  };

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px 80px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, textTransform: "uppercase", marginBottom: 8 }}>
        Private Beta
      </h1>
      <p style={{ marginBottom: 28, lineHeight: 1.5 }}>
        Arcadia&apos;s weekly pool is invite-only while we test it. Enter the code you were sent to
        unlock access.
      </p>

      <div className="panel" style={{ padding: 28, marginTop: 0 }}>
        <label
          htmlFor="invite-code"
          style={{ display: "block", fontWeight: 800, marginBottom: 10, textTransform: "uppercase" }}
        >
          Invite code
        </label>
        <input
          id="invite-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="arcv2-…"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy || phase === "done"}
          style={{
            width: "100%",
            padding: "14px 16px",
            fontSize: 16,
            fontFamily: "inherit",
            border: "4px solid #000",
            background: "#fff",
            marginBottom: 18,
          }}
        />

        <button
          className="btn"
          onClick={handleRedeem}
          disabled={busy || phase === "done" || !isConnected}
          style={{ width: "100%", fontSize: 17, padding: "16px 20px" }}
        >
          {busy ? "Verifying…" : phase === "done" ? "Unlocked" : "Unlock access"}
        </button>

        {!isConnected && !inMiniPay && (
          <p style={{ marginTop: 14, fontSize: 14 }}>
            Connect your wallet first using the button in the header.
          </p>
        )}

        {phase !== "idle" && (
          <p style={{ marginTop: 16, fontWeight: 700 }} aria-live="polite">
            {statusText[phase]}
          </p>
        )}

        {error === "INSUFFICIENT_BALANCE" ? (
          <div style={{ marginTop: 16 }}>
            <p style={{ marginBottom: 10, fontWeight: 700 }}>
              You don&apos;t have enough to cover the network fee.
            </p>
            <a
              className="btn"
              href="https://link.minipay.xyz/add_cash?tokens=USDm,USDC,USDT"
              style={{
                display: "inline-block",
                textDecoration: "none",
                fontSize: 15,
                padding: "12px 20px",
              }}
            >
              Deposit
            </a>
          </div>
        ) : (
          error && (
            <p style={{ marginTop: 16, fontWeight: 700, color: "#c0392b" }} role="alert">
              {error}
            </p>
          )
        )}
      </div>

      <p style={{ marginTop: 22, fontSize: 14, lineHeight: 1.5, opacity: 0.75 }}>
        Unlocking sends a zero-value transaction from your wallet. It moves no money — it only
        proves the wallet is yours. You pay just the network fee.
      </p>
    </main>
  );
}
