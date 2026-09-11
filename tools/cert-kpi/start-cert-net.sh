#!/usr/bin/env bash
# 인증망 기동: tracker(8079) + 검증자 노드 10개(8081-8090, p2p 5001-5010), 이벤트 핸들러 node8/9(5100/5101)
# 전 지표(1~6) 공용 단일 설정. 기본 blockchain-configs/cert-10-nodes (epoch 1s, 검증자 10, 대역폭 1e6).
# 사용: [CONFIG=cert-10-nodes] [DATA=$KPI_DIR/chaindata] [RESUME=1] [CHAIN_CPUS=0-4] ./start-cert-net.sh
#   KPI_DIR: 결과·로그·체인데이터 루트(기본: 이 스크립트가 있는 tools/cert-kpi). AIN_BLOCKCHAIN_REPO: 노드 코드(기본: 이 저장소).
#   RESUME=1: 같은 설정의 기존 데이터 디렉토리에서 재기동(블록·상태를 디스크에서 복구). 재기동 후 genesis hash 가 이전 매니페스트와 같아야 한다.
# 기동 후 cert-net.manifest.json 에 설정 디렉토리·genesis hash·PID 를 기록한다 (결과 JSON env 에 인용).
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
KPI=${KPI_DIR:-$HERE}
REPO=${AIN_BLOCKCHAIN_REPO:-$(cd "$HERE/../.." && pwd)}
CONFIG=${CONFIG:-cert-10-nodes}
DATA=${DATA:-$KPI/chaindata}
LOGS=$KPI/logs
PIDF=$KPI/cert-net.pids
MANIFEST=$KPI/cert-net.manifest.json
# 체인 프로세스를 전용 코어에 고정(vLLM/Locust/Ainize 와 CPU 분리). 빈 값이면 고정하지 않음.
#   실측: 검증자 10 · epoch 1s 는 상태가 커지면 3코어(0-2)로 부족해 epoch 이 밀리고 제안이 경합하다 상태 해시 불일치로 정지했다(블록 4204) → 기본 0-4.
CHAIN_CPUS=${CHAIN_CPUS:-0-4}
PIN=(); [ -n "$CHAIN_CPUS" ] && PIN=(taskset -c "$CHAIN_CPUS")

cd "$REPO" || { echo "ain-blockchain repo not found: $REPO (set AIN_BLOCKCHAIN_REPO)"; exit 1; }
[ -f "blockchain-configs/$CONFIG/genesis_block.json.gz" ] || { echo "no genesis for $CONFIG (run make-cert-config.js + createGenesisBlock.js)"; exit 1; }
if [ -f "$PIDF" ]; then for p in $(cat "$PIDF"); do kill -0 "$p" 2>/dev/null && { echo "cert-net process $p still running (pids in $PIDF) — run stop-cert-net.sh first"; exit 1; }; done; fi
for port in 8079 $(seq 8081 8090) $(seq 5001 5010) 5100 5101; do ss -ltn 2>/dev/null | grep -q ":$port " && { echo "port $port already in use"; exit 1; }; done
if [ -d "$DATA" ] && [ -n "$(ls -A "$DATA" 2>/dev/null)" ] && [ "${RESUME:-0}" != "1" ]; then
  echo "DATA dir $DATA is not empty — a different genesis cannot reuse it. Choose a new DATA= dir (old data is kept), or RESUME=1 to restart the same chain from disk."; exit 1
fi
PREV_GENESIS=$( [ -f "$MANIFEST" ] && python3 -c "import json;print(json.load(open('$MANIFEST')).get('genesisHash',''))" 2>/dev/null || true )
mkdir -p "$DATA" "$LOGS"
: > "$PIDF"

echo "[cert-net] config=$CONFIG data=$DATA"
echo "[cert-net] starting tracker :8079"
"${PIN[@]}" env PORT=8079 CONSOLE_LOG=false node ./tracker-server/index.js > "$LOGS/tracker.log" 2>&1 &
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
  "${PIN[@]}" env UNSAFE_PRIVATE_KEY="$KEY" \
    BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/$CONFIG \
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
for t in $(seq 1 60); do
  s=$(curl -s http://localhost:8081/node_status 2>/dev/null | grep -o '"state":"[A-Z]*"' | head -1)
  [ "$s" = '"state":"SERVING"' ] && break
  sleep 2
done
echo "[cert-net] node0: $s"
for i in $(seq 1 9); do start_node "$i"; sleep 2; done

echo "[cert-net] waiting all SERVING..."
ok=0
for t in $(seq 1 ${WAIT_TRIES:-90}); do
  ok=0
  for i in $(seq 0 9); do
    s=$(curl -s http://localhost:$((8081+i))/node_status 2>/dev/null | grep -o '"state":"SERVING"')
    [ -n "$s" ] && ok=$((ok+1))
  done
  echo "  serving: $ok/10"
  [ "$ok" -eq 10 ] && break
  sleep 3
done
if [ "$ok" -ne 10 ]; then echo "[cert-net] FAILED: only $ok/10 nodes SERVING — stopping"; kill $(cat "$PIDF") 2>/dev/null; rm -f "$PIDF"; exit 1; fi

GENESIS=$(curl -s http://localhost:8081/json-rpc -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"ain_getBlockByNumber","params":{"protoVer":"1.6.0","number":0}}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['result']['result']['hash'])" 2>/dev/null)
EPOCH=$(curl -s 'http://localhost:8081/get_value?ref=/blockchain_params/genesis/epoch_ms' | python3 -c "import sys,json;print(json.load(sys.stdin)['result'])" 2>/dev/null)
python3 - "$CONFIG" "$DATA" "$GENESIS" "$EPOCH" "$ok" "$PIDF" "$MANIFEST" "$CHAIN_CPUS" <<'PY'
import sys, json, time
cfg, data, genesis, epoch, ok, pidf, manifest, cpus = sys.argv[1:]
json.dump({
  "configDir": f"blockchain-configs/{cfg}", "dataDir": data, "genesisHash": genesis,
  "epochMs": int(epoch) if epoch.isdigit() else epoch, "servingNodes": int(ok), "nodes": 10,
  "chainCpus": cpus or None, "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
  "pids": [int(l) for l in open(pidf).read().split()],
}, open(manifest, "w"), indent=2)
PY
if [ "${RESUME:-0}" = "1" ] && [ -n "${PREV_GENESIS:-}" ] && [ "$PREV_GENESIS" != "$GENESIS" ]; then echo "[cert-net] GENESIS MISMATCH after resume: $PREV_GENESIS vs $GENESIS"; exit 1; fi
echo "[cert-net] done. genesis=$GENESIS epoch_ms=$EPOCH serving=$ok/10 → $MANIFEST"
