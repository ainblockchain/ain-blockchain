#!/usr/bin/env bash
# M4 오프체인 추론 서버: gpt-oss-20b, GPU 당 vLLM 서버 1(TP=1), 포트 8001+GPU번호
# 실측 구성(8 vCPU 단일 호스트): GPUS="0 1" ASC=3 — 서버 2대, 엔진당 API 서버 프로세스 3개.
#   근거: 이 호스트에서는 CPU 가 병목이라 서버 수를 늘릴수록 240 동시성 TPS 가 내려간다
#   (probe 240 동시성: 8서버 ~860 / 5서버 ~950 / 4서버 ~1,090 / 3서버(asc2) ~1,130 / 2서버(asc3) ~1,200 max TPS).
#   vLLM 프로세스는 코어 VLLM_CPUS(기본 2-7)에 고정, 체인은 0-2 (start-cert-net.sh).
# 사용: [GPUS="0 1"] [ASC=3] [VLLM_CPUS=2-7] ./m4-start-vllm.sh ; 헬스체크까지 대기. 로그 logs/vllm/s<port>_<시각>.log (덮어쓰지 않음), PID logs/vllm/pids
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
KPI=${KPI_DIR:-$(cd "$HERE/.." && pwd)}
VLLM=${VLLM:-vllm}                               # vLLM 0.24.1.dev1 실측 (증빙: logs/vllm/vllm-version.txt). env.sh 에서 venv 경로 지정 가능
[ -n "${VLLM_ENV:-}" ] && export PATH=$VLLM_ENV/bin:$PATH   # ninja 등 venv 도구
export VLLM_USE_FLASHINFER_SAMPLER=0             # 호스트 nvcc 가 CUDA 11.5 → FlashInfer 샘플러 JIT 불가, torch 샘플러 사용 (이 호스트 공통 설정)
TAG=$(date +%Y%m%d-%H%M%S)
MODEL=${M4_MODEL_DIR:-openai/gpt-oss-20b}            # 로컬 디렉토리 또는 HF id
GPUS=(${GPUS:-0 1})
ASC=${ASC:-3}                                    # --api-server-count (엔진당 API 서버 프로세스 수)
EXTRA=${EXTRA:---disable-uvicorn-access-log}      # 추가 vLLM 플래그
VLLM_CPUS=${VLLM_CPUS:-2-7}
PIN=(); [ -n "$VLLM_CPUS" ] && PIN=(taskset -c "$VLLM_CPUS")
LOGS=$KPI/logs/vllm
mkdir -p "$LOGS"; : > "$LOGS/pids"
"$VLLM" --version 2>/dev/null | tail -1 > "$LOGS/vllm-version.txt"
for g in "${GPUS[@]}"; do
  port=$((8001 + g))
  echo "[m4-vllm] gpu$g -> :$port"
  CUDA_VISIBLE_DEVICES=$g nohup "${PIN[@]}" "$VLLM" serve "$MODEL" --host 127.0.0.1 --port $port \
    --max-model-len 4096 --served-model-name gpt-oss-20b --gpu-memory-utilization 0.9 --api-server-count $ASC $EXTRA \
    > "$LOGS/s${port}_$TAG.log" 2>&1 &
  echo $! >> "$LOGS/pids"
done
echo "[m4-vllm] waiting for /v1/models on all servers..."
for t in $(seq 1 360); do
  ok=0
  for g in "${GPUS[@]}"; do curl -sf -m 2 http://127.0.0.1:$((8001 + g))/v1/models >/dev/null 2>&1 && ok=$((ok+1)); done
  echo "  ready: $ok/${#GPUS[@]}"
  [ "$ok" -eq "${#GPUS[@]}" ] && { echo "[m4-vllm] all ready"; exit 0; }
  sleep 5
done
echo "[m4-vllm] timeout"; exit 1
