# Native POA shard reproduction

This is the prerequisite protocol experiment for year-three M1, not a 70-pipeline training benchmark. The old `m1-sharding.js` writes randomly generated loss values to logical paths on one chain. Its path count does not demonstrate actual AI training or independent shards.

## Topology and limits

| Chain | Validators | Native protocol | Host RPC ports |
|---|---:|---|---|
| Parent | 4 | NONE | 18201–18204 |
| Child 1 | 3 | POA, `/apps/year3_shard1` | 18301–18303 |
| Child 2 | 3 | POA, `/apps/year3_shard2` | 18401–18403 |

The ten validators have disjoint identities, independent chain data volumes and three different genesis blocks. Each child runs its own consensus; its reporter submits finalized state proof hashes to the parent using the existing native protocol. Three separate trackers and chain-specific seed lists avoid treating a single consensus group as multiple shards.

Each validator has a 32-CPU quota ceiling, `cpuset=0-7`, 128 GiB memory/swap ceiling and 8 GiB V8 heap ceiling. Trackers have 0.25 CPU/1 GiB. Builders have 2 CPU/4 GiB, observers and SDK clients 1 CPU/1 GiB. No GPU is requested. Actual Docker `HostConfig`, image IDs, process states, background container inventory and host information accompany each run.

These are **oversubscribed ceilings, not reservations**. On the eight-CPU host, all ten validators share at most eight allowed CPUs, not 320 physical CPUs; memory ceilings also exceed host RAM. A 40:1 CPU-quota ratio is not a measured performance ratio against AWS. Existing model training, GPU7 evaluation and the older certification chain are outside this compose project and must not be restarted by this experiment.

All genesis keys are public upstream development fixtures. RPC publishes on loopback only; never use these identities or configurations on a funded/public network. Transaction signature verification stays enabled; direct development-write and REST-function APIs stay disabled. The fixture retains the existing gas-fee workaround and is not a real-funds settlement test. All three chains use chain ID 0 because the native reporter currently signs parent transactions with its own chain ID; this does not establish cryptographic cross-chain replay protection.

## Build and run

From the `ain-blockchain` repository root, with Docker Compose v2 and Bash available:

```bash
DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 --cpuset-cpus 0-7 --memory 4g --memory-swap 4g -t ain-cert-native-chain:20260911 -f tools/cert-kpi/native-shards/chain.Dockerfile .
DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 100000 --cpuset-cpus 0-7 --memory 1g --memory-swap 1g -t ain-cert-native-sdk:20260911 -f tools/cert-kpi/native-shards/client.Dockerfile tools/cert-kpi/native-shards
docker run --rm --network none --cpus 1 --cpuset-cpus 0-7 --memory 1g --memory-swap 1g --read-only --mount "type=bind,src=$PWD/tools/cert-kpi/native-shards,dst=/source,readonly" ain-cert-native-chain:20260911 --test /source/network.test.js
mkdir -p /tmp/ain-native-evidence
CHAIN_IMAGE=ain-cert-native-chain:20260911 AINIZE_CLIENT_IMAGE=ain-cert-native-sdk:20260911 AIN_SDK_NODE_PATH=/opt/ain-sdk/node_modules bash tools/cert-kpi/native-shards/run.sh /tmp/ain-native-evidence/run1 native_run1
```

Use a new output directory and run ID. The RPC ports must be free; do not launch another run over a live network. Dependencies are locked by the chain's `yarn.lock` and the client's `client/package-lock.json` (`ain-js` 1.15.0). Save the built image IDs: image tags and base OS repositories are not immutable identities. `audit-image.js` rejects a chain image whose runtime source, protocol-version map, configuration templates or dependency lock differs from the current worktree. The Dockerfile itself is a recipe, not proof of a successful build.

The launcher snapshots scripts before starting containers. Startup order is parent quorum → two native reporters and parent shard metadata → remaining child validators → full topology verification → real `ain-js` control writes. DNS bootstrap addresses are resolved to literal IPs before loading upstream configuration, because upstream first-node detection compares literal URLs and its peer validator rejects single-label Docker DNS names.

`record-probe.js` creates an owner-only test app on each child, writes different payloads at the **same local path**, waits for finalized execution, verifies transaction membership and exact values through a different validator, and matches each transaction block's state proof with the parent's finalized record. Parent application state does not directly contain the child payload. A transaction receipt uses `number`, not `block_number`; a lagging replica is polled rather than immediately treated as verified.

## Bounded failure and recovery experiment

After a successful control probe, with `jq` installed:

```bash
bash tools/cert-kpi/native-shards/fault.sh /tmp/ain-native-evidence/run1 fault1 control
```

The command validates the target container's run/service labels, stops only child 1's last validator, samples the other nine nodes for at least 30 seconds, then starts the **same container and volumes**. It checks parent/other-shard progress, records affected-shard progress without assuming a quorum outcome, waits for all ten identities to advance and each chain's observed tips to be within two blocks, and checks the pre-fault payload, block hash and parent proof. The bounded recovery observations are retained, not replaced by a fixed sleep or a restart. An exit trap restores that one validator if observation fails. Observer names include both the run ID and phase label. This is controlled single-process termination, not packet-loss, Byzantine, host-loss or training-job recovery coverage.

## Evidence and failure handling

- `network.json`, `compose.json`, genesis/config files and `runtime-source.json`: actual topology and immutable source/image identity.
- `verify-{parent,reporters,all}.json` and JSONL: observed identities, finalized blocks, validator sets, consensus progress and parent proofs, including failures.
- `probe-control.jsonl`: fsynced submission intents and responses; `probe-control.json`: final receipts, independent blocks/readbacks and parent proofs.
- `fault1/`: before/stopped/restored container identities and mounts, measured progress, raw recovery observations and retained state.
- `*-host-config.json`, `*-state.json`, `*.log`: limits, real exit status and raw diagnostics. An observation deadline never means the blockchain containers stopped.

Do not rerun a journal with uncertain submissions or overwrite an evidence directory. Inspect the recorded hash and existing chain first. A corrected probe uses a new label and immutable source snapshot without deleting the chain or its earlier failed log. `docker compose down -v`, blanket model restarts and resetting the publisher are not recovery steps.

## Remaining M1 gates

Passing this suite proves native multi-chain state management and the stated control/fault scenario only. M1 still requires actual learning input identities and byte counts, training-job IDs/artifacts, measured overlap of 70 active learning pipelines, large-data load, missing/duplicate checks and broader stability evidence. Neither ten validators nor seventy logical writes is a substitute for those gates.
