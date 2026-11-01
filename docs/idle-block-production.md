# Idle block production

With `IDLE_BLOCK_PROPOSAL_SKIP=true`, a validator that is the selected proposer of an
epoch does not propose when there is nothing to put in a block. The chain then stops
growing while no application transactions arrive, apart from an optional heartbeat.
The default is `false`, which keeps the original one-proposal-per-epoch behavior.

| Node param (env var or `node_params.json`) | Default | Meaning |
|---|---|---|
| `IDLE_BLOCK_PROPOSAL_SKIP` | `false` | Skip proposals while the chain is idle and settled. |
| `IDLE_HEARTBEAT_INTERVAL_MS` | `600000` | Make a finalizing heartbeat when the notarized tip is this old. Values ≤ 0 fall back to the default, and the minimum is one epoch. |

Both params have defaults in code, so networks whose `BLOCKCHAIN_CONFIGS_DIR` has its own
`node_params.json` without these keys can still set them via env vars.

## When a proposer still proposes

Finality needs a notarized chain that ends with three blocks in consecutive epochs. All
blocks of that chain except the last one are finalized (`BlockPool.getFinalizableChain`).
The proposer of epoch `e` proposes exactly as before unless all of these hold:

1. **The chain is settled.** Every block except the notarized tip is finalized. The tip
   has no transactions and no evidence. The tip directly follows the last finalized block
   in epochs, so it is the block that completed the three-epoch run. In addition, the node
   has seen no other valid block at or above the tip's height. A block above the tip means
   votes are still on their way. A competing block at the tip's height means some validators
   missed the tip's votes and re-proposed that height (a vote split). Proposing on the tip
   resolves the split, because the next block carries the tip's votes in `last_votes`.
   Otherwise nobody could notarize anything until the heartbeat.
2. **No heartbeat is due.** The notarized tip is younger than `IDLE_HEARTBEAT_INTERVAL_MS`.
3. **The pool has no work.** The pool holds no transactions other than consensus votes and
   proposals. If it does hold some, the proposer builds the block. It drops the block only
   when nothing in it could be included (for example, every pending transaction has a
   future nonce).

As a result:

- **A transaction is never left unfinalized.** A block with transactions makes the chain
  unsettled, so every proposer keeps proposing until that block is final. This takes
  two more consecutive epochs, the same latency as before. If a proposer is offline,
  the next proposers keep going.
- **A transaction that arrives during idle** is proposed by the very next epoch's proposer,
  once the transaction has reached it.
- **A heartbeat is a short burst that finalizes.** The first block makes the chain
  unsettled, and it takes three blocks in consecutive epochs to settle again. The
  finalized height (`ain_getLastBlockNumber`) therefore advances at least once per
  heartbeat interval.
- **Uncertainty means proposing as before.** That covers an unreadable chain view, a fork,
  a block seen above the tip, or an unhealthy network.

## Why this is safe

- **Only the proposer changes.** Block format, block validation, votes, notarization and
  finality are unchanged. A missing proposal is already a normal event, for example when a
  proposer is offline. The protocol has no missed-proposal offense and no epoch-gap rule:
  `validateBlockNumberAndHashes` only requires increasing epochs, and only in LIGHTWEIGHT
  mode. Validators running older code therefore accept every block a node with this
  policy makes, so the policy can roll out one node at a time. The mixed-network test
  runs an old-release validator next to new ones.
- **Proposer selection is unchanged.** The seed is the tip's `last_votes_hash` plus the
  epoch. A proposer that skips just leaves its slot empty.
- **Votes after a gap are unaffected.** The tip's votes stay in the block pool and go into
  the next block's `last_votes`, whatever the gap. The vote and proposal rules check block
  numbers and hashes, not timestamps.
- **Sync works.** New or restarted nodes sync finalized blocks by number, then get the
  notarized tail (the tip and its votes) through `catchUpInfo`. Gaps between epochs
  already happen today.

## Local status changes (not consensus)

Without the policy, consensus is healthy while the last finalized block is less than
`consensus/health_threshold_epoch` epochs old. An idle chain would break that rule. With the
policy enabled on a node, that node's `net_consensusStatus.health`, `/health_check` and the
epoch-timer watchdog use the following rule instead:

- **Settled chain:** healthy while the tip is younger than the heartbeat interval plus the
  threshold.
- **Unsettled chain:** healthy while the oldest block that still waits for finality is
  younger than the threshold. This is the original rule, applied to the blocks that matter,
  so a stalled transaction is reported as fast as before.
- **Stall signals:** while the finalized block is older than the threshold, the node is
  unhealthy if any of these has lasted longer than the threshold (10 epochs, 20 s on L2):
  - an includable non-consensus transaction is waiting in the pool, for example in a tx
    block that never notarizes (transactions with a future nonce are ignored, so they can't
    make nodes unhealthy);
  - a valid block other than the tip exists at or above the tip's height;
  - the node has zero peers, for example a solo-restarted node.

  These signals are not checked while the finalized block is recent, so a busy pool under
  load doesn't change health.

The layer gateway and the relayer require `health === true`, so this change is needed for
them to keep working.

**Enable the policy on all validators close together, with the same
`IDLE_HEARTBEAT_INTERVAL_MS`.** A node with the policy off keeps the old health rule. Once
the network is mostly idle, the finalized block gets older than 10 epochs, so that node
reports unhealthy until it is switched on too. Its proposals are still accepted. A
different heartbeat per node only changes when bursts happen, but mixed values make health
and monitoring harder to reason about.

## Block rewards (`reward_by_elapsed_epochs` timer flag)

`_distributeFee` pays `annual_rate * epoch_ms / year * stake` per block. That assumes one
block per epoch, so with idle blocks validator staking rewards drop in proportion to the
number of blocks produced (about 99% at a 10-minute heartbeat).

The timer flag `reward_by_elapsed_epochs` fixes this. It is a validator rule, so it is off
unless scheduled. When it is enabled at block number B:

- **Proposal epoch check:** a proposal tx for block N ≥ B must carry `epoch` equal to the
  block's own epoch. A mismatch is `INVALID_EPOCH`, and validators vote against it.
- **Reward scaling:** the reward for block N-1, distributed by proposal N (when N-1 ≥ B), is
  multiplied by `epoch(N) - epoch(N-1)`. The multiplier is at least 1 and covers at most
  30 minutes (`Functions.MAX_CREDITED_REWARD_MS`, three default heartbeat intervals), so it
  must be deterministic and can't depend on the per-node heartbeat setting. A heartbeat
  longer than 10 minutes forgoes part of the reward.
- **No votes for future epochs:** validators don't vote for a block whose epoch is more than
  `ConsensusConsts.MAX_FUTURE_EPOCHS_TO_VOTE` (2) epochs ahead of their local epoch. A
  proposer therefore can't claim a far-future epoch to inflate the reward or stall honest
  proposers. This is a local voting rule, active only once the flag is enabled.

**Clocks must be synchronized.** The epoch is derived from wall-clock time. With
`HOSTING_ENV=local`, which the on-prem nodes use, the built-in NTP adjustment is disabled
(`consensus/index.js` `setEpochTransition`). Operators must run chrony or NTP on every
validator, and should alert on an offset of more than about one epoch. That matters for the
future-epoch voting rule (clock skew beyond two epochs means missed votes) and for heartbeat
timing.

To enable it, add the flag to the `timer_flags.json` of every node, for example
`"reward_by_elapsed_epochs": { "enabled_block": <future block>, "has_bandage": false }`.
Every node must run this release and have the updated file before that block is reached.
Check the decision against the tokenomics first, because missed epochs are then paid too.

## Other effects to know

- **Monitoring:** block-age alerts must allow `IDLE_HEARTBEAT_INTERVAL_MS` plus a margin.
  Use `net_consensusStatus.health` instead of block age where possible.
- **Layer 2 checkpoints:** L2 checkpoints are taken every `checkpointInterval` L2 blocks
  (10). An idle L2 checkpoints about every 3–4 heartbeats instead of every 20 s, and those
  checkpoint transactions keep L1 active.
- **Stale pre-execution time:** transactions are pre-executed at submission against
  `lastBlockTimestamp()`, which can be up to one heartbeat old while idle. Time-based
  rules, such as a stake lockup that has just expired, can reject a transaction at
  submission for up to one heartbeat. Retrying succeeds once a block has advanced the time.
- **Pool timeout:** pool and tracker timeouts (`TX_POOL_TIMEOUT_MS`) are evaluated on
  finalization, so they now run at least once per heartbeat.
- **Steady-state traffic:** with at least one transaction every epoch, block production is
  the same as before. Each isolated burst of activity costs at least three blocks: the
  transaction block plus two more for finality.

## Rollout (node by node)

1. **Deploy the binary with the policy off**, one node at a time (the default). Wait until
   each node is synced and has the same finalized hash as the others before moving on.
2. **Enable the policy on one validator.** Set `IDLE_BLOCK_PROPOSAL_SKIP=true` and
   optionally `IDLE_HEARTBEAT_INTERVAL_MS`, then restart the node. While old and new
   validators are mixed, old proposers still propose every turn and new proposers add only
   what finality needs, so finality is unaffected. Enable the policy on the remaining
   validators the same way.
   Do this for all validators close together with the same `IDLE_HEARTBEAT_INTERVAL_MS`:
   nodes still running the policy off report unhealthy once the network idles.
3. **Verify the network.** Check the following:
   - the block rate drops while idle;
   - `net_consensusStatus.health` is `true` on all nodes;
   - the layer gateway has at least 2 healthy witnesses;
   - a submitted transaction is finalized within the usual latency;
   - checkpoints and the relayer keep working.
4. **Roll back if needed:** set `IDLE_BLOCK_PROPOSAL_SKIP=false` and restart. No state or
   data migration is involved.

## Tests

- **`test/unit/idle-policy.test.js`** covers the policy rules, `tryPropose` integration, the
  pool work detection, health, rewards, the epoch check and the defaults for custom configs.
- **`test/consensus/idle-network.test.js`** (`npm run test_idle_consensus`) runs three
  in-process validators on the real consensus code with a fake clock. It covers these
  cases:
  - no blocks while idle after finality;
  - a control run with the policy off;
  - a transaction proposed in the next epoch and finalized after two more;
  - finality with a validator offline;
  - heartbeat bursts and their interval;
  - mixed old/new validators;
  - a vote split at the tip, resolved well before the heartbeat;
  - a stalled chain (two of three validators down) and a node with zero peers, both
    reported unhealthy within the threshold;
  - rewards for elapsed epochs.

  Set `OLD_CODE_DIR=<checkout of the previous release>` to run the "old" validators from
  that release.
