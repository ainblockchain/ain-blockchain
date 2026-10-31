# Bounded block history

A node can retain current state and a sliding block window instead of storing
one block and hash-index file for every elapsed consensus interval forever.
This is a local storage policy, not a consensus or transaction-format change.

## Operation

Set `SYNC_MODE=fast` and `BLOCK_HISTORY_RETENTION=20000` for a state-serving node.
The default retention is `0` (archive mode, backwards compatible). The param has a default
in code, so it also works (via env var) on networks whose `BLOCKCHAIN_CONFIGS_DIR` has its
own `node_params.json` without the key. Without that default, such a node fails at
startup because the value is `undefined`. A positive
value must cover `MAX_NUM_SNAPSHOTS * SNAPSHOTS_INTERVAL_BLOCK_NUMBER` plus the
larger of the in-memory chain and chain-segment windows. All validators need not
choose the same retention policy.

After a finalized snapshot has been atomically published and fsynced, the node
rereads it, recomputes its state proof, and checks its block against disk. Only
then does it remove both old block bodies and their hash-to-number indexes.
Genesis is preserved. At snapshot height S and retention R, blocks below
S - R + 1 are eligible. Snapshot rotation retains the newest configured count,
even if the validator's snapshot phase has changed. The node also resumes
retention from the bootstrap snapshot after a restart.

Normal steady-state history is approximately R plus one snapshot interval,
not the age of the chain. Total storage is O(current state × retained snapshots
+ recent block bytes + bounded logs). This is a block-count bound, not a byte
quota: actual application state or large recent transactions can still grow.
During initial migration, slow disks, or failed snapshot verification, old
history can temporarily exceed the window. Monitor pruning progress and errors;
safety takes precedence over deleting data without a recovery point.

`/node_status` includes `historyStorage`: configured retention, whether pruning
has begun, the retention boundary, progress cursor, and active-pruning flag.
Pruning uses bounded asynchronous batches so it does not block consensus with a
multi-million-file synchronous scan. It runs in the background after the snapshot is
rotated, so a long first run (millions of files) neither delays nor blocks later
snapshots. A pruning error never prevents snapshot rotation. A durable fence is written before deletion;
index-before-block deletion and checkpointed progress make retries idempotent.

## Recovery and API contract

Current values, permissions, balances, transaction submission, consensus and
recent-block queries are unchanged. Requests for older pruned blocks no longer
have local historical data (existing missing-block/null behavior). A pruned
node cannot serve a peer's genesis-to-tip full sync. Such peers must use snapshot
sync or an archive peer. A pruned node answers a chain-segment request below its
boundary with an explicit `chainSegment: null, historyRetainedFrom: <block>` instead
of an empty segment, which an older requester would treat as "already synced". The
requester then moves on to another peer. A fast-sync requester bootstrapped from a
peer snapshot only asks for blocks above that snapshot, and those are always inside
the retained window. A retention node disables historical backfill and rejects
re-insertion below its pruning boundary, so peers cannot refill deleted history. Do not select pruned nodes as the sole historical data
source for an explorer, audit service, or genesis replay.

Once pruning begins, `SYNC_MODE=full` is rejected even if retention is later set
to zero. Recovery requires a valid snapshot at or above the recorded boundary.
The marker `history-retention.json` is operational metadata: retain it with the
chain directory. Missing/corrupt/too-old recovery state fails closed. Setting
retention to zero stops future deletion; it does not restore deleted history.
Restoring full historical service requires an archive backup or archive peer.
Do not run an older binary that ignores the marker against pruned data.

## AIN v2 production notes

The layer gateway sends public reads such as `ain_getBlockByNumber` round-robin to all
recently confirmed witnesses. If only some validators prune, historical block reads
return a block on some requests and `null` on others. If all prune, history older than
the window is gone from the nodes. The gateway keeps its own indexed transaction
history, which `ain_listTransactions` and `ain_getIndexedTransaction` serve. A gateway
re-index from scratch needs two witnesses that agree on every block, so it needs two
archive nodes. Recommended:

- Keep at least two archive validators per network (retention `0`), or route historical
  reads to archive nodes, before pruning any production validator.
- Do not prune L1 nodes while a relayer `inbox-cursor` could fall behind the window. The
  relayer reads L1 blocks by number.
- On-prem L2 configs already use `SYNC_MODE=fast`, `SNAPSHOTS_INTERVAL_BLOCK_NUMBER=1000`
  and `MAX_NUM_SNAPSHOTS=10`. That makes the minimum retention 10,020 blocks, and 20,000
  is suggested.

Measured on mainnet L2 node1 on 2026-10-31: `chains/` was 13 GB in about 3.16 M files
after 36 days (about 1.58 M blocks, about 8.2 KB on disk per block for the block file
plus the h2n index). With retention 20,000 and one snapshot interval, a node keeps about
21,000 blocks, roughly 175 MB. A first prune on such a node deletes about 12.8 GB (about
3.1 M files) in the background.

### Compacting per-block files

Packing old n2b buckets into fewer files is possible, but it would change the block read
path that sync, `ain_getBlockByNumber` and the snapshot gate use, and add a second
on-disk format. Once retention is on, a node keeps about 42 k files. With idle block
production, an archive node adds about 860 files a day instead of about 86 k. The
remaining benefit is limited to archive nodes, so compaction is left as a follow-up: an
offline tool per completed bucket with a read-path fallback.

## Rollout

1. Back up the current snapshot, genesis/configuration and required historical
   records before enabling deletion. A complete archive backup is optional if
   the application explicitly does not require full historical queries.
2. Verify snapshot-based restart on the existing data before enabling retention.
3. Enable retention, observe `historyStorage.nextBlockToPrune`, and verify current
   state/balances, recent blocks and healthy consensus.
4. Restart once after pruning, then confirm recovery and further pruning across
   another snapshot boundary. Monitor snapshot/pruning failures operationally.

Idle block production (`docs/idle-block-production.md`) is a separate,
proposer-side feature that stops block growth while nothing happens. Retention
bounds what is kept. This policy does not change block cadence or skip
consensus-required proposals.

## Tests

`test/unit/history-retention-sync.test.js` covers syncing from a pruned peer (an
explicit answer below the boundary, a contiguous segment for a snapshot-synced
requester, a requester that never becomes SERVING) and pruning that resumes after a
restart.
`node --test test/storage/history-retention.test.js` exercises storage plateau,
paired deletion, genesis preservation, invalid recovery/configuration, corrupt
blocks, concurrent calls, failed snapshot validation and interruption recovery.
Run the existing snapshot, blockchain and node tests as well.
