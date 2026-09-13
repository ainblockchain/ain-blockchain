#!/usr/bin/env bash
set -euo pipefail
umask 077
plan=$(realpath "${1:?Pass the original-chain repair plan JSON}")
index=${2:?Pass one live node index, 0..9}
output=${3:?Pass a NEW public proof directory}
private=${4:?Pass a NEW private capture directory}
[[ "$index" =~ ^[0-9]$ ]] || exit 2
output=$(realpath -m "$output")
private=$(realpath -m "$private")
case "$private/" in "$output/"*) exit 2;; esac
case "$output/" in "$private/"*) exit 2;; esac
[[ ! -e "$output" && ! -e "$private" ]] || exit 2
image=$(jq -er .image "$plan")
[[ $(docker image inspect "$image" --format '{{.Id}}') == "$image" ]] || exit 2
name="ain-cert-docker-node$index-1"
[[ $(docker inspect "$name" --format '{{.State.Running}}') == true ]] || exit 2
docker inspect "$name" | jq -e \
  '.[0].Config.Env | index("ENABLE_TX_SIG_VERIF_WORKAROUND=false") != null' >/dev/null
[[ -z $(ss -H -ltn 'sport = :9229') ]] || exit 2
mkdir -m 700 "$output"
mkdir -m 700 "$private"
record_instance() {
  docker inspect "$name" --format \
    '{"id":"{{.Id}}","pid":{{.State.Pid}},"startedAt":"{{.State.StartedAt}}","image":"{{.Image}}"}'
}
finish() {
  result=$?
  trap - EXIT
  printf '%s\n' "$result" > "$output/exit-code.txt"
  record_instance > "$output/instance-final.json" || true
  ss -H -ltn 'sport = :9229' > "$output/inspector-final.txt" || true
  exit "$result"
}
trap finish EXIT
record_instance > "$output/instance-before.json"
printf '%s\n' "$image" > "$output/image-id.txt"
docker kill --signal USR1 "$name" > "$output/inspector-signal.txt"
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:9229/json/list >/dev/null 2>&1; then break; fi
  sleep 1
done
docker run --rm --runtime runc --network host --cpus 1 --cpuset-cpus 0-7 \
  --memory 1g --memory-swap 1g --read-only --user "$(id -u):$(id -g)" \
  --cap-drop ALL --security-opt no-new-privileges -e NVIDIA_VISIBLE_DEVICES=void \
  -e CAPTURE_PENDING_CHAIN=1 -e "INSPECT_RPC_PORT=$((18081 + index))" \
  --mount "type=bind,src=$private,dst=/private" --entrypoint node "$image" \
  tools/cert-kpi/inspect-consensus.js /private/pending.json > "$output/capture.log" 2>&1
for attempt in $(seq 1 30); do
  if [[ -z $(ss -H -ltn 'sport = :9229') ]]; then break; fi
  sleep 1
done
[[ -z $(ss -H -ltn 'sport = :9229') ]]
record_instance > "$output/instance-after.json"
cmp "$output/instance-before.json" "$output/instance-after.json"
docker run --rm --runtime runc --network none --cpus 2 --cpuset-cpus 0-7 \
  --memory 4g --memory-swap 4g --read-only --tmpfs /tmp:rw,size=256m \
  --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges \
  -e NVIDIA_VISIBLE_DEVICES=void -e BLOCKCHAIN_DATA_DIR=/tmp/verify \
  -e ENABLE_TX_SIG_VERIF_WORKAROUND=false \
  --mount "type=bind,src=$private,dst=/private,readonly" \
  --mount "type=bind,src=$plan,dst=/plan.json,readonly" \
  --mount "type=bind,src=$output,dst=/evidence" --entrypoint node "$image" \
  tools/cert-kpi/verify-pending-chain.js /private/pending.json /plan.json \
  /evidence/verified.json > "$output/verify.log" 2>&1
record_instance > "$output/instance-verified.json"
cmp "$output/instance-before.json" "$output/instance-verified.json"
jq -n --argjson index "$index" --slurpfile instance "$output/instance-before.json" \
  --slurpfile proof "$output/verified.json" --arg capture "$private/pending.json" \
  --arg proofFile "$output/verified.json" \
  --arg proofSha256 "$(sha256sum "$output/verified.json" | cut -d ' ' -f 1)" \
  '{index:$index,containerId:$instance[0].id,pid:$instance[0].pid,
    startedAt:$instance[0].startedAt,address:$proof[0].address,captureFile:$capture,
    proofFile:$proofFile,proofSha256:$proofSha256}' > "$output/checkpoint.json"
jq '{pass,captureAt,nodeState,consensusState,signatureChecks,lastNumber,
  blocks:(.records|length),tips:(.tipHashes|length)}' "$output/verified.json"
