// server/v2/schema.ts — V2-only tables, kept OUT of server/db.ts MIGRATIONS.
//
// db.ts runs its MIGRATIONS string on every startup of every deploy. V2 DDL living there would
// create these tables in production the moment the branch merged, flag or no flag. Instead this
// runs only from ensureBooted() when V2_ENABLED is true — i.e. only on the staging deploy.

import { query } from "../db";
import { V2_ENABLED } from "./flag";

const V2_MIGRATIONS = `
-- Invite codes for the private V2 test. Minted by the operator (see /api/admin/v2/codes).
CREATE TABLE IF NOT EXISTS access_codes (
  code        TEXT        PRIMARY KEY,
  label       TEXT,
  max_uses    INTEGER     NOT NULL DEFAULT 1,
  uses        INTEGER     NOT NULL DEFAULT 0,
  revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One redemption binds one wallet to one code. address is the PK, so a wallet can only ever
-- hold one code — re-redeeming is a conflict, not a second grant.
CREATE TABLE IF NOT EXISTS code_redemptions (
  address     TEXT        PRIMARY KEY,
  code        TEXT        NOT NULL REFERENCES access_codes(code),
  chain       TEXT        NOT NULL,
  revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS code_redemptions_code ON code_redemptions (code);

-- One row per scored answer during the private beta. This is the calibration sample: the V2
-- difficulty curve (spec §4.1/§4.2) is built on four *invented* per-tier accuracies — easy 85% /
-- medium 65% / hard 45% / extreme 30% — and a guessed skill spread. Until these are measured,
-- every bust-rate and payout number downstream of them is provisional.
--
-- It is append-only and cannot be backfilled: an answer not recorded when it was given is gone.
-- That is why this ships with the first tester build rather than after it.
CREATE TABLE IF NOT EXISTS calibration_samples (
  id           BIGSERIAL   PRIMARY KEY,
  session_id   TEXT        NOT NULL,
  player       TEXT        NOT NULL,
  chain        TEXT        NOT NULL,
  game_id      TEXT        NOT NULL,
  round_index  INTEGER     NOT NULL,
  tier         SMALLINT,               -- 0=easy … 3=extreme; NULL for procedural games (math)
  correct      BOOLEAN     NOT NULL,
  on_time      BOOLEAN     NOT NULL,   -- false = timed out; scored wrong but not a knowledge miss
  response_ms  INTEGER     NOT NULL,
  difficulty   NUMERIC,                -- session difficulty 0..1, i.e. which tier recipe was in use
  is_demo      BOOLEAN     NOT NULL DEFAULT FALSE,
  answered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A round is scored exactly once; the constraint makes a retried write a no-op rather than a
  -- duplicate that would quietly bias the accuracy figures.
  UNIQUE (session_id, round_index)
);

CREATE INDEX IF NOT EXISTS calibration_samples_tier ON calibration_samples (tier);
CREATE INDEX IF NOT EXISTS calibration_samples_player ON calibration_samples (player);

-- ── Weekly economy ─────────────────────────────────────────────────────────
-- One row per (player, week, run). A "run" is a life: it starts at 1.0x on entry or rebuy and ends
-- at bust. A player can hold several runs in a week — the busted ones plus at most one live one.
--
-- Money tables. Read them through server/v2/db.ts (mustQuery), NEVER server/db.ts query(), which
-- returns null on failure and would make "database down" indistinguishable from "earned nothing".
CREATE TABLE IF NOT EXISTS weekly_runs (
  id            BIGSERIAL   PRIMARY KEY,
  week_id       BIGINT      NOT NULL,
  player        TEXT        NOT NULL,
  chain         TEXT        NOT NULL,
  -- Stored in basis points, not a float. 1.0x = 10000. The multiplier decides a payout, and
  -- repeated float addition of 0.1 does not round-trip (0.1+0.2 !== 0.3).
  multiplier_bp INTEGER     NOT NULL DEFAULT 10000,
  busted        BOOLEAN     NOT NULL DEFAULT FALSE,
  busted_at     TIMESTAMPTZ,
  -- Entry that opened this run: 'entry' for the week's first, 'rebuy' after a bust.
  opened_by     TEXT        NOT NULL DEFAULT 'entry',
  -- On-chain transaction that paid for this run, so a run can always be traced to a payment.
  entry_tx      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A player may hold at most ONE live run per week. Enforced in the database rather than in code:
-- the check has to hold under concurrent requests, and a partial unique index is the only place
-- that is true regardless of how many processes are serving.
CREATE UNIQUE INDEX IF NOT EXISTS weekly_runs_one_live
  ON weekly_runs (week_id, player, chain) WHERE NOT busted;

CREATE INDEX IF NOT EXISTS weekly_runs_week ON weekly_runs (week_id, chain);

-- One row per scored round. Append-only: the audit trail behind every multiplier, so a disputed
-- payout can be reconstructed round by round rather than taken on trust.
CREATE TABLE IF NOT EXISTS weekly_rounds (
  id             BIGSERIAL   PRIMARY KEY,
  run_id         BIGINT      NOT NULL REFERENCES weekly_runs(id),
  day            DATE        NOT NULL,
  -- 0-based index within the day. Rounds at or beyond the free allowance are purchased.
  day_index      INTEGER     NOT NULL,
  purchased      BOOLEAN     NOT NULL DEFAULT FALSE,
  correct        INTEGER     NOT NULL,
  passed         BOOLEAN     NOT NULL,
  delta_bp       INTEGER     NOT NULL,
  multiplier_bp  INTEGER     NOT NULL,  -- resulting multiplier, for a replayable audit trail
  session_id     TEXT,
  scored_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A round is scored once. Makes a retried write idempotent instead of double-counting a payout.
  UNIQUE (run_id, day, day_index)
);

CREATE INDEX IF NOT EXISTS weekly_rounds_run ON weekly_rounds (run_id);

-- One game session banks at most ONE round, ever.
--
-- Without this, a player who finished a 15/15 session could POST it repeatedly: each submission
-- gets the next day_index, passes the (run_id, day, day_index) constraint, and banks another
-- +0.10x. The per-slot constraint above stops accidental retries of the SAME slot; this stops
-- deliberate replay of the same WIN into new slots. Partial, because older rows and any future
-- non-session-backed round may carry a NULL session_id.
CREATE UNIQUE INDEX IF NOT EXISTS weekly_rounds_session
  ON weekly_rounds (session_id) WHERE session_id IS NOT NULL;

-- The weekend tally: the exact per-player amounts that go into the merkle root. Written once when
-- a week is settled, and kept so the published root can be re-derived and audited later.
CREATE TABLE IF NOT EXISTS weekly_payouts (
  week_id     BIGINT      NOT NULL,
  player      TEXT        NOT NULL,
  chain       TEXT        NOT NULL,
  -- Best multiplier across the player's runs that week (busted runs score 0).
  best_bp     INTEGER     NOT NULL,
  -- Share of the pot in the token's smallest unit, as a string: amounts exceed Number.MAX_SAFE_INTEGER
  -- for 18-decimal tokens, and this figure is what the contract pays.
  amount      NUMERIC     NOT NULL,
  leaf        TEXT        NOT NULL,
  settled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (week_id, player, chain)
);

-- One row per settled week: the root published on-chain plus the inputs it was derived from.
CREATE TABLE IF NOT EXISTS weekly_settlements (
  week_id       BIGINT      PRIMARY KEY,
  chain         TEXT        NOT NULL,
  root          TEXT        NOT NULL,
  total_payout  NUMERIC     NOT NULL,
  pot           NUMERIC     NOT NULL,
  players       INTEGER     NOT NULL,
  published_tx  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/** Create V2 tables. No-op unless V2_ENABLED; safe to run on every boot (idempotent DDL). */
export async function initV2Schema(): Promise<void> {
  if (!V2_ENABLED) return;
  const res = await query(V2_MIGRATIONS);
  if (res !== null) console.log("[v2] schema ready");
}
