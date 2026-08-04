import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The check-in gate's decisions, isolated from the chain. What matters here is WHEN the gate
// applies and which way it fails — the on-chain read itself is the contract's tested behaviour.

const readContract = vi.fn();
vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return { ...actual, createPublicClient: () => ({ readContract }) };
});

const ENV = { ...process.env };

async function load() {
  vi.resetModules();
  return import("./checkin");
}

beforeEach(() => {
  readContract.mockReset();
  process.env.ARCADIA_POOL_ADDRESS = "0x" + "11".repeat(20);
  delete process.env.V2_REQUIRE_CHECKIN;
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("check-in gate — when it applies", () => {
  it("is on once a pool address exists", async () => {
    const { checkInGateOn } = await load();
    expect(checkInGateOn()).toBe(true);
  });

  it("is off without a pool address, rather than locking everyone out", async () => {
    delete process.env.ARCADIA_POOL_ADDRESS;
    const { checkInGateOn, hasCheckedInToday } = await load();
    expect(checkInGateOn()).toBe(false);
    // A deploy that cannot verify a check-in must not withhold play over it.
    await expect(hasCheckedInToday("0x" + "22".repeat(20))).resolves.toBe(true);
    expect(readContract).not.toHaveBeenCalled();
  });

  it("can be disabled explicitly for local work", async () => {
    process.env.V2_REQUIRE_CHECKIN = "false";
    const { checkInGateOn, hasCheckedInToday } = await load();
    expect(checkInGateOn()).toBe(false);
    await expect(hasCheckedInToday("0x" + "22".repeat(20))).resolves.toBe(true);
  });
});

describe("check-in gate — reading the chain", () => {
  it("reports what the contract says", async () => {
    const { hasCheckedInToday } = await load();
    readContract.mockResolvedValueOnce(true);
    await expect(hasCheckedInToday("0x" + "22".repeat(20))).resolves.toBe(true);

    readContract.mockResolvedValueOnce(false);
    await expect(hasCheckedInToday("0x" + "22".repeat(20))).resolves.toBe(false);
  });

  // Deliberate asymmetry with entry.ts, which guards the pot and must fail closed. This gates a
  // FREE allowance: a false yes costs ten free rounds, a false no locks every player out of the
  // game whenever the RPC has a bad minute.
  it("fails OPEN when the RPC is down", async () => {
    const { hasCheckedInToday } = await load();
    readContract.mockRejectedValueOnce(new Error("rpc exploded"));
    await expect(hasCheckedInToday("0x" + "22".repeat(20))).resolves.toBe(true);
  });
});

describe("check-in request", () => {
  it("targets the pool, moves no value, and encodes the week", async () => {
    const { checkInRequest } = await load();
    const req = checkInRequest(202631)!;
    expect(req.to.toLowerCase()).toBe("0x" + "11".repeat(20));
    expect(req.value).toBe("0x0");
    // checkIn(uint256) selector, then the week id.
    expect(req.data.startsWith("0x")).toBe(true);
    expect(req.data.length).toBe(2 + 8 + 64);
    expect(BigInt("0x" + req.data.slice(10))).toBe(202631n);
  });

  it("differs per week, so the event carries the right join key", async () => {
    const { checkInRequest } = await load();
    expect(checkInRequest(202631)!.data).not.toBe(checkInRequest(202632)!.data);
  });

  it("is null when no pool is configured, so the UI has nothing to prompt", async () => {
    delete process.env.ARCADIA_POOL_ADDRESS;
    const { checkInRequest } = await load();
    expect(checkInRequest(202631)).toBeNull();
  });
});
