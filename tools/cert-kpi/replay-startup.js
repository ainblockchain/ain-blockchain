const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BlockchainNode = require('../../node');
const FileUtil = require('../../common/file-util');
const { Block } = require('../../blockchain/block');
const { NodeConfigs } = require('../../common/constants');

async function main() {
  const [, , chainDirectory, snapshotDirectory, output, selectedNumber] = process.argv;
  assert.ok(output && !fs.existsSync(output), 'pass chain, snapshots and a new summary path');
  assert.ok(NodeConfigs.CHAINS_DIR.startsWith('/tmp/'), 'temporary node storage required');
  assert.equal(NodeConfigs.ENABLE_TX_SIG_VERIF_WORKAROUND, false);
  assert.equal(NodeConfigs.SYNC_MODE, 'fast');
  const node = new BlockchainNode({ address: '0x00ADEc28B6a845a085e03591bE7550dd68673C1C' });
  node.bc.blockchainPath = path.resolve(chainDirectory);
  const diskLastNumber = node.bc.getLatestBlockNumber();
  const diskTip = FileUtil.readCompressedJsonSync(
      FileUtil.getBlockPath(chainDirectory, diskLastNumber));
  assert.ok(Block.validateHashes(diskTip));
  if (selectedNumber !== undefined) {
    assert.ok(Number.isSafeInteger(Number(selectedNumber)) && Number(selectedNumber) > 0);
    assert.ok(Number(selectedNumber) <= diskLastNumber);
  }
  const snapshotSource = selectedNumber === undefined ?
    FileUtil.getLatestSnapshotInfo(snapshotDirectory).latestSnapshotPath :
    FileUtil.getSnapshotPathByBlockNumber(snapshotDirectory, Number(selectedNumber));
  assert.ok(snapshotSource, 'snapshot source required');
  fs.copyFileSync(snapshotSource,
      path.join(node.snapshotDir, 'n2s', path.basename(snapshotSource)));
  assert.equal(await node.loadLatestSnapshot(), true);
  const snapshot = node.bootstrapSnapshot;
  assert.ok(snapshot && snapshot.block_number > 0, 'existing snapshot required');
  const snapshotDiskBlock = FileUtil.readCompressedJsonSync(
      FileUtil.getBlockPath(chainDirectory, snapshot.block_number));
  assert.equal(snapshot.block.hash, snapshotDiskBlock.hash);
  assert.equal(snapshot.root_proof_hash, snapshotDiskBlock.state_proof_hash);
  assert.ok(Block.validateHashes(snapshot.block));
  const snapshotSha256 = crypto.createHash('sha256')
      .update(fs.readFileSync(node.bootstrapSnapshotSource)).digest('hex');
  const startedAt = new Date().toISOString();
  const snapshotWrites = [];
  const updateSnapshots = node.updateSnapshots.bind(node);
  node.updateSnapshots = (...args) => {
    const pending = updateSnapshots(...args);
    snapshotWrites.push(pending);
    return pending;
  };
  assert.equal(node.startNode(true), true, 'native startup replay failed');
  const replayedTip = node.bp.hashToDb.get(diskTip.hash);
  assert.ok(replayedTip, 'last disk block DB is missing after replay');
  assert.equal(replayedTip.getProofHash('/'), diskTip.state_proof_hash);
  await Promise.all(snapshotWrites);
  let exportedSnapshot;
  if (process.env.EXPORT_VERIFIED_SNAPSHOT) {
    const destination = process.env.EXPORT_VERIFIED_SNAPSHOT;
    const directory = fs.statSync(destination);
    assert.equal(directory.mode & 0o777, 0o700, 'export directory must be private');
    assert.equal(directory.uid, process.getuid(), 'export directory must belong to this user');
    assert.equal(fs.readdirSync(destination).length, 0, 'export directory must be empty');
    FileUtil.createSnapshotDir(destination);
    const snapshot = node.buildBlockchainSnapshot(diskTip, replayedTip.stateRoot);
    assert.equal(await FileUtil.writeSnapshotFile(destination, diskLastNumber, snapshot,
        node.getBlockchainParam('resource/snapshot_chunk_size')), true);
    const filename = FileUtil.getSnapshotPathByBlockNumber(destination, diskLastNumber);
    exportedSnapshot = { number: diskLastNumber,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),
      bytes: fs.statSync(filename).size, rootProofHash: snapshot.root_proof_hash };
  }
  const result = { startedAt, completedAt: new Date().toISOString(),
    scope: 'native fast startup with read-only ledger/snapshots, without starting P2P or consensus',
    signatureBypass: false, genesisHash: node.bc.genesisBlockHash, snapshotSource,
    snapshot: { number: snapshot.block_number, sha256: snapshotSha256,
      rootProofHash: snapshot.root_proof_hash },
    diskLastNumber, replayedBlocks: diskLastNumber - snapshot.block_number,
    diskTipHash: diskTip.hash, diskTipStateProof: diskTip.state_proof_hash,
    replayedTipStateProof: replayedTip.getProofHash('/'),
    exportedSnapshot: exportedSnapshot || null,
    reconstructedFinalizedNumber: node.bc.lastBlockNumber(),
    reconstructedFinalizedHash: node.bc.lastBlock().hash,
    state: node.state, tree: replayedTip.getStateInfo('/'), pass: true };
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
