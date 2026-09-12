#!/usr/bin/env bash
set -euo pipefail
KPI=$(cd "$(dirname "$0")/.." && pwd)
RUN_ID=${RUN_ID:-channel_smoke_$(date -u +%Y%m%dT%H%M%SZ)}
[[ "$RUN_ID" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
OUT="$KPI/evidence/$RUN_ID"
SECRETS="$KPI/secrets/$RUN_ID"
mkdir "$OUT"
mkdir -p -m 700 "$SECRETS"
cp "$KPI/harness/channel-network-smoke.js" "$OUT/source.js"
sha256sum "$OUT/source.js" > "$OUT/source.sha256"
IMAGE=ain-cert-channel-sdk:repro-20260911
NETWORK="ain-$RUN_ID"
SERVER="ain-peer-$RUN_ID"
CLIENT="ain-client-$RUN_ID"
docker network create "$NETWORK" > "$OUT/network-id.txt"
base=(--cpus=1 --cpuset-cpus=0-7 --memory=1g --memory-swap=1g --user "$(id -u):$(id -g)" -v "$OUT:/evidence" -e RUN_ID="$RUN_ID")
docker run --rm --network none "${base[@]}" -v "$SECRETS:/secrets" "$IMAGE" /evidence/source.js init
docker run -d --name "$SERVER" --network "$NETWORK" --network-alias peer "${base[@]}" -v "$SECRETS/server.pem:/private.pem:ro" "$IMAGE" /evidence/source.js server > "$OUT/server-id.txt"
docker create --name "$CLIENT" --network "$NETWORK" "${base[@]}" -v "$SECRETS/client.pem:/private.pem:ro" "$IMAGE" /evidence/source.js client > "$OUT/client-id.txt"
for container in "$SERVER" "$CLIENT"; do
  docker inspect "$container" --format '{{json .HostConfig}}' > "$OUT/$container-limits.json"
  docker inspect "$container" --format '{{json .Image}}' > "$OUT/$container-image.json"
done
docker start -a "$CLIENT" > "$OUT/client.stdout.log" 2> "$OUT/client.stderr.log"
docker inspect "$CLIENT" --format '{{json .State}}' > "$OUT/client-state.json"
[[ "$(docker inspect "$CLIENT" --format '{{.State.ExitCode}}')" == 0 ]] || { echo 'client failed; preserve containers for inspection'; exit 1; }
docker kill --signal KILL "$SERVER" > "$OUT/crash.log"
docker inspect "$SERVER" --format '{{json .State}}' > "$OUT/server-crash-state.json"
docker start "$SERVER" > "$OUT/restart.log"
docker run --rm --network "$NETWORK" "${base[@]}" "$IMAGE" /evidence/source.js recover > "$OUT/recovery.stdout.log" 2> "$OUT/recovery.stderr.log"
docker logs "$SERVER" > "$OUT/server.log" 2>&1
docker stop "$SERVER" > "$OUT/stop.log"
docker rm "$SERVER" "$CLIENT" >/dev/null
docker network rm "$NETWORK" >/dev/null
echo "channel network and crash recovery passed: $OUT"
