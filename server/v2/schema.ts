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
`;

/** Create V2 tables. No-op unless V2_ENABLED; safe to run on every boot (idempotent DDL). */
export async function initV2Schema(): Promise<void> {
  if (!V2_ENABLED) return;
  const res = await query(V2_MIGRATIONS);
  if (res !== null) console.log("[v2] schema ready");
}
