# Native evidence checkpoint regression

## Scope

`BlockPool.getOffensesAndEvidence()` executed accepted evidence votes, but kept its rollback
checkpoint at the initial state. A later candidate without enough stake restored that old state,
silently removing earlier accepted votes while leaving those votes in the proposed evidence.
The validator replayed the evidence and obtained a different state proof. Refreshing the checkpoint
after every accepted candidate keeps the proposal state and evidence consistent.

This changes proposal construction, not validation rules or historical block contents. It does not
disable signatures, lower the majority threshold, accept an invalid state proof, or create a new
genesis. Deploying the fix and recovering a running network are separate operations.

## Reproduce without touching running chains

From this repository root:

```bash
docker build -f tools/cert-kpi/native-shards/chain.Dockerfile \
  -t ain-cert-native-chain:checkpoint-20260911 .
RUN_ID="checkpoint_$(date -u +%Y%m%dT%H%M%S | tr '[:upper:]' '[:lower:]')"
CHAIN_IMAGE=ain-cert-native-chain:checkpoint-20260911 \
  bash tools/cert-kpi/run-consensus-evidence.sh "/tmp/$RUN_ID" "$RUN_ID"
```

The runner requires a new output path, checks runtime source against the image, freezes the relevant
source files, and records image ID, commands, exit statuses and Docker limits. Tests use native DB
execution, actual signed AIN transactions and native validator/staking rules. There are seven new
checkpoint cases, four existing block-pool cases and four existing consensus cases. Eight additional
inspector protocol tests use a local mock CDP server; they are not chain consensus tests.

Each test container has CPU quota 2, cpuset 0–7 (override `CPUSET` for another host), RAM and combined
memory+swap limit 4 GiB, read-only root, disposable 256 MiB `/tmp`, no external network, no GPU,
non-root UID and dropped capabilities. No existing chain volumes are mounted. Signature bypass is
false; the legacy gas-fee workaround is explicitly true for these isolated fixtures, not a production
security setting. The test setup removes only its disposable chain directory.

The seven checkpoint tests initially produced five failures and two passes. After the fix all seven
pass; the combined related native suite has fifteen passes. This is not 70 AI training pipelines,
7,000 TPS, ten-node recovery, or an assertion that the whole repository CI passes.

## Actual stalled proposal replay (2026-09-11)

The legacy experiment finalized block 23086 and retained a notarized tip at 23102. A bounded diagnostic
of the original node captured the first rejected proposal at 23103 and the predecessor DB without
restarting the process or changing ledger contents. The complete snapshot is private and is **not**
a public release asset. Public evidence contains only source, bounded metadata and replay summaries.

| Stage | State proof |
|---|---|
| Predecessor 23102 | `0xe1fe5579b3e85d64b5737d6bf27c276d14bd496a062b2ab7f5882040ef549706` |
| After last votes / bad proposal's claimed proof | `0x3bf216c4e35eff12a4578469eb87a26b01626ba3694e4ce4ab0d8a2ce1c44a11` |
| After the nine included evidence votes / validator replay | `0x22b7c8241417a1b981e638b3b95d77b3198c8e2f07da4e3aed7fbc121c19885e` |

The actual captured signed quorum and a captured one-vote minority candidate were replayed in a
**reconstructed quorum-then-minority order**, not claimed as a recording of the original proposer's
arrival order. All 24 distinct transaction signatures were explicitly verified. With the old code,
this reconstruction exactly produces the bad claimed proof. With the fix, it produces the same
proof as independent validator replay. No transaction fails in these replay stages. The resulting
tree is 19,847,678 bytes, below the 20,000,000-byte limit for this case; future growth remains a separate
operational concern.

`replay-consensus-capture.js PRIVATE_CAPTURE NEW_SUMMARY` runs these native DB stages offline.
`results[].matches` compares against the **old invalid proposal's claimed hash**: the corrected creator
should therefore have `matches=false`, while its final proof equals the validator's final proof.
Exit 0 means diagnostic stages completed, not that the old invalid proposal became valid.

```bash
IMAGE=ain-cert-native-chain:checkpoint-20260911
PRIVATE_DIR=/mnt/newdata/gov/kpi/secrets/chain-stall-20260911
OUTPUT="/tmp/consensus_replay_$(date -u +%Y%m%dT%H%M%S)"
mkdir -m 700 "$OUTPUT"
docker run --runtime runc --network none --cpus 2 --cpuset-cpus 0-7 \
  --memory 4g --memory-swap 4g --read-only --tmpfs /tmp:rw,size=256m \
  --cap-drop ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  -e NVIDIA_VISIBLE_DEVICES=void -e BLOCKCHAIN_DATA_DIR=/tmp/replay \
  -e ACCOUNT_INJECTION_OPTION=private_key -e ENABLE_TX_SIG_VERIF_WORKAROUND=false \
  -e ENABLE_GAS_FEE_WORKAROUND=true \
  --mount "type=bind,src=$PRIVATE_DIR,dst=/private,readonly" \
  --mount "type=bind,src=$OUTPUT,dst=/output" "$IMAGE" \
  tools/cert-kpi/replay-consensus-capture.js \
  /private/first-invalid-with-candidates.json /output/summary.json
jq '[.results[] | {mode, matches, finalProof:.steps[-1].proof}]' "$OUTPUT/summary.json"
```

This local replay requires the retained private capture; another operator without it should run the
public native fixture suite instead. Do not substitute a fabricated capture or distribute live DB
snapshots, keys, personal homes, model weights or credentials in release files.

## Optional operator diagnostic, not a performance measurement

`inspect-consensus.js NEW_OUTPUT [PRIVATE_BLOCK_HASH]` is deliberately restricted to an already-open,
operator-selected local inspector at `127.0.0.1:9229` and status API at `127.0.0.1:18081`.
For an explicitly selected different local node, set `INSPECT_RPC_PORT` to that node's RPC port.
It does not enable the debugger itself. Do not use it on another node or while measuring latency.
Metadata is bounded to 100 entries per map; private captures are limited to 32 MiB compact JSON
(pretty-printed files can be larger) and require a user-owned 0700 output directory. Files are 0600.

The client briefly pauses at the native P2P status function, removes its breakpoint, resumes, disables
the debugger and requests inspector closure after disconnect. Check that port 9229 is closed and
the original container ID/start time/PID is unchanged. A timeout/error is not permission to restart
the chain. Cleanup failure is a nonzero exit and must be investigated by the operator. No HTTP
proxy, public debugger, heap dump, or ledger write is used. The discarded `Runtime.queryObjects`
approach timed out on the large heap and is retained only as failed historical evidence.

Inspector access can execute arbitrary code; keep it local and temporary. Node documents that
[`inspector.close()` waits for active sessions](https://nodejs.org/docs/latest-v22.x/api/inspector.html),
so the client disconnects before its delayed close request. The protocol calls follow the
[V8 inspector protocol](https://chromedevtools.github.io/devtools-protocol/v8/Debugger/).

## Recovery gate

The checkpoint diagnosis itself did not replace or restart the ten-node ledger. Subsequent
snapshot recovery and the separately planned canary upgrade are tracked in `chain-recovery.md`.
Before any
planned upgrade, preserve each node's original genesis, finalized blocks, snapshots and volume;
audit historical signatures and replay compatibility; build and verify the patched runtime; then
perform a separately documented maintenance/recovery and verify all ten nodes advance and agree.
Do not clear history, regenerate genesis, weaken validation or mark ENV1 complete based on unit
tests. Keep funded state-channel writes blocked until the native readiness gate passes.
