# Empty-block proposal throttle (superseded)

The `EMPTY_BLOCK_PROPOSAL_INTERVAL_MS` devnet throttle has been replaced by the
idle block policy (`IDLE_BLOCK_PROPOSAL_SKIP`, `IDLE_HEARTBEAT_INTERVAL_MS`). See
[idle-block-production.md](./idle-block-production.md).

The old throttle checked the total pool size, which always includes the votes for the
notarized tip, so it rarely took effect. It did not track whether the last block with
transactions was finalized. The new policy keeps proposing until such a block is final,
and it adapts the consensus health status to idle periods. The old env var is ignored.
