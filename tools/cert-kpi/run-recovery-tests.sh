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
mkdir "$output/source"
for relative in common/file-util.js node/index.js block-pool/index.js \
    test/unit/file-util-snapshot.test.js tools/cert-kpi/audit-ledger.js \
    tools/cert-kpi/audit-ledger.test.js tools/cert-kpi/replay-startup.js \
    tools/cert-kpi/prepare-chain-recovery.js tools/cert-kpi/prepare-chain-recovery.test.js \
    tools/cert-kpi/maintain-chain-node.sh tools/cert-kpi/run-ledger-audit.sh \
    tools/cert-kpi/verify-pending-chain.js tools/cert-kpi/verify-pending-chain.test.js \
    tools/cert-kpi/reassign-recovery-bridge.js \
    tools/cert-kpi/inspect-consensus.js tools/cert-kpi/run-recovery-tests.sh; do
  mkdir -p "$output/source/$(dirname "$relative")"
  cp "$repository/$relative" "$output/source/$relative"
done
(cd "$output/source"; find . -type f -print0 | sort -z | xargs -0 sha256sum) \
  > "$output/source.sha256"
printf '%s\n' "$image_id" > "$output/image-id.txt"
name="ain-cert-recovery-tests-$run_id"
docker create --name "$name" --runtime runc --network none --cpus 2 --cpuset-cpus 0-7 \
  --memory 4g --memory-swap 4g --read-only --tmpfs /tmp:rw,size=256m \
  --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges \
  -e NVIDIA_VISIBLE_DEVICES=void -e BLOCKCHAIN_DATA_DIR=/tmp/tests \
  -e BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/1-node -e ACCOUNT_INJECTION_OPTION=private_key \
  -e ENABLE_TX_SIG_VERIF_WORKAROUND=false -e ENABLE_GAS_FEE_WORKAROUND=true \
  --mount "type=bind,src=$repository,dst=/source,readonly" \
  --mount "type=bind,src=$output,dst=/evidence" --entrypoint sh "$image_id" -c '
set -e
sha256sum -c /evidence/source.sha256
node tools/cert-kpi/native-shards/audit-image.js /source /evidence/runtime-source.json
node --test tools/cert-kpi/audit-ledger.test.js tools/cert-kpi/inspect-consensus.test.js \
  tools/cert-kpi/prepare-chain-recovery.test.js tools/cert-kpi/verify-pending-chain.test.js
node_modules/.bin/mocha --timeout 160000 test/unit/file-util-snapshot.test.js \
  test/unit/block-pool-evidence.test.js test/unit/block-pool.test.js test/unit/consensus.test.js
node_modules/.bin/eslint tools/cert-kpi/audit-ledger.js tools/cert-kpi/audit-ledger.test.js \
  tools/cert-kpi/replay-startup.js tools/cert-kpi/prepare-chain-recovery.js \
  tools/cert-kpi/prepare-chain-recovery.test.js tools/cert-kpi/inspect-consensus.js \
  tools/cert-kpi/verify-pending-chain.js tools/cert-kpi/verify-pending-chain.test.js \
  tools/cert-kpi/reassign-recovery-bridge.js \
  test/unit/file-util-snapshot.test.js
for script in maintain-chain-node run-ledger-audit run-recovery-tests; do
  bash -n "tools/cert-kpi/$script.sh"
done
' > "$output/container-id.txt"
docker inspect "$name" --format '{{json .HostConfig}}' > "$output/limits.json"
set +e
docker start -a "$name" > "$output/test.log" 2>&1
result=$?
set -e
printf '%s\n' "$result" > "$output/exit-code.txt"
docker inspect "$name" --format '{{json .State}}' > "$output/state.json"
tail -25 "$output/test.log"
exit "$result"
