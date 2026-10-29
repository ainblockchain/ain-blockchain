# Public execution signing domain

An existing operator L2 can preserve its genesis, blocks, state, and checkpoint ancestry while changing the chain ID used to sign application transactions. This is a one-time consensus-validated governor action, not an RPC response override.

The governor submits a zero-fee standalone `SET_VALUE` to `/layer2/control/execution_domain`, with `{ "chainId": 1, "minTimestamp": <milliseconds> }` (use `0` for Testnet). The minimum timestamp must not exceed the signed control transaction's timestamp. The command is signed in the domain active before the change. Apply the same configuration to the L1 custody contract and its L2. Preserve the signed command in a durable deployment journal.

After activation:

- `net_getChainId` and `/get_chain_id` return the L2 application signing ID.
- Native RPC, transaction batches, P2P application propagation, block execution, and historical replay use the correct domain from chain state. Old snapshots replay the transition before using the new domain.
- Application transactions signed in the previous domain or timestamped before the configured cutoff are rejected. Legacy P256 signatures remain disabled. Do not reuse a cutoff predating shutdown of the original network that used the target ID.
- Genesis, validator proposal/vote signatures, P2P authentication, and checkpoint statement IDs retain their original identities. Historical signed records are unchanged.
- L1 continues to use its own chain ID. Its inbox verifies the inner transaction using the L2 execution ID. Inbox attestations also use that ID.

For deployment, upgrade all validators first, stop public writes, drain finalized inbox transactions through the relayer, then stop the relayer. Activate L1 followed by L2. Configure attestors with `childChainId` set to the execution ID and `checkpointChainId` set to the immutable checkpoint ID. Change the relayer's `childChainId` and `inboxConfiguration.executionDomain`; preserve `checkpointConfiguration`. Configure the gateway's L2 `chainId` and `checkpointChainId` accordingly. Restart services and verify direct writes, L1 inbox consumption, new checkpoints, and agreement among all five validators before reopening the API.

`ain_getLayerInfo` exposes the public `chain_id`, genesis hash and, when distinct, `checkpoint_chain_id`. Clients must use `chain_id` for application signing and continue pinning the expected genesis hash. The on-chain `/layer2/execution_domain_transition` records the activation block, control transaction hash, previous domain, and timestamp cutoff.
