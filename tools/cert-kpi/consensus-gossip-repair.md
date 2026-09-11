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

## Finality advanced: stop the old-height maintenance plan

The three later phases actually changed only node3/node6, node0/node1, and
node7/node5, respectively. Node5 started at17:29:47 UTC on the lazy-diagnostics
image. Its subsequent capture preserved the same process and closed the inspector,
but verification refused `23141 !== 23086`: finalized history had advanced beyond
the plan's snapshot. This is a correct fail-closed result, not a corrupt capture
or permission to restart node5. No further target in that order was maintained.
All staged plans are historical and partially applied; do not run whole-compose
up/down, reset their order, or reuse expired pending-only checkpoints.

At17:35, an all-ten read-only disk audit passed. Nodes0/1/2/3/5/6/7/8 had finalized
23222 with hash `0xdd165490e18735e5086bd88454f6023235eb24eb698177ee67b4c9e84fe18698`.
Node0 retained all23,087 original block files byte-for-byte and verified136 newly
finalized blocks with1,172 native signature checks. The other seven advanced
ledgers matched that verified manifest; do not multiply the signature count by
eight. Nodes4/9 still retained the original23086 prefix then. This audit checks
block bytes/hashes/linkage/signatures, not a new full-state DB replay or sustained
all-ten consensus health.

Old node4 subsequently actually exited139 at17:40:54 UTC with a fatal V8 heap
error, PID0 and OOMKilled=false. Its container and full volume were preserved
privately without restarting it. At17:50:23, the other nine original instances,
including unchanged node9, reported SERVING, native health=true and finalized
height23588. Their original23086 block hash still matched. This later RPC sample
is not an all-ten success or a byte/signature audit through23588. The17:35 audit
remains the bounded cryptographic evidence. Both intermediate unhealthy and later
healthy samples are retained; no continuous stability or causal speedup is claimed.

Recovery of node4 now needs fresh, same-instance bridge proofs that recognize
the retained original pending blocks in finalized history. The old23086
pending-only proof cannot certify those advanced bridges. A newer seed must not
be copied onto an older disk head without verified missing history and state
replay. At this17:50 observation the post-finality recovery path was not yet
implemented. The following addition addresses that gap without opening the
all-ten readiness/funding/TPS gates prematurely.

Evidence: `gossip_rollout_20260911`, `gossip_rollout_b_20260911`,
`gossip_lazy_rollout_20260911` and `ledger_after_finality_20260911` under the
experiment evidence root. Flashnext, flashtrain, the Ainize API and lifecycle
PID86742 retained their running instances. CPU quotas remain shared across the
same eight logical host CPUs; neither the rollout nor these tests establish an
AWS320-vCPU performance equivalence.

## Fresh finalized-history checkpoints and exact seed-height guard

The later `repair.checkpointKind: finalized-history` mode recognizes all original
pending hashes in a complete native-audited finalized ledger. It does not pretend
they remain in a pending pool or change the old snapshot's height. Both preserved
bridges still require matching live container ID/PID/start/image, disabled
signature bypass, SERVING/RUNNING and native-health observations. The auditor
must use the plan's tested immutable image and exit successfully. Its summary and
ordered manifest are SHA-bound, contiguous from the unchanged genesis, with
matching original block/state proof, retained pending hashes and a live RPC hash
at the audited head. The current finalized head may be newer than that audit.

Both the audit and subsequent capture must be within fifteen minutes. The audit
must start after the same bridge instance started, and after any explicitly
confirmed target heap termination. The before/after bridge metadata must match.
Changing a proof, manifest, genesis, old state, live hash or image; restarting a
bridge; missing a retained block; or presenting stale/pre-crash observations is
refused. This is native signed-history preservation, not full-state replay or an
independent consensus proof of every newer RPC-reported block.

Use the source-built image and the existing `run-ledger-audit.sh` to create a NEW
read-only audit directory. A previous passed manifest may be a reference; only
byte-identical blocks reuse its signatures. A newer block outside that manifest
is verified natively. Then capture each of the two separately preserved bridges:

```bash
node tools/cert-kpi/capture-finalized-checkpoint.js \
  "$PLAN" "$BRIDGE_INDEX" "$NEW_AUDIT" "$NEW_CHECKPOINT"
```

This command uses bounded local read-only native RPC and sanitized Docker
metadata; it does not signal an inspector, stop/restart a node or publish private
DB captures. Insert the resulting `checkpoint.json` into the NEW reviewed plan's
`repair.bridges`, keeping the exact source/testing/seed/identity/terminal evidence.
Do not rewrite or resume a previously partially applied pending-only plan.

For this mode, `maintain-chain-node.sh` now requires the target's native disk head
to equal the verified snapshot height, both before any stop and immediately
before seed installation. A live target that has advanced, a lagging target
missing history for a newer seed, or a target that advances after preflight is
refused. No old seed is silently applied to a newer head. Actual heap recovery
still needs `PLANNED_REPAIR=1 RECOVER_CRASHED=1`; `CHECK_ONLY=1` runs the gates
without creating backup/output directories or modifying the target. On failure,
preserve the same instance and inspect its state; never infer terminal status
from a timeout.

The new focused fixtures cover31 history/capture cases, five preflight integration
cases and four seed-head cases. The old image incorrectly accepted mismatched or
advancing heads in three of the four seed fixtures; those failures are retained.
The final source-built image passes128 Node plus47 native Mocha tests (175), with
selected lint and shell checks. Initial wrong-working-directory commands and an
intermediate max-line-length lint failure are separate failed attempts, not
successful native/network experiments. Actual repair and all-ten readiness must
still be recorded separately after these tests.

The first actual CHECK_ONLY run also exposed a read-only-container prerequisite:
native FileUtil initializes a logger directory when reading the disk head. That
run failed before any target stop, backup or seed mutation. Seed check/install
now use a64MiB temporary filesystem and `BLOCKCHAIN_DATA_DIR=/tmp/recovery-seed`;
the mounted chain remains read-only during preflight. This fixes logger scratch
storage without making the image writable, changing file permissions or bypassing
the native head guard. The failed preflight and its same-target replay are kept.

## Native replay of the first-segment synchronization stall

Node4 was recovered at18:19:53 UTC with its original23,087 block files and snapshot
reused byte-for-byte; no stop signal was sent to the previously exited instance.
The other nine chain nodes and model/trainer/API instances were unchanged. Its
new process stayed alive with nine inbound/nine outbound peers, but CHAIN_SYNCING
remained at23086 while its notarized pool reached23105. This is not a new crash.
At18:30, a private capture of that same live instance verified19 pending blocks,
200 signatures, one tip at23105 and the original16-block tail. The inspector closed.

The native protocol requested segments only from the finalized height. The first
20 blocks were correctly executed, but lacked the three consecutive notarized
epochs needed to finalize. The next request therefore fetched the same first
segment rather than the blocks that could advance finality. Its same-cursor
throttle could also suppress the immediate follow-up until another event arrived.

`replay-chain-sync.js` copies the actual original prefix and verified snapshot
into disposable storage, then drives native `handleChainSegment`, DB validation
and finalization with real subsequent ledger blocks and simulated socket frames.
It starts no live P2P network, epoch timer or new chain. Six requests on the old
image repeatedly used23086, ending at finalized23086/notarized23105. The corrected
image requests23086→23105→23124→23143 and finalizes23159, matching the independent
original ledger hash. The73 observed `Transaction.verifyTransaction` calls are
that method's calls, not a claim about every lower-level signature operation.

The per-peer cursor advances only to a notarized block with a retained executed
DB and a contiguous branch rooted at the actual finalized block. Missing DB,
unnotarized/seen-only blocks, wrong heights, lost branches and different ancestry
fall back to finalized height. Peer reset/reassignment clears the cursor; failed
native merges retain the existing reset behavior. Heartbeat retries only a
CHAIN_SYNCING process, respecting the existing duplicate-request throttle. It
does not restart the process, change the finalized height directly, or weaken
native signature/state/epoch/quorum checks. Servers still receive the existing
segment-request format and need no new wire endpoint.

The focused11 cursor/heartbeat cases and existing suites pass128 Node +58 native
Mocha tests (186), selected lint and shell checks. Native red/green replay is a
separate real-data experiment, not eleven real-network recoveries or a TPS test.
The live-node fix requires a NEW reviewed software-repair plan with fresh
finalized-history bridges, all19 retained pending hashes, full-volume backup and
the exact target disk/seed height gate. It is planned maintenance for the proven
cursor defect, never a restart solely because an observation timed out.
