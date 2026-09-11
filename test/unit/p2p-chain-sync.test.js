const assert = require('assert/strict');
const P2pClient = require('../../p2p');
const { BlockchainNodeStates } = require('../../common/constants');

describe('Chain synchronization across a non-finalizing segment', () => {
  let client;
  let frames;
  let chain;
  let pool;

  beforeEach(() => {
    frames = [];
    chain = Array.from({ length: 19 }, (_, offset) => ({ number: 101 + offset,
      hash: `block-${101 + offset}`, last_hash: `block-${100 + offset}` }));
    pool = { hashToDb: new Map(chain.map((block) => [block.hash, {}])),
      getNotarizedBlockByHash: (hash) => chain.find((block) => block.hash === hash),
      getExtendingChain: () => ({ chain }) };
    client = Object.create(P2pClient.prototype);
    client.server = { node: { state: BlockchainNodeStates.CHAIN_SYNCING,
      bc: { lastBlockNumber: () => 100, lastBlock: () => ({ number: 100, hash: 'block-100' }) },
      bp: pool, getBlockchainParam: () => 1000 } };
    client.chainSyncInProgress = { address: 'peer', lastBlockNumber: 100, updatedAt: Date.now() };
    client.assignRandomPeerForChainSync = () => ({
      send: (frame) => frames.push(JSON.parse(frame)),
    });
  });

  it('requests beyond a validated notarized segment without pretending finality advanced', () => {
    client.advanceChainSyncCursor([...chain, { number: 120, hash: 'unnotarized-tip' }]);
    client.requestChainSegment();
    assert.equal(frames[0].data.lastBlockNumber, 119);
    assert.equal(client.server.node.bc.lastBlockNumber(), 100);
  });

  const failures = ['no-db', 'not-notarized', 'wrong-number', 'unrooted', 'gap', 'lost-branch'];
  for (const failure of failures) {
    it(`falls back to finalized height for ${failure}`, () => {
      client.chainSyncInProgress.cursor = { number: 119, hash: 'block-119' };
      if (failure === 'no-db') pool.hashToDb.clear();
      if (failure === 'not-notarized') pool.getNotarizedBlockByHash = () => null;
      if (failure === 'wrong-number') client.chainSyncInProgress.cursor.number = 120;
      if (failure === 'unrooted') chain[0].last_hash = 'other-finalized';
      if (failure === 'gap') chain[4].number++;
      if (failure === 'lost-branch') pool.getExtendingChain = () => [];
      assert.equal(client.getChainSyncCursor(), 100);
    });
  }

  it('never advances from seen-only or unexecuted blocks', () => {
    pool.hashToDb.clear();
    client.advanceChainSyncCursor(chain);
    assert.equal(client.getChainSyncCursor(), 100);
    assert.equal(client.chainSyncInProgress.cursor, undefined);
  });

  it('resets a per-peer cursor when the sync peer is reset or reassigned', () => {
    client.advanceChainSyncCursor(chain);
    assert.equal(client.getChainSyncCursor(), 119);
    client.resetChainSyncPeer();
    client.setChainSyncPeer('other-peer');
    assert.equal(client.getChainSyncCursor(), 100);
  });

  it('prefers actual finalized advancement and retains duplicate request throttling', () => {
    client.advanceChainSyncCursor(chain);
    client.server.node.bc.lastBlockNumber = () => 125;
    assert.equal(client.getChainSyncCursor(), 125);
    client.requestChainSegment();
    client.requestChainSegment();
    assert.equal(frames.length, 1);
    assert.equal(frames[0].data.lastBlockNumber, 125);
  });

  it('heartbeat retries a syncing instance, but does not sync a stopped instance', () => {
    const schedule = global.setInterval;
    let heartbeat;
    let requests = 0;
    client.outbound = {};
    client.requestChainSegment = () => requests++;
    global.setInterval = (callback) => {
      heartbeat = callback;
      return 1;
    };
    try {
      client.startHeartbeat();
      heartbeat();
      assert.equal(requests, 1);
      client.server.node.state = BlockchainNodeStates.STOPPED;
      heartbeat();
      assert.equal(requests, 1);
    } finally {
      global.setInterval = schedule;
    }
  });
});
