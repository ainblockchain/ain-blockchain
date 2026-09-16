#!/usr/bin/env bash
KPI=${KPI_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
# M6: 데이터셋 100종 lm-eval 평가 — GPU 샤드 병렬 (기본 6 GPU)
# 사용: bash m6-run.sh [CONC] [LIMIT]
set -u
GPUS=(${GPUS:-0 1 2 3 4 5})
CONC=${#GPUS[@]}
LIMIT=${2:-500}          # 절차서 §9.2: 나머지 95종 --limit 500
FULL_TASKS="mmlu hellaswag arc_challenge truthfulqa_mc2 gsm8k"   # 1단계 검증 5종은 전수 평가
MODEL=${M6_MODEL:-Qwen/Qwen2.5-1.5B-Instruct}
EVALBIN=${LM_EVAL:-lm_eval}
export HF_HOME=${HF_HOME:-$KPI/hf-home}
export HF_HUB_DISABLE_XET=1
export HF_DATASETS_TRUST_REMOTE_CODE=1
export TMPDIR=${TMPDIR:-$KPI/tmp}; mkdir -p "$TMPDIR"
export HF_ALLOW_CODE_EVAL=1
cd "$KPI/harness"
OUT=${EVAL_RESULTS:-$KPI/eval_results}
LOGS=$KPI/logs/m6
mkdir -p "$OUT" "$LOGS"

mapfile -t TASKS < datasets100.txt

run_shard () {
  local slot=$1
  local gpu=${GPUS[$slot]}
  local i
  for ((i=slot; i<${#TASKS[@]}; i+=CONC)); do
    local t=${TASKS[$i]}
    if compgen -G "$OUT/$t/**/results*.json" > /dev/null 2>&1 || compgen -G "$OUT/$t/results*.json" > /dev/null 2>&1; then
      echo "[gpu$gpu] skip $t (done)"; continue
    fi
    local limit_args=(--limit "$LIMIT")
    case " $FULL_TASKS " in *" $t "*) limit_args=() ;; esac
    echo "[gpu$gpu] eval $t (${limit_args[*]:-full})"
    CUDA_VISIBLE_DEVICES=$gpu "$EVALBIN" --model hf \
      --model_args pretrained=$MODEL,dtype=bfloat16 \
      --tasks "$t" "${limit_args[@]}" --batch_size auto --confirm_run_unsafe_code \
      --output_path "$OUT/$t" > "$LOGS/$t.log" 2>&1 \
      && echo "[gpu$gpu] OK $t" || echo "[gpu$gpu] FAIL $t"
  done
}

for ((s=0; s<CONC; s++)); do run_shard "$s" & done
wait
echo M6_RUNS_DONE
ls "$OUT" | wc -l
