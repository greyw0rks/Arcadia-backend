import { describe, it, expect, beforeAll } from "vitest";
import {
  mintPass,
  verifyPass,
  issueNonce,
  consumeNonce,
  redeemMessage,
} from "./pass";

const WALLET = "0xAbC0000000000000000000000000000000000001";

describe("tester passes — HMAC mint/verify", () => {
  beforeAll(() => {
    process.env.V2_GATE_SECRET = "test-secret-32-bytes-of-entropy!";
  });

  it("round-trips a pass for a wallet", () => {
    const pass = mintPass(WALLET, "celo");
    expect(pass).not.toBeNull();
    const verified = verifyPass(pass!);
    expect(verified).toEqual({ player: WALLET.toLowerCase(), chain: "celo" });
  });

  it("rejects a tampered pass (flipped payload byte)", () => {
    const pass = mintPass(WALLET, "celo")!;
    const tampered = (pass[0] === "A" ? "B" : "A") + pass.slice(1);
    expect(verifyPass(tampered)).toBeNull();
  });

  it("rejects a pass signed with a different secret", () => {
    const pass = mintPass(WALLET, "celo")!;
    const original = process.env.V2_GATE_SECRET;
    process.env.V2_GATE_SECRET = "a-completely-different-secret!!!";
    expect(verifyPass(pass)).toBeNull();
    process.env.V2_GATE_SECRET = original;
  });

  it("rejects garbage", () => {
    expect(verifyPass("")).toBeNull();
    expect(verifyPass("not-a-pass")).toBeNull();
    expect(verifyPass("a.b.c.d")).toBeNull();
  });

  it("fails closed when the deploy has no gate secret", () => {
    const original = process.env.V2_GATE_SECRET;
    delete process.env.V2_GATE_SECRET;
    expect(mintPass(WALLET, "celo")).toBeNull();
    expect(verifyPass("anything.at-all")).toBeNull();
    process.env.V2_GATE_SECRET = original;
  });
});

describe("redeem nonces — one-shot challenges", () => {
  it("a nonce is valid exactly once", () => {
    const nonce = issueNonce();
    expect(consumeNonce(nonce)).toBe(true);
    expect(consumeNonce(nonce)).toBe(false); // replay
  });

  it("an unknown nonce is invalid", () => {
    expect(consumeNonce("deadbeef")).toBe(false);
  });

  it("the signed message binds code AND nonce", () => {
    const m = redeemMessage("arcv2-abc", "n0nce");
    expect(m).toContain("arcv2-abc");
    expect(m).toContain("n0nce");
  });
});
