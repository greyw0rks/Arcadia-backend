#!/usr/bin/env bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
RPC="https://forno.celo.org"
ARCADE="0xFb2F048B9A088d6Ef0Cf3413B90f4cEf76d0Eb49"

USDM="0x765de816845861e75a25fca122bb6898b8b1282a"
USDC="0xcebA9300f2b948710d2653dD7B07f33A8B32118C"
USDT="0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e"

AMOUNT_18="3000000000000000000"  # $3 USDm  (18 decimals)
AMOUNT_6="3000000"               # $3 USDC/USDT (6 decimals)

if [[ -z "${PK:-}" ]]; then
  echo "Error: set PK to your private key before running." >&2
  exit 1
fi

# forno's load balancer can serve a stale nonce between rapid txs ("nonce too low").
# Fetch the nonce ONCE and pass an explicit, incrementing --nonce to every tx to avoid it.
# --confirmations 1 waits for each tx to mine before the next, keeping the sequence in order.
FUNDER="$(cast wallet address --private-key "$PK")"
NONCE="$(cast nonce "$FUNDER" --rpc-url "$RPC")"
echo "Funder: $FUNDER  starting nonce: $NONCE"

# send <label> <to> <sig> <args...> — uses and increments the global NONCE.
send() {
  local label="$1" to="$2" sig="$3"; shift 3
  echo "==> $label (nonce $NONCE)..."
  cast send "$to" "$sig" "$@" \
    --rpc-url "$RPC" --private-key "$PK" --nonce "$NONCE" --confirmations 1 \
    >/dev/null
  echo "    ok"
  NONCE=$((NONCE + 1))
}

# ── Approvals ─────────────────────────────────────────────────────────────────
send "Approving USDm" "$USDM" "approve(address,uint256)" "$ARCADE" "$AMOUNT_18"
send "Approving USDC" "$USDC" "approve(address,uint256)" "$ARCADE" "$AMOUNT_6"
send "Approving USDT" "$USDT" "approve(address,uint256)" "$ARCADE" "$AMOUNT_6"

# ── Fund pool ─────────────────────────────────────────────────────────────────
send "Funding USDm" "$ARCADE" "fundPool(address,uint256)" "$USDM" "$AMOUNT_18"
send "Funding USDC" "$ARCADE" "fundPool(address,uint256)" "$USDC" "$AMOUNT_6"
send "Funding USDT" "$ARCADE" "fundPool(address,uint256)" "$USDT" "$AMOUNT_6"

echo "Done. Pool funded with \$3 each of USDm, USDC, USDT."
