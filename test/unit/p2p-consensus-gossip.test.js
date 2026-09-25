const assert = require('assert/strict');
const P2pClient = require('../../p2p');
const { NodeConfigs, DevFlags } = require('../../common/constants');
const { ConsensusStates } = require('../../consensus/constants');

describe('Consensus gossip resource limits', () => {
  let client;
  let previous;
  const message = { type: 'vote', value: { hash: 'signed-hash', text: '한글' } };

  beforeEach(() => {
    previous = { bytes: NodeConfigs.P2P_CONSENSUS_MAX_BYTES,
      queue: NodeConfigs.P2P_CONSENSUS_MAX_QUEUED_BYTES,
      tags: DevFlags.enableP2pMessageTagsChecking };
    NodeConfigs.P2P_CONSENSUS_MAX_BYTES = 1024;
    NodeConfigs.P2P_CONSENSUS_MAX_QUEUED_BYTES = 2048;
    DevFlags.enableP2pMessageTagsChecking = false;
    client = Object.create(P2pClient.prototype);
    client.server = { node: { account: { address: 'self' } } };
    client.outbound = {};
    client.consensusGossipStats = {
      enqueued: 0, oversized: 0, backpressure: 0, unavailable: 0, sendErrors: 0,
    };
  });

  afterEach(() => {
    NodeConfigs.P2P_CONSENSUS_MAX_BYTES = previous.bytes;
    NodeConfigs.P2P_CONSENSUS_MAX_QUEUED_BYTES = previous.queue;
    DevFlags.enableP2pMessageTagsChecking = previous.tags;
  });

  function peer(address, options = {}) {
    const frames = [];
    const socket = { readyState: options.readyState ?? 1, bufferedAmount: options.buffered ?? 0,
      send(frame, callback) {
        if (options.throw) throw new Error('connection closed');
        frames.push(frame);
        if (callback) callback(options.error ? new Error('write failed') : undefined);
      } };
    client.outbound[address] = { socket, peerInfo: {
      consensusStatus: { state: options.state ?? ConsensusStates.RUNNING },
    } };
    return frames;
  }

  it('relays a small consensus message without changing its signed fields', () => {
    const first = peer('first');
    const second = peer('second');
    client.broadcastConsensusMessage(message);
    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.deepEqual(JSON.parse(first[0]).data.message, message);
  });

  it('refuses oversized gossip before serializing or sending the remaining fields', () => {
    const frames = peer('first');
    let inspected = false;
    const oversized = { type: 'propose', value: 'large'.repeat(1000), get trailing() {
      inspected = true;
      return 'not serialized';
    } };
    client.broadcastConsensusMessage(oversized);
    assert.equal(frames.length, 0);
    assert.equal(inspected, false);
    assert.equal(client.consensusGossipStats.oversized, 1);
  });

  it('does not queue to a backpressured peer but continues to a writable peer', () => {
    const busy = peer('busy', { buffered: 2000 });
    const writable = peer('writable');
    client.broadcastConsensusMessage(message);
    assert.equal(busy.length, 0);
    assert.equal(writable.length, 1);
    assert.equal(client.consensusGossipStats.backpressure, 1);
  });

  it('does not send to a closed socket or a peer without running consensus', () => {
    const closed = peer('closed', { readyState: 3 });
    const starting = peer('starting', { state: ConsensusStates.STARTING });
    client.broadcastConsensusMessage(message);
    assert.equal(closed.length, 0);
    assert.equal(starting.length, 0);
  });

  it('respects existing tag filtering when enabled', () => {
    DevFlags.enableP2pMessageTagsChecking = true;
    const visited = peer('visited');
    const other = peer('other');
    client.broadcastConsensusMessage(message, ['visited']);
    assert.equal(visited.length, 0);
    assert.equal(other.length, 1);
  });

  it('contains a close race and asynchronous write error without blocking other peers', () => {
    peer('closed', { throw: true });
    peer('failed', { error: true });
    const other = peer('other');
    assert.doesNotThrow(() => client.broadcastConsensusMessage(message));
    assert.equal(other.length, 1);
    assert.equal(client.consensusGossipStats.sendErrors, 2);
  });

  it('accounts for UTF-8 payload and the maximum client frame header at the queue boundary', () => {
    const probe = peer('probe');
    client.broadcastConsensusMessage(message);
    const bytes = Buffer.byteLength(probe[0]);
    client.outbound = {};
    NodeConfigs.P2P_CONSENSUS_MAX_QUEUED_BYTES = bytes + 14;
    const exact = peer('exact');
    const full = peer('full', { buffered: 1 });
    client.broadcastConsensusMessage(message);
    assert.equal(exact.length, 1);
    assert.equal(full.length, 0);
  });
});
