#!/usr/bin/env bash
KPI=${KPI_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
# M5/M6 Ainize 스택 운용 (단일 호스트 재현): Qwen3.8-Flash-Next 서빙(GPU 0-3) + 상주 트레이너(GPU 4-6) + Ainize 노드(인증 체인 원장)
#   ./m5-ainize-stack.sh gpu-up            # docker start flashnext(서빙) flashtrain(트레이너) + 상주 트레이너 기동 + 서빙 준비 대기
#   ./m5-ainize-stack.sh gpu-down          # docker stop (M4 등 GPU 전용 시험 전)
#   ./m5-ainize-stack.sh node-init <home> <port>   # 기존 home/config.json 을 복제해 새 홈 생성(데이터 비움, 운영자 비밀번호 새로 설정)
#   ./m5-ainize-stack.sh node-start <home> # ainize start -d + chain setup(/apps/knowledge 등록·펀딩) + login + status
#   ./m5-ainize-stack.sh node-stop <home>
set -u
[ -n "${AINIZE_NODE_BIN:-}" ] && export PATH=$AINIZE_NODE_BIN:$PATH   # Node >= 24 가 PATH 에 없을 때만
export TMPDIR=${TMPDIR:-$KPI/tmp}; mkdir -p "$TMPDIR"
AZ=${AINIZE_ROOT:-$KPI/ainize}
CLI=$AZ/ainize-cli/dist/bin.js
TEMPLATE=$AZ/home/config.json
cmd=${1:-}; shift || true
case "$cmd" in
  gpu-up)
    docker start flashnext flashtrain
    sleep 5
    docker exec -d flashtrain bash -c 'python3 /work/resident/teach_server.py > /work/.teach/_server.log 2>&1'
    echo "waiting for Qwen serving :8000 ..."
    for t in $(seq 1 180); do curl -sf -m 3 http://localhost:8000/v1/models >/dev/null 2>&1 && { echo "serving ready"; break; }; sleep 10; done
    docker exec flashtrain bash -c 'tail -2 /work/.teach/_server.log'
    ;;
  gpu-down) docker stop flashnext flashtrain flashtrain2 2>/dev/null; nvidia-smi --query-gpu=index,memory.used --format=csv,noheader ;;
  node-init)
    home=$1; port=$2
    [ -d "$home" ] && { echo "$home exists"; exit 1; }
    mkdir -p "$home/data"
    python3 - "$TEMPLATE" "$home" "$port" <<'PY'
import json, sys, secrets, os
tpl, home, port = sys.argv[1], sys.argv[2], int(sys.argv[3])
c = json.load(open(tpl))
c["name"] = os.path.basename(home); c["dataDir"] = f"{home}/data"; c["port"] = port; c["peers"] = []
c.pop("operatorPasswordHash", None)            # 새 노드는 미청구 상태 → login 시 새 비밀번호 설정
json.dump(c, open(f"{home}/config.json", "w"), indent=2)
os.chmod(f"{home}/config.json", 0o600)
pw = secrets.token_urlsafe(12)
open(f"{home}/operator-password.txt", "w").write(pw); os.chmod(f"{home}/operator-password.txt", 0o600)
print("config written:", f"{home}/config.json", "ledger:", c["ledger"]["ain"]["providerUrl"], "trainer:", c["teach"]["trainer"]["container"])
PY
    cp "$AZ/home/teaching-key.json" "$home/" && chmod 600 "$home/teaching-key.json"
    ;;
  node-start)
    home=$1
    AINIZE_HOME=$home node "$CLI" start -d 2>&1 | tail -2
    sleep 4
    AINIZE_HOME=$home AINIZE_PASSWORD=$(cat "$home/operator-password.txt") node "$CLI" login 2>&1 | tail -2
    AINIZE_HOME=$home node "$CLI" chain setup 2>&1 | tail -4
    AINIZE_HOME=$home node "$CLI" status 2>&1 | tail -12
    AINIZE_HOME=$home node "$CLI" teach status 2>&1 | tail -6
    ;;
  node-stop) AINIZE_HOME=$1 node "$CLI" stop 2>&1 | tail -1 ;;
  *) echo "usage: $0 gpu-up|gpu-down|node-init <home> <port>|node-start <home>|node-stop <home>"; exit 1 ;;
esac
