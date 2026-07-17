// server/db.ts — PostgreSQL pool + schema bootstrap
//
// Set DATABASE_URL to any Postgres connection string. We use a free Neon (neon.tech) database and
// set DATABASE_URL on the Railway service that runs this backend. SSL is auto-enabled for any
// non-localhost host (Neon requires it). When DATABASE_URL is absent (local dev without a DB) all
// exports become graceful no-ops so the server still starts and falls back to in-memory behaviour.

import { Pool, type QueryResult } from "pg";

let pool: Pool | null = null;
let ready = false;
let initPromise: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on("error", (err) => {
      console.warn("[db] pool error:", err.message);
    });
  }
  return pool;
}

// ---------------------------------------------------------------------------
// Schema bootstrap — idempotent DDL, safe to run on every startup
// ---------------------------------------------------------------------------

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS player_profiles (
  address     TEXT        PRIMARY KEY,
  username    TEXT,
  avatar      TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS demo_used (
  address     TEXT        NOT NULL,
  chain       TEXT        NOT NULL,
  used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (address, chain)
);

CREATE TABLE IF NOT EXISTS game_history (
  session_id    TEXT        PRIMARY KEY,
  player        TEXT        NOT NULL,
  chain         TEXT        NOT NULL,
  unit          TEXT        NOT NULL,
  stake         NUMERIC     NOT NULL,
  multiplier_bp INTEGER     NOT NULL,
  payout        NUMERIC     NOT NULL,
  won           BOOLEAN     NOT NULL,
  difficulty    NUMERIC,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS game_history_player ON game_history (player);

-- Permanent, append-only log of every game played (real + demo). Records WHICH game a wallet
-- played and its on-chain session id — the game identity is not stored on-chain, so this table is
-- the authoritative answer to "what game did address X play?".
CREATE TABLE IF NOT EXISTS game_plays (
  id          BIGSERIAL   PRIMARY KEY,
  address     TEXT        NOT NULL,
  chain       TEXT        NOT NULL,
  game_id     TEXT        NOT NULL,
  session_id  TEXT,
  is_demo     BOOLEAN     NOT NULL DEFAULT FALSE,
  stake       NUMERIC,
  unit        TEXT,
  played_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS game_plays_address ON game_plays (address, chain);
CREATE INDEX IF NOT EXISTS game_plays_session ON game_plays (session_id);

-- Per-(wallet, game) cooldown state. A wallet may play a game up to 5 times; the 5th play starts a
-- 2-hour lock. After the lock expires the burst counter resets to 0 and another 5 plays are allowed.
CREATE TABLE IF NOT EXISTS game_cooldowns (
  address       TEXT        NOT NULL,
  chain         TEXT        NOT NULL,
  game_id       TEXT        NOT NULL,
  burst_count   INTEGER     NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (address, chain, game_id)
);

-- Anti-cheat flags: one row per non-clean session verdict (timing analysis at finalize). Source for
-- manual review, operator alerts, and statistical clawback / wallet denylisting.
CREATE TABLE IF NOT EXISTS cheat_flags (
  session_id    TEXT        PRIMARY KEY,
  player        TEXT        NOT NULL,
  chain         TEXT        NOT NULL,
  game_id       TEXT        NOT NULL,
  verdict       TEXT        NOT NULL,   -- 'suspect' | 'flagged'
  reasons       JSONB       NOT NULL,
  stats         JSONB       NOT NULL,   -- SessionTimingStats snapshot
  stake         NUMERIC,
  unit          TEXT,
  multiplier_bp INTEGER     NOT NULL,
  enforced      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cheat_flags_player ON cheat_flags (player, chain);
`;

async function runMigrations(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(MIGRATIONS);
    console.log("[db] schema ready");
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Public init — called once at server startup; harmless if called multiple times
// ---------------------------------------------------------------------------

export async function initDb(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn("[db] DATABASE_URL not set — running without persistent storage (dev mode)");
    return;
  }
  if (ready) return;
  if (initPromise) return initPromise;
  initPromise = runMigrations()
    .then(() => { ready = true; })
    .catch((err) => {
      console.warn("[db] init failed, falling back to in-memory:", err.message);
      initPromise = null;
    });
  return initPromise;
}

// ---------------------------------------------------------------------------
// Safe query helper — returns null when DB is unavailable (graceful no-op)
// ---------------------------------------------------------------------------

export async function query<T extends Record<string, unknown>>(
  sql: string,
  values?: unknown[]
): Promise<QueryResult<T> | null> {
  if (!ready) return null;
  try {
    return await getPool().query<T>(sql, values);
  } catch (err) {
    console.warn("[db] query error:", (err as Error).message, "sql:", sql.slice(0, 80));
    return null;
  }
}
