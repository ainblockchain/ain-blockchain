#!/usr/bin/env bash
set -euo pipefail
source_dir=$(cd "$(dirname "$0")" && pwd)
output=${1:?Pass a NEW evidence directory}
run_id=${2:?Pass a unique lowercase RUN_ID}
reference=${3:-}
[[ "$run_id" =~ ^[a-z0-9][a-z0-9_-]{0,60}$ ]] || exit 2
image=${CHAIN_IMAGE:?Set the verified chain image}
image_id=$(docker image inspect "$image" --format '{{.Id}}')
mkdir -m 700 "$output"
output=$(realpath "$output")
cp "$source_dir/audit-ledger.js" "$source_dir/run-ledger-audit.sh" "$output/"
if [[ -n "$reference" ]]; then
  mkdir "$output/reference"
  cp "$reference/blocks.jsonl" "$reference/summary.json" "$output/reference/"
fi
mounts=()
for node_index in $(seq 0 9); do
  volume="ain-cert-docker_chain-node$node_index"
  docker volume inspect "$volume" --format '{{.Name}}' >> "$output/volumes.txt"
  mounts+=(--mount "type=volume,src=$volume,dst=/ledgers/node$node_index,readonly")
done
name="ain-cert-ledger-$run_id"
docker create --name "$name" --runtime runc --network none --cpus 2 --cpuset-cpus "${CPUSET:-0-7}" \
  --memory 4g --memory-swap 4g --read-only --tmpfs /tmp:rw,size=256m \
  --cap-drop ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  -e NVIDIA_VISIBLE_DEVICES=void -e BLOCKCHAIN_DATA_DIR=/tmp/audit \
  -e ENABLE_TX_SIG_VERIF_WORKAROUND=false \
  --mount "type=bind,src=$output,dst=/evidence" \
  --mount "type=bind,src=$output/audit-ledger.js,dst=/app/ain-blockchain/tools/cert-kpi/audit-ledger.js,readonly" \
  "${mounts[@]}" "$image_id" -e '
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { audit } = require("./tools/cert-kpi/audit-ledger");
const FileUtil = require("./common/file-util");
const records = [];
for (let index = 0; index < 10; index++) {
  const port = 18081 + index;
  const chain = `/ledgers/node${index}/chains/${port}`;
  const last = FileUtil.getLatestBlockInfo(chain).latestBlockNumber;
  const reference = index > 0 ? "/evidence/node0/blocks.jsonl" :
    fs.existsSync("/evidence/reference/summary.json") ? "/evidence/reference/blocks.jsonl" : undefined;
  const summary = audit(chain, last, `/evidence/node${index}`, reference);
  const snapshotDirectory = `/ledgers/node${index}/snapshots/${port}/n2s`;
  const snapshots = fs.readdirSync(snapshotDirectory).filter(name => /^\d+\.json\.gz$/.test(name))
    .sort((first, second) => parseInt(second) - parseInt(first)).slice(0, 2).map(name => {
      const filename = path.join(snapshotDirectory, name);
      const bytes = fs.readFileSync(filename);
      let error = null;
      try { zlib.gunzipSync(bytes, { maxOutputLength: 256 * 1024 ** 2 }); }
      catch (failure) { error = failure.message; }
      return { name, bytes: bytes.length, mtime: fs.statSync(filename).mtime.toISOString(),
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"), gzipValid: !error, error };
    });
  records.push({ node: index, port, ...summary, snapshots });
}
fs.writeFileSync("/evidence/summary.json", JSON.stringify({ at: new Date().toISOString(),
  scope: "all ten read-only ledgers; incomplete live snapshots may still have active writers",
  nodes: records, pass: records.every(record => record.pass) }, null, 2) + "\n");
console.log(JSON.stringify({ nodes: records.length, pass: true }));
' ledger-audit > "$output/container-id.txt"
printf '%s\n' "$image_id" > "$output/image-id.txt"
docker inspect "$name" --format '{{json .HostConfig}}' > "$output/limits.json"
set +e
docker start -a "$name" > "$output/audit.log" 2>&1
result=$?
set -e
printf '%s\n' "$result" > "$output/exit-code.txt"
docker inspect "$name" --format '{{json .State}}' > "$output/state.json"
tail -12 "$output/audit.log"
exit "$result"
