# Separate native ten-validator escrow experiment

Development AIN only. This network does not replace, migrate or recover the
original `ain-cert-docker` channel with1AIN locked after its precision failure.
Keep its original keys, genesis, approvals, journal and volumes. Do not use this
experiment for valuable assets or claim unilateral dispute protection.

## Resource and identity boundary

The separate `ain-units-` project runs ten native validators with distinct fresh
accounts, epoch1000ms and the existing native consensus implementation. Each
container has CPU quota32, cpuset0–7, RAM128GiB and total memory+swap128GiB. These
are shared ceilings on the same8-logical-CPU host, not reservations or AWS320vCPU
equivalence. The tracker has CPU0.25/RAM1GiB. The workload clients have CPU1/RAM2GiB.
All use runc, no GPU, read-only root, bounded tmpfs and dropped capabilities.

RPC21081–21090, P2P21501–21510, tracker21079 and experiment peer21041 are separate
from the original network/peer. Host UID/GID own private0700 directories/0600 files;
persistent per-node data binds are under the new private directory. Tracker logs
use its bounded `/tmp/tracker`. Keys are never Docker environment arguments or
public evidence: the entrypoint reads the private file inside the container.

All ten run one immutable native image, with `native_escrow_micro_units` enabled
at block2 only in this new network's full timer configuration. Historical flags,
including the six-decimal transfer bandage, are preserved. The base image's
default flag remains disabled. SDK preflight compares79 native runtime files,
all effective config hashes, client entrypoint, identity, resource limits and
config modification time against the actual running containers. It then checks
every node's genesis, finalized activation, validator set, native transfer rule,
consensus health and block advancement before any signing/funding.

## Fresh preparation only

Run as the non-root workspace owner. Prerequisites are Docker Compose, Node22,
`ss`, the local source/dependency images from `native-escrow-micro-units.md`, and
free experiment ports. The preparation command refuses existing directories,
containers, volumes or occupied ports. Never run it against a live experiment.

```bash
cd /mnt/newdata/gov
stamp=$(date -u +%Y%m%d%H%M%S)
network="$PWD/kpi/evidence/units-network-$stamp"
private="$PWD/kpi/secrets/units-network-$stamp"
CHAIN_IMAGE=ain-cert-chain:escrow-units-20260911 \
  bash kpi/pr/ab-m1/tools/cert-kpi/prepare-escrow-network.sh \
  "$network" "$private" "ain-units-$stamp"
docker compose -f "$network/compose.json" up -d
ESCROW_NETWORK_PLAN="$network/network-plan.json" \
  node kpi/pr/js-m2/tools/state-channel/chain-readiness.js observe \
  "$network/readiness-$(date -u +%Y%m%d%H%M%S).json"
```

An initial observation may fail while the **same live containers** synchronize.
Inspect those containers and repeat only the read-only observation with a new
filename. A timeout is not a restart signal. An actual terminal failure requires
preserved logs/config/state and a diagnosed correction, not erased data.

The first2026-09-11 startup failed before chain loading: dropped root capabilities
could not read owner-only source/config, and tracker logs targeted read-only root.
All11 terminal instances/logs were saved. The same genesis/keys were retained;
only that new project's configuration was corrected to owner UID/GID and private
data binds. Its unused original named volumes were not deleted. Actual repaired
configuration is `kpi/evidence/native_units_network_20260911/compose-r2.json` and
plan `network-plan-r2.json`. Do not apply its old `compose.json` over this live run.
Final generator/config tests include the corrections; the initial failure and
repair-source copies remain separate from later formatting changes.

## SDK and funded scenario

Docker `FROM` needs the verified local image **tag**, not a bare `sha256:...` ID
which BuildKit interprets as a registry name. Compare tags with their expected
local IDs before reusing dependencies. `docker run` may use the immutable ID.

```bash
cd /mnt/newdata/gov
docker build --network none \
  -f kpi/pr/js-m2/tools/state-channel/refresh-sdk.Dockerfile \
  --build-arg BASE_IMAGE=ain-cert-channel-sdk:escrow-units-20260911 \
  --build-arg CHAIN_IMAGE=ain-cert-chain:escrow-units-20260911 \
  -t ain-cert-channel-sdk:units-network-local kpi/pr/js-m2
RUN_ID="units_$stamp" ESCROW_NETWORK_PLAN="$network/network-plan.json" \
  AIN_CHANNEL_IMAGE=ain-cert-channel-sdk:units-network-local \
  bash kpi/pr/js-m2/tools/state-channel/run-escrow.sh \
  "$private/config/genesis_accounts.json" \
  "$PWD/kpi/evidence/units-funded-$stamp" "$PWD/kpi/secrets/units-funded-$stamp"
```

Use the previously prepared network variables only for that same experiment.
For the existing repaired network, explicitly select its `network-plan-r2.json`
and original private config rather than generating a replacement genesis. A new
funded run requires a free21041 and fresh evidence/private directories. Never use
a new channel to hide an unresolved prior run. Without an explicit v2 plan the
runner retains the legacy precision refusal and original endpoints.

The runner freezes its executable tools and hashes before execution; those mounted
files are authoritative even when the SDK dependency image predates a script fix.
It deposits0.5+0.5AIN, performs20 co-signed3-micro-AIN transfers/duplicate deliveries,
SIGKILLs only its own peer, replays the same journal, obtains both account approvals,
and audits both payouts and the exact finalized transaction through node5/node9.
The final auditor has no keys mounted. This is not a7000TPS benchmark.

## Admission is not finality

Actual run `units_funded_r2_20260911` revealed a harness bug: native rule failure
12103 at admission can stay in the submitter's transaction pool. Its initially
rejected `reject-missing-approval` intent later executed after both approvals.
That original signed intent, hash
`0xc272f49ae702fa3f924b912d721b0f59fc1641ee47a384b4ec8bdb7f925efd38`,
paid both participants in block520, hash
`0x1635bb8dd2deeaae2ae31b763b9e583e57c4f8e0360bd488c8e1903b6a26ea23`.
Independent readers verified receipt, approvals, transfer records and balances
9.99994/10.00006/escrow0. The later intended release is REVERTED, not successful.
No transaction was resent and no frozen rule was changed. Read-only reconciliation
records `finalizedOnChain:true` but **`scenarioPassed:false`** for this failed harness run.

The corrected runner waits for actual `is_finalized:true` and REVERTED before
proceeding after an on-chain negative case. It audits unchanged target state,
independent receipt and block inclusion. Only native precheck codes explicitly
excluded from blocks are admission-only refusals. Successful submissions likewise
use finalized outcomes, not the initial RPC code. Unknown states stop on the same
intent without retries/resets; the terminal response is preserved before assertion.

For an already investigated earlier payout, explicit read-only reconciliation is
`inspect-settlement.js EXISTING_EVIDENCE NEW_OUTPUT.json reject-missing-approval`.
Do not change the original `cooperative-release` intent or synthesize a successful
`settled.json`. The normal auditor omits the final argument and requires the
runner's own successful settlement record. Full replay, TPS and other KPI results
must be distinguished from this focused funded scenario.

## Resume a preflight-only settlement interruption

`units_funded_r4_20260911` funded the same separate network and recovered its own
peer, but the closing preflight observed native health=false before any closing
intent existed. Its original exit1/logs are preserved. Do not run opening again.
After fresh read-only readiness, use the **same** evidence, keys, genesis, image
and peer with the restricted command:

```bash
cd /mnt/newdata/gov
AIN_CHANNEL_IMAGE=ain-cert-channel-sdk:units-network-20260911 \
  bash kpi/pr/js-m2/tools/state-channel/resume-unstarted-settlement.sh \
  "$PWD/kpi/secrets/native-units-network-20260911/config/genesis_accounts.json" \
  "$PWD/kpi/evidence/native_units_funded_r4_20260911" \
  "$PWD/kpi/secrets/native-units-funded-r4-20260911"
```

This requires `flock`, serializes resumes, refuses a still-live prior resume,
requires successful funding/peer recovery, and rejects any already-signed closing
intent or existing settlement. It creates a separate timestamped source/protocol
audit/container/log directory. Existing intents and failed logs are not replaced;
keys mount read-only. Only after independent payout verification does it stop the
same recorded experiment peer. It never restarts validators. It is not an automatic
recovery command for a partially signed or uncertain settlement: inspect those
exact existing hashes instead. A negative test confirms rejection of the already
partially settled r2 run. New-network transient health failures at20:34/20:37/20:40
remain stability failures even when a subsequent observation or resume succeeds.
