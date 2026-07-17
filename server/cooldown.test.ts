import { describe, it, expect } from "vitest";
import { decidePlay, MAX_PLAYS, COOLDOWN_MS } from "./cooldown";

const NOW = 1_800_000_000_000; // fixed reference time (ms)

describe("decidePlay — per-game play limit + cooldown", () => {
  it("allows the first play (no prior state)", () => {
    const d = decidePlay(0, null, NOW);
    expect(d.allowed).toBe(true);
    expect(d.nextBurst).toBe(1);
    expect(d.playsRemaining).toBe(MAX_PLAYS - 1);
    expect(d.nextLockMs).toBeNull();
  });

  it("counts up through the burst without locking until the cap", () => {
    for (let burst = 1; burst < MAX_PLAYS - 1; burst++) {
      const d = decidePlay(burst, null, NOW);
      expect(d.allowed).toBe(true);
      expect(d.nextBurst).toBe(burst + 1);
      expect(d.nextLockMs).toBeNull();
    }
  });

  it("the MAX_PLAYS-th play is allowed but starts the 2h lock", () => {
    // burst is currently MAX_PLAYS-1; this play makes it MAX_PLAYS and locks.
    const d = decidePlay(MAX_PLAYS - 1, null, NOW);
    expect(d.allowed).toBe(true);
    expect(d.nextBurst).toBe(MAX_PLAYS);
    expect(d.playsRemaining).toBe(0);
    expect(d.nextLockMs).toBe(NOW + COOLDOWN_MS);
  });

  it("rejects the next play while locked, reporting retry time", () => {
    const lockedUntil = NOW + COOLDOWN_MS;
    const d = decidePlay(MAX_PLAYS, lockedUntil, NOW + 60_000); // 1 min into the lock
    expect(d.allowed).toBe(false);
    expect(d.playsRemaining).toBe(0);
    expect(d.lockedUntil).toBe(lockedUntil);
    expect(d.retryAfterMs).toBe(COOLDOWN_MS - 60_000);
  });

  it("resets to a fresh burst once the lock has expired", () => {
    const lockedUntil = NOW; // lock lifts exactly at NOW
    const d = decidePlay(MAX_PLAYS, lockedUntil, NOW + 1); // just past expiry
    expect(d.allowed).toBe(true);
    expect(d.nextBurst).toBe(1); // fresh burst, not MAX_PLAYS+1
    expect(d.playsRemaining).toBe(MAX_PLAYS - 1);
    expect(d.nextLockMs).toBeNull();
  });

  it("a full cycle: 5 plays lock, wait out cooldown, 5 more allowed", () => {
    let burst = 0;
    let locked: number | null = null;
    // First 5 plays
    for (let i = 0; i < MAX_PLAYS; i++) {
      const d = decidePlay(burst, locked, NOW);
      expect(d.allowed).toBe(true);
      burst = d.nextBurst;
      locked = d.nextLockMs;
    }
    expect(burst).toBe(MAX_PLAYS);
    expect(locked).toBe(NOW + COOLDOWN_MS);

    // 6th play during lock → rejected
    expect(decidePlay(burst, locked, NOW + 1000).allowed).toBe(false);

    // After cooldown → allowed again, fresh burst
    const after = decidePlay(burst, locked, NOW + COOLDOWN_MS + 1);
    expect(after.allowed).toBe(true);
    expect(after.nextBurst).toBe(1);
  });
});
