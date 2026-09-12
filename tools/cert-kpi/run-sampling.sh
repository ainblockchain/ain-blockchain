#!/usr/bin/env bash
# 30분 샘플링 재현 드라이버 — 절차서 §0. 전 지표를 축소 파라미터로 1회씩 실행해 results/ 에 결과 JSON 을 남기고 요약표를 출력한다.
# 전수(성적서용) 실행은 절차서 §4~§9 의 명령을 그대로 쓴다. 판정 기준(합격선)은 샘플링에서도 동일하며, 표본 수만 줄인다.
#
# 사용: source env.sh && ./run-sampling.sh [TAG]            (기본 TAG=smp_<UTC시각>)
#   단계 선택: STEPS="net setup m1 m2 m3 m4 m5" (기본 전부). 예) STEPS="m1 m2 m3" ./run-sampling.sh
#   예행: DRY=1 ./run-sampling.sh  — 실행하지 않고 각 단계가 돌릴 명령을 그대로 출력한다 (절차 점검용)
#   전제: §3.1 완료(npm install, env.sh), 지표 4 는 gpt-oss-20b 가 로컬에 있고 vLLM 이 설치됨,
#         지표 5·6 은 Ainize 서빙·트레이너·노드가 이미 떠 있음(§8.2; 모델 적재는 30분에 포함하지 않는다).
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
KPI=${KPI_DIR:-$HERE}; export KPI_DIR=$KPI
HARNESS=$HERE/harness            # 스크립트 원본은 항상 번들 안 (KPI_DIR 은 결과·로그 위치만 바꾼다)
TAG=${1:-smp_$(date -u +%m%d%H%M)}
STEPS=${STEPS:-"net setup m1 m2 m3 m4 m5"}
CLIENT_CPUS=${CLIENT_CPUS:-}              # 단일 호스트: 검증자 코어(CHAIN_CPUS)와 분리하려면 예) 5-7
PIN=(); [ -n "$CLIENT_CPUS" ] && PIN=(taskset -c "$CLIENT_CPUS")
RES=$KPI/results; mkdir -p "$RES" "$KPI/logs"
has() { case " $STEPS " in *" $1 "*) return 0;; *) return 1;; esac; }
DRY=${DRY:-0}
# run: 예행 모드면 명령만 출력하고 실행하지 않는다
run() { if [ "$DRY" = 1 ]; then echo "    \$ $*"; else "$@"; fi; }
t_start=$(date +%s); step_t=$t_start
lap() { local now=$(date +%s); echo "[sampling] $1 — $((now-step_t))s (누적 $(( (now-t_start)/60 ))분)"; step_t=$now; }
summary() { node -e '
const fs=require("fs"), p=process.argv[1], keys=process.argv.slice(2);
if (!fs.existsSync(p)) { console.log("  (결과 파일 없음: " + p + ")"); }
else { const d=JSON.parse(fs.readFileSync(p));
  console.log("  " + keys.map(k => k + "=" + JSON.stringify(d[k])).join("  ") + "  pass=" + d.pass); }
' "$@"; }

cd "$HERE"
if has net; then
  echo "[sampling] 1/7 인증망 기동 (검증자 10, epoch 1s)"
  if [ -f cert-net.pids ] && kill -0 $(head -1 cert-net.pids) 2>/dev/null; then echo "  이미 기동됨 ($(python3 -c "import json;print(json.load(open('cert-net.manifest.json'))['genesisHash'])"))"
  elif [ "$DRY" = 1 ]; then echo "    \$ CONFIG=cert-10-nodes DATA=\$KPI/chaindata ./start-cert-net.sh"
  else CONFIG=cert-10-nodes DATA=${DATA:-$KPI/chaindata} "$HERE/start-cert-net.sh" || { echo "인증망 기동 실패"; exit 1; }; fi
  lap "인증망"
fi
cd "$HARNESS"
if has setup; then echo "[sampling] 2/7 시험 앱 생성"; run "${PIN[@]}" node setup_app.js || { [ "$DRY" = 1 ] || exit 1; }; lap "setup_app"; fi
if has m1; then
  echo "[sampling] 3/7 지표 1 — 파이프라인 70 × 2회 (전수: 10회)"
  for r in 1 2; do
    if [ "$DRY" = 1 ]; then echo "    \$ RUN_ID=${TAG}_m1_r$r node m1-sharding.js"; else
      RUN_ID=${TAG}_m1_r$r "${PIN[@]}" node m1-sharding.js > "$KPI/logs/${TAG}_m1_r$r.log" 2>&1 || echo "  m1 r$r 실패 (로그 $KPI/logs/${TAG}_m1_r$r.log)"; fi
  done
  lap "지표 1"
fi
if has m2; then
  echo "[sampling] 4/7 지표 2 — L2 채널 20·유저 200, 20초 × 1회 (전수: 60초 × 3회)"
  # ANCHOR_EVERY 를 줄여 20초 안에도 채널마다 앵커가 ≥1회 나오게 한다 (판정: 채널별 앵커 수 == floor(seq/ANCHOR_EVERY), 표본 ≥ 100)
  if [ "$DRY" = 1 ]; then echo "    \$ RUN_ID=${TAG}_m2_r1 DUR=${M2_DUR:-20000} ANCHOR_EVERY=${M2_ANCHOR_EVERY:-2000} node m2-l2.js"; else
    RUN_ID=${TAG}_m2_r1 DUR=${M2_DUR:-20000} ANCHOR_EVERY=${M2_ANCHOR_EVERY:-2000} "${PIN[@]}" node m2-l2.js > "$KPI/logs/${TAG}_m2_r1.log" 2>&1 || echo "  m2 실패 (로그 $KPI/logs/${TAG}_m2_r1.log)"; fi
  lap "지표 2"
fi
if has m3; then
  echo "[sampling] 5/7 지표 3 — GPU 노드 역할 5 × 2라운드 = 10건 (전수: 5라운드 × 3회)"
  if [ "$DRY" = 1 ]; then echo "    \$ RUN_ID=${TAG}_m3_r1 ROUNDS=${M3_ROUNDS:-2} node m3-latency.js"; else
    RUN_ID=${TAG}_m3_r1 ROUNDS=${M3_ROUNDS:-2} "${PIN[@]}" node m3-latency.js > "$KPI/logs/${TAG}_m3_r1.log" 2>&1 || echo "  m3 실패 (로그 $KPI/logs/${TAG}_m3_r1.log)"; fi
  lap "지표 3"
fi
if has m4; then
  echo "[sampling] 6/7 지표 4 — Locust 240U/60W, 30초 × 1회 (전수: 60초 × 3회)"
  if [ "$DRY" = 1 ]; then echo "    \$ GPUS=\"${M4_GPUS:-0 1}\" ASC=${M4_ASC:-3} harness/m4-start-vllm.sh   # 이미 떠 있으면 생략"
  elif ! curl -sf -m 2 "http://127.0.0.1:${VLLM_FIRST_PORT:-8001}/v1/models" >/dev/null; then
    GPUS="${M4_GPUS:-0 1}" ASC=${M4_ASC:-3} "$HARNESS/m4-start-vllm.sh" || echo "  vLLM 기동 실패"
  fi
  if [ "$DRY" = 1 ]; then echo "    \$ M4_RUN=${TAG}_m4_r1 DUR=${M4_DUR:-30} "$HARNESS/m4-run-locust.sh""; else
    M4_RUN=${TAG}_m4_r1 DUR=${M4_DUR:-30} VLLM_PORTS=${VLLM_PORTS:-8001,8002} "$HARNESS/m4-run-locust.sh" > "$KPI/logs/${TAG}_m4_r1.log" 2>&1 || echo "  m4 실패 (로그 $KPI/logs/${TAG}_m4_r1.log)"; fi
  if [ "$DRY" = 1 ]; then echo "    \$ harness/m4-stop-vllm.sh"; elif [ "${M4_KEEP_VLLM:-0}" != 1 ]; then "$HARNESS/m4-stop-vllm.sh" >/dev/null; fi
  lap "지표 4"
fi
if has m5; then
  N=${M5_LESSONS:-1}
  echo "[sampling] 7/7 지표 5·6 — DART 타입 ${N}종 teach→publish→apply→온체인 (전수: 108종, 순차 약 20시간)"
  PROG=$RES/m5-ainize-progress-${TAG}.json
  # 데이터셋: 전수용 dart-datasets/ (dart-build-datasets.py 산출) 가 없으면 저장소에 포함된 2종 샘플(dart-datasets-sample/) 사용
  [ -f dart-datasets/manifest.json ] || export MANIFEST=$KPI/harness/dart-datasets-sample/manifest.json
  if [ "$DRY" = 1 ]; then
    echo "    \$ LESSONS=$N MIN_OK=$N PROGRESS=$PROG node m5-ainize.js"; echo "    \$ LESSONS=$N MIN_OK=$N PROGRESS=$PROG node m5-ainize.js --stack"
  else
    LESSONS=$N MIN_OK=$N PROGRESS=$PROG node m5-ainize.js > "$KPI/logs/${TAG}_m5.log" 2>&1 || echo "  m5 수업 실패 (로그 $KPI/logs/${TAG}_m5.log)"
    LESSONS=$N MIN_OK=$N PROGRESS=$PROG node m5-ainize.js --stack >> "$KPI/logs/${TAG}_m5.log" 2>&1 || echo "  m5 스택 검증 실패"
  fi
  lap "지표 5·6"
fi

echo; echo "=== 샘플링 요약 ($TAG, 총 $(( ($(date +%s)-t_start)/60 ))분) — 전수 결과·판정은 절차서 맨 앞 "현재 판정" ==="
has m1 && { echo "지표 1 (m1-${TAG}_m1_r1/r2)"; summary "$RES/m1-${TAG}_m1_r1.json" pipelines verifiedOnChain txsFinalized totalMs; summary "$RES/m1-${TAG}_m1_r2.json" pipelines verifiedOnChain txsFinalized totalMs; }
has m2 && { echo "지표 2 (m2-${TAG}_m2_r1)"; summary "$RES/m2-${TAG}_m2_r1.json" maxTPS sustainedTPS p50LatencyMs p99LatencyMs channelsSettledOnChain; }
has m3 && { echo "지표 3 (m3-${TAG}_m3_r1)"; summary "$RES/m3-${TAG}_m3_r1.json" avgMs samples confirmedAll; }
has m4 && { echo "지표 4 (m4-final-${TAG}_m4_r1)"; summary "$RES/m4-final-${TAG}_m4_r1.json" maxTPS_1sWindow sustainedTPS users workers sampleVerified; }
has m5 && { echo "지표 5 (m5-final)"; summary "$RES/m5-final.json" supported target; echo "지표 6 (m6-final)"; summary "$RES/m6-final.json" supported target; }
