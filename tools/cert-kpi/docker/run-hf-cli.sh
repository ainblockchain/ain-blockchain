#!/usr/bin/env bash
set -euo pipefail
KPI=$(cd "$(dirname "$0")/.." && pwd)
RUN_ID=${RUN_ID:-hf_cli_$(date -u +%Y%m%dT%H%M%SZ)}
[[ "$RUN_ID" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
OUT="$KPI/evidence/$RUN_ID"
HOME_DIR=${AINIZE_HOME:-$KPI/ainize/home-docker}
IMAGE=${HF_CLI_IMAGE:-ain-cert-ainize-cli:hf-import-20260911-r5}
mkdir "$OUT"
container="ain-cert-$RUN_ID"
docker create --name "$container" --network host --cpus 2 --cpuset-cpus 0-7 \
  --memory 2g --memory-swap 2g --read-only --tmpfs /tmp:rw,nosuid,size=256m \
  --user "$(id -u):$(id -g)" -e AINIZE_HOME="$HOME_DIR" \
  --mount "type=bind,src=$HOME_DIR,dst=$HOME_DIR" \
  "$IMAGE" "$@" > "$OUT/container-id.txt"
docker inspect "$container" --format '{{json .HostConfig}}' > "$OUT/limits.json"
docker inspect "$container" --format '{{json .Image}}' > "$OUT/image.json"
set +e
docker start -a "$container" > "$OUT/stdout.log" 2> "$OUT/stderr.log"
set -e
docker inspect "$container" --format '{{json .State}}' > "$OUT/state.json"
running=$(docker inspect "$container" --format '{{.State.Running}}')
if [ "$running" = true ]; then
  echo "CLI container is still running: $container; inspect the same container before retrying" >&2
  exit 1
fi
code=$(docker inspect "$container" --format '{{.State.ExitCode}}')
docker rm "$container" >/dev/null
cat "$OUT/stdout.log"
cat "$OUT/stderr.log" >&2
exit "$code"
