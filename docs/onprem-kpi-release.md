# On-premises release handoff

This release combines protocol/sharding work from #1359, certification tooling from
#1360, and the subsequent consensus/snapshot runtime fixes. The default branch is
`master`. Deploy the reviewed integration commit only after the validation results
in the release PR are complete. This document does not assert mixed-version
consensus compatibility or certify a live mainnet deployment.

## Scope

- Native shard/protocol and state-channel escrow support, resource-bounded consensus
  gossip/evidence, and recovery/certification tooling.
- Epoch scheduling aligned to shared time boundaries with generation guards.
- Deferred finality checks after validated votes; quorum/finality predicates retained.
- Full revalidation of transient invalid-block cache entries during chain sync.
- Distinct private peer hosts, staggered snapshots, and child-process snapshot
  encoding with atomic publication and explicit success/failure results.
- Production genesis and testnet/mainnet parameter files are unchanged.

## Operator preparation

Pin the approved commit on the deployment workstation. Install repository
prerequisites and dependencies; Node.js >=20 is declared in package.json. Run
`npm ci` and `npm run test_unit` on the chosen deployment runtime. Use the
runtime regression command `npm run test_runtime_regression` as well.

The existing on-prem deploy script assumes Ubuntu hosts, login user `nvidia`,
SSH/SCP, sshpass, jq and Yarn. Change `ONPREM_USER` if your fleet differs.
Existing hosts should not use `--setup`: it upgrades OS packages and reinstalls
Node.js. The server installer currently uses Yarn with `--ignore-engines`; record
and validate the actual installed dependencies on testnet before mainnet.

For each environment prepare the following private files at the repository root,
with exactly one entry per node in index order 0–4:

| Environment | Name | Config | HTTP | Event handler |
| --- | --- | --- | --- | --- |
| Testnet | spring | blockchain-configs/testnet-prod | 8078 | 5098 |
| Mainnet | mainnet | blockchain-configs/mainnet-prod | 8077 | 5097 |

- `ip_addresses/<name>_onprem_ip.txt`: SSH addresses.
- `ip_addresses/<name>_onprem_pw.txt`: login/sudo passwords.
- `ip_addresses/<name>_onprem.txt`: full node HTTP URLs.
- Testnet keys: `testnet_prod_keys/keystore_node_<index>.json`.
- Mainnet keys: `mainnet_prod_keys/keystore_node_<index>.json`.

Use existing validator keys and protect these private files; do not commit them.
Back up existing code, host-specific configuration, keys and a consistent,
recoverable copy of `/home/<name>/ain_blockchain_data`. The incremental script
preserves chain data with `--keep-data` but deletes old code with `--no-keep-code`.
Retain the previous release outside its `ain-blockchain*` directory search path.

## Deployment commands

Testnet first, same pinned commit on mainnet after acceptance. These commands
update existing nodes; they do not initialize a new genesis. The script's first
numeric argument is shard count (0 here), followed by inclusive node indices.

```bash
# Testnet node 0; type testnet at the environment prompt.
bash deploy_blockchain_incremental_onprem.sh spring 0 0 0 \
  --keystore --no-keep-code --keep-data --fast-sync

# Mainnet node 0, only after testnet acceptance; type mainnet at the prompt.
bash deploy_blockchain_incremental_onprem.sh mainnet 0 0 0 \
  --keystore --no-keep-code --keep-data --fast-sync
```

After validating the node, repeat separately for indices 1–4 by replacing BOTH
final index arguments. Keep validator quorum available. Because consensus code
changes, first validate a mixed-version rollout in a representative testnet; if
incompatible, coordinate the upgrade rather than assuming rolling compatibility.

```bash
CHAIN_ENV=spring  # mainnet for production
NODE_INDEX=0
NODE_URL="$(sed -n "$((NODE_INDEX + 1))p" "ip_addresses/${CHAIN_ENV}_onprem.txt")"
curl --fail --silent --show-error --max-time 20 "${NODE_URL}/health_check"
curl --fail --silent --show-error --max-time 20 "${NODE_URL}/node_status" | jq .
curl --fail --silent --show-error --max-time 20 "${NODE_URL}/last_block_number" | jq .
sleep 10
curl --fail --silent --show-error --max-time 20 "${NODE_URL}/last_block_number" | jq .
```

Require healthy status, the correct validator identity, advancing finalized
blocks, and matching hashes at the SAME finalized height across nodes. Inspect
logs for recurring validation/sync failures and exercise a real signed write
through finalization. Stop the rollout if any condition fails.

Do not use `--no-keep-data` or genesis deployment scripts to update an existing
chain. Do not apply benchmark genesis/accounts, 200 ms epochs or benchmark host
resource settings to production. New feature activation heights and epoch origin
changes require a separately coordinated network configuration decision.

Before rollback check persisted-state/activation compatibility; restoring old
code alone is not evidence that old state readers can safely continue.
