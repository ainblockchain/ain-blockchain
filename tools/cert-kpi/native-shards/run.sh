#!/usr/bin/env bash
set -euo pipefail
source_dir=$(cd "$(dirname "$0")" && pwd)
repository=$(git -C "$source_dir" rev-parse --show-toplevel)
output=${1:?Pass a new output directory}
run_id=${2:?Pass a lowercase RUN_ID}
image=${CHAIN_IMAGE:-ain-cert-chain:repro-20260911}
client_image=${AINIZE_CLIENT_IMAGE:-ain-cert-ainize-cli:hf-import-20260911-r5}
client_node_path=${AIN_SDK_NODE_PATH:-/opt/ainize/ainize-core/node_modules}
mkdir "$output"
output=$(realpath "$output")
project="ain-cert-shards-${run_id//_/-}"
image_id=$(docker image inspect "$image" --format '{{.Id}}')
printf '%s\n' "$image_id" > "$output/chain-image-id.txt"
git -C "$source_dir" rev-parse HEAD > "$output/source-base-commit.txt"
docker info --format '{{json .}}' > "$output/docker-host.json"
docker ps --format '{{.Names}} {{.Status}}' > "$output/background-containers-before.txt"

run_container() {
  local name=$1
  local prefix=$2
  docker inspect "$name" --format '{{json .HostConfig}}' > "$output/$prefix-host-config.json"
  set +e
  docker start -a "$name" > "$output/$prefix.log" 2>&1
  local result=$?
  set -e
  docker inspect "$name" --format '{{json .State}}' > "$output/$prefix-state.json"
  cat "$output/$prefix.log"
  return "$result"
}

docker create --name "$project-image-audit" --network none --cpus 1 --cpuset-cpus 0-7 --memory 1g --memory-swap 1g --read-only \
  --mount "type=bind,src=$repository,dst=/source,readonly" --mount "type=bind,src=$output,dst=/output" \
  "$image_id" /source/tools/cert-kpi/native-shards/audit-image.js /source /output/runtime-source.json > "$output/image-audit-container-id.txt"
run_container "$project-image-audit" image-audit

docker create --name "$project-build" --network none --cpus 2 --cpuset-cpus 0-7 --memory 4g --memory-swap 4g \
  --mount "type=bind,src=$source_dir,dst=/source,readonly" --mount "type=bind,src=$output,dst=/output" \
  "$image_id" /source/create-network.js /output "$run_id" "$output" "$image_id" > "$output/build-container-id.txt"
run_container "$project-build" build

compose=(docker compose -f "$output/compose.json")
observe() {
  local phase=$1
  docker create --name "$project-observe-$phase" --network host --cpus 1 --cpuset-cpus 0-7 --memory 1g --memory-swap 1g \
    --read-only --mount "type=bind,src=$output,dst=/run" "$image_id" /run/scripts/verify-network.js /run/network.json "$phase" \
    > "$output/observe-$phase-container-id.txt"
  run_container "$project-observe-$phase" "observe-$phase"
}

"${compose[@]}" up -d root-tracker root0 root1 root2 root3 > "$output/start-parent.log" 2>&1
observe parent
"${compose[@]}" up -d shard1-tracker shard2-tracker shard10 shard20 > "$output/start-reporters.log" 2>&1
observe reporters
"${compose[@]}" up -d shard11 shard12 shard21 shard22 > "$output/start-followers.log" 2>&1
observe all

ids=$("${compose[@]}" ps -aq)
docker inspect $ids > "$output/containers.json"
docker create --name "$project-probe" --network host --cpus 1 --cpuset-cpus 0-7 --memory 1g --memory-swap 1g \
  --read-only --env NODE_PATH="$client_node_path" --mount "type=bind,src=$output,dst=/run" \
  --entrypoint node "$client_image" /run/scripts/record-probe.js /run/network.json > "$output/probe-container-id.txt"
run_container "$project-probe" probe
"${compose[@]}" ps --all --format json > "$output/compose-state.json"
printf '\nNative shard topology and control writes verified. This is not yet 70 AI learning pipelines.\n'
