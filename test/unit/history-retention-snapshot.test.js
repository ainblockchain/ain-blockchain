const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FileUtil = require('../../common/file-util');
const BlockchainNode = require('../../node');
const StateNode = require('../../db/state-node');
const { updateStateInfoForStateTree } = require('../../db/state-util');

describe('Retention snapshot proof gate', () => {
  for (const fault of ['none', 'block hash', 'state proof', 'snapshot number', 'missing file']) {
    it(`checks durable snapshot before deletion: ${fault}`, async () => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-proof-'));
      try {
        FileUtil.createSnapshotDir(directory);
        const root = StateNode.fromStateSnapshot({ value: 7 }, 'snapshot');
        updateStateInfoForStateTree(root);
        const block = { number: 200, hash: '0x' + 'a'.repeat(64), state_proof_hash: root.getProofHash() };
        const snapshot = { block_number: 200, block: { ...block },
          root_proof_hash: root.getProofHash(), radix_snapshot: root.toRadixSnapshot() };
        if (fault === 'block hash') snapshot.block.hash = '0x' + 'b'.repeat(64);
        if (fault === 'snapshot number') snapshot.block_number = 199;
        if (fault === 'state proof') {
          const other = StateNode.fromStateSnapshot({ value: 8 }, 'snapshot');
          updateStateInfoForStateTree(other);
          snapshot.radix_snapshot = other.toRadixSnapshot();
        }
        if (fault !== 'missing file') {
          assert.equal(await FileUtil.writeSnapshotFile(directory, 200, snapshot, 128), true);
        }
        let deleted = false;
        const fake = { snapshotDir: directory, bc: { loadBlock: () => block,
          historyRetention: { prune: async (number, validate) => {
            await validate(); deleted = true;
          } } } };
        if (fault === 'none') await BlockchainNode.prototype.pruneBlockHistory.call(fake, 200);
        else await assert.rejects(BlockchainNode.prototype.pruneBlockHistory.call(fake, 200));
        assert.equal(deleted, fault === 'none');
      } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    });
  }
});

describe('Pruned history cannot be refilled by peers', () => {
  const P2pClient = require('../../p2p');
  const Blockchain = require('../../blockchain');
  for (const method of ['requestOldChainSegment', 'handleOldChainSegment']) {
    it(`stops ${method} before peer selection or writes`, async () => {
      let reset = false;
      const fake = { server: { node: { bc: { historyRetention: {
        shouldBackfillHistory: () => false,
      } } } }, resetOldChainSyncPeer: () => { reset = true; } };
      await P2pClient.prototype[method].call(fake);
      assert.equal(reset, true);
    });
  }
  it('rejects reinsertion below the durable retention boundary', () => {
    const fake = { historyRetention: { allowsBlock: () => false } };
    assert.equal(Blockchain.prototype.writeBlock.call(fake, { number: 5 }), false);
  });
});
