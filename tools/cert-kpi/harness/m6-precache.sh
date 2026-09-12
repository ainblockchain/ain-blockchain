#!/usr/bin/env bash
KPI=${KPI_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
# M6 사전 준비: 데이터셋 100종을 GPU 없이(dummy 모델) 로드해 HF 캐시에 내려받고 로드 오류를 미리 확인
export HF_HOME=${HF_HOME:-$KPI/hf-home} HF_HUB_DISABLE_XET=1 HF_DATASETS_TRUST_REMOTE_CODE=1 TMPDIR=${TMPDIR:-$KPI/tmp}
cd "$KPI/harness"
mkdir -p "$KPI/logs/m6-precache" "${TMPDIR:-$KPI/tmp}"
while read -r t; do
  [ -z "$t" ] && continue
  if "${LM_EVAL:-lm_eval}" --model dummy --tasks "$t" --limit 5 --output_path "${TMPDIR:-$KPI/tmp}/m6-dummy" > "$KPI/logs/m6-precache/$t.log" 2>&1; then echo "OK $t"; else echo "FAIL $t"; fi
done < datasets100.txt
echo PRECACHE_DONE
