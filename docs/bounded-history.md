# Bounded block history

A node can retain current state and a sliding block window instead of storing
one block and hash-index file for every elapsed consensus interval forever.
This is a local storage policy, not a consensus or transaction-format change.

## Operation

Set `SYNC_MODE=fast` and `BLOCK_HISTORY_RETENTION=20000` for a state-serving node.
The default retention is `0` (archive mode, backwards compatible). A positive
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
multi-million-file synchronous scan. A durable fence is written before deletion;
index-before-block deletion and checkpointed progress make retries idempotent.

## Recovery and API contract

Current values, permissions, balances, transaction submission, consensus and
recent-block queries are unchanged. Requests for older pruned blocks no longer
have local historical data (existing missing-block/null behavior). A pruned
node cannot serve a peer's genesis-to-tip full sync. Such peers must use snapshot
sync or an archive peer. A retention node disables historical backfill and rejects
re-insertion below its pruning boundary, so peers cannot refill deleted history. Do not select pruned nodes as the sole historical data
source for an explorer, audit service, or genesis replay.

Once pruning begins, `SYNC_MODE=full` is rejected even if retention is later set
to zero. Recovery requires a valid snapshot at or above the recorded boundary.
The marker `history-retention.json` is operational metadata: retain it with the
chain directory. Missing/corrupt/too-old recovery state fails closed. Setting
retention to zero stops future deletion; it does not restore deleted history.
Restoring full historical service requires an archive backup or archive peer.
Do not run an older binary that ignores the marker against pruned data.

## Rollout

1. Back up the current snapshot, genesis/configuration and required historical
   records before enabling deletion. A complete archive backup is optional if
   the application explicitly does not require full historical queries.
2. Verify snapshot-based restart on the existing data before enabling retention.
3. Enable retention, observe `historyStorage.nextBlockToPrune`, and verify current
   state/balances, recent blocks and healthy consensus.
4. Restart once after pruning, then confirm recovery and further pruning across
   another snapshot boundary. Monitor snapshot/pruning failures operationally.

Empty-proposal throttling is a separate devnet feature; throttling alone slows
unbounded growth and is not a replacement for retention. This policy does not
change block cadence or skip consensus-required proposals.

## Tests

`node --test test/storage/history-retention.test.js` exercises storage plateau,
paired deletion, genesis preservation, invalid recovery/configuration, corrupt
blocks, concurrent calls, failed snapshot validation and interruption recovery.
Run the existing snapshot, blockchain and node tests as well.
