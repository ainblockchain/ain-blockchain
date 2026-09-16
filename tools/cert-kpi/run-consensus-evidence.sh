#!/usr/bin/env bash
set -euo pipefail
source_dir=$(cd "$(dirname "$0")" && pwd)
repository=$(git -C "$source_dir" rev-parse --show-toplevel)
output=${1:?Pass a NEW evidence directory}
run_id=${2:?Pass a unique lowercase RUN_ID}
[[ "$run_id" =~ ^[a-z0-9][a-z0-9_-]{0,60}$ ]] || exit 2
image=${CHAIN_IMAGE:?Build the current source and set CHAIN_IMAGE}
image_id=$(docker image inspect "$image" --format '{{.Id}}')
mkdir -m 700 "$output"
output=$(realpath "$output")
printf '%s\n' "$image_id" > "$output/image-id.txt"
git -C "$repository" rev-parse HEAD > "$output/source-base-commit.txt"
mkdir "$output/source"
for relative in block-pool/index.js test/unit/block-pool-evidence.test.js \
    tools/cert-kpi/inspect-consensus.js tools/cert-kpi/inspect-consensus.test.js \
    tools/cert-kpi/replay-consensus-capture.js tools/cert-kpi/run-consensus-evidence.sh; do
  mkdir -p "$output/source/$(dirname "$relative")"
  cp "$repository/$relative" "$output/source/$relative"
done
(cd "$output/source"; find . -type f -print0 | sort -z | xargs -0 sha256sum) \
  > "$output/source.sha256"
run_container() {
  local phase=$1
  shift
  local name="ain-cert-evidence-${run_id//_/-}-$phase"
  docker create --name "$name" --runtime runc --network none --cpus 2 \
    --cpuset-cpus "${CPUSET:-0-7}" --memory 4g --memory-swap 4g --read-only \
    --tmpfs /tmp:rw,size=256m --cap-drop ALL --security-opt no-new-privileges \
    --user "$(id -u):$(id -g)" -e NVIDIA_VISIBLE_DEVICES=void \
    -e BLOCKCHAIN_DATA_DIR=/tmp/chain -e BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/1-node \
    -e ACCOUNT_INJECTION_OPTION=private_key -e ENABLE_TX_SIG_VERIF_WORKAROUND=false \
    -e ENABLE_GAS_FEE_WORKAROUND=true -e CONSOLE_LOG=false \
    --mount "type=bind,src=$repository,dst=/source,readonly" \
    --mount "type=bind,src=$output,dst=/evidence" \
    "$image_id" "$@" > "$output/$phase-container-id.txt"
  docker inspect "$name" --format '{{json .HostConfig}}' > "$output/$phase-limits.json"
  set +e
  docker start -a "$name" > "$output/$phase.log" 2>&1
  local result=$?
  set -e
  printf '%s\n' "$result" > "$output/$phase-exit-code.txt"
  docker inspect "$name" --format '{{json .State}}' > "$output/$phase-state.json"
  cat "$output/$phase.log"
  return "$result"
}
run_container audit tools/cert-kpi/native-shards/audit-image.js /source /evidence/runtime-source.json
run_container fixture-audit -e '
const fs = require("fs");
const crypto = require("crypto");
const records = fs.readFileSync("/evidence/source.sha256", "utf8").trim().split("\n")
  .map(line => {
    const [expected, relative] = line.split(/\s+/);
    const actual = crypto.createHash("sha256").update(fs.readFileSync(relative)).digest("hex");
    return { relative, expected, actual, match: expected === actual };
  });
fs.writeFileSync("/evidence/fixture-source.json", JSON.stringify(records, null, 2) + "\n");
if (!records.every(record => record.match)) process.exitCode = 1;
console.log(JSON.stringify({ files: records.length, pass: !process.exitCode }));
'
run_container unit node_modules/mocha/bin/mocha --timeout 160000 \
  test/unit/block-pool-evidence.test.js test/unit/block-pool.test.js test/unit/consensus.test.js
run_container inspector --test tools/cert-kpi/inspect-consensus.test.js
run_container lint node_modules/eslint/bin/eslint.js test/unit/block-pool-evidence.test.js \
  tools/cert-kpi/inspect-consensus.js tools/cert-kpi/inspect-consensus.test.js \
  tools/cert-kpi/replay-consensus-capture.js
printf 'Native evidence regressions passed; this is not ten-node recovery or KPI performance.\n'
