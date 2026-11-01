const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Block } = require('../../blockchain/block');
const Blockchain = require('../../blockchain');
const { HistoryRetention } = require('../../blockchain/history-retention');
const FileUtil = require('../../common/file-util');
const P2pServer = require('../../p2p/server');
const P2pClient = require('../../p2p');
const { NodeConfigs, BlockchainNodeStates } = require('../../common/constants');

const RETENTION_CONFIG = { BLOCK_HISTORY_RETENTION: 10, MAX_NUM_SNAPSHOTS: 2,
  SNAPSHOTS_INTERVAL_BLOCK_NUMBER: 2, ON_MEMORY_CHAIN_LENGTH: 2, CHAIN_SEGMENT_LENGTH: 5,
  SYNC_MODE: 'fast' };

// A peer whose chain dir holds blocks 0..tip and has pruned below (snapshot - retention + 1).
async function makePrunedPeer(t, tip = 40, snapshotNumber = 40) {
  const chainPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pruned-peer-'));
  const blocks = [];
  let lastHash = '';
  for (let number = 0; number <= tip; number++) {
    const block = Block.create(lastHash, [], {}, [], [], number, number, '', '0xproposer', {}, 0, 0,
        1700000000000 + number);
    FileUtil.writeBlockFile(chainPath, block);
    FileUtil.writeH2nFile(chainPath, block.hash, number);
    blocks.push(block);
    lastHash = block.hash;
  }
  const retention = new HistoryRetention(chainPath, RETENTION_CONFIG, FileUtil);
  await retention.prune(snapshotNumber, async () => {});
  const bc = Object.create(Blockchain.prototype);
  Object.assign(bc, { blockchainPath: chainPath, chain: [blocks[tip]], historyRetention: retention });
  return { chainPath, blocks, retention, bc,
    cleanup: () => fs.rmSync(chainPath, { recursive: true, force: true }) };
}

describe('Sync from a peer with pruned history', () => {
  let peer;
  let savedSegmentLength;
  beforeEach(async () => {
    savedSegmentLength = NodeConfigs.CHAIN_SEGMENT_LENGTH;
    NodeConfigs.CHAIN_SEGMENT_LENGTH = 5;
    peer = await makePrunedPeer();
  });
  afterEach(() => {
    NodeConfigs.CHAIN_SEGMENT_LENGTH = savedSegmentLength;
    peer.cleanup();
  });

  it('pruned the expected range but kept genesis and the window', () => {
    assert.equal(peer.retention.marker.retainFrom, 31);
    assert.equal(peer.bc.loadBlock(0).number, 0);
    assert.equal(peer.bc.loadBlock(30), null);
    assert.equal(peer.bc.loadBlock(31).number, 31);
  });

  it('serves a snapshot-synced requester contiguous blocks from inside the window', () => {
    const server = Object.create(P2pServer.prototype);
    server.node = { bc: peer.bc };
    // A fast-sync requester bootstrapped from the peer's snapshot (>= retainFrom) asks for more.
    for (const requesterLast of [30, 35, 39, 40]) {
      assert.equal(server.getPrunedHistoryBoundary(requesterLast), null);
    }
    const segment = peer.bc.getBlockList(36);
    assert.deepEqual(segment.map((b) => b.number), [36, 37, 38, 39, 40]);
    for (let i = 1; i < segment.length; i++) {
      assert.equal(segment[i].last_hash, segment[i - 1].hash);
    }
  });

  it('answers a request below the boundary explicitly instead of with an empty segment', () => {
    const server = Object.create(P2pServer.prototype);
    server.node = { bc: peer.bc };
    for (const requesterLast of [0, 1, 29]) {
      assert.equal(server.getPrunedHistoryBoundary(requesterLast), 31);
    }
    // A cold-start full-sync requester can still fetch genesis, then gets the explicit answer.
    assert.equal(server.getPrunedHistoryBoundary(-1), null);
    assert.deepEqual(peer.bc.getBlockList(0).map((b) => b.number), [0]);
    // Without the boundary check the requester would receive [] (which it takes for "synced").
    assert.deepEqual(peer.bc.getBlockList(5), []);
    const sent = [];
    server.sendChainSegment({ send: (frame) => sent.push(JSON.parse(frame)) }, null, 40, null, 31);
    assert.equal(sent[0].data.chainSegment, null);
    assert.equal(sent[0].data.historyRetainedFrom, 31);
  });

  it('an archive (unpruned) peer is never treated as pruned', () => {
    const server = Object.create(P2pServer.prototype);
    server.node = { bc: { historyRetention: new HistoryRetention(peer.chainPath + '-none',
        { ...RETENTION_CONFIG, BLOCK_HISTORY_RETENTION: 0 }, FileUtil) } };
    assert.equal(server.getPrunedHistoryBoundary(1), null);
    server.node = { bc: {} };
    assert.equal(server.getPrunedHistoryBoundary(1), null);
  });

  it('the requester does not become SERVING and moves on to another peer', async () => {
    const savedSleep = NodeConfigs.CHAIN_SEGMENT_SLEEP_MS;
    NodeConfigs.CHAIN_SEGMENT_SLEEP_MS = 0;
    try {
      const calls = [];
      const client = Object.create(P2pClient.prototype);
      Object.assign(client, {
        outbound: { peer: { socket: 'socket' } },
        chainSyncInProgress: { address: 'peer' },
        server: { node: { state: BlockchainNodeStates.CHAIN_SYNCING,
          bc: { lastBlockNumber: () => 0 },
          mergeChainSegment: () => { calls.push('merge'); return 1; } } },
        getChainSyncCursor: () => 0,
        resetChainSyncPeer: () => calls.push('reset'),
        requestChainSegment: () => calls.push('request'),
        tryInitProcesses: () => { calls.push('init'); return false; },
      });
      await client.handleChainSegment(40, null, null, 'socket', 31);
      assert.deepEqual(calls, ['reset', 'request']);
      assert.equal(client.server.node.state, BlockchainNodeStates.CHAIN_SYNCING);
    } finally {
      NodeConfigs.CHAIN_SEGMENT_SLEEP_MS = savedSleep;
    }
  });

  it('pruning resumes after a restart and keeps the window bounded as the chain grows', async () => {
    // Simulate a restart: a new HistoryRetention reads the durable marker, then a later
    // snapshot advances the boundary.
    let lastHash = peer.blocks[40].hash;
    for (let number = 41; number <= 50; number++) {
      const block = Block.create(lastHash, [], {}, [], [], number, number, '', '0xp', {}, 0, 0,
          1700000000000 + number);
      FileUtil.writeBlockFile(peer.chainPath, block);
      FileUtil.writeH2nFile(peer.chainPath, block.hash, number);
      lastHash = block.hash;
    }
    const restarted = new HistoryRetention(peer.chainPath, RETENTION_CONFIG, FileUtil);
    assert.equal(restarted.marker.retainFrom, 31);
    restarted.assertRecoverable(40);
    assert.throws(() => restarted.assertRecoverable(30));
    await restarted.prune(50, async () => {});
    assert.equal(restarted.marker.retainFrom, 41);
    assert.equal(restarted.marker.nextBlock, 41);
    for (let number = 1; number <= 50; number++) {
      assert.equal(fs.existsSync(FileUtil.getBlockPath(peer.chainPath, number)), number >= 41);
    }
  });
});
