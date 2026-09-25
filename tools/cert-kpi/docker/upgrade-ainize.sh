#!/usr/bin/env bash
set -euo pipefail
KPI=$(cd "$(dirname "$0")/.." && pwd)
RUN_ID=${RUN_ID:-ainize_upgrade_$(date -u +%Y%m%dT%H%M%SZ)}
[[ "$RUN_ID" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
OUT="$KPI/evidence/$RUN_ID"
BACKUP="$KPI/secrets/$RUN_ID"
SNAPSHOT="$KPI/pr/an-relay/deploy/runtime-snapshot.mjs"
TRAINER_ROOT=${AINIZE_TRAINER_ROOT:-${RUNTIME_REPO:?RUNTIME_REPO or AINIZE_TRAINER_ROOT required}/.teach}
mkdir "$OUT"
mkdir -m 700 "$BACKUP"
docker top ain-cert-ainize-node-1 -eo pid,stat,args > "$OUT/processes-before.txt"
if awk '$0 ~ /node .*ainize-lifecycle[.]js/ && $2 !~ /T/ {found=1} END {exit !found}' "$OUT/processes-before.txt"; then
  echo 'lifecycle observer is active; arrange a terminal/idle maintenance window first' >&2
  exit 1
fi
for container in flashnext flashtrain; do
  docker inspect "$container" --format '{{.Id}} {{.State.StartedAt}} {{.State.Pid}}' > "$OUT/$container-before.txt"
done
node "$SNAPSHOT" jobs "$KPI/ainize/home-docker" "$OUT/jobs-before.json"
curl --fail --silent --show-error --max-time 30 http://localhost:3410/api/info > "$OUT/info-before.json"
cp "$SNAPSHOT" "$OUT/runtime-snapshot.mjs"
sha256sum "$OUT/runtime-snapshot.mjs" > "$OUT/source.sha256"
node "$OUT/runtime-snapshot.mjs" capture "$KPI/ainize/home-docker" "$OUT/jobs-before.json" "$OUT/info-before.json" "$OUT/inventory-before.json" "$TRAINER_ROOT"
docker inspect ain-cert-ainize-node-1 --format '{{json .State}}' > "$OUT/state-before.json"
docker inspect ain-cert-ainize-node-1 --format '{{json .Image}}' > "$OUT/image-before.json"
export AINIZE_UID="$(id -u)" AINIZE_GID="$(id -g)" DOCKER_GID="$(stat -c %g /var/run/docker.sock)"
docker compose -f "$KPI/docker/compose.ainize.json" config --format json > "$OUT/compose.json"
TARGET_IMAGE=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).services.node.image)' "$OUT/compose.json")
docker image inspect "$TARGET_IMAGE" --format '{{json .Id}}' > "$OUT/target-image.json"
docker compose -f "$KPI/docker/compose.ainize.json" stop -t 60 node > "$OUT/stop.log" 2>&1
umask 077
tar -C "$KPI/ainize" -cf "$BACKUP/home-docker.tar" home-docker
tar -C "$TRAINER_ROOT" -cf "$BACKUP/trained-bodies.tar" .
umask 022
sha256sum "$BACKUP/home-docker.tar" "$BACKUP/trained-bodies.tar" > "$OUT/backup.sha256"
docker compose -f "$KPI/docker/compose.ainize.json" up -d --no-deps node > "$OUT/start.log" 2>&1
docker inspect ain-cert-ainize-node-1 --format '{{json .Image}}' > "$OUT/image-after.json"
cmp "$OUT/target-image.json" "$OUT/image-after.json"
docker inspect ain-cert-ainize-node-1 --format '{{json .HostConfig}}' > "$OUT/limits-after.json"
for attempt in {1..60}; do
  if curl --fail --silent --max-time 5 http://localhost:3410/readyz > "$OUT/ready.json"; then
    node -e 'const value=JSON.parse(require("fs").readFileSync(process.argv[1])); if (value.ready !== true && value.ok !== true) throw Error("not backend readiness JSON")' "$OUT/ready.json"
    node "$OUT/runtime-snapshot.mjs" jobs "$KPI/ainize/home-docker" "$OUT/jobs-after.json"
    curl --fail --silent --show-error --max-time 30 http://localhost:3410/api/info > "$OUT/info-after.json"
    node "$OUT/runtime-snapshot.mjs" capture "$KPI/ainize/home-docker" "$OUT/jobs-after.json" "$OUT/info-after.json" "$OUT/inventory-after.json" "$TRAINER_ROOT"
    node "$OUT/runtime-snapshot.mjs" verify "$OUT/inventory-before.json" "$OUT/inventory-after.json" > "$OUT/preservation.json"
    for container in flashnext flashtrain; do
      docker inspect "$container" --format '{{.Id}} {{.State.StartedAt}} {{.State.Pid}}' > "$OUT/$container-after.txt"
      cmp "$OUT/$container-before.txt" "$OUT/$container-after.txt"
    done
    echo "Ainize ready; private backup preserved at $BACKUP"
    exit 0
  fi
  sleep 2
done
echo 'readiness observation expired; inspect the same container, do not restart blindly'
exit 1
