#!/usr/bin/env bash
set -euo pipefail
KPI=$(cd "$(dirname "$0")/.." && pwd)
RUN_ID=${RUN_ID:?set a new RUN_ID}
[[ "$RUN_ID" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
OUT="$KPI/evidence/$RUN_ID"
HOME_DIR=${AINIZE_HOME:-$KPI/ainize/home-docker}
REGISTRATION_RUN=${AINIZE_REGISTRATION_RUN:-ainize_datasets100_20260911}
[[ "$REGISTRATION_RUN" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
IMAGE=${HF_CLI_IMAGE:-ain-cert-ainize-cli:hf-import-20260911-r5}
mkdir "$OUT" "$OUT/source"
cp "$KPI/harness/import-hf-dart100.js" "$KPI/harness/ainize-lifecycle-state.js" "$OUT/source/"
(cd "$OUT/source" && sha256sum *.js) > "$OUT/source.sha256"
container="ain-cert-$RUN_ID"
docker create --name "$container" --network host --cpus 2 --cpuset-cpus 0-7 \
  --memory 2g --memory-swap 2g --read-only --tmpfs /tmp:rw,nosuid,size=256m \
  --user "$(id -u):$(id -g)" -e AINIZE_HOME="$HOME_DIR" \
  --mount "type=bind,src=$HOME_DIR,dst=$HOME_DIR" \
  --mount "type=bind,src=$KPI/evidence/$REGISTRATION_RUN,dst=/registration,readonly" \
  --mount "type=bind,src=$OUT,dst=/evidence" \
  --mount "type=bind,src=$OUT/source,dst=/source,readonly" \
  --entrypoint node "$IMAGE" /source/import-hf-dart100.js "$@" > "$OUT/container-id.txt"
docker inspect "$container" --format '{{json .HostConfig}}' > "$OUT/limits.json"
docker inspect "$container" --format '{{json .Image}}' > "$OUT/image.json"
docker start -a "$container" > "$OUT/stdout.log" 2> "$OUT/stderr.log" || true
docker inspect "$container" --format '{{json .State}}' > "$OUT/state.json"
if [ "$(docker inspect "$container" --format '{{.State.Running}}')" = true ]; then
  echo "Importer still running: $container; observe it instead of starting another" >&2
  exit 1
fi
exit "$(docker inspect "$container" --format '{{.State.ExitCode}}')"
