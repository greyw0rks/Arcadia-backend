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

// Tester onboarding for the private V2 test. Two steps, both on this route:
//
//   GET  /api/v2/access/redeem            -> { nonce, message-template }
//   POST /api/v2/access/redeem            { code, player, nonce, signature }
//
// The signature is the whole point: an allowlist cannot trust a body-supplied address (anyone can
// send a tester's wallet), so the wallet must sign the code+nonce message. The nonce is one-shot
// and short-lived, which kills replay.
//
// On success the response sets an httpOnly pass cookie — see server/v2/pass.ts — which _gate.ts
// verifies on every subsequent V2 call. No V2_GATE_SECRET on the deploy → no passes, fail closed.

export async function GET() {
  return NextResponse.json({
    nonce: issueNonce(),
    message: "Sign redeemMessage(code, nonce) with the wallet you are redeeming for.",
  });
}

export async function POST(req: NextRequest) {
  await ensureBooted();

  let body: { code?: string; player?: string; nonce?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { code, player, nonce, signature } = body;
  const chain = "celo" as const;
  if (!code || !player || !nonce || !signature || !isAddress(player)) {
    return NextResponse.json(
      { error: "code, player, nonce and signature required" },
      { status: 400 }
    );
  }

  if (!consumeNonce(nonce)) {
    return NextResponse.json({ error: "nonce expired — request a new one" }, { status: 400 });
  }

  let signatureValid = false;
  try {
    signatureValid = await verifyMessage({
      address: player,
      message: redeemMessage(code, nonce),
      signature: signature as `0x${string}`,
    });
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    return NextResponse.json({ error: "signature does not match wallet" }, { status: 401 });
  }

  const result = await redeemCode(code, player, chain);
  if (!result.ok) {
    const status = result.reason === "service unavailable" ? 503 : 403;
    return NextResponse.json({ error: result.reason }, { status });
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
