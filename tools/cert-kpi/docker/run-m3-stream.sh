#!/usr/bin/env bash
set -euo pipefail
KPI=$(cd "$(dirname "$0")/.." && pwd)
RUN_ID=${RUN_ID:-m3_stream_$(date -u +%Y%m%dT%H%M%SZ)}
COUNT=${COUNT:-200}
INTERVAL_MS=${INTERVAL_MS:-250}
[[ "$RUN_ID" =~ ^[A-Za-z0-9_-]+$ && "$COUNT" =~ ^[1-9][0-9]*$ && "$INTERVAL_MS" =~ ^[1-9][0-9]*$ ]] || exit 1
OUT="$KPI/evidence/$RUN_ID"
mkdir "$OUT"
RUN_ID="${RUN_ID}_observer" HARNESS_CPUS=2 HARNESS_CPUSET=0-7 HARNESS_MEMORY=4g \
  bash "$KPI/docker/run-harness.sh" m3-stream.js observer "$RUN_ID" "$((COUNT * 5))" > "$OUT/observer-wrapper.log" 2>&1 &
observer=$!
echo "$observer" > "$OUT/observer-pid.txt"
ready=false
for attempt in {1..90}; do
  if curl -fsS --max-time 2 http://127.0.0.1:19210/ready > "$OUT/ready.json" 2>/dev/null && \
    node -e 'const r=require(process.argv[1]);process.exit(r.ready===true && r.runId===process.argv[2]?0:1)' "$OUT/ready.json" "$RUN_ID"; then ready=true; break; fi
  if ! kill -0 "$observer" 2>/dev/null; then wait "$observer"; exit 1; fi
  sleep 2
done
[[ "$ready" == true ]] || { echo 'observer readiness expired; inspect existing handle before retry'; exit 1; }
pids=()
for producer in {1..5}; do
  RUN_ID="${RUN_ID}_producer${producer}" HARNESS_CPUS=1 HARNESS_CPUSET=0-7 HARNESS_MEMORY=2g \
    bash "$KPI/docker/run-harness.sh" m3-stream.js producer "$RUN_ID" "$producer" "$COUNT" "$INTERVAL_MS" > "$OUT/producer${producer}-wrapper.log" 2>&1 &
  pids+=("$!")
done
printf '%s\n' "${pids[@]}" > "$OUT/producer-pids.txt"
code=0
for process in "${pids[@]}"; do wait "$process" || code=1; done
wait "$observer" || code=1
if [[ -f "$KPI/results/m3-stream-$RUN_ID.json" ]]; then
  RUN_ID="${RUN_ID}_verify" bash "$KPI/docker/run-harness.sh" verify-m3-stream.js "$RUN_ID" > "$OUT/verifier-wrapper.log" 2>&1 || code=1
else
  echo 'observer produced no report; preserve the raw files and inspect the failure'
  code=1
fi
echo "stream exit=$code evidence=$OUT"
exit "$code"
