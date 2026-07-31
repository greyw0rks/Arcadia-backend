import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The scheduler's value is not that it runs on a timer — it is that it refuses to blacklist
// automatically until someone has decided the thresholds are trustworthy. These guard that.
//
// docs/V2_ANTICHEAT_AUDIT.md: the 3-hard-flag threshold sits on top of anti-cheat thresholds that
// have never been validated against real play, and flags have been accumulating since 2026-07-17
// under detect-only operation. An unattended sweep over that backlog would mass-ban on unvalidated
// criteria.

const sweep = vi.hoisted(() => vi.fn(async (opts?: { dryRun?: boolean }) => ({
  threshold: 3,
  dryRun: opts?.dryRun ?? false,
  candidates: 1,
  newlyBlacklisted: ["0xabc"],
  alreadyBlacklisted: [] as string[],
})));
const telegram = vi.hoisted(() => vi.fn());

vi.mock("./clawback", () => ({
  runClawbackSweep: sweep,
  clawbackThreshold: () => 3,
}));
vi.mock("./telegram", () => ({ sendTelegramText: telegram }));

const ENV = { ...process.env };

async function freshModule() {
  vi.resetModules();
  return import("./clawbackScheduler");
}

beforeEach(() => {
  sweep.mockClear();
  telegram.mockClear();
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("clawback scheduler — enforcement is opt-in", () => {
  it("reports instead of blacklisting when auto-enforce is off", async () => {
    delete process.env.CLAWBACK_AUTO_ENFORCE;
    const m = await freshModule();
    await m.scheduledSweep();
    expect(sweep).toHaveBeenCalledWith({ dryRun: true });
  });

  it("treats any value other than 'true' as off — a typo must not enable banning", async () => {
    for (const value of ["false", "1", "yes", "True!", ""]) {
      process.env.CLAWBACK_AUTO_ENFORCE = value;
      const m = await freshModule();
      expect(m.autoEnforceOn(), `"${value}" should not enable enforcement`).toBe(false);
    }
    // Only the exact string turns it on (case-insensitively).
    process.env.CLAWBACK_AUTO_ENFORCE = "TRUE";
    expect((await freshModule()).autoEnforceOn()).toBe(true);
  });

  it("still previews on the FIRST run even with auto-enforce on (backlog guard)", async () => {
    process.env.CLAWBACK_AUTO_ENFORCE = "true";
    const m = await freshModule();
    await m.scheduledSweep();
    expect(sweep).toHaveBeenNthCalledWith(1, { dryRun: true });
    // Only from the second run onward does it actually act.
    await m.scheduledSweep();
    expect(sweep).toHaveBeenNthCalledWith(2, { dryRun: false });
  });

  it("force skips the first-run guard, for a deliberate operator trigger", async () => {
    process.env.CLAWBACK_AUTO_ENFORCE = "true";
    const m = await freshModule();
    await m.scheduledSweep({ force: true });
    expect(sweep).toHaveBeenCalledWith({ dryRun: false });
  });

  it("alerts the operator with candidates when it declines to act", async () => {
    delete process.env.CLAWBACK_AUTO_ENFORCE;
    const m = await freshModule();
    await m.scheduledSweep();
    expect(telegram).toHaveBeenCalledOnce();
    expect(telegram.mock.calls[0][0]).toContain("0xabc");
  });

  it("stays silent when there is nothing to report", async () => {
    sweep.mockResolvedValueOnce({
      threshold: 3, dryRun: true, candidates: 0, newlyBlacklisted: [], alreadyBlacklisted: [],
    });
    const m = await freshModule();
    await m.scheduledSweep();
    expect(telegram).not.toHaveBeenCalled();
  });

  it("swallows sweep failures — a background job must not take the process down", async () => {
    sweep.mockRejectedValueOnce(new Error("db gone"));
    const m = await freshModule();
    await expect(m.scheduledSweep()).resolves.toBeUndefined();
  });
});

describe("clawback scheduler — interval", () => {
  it("defaults to 6 hours", async () => {
    delete process.env.CLAWBACK_SWEEP_MINUTES;
    const m = await freshModule();
    expect(m.sweepIntervalMinutes()).toBe(360);
  });

  it("0 disables the scheduler entirely", async () => {
    process.env.CLAWBACK_SWEEP_MINUTES = "0";
    const m = await freshModule();
    expect(m.sweepIntervalMinutes()).toBe(0);
    m.startClawbackScheduler();
    m.stopClawbackScheduler(); // no throw = no timer was created
  });

  it("falls back to the default on a malformed value", async () => {
    process.env.CLAWBACK_SWEEP_MINUTES = "soon";
    const m = await freshModule();
    expect(m.sweepIntervalMinutes()).toBe(360);
  });

  it("start is idempotent — ensureBooted may call it on every request", async () => {
    process.env.CLAWBACK_SWEEP_MINUTES = "60";
    const m = await freshModule();
    const spy = vi.spyOn(global, "setInterval");
    m.startClawbackScheduler();
    m.startClawbackScheduler();
    expect(spy).toHaveBeenCalledOnce();
    m.stopClawbackScheduler();
    spy.mockRestore();
  });
});
