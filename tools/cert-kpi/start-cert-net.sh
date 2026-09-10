#!/usr/bin/env bash
# cert-10-nodes-m4 로컬 인증망 기동: tracker(8079) + 노드 10개(8081-8090)
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
KPI_DIR=${KPI_DIR:-$HERE/work}
DATA=$KPI_DIR/chaindata
LOGS=$KPI_DIR/logs
PIDF=$KPI_DIR/cert-net.pids
CONFIGS=${BLOCKCHAIN_CONFIGS_DIR:-blockchain-configs/cert-10-nodes-m4}
cd "$REPO"
mkdir -p "$DATA" "$LOGS"
: > "$PIDF"

echo "[cert-net] starting tracker :8079"
PORT=8079 CONSOLE_LOG=false node ./tracker-server/index.js > "$LOGS/tracker.log" 2>&1 &
echo $! >> "$PIDF"
sleep 3

start_node () {
  local i=$1
  local KEY
  KEY=$(node -e "console.log(require('$REPO/blockchain-configs/base/genesis_accounts.json').others[$i].private_key)")
  local EXTRA=""
  [ "$i" -eq 8 ] && EXTRA="ENABLE_EVENT_HANDLER=true EVENT_HANDLER_PORT=5100"
  [ "$i" -eq 9 ] && EXTRA="ENABLE_EVENT_HANDLER=true EVENT_HANDLER_PORT=5101"
  echo "[cert-net] starting node$i :$((8081+i)) p2p:$((5001+i)) $EXTRA"
  env UNSAFE_PRIVATE_KEY="$KEY" \
    BLOCKCHAIN_CONFIGS_DIR=$CONFIGS \
    BLOCKCHAIN_DATA_DIR="$DATA/node$i" \
    PORT=$((8081+i)) P2P_PORT=$((5001+i)) \
    TRACKER_UPDATE_JSON_RPC_URL=http://localhost:8079/json-rpc \
    PEER_CANDIDATE_JSON_RPC_URL=http://localhost:8081/json-rpc \
    HOSTING_ENV=local CONSOLE_LOG=false \
    ENABLE_EXPRESS_RATE_LIMIT=false \
    ENABLE_GAS_FEE_WORKAROUND=true ENABLE_TX_SIG_VERIF_WORKAROUND=true \
    ENABLE_REST_FUNCTION_CALL=true \
    TX_POOL_SIZE_LIMIT=1000000 TX_POOL_SIZE_LIMIT_PER_ACCOUNT=200000 \
    MAX_NUM_INBOUND_CONNECTION=12 TARGET_NUM_OUTBOUND_CONNECTION=9 \
    $EXTRA \
    node ./client/index.js > "$LOGS/node$i.log" 2>&1 &
  echo $! >> "$PIDF"
}

start_node 0
# 시드 노드 SERVING 대기
for t in $(seq 1 60); do
  s=$(curl -s http://localhost:8081/node_status 2>/dev/null | grep -o '"state":"[A-Z]*"' | head -1)
  [ "$s" = '"state":"SERVING"' ] && break
  sleep 2
done
echo "[cert-net] node0: $s"

for i in $(seq 1 9); do start_node "$i"; sleep 2; done

echo "[cert-net] waiting all SERVING..."
for t in $(seq 1 90); do
  ok=0
  for i in $(seq 0 9); do
    s=$(curl -s http://localhost:$((8081+i))/node_status 2>/dev/null | grep -o '"state":"SERVING"')
    [ -n "$s" ] && ok=$((ok+1))
  done
  echo "  serving: $ok/10"
  [ "$ok" -eq 10 ] && break
  sleep 3
done
echo "[cert-net] done. pids: $(cat $PIDF | tr '\n' ' ')"
