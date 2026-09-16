#!/usr/bin/env bash
set -euo pipefail
KPI=$(cd "$(dirname "$0")/.." && pwd)
RUN_ID=${RUN_ID:?set a new proxy deployment RUN_ID}
[[ "$RUN_ID" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
OUT="$KPI/evidence/$RUN_ID"
mkdir "$OUT" "$OUT/source"
cp "$KPI/harness/ainize-public-proxy.js" "$OUT/source/"
(cd "$OUT/source" && sha256sum *.js) > "$OUT/source.sha256"
docker create --name ain-cert-public-proxy --network host --cpus 1 --cpuset-cpus 0-7 \
  --memory 256m --memory-swap 256m --read-only --cap-drop ALL --security-opt no-new-privileges \
  --user "$(id -u):$(id -g)" --mount "type=bind,src=$OUT/source,dst=/source,readonly" \
  --label org.ain.cert.role=public-marketplace-proxy --entrypoint node \
  ain-cert-ainize-cli:hf-import-20260911-r5 /source/ainize-public-proxy.js > "$OUT/container-id.txt"
docker inspect ain-cert-public-proxy --format '{{json .HostConfig}}' > "$OUT/limits.json"
docker inspect ain-cert-public-proxy --format '{{json .Image}}' > "$OUT/image.json"
docker start ain-cert-public-proxy
docker inspect ain-cert-public-proxy --format '{{json .State}}' > "$OUT/state.json"
