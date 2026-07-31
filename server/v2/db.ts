// server/v2/db.ts — a database accessor that cannot silently lose money.
//
// server/db.ts `query()` returns null on ANY failure — no DATABASE_URL, connection lost, syntax
// error, constraint violation — and every existing caller reads null as "no rows". That is fine for
// leaderboards and profiles, where a blank read is a cosmetic miss. It is unsafe for V2:
//
//   const runs = await query("SELECT ... FROM weekly_runs WHERE ...");
//   if (!runs) return null;            // ← "player has no run" and "database is down" are the same
//
// Under that pattern a dropped connection during the weekend tally looks like "this player earned
// nothing", and a player who is owed money is silently excluded from the merkle root. The failure
// is invisible: no exception, no log, just a smaller payout.
//
// So V2's money paths use these instead. They THROW on failure. A thrown error aborts the tally and
// pages the operator; a null quietly ships a wrong root that the contract will happily honour,
// because on-chain the root is authoritative and there is no second check.

import { query } from "../db";

export class V2DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "V2DatabaseError";
  }
}

/**
 * Run a query, throwing if the database is unavailable. Use for anything that touches money:
 * entries, multipliers, bust state, payouts.
 */
export async function mustQuery<T extends Record<string, unknown>>(
  sql: string,
  values?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  const res = await query<T>(sql, values);
  if (res === null) {
    // Deliberately does not include `values` — they can carry wallet addresses.
    throw new V2DatabaseError(`database unavailable for: ${sql.trim().slice(0, 120)}`);
  }
  return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
}

/** Exactly one row expected — throws if the query returns any other count. */
export async function mustQueryOne<T extends Record<string, unknown>>(
  sql: string,
  values?: unknown[]
): Promise<T> {
  const res = await mustQuery<T>(sql, values);
  if (res.rows.length !== 1) {
    throw new V2DatabaseError(
      `expected exactly 1 row, got ${res.rows.length}: ${sql.trim().slice(0, 120)}`
    );
  }
  return res.rows[0];
}

/** At most one row. Distinguishes "no row" (null) from "database down" (throws). */
export async function mustQueryMaybe<T extends Record<string, unknown>>(
  sql: string,
  values?: unknown[]
): Promise<T | null> {
  const res = await mustQuery<T>(sql, values);
  if (res.rows.length > 1) {
    throw new V2DatabaseError(
      `expected at most 1 row, got ${res.rows.length}: ${sql.trim().slice(0, 120)}`
    );
  }
  return res.rows[0] ?? null;
}
