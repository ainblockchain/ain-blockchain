#!/usr/bin/env bash
# M4 측정 실행 — 계획서 규정: "Locust command 를 통해 240 User 를 60 Worker 에 분산하여 TPS 측정"
#   1) recorder ×2 기동 (M4_RUN 바인딩)  2) Locust worker 60 + master(-u 240 -r 240 --expect-workers 60 -t DUR)
#   3) recorder /drain  4) m4-verify-merkle.js (Locust 통계 기반 1초 윈도우 TPS + 머클/최종화 검증) → results/m4-final-<run>.json
# 사용: M4_RUN=cert_m4_r1 [DUR=60] [USERS=240] [WORKERS=60] [VLLM_PORTS=8001,...] ./m4-run-locust.sh
# CPU 배치(8코어 단일 호스트): 체인 0-2(start-cert-net.sh), vLLM 2-7(m4-start-vllm.sh), Locust 워커/마스터는 전 코어(0-7) 허용 + nice 5
#   (체인 코어의 유휴분을 흡수하되 vLLM·체인에 우선순위를 양보).
set -uo pipefail
[[ "${CHAIN_CONTAINER_PROJECT:-}" == ain-cert-docker && -f /.dockerenv ]] || { echo 'use kpi/docker/run-m4.sh'; exit 1; }
KPI=${KPI_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
H=$KPI/harness
RES=$KPI/results
LOGS=$KPI/logs/m4/${M4_RUN:?M4_RUN required}
PY=/opt/locust/bin
: "${M4_RUN:?M4_RUN required}"
DUR=${DUR:-60}; USERS=${USERS:-240}; WORKERS=${WORKERS:-60}
LOCUST_CPUS=${LOCUST_CPUS:-0-7}
[[ "$M4_RUN" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
[[ "$USERS" == 240 && "$WORKERS" == 60 && "$DUR" =~ ^[1-9][0-9]*$ ]] || { echo 'requires 240 users, 60 workers and positive DUR'; exit 1; }
export M4_RUN VLLM_PORTS=${VLLM_PORTS:-18001,18002,18003,18004,18005} RESULTS_DIR=$RES
mkdir -p "$LOGS"
node "$H/check-environment.js" || exit 1
"$PY/locust" --version 2>/dev/null | head -1 > "$LOGS/locust-version.txt"

# 0) 서버 헬스체크 + 회차 고유성 가드(결과 파일·온체인 경로에 같은 M4_RUN 이 있으면 거부)
for p in ${VLLM_PORTS//,/ }; do curl -sf -m 3 http://127.0.0.1:$p/v1/models >/dev/null || { echo "vLLM :$p not ready"; exit 1; }; done
[ -e "$RES/m4-final-$M4_RUN.json" ] && { echo "result m4-final-$M4_RUN.json already exists — use a new M4_RUN"; exit 1; }
onchain=$(curl -fsS -m 5 "http://localhost:${CHAIN_PORT_BASE:?}/get_value?ref=/apps/ai_network_dag/inference_results_v2/$M4_RUN&is_shallow=true" | python3 -c 'import sys,json; response=json.load(sys.stdin); assert "result" in response; print("used" if response["result"] is not None else "free")') || { echo 'chain uniqueness check failed'; exit 1; }
[ "$onchain" = "used" ] && { echo "on-chain path inference_results_v2/$M4_RUN already exists — use a new M4_RUN"; exit 1; }
for i in 0 1; do curl -sf -m 3 http://localhost:$((9100+i))/stats >/dev/null 2>&1 && { echo "recorder :$((9100+i)) already running (stop it first)"; exit 1; }; done

# 1) recorder ×2 (node1/node2 로 앵커 기록). 스크립트가 어떤 이유로든 끝나면 recorder·워커를 정리한다
RPIDS=(); WPIDS=()
cleanup () { kill "${WPIDS[@]}" "${RPIDS[@]}" 2>/dev/null; }
trap cleanup EXIT
for i in 0 1; do
  M4_RUN=$M4_RUN RID=$i PORT=$((9100+i)) nohup node "$H/recorder.js" > "$LOGS/recorder${i}_$M4_RUN.log" 2>&1 &
  RPIDS+=($!)
done
sleep 3
for i in 0 1; do curl -sf -m 3 http://localhost:$((9100+i))/stats >/dev/null || { echo "recorder $i failed to start"; cat "$LOGS/recorder${i}_$M4_RUN.log"; exit 1; }; done

# 2) Locust master + 60 workers (계획서 규정)
cd "$H"
for w in $(seq 1 "$WORKERS"); do
  taskset -c "$LOCUST_CPUS" nice -n 5 "$PY/locust" -f locustfile.py --worker --master-host 127.0.0.1 --master-port 5557 \
    > "$LOGS/worker${w}_$M4_RUN.log" 2>&1 &
  WPIDS+=($!)
done
echo "[m4] $WORKERS workers spawned; starting master: -u $USERS -r $USERS -t ${DUR}s"
taskset -c "$LOCUST_CPUS" nice -n 5 "$PY/locust" -f locustfile.py --master --master-bind-port 5557 --expect-workers "$WORKERS" \
  --expect-workers-max-wait 180 --headless -u "$USERS" -r "$USERS" -t "${DUR}s" --host "http://127.0.0.1:${VLLM_PORTS%%,*}" \
  --csv "$RES/m4_${M4_RUN}_locust" --csv-full-history --only-summary 2>&1 | tee "$LOGS/master_$M4_RUN.log"
MEXIT=${PIPESTATUS[0]}
# 워커는 마스터의 quit 을 받아 스스로 종료하며 그때 워커 덤프(locust_worker_<pid>.json)를 쓴다 → 60개가 다 나올 때까지(최대 90초) 기다린 뒤 정리
for t in $(seq 1 90); do
  n=$(ls "$RES/m4_ts_$M4_RUN"/locust_worker_*.json 2>/dev/null | wc -l)
  [ "$n" -ge "$WORKERS" ] && break; sleep 1
done
echo "[m4] worker dumps: $n/$WORKERS"
kill "${WPIDS[@]}" 2>/dev/null; sleep 2; kill -9 "${WPIDS[@]}" 2>/dev/null

# 3) recorder 드레인 (큐+inflight 0 확인) → 상태 스냅샷 저장 → 정지 → 검증
for i in 0 1; do
  d=$(curl -sf -m 600 http://localhost:$((9100+i))/drain) || { echo "recorder $i drain failed"; exit 1; }
  echo "$d" | python3 -c 'import sys,json;s=json.load(sys.stdin);assert s["queued"]==0 and s["inflight"]==0, s' || { echo "recorder $i not drained: $d"; exit 1; }
  curl -sf -m 5 http://localhost:$((9100+i))/stats > "$RES/m4_${M4_RUN}_recorder${i}_stats.json"
done
kill "${RPIDS[@]}" 2>/dev/null; sleep 1
# 4) 검증 + 최종 리포트 (recorder 상태는 위 스냅샷 파일에서 읽음)
node "$H/m4-verify-merkle.js"; VEXIT=$?
echo "[m4] master exit=$MEXIT verify exit=$VEXIT → $RES/m4-final-$M4_RUN.json"
if [ "$MEXIT" -ne 0 ]; then exit "$MEXIT"; fi
exit "$VEXIT"
