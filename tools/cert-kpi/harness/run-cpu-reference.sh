#!/usr/bin/env bash
set -euo pipefail
KPI=$(cd "$(dirname "$0")/.." && pwd)
RUN_ID=${RUN_ID:-cpu_reference_$(date -u +%Y%m%dT%H%M%SZ)}
[[ "$RUN_ID" =~ ^[A-Za-z0-9_-]+$ ]] || { echo 'invalid RUN_ID'; exit 1; }
OUT="$KPI/evidence/$RUN_ID"
mkdir "$OUT"
IMAGE=ghcr.io/colinianking/stress-ng@sha256:040db041445627cef2d1d1109cbf47c5a2727f0f9c65157e365d419699c9d0c5
docker image inspect "$IMAGE" --format '{{json .Id}}' > "$OUT/image.json"
lscpu --json > "$OUT/lscpu.json"
docker info --format '{"cpus":{{.NCPU}},"memoryBytes":{{.MemTotal}}}' > "$OUT/host.json"
for repeat in 1 2 3; do
  cat /proc/stat > "$OUT/stat-before-$repeat.txt"
  ps -eo comm,pcpu --sort=-pcpu | head -25 > "$OUT/load-$repeat.txt" || true
  container="ain-cert-$RUN_ID-$repeat"
  docker create --name "$container" --network none --cpuset-cpus=0-7 --cpus=8 \
    --memory=2g --memory-swap=2g --cap-add SYS_NICE --entrypoint sh "$IMAGE" \
    -c 'set -e; stress-ng --version; nice -n -20 stress-ng --metrics --cpu 1 --cpu-method div16 -t 20 -Y /dev/stderr; nice -n -20 stress-ng --metrics --cpu 8 --cpu-method div16 -t 20 -Y /dev/stderr' \
    > "$OUT/container-$repeat.txt"
  docker inspect "$container" --format '{{json .HostConfig}}' > "$OUT/limits-$repeat.json"
  docker start -a "$container" > "$OUT/run-$repeat.stdout" 2> "$OUT/run-$repeat.stderr"
  docker inspect "$container" --format '{{json .State}}' > "$OUT/state-$repeat.json"
  cat /proc/stat > "$OUT/stat-after-$repeat.txt"
  code=$(docker inspect "$container" --format '{{.State.ExitCode}}')
  docker rm "$container" >/dev/null
  [ "$code" -eq 0 ] || exit "$code"
  echo "CPU reference repeat $repeat/3 saved: $OUT"
done
