import { describe, it, expect, beforeEach, vi } from "vitest";

// The transaction-proof path replaces a signature MiniPay cannot produce. It is an AUTH mechanism,
// so these tests target what an attacker would try, not the happy path alone.
//
// The central property: the proof nonce travels in public calldata, so it must be assumed observed.
// It is bound to one address, which is what makes observing it worthless.

const getTransaction = vi.hoisted(() => vi.fn());
const getTransactionReceipt = vi.hoisted(() => vi.fn());

vi.mock("viem", async (importActual) => {
  const actual = await importActual<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({ getTransaction, getTransactionReceipt }),
  };
});

import {
  issueProofNonce,
  verifyProofTx,
  _resetForTests,
  _seedNonceForTests,
} from "./onchainProof";

const ALICE = "0xAbC0000000000000000000000000000000000001";
const MALLORY = "0xdEf0000000000000000000000000000000000002";
const TX = "0x" + "11".repeat(32);
const TX2 = "0x" + "22".repeat(32);

function mineTx(from: string, nonce: string, status: "success" | "reverted" = "success") {
  getTransaction.mockResolvedValue({ from, input: `0x${nonce}` });
  getTransactionReceipt.mockResolvedValue({ status });
}

beforeEach(() => {
  _resetForTests();
  getTransaction.mockReset();
  getTransactionReceipt.mockReset();
});

describe("on-chain proof — the happy path", () => {
  it("accepts a confirmed tx sent by the wallet carrying its nonce", async () => {
    const { nonce } = issueProofNonce(ALICE);
    mineTx(ALICE, nonce);
    expect(await verifyProofTx(ALICE, nonce, TX, "celo")).toEqual({ ok: true });
  });

  it("hands back calldata the wallet can send with no contract or ABI", () => {
    const { nonce, calldata } = issueProofNonce(ALICE);
    expect(calldata).toBe(`0x${nonce}`);
  });

  it("is case-insensitive about the claimed address", async () => {
    const { nonce } = issueProofNonce(ALICE.toLowerCase());
    mineTx(ALICE.toUpperCase().replace("0X", "0x"), nonce);
    expect((await verifyProofTx(ALICE, nonce, TX, "celo")).ok).toBe(true);
  });
});

describe("on-chain proof — nonce theft (the reason it is address-bound)", () => {
  it("rejects a nonce presented by a different wallet", async () => {
    // Mallory watched the mempool and copied Alice's nonce.
    const { nonce } = issueProofNonce(ALICE);
    mineTx(MALLORY, nonce);
    const r = await verifyProofTx(MALLORY, nonce, TX, "celo");
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toContain("different wallet");
  });

  it("rejects a tx that carries the right nonce but was sent by someone else", async () => {
    // Mallory claims Alice's address while sending from her own.
    const { nonce } = issueProofNonce(ALICE);
    mineTx(MALLORY, nonce);
    const r = await verifyProofTx(ALICE, nonce, TX, "celo");
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toContain("not sent by this wallet");
  });
});

describe("on-chain proof — replay", () => {
  it("refuses to reuse a transaction hash", async () => {
    const a = issueProofNonce(ALICE);
    mineTx(ALICE, a.nonce);
    expect((await verifyProofTx(ALICE, a.nonce, TX, "celo")).ok).toBe(true);

    // Same tx, fresh nonce — must not prove a second redemption.
    const b = issueProofNonce(ALICE);
    mineTx(ALICE, b.nonce);
    const r = await verifyProofTx(ALICE, b.nonce, TX, "celo");
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toContain("already been used");
  });

  it("consumes the nonce on success so it cannot be presented twice", async () => {
    const { nonce } = issueProofNonce(ALICE);
    mineTx(ALICE, nonce);
    await verifyProofTx(ALICE, nonce, TX, "celo");

    mineTx(ALICE, nonce);
    const r = await verifyProofTx(ALICE, nonce, TX2, "celo");
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toContain("expired");
  });

  it("burns the nonce after a wrong-sender attempt, so it cannot be retried", async () => {
    const { nonce } = issueProofNonce(ALICE);
    mineTx(MALLORY, nonce);
    await verifyProofTx(ALICE, nonce, TX, "celo");

    mineTx(ALICE, nonce);
    expect((await verifyProofTx(ALICE, nonce, TX2, "celo")).ok).toBe(false);
  });
});

describe("on-chain proof — malformed and hostile input", () => {
  it("rejects an unknown nonce", async () => {
    expect((await verifyProofTx(ALICE, "never-issued", TX, "celo")).ok).toBe(false);
  });

  it("rejects an expired nonce", async () => {
    _seedNonceForTests("expired", ALICE, -1);
    const r = await verifyProofTx(ALICE, "expired", TX, "celo");
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toContain("expired");
  });

  it("rejects a malformed tx hash without touching the network", async () => {
    const { nonce } = issueProofNonce(ALICE);
    const r = await verifyProofTx(ALICE, nonce, "0xnope", "celo");
    expect(r.ok).toBe(false);
    expect(getTransaction).not.toHaveBeenCalled();
  });

  it("rejects a tx that reverted on-chain", async () => {
    const { nonce } = issueProofNonce(ALICE);
    mineTx(ALICE, nonce, "reverted");
    const r = await verifyProofTx(ALICE, nonce, TX, "celo");
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toContain("failed on-chain");
  });

  it("rejects a tx from the right wallet that does not carry the nonce", async () => {
    const { nonce } = issueProofNonce(ALICE);
    getTransaction.mockResolvedValue({ from: ALICE, input: "0xdeadbeef" });
    getTransactionReceipt.mockResolvedValue({ status: "success" });
    const r = await verifyProofTx(ALICE, nonce, TX, "celo");
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toContain("expected proof");
  });
});

describe("on-chain proof — unmined transactions", () => {
  it("does NOT burn the nonce when the tx is not found yet", async () => {
    const { nonce } = issueProofNonce(ALICE);
    getTransaction.mockRejectedValue(new Error("not found"));

    const first = await verifyProofTx(ALICE, nonce, TX, "celo");
    expect(first.ok).toBe(false);
    expect((first as { reason: string }).reason).toContain("not found yet");

    // A tester polling ahead of the chain must be able to retry — burning here would strand them.
    mineTx(ALICE, nonce);
    expect((await verifyProofTx(ALICE, nonce, TX, "celo")).ok).toBe(true);
  });
});

describe("on-chain proof — nonce issuance", () => {
  it("issues distinct nonces", () => {
    const seen = new Set(Array.from({ length: 50 }, () => issueProofNonce(ALICE).nonce));
    expect(seen.size).toBe(50);
  });

  it("sets an expiry in the future", () => {
    expect(issueProofNonce(ALICE).expiresAt).toBeGreaterThan(Date.now());
  });
});
