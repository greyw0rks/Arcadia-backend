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
