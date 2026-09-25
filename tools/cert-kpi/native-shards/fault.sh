#!/usr/bin/env bash
set -euo pipefail
source_dir=$(cd "$(dirname "$0")" && pwd)
network_dir=$(realpath "${1:?Pass the existing native network directory}")
label=${2:?Pass a new lowercase observation label}
probe_label=${3:-control}
[[ "$label" =~ ^[a-z][a-z0-9_-]{0,39}$ && "$probe_label" =~ ^[a-z0-9_-]+$ ]]
output="$network_dir/$label"
mkdir "$output"
mkdir "$output/scripts"
cp "$source_dir/"{fault.sh,fault-observe.js,verify-network.js} "$output/scripts/"
sha256sum "$output/scripts/"* > "$output/source-sha256.txt"
jq -e '.pass == true' "$network_dir/probe-$probe_label.json" > /dev/null
run_id=$(jq -er .runId "$network_dir/network.json")
image=$(jq -er .image "$network_dir/network.json")
target=$(jq -er '.chains[1].nodes[-1].service' "$network_dir/network.json")
container=$(docker compose -f "$network_dir/compose.json" ps -q "$target")
[[ -n "$container" ]]
docker inspect "$container" > "$output/before-container.json"
jq -e --arg run "$run_id" --arg target "$target" '.[0] | .State.Running == true and .Config.Labels["org.ain.cert.run"] == $run and .Config.Labels["com.docker.compose.service"] == $target and .Config.Labels["org.ain.cert.role"] == "blockchain"' "$output/before-container.json" > /dev/null
stopped=false
restore() {
  if [[ "$stopped" == true ]]; then
    date -u +%FT%TZ >> "$output/emergency-restore.log"
    docker start "$container" >> "$output/emergency-restore.log"
    docker inspect "$container" > "$output/emergency-restored-container.json"
  fi
}
trap restore EXIT
date -u +%FT%TZ > "$output/stop-started-at.txt"
stopped=true
docker stop --time 20 "$container" > "$output/stop.log"
docker inspect "$container" > "$output/stopped-container.json"
observe() {
  local phase=$1
  local name="ain-cert-fault-${run_id//_/-}-${label//_/-}-$phase"
  docker create --name "$name" --network host --cpus 1 --cpuset-cpus 0-7 --memory 1g --memory-swap 1g --read-only \
    --mount "type=bind,src=$network_dir,dst=/run" "$image" \
    "/run/$label/scripts/fault-observe.js" /run/network.json "/run/$label" "$phase" "$probe_label" > "$output/$phase-container-id.txt" 2> "$output/$phase-create-stderr.log"
  docker inspect "$name" --format '{{json .HostConfig}}' > "$output/$phase-host-config.json"
  set +e
  docker start -a "$name" > "$output/$phase.log" 2>&1
  local result=$?
  set -e
  docker inspect "$name" --format '{{json .State}}' > "$output/$phase-state.json"
  cat "$output/$phase.log"
  return "$result"
}
observe stopped
date -u +%FT%TZ > "$output/restore-started-at.txt"
docker start "$container" > "$output/restore.log"
stopped=false
docker inspect "$container" > "$output/restored-container.json"
jq -s -e '.[0][0].Id == .[1][0].Id and .[0][0].Mounts == .[1][0].Mounts' "$output/before-container.json" "$output/restored-container.json" > /dev/null
observe recovered
docker inspect "$container" > "$output/after-container.json"
