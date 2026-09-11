#!/usr/bin/env bash
set -euo pipefail
umask 077
source_dir=$(cd "$(dirname "$0")" && pwd)
recovery=$(realpath "${1:?Pass the staged recovery directory}")
node_index=${2:?Pass ONE node index, 0..9}
private=${3:?Pass a NEW private backup directory}
reference=$(realpath "${4:?Pass the completed original ledger audit directory}")
[[ "$node_index" =~ ^[0-9]$ ]] || exit 2
name="ain-cert-docker-node$node_index-1"
volume="ain-cert-docker_chain-node$node_index"
port=$((18081 + node_index))
image=$(jq -er .image "$recovery/plan.json")
seed=$(jq -er .seed "$recovery/plan.json")
number=$(jq -er .snapshotNumber "$recovery/plan.json")
expected=$(jq -er .snapshotSha256 "$recovery/plan.json")
jq -e --argjson node "$node_index" '.order | arrays | index($node) != null' \
  "$recovery/plan.json" >/dev/null
[[ $(docker image inspect "$image" --format '{{.Id}}') == "$image" ]] || exit 2
jq -e --arg image "$image" --arg service "node$node_index" \
  '.name == "ain-cert-docker" and .services[$service].image == $image and
   .services[$service].environment.ENABLE_TX_SIG_VERIF_WORKAROUND == "false"' \
  "$recovery/compose.json" >/dev/null
bridge=$(jq -r '.bridgeIndex // 0' "$recovery/plan.json")
[[ "$bridge" == 0 || "$bridge" == 1 ]] || exit 2
[[ "$number" =~ ^[0-9]+$ && "$expected" =~ ^[a-f0-9]{64}$ ]] || exit 2
[[ $(sha256sum "$seed" | cut -d ' ' -f 1) == "$expected" ]] || exit 2
repair_preflight=''
history_name="ain-cert-recovery-node$node_index-history"
if [[ ${PLANNED_REPAIR:-0} == 1 ]]; then
  [[ ${RECOVER_CRASHED:-0} != 1 && ${RESUME_STOPPED:-0} != 1 ]] || exit 2
  repair_preflight=$(node "$source_dir/repair-preflight.js" "$recovery/plan.json" "$node_index")
  repair_id=$(jq -er .repair.runId "$recovery/plan.json")
  history_name="ain-cert-repair-$repair_id-node$node_index-history"
fi
if [[ ${RECOVER_CRASHED:-0} == 1 ]]; then
  [[ "$node_index" != "$bridge" && "$node_index" != 1 && ${RESUME_STOPPED:-0} != 1 ]] || exit 2
  [[ $(docker inspect "$name" --format '{{.State.Running}}') == false ]] || exit 2
  [[ $(docker inspect "$name" --format '{{.State.Status}}') == exited ]] || exit 2
  [[ $(docker inspect "$name" --format '{{.State.ExitCode}}') -ge 128 ]] || exit 2
elif [[ ${RESUME_STOPPED:-0} == 1 ]]; then
  [[ $(docker inspect "$name" --format '{{.State.Running}}') == false ]] || exit 2
  [[ -f "$private/original-container.json" && -f "$recovery/node$node_index/stop.log" ]] || exit 2
  [[ ! -e "$private/data.tar" && ! -e "$recovery/node$node_index/history" &&
    ! -e "$recovery/node$node_index/after.json" ]] || exit 2
  [[ $(docker inspect "$name" --format '{{.Id}}') == \
    $(jq -er '.[0].Id' "$private/original-container.json") ]] || exit 2
else
  [[ $(docker inspect "$name" --format '{{.State.Running}}') == true ]] || exit 2
fi
[[ $(docker inspect "$name" --format '{{.Image}}') != "$image" ]] || exit 2
docker inspect "$name" | jq -e --arg volume "$volume" \
  '.[0].Mounts | any(.Destination == "/data" and .Type == "volume" and .Name == $volume)' >/dev/null
if [[ ${PLANNED_REPAIR:-0} == 1 ]]; then
  prior_nodes=''
elif [[ ${RECOVER_CRASHED:-0} == 1 ]]; then
  prior_nodes=1
  for candidate in $(seq 2 9); do
    if [[ $(docker inspect "ain-cert-docker-node$candidate-1" --format '{{.Image}}') == "$image" ]]; then
      prior_nodes+=" $candidate"
    fi
  done
else
  prior_nodes=$(jq -r --argjson node "$node_index" \
    '.order as $order | $order[0:($order | index($node))][]' "$recovery/plan.json")
fi
for prior in $prior_nodes; do
  prior_name="ain-cert-docker-node$prior-1"
  [[ $(docker inspect "$prior_name" --format '{{.Image}}') == "$image" ]] || exit 2
  [[ $(docker inspect "$prior_name" --format '{{.State.Running}}') == true ]] || exit 2
  original_hash=$(jq -er .originalFinalHash "$recovery/plan.json")
  if [[ ${RECOVER_CRASHED:-0} == 1 ]]; then
    jq -e --arg hash "$original_hash" --argjson number "$number" \
      '.pass == true and .lastHash == $hash and .requestedLastNumber == $number' \
      "$recovery/node$prior/history/summary.json" >/dev/null
    if [[ "$prior" != 1 ]]; then continue; fi
    curl -fsS --max-time 15 http://127.0.0.1:18082/node_status |
      jq -e '.code == 0 and .result.state == "SERVING"' >/dev/null
  else
    curl -fsS --max-time 15 "http://127.0.0.1:$((18081 + prior))/health_check" |
      jq -e '. == true' >/dev/null
  fi
  observed_hash=$(curl -fsS --max-time 15 \
    "http://127.0.0.1:$((18081 + prior))/get_block_by_number?number=$number" | jq -er .result.hash)
  [[ "$observed_hash" == "$original_hash" ]] || exit 2
done
if [[ "$node_index" != "$bridge" ]]; then
  [[ $(docker inspect "ain-cert-docker-node$bridge-1" --format '{{.State.Running}}') == true ]] || exit 2
  if [[ "$bridge" == 1 ]]; then
    [[ $(docker inspect ain-cert-docker-node1-1 --format '{{.Id}}') == \
      $(jq -er .bridgeContainerId "$recovery/plan.json") ]] || exit 2
  fi
fi
seed_preflight=$(docker run --rm --runtime runc --network none --cpus 1 --cpuset-cpus 0-7 \
  --memory 512m --memory-swap 512m --read-only --user 0:0 --cap-drop ALL --cap-add DAC_OVERRIDE \
  --security-opt no-new-privileges -e NVIDIA_VISIBLE_DEVICES=void \
  --mount "type=volume,src=$volume,dst=/data,readonly" \
  --mount "type=bind,src=$seed,dst=/seed.json.gz,readonly" --entrypoint node "$image" \
  tools/cert-kpi/recovery-seed.js check "/data/snapshots/$port/n2s/$number.json.gz" \
  /seed.json.gz "$expected")
if [[ ${CHECK_ONLY:-0} == 1 ]]; then
  printf '{"node":%s,"preconditions":true,"mutations":false,"seed":%s}\n' \
    "$node_index" "$seed_preflight"
  exit 0
fi
if [[ ${RESUME_STOPPED:-0} != 1 ]]; then
  mkdir -m 700 "$private"
  mkdir -m 700 "$recovery/node$node_index"
fi
private=$(realpath "$private")
output="$recovery/node$node_index"
printf '%s\n' "$seed_preflight" > "$output/seed-preflight.json"
if [[ -n "$repair_preflight" ]]; then
  printf '%s\n' "$repair_preflight" > "$output/repair-preflight.json"
fi
if [[ ${RESUME_STOPPED:-0} == 1 ]]; then
  printf '%s resume confirmed stopped original container after failed backup; no restart\n' \
    "$(date -u +%FT%TZ)" > "$output/backup-resume.txt"
else
docker inspect "$name" > "$private/original-container.json"
docker inspect "$name" --format '{"id":"{{.Id}}","image":"{{.Image}}","started":"{{.State.StartedAt}}"}' \
  > "$output/before.json"
printf '%s planned software replacement, not an observation timeout\n' "$(date -u +%FT%TZ)" \
  > "$output/maintenance-intent.txt"
if [[ ${RECOVER_CRASHED:-0} == 1 ]]; then
  docker inspect "$name" --format '{{json .State}}' > "$output/crash-before-maintenance.json"
  printf 'already exited; no stop signal sent\n' > "$output/stop.log"
else
  docker stop --time 30 "$name" > "$output/stop.log"
fi
fi
docker run --rm --runtime runc --network none --cpus 2 --cpuset-cpus 0-7 \
  --memory 1g --memory-swap 1g --read-only --user 0:0 --cap-drop ALL --cap-add DAC_OVERRIDE \
  --security-opt no-new-privileges \
  -e NVIDIA_VISIBLE_DEVICES=void --mount "type=volume,src=$volume,dst=/data,readonly" \
  --entrypoint tar "$image" -C /data -cf - . > "$private/data.tar"
sha256sum "$private/data.tar" > "$private/data.tar.sha256"
[[ $(sha256sum "$private/data.tar" | cut -d ' ' -f 1) == \
    $(cut -d ' ' -f 1 "$private/data.tar.sha256") ]] || exit 2
tar -tf "$private/data.tar" > "$private/data-files.txt"
docker run --rm --runtime runc --network none --cpus 1 --cpuset-cpus 0-7 \
  --memory 512m --memory-swap 512m --read-only --user 0:0 --cap-drop ALL --cap-add DAC_OVERRIDE \
  --security-opt no-new-privileges \
  -e NVIDIA_VISIBLE_DEVICES=void -e "PORT=$port" -e "NUMBER=$number" -e "EXPECTED=$expected" \
  --mount "type=volume,src=$volume,dst=/data" --mount "type=bind,src=$seed,dst=/seed.json.gz,readonly" \
  --entrypoint node "$image" tools/cert-kpi/recovery-seed.js install \
  "/data/snapshots/$port/n2s/$number.json.gz" /seed.json.gz "$expected" \
  > "$output/seed-installed.json"
docker run --name "$history_name" --runtime runc --network none \
  --cpus 2 --cpuset-cpus 0-7 --memory 4g --memory-swap 4g --read-only --tmpfs /tmp:rw,size=256m \
  --cap-drop ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  -e NVIDIA_VISIBLE_DEVICES=void -e BLOCKCHAIN_DATA_DIR=/tmp/audit \
  -e ENABLE_TX_SIG_VERIF_WORKAROUND=false --mount "type=volume,src=$volume,dst=/ledger,readonly" \
  --mount "type=bind,src=$output,dst=/evidence" \
  --mount "type=bind,src=$reference,dst=/reference,readonly" "$image" \
  tools/cert-kpi/audit-ledger.js "/ledger/chains/$port" "$number" /evidence/history \
  /reference/blocks.jsonl > "$output/history.log" 2>&1
docker compose -f "$recovery/compose.json" up -d --no-deps "node$node_index" > "$output/start.log" 2>&1
docker inspect "$name" --format '{"id":"{{.Id}}","image":"{{.Image}}","started":"{{.State.StartedAt}}"}' \
  > "$output/after.json"
docker inspect "$name" --format '{{json .HostConfig}}' > "$output/limits.json"
printf '%s replacement started; verify native progress and original history before another node\n' \
  "$(date -u +%FT%TZ)" > "$output/replacement-started.txt"
