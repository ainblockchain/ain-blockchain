'use strict';

const PREFIX = '/state_channels/';
const EVENT_PATTERN = /^\/state_channels\/([^/]+)\/(events\/)?(open|anchor|settle)(?:\/(\d+))?$/;

function channelPath(channelId) {
  if (typeof channelId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(channelId)) {
    throw new Error('Invalid state channel id');
  }
  return `${PREFIX}${channelId}`;
}

function visitOperation(operation, visitor) {
  if (!operation || typeof operation !== 'object') return;
  if (Array.isArray(operation.op_list)) {
    operation.op_list.forEach((child) => visitOperation(child, visitor));
    return;
  }
  if (operation.type === 'SET_VALUE' || operation.type === undefined) visitor(operation);
}

function eventsFromBlock(block, channelId) {
  const events = [];
  if (!block || !Array.isArray(block.transactions)) return events;
  const expectedPath = channelPath(channelId);
  block.transactions.forEach((transaction, txIndex) => {
    visitOperation(transaction.tx_body && transaction.tx_body.operation, (operation) => {
      if (typeof operation.ref !== 'string') return;
      const match = operation.ref.match(EVENT_PATTERN);
      if (!match || `${PREFIX}${match[1]}` !== expectedPath) return;
      events.push({
        channel_id: channelId,
        kind: match[3],
        sequence: match[4] === undefined ? null : Number(match[4]),
        path: operation.ref,
        value: operation.value,
        tx_hash: transaction.hash,
        block_number: block.number,
        block_hash: block.hash,
        tx_index: txIndex,
      });
    });
  });
  return events;
}

function getStateChannel(node, channelId) {
  const path = channelPath(channelId);
  let state = null;
  let proofHash = null;
  try {
    state = node.db.getValue(path);
    proofHash = node.db.getProofHash(path);
  } catch (error) {
    state = null;
    proofHash = null;
  }
  return { channel_id: channelId, path, state, proof_hash: proofHash, block_number: node.bc.lastBlockNumber() };
}

function getStateChannelEvents(node, channelId, from, to) {
  channelPath(channelId);
  const lastBlock = node.bc.lastBlockNumber();
  if (from !== undefined && (!Number.isInteger(from) || from < 0)) {
    throw new Error('Invalid from block');
  }
  if (to !== undefined && (!Number.isInteger(to) || to < 0)) {
    throw new Error('Invalid to block');
  }
  const start = Number.isInteger(from) && from >= 0 ? from : Math.max(0, lastBlock - 999);
  if (to !== undefined && to <= start) throw new Error('Invalid block range');
  const end = Number.isInteger(to) ? Math.min(to, start + 1000, lastBlock + 1) : Math.min(lastBlock + 1, start + 1000);
  return node.bc.getBlockList(start, end).flatMap((block) => eventsFromBlock(block, channelId));
}

module.exports = { PREFIX, channelPath, eventsFromBlock, getStateChannel, getStateChannelEvents };
