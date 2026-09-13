const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BlockchainNode = require('../../node');
const P2pClient = require('../../p2p');
const FileUtil = require('../../common/file-util');
const Transaction = require('../../tx-pool/transaction');
const { NodeConfigs } = require('../../common/constants');
const { ConsensusStates } = require('../../consensus/constants');

async function main() {
  const [, , planFile, sourceChain, snapshotFile, output] = process.argv;
  assert.ok(output && !fs.existsSync(output));
  assert.ok(NodeConfigs.CHAINS_DIR.startsWith('/tmp/'));
  assert.equal(NodeConfigs.ENABLE_TX_SIG_VERIF_WORKAROUND, false);
  const plan = JSON.parse(fs.readFileSync(planFile));
  const snapshotBytes = fs.readFileSync(snapshotFile);
  const snapshotSha256 = crypto.createHash('sha256').update(snapshotBytes).digest('hex');
  assert.equal(snapshotSha256, plan.snapshotSha256);
  const node = new BlockchainNode({ address: '0x04A456C92A880cd59D7145C457475515a6f6E0f2' });
  FileUtil.createBlockchainDir(node.bc.blockchainPath);
  for (let number = 0; number <= plan.snapshotNumber; number++) {
    const destination = FileUtil.getBlockPath(node.bc.blockchainPath, number);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(FileUtil.getBlockPath(sourceChain, number), destination);
  }
  fs.writeFileSync(FileUtil.getSnapshotPathByBlockNumber(node.snapshotDir, plan.snapshotNumber),
      snapshotBytes, { flag: 'wx', mode: 0o600 });
  assert.equal(await node.loadLatestSnapshot(), true);
  const pendingWrites = [];
  const updateSnapshots = node.updateSnapshots.bind(node);
  node.updateSnapshots = (...args) => {
    const pending = updateSnapshots(...args);
    pendingWrites.push(pending);
    return pending;
  };
  assert.equal(node.startNode(false), true);
  assert.equal(node.bc.lastBlockNumber(), plan.snapshotNumber);
  assert.equal(node.bc.lastBlock().hash, plan.originalFinalHash);
  assert.equal(node.bc.genesisBlockHash, plan.genesisHash);
  const verify = Transaction.verifyTransaction;
  let signatureCalls = 0;
  const signedHashes = new Set();
  Transaction.verifyTransaction = (...args) => {
    signatureCalls++;
    signedHashes.add(args[0].hash);
    return verify(...args);
  };
  const frames = [];
  const socket = { send: (frame) => frames.push(JSON.parse(frame)), readyState: 1 };
  const client = Object.create(P2pClient.prototype);
  client.server = { node, consensus: { state: ConsensusStates.STARTING,
    catchUp() {}, initConsensus() {
      this.state = ConsensusStates.RUNNING;
    } } };
  client.outbound = { peer: { socket,
    peerInfo: { consensusStatus: { state: ConsensusStates.RUNNING } } } };
  client.chainSyncInProgress = null;
  const sourceHead = plan.snapshotNumber + 100;
  const rounds = [];
  const startedAt = new Date().toISOString();
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      if (!frames.length) {
        await new Promise((resolve) => setTimeout(resolve,
            node.getBlockchainParam('genesis/epoch_ms') + 10));
        client.requestChainSegment();
      }
      assert.ok(frames.length, 'no chain segment request');
      const frame = frames.shift();
      const cursor = frame.data.lastBlockNumber;
      const segment = [];
      for (let number = cursor + 1; number <= Math.min(cursor + 20, sourceHead); number++) {
        segment.push(FileUtil.readCompressedJsonSync(FileUtil.getBlockPath(sourceChain, number)));
      }
      await client.handleChainSegment(sourceHead, segment, [], socket);
      rounds.push({ attempt, cursor, receivedThrough: segment.at(-1)?.number,
        finalizedNumber: node.bc.lastBlockNumber(),
        notarizedHeight: node.bp.getLongestNotarizedChainHeight(), signatureCalls });
      if (node.bc.lastBlockNumber() >= plan.snapshotNumber + 60) break;
    }
    await Promise.all(pendingWrites);
    const finalized = node.bc.lastBlock();
    const independent = FileUtil.readCompressedJsonSync(
        FileUtil.getBlockPath(sourceChain, finalized.number));
    assert.equal(finalized.hash, independent.hash);
    const pass = finalized.number >= plan.snapshotNumber + 60;
    const result = { startedAt, completedAt: new Date().toISOString(), pass,
      scope: 'native segment validation/DB execution/finality; simulated transport, no live peers',
      signatureBypass: false, genesisHash: node.bc.genesisBlockHash,
      snapshotNumber: plan.snapshotNumber, copiedOriginalBlocks: plan.snapshotNumber + 1,
      snapshotSha256: plan.snapshotSha256, sourceHead, rounds, signatureCalls,
      distinctSignedHashes: signedHashes.size, finalizedNumber: finalized.number,
      finalizedHash: finalized.hash, matchesIndependentLedger: true };
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(result));
    assert.equal(pass, true, 'chain segment download stalled before finality could advance');
  } finally {
    Transaction.verifyTransaction = verify;
  }
}

main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
