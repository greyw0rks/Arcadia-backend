// server/v2/flag.ts — the single read of the V2 kill switch.
//
// V2 is the weekly pooled buy-in economy (docs/ARCADIA_V2_ECONOMY_SPEC.md). It runs only on the
// isolated staging deploy — its own Railway project, its own database — and must stay invisible in
// production until it ships.
//
// Strict === "true" so an unset var, "false", "0" or a typo all read as OFF. The switch must fail
// closed: a mistyped value that silently enabled a money feature in production is the exact failure
// this guards against.

export const V2_ENABLED = process.env.V2_ENABLED === "true";

// V2_PUBLIC opens the beta to everyone on THIS deploy: no invite code, no tester allowlist. Callers
// still prove wallet ownership at redeem (a payout must bind to a real wallet), but the private-
// invite barrier is gone.
//
// This is safe to flip ONLY on the staging deploy, and only because production never serves V2 at
// all: proxy.ts 404s every /api/v2 and /v2 route unless V2_ENABLED=true, and prod leaves it unset.
// So V2_PUBLIC has no effect anywhere V2 is invisible. NEVER set V2_PUBLIC on a deploy that also has
// V2_ENABLED=true against the production database — that is the one combination this must not meet.
//
// Same strict === "true" fail-closed contract as V2_ENABLED.
export const V2_PUBLIC = process.env.V2_PUBLIC === "true";

