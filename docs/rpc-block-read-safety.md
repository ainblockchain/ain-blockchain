# Cached block read safety

Hash-only block RPC responses now use a separate response object instead of
assigning transaction hashes into the block returned by the blockchain. The wire
format is unchanged. Previously, repeated number-based genesis reads mutated its
cached transaction objects into strings, then undefined values, ultimately causing
HTTP 500 in `extractTransactionHashes`. Full reads could lose transaction bodies.
Both number and hash handlers now avoid mutating their input.

The two regression tests in `test/unit/block-rpc-cache.test.js` failed against the
old image and passed with the patched handler. They cover alternating number/hash
reads, full transactions, immutable cache objects and missing blocks.

## Reproduce on an isolated real chain

With the previously prepared local base image available:

```sh
docker tag sha256:cebf14bf492e5f5e39f3e9ae2681c44c28984e36d45b51b8a8a96f539208cef0 ain-rpc-read-safety:base
tar -cf - docker/Dockerfile.rpc-read-safety json_rpc/block.js | \
  docker build --network none --build-arg BASE_IMAGE=ain-rpc-read-safety:base \
  -t ain-rpc-read-safety:patched -f docker/Dockerfile.rpc-read-safety -
AIN_RPC_TEST_IMAGE=$(docker image inspect ain-rpc-read-safety:patched --format '{{.Id}}') \
  bash scripts/test-block-rpc-read-safety.sh /absolute/path/to/new-evidence
```

Requires Docker, `timeout` and Node with `fetch` support. The base ID is not a
downloadable registry reference; preserve or recreate that compatible local image,
which includes local-network discovery without external IP lookup. The overlay
changes only the block RPC handler and is not a production release.

The script starts one fresh node on an internal network: two CPUs, four GiB RAM,
no additional swap, 512 PIDs, no published ports. It uses the public development
genesis key, never an operator wallet. Its own container/network are removed on
success or failure. The probe sends read RPCs only, without application setup,
training or inference submissions.

On 2026-09-14 image
`sha256:eddd95425bbec1c97bfb6f06371ce22a9a146fee936c90f54f17fe04dd1aa955`
passed five rounds of number/hash/full-genesis reads, preserving four transactions.
[Actual evidence](../test/evidence/block-rpc-read-safety-20260914) includes the full
genesis and Docker metadata. This is not a performance benchmark. Two earlier
attempts using the separate inference-bootstrap harness failed at an unacknowledged
batch submission before reaching this check; their cause was not established here.

## Deployment caution

Existing local/public nodes were not restarted or redeployed. This fix cannot
restore an already-mutated in-memory object in an old process. Deploy the fix and
perform a controlled restart from trusted chain data, then verify repeated full
and hash-only reads. Do not delete chain data or assume a hot patch repaired cache
contents. The development key and isolated test image are not production setup.
