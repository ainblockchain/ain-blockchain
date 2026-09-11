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
original ledger, then replaces only that target. The initial node2 phase did not
use crash recovery. Automatic resume/restart is forbidden; the later explicit
terminal-heap recovery extension below is a separate operator decision.

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

## Later rolling repair and confirmed heap termination

`capture-pending-checkpoint.sh PLAN INDEX NEW_PUBLIC_DIR NEW_PRIVATE_DIR` automates
the same bounded, local-only capture and native verification. It refuses invalid
indices, reused/nested output directories, image mismatches, exited targets,
signature bypass and an already-open inspector before signalling a node. It records
instance metadata before/after verification, inspector closure, exit code and a
`checkpoint.json` bound to the native proof SHA. It never restarts the target and
does not dump its private configuration. Run it with `bash`; a failed observation
requires checking the same live instance, not starting a replacement. Eight mock
preflight tests and actual bridge/new-node captures cover different scopes.

At 17:00:16 UTC the old node0 actually exited139 with V8's fatal heap-limit message
in `JsonStringify`; Docker reported exited/PID0, not an observation timeout. Its
container, disk and terminal log were preserved. Recovery now optionally requires
all of the following, in addition to the existing image, seed, identity and
original-tail gates:

- Explicit `PLANNED_REPAIR=1 RECOVER_CRASHED=1`, never automatic detection from RPC.
- A reviewed `repair.terminalTargets` entry with `kind: heap-exhaustion`, exact
  index/container ID/exit code/finished timestamp and SHA-bound fatal heap log.
- The same actual Docker target is exited, not running, PID0, with signal-range
  exit code and a valid finished timestamp after its original start.
- Both live bridge captures are newer than that confirmed terminal event and no
  older than fifteen minutes. An ordinary/clean stop, live process, changed log,
  stale/pre-crash proof or undeclared terminal target is refused.

No stop signal is sent to an already-exited target. Its original full-volume
backup and prefix audit still precede installation. This is not a general-purpose
crash loop, a signature bypass, a fresh chain, or permission for funding.

The primary bridge may now be any of the two preserved node indices, with matching
container ID. When replacing a previous bootstrap node, point that target at a
different live bridge instead of itself or a known exited peer. Normal live-target
maintenance remains separate from explicit terminal recovery. Eleven additional
pure preflight cases cover this mode and primary-bridge reassignment; actual
Docker/native evidence is required as well.

The later phase directories are `gossip_rollout_20260911` (node3 and node6 applied,
old node0's genuine heap termination recorded) and `gossip_rollout_b_20260911`
(new bridges node2/node6; node0 recovered at17:12:49 before subsequent targets).
Do not run either staged compose across the whole project. Historical captures
expire; checkpoint refresh and target-by-target native verification are mandatory.

## Remove disabled-debug serialization, without changing epochs

Further review found eager `JSON.stringify` in block-pool branch traversal,
consensus handling, P2P receive/send and node diagnostics. `Logger.debug` discarded
the text when DEBUG was false, but argument construction had already serialized
the full bodies. Its new factory form evaluates text only while DEBUG is enabled
and logging has not finished; existing string callers remain supported. Diagnostic
factory errors remain contained by the logger, not propagated into consensus.
The high-volume call sites now pass factories. Receive parsing and required
hash/signature/DB serialization are unchanged.

The focused old-image regression had three failures: enabled factories were not
called, their error containment was absent, and a nine-block graph fixture was
serialized 235 times with DEBUG disabled. The corrected traversal keeps the same
native branch/tip selection with zero diagnostic body serializations. These are
small fixtures, not a measurement of 235 actual large-message copies or network TPS.
Full immutable-image validation passed 88 Node plus 47 Mocha tests (135), selected
lint and shell checks. An intermediate passing test image had trailing whitespace;
the final source/image was rebuilt and retested after fixing it.

The original experiment's `genesis/epoch_ms` remains1000 and native finality still
requires three consecutive notarized epochs. Increasing pending heights alone is
not finalized advancement. No epoch, genesis hash, quorum, signature requirement,
block contents or KPI acceptance threshold was changed to make recovery pass.

`gossip_lazy_rollout_20260911` preserves new live bridges node0/node1, with a planned
order starting at node7. That old node had independently exited139 at17:16:01 with
a V8 heap failure; it was recovered from the original volume at17:26:06 using
`sha256:c5733838931ce3850928af6dbd9d0b21e765fd4ca4b1a8b2060d7308284a3f17`.
Native tail checks remain mandatory before any later target. This phase is not
permission to reapply either earlier partially executed plan or restart live
nodes on an observation failure.
