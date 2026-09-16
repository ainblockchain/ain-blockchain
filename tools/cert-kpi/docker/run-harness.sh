#!/usr/bin/env bash
set -euo pipefail
KPI=$(cd "$(dirname "$0")/.." && pwd)
ENTRY=${1:?usage: run-harness.sh script.js [arguments]}
shift
[[ "$ENTRY" != /* && "$ENTRY" != *..* && -f "$KPI/harness/$ENTRY" ]] || { echo 'entry must be a harness file'; exit 1; }
RUN_ID=${RUN_ID:-docker_harness_$(date -u +%Y%m%dT%H%M%SZ)}
[[ "$RUN_ID" =~ ^[A-Za-z0-9_-]+$ ]] || { echo 'invalid RUN_ID'; exit 1; }
IMAGE=${HARNESS_IMAGE:-ain-cert-chain:repro-20260911}
CPUS=${HARNESS_CPUS:-2}
CPUSET=${HARNESS_CPUSET:-6-7}
MEMORY=${HARNESS_MEMORY:-8g}
OUT="$KPI/evidence/$RUN_ID"
mkdir "$OUT"
mkdir "$OUT/source"
tar --exclude='./node_modules' --exclude='./__pycache__' --exclude='./.env*' \
  -C "$KPI/harness" -cf "$OUT/source.tar" .
tar -xf "$OUT/source.tar" -C "$OUT/source"
mkdir -p "$OUT/source/node_modules"
sha256sum "$OUT/source.tar" > "$OUT/source.sha256"
SOURCE_SHA=$(cut -d ' ' -f 1 "$OUT/source.sha256")
container="ain-cert-harness-$RUN_ID"
options=()
for variable in NUM_SHARDS AGENTS_PER_SHARD ROUNDS DURATION_MS WORKERS CHANNELS USERS M4_RUN DUR VLLM_PORTS LOCUST_CPUS; do
  if [[ -v "$variable" ]]; then options+=(-e "$variable=${!variable}"); fi
done
dependencies=()
if [ "${HARNESS_IMAGE_DEPENDENCIES:-0}" != 1 ]; then
  dependencies+=(-v "$KPI/harness/node_modules:$KPI/harness/node_modules:ro")
fi
entrypoint=()
if [[ "$ENTRY" == *.sh ]]; then entrypoint+=(--entrypoint bash); fi
docker create --name "$container" --network host --cpus="$CPUS" --cpuset-cpus="$CPUSET" \
  --memory="$MEMORY" --memory-swap="$MEMORY" --user "$(id -u):$(id -g)" \
  --group-add "$(stat -c %g /var/run/docker.sock)" \
  --label org.ain.cert.role=harness \
  -e KPI_DIR="$KPI" -e RUN_ID="$RUN_ID" -e CHAIN_PORT_BASE=18081 \
  -e KPI_SOURCE_SHA256="$SOURCE_SHA" \
  -e CHAIN_EVENT_URLS='["ws://localhost:15100","ws://localhost:15101"]' \
  -e CHAIN_CONTAINER_PROJECT=ain-cert-docker \
  -v "$OUT/source:$KPI/harness:ro" "${dependencies[@]}" \
  -v "$KPI/logs:$KPI/logs" \
  -v "$KPI/results:$KPI/results" \
  -v "$KPI/evidence:$KPI/evidence" -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -w "$KPI/harness" "${options[@]}" "${entrypoint[@]}" "$IMAGE" "$KPI/harness/$ENTRY" "$@" > "$OUT/container-id.txt"
docker inspect "$container" --format '{{json .HostConfig}}' > "$OUT/limits.json"
docker inspect "$container" --format '{{json .Image}}' > "$OUT/image.json"
set +e
docker start -a "$container" > "$OUT/stdout.log" 2> "$OUT/stderr.log"
attach_code=$?
set -e
docker inspect "$container" --format '{{json .State}}' > "$OUT/state.json"
code=$(docker inspect "$container" --format '{{.State.ExitCode}}')
running=$(docker inspect "$container" --format '{{.State.Running}}')
if [ "$running" = true ]; then
  echo "container remains live: $container; inspect it before retrying; attach exit=$attach_code"
  exit 1
fi
docker rm "$container" >/dev/null
echo "harness exit=$code evidence=$OUT"
exit "$code"
