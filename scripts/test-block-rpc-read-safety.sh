#!/usr/bin/env bash
set -euo pipefail
IMAGE=${AIN_RPC_TEST_IMAGE:?Pinned local blockchain image ID required}
OUTPUT=${1:?New output directory required}
[[ "$IMAGE" =~ ^sha256:[a-f0-9]{64}$ && ! -e "$OUTPUT" ]] || { echo 'Pinned image and new output path required' >&2; exit 1; }
docker image inspect "$IMAGE" >/dev/null
umask 077
mkdir -p "$OUTPUT"
OUTPUT=$(cd "$OUTPUT" && pwd)
NAME="ain-rpc-read-check-$$-$(date +%s)"
NETWORK=false
CONTAINER=false
cleanup() {
  if "$CONTAINER"; then docker rm -f "$NAME" >/dev/null; fi
  if "$NETWORK"; then docker network rm "$NAME" >/dev/null; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker network create --internal "$NAME" >/dev/null
NETWORK=true
docker create --name "$NAME" --network "$NAME" --cpus 2 --memory 4g --memory-swap 4g --pids-limit 512 \
  -e BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/1-node \
  -e UNSAFE_PRIVATE_KEY=b22c95ffc4a5c096f7d7d0487ba963ce6ac945bdc91c79b64ce209de289bec96 \
  -e PORT=8081 -e P2P_PORT=5001 -e STAKE=10000000 -e HOSTING_ENV=local -e SYNC_MODE=full \
  -e ENABLE_GAS_FEE_WORKAROUND=true -e ENABLE_TX_SIG_VERIF_WORKAROUND=false \
  -e ENABLE_STATUS_REPORT_TO_TRACKER=false -e ENABLE_EXPRESS_RATE_LIMIT=false \
  -e CONSOLE_LOG=false "$IMAGE" --max-old-space-size=2048 client/index.js >/dev/null
CONTAINER=true
docker inspect "$NAME" --format '{"image":"{{.Image}}","cpuNano":{{.HostConfig.NanoCpus}},"memoryBytes":{{.HostConfig.Memory}},"network":"{{.HostConfig.NetworkMode}}"}' > "$OUTPUT/docker.json"
docker start "$NAME" >/dev/null
ADDRESS=$(docker inspect "$NAME" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
[[ "$ADDRESS" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
timeout 150 node - "http://$ADDRESS:8081/json-rpc" "$OUTPUT/read-safety.json" <<'JS'
const assert = require('assert');
const fs = require('fs');
const endpoint = process.argv[2];
async function rpc(method, params = {}) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { protoVer: '1.0.0', ...params } }), signal: AbortSignal.timeout(10000) });
  assert.strictEqual(response.status, 200);
  const body = await response.json();
  assert.ok(!body.error);
  return body.result.result;
}
(async () => {
  const deadline = Date.now() + 100000;
  while (true) {
    try { if (await rpc('ain_getLastBlockNumber') >= 1) break; } catch {}
    if (Date.now() > deadline) throw new Error('Isolated chain did not start');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const genesis = await rpc('ain_getBlockByNumber', { number: 0, getFullTransactions: true });
  assert.ok(genesis.transactions.length > 0);
  const hashes = genesis.transactions.map(transaction => transaction.hash);
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.deepStrictEqual((await rpc('ain_getBlockByNumber', { number: 0 })).transactions, hashes);
    assert.deepStrictEqual((await rpc('ain_getBlockByHash', { hash: genesis.hash })).transactions, hashes);
    assert.deepStrictEqual(await rpc('ain_getBlockByNumber', { number: 0, getFullTransactions: true }), genesis);
  }
  const result = { scope: 'Isolated real-chain repeated read check; not a throughput benchmark',
    repetitions: 5, genesis, preservedTransactions: hashes.length, passed: true };
  fs.writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ repetitions: 5, preservedTransactions: hashes.length, passed: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
JS
