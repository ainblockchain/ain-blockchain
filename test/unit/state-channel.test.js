'use strict';

const assert = require('assert');
const {
  channelPath,
  eventsFromBlock,
  getStateChannel,
  getStateChannelEvents,
} = require('../../state-channel');

describe('State Channel node index', () => {
  it('accepts canonical ids and rejects path traversal', () => {
    assert.strictEqual(channelPath('experiment-1'), '/state_channels/experiment-1');
    assert.throws(() => channelPath('../other'), /Invalid state channel id/);
  });

  it('extracts open, anchor and settle events from nested finalized transactions', () => {
    const events = eventsFromBlock({
      number: 482,
      hash: '0xblock',
      transactions: [{
        hash: '0xtx',
        tx_body: {
          operation: {
            type: 'SET',
            op_list: [
              { type: 'SET_VALUE', ref: '/state_channels/demo/open', value: { kind: 'open' } },
              { type: 'SET_VALUE', ref: '/state_channels/demo/events/anchor/20', value: { root: '0xroot' } },
              { type: 'SET_VALUE', ref: '/state_channels/other/events/settle/1', value: {} },
            ],
          },
        },
      }],
    }, 'demo');
    assert.deepStrictEqual(events.map((event) => ({ kind: event.kind, sequence: event.sequence, tx_hash: event.tx_hash })), [
      { kind: 'open', sequence: null, tx_hash: '0xtx' },
      { kind: 'anchor', sequence: 20, tx_hash: '0xtx' },
    ]);
  });

  it('returns the current channel state and proof hash from a node', () => {
    const node = {
      db: {
        getValue: (path) => ({ path, status: 'OPEN' }),
        getProofHash: (path) => `proof:${path}`,
      },
      bc: { lastBlockNumber: () => 482 },
    };
    assert.deepStrictEqual(getStateChannel(node, 'demo'), {
      channel_id: 'demo',
      path: '/state_channels/demo',
      state: { path: '/state_channels/demo', status: 'OPEN' },
      proof_hash: 'proof:/state_channels/demo',
      block_number: 482,
    });
  });

  it('rejects malformed event ranges', () => {
    const node = { bc: { lastBlockNumber: () => 10, getBlockList: () => [] } };
    assert.throws(() => getStateChannelEvents(node, 'demo', -1), /Invalid from block/);
    assert.throws(() => getStateChannelEvents(node, 'demo', 5, 5), /Invalid block range/);
  });
});
