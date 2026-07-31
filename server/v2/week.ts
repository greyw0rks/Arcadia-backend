// server/v2/week.ts — week and day boundaries.
//
// A "week" is the settlement period: entries accumulate, play happens, then the pot is split. The
// boundary decides when a player's multiplier stops moving and their payout is fixed, so it has to
// be unambiguous and identical everywhere — backend, contract weekId, and any operator tooling.
//
// UTC throughout. Local time would mean the week ends at different instants for different players,
// which for a shared pot is not a cosmetic difference: two players finishing the same round could
// land in different weeks.

/** Monday 00:00 UTC of the ISO week containing `at`. */
function weekStart(at: Date): Date {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  // getUTCDay: 0=Sunday. Shift so Monday is 0.
  const dayOffset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayOffset);
  return d;
}

/**
 * Week identifier as YYYYWW (e.g. 202631), used as the on-chain `weekId`.
 *
 * A plain integer rather than a timestamp because it appears in every merkle leaf and in contract
 * storage — it should be readable in a block explorer without decoding. Monotonic within a year;
 * the year prefix keeps it monotonic across years.
 */
export function weekIdFor(at: Date = new Date()): number {
  const start = weekStart(at);
  // ISO week number: Thursday of the same week determines the year the week belongs to.
  const thursday = new Date(start);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return thursday.getUTCFullYear() * 100 + week;
}

export function currentWeekId(): number {
  return weekIdFor(new Date());
}

/** UTC date key (YYYY-MM-DD) — the unit the daily free-round allowance resets on. */
export function dayKeyFor(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

export function todayKey(): string {
  return dayKeyFor(new Date());
}

/** When the given week ends (exclusive) — the instant after which no round counts toward it. */
export function weekEnd(weekId: number): Date {
  // Reconstruct from the id: find any date in that week by scanning forward from Jan 1.
  const year = Math.floor(weekId / 100);
  const week = weekId % 100;
  const jan4 = new Date(Date.UTC(year, 0, 4)); // Jan 4 is always in ISO week 1.
  const start = weekStart(jan4);
  start.setUTCDate(start.getUTCDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return end;
}

/** True once a week is over and its pot can be tallied. */
export function isWeekComplete(weekId: number, at: Date = new Date()): boolean {
  return at.getTime() >= weekEnd(weekId).getTime();
}
