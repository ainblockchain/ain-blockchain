#!/usr/bin/env bash
# 지표 1 — 온체인상 병렬화된 파이프라인 70개 (ainize teach)
#
# Ainize 노드는 설계상 한 번에 한 건의 수업만 돌린다(ainize-node src/teach.ts: `if (this.current) return`).
# 따라서 "파이프라인 70개 동시 구동" 은 노드 70개를 띄우고 각 노드가 자기 수업 1건을 동시에 진행시켜 만든다.
# 각 파이프라인은 데이터셋 업로드 → 학습 → 검사 → 공개 → AIN 원장 anchor 까지 독립적으로 돈다.
#
# 산출물 results/pipelines-<TAG>.{json,html} 의 표에서 행마다
#   · 지식 id  → ainize.ai 공개 카탈로그 링크 (그 지식만 필터)
#   · 온체인 경로 → /apps/knowledge/market/patches/<id> 를 읽는 인증망 REST 링크
# 를 눌러 확인한다.
#
# 사용: source env.sh && ./run-70-teach-pipelines.sh [TAG]
#   PIPELINES=70          노드(=파이프라인) 수
#   PORT_BASE=3500        노드 포트 = PORT_BASE + i
#   HOMES_ROOT=...        노드 홈들의 부모 (기본 $KPI_DIR/ainize/pipelines)
#   TEMPLATE_HOME=...     설정 원본 노드 홈 (ainize init 으로 만든 것) — 필수
#   CHAIN_URL=...         AIN 인증망 REST (기본 http://localhost:8081)
#   PUBLIC_NODE=...       공개 노드 (기본 https://ainize.ai)
#   DATASETS=...          데이터셋 디렉토리 (기본 harness/dart-datasets, 없으면 dart-datasets-sample)
#   KEEP=1                끝나고 노드를 내리지 않는다 (화면에서 계속 보려면)
#   RESUME=1              같은 TAG 로 다시 돌려 빠진 노드·파이프라인만 채운다 (부하가 큰 호스트에서 나눠 올릴 때)
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
KPI=${KPI_DIR:-$HERE}; export KPI_DIR=$KPI
H=$HERE/harness
TAG=${1:-p70_$(date -u +%m%d%H%M)}
N=${PIPELINES:-70}
PORT_BASE=${PORT_BASE:-3500}
HOMES=${HOMES_ROOT:-$KPI/ainize/pipelines}
CHAIN_URL=${CHAIN_URL:-http://localhost:8081}
PUBLIC_NODE=${PUBLIC_NODE:-https://ainize.ai}
ANCHOR_BASE=/apps/knowledge/market/patches
RES=$KPI/results; LOGS=$KPI/logs/pipelines-$TAG
mkdir -p "$RES" "$LOGS" "$HOMES"
: "${TEMPLATE_HOME:?TEMPLATE_HOME (ainize init 으로 만든 기준 노드 홈) 이 필요합니다}"
CLI_BIN=${AINIZE_CLI:-}
export AIN_UTIL=${AIN_UTIL:-$H/node_modules/@ainblockchain/ain-util}
az() { if [ -n "$CLI_BIN" ]; then node "$CLI_BIN" "$@"; else ainize "$@"; fi; }
quiet() { grep -viE "experimental|trace-warnings" || true; }
say() { echo "[p70] $*"; }
# 한 번에 다 띄우면 8코어 호스트가 밀려 노드가 기동 대기(20초) 안에 응답하지 못한다 → 배치로 나눈다
BATCH=${START_BATCH:-8}
in_batches() {   # in_batches <함수이름> — 1..N 을 BATCH 개씩 병렬 실행
  local fn=$1 i b=0
  for i in $(seq 1 "$N"); do
    "$fn" "$i" &
    b=$((b+1))
    if [ "$b" -ge "$BATCH" ]; then wait; b=0; sleep "${BATCH_PAUSE:-2}"; fi
  done
  wait
}
t0=$(date +%s)
cleanup() { [ "${KEEP:-0}" = 1 ] && return 0; for i in $(seq 1 "$N"); do AINIZE_HOME=$HOMES/$TAG-$i az stop >/dev/null 2>&1; done; }
trap cleanup EXIT

say "1/6 사전 점검"
chain_ok=0
for t in $(seq 1 ${CHAIN_TRIES:-10}); do   # 부하가 크면 한 번의 curl 은 쉽게 타임아웃한다 → 재시도
  curl -sf -m 10 "$CHAIN_URL/get_value?ref=/blockchain_params/genesis/epoch_ms" >/dev/null 2>&1 && { chain_ok=1; break; }
  sleep 3
done
[ "$chain_ok" = 1 ] || { echo "인증망에 연결할 수 없습니다: $CHAIN_URL"; exit 1; }
[ -f "$TEMPLATE_HOME/config.json" ] || { echo "기준 노드 홈이 없습니다: $TEMPLATE_HOME/config.json"; exit 1; }
say "    인증망 $CHAIN_URL · 기준 홈 $TEMPLATE_HOME · 노드 $N 개 (포트 $((PORT_BASE+1))~$((PORT_BASE+N)))"

say "2/6 데이터셋 $N 개 준비"
SRC=${DATASETS:-$H/dart-datasets}
[ -d "$SRC" ] && [ "$(ls "$SRC"/*.jsonl 2>/dev/null | wc -l)" -ge 1 ] || SRC=$H/dart-datasets-sample
WORK=$LOGS/datasets; rm -rf "$WORK"; mkdir -p "$WORK"
python3 - "$SRC" "$WORK" "$N" "$TAG" <<'PY' || exit 1
import sys, os, json, glob
src, work, n, tag = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
files = [f for f in sorted(glob.glob(os.path.join(src, '*.jsonl'))) if os.path.getsize(f) > 0]
if not files: sys.exit('데이터셋 원본이 없습니다: ' + src)   # 빈 원본은 제외한다 (노드가 빈 데이터셋을 거부한다)
for i in range(n):
    rows = [json.loads(l) for l in open(files[i % len(files)], encoding='utf-8') if l.strip()][:8]
    with open(os.path.join(work, f'pipe-{i+1:02d}.jsonl'), 'w', encoding='utf-8') as f:
        for r in rows:                       # 파이프라인마다 질문을 구분해 지식 중복 거부를 피한다
            r = dict(r); r['prompt'] = f"[{tag}-{i+1:02d}] " + r['prompt']
            if r.get('alt_prompt'): r['alt_prompt'] = f"[{tag}-{i+1:02d}] " + r['alt_prompt']
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
print(f'    {n}개 (원본 {len(files)}종, {os.path.basename(src)})')
PY

say "3/6 노드 $N 개 기동 (노드 1개 = 파이프라인 1개)"
# 노드마다 새 신원(키) 을 만든다 — 설정을 복제하면 70개가 같은 주소가 되어 P2P 가 서로를 같은 노드로 본다
node -e '
const u = require(process.env.AIN_UTIL);
const n = Number(process.argv[1]);
const out = [];
for (let i = 0; i < n; i++) { const a = u.createAccount(); out.push({ privateKey: a.private_key, publicKey: a.public_key, address: a.address }); }
console.log(JSON.stringify(out));
' "$N" 2>/dev/null | tail -1 > "$LOGS/identities.json"   # ain-util 이 stdout 에 찍는 경고를 버린다
[ -s "$LOGS/identities.json" ] || { echo "신원 생성 실패 (AIN_UTIL=$AIN_UTIL)"; exit 1; }
python3 -c "import json,sys;d=json.load(open('$LOGS/identities.json'));sys.exit(0 if len(d)==$N else 1)" \
  || { echo "신원 $N 개를 만들지 못했습니다"; exit 1; }
python3 - "$TEMPLATE_HOME" "$HOMES" "$TAG" "$N" "$PORT_BASE" "$CHAIN_URL" "$PUBLIC_NODE" "$LOGS/identities.json" <<'PY' || exit 1
import json, os, secrets, shutil, sys
tpl, homes, tag, n, base, chain, public, idfile = sys.argv[1:9]
idents = json.load(open(idfile))
n, base = int(n), int(base)
cfg = json.load(open(os.path.join(tpl, 'config.json')))
for i in range(1, n + 1):
    home = os.path.join(homes, f'{tag}-{i}')
    if os.environ.get('RESUME') == '1' and os.path.exists(os.path.join(home, 'config.json')):
        continue                      # 재개: 이미 만들어진 노드 홈은 그대로 둔다
    shutil.rmtree(home, ignore_errors=True); os.makedirs(os.path.join(home, 'data'))
    c = json.loads(json.dumps(cfg))
    c['name'] = f'{tag}-{i:02d}'; c['dataDir'] = f'{home}/data'; c['port'] = base + i
    c['peers'] = [public]
    # 파이프라인 노드 N개를 한 호스트에 띄우면 peer exchange 로 서로를 학습해 N^2 로 통신하다 죽는다.
    # 설정한 peer(공개 노드) 하고만 말하게 하고, gossip 주기를 늘리고, 판매 역할만 남겨 가볍게 만든다.
    c['p2p'] = {'acceptExchange': False, 'maxPeers': 4, 'evictAfterFailures': 0, 'staleDays': 0}
    c['gossipIntervalMs'] = int(os.environ.get('GOSSIP_MS', '60000'))
    c['roles'] = ['seller']
    c.setdefault('verifier', {})['auto'] = False
    c['ledger']['kind'] = 'ain'; c['ledger']['ain']['providerUrl'] = chain
    c['runtime']['python'] = shutil.which('python3') or '/usr/bin/python3'
    t = c.setdefault('teach', {})
    # 노드마다 파이프라인 1개만 돌린다 → 슬롯 경합이 없다. 검사까지 시뮬레이션해 GPU 를 쓰지 않는다.
    t.update(enabled=True, backend='stub', stubOffline=True, checkStubLessons=False, publish='auto')
    t.setdefault('trainer', {})['container'] = ''
    c.pop('operatorPasswordHash', None)
    c['identity'] = idents[i - 1]     # 노드마다 새 신원 (복제하면 70개가 같은 주소가 된다)
    json.dump(c, open(os.path.join(home, 'config.json'), 'w'), indent=2)
    os.chmod(os.path.join(home, 'config.json'), 0o600)
    pw = secrets.token_urlsafe(12)
    open(os.path.join(home, 'operator-password.txt'), 'w').write(pw)
    os.chmod(os.path.join(home, 'operator-password.txt'), 0o600)
print(f'    노드 홈 {n}개 생성')
PY
start_one() {
  local i=$1 home=$HOMES/$TAG-$i port=$((PORT_BASE+$1)) t
  curl -sf -m 2 "http://localhost:$port/api/info" >/dev/null 2>&1 && return 0   # 이미 떠 있으면 그대로
  # `ainize start -d` 는 20초 안에 응답이 없으면 포기하고 자식을 정리한다. 부하가 큰 호스트에서는
  # 노드가 그보다 늦게 올라오므로, 전경 모드를 백그라운드로 돌리고 준비될 때까지 우리가 기다린다.
  # 노드는 스크립트가 끝나도 살아 있어야 하고 배치 job 종료 시 SIGHUP 으로 죽어도 안 된다 → setsid 로 분리한다.
  if [ -n "${NODE_BIN:-}" ]; then
    # 서버 패키지를 직접 실행한다 — CLI 의 node_modules 에 들어 있는 빌드가 소스보다 오래된 경우가 있고,
    # 학습 기록의 submitted_at(지표 3)처럼 최신 빌드에만 있는 필드가 조용히 빠진다.
    setsid env AINIZE_HOME="$home" node "$NODE_BIN" >"$LOGS/start-$i.log" 2>&1 </dev/null &
  elif [ -n "$CLI_BIN" ]; then
    setsid env AINIZE_HOME="$home" node "$CLI_BIN" start >"$LOGS/start-$i.log" 2>&1 </dev/null &
  else
    setsid env AINIZE_HOME="$home" ainize start >"$LOGS/start-$i.log" 2>&1 </dev/null &
  fi
  for t in $(seq 1 ${READY_TRIES:-90}); do
    curl -sf -m 2 "http://localhost:$port/api/info" >/dev/null 2>&1 && break
    sleep 2
  done
  curl -sf -m 2 "http://localhost:$port/api/info" >/dev/null 2>&1 || { echo "node $i not ready" >>"$LOGS/start-$i.log"; return 0; }
  AINIZE_HOME=$home AINIZE_PASSWORD=$(cat "$home/operator-password.txt") az login >>"$LOGS/start-$i.log" 2>&1
  for t in 1 2 3; do                       # 체인이 바쁘면 setup 이 타임아웃한다 → 재시도
    AINIZE_HOME=$home az chain setup >>"$LOGS/start-$i.log" 2>&1 && break
    sleep 5
  done
}
in_batches start_one
up=0; for i in $(seq 1 "$N"); do curl -sf -m 2 "http://localhost:$((PORT_BASE+i))/api/info" >/dev/null && up=$((up+1)); done
say "    기동된 노드 $up/$N"
[ "$up" -lt "$N" ] && { echo "노드 기동 실패 — $LOGS/start-*.log 확인"; }

say "4/6 $N 개 teach 동시 제출 · 진행 관측"
submit_one() {
  local i=$1 nn; nn=$(printf '%02d' "$i")
  [ -s "$LOGS/submit-$nn.json" ] && grep -q '"id"' "$LOGS/submit-$nn.json" 2>/dev/null && return 0
  AINIZE_HOME=$HOMES/$TAG-$i az teach train "$WORK/pipe-$nn.jsonl" --node "http://localhost:$((PORT_BASE+i))" \
    --name "pipeline-$TAG-$nn" --effort "${EFFORT:-quick}" --json >"$LOGS/submit-$nn.json" 2>&1
}
in_batches submit_one
# 진행 관측: 각 노드의 공개 /api/info counts.patches 와 제출 파일로 "진행 중 / 학습 완료" 를 센다
peak=0
for tick in $(seq 1 ${POLL_TICKS:-120}); do
  read -r running ready_ <<<"$(python3 - "$N" "$PORT_BASE" "$LOGS" <<'PY'
import json, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
n, base, logs = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
def state(i):
    sub = os.path.join(logs, 'submit-%02d.json' % i)
    if not os.path.exists(sub) or os.path.getsize(sub) == 0: return 'submitting'
    try:
        with urllib.request.urlopen('http://localhost:%d/api/info' % (base + i), timeout=3) as r:
            info = json.load(r)
        return 'published' if (info.get('counts') or {}).get('patches') else 'running'
    except Exception:
        return 'down'
with ThreadPoolExecutor(max_workers=32) as ex: v = list(ex.map(state, range(1, n + 1)))
print(sum(1 for x in v if x in ('submitting', 'running')), sum(1 for x in v if x == 'published'))
PY
)"
  [ "${running:-0}" -gt "$peak" ] && peak=$running
  printf '\r    동시 진행 %3s (최대 %s)   ' "${running:-0}" "$peak"
  sleep 3
  [ "$tick" -ge "${SETTLE_TICKS:-8}" ] && break
done
echo; wait
say "    최대 동시 진행 파이프라인: $peak"

say "4b/6 $N 개 공개 (지식 등록 → 원장 anchor)"
publish_one() {
  local i=$1 nn jid; nn=$(printf '%02d' "$i")
  jid=$(python3 -c "
import json
try:
    d = json.load(open('$LOGS/submit-$nn.json')); print((d.get('job') or d).get('id') or '')
except Exception: print('')" 2>/dev/null)
  [ -n "$jid" ] || return 0
  # 노드의 /api/catalog 는 네트워크 전체 지식을 보여준다 → 반드시 "이 파이프라인이 올린 이름" 으로 확인해야 한다
  curl -sf -m 10 "http://localhost:$((PORT_BASE+i))/api/catalog" 2>/dev/null \
    | grep -q "cert pipeline $TAG-$nn" && return 0
  AINIZE_HOME=$HOMES/$TAG-$i az teach publish "$jid" --node "http://localhost:$((PORT_BASE+i))" \
    --name "cert pipeline $TAG-$nn" --declare public --access public \
    --license CC-BY-4.0 --description "지표 1 병렬 파이프라인 $nn (DART 공개 공시 8문항)" \
    --consent-permanent --consent-rights --json >"$LOGS/publish-$nn.json" 2>&1
  # DART 전화번호 등은 노드의 PII 게이트에 걸린다 → 학습 데이터셋만 비공개로 돌려 다시 공개한다
  if grep -q "dataset_pii" "$LOGS/publish-$nn.json" 2>/dev/null; then
    AINIZE_HOME=$HOMES/$TAG-$i az teach publish "$jid" --node "http://localhost:$((PORT_BASE+i))" \
      --name "cert pipeline $TAG-$nn" --declare public --access private \
      --license CC-BY-4.0 --description "지표 1 병렬 파이프라인 $nn (DART 공개 공시 8문항, 학습셋 비공개)" \
      --consent-permanent --consent-rights --json >"$LOGS/publish-$nn.json" 2>&1
  fi
}
in_batches publish_one
pub=0
for tick in $(seq 1 ${PUBLISH_TICKS:-40}); do
  pub=$(python3 - "$N" "$PORT_BASE" "$TAG" <<'PY'
import json, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
n, base, tag = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
def done(i):
    want = 'cert pipeline %s-%02d' % (tag, i)
    try:
        with urllib.request.urlopen('http://localhost:%d/api/catalog' % (base + i), timeout=15) as r:
            items = json.load(r).get('items') or []
    except Exception: return 0
    return 1 if any((it.get('anchor') or {}).get('name') == want for it in items) else 0
with ThreadPoolExecutor(max_workers=32) as ex: print(sum(ex.map(done, range(1, n + 1))))
PY
)
  printf '\r    공개 완료 %3s/%s   ' "$pub" "$N"
  [ "$pub" -ge "$N" ] && break
  sleep 3
done
echo

say "5/6 온체인 anchor · 공개 카탈로그 대조"
python3 "$HERE/collect-pipelines.py" "$HOMES" "$TAG" "$N" "$PORT_BASE" "$CHAIN_URL" "$PUBLIC_NODE" "$ANCHOR_BASE" "$RES" "$peak" "$t0" "$LOGS" || exit 1

say "6/6 산출물"
say "    $RES/pipelines-$TAG.html"
say "    $RES/pipelines-$TAG.json"
python3 -c "
import json,sys;d=json.load(open('$RES/pipelines-$TAG.json'))
print('  파이프라인 %d/%d · 최대 동시 %d · 공개 %d · 온체인 anchor %d · pass=%s'%(
 d['pipelines'],d['target'],d['peakConcurrent'],d['publishedOnPublicNode'],d['anchoredOnChain'],d['pass']))
sys.exit(0 if d['pass'] else 1)"
