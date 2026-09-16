#!/usr/bin/env bash
set -euo pipefail
KPI=$(cd "$(dirname "$0")/.." && pwd)
RUN_ID=${RUN_ID:?set RUN_ID; reuse the same ID to resume}
[[ "$RUN_ID" =~ ^[A-Za-z0-9_-]{1,40}$ ]] || exit 1
OUT="$KPI/evidence/$RUN_ID"
if [ ! -d "$OUT" ]; then
  mkdir "$OUT" "$OUT/source"
  for source in ainize-lifecycle.js ainize-lifecycle-state.js ainize-inference-audit.js m5-judge.js; do
    cp "$KPI/harness/$source" "$OUT/source/$source"
  done
  (cd "$OUT/source" && sha256sum *.js) > "$OUT/source.sha256"
fi
(cd "$OUT/source" && sha256sum --check ../source.sha256)
ATTEMPT=$(mktemp -d "$OUT/launch-XXXXXXXX")
docker inspect ain-cert-ainize-node-1 --format '{{json .HostConfig}}' > "$ATTEMPT/limits.json"
docker inspect ain-cert-ainize-node-1 --format '{{json .Image}}' > "$ATTEMPT/image.json"
for container in flashnext flashtrain; do
  docker inspect "$container" --format '{{json .HostConfig}}' > "$ATTEMPT/$container-limits.json"
  docker inspect "$container" --format '{{json .Image}}' > "$ATTEMPT/$container-image.json"
done
set +e
docker exec -e RUN_ID="$RUN_ID" \
  -e AINIZE_REGISTRATION_RUN="${AINIZE_REGISTRATION_RUN:-ainize_datasets100_20260911}" \
  ain-cert-ainize-node-1 flock --nonblock --no-fork "$KPI/evidence/.ainize-lifecycle.lock" \
  node "$OUT/source/ainize-lifecycle.js" > "$ATTEMPT/stdout.log" 2> "$ATTEMPT/stderr.log"
code=$?
set -e
printf '%s\n' "$code" > "$ATTEMPT/exit-code.txt"
echo "lifecycle observer exit=$code evidence=$OUT; an observer failure does not cancel or resubmit a teach job"
exit "$code"
