# AIN v2 operator L2

Five native consensus validators execute L2 transactions. Four operator signatures
attest finalized L2 checkpoints recorded by the L1 consensus policy in
`layer2/runtime.js`. These are operator attestations, not validity proofs or a
trustless bridge. This release does not implement withdrawal to an unlocked L1
balance. Existing assets are canonical on L2 and their L1 balances remain locked.

## Migration and execution

The genesis governor initializes `/layer2/control/freeze` once. From that block,
L1 rejects ordinary writes, transfers and fee-paying transactions, including direct
node submissions. Its issuance becomes zero; L2 continues the configured issuance.
After exporting and verifying the frozen state, the governor binds the L2 genesis
and source checkpoint through `/layer2/control/bind`. User balances, apps, rules,
functions and ownership are preserved; operator staking keys are rotated separately.

The ordinary API route defaults to L2. `params.layer: "L1"` selects L1 submission.
Use the updated SDK's `Ain.connect(endpoint)` or
`Ain.connect(endpoint, { layer: "L1" })`. The latter signs an L2 payload and an L1
inbox envelope with the same user's key. Four L1 operators attest its finalization
before L2 can execute it once. Old already-signed transactions cannot be translated
between signing domains. API acknowledgement does not mean transaction finality.

## Services

- `layer2/attestor.js`: `AIN_ATTEST_CONFIG`; one local validator key and a durable
  journal per service. Refuses conflicting votes after restart. L2 keys attest
  checkpoints; L1 keys attest finalized inbox messages.
- `layer2/relayer.js`: `AIN_RELAYER_CONFIG`; unprivileged submitter key, persistent
  checkpoint/inbox cursor and exact outbound transaction journal. Four valid votes
  suffice when one operator is faulty; fewer than four do not authorize execution.
- Gateway: `AIN_LAYER_CONFIG`, `AIN_LAYER_INDEX`, `HOST`, `PORT`. Each layer has
  distinct native `chainId`, pinned `genesisHash`, validator list and endpoints.
  Mainnet uses L1 101 / L2 103; testnet L1 102 / L2 104. Set `l1Inbox: true` only
  after the custody policy and child binding are active. Keep node/admin/attestor
  endpoints private and enforce ingress rate limits.

Install dependencies at the repository root and in this directory. `npm test`
here checks routing, index integrity, certificates, durable votes and quorum faults.
The root unit suite checks the consensus custody/inbox policy. Deployment additionally
requires native five-node execution, state conservation, restart and latency checks.

## Explorer APIs

`ain_getLayerInfo` reports signing domains, configured default and witness health.
`ain_listTransactions` provides full finalized history with layer-qualified cursors;
`ain_getIndexedTransaction` includes the native receipt, L1 inbox linkage and L1
checkpoint evidence. The SQLite index verifies contiguous ancestry, genesis identity
and two native witnesses. A checkpoint is shown only after its four signatures and
its block/state-root match the indexed L2 ancestry. `L2_COMMITTED` means finalized
L2 membership; `OPERATOR_ATTESTED_ON_L1` adds recorded operator checkpoint evidence.
Native database reads support all public L2 values, rules, functions and owners;
partial reads and finalized proof hashes permit consistent browsing of large apps.
