#!/usr/bin/env bash
KPI=${KPI_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
# models100.json 전 모델 HF 캐시 사전 다운로드 (동시 4, safetensors/config/tokenizer만)
set -u
export HF_HUB_DISABLE_XET=1
HF=${HF_CLI:-hf}
export HF_HOME=${HF_HOME:-$KPI/hf-home}
mkdir -p "$HF_HOME"
LIST=$(node -e "console.log(require('"'"'$KPI'"'"'/harness/models100.json').map(m=>m.id).join('\n'))")
echo "$LIST" | xargs -P 4 -I{} sh -c '
  echo "[dl] start {}";
  '"$HF"' download {} --include "*.safetensors" "*.json" "*.model" "tokenizer*" "*.tiktoken" "*.txt" >/dev/null 2>>"$KPI/logs/download-err.log" \
    && echo "[dl] done {}" || echo "[dl] FAIL {}";
' 2>&1 | tee "$KPI/logs/download.log"
echo ALL_DOWNLOADS_ATTEMPTED
