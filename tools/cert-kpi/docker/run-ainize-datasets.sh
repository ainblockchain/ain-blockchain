#!/usr/bin/env bash
set -euo pipefail
KPI=$(cd "$(dirname "$0")/.." && pwd)
RUN_ID=${RUN_ID:-ainize_datasets_$(date -u +%Y%m%dT%H%M%SZ)}
[[ "$RUN_ID" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
OUT="$KPI/evidence/$RUN_ID"
mkdir "$OUT"
cp "$KPI/harness/ainize-datasets.js" "$OUT/source.js"
sha256sum "$OUT/source.js" > "$OUT/source.sha256"
docker inspect ain-cert-ainize-node-1 --format '{{json .HostConfig}}' > "$OUT/limits.json"
docker inspect ain-cert-ainize-node-1 --format '{{json .Image}}' > "$OUT/image.json"
set +e
docker exec -e RUN_ID="$RUN_ID" -e KPI_DIR="$KPI" -e DATASET_LIMIT="${DATASET_LIMIT:-100}" \
  ain-cert-ainize-node-1 node "$OUT/source.js" > "$OUT/stdout.log" 2> "$OUT/stderr.log"
code=$?
set -e
printf '%s\n' "$code" > "$OUT/exit-code.txt"
echo "dataset audit exit=$code evidence=$OUT"
exit "$code"
