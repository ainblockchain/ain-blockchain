#!/usr/bin/env bash
set -euo pipefail
KPI=$(cd "$(dirname "$0")/.." && pwd)
RUN_ID=${RUN_ID:-channel_load_$(date -u +%Y%m%dT%H%M%SZ)}
[[ "$RUN_ID" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
CHANNELS=${CHANNELS:-100}
DURATION_MS=${DURATION_MS:-60000}
IMAGE=${CHANNEL_IMAGE:-ain-cert-channel-sdk:repro-20260911}
OUT="$KPI/evidence/$RUN_ID"
SECRETS="$KPI/secrets/$RUN_ID"
mkdir "$OUT"
mkdir -p -m 700 "$SECRETS/client" "$SECRETS/server"
cp "$KPI/harness/channel-network-load.js" "$OUT/source.js"
sha256sum "$OUT/source.js" > "$OUT/source.sha256"
SERVER="ain-load-peer-$RUN_ID"
CLIENT="ain-load-client-$RUN_ID"
base=(--cpus=2 --cpuset-cpus=0-7 --memory=4g --memory-swap=4g --user "$(id -u):$(id -g)"
  -v "$OUT:/evidence" -v "$OUT/source.js:/source.js:ro"
  -e RUN_ID="$RUN_ID" -e CHANNELS="$CHANNELS" -e DURATION_MS="$DURATION_MS")
docker run --rm --network none "${base[@]}" -v "$SECRETS:/secrets" "$IMAGE" /source.js init
RUN_ID="${RUN_ID}_open" HARNESS_IMAGE="$IMAGE" bash "$KPI/docker/run-harness.sh" channel-ledger.js open "$RUN_ID"
docker run -d --name "$SERVER" --network host "${base[@]}" -v "$SECRETS/server:/private:ro" "$IMAGE" /source.js server > "$OUT/server-id.txt"
docker create --name "$CLIENT" --network host "${base[@]}" -v "$SECRETS/client:/private:ro" "$IMAGE" /source.js client > "$OUT/client-id.txt"
for container in "$SERVER" "$CLIENT"; do
  docker inspect "$container" --format '{{json .HostConfig}}' > "$OUT/$container-limits.json"
  docker inspect "$container" --format '{{json .Image}}' > "$OUT/$container-image.json"
done
set +e
docker start -a "$CLIENT" > "$OUT/client.stdout.log" 2> "$OUT/client.stderr.log"
attach_code=$?
set -e
docker inspect "$CLIENT" --format '{{json .State}}' > "$OUT/client-state.json"
if [[ "$(docker inspect "$CLIENT" --format '{{.State.Running}}')" == true ]]; then
  echo "client remains live; inspect $CLIENT before retrying (attach=$attach_code)"
  exit 1
fi
docker logs "$SERVER" > "$OUT/server.log" 2>&1
[[ "$(docker inspect "$CLIENT" --format '{{.State.ExitCode}}')" == 0 ]] || { echo 'client failed; containers and journals preserved'; exit 1; }
RUN_ID="${RUN_ID}_settle" HARNESS_IMAGE="$IMAGE" bash "$KPI/docker/run-harness.sh" channel-ledger.js settle "$RUN_ID"
docker stop "$SERVER" > "$OUT/stop.log"
docker inspect "$SERVER" --format '{{json .State}}' > "$OUT/server-state.json"
docker rm "$SERVER" "$CLIENT" >/dev/null
node - "$OUT/load-result.json" <<'JS'
const result = require(process.argv[2]);
console.log(JSON.stringify({ runId: result.runId, correctness: result.correctness, averageTPS: result.averageTPS,
  targetTPS: result.targetTPS, performancePass: result.performancePass }));
process.exitCode = result.correctness && result.performancePass ? 0 : 1;
JS
