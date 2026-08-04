import { NextRequest, NextResponse } from "next/server";
import { isAddress, verifyMessage } from "viem";
import { ensureBooted } from "../../../../../server/bootstrap";
import { redeemCode } from "../../../../../server/accessGate";
import {
  PASS_COOKIE,
  consumeNonce,
  issueNonce,
  mintPass,
  redeemMessage,
} from "../../../../../server/v2/pass";
import { issueProofNonce, verifyProofTx } from "../../../../../server/v2/onchainProof";
import { V2_PUBLIC } from "../../../../../server/v2/flag";

// Tester onboarding for the private V2 test.
//
//   GET  /api/v2/access/redeem                 -> { nonce, proof: { nonce, calldata, expiresAt } }
//   POST /api/v2/access/redeem  { code, player, ... }
//
// An allowlist cannot trust a body-supplied address — anyone can send a tester's wallet — so the
// wallet must PROVE it owns the address. Two proofs are accepted because no single one works
// everywhere:
//
//   signature { nonce, signature }   — wallet signs a code+nonce message. Cheapest, no chain access.
//   transaction { proofNonce, txHash } — wallet sends a 0-value tx carrying a server-issued nonce.
//
// The transaction path exists because MiniPay supports NEITHER personal_sign nor eth_signTypedData
// (docs/MINIPAY_V2_CONSTRAINTS.md). Without it, V2 is unreachable for most of the target audience.
// Both paths prove the same thing — that the wallet's key authorised something the server chose —
// so neither is a weaker door. A transaction is simply a signature the chain witnessed.
//
// On success the response sets an httpOnly pass cookie — see server/v2/pass.ts — which _gate.ts
// verifies on every subsequent V2 call. No V2_GATE_SECRET on the deploy → no passes, fail closed.

export async function GET(req: NextRequest) {
  // The proof nonce is address-bound, so it can only be issued once the caller names a wallet.
  //
  // Note isAddress() enforces the EIP-55 checksum on mixed-case input. An all-lowercase or
  // correctly-checksummed address passes; a hand-typed mixed-case one may not. Rather than
  // returning proof:null and leaving the client to guess why, say so.
  const player = req.nextUrl.searchParams.get("player");
  const valid = Boolean(player && isAddress(player));

  return NextResponse.json({
    // Whether this deploy is in open-beta mode — the client hides the invite-code field and unlocks
    // on wallet proof alone when true.
    public: V2_PUBLIC,
    // Signature path (non-MiniPay wallets).
    nonce: issueNonce(),
    message: "Sign redeemMessage(code, nonce) with the wallet you are redeeming for.",
    // Transaction path (MiniPay, or any wallet). Requires ?player=0x… to bind the nonce.
    proof: valid
      ? {
          ...issueProofNonce(player!),
          instructions:
            "Send a 0-value transaction to your own address with `calldata` as the data field, " +
            "then POST { code, player, proofNonce, txHash }.",
        }
      : null,
    proofUnavailable: valid
      ? undefined
      : player
        ? "player is not a valid address (mixed-case addresses must carry a valid EIP-55 checksum)"
        : "pass ?player=0x… to receive a transaction-proof challenge",
  });
}

export async function POST(req: NextRequest) {
  await ensureBooted();

  let body: {
    code?: string;
    player?: string;
    // signature path
    nonce?: string;
    signature?: string;
    // transaction path
    proofNonce?: string;
    txHash?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { code, player } = body;
  const chain = "celo" as const;
  if (!player || !isAddress(player)) {
    return NextResponse.json({ error: "a valid player address is required" }, { status: 400 });
  }
  // In public-beta mode there is no invite code — anyone who proves their wallet gets in. Outside it,
  // a code is still mandatory (private test).
  if (!V2_PUBLIC && !code) {
    return NextResponse.json({ error: "code and a valid player address are required" }, { status: 400 });
  }

  const usingTx = Boolean(body.proofNonce && body.txHash);
  const usingSig = Boolean(body.nonce && body.signature);
  if (!usingTx && !usingSig) {
    return NextResponse.json(
      { error: "provide either { nonce, signature } or { proofNonce, txHash }" },
      { status: 400 }
    );
  }

  // ── Prove the caller owns `player` ────────────────────────────────────────
  if (usingTx) {
    const result = await verifyProofTx(player, body.proofNonce!, body.txHash!, chain);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 401 });
    }
  } else {
    if (!consumeNonce(body.nonce!)) {
      return NextResponse.json({ error: "nonce expired — request a new one" }, { status: 400 });
    }
    let signatureValid = false;
    try {
      signatureValid = await verifyMessage({
        address: player,
        message: redeemMessage(code ?? "", body.nonce!),
        signature: body.signature as `0x${string}`,
      });
    } catch {
      signatureValid = false;
    }
    if (!signatureValid) {
      return NextResponse.json({ error: "signature does not match wallet" }, { status: 401 });
    }
  }

  // ── Ownership proven; consume the code (private test only) ────────────────
  // In public-beta mode there is no code to consume — ownership proof alone earns a pass.
  if (!V2_PUBLIC) {
    const result = await redeemCode(code!, player, chain);
    if (!result.ok) {
      const status = result.reason === "service unavailable" ? 503 : 403;
      return NextResponse.json({ error: result.reason }, { status });
    }
  }

  const pass = mintPass(player, chain);
  if (!pass) {
    // Redeemed but this deploy can't mint passes (no V2_GATE_SECRET). Fail closed.
    return NextResponse.json({ error: "pass minting unavailable" }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PASS_COOKIE, pass, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}
