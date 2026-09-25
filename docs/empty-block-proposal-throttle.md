# Empty-block proposal throttle

Set `EMPTY_BLOCK_PROPOSAL_INTERVAL_MS` on an isolated devnet validator to reduce
empty blocks while preserving immediate proposals whenever the transaction pool
contains work. The default is `0`, which preserves the existing protocol
behavior.

For example, `60000` permits at most one empty proposal per minute. This setting
is intended for idle devnet presentation environments; do not use it as an
unreviewed mainnet consensus policy. Keep the value at `0` for production until
all validators use the same reviewed configuration.
