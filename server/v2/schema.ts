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
`;

/** Create V2 tables. No-op unless V2_ENABLED; safe to run on every boot (idempotent DDL). */
export async function initV2Schema(): Promise<void> {
  if (!V2_ENABLED) return;
  const res = await query(V2_MIGRATIONS);
  if (res !== null) console.log("[v2] schema ready");
}
