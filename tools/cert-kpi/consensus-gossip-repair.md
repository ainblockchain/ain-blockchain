# Bounded consensus gossip and retained-tail repair

## Observed failure, not a health-check workaround

On 2026-09-11 at 16:13 UTC, the evidence-budget canary, node8, had received
90 pending blocks and notarized tips at 23104. It nevertheless relayed old large
CONSENSUS proposals: six outbound peers had roughly 180–190 MB buffered each,
including about 141 MB in each WebSocket sender. Its finalized block was still
23086. This was observed on the same container/PID, not inferred from a timeout.
The proposer evidence budget alone does not constrain retransmission of previously
received proposals. This blockchain failure is separate from Ainize blob delivery.

`p2p/index.js` now bounds best-effort CONSENSUS gossip before serialization and
checks each socket before enqueueing:

- `P2P_CONSENSUS_MAX_BYTES`: 16 MiB of uncompressed JSON per message.
- `P2P_CONSENSUS_MAX_QUEUED_BYTES`: 32 MiB per socket; the admission calculation
  includes existing `bufferedAmount`, the JSON bytes, and 14 bytes for framing.
- Missing settings in legacy custom node configuration use those defaults.
  The existing config loader only applies environment overrides to known keys;
  add the keys to a custom config before attempting overrides there.
- Oversized messages and congested/disconnected peers are skipped, not queued for
  durable retry. This can reduce delivery under load; it is not a receipt guarantee.
- Native receive validation, signatures, proposal contents, quorum rules, stored
  candidates and chain catch-up remain unchanged. There is no retroactive block
  rejection, pool deletion, old-queue flush, or cap on every other P2P message type.
- `/client_status` adds `result.consensusGossip` counters: `enqueued`, `oversized`,
  `backpressure`, `unavailable`, `sendErrors`. Enqueued does not mean peer receipt.
  Total socket buffers may also contain non-consensus traffic.

## Rebuild and verify the actual immutable image

From the repository, use a new output directory and run identifier. The scripts
are invoked with `bash`, not assumed to have executable file mode.

```bash
set -euo pipefail
RUN_ID="gossip-$(date -u +%Y%m%dT%H%M%S | tr A-Z a-z)"
IMAGE="ain-cert-native-chain:$RUN_ID"
TESTS="/mnt/newdata/gov/kpi/evidence/$RUN_ID-tests"
docker build -f tools/cert-kpi/native-shards/chain.Dockerfile -t "$IMAGE" .
CHAIN_IMAGE="$IMAGE" bash tools/cert-kpi/run-recovery-tests.sh "$TESTS" "$RUN_ID"
test "$(cat "$TESTS/exit-code.txt")" = 0
jq -e .pass "$TESTS/runtime-source.json"
```

The 2026-09-11 r3 run passed 69 Node tests, 41 native Mocha tests, selected-file
lint and shell syntax checks. It uses CPU2, cpuset0–7, RAM and memory+swap4 GiB,
runc, no GPU, no network, read-only filesystem plus bounded tmpfs. Runtime hashes
and selected helper/test bytes are checked against the built image. Socket tests
use fixtures, not real delivery or throughput. Earlier red runs and lint failures
are retained rather than relabeled as successful runs.

## Preserve the real pending graph

Native `getCatchUpInfo()` returns the union of all longest notarized branches.
It is not necessarily a single linear chain. `verify-pending-chain.js` checks
unique blocks/tips, complete predecessor links back to the expected finalized
block, all branch leaves, native hashes/signatures and deduplicated vote stake.
The denominator is the predecessor validator stake, matching native notarization.
Multiple tips yield `lastHash: null` plus `tipHashes`; consumers must not silently
choose one. This verifier is not a substitute for native DB replay or new finality.

Use `CAPTURE_PENDING_CHAIN=1` with `inspect-consensus.js` as described in
`evidence-budget.md`. Capture only the explicitly selected local process, with
0700 directories and 0600 private files. Record Docker ID/PID/start before and
after; require they match. Wait boundedly for inspector closure: a fixed two-second
sleep was insufficient on this loaded host. An observation failure never warrants
restarting a node. Never publish captured bodies, snapshots, keys or full backups.

At 16:43/16:44 UTC, the two live bridges independently retained the original tail:
node1 had 22 entries, four tips at 23104 and 232 verified signatures; node8 had
21 entries, three tips and 219 signatures. Both were SERVING/RUNNING with the same
container/PID/start. These are separate capture checks, not 451 distinct network
signatures or evidence of finalized advancement.

## Explicit single-node planned repair

Normal maintenance still requires preceding nodes' native health. While the old
network is unhealthy, `PLANNED_REPAIR=1` is a separate, narrowly scoped software
repair gate, not a relaxed KPI/funding gate. Stage a reviewed plan and compose with
the tested immutable image, original identities/volumes/resource settings and:

- `repair.kind = bounded-consensus-gossip`, a unique safe `runId` and observed reason.
- Exactly two live bridges excluded from `order`; original target instance metadata.
- Native verification reports bound by SHA to private captures and live bridge
  ID/PID/start/address; SERVING/RUNNING, signature bypass false, original finalized
  number/hash, required original pending blocks, and capture age at most 15 minutes.
- Passing image/source tests. Before any subsequent target, a fresh equivalent
  checkpoint for every preceding upgraded node, still running the tested image.

The actual phase is `/mnt/newdata/gov/kpi/evidence/planned_gossip_repair_20260911/`:
`order: [2]`, bridges node1 and node8. Its historical checkpoints expire; do not
blindly rerun it. Generate fresh captures/reports and review a new plan if needed.
Do not extend its order to a protected bridge or apply the whole compose project.

```bash
RECOVERY=/mnt/newdata/gov/kpi/evidence/planned_gossip_repair_20260911
PRIVATE=/mnt/newdata/gov/kpi/secrets/planned-gossip-repair-node2-20260911
REFERENCE=/mnt/newdata/gov/kpi/evidence/ledger_signature_audit_20260911/node0
CHECK_ONLY=1 PLANNED_REPAIR=1 bash tools/cert-kpi/maintain-chain-node.sh \
  "$RECOVERY" 2 "$PRIVATE" "$REFERENCE"
```

Only for an unapplied, freshly verified plan, repeat without `CHECK_ONLY=1` to
perform the explicitly planned replacement. Preconditions run before stop.
`recovery-seed.js check` reads the verified seed and destination first: an identical
existing snapshot is reused without inode/mtime changes; a different snapshot,
symlink or staged partial file fails closed. Installation is exclusive and atomic,
never an overwrite. Maintenance takes a private full-volume backup, checks the
original ledger, then replaces only that target. It does not use crash recovery or
automatic resume/restart for this mode. Preserve evidence and reassess any failure.

After startup, observe the same instance for signed-tail catch-up, native health,
actual finalized advancement, socket counters and original ledger preservation.
A fresh container or a passing ledger-byte audit is not consensus recovery. Keep
funding and KPI writes disabled until all original safety/progress gates pass.

## Actual canary outcome, 16:47–16:52 UTC

Only node2 was replaced, at 16:47:29 UTC, using immutable image
`sha256:48d366789e523526b902ddbddc8071aae65d0bb783475c9f8313ee9e44967a65`.
The other nine chain nodes, flashnext, flashtrain and Ainize API retained their
IDs/PIDs/start times. The existing verified seed was reused; the full private
volume backup and original 0–23086 ledger audit passed. A subsequent all-ten
read-only audit also matched all 23,087 original block files byte-for-byte.
These audits reuse the original verified manifest, not 2.5 million new signatures.

At 16:50, node2's same live instance retained all 16 originally captured pending
blocks in an 18-block branch through 23104, verified with 195 signatures. At 16:52
its pool contained 95 blocks/DBs; gossip counters were enqueued863, oversized3,
unavailable39, backpressure0, sendErrors0, and all five outbound queues were zero.
This bounded observation demonstrates actual oversized-gossip skipping and retained
tail catch-up, not a controlled improvement percentage or stability/throughput test.
All ten finalized heights were still 23086 and native health was false.
Reapplying the old node2 plan was safely refused before stop because its instance
had changed. The plan remains single-target; no other node was silently rolled.
