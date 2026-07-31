import { describe, it, expect } from "vitest";
import { weekIdFor, weekEnd, isWeekComplete, dayKeyFor } from "./week";

// Week boundaries decide when a multiplier stops moving and a payout is fixed, and the weekId goes
// into every merkle leaf and into contract storage. An off-by-one here misallocates real money, so
// the round-trip (date -> weekId -> week window) is pinned rather than assumed.

const utc = (s: string) => new Date(`${s}T12:00:00Z`);

describe("weekIdFor", () => {
  it("is stable across every day of one ISO week", () => {
    // Mon 2026-07-27 .. Sun 2026-08-02 is a single ISO week.
    const ids = [
      "2026-07-27", "2026-07-28", "2026-07-29",
      "2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02",
    ].map((d) => weekIdFor(utc(d)));
    expect(new Set(ids).size).toBe(1);
  });

  it("rolls over on Monday, not Sunday", () => {
    const sunday = weekIdFor(utc("2026-08-02"));
    const monday = weekIdFor(utc("2026-08-03"));
    expect(monday).not.toBe(sunday);
    expect(monday).toBeGreaterThan(sunday);
  });

  it("increases monotonically week over week", () => {
    let prev = 0;
    for (let d = 1; d <= 360; d += 7) {
      const at = new Date(Date.UTC(2026, 0, d, 12));
      const id = weekIdFor(at);
      expect(id).toBeGreaterThan(prev);
      prev = id;
    }
  });

  it("encodes YYYYWW", () => {
    const id = weekIdFor(utc("2026-07-29"));
    expect(String(id)).toMatch(/^2026\d{2}$/);
    expect(id % 100).toBeGreaterThanOrEqual(1);
    expect(id % 100).toBeLessThanOrEqual(53);
  });
});

describe("weekEnd round-trips with weekIdFor", () => {
  it("every date falls inside its own week's window", () => {
    for (let d = 1; d <= 365; d += 3) {
      const at = new Date(Date.UTC(2026, 0, d, 12));
      const id = weekIdFor(at);
      const end = weekEnd(id);
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 7);
      expect(at.getTime(), `date ${at.toISOString()} outside week ${id}`).toBeGreaterThanOrEqual(start.getTime());
      expect(at.getTime()).toBeLessThan(end.getTime());
    }
  });

  it("ends at Monday 00:00 UTC", () => {
    const end = weekEnd(weekIdFor(utc("2026-07-29")));
    expect(end.getUTCDay()).toBe(1);
    expect(end.getUTCHours()).toBe(0);
    expect(end.getUTCMinutes()).toBe(0);
  });
});

describe("isWeekComplete", () => {
  it("is false during the week and true after it", () => {
    const id = weekIdFor(utc("2026-07-29"));
    expect(isWeekComplete(id, utc("2026-07-29"))).toBe(false);
    expect(isWeekComplete(id, new Date(weekEnd(id).getTime() - 1))).toBe(false);
    expect(isWeekComplete(id, weekEnd(id))).toBe(true);
  });
});

describe("dayKeyFor", () => {
  it("is a UTC calendar date", () => {
    expect(dayKeyFor(new Date("2026-07-29T23:59:59Z"))).toBe("2026-07-29");
    expect(dayKeyFor(new Date("2026-07-30T00:00:00Z"))).toBe("2026-07-30");
  });

  it("does not shift with local time — a shared pot needs one clock", () => {
    // 23:30 UTC is already "tomorrow" in some zones; the key must not follow local time.
    expect(dayKeyFor(new Date("2026-07-29T23:30:00Z"))).toBe("2026-07-29");
  });
});
