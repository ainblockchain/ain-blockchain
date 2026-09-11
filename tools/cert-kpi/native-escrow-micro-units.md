# Experimental native escrow micro-unit protocol

This is an opt-in protocol candidate, not a live ten-validator deployment or a
7,000 TPS result. The existing development channel's failed1AIN remains locked.
Do not overwrite its configuration, approvals, journal, genesis or volume. The
new protocol does not migrate that frozen legacy policy or recover its funds.

## Arithmetic and activation

Legacy `_release` computes `1 - 0.50006 = 0.49994000000000005`, rejected by the
live six-decimal transfer rule. Rounding that transfer alone also conflicts with
the legacy frozen balance guard.

Version2 requires both `native_escrow_micro_units` timer-flag activation at the
execution block and this exact escrow's immutable `config/native_release_version=2`.
The base flag has `enabled_block:null`: **disabled by default**. A missing flag in
an environment-specific timer file also disables it. Such files replace, not merge
with, the base file; preserve all historical flags when preparing configurations.

The release accepts exactly
`{"version":2,"source_units":499940,"target_units":500060}`. Nonnegative safe
integer amounts must conserve funded micro-units. Transfer values remain canonical
six-decimal AIN; the global transfer rule is unchanged. Opted-in escrow balances
use checked integer arithmetic, including0.1+0.2 deposits. Unsupported escrow residue
or unrepresentable amounts fail rather than silently rounding existing assets.

Ordinary counterpart accounts retain native JavaScript-number arithmetic, with
their observed deltas checked in micro-units. Stored balances are not rounded:
the fractional experiment retains target balance `10.000060000000001`. This is not
a conversion of the whole ledger to decimal storage. A failed nested operation
rolls back the entire transaction, including an already-executed first payout leg.

The SDK uses `cooperativeEscrow({...options,nativeReleaseVersion:2})` and
`microUnitEscrowRelease(close)`. Both immutable account-signed approvals, recipient
records, native-call ancestry and canonical escrow balance steps remain required.
Version1/default policy generation matches the actual frozen policy byte-for-byte.
This is cooperative closing, not unilateral challenge/timeout adjudication.

## Source-only offline builds

These require previously built **local** dependency images, not registry tags.
The native refresh compares package.json/yarn.lock byte-for-byte before reusing
dependencies. Changed dependencies require a full build. The first offline full
build failed at apt because its cache was unavailable; that failure is retained.

```bash
cd /mnt/newdata/gov/kpi/pr/ab-m1
docker build --network none -f tools/cert-kpi/source-refresh.Dockerfile \
  --build-arg BASE_IMAGE=ain-cert-chain:sync-cursor-r2-20260911 \
  -t ain-cert-chain:escrow-units-20260911 .
cd /mnt/newdata/gov/kpi/pr/js-m2
docker build --network none -f tools/state-channel/refresh-sdk.Dockerfile \
  --build-arg BASE_IMAGE=ain-cert-channel-sdk:precision-guard-20260911 \
  --build-arg CHAIN_IMAGE=ain-cert-chain:escrow-units-20260911 \
  -t ain-cert-channel-sdk:escrow-units-20260911 .
```

CHAIN_IMAGE selects the native implementation copied into the SDK image. Omitting
it retains BASE_IMAGE's native chain; it does not upgrade an old implementation.
Verify runtime source hashes, not just unchanged package-version strings.

## Controlled validation

```bash
cd /mnt/newdata/gov
stamp=$(date -u +%Y%m%d%H%M%S)
CHAIN_IMAGE=ain-cert-chain:escrow-units-20260911 \
  bash kpi/pr/ab-m1/tools/cert-kpi/run-recovery-tests.sh \
  "$PWD/kpi/evidence/units-core-$stamp" "units-core-$stamp"
docker run --rm --runtime runc --network none --cpus 2 --cpuset-cpus 0-7 \
  --memory 4g --memory-swap 4g --read-only --tmpfs /tmp:rw,size=256m \
  --cap-drop ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  -e NVIDIA_VISIBLE_DEVICES=void -e BLOCKCHAIN_DATA_DIR=/tmp/native-tests \
  -e BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/1-node \
  -e ACCOUNT_INJECTION_OPTION=private_key -e ENABLE_TX_SIG_VERIF_WORKAROUND=false \
  -e ENABLE_GAS_FEE_WORKAROUND=true -e ENABLE_REST_FUNCTION_CALL=true \
  --entrypoint sh ain-cert-chain:escrow-units-20260911 \
  -c 'node_modules/.bin/mocha --timeout 160000 test/unit/escrow-units.test.js test/unit/native-escrow-version.test.js test/unit/functions.test.js && node_modules/.bin/eslint db/escrow-units.js test/unit/escrow-units.test.js test/unit/native-escrow-version.test.js && node --check db/functions.js'
RUN_ID="units_$stamp" AIN_CHANNEL_IMAGE=ain-cert-channel-sdk:escrow-units-20260911 \
  bash kpi/pr/js-m2/tools/state-channel/run-native-db.sh \
  "$PWD/kpi/evidence/units-$stamp" micro-units
RUN_ID="fractional_$stamp" AIN_CHANNEL_IMAGE=ain-cert-channel-sdk:escrow-units-20260911 \
  bash kpi/pr/js-m2/tools/state-channel/run-native-db.sh \
  "$PWD/kpi/evidence/fractional-$stamp" micro-units-fractional
RUN_ID="legacy_$stamp" AIN_CHANNEL_IMAGE=ain-cert-channel-sdk:escrow-units-20260911 \
  bash kpi/pr/js-m2/tools/state-channel/run-native-db.sh \
  "$PWD/kpi/evidence/legacy-$stamp"
```

Use fresh output directories; never overwrite prior evidence. Native experiments
use Docker CPU2/cpuset0–7/RAM and total memory+swap4GiB, network none, read-only root,
bounded tmpfs and no GPU/live-chain volumes. Signatures are verified; zero gas prices
are development-only. The native fixture enables the candidate flag only inside
its isolated process. Source refresh and tests never activate it on a running node.

Verified2026-09-11:29 new native/unit cases,24 existing function cases and186 existing
recovery/consensus cases pass, alongside SDK24 Jest+4 Node cases. Each version2
variant executes27 signed operations, including12 whole-DB rollback rejections and
20 co-signed3-micro-AIN transfers. Escrow reaches zero and allocations match:
499940/500060 units for1AIN,99940/200060 for0.3AIN.

The first payout executes before an intentionally denied second credit; the entire
DB proof remains unchanged after rejection. That isolated participant-balance rule
is restored before successful payout; frozen escrow rules/owners are never relaxed.
The legacy regression still rejects its residue release:23 operations/11 rejections.
`settlementSuccessful:true` here means **isolated native DB execution** and
`finalizedOnChain:false` excludes network finality or TPS. The same original live
transaction is separately confirmed REVERTED with escrow1, not recovered.

## Remaining network gate

Before version2 live funding, all ten intended validators must run the audited
implementation and the same scheduled activation, preserve their intended genesis,
and pass native health/advancement checks. Verify actual images/code and timer files.
Do not activate this on mixed binaries or restart nodes after observation timeouts.
Use a separately identified controlled ten-validator experiment or a fully audited
scheduled upgrade; never erase or replace the existing failed run's history.

`run-escrow.sh` deliberately remains the legacy safety-refusal runner. Version2
network preflight, funded peer recovery/finalized payout, sustained load and7000TPS
remain unfinished. These DB fixtures do not complete those gates, M1/M3–M6, public
Ainize blob replication or the100-dataset lifecycle.
