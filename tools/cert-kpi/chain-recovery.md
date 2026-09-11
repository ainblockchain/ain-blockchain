# Existing-ledger snapshot recovery

This is a maintenance procedure, not a TPS test or proof that all ten nodes are healthy.
Never delete volumes, regenerate genesis, fabricate missing votes, or restart a node merely
because an observation timed out. Keep the model, trainer, Ainize API and unrelated GPU work intact.

## Verified failure and fix, 2026-09-11 UTC

- All ten original ledgers contain identical compressed blocks 0 through 23086. A full node0
  audit performed 253,213 distinct native signature checks with signature bypass disabled.
  The other nine ledgers reused that result only for byte-identical compressed files; they did
  not perform another nine sets of signature checks. This audit does not replay DB execution.
- Each latest snapshot named `23000.json.gz` was an incomplete gzip stream. The original node0
  still held a writable file descriptor to that file: this was premature publication of an
  unfinished live write, not proof of irreversible loss. The earlier 22000 snapshots were valid.
- The old reader raised an unhandled Gunzip error. The new stream pipeline contains read,
  decompression, parsing and callback errors. Writes use an undiscoverable temporary directory,
  complete the gzip stream, fsync the file, then atomically rename. Retention deletion happens
  only after success. This does not claim directory-fsync or complete power-loss durability.
- Native startup from 22000 replayed 1,086 unchanged historical blocks through 23086. Exporting
  a new private snapshot waited for background snapshot writes. A separate native startup loaded
  that exported snapshot and reconstructed the same finalized block and state proof.
- The ordinary startup replay retained a notarized-but-unfinalized tail in memory. Stopping all
  original nodes together would discard that tail. Node0 remains the original bridge; node1 is
  the first replacement. Node1's normal P2P catch-up restored the original notarized tip 23102
  and validated new proposals, but finality/health was still not restored at that observation.
- Original nodes2,3,6, then5 and7 independently exited139 with V8 8GiB heap exhaustion; Docker
  `OOMKilled=false` does not rule out a JavaScript heap OOM. Their crash logs are retained.
  These crashes are distinct from the planned node1 stop, which reached its stop grace period.

Original identifiers:

| Item | Value |
|---|---|
| Genesis | `0x3a5876f671ad7414f24ffd67b6224851e7ae4a6f93ea202dbecde875c0a2d8d3` |
| Finalized block23086 | `0x8504f5406f6860d2cd87b2c3c9aaaea4833b49bc0b261d82ae203575acd04f18` |
| Its state proof | `0x8859b7ab0102246ca4d51ff670c4c8db6f6f2b985378c624d3ba77ad657ca2ee` |
| Preserved pending tip23102 | `0x9610e525dc6ceeb3ed597c53de3cb57e560d315a228ef5f59d025894ed6fb2ab` |
| Exported snapshot SHA256 | `ac8c183acb3acd922e3e0adf09c6160f3d0b5f67d466fadf43c0bb72ce92ca6d` |
| Exported compressed size | 1,023,096 bytes |
| Applied canary image | `sha256:32d46eb0455ff33e8e4a83dfc04a67f76a11698f08253aacd3718d154c2da7e7` |

Public evidence under `/mnt/newdata/gov/kpi/evidence/`:
`ledger_signature_audit_20260911`, `ledger_all_ten_audit_r2_20260911`,
`ledger_startup_replay_20260911` (failed latest snapshot),
`ledger_startup_replay_22000_20260911`, `ledger_recovery_validation_20260911`,
`verified_snapshot_reload_20260911`, `snapshot_recovery_final_tests_20260911`,
`chain_recovery_tools_tests_r2_20260911`, and `chain_recovery_20260911`.
Failed command/test attempts remain separate; do not relabel them successful.

## Source build and focused tests

From a checkout of the published source commit:

```bash
docker build -t ain-cert-native-chain:recovery-source \
  -f tools/cert-kpi/native-shards/chain.Dockerfile .
CHAIN_IMAGE=ain-cert-native-chain:recovery-source \
  bash tools/cert-kpi/run-recovery-tests.sh /NEW/EVIDENCE/DIRECTORY unique_run_id
```

The runner checks source hashes against the actual image, runs native snapshot/consensus tests,
ledger/inspector/plan tests, lint and shell syntax in a read-only, no-network/no-GPU container with
2 CPU, cpuset0–7, 4GiB memory and no extra swap. The node-account injection option, 1-node fixture
configuration and signature-verification flags are required; do not omit them in manual tests.
The six plan tests use synthetic staging inputs only; they are not actual snapshot replay evidence.
The final source-built image `sha256:3c6b5461bb18760317ad8d4fc2ba2c56a4935490e55ee65fed33632dc19632e0`
passed 20 Node tests plus 27 native Mocha tests, lint and shell syntax. Its 93 native runtime
files and 13 selected recovery/fixture files match the tested source. The canary uses the earlier
image listed above; its changed runtime files are byte-identical, not a deployment of later
operator helpers or documentation.

## Read-only ledger and startup audit

On the original ten-volume machine, with a source-built image:

```bash
CHAIN_IMAGE=ain-cert-native-chain:recovery-source \
  bash tools/cert-kpi/run-ledger-audit.sh /NEW/EVIDENCE/DIRECTORY unique_audit_id
```

The optional third argument is a completed original audit directory containing `summary.json`
and `blocks.jsonl`; reference manifest integrity is checked. No ledger writes occur.

`replay-startup.js CHAIN_DIR SNAPSHOT_DIR NEW_SUMMARY [SNAPSHOT_NUMBER]` must run inside the
source image with `BLOCKCHAIN_DATA_DIR=/tmp/replay`, `SYNC_MODE=fast`,
`ACCOUNT_INJECTION_OPTION=private_key`, `ENABLE_TX_SIG_VERIF_WORKAROUND=false`, and the retained
original config mounted read-only at the selected `BLOCKCHAIN_CONFIGS_DIR`. Mount the original
volume read-only. Give the temporary container 2 CPU/cpuset0–7, 8GiB memory/no extra swap, private
tmpfs, no network/GPU, and run as the output-directory owner. Do not run it against a different
genesis configuration. `EXPORT_VERIFIED_SNAPSHOT` optionally names an empty, user-owned 0700
private bind directory. Wait for the process exit, including background snapshot writes.

Historical replay and the exported snapshot require private retained state. Operators without
that state can run public regression fixtures but cannot claim they replayed this original ledger.
No private snapshot, original config, volume archive, account keys or full Docker inspect record
belongs in a public release.

## Staging and one-node maintenance

The following path examples refer to the retained machine and are **not commands to repeat on
already-upgraded nodes**. Use new output/backup paths for a genuinely new maintenance operation.

```bash
cd /mnt/newdata/gov
node kpi/pr/ab-m1/tools/cert-kpi/prepare-chain-recovery.js \
  kpi/docker/compose.chain.json \
  sha256:32d46eb0455ff33e8e4a83dfc04a67f76a11698f08253aacd3718d154c2da7e7 \
  kpi/secrets/chain-upgrade-20260911/legacy-config \
  kpi/secrets/chain-upgrade-20260911/verified-snapshot \
  kpi/evidence/ledger_recovery_validation_20260911/summary.json \
  /NEW/RECOVERY/DIRECTORY
docker compose -f /NEW/RECOVERY/DIRECTORY/compose.json config -q
CHECK_ONLY=1 bash kpi/pr/ab-m1/tools/cert-kpi/maintain-chain-node.sh \
  /NEW/RECOVERY/DIRECTORY 1 /NEW/PRIVATE/NODE1/BACKUP \
  kpi/evidence/ledger_signature_audit_20260911/node0
```

After checking the staged image/config/seed, remove `CHECK_ONLY=1` for the explicitly selected
node only. The helper preserves its original inspect privately, stops it once, archives all of
its named volume, verifies the archive checksum/listing, installs the verified snapshot as a new
file, re-audits all historical blocks against the original reference, then uses compose
`up -d --no-deps nodeN`. The tracker and other nodes are not removed. No `--remove-orphans` is used.

Normal order is 1,2,3,4,5,6,7,8,9,0. Each prior replacement must be running the staged image,
native-health=true and still serve the original block hash. Node0 cannot be replaced first.
The effective resources remain 32-CPU quota/128GiB RAM/no extra swap per node, all sharing the
host's eight logical CPUs. This is not an AWS throughput equivalence. Gas-fee workaround remains
enabled for this lab; transaction signature bypass is disabled and early verification enabled.

`RECOVER_CRASHED=1` is a separate, explicit quorum-repair operation: it only accepts an original,
already-exited non-canary/non-bridge container with exit code >=128. It never stops a live node.
The canary must be SERVING and serve the original block; previously upgraded peers must be
running and have passed the post-install original-history audit, but may still be syncing.
Restoring another already-dead validator does not stop those peers. Native health may still be
false while quorum is being restored. This is not a readiness
waiver for funded transactions or KPI tests. Keep the original node0 bridge running.

The first node1 backup failed because a capability-dropped root process could not write a
user-owned private directory. The fix streams tar to a host-created0600 file, with a narrowly
scoped root/DAC_OVERRIDE backup reader and installer; these temporary containers have no network
or GPU. `RESUME_STOPPED=1` only resumes the same recorded stopped original container before any
archive/history/replacement exists. It does not restart it or remove partial files. Other failures
need phase-specific inspection, not blind reruns or automatic rollback.

## Completion gate

Poll the same containers and logs after maintenance; a poll is not another maintenance command.
Before replacing the bridge or permitting writes, independently verify all ten native health
values, finalized block advancement/agreement, original genesis/23086/history preservation,
signature bypass=false, and actual Docker limits. Preserve a pre/post comparison of the protected
model/trainer/API IDs, start times and PIDs. ENV1 stays incomplete until that gate passes.
