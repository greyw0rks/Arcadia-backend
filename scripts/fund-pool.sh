#!/usr/bin/env bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
RPC="https://forno.celo.org"
ARCADE="0xFb2F048B9A088d6Ef0Cf3413B90f4cEf76d0Eb49"

USDM="0x765de816845861e75a25fca122bb6898b8b1282a"
USDC="0xcebA9300f2b948710d2653dD7B07f33A8B32118C"
USDT="0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e"

AMOUNT_18="2000000000000000000"  # $2 USDm  (18 decimals)
AMOUNT_6="2000000"               # $2 USDC/USDT (6 decimals)

if [[ -z "${PK:-}" ]]; then
  echo "Error: set PK to your private key before running." >&2
  exit 1
fi

# ── Approvals ─────────────────────────────────────────────────────────────────
echo "==> Approving USDm..."
cast send "$USDM" "approve(address,uint256)" "$ARCADE" "$AMOUNT_18" \
  --rpc-url "$RPC" --private-key "$PK"

echo "==> Approving USDC..."
cast send "$USDC" "approve(address,uint256)" "$ARCADE" "$AMOUNT_6" \
  --rpc-url "$RPC" --private-key "$PK"

echo "==> Approving USDT..."
cast send "$USDT" "approve(address,uint256)" "$ARCADE" "$AMOUNT_6" \
  --rpc-url "$RPC" --private-key "$PK"

# ── Fund pool ─────────────────────────────────────────────────────────────────
echo "==> Funding pool with USDm..."
cast send "$ARCADE" "fundPool(address,uint256)" "$USDM" "$AMOUNT_18" \
  --rpc-url "$RPC" --private-key "$PK"

echo "==> Funding pool with USDC..."
cast send "$ARCADE" "fundPool(address,uint256)" "$USDC" "$AMOUNT_6" \
  --rpc-url "$RPC" --private-key "$PK"

echo "==> Funding pool with USDT..."
cast send "$ARCADE" "fundPool(address,uint256)" "$USDT" "$AMOUNT_6" \
  --rpc-url "$RPC" --private-key "$PK"

echo "Done. Pool funded with \$2 each of USDm, USDC, USDT."
