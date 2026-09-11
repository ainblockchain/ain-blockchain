const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

async function main() {
  const output = process.argv[2];
  assert.ok(output && !fs.existsSync(output), 'pass a new output file');
  const blockHash = process.argv[3];
  const capturePending = process.env.CAPTURE_PENDING_CHAIN === '1';
  const inspectMessage = process.env.INSPECT_P2P_MESSAGE === '1';
  const measureBytes = process.env.INSPECT_BYTE_SIZES === '1';
  assert.ok([Boolean(blockHash), capturePending, inspectMessage].filter(Boolean).length <= 1,
      'select one capture mode');
  const rpcPort = Number(process.env.INSPECT_RPC_PORT || 18081);
  assert.ok(Number.isSafeInteger(rpcPort) && rpcPort > 0 && rpcPort <= 65535);
  assert.ok(process.argv.length <= 4,
      'usage: inspect-consensus.js NEW_OUTPUT [PRIVATE_BLOCK_HASH]');
  if (blockHash) assert.match(blockHash, /^0x[0-9a-f]{64}$/);
  if (blockHash || capturePending) {
    const directory = fs.statSync(path.dirname(output));
    assert.equal(directory.mode & 0o777, 0o700, 'snapshot output directory must be private (0700)');
    assert.equal(directory.uid, process.getuid(), 'snapshot directory must belong to this user');
  }
  const listing = await fetch('http://127.0.0.1:9229/json/list', {
    signal: AbortSignal.timeout(5000),
  });
  assert.ok(listing.ok, `inspector listing HTTP ${listing.status}`);
  const targets = await listing.json();
  assert.equal(targets.length, 1, 'inspect exactly one explicitly selected local process');
  const url = new URL(targets[0].webSocketDebuggerUrl);
  assert.equal(url.protocol, 'ws:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '9229');
  const socket = new WebSocket(url, {
    maxPayload: (blockHash || capturePending ? 64 : 2) * 1024 ** 2, handshakeTimeout: 5000,
  });
  const pending = new Map();
  let sequence = 0;
  let pauseResolve;
  let pauseTimer;
  let pauseEvent;
  let breakpoint;
  let pausedFrame = false;
  let probe;
  const rejectPending = (error) => {
    for (const request of pending.values()) {
 clearTimeout(request.timer); request.reject(error);
}
    pending.clear();
  };
  socket.on('error', rejectPending);
  socket.on('close', () => rejectPending(new Error('inspector disconnected')));
  socket.on('message', (bytes) => {
    const response = JSON.parse(bytes.toString());
    if (response.method === 'Debugger.paused') {
      pausedFrame = true;
      pauseEvent = response.params;
      pauseResolve?.(pauseEvent);
      return;
    }
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    clearTimeout(request.timer);
    if (response.error) request.reject(new Error(response.error.message));
    else request.resolve(response.result);
  });
  const call = (method, params) => new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) {
 reject(new Error('inspector is not connected')); return;
}
    const id = ++sequence;
    const timer = setTimeout(() => {
 pending.delete(id); reject(new Error(`${method} timed out`));
}, 30000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await new Promise((resolve, reject) => {
 socket.once('open', resolve); socket.once('error', reject);
});
  try {
    await call('Debugger.enable', {});
    const target = await call('Runtime.evaluate', {
      expression: 'process.mainModule.require(\'/app/ain-blockchain/p2p/server\')' +
        '.prototype.getNodeStatus', objectGroup: 'bounded-consensus-diagnostic',
    });
    assert.ok(!target.exceptionDetails && target.result.objectId, 'native function required');
    breakpoint = (await call('Debugger.setBreakpointOnFunctionCall', {
      objectId: target.result.objectId,
    })).breakpointId;
    const paused = pauseEvent ? Promise.resolve(pauseEvent) : new Promise((resolve, reject) => {
      pauseResolve = resolve;
      pauseTimer = setTimeout(() => reject(new Error('status breakpoint not reached')), 15000);
    });
    probe = fetch(`http://127.0.0.1:${rpcPort}/node_status`, {
      signal: AbortSignal.timeout(20000),
    }).catch(() => null);
    let frame;
    try {
 frame = (await paused).callFrames[0];
} finally {
 clearTimeout(pauseTimer);
}
    let result = await call('Debugger.evaluateOnCallFrame', {
      callFrameId: frame.callFrameId, returnByValue: !inspectMessage,
      expression: `(function() {
        const node = this.node;
        const selectedHash = ${JSON.stringify(blockHash || null)};
        if (${inspectMessage}) {
          const peer = Object.values(this.inbound).sort((left, right) =>
            (right.socket?._receiver?._totalPayloadLength || 0) -
            (left.socket?._receiver?._totalPayloadLength || 0))[0];
          if (!peer?.socket) throw new Error('no inbound socket available');
          return new Promise((resolve, reject) => {
            const socket = peer.socket;
            let smallMessages = 0;
            const cleanup = () => {
              clearTimeout(timer);
              socket.removeListener('message', collect);
            };
            const collect = bytes => {
              if (bytes.length < 1024 ** 2) { smallMessages++; return; }
              cleanup();
              try {
                const summary = { at: new Date().toISOString(), bytes: bytes.length,
                  smallMessages, scope: 'one large message; field sizes only; no payload' };
                if (bytes.length > 32 * 1024 ** 2) {
                  resolve({ ...summary, parsingSkipped: true });
                  return;
                }
                const parsed = JSON.parse(bytes);
                const sizes = (object, keys) => Object.fromEntries(keys
                  .filter(key => object?.[key] !== undefined)
                  .map(key => [key, Buffer.byteLength(JSON.stringify(object[key]))]));
                resolve({ ...summary, type: parsed.type,
                  dataBytes: sizes(parsed.data, ['message', 'tags', 'transaction',
                    'chainSegment', 'catchUpInfo', 'peerInfo']),
                  consensusType: parsed.data?.message?.type,
                  consensusValueBytes: sizes(parsed.data?.message?.value,
                    ['block', 'proposal', 'proposalBlock', 'proposalTx',
                      'tx_body', 'signature', 'hash', 'address']),
                  tags: Array.isArray(parsed.data?.tags) ? parsed.data.tags.length : null });
              } catch (error) { reject(error); }
            };
            const timer = setTimeout(() => {
              cleanup();
              resolve({ at: new Date().toISOString(), noLargeMessage: true, smallMessages });
            }, 15000);
            socket.on('message', collect);
          });
        }
        if (${capturePending}) {
          const pendingChain = this.consensus.getCatchUpInfo();
          if (!pendingChain.length || pendingChain.length > 100) {
            throw new Error('pending-chain capture must contain 1..100 blocks');
          }
          const capture = { at: new Date().toISOString(), address: node.account.address,
            finalized: node.bc.lastBlock(), tips: node.bp.longestNotarizedChainTips,
            pendingChain };
          if (Buffer.byteLength(JSON.stringify(capture)) > 32 * 1024 ** 2) {
            throw new Error('pending-chain capture exceeds 32 MiB');
          }
          return capture;
        }
        if (selectedHash) {
          const info = node.bp.hashToInvalidBlockInfo.get(selectedHash);
          if (!info?.block || !info.proposal) throw new Error('selected block/proposal absent');
          const previous = node.bp.hashToBlockInfo.get(info.block.last_hash)?.block;
          const database = node.bp.hashToDb.get(info.block.last_hash);
          if (!previous || !database) throw new Error('selected predecessor block/database absent');
          const earlierCandidates = [];
          for (const [hash, candidate] of node.bp.hashToInvalidBlockInfo) {
            const valid = node.bp.hashToBlockInfo.get(hash);
            const candidateBlock = candidate.block || valid?.block;
            const candidateProposal = candidate.proposal || valid?.proposal;
            if (candidateBlock?.number < info.block.number && candidateProposal) {
              earlierCandidates.push({ block: candidateBlock, proposal: candidateProposal,
                votes: candidate.votes || [] });
              if (earlierCandidates.length === 10) break;
            }
          }
          const capture = { at: new Date().toISOString(), pid: process.pid,
            block: info.block, proposal: info.proposal, earlierCandidates,
            previous: node.buildBlockchainSnapshot(previous, database.stateRoot) };
          const encoded = JSON.stringify(capture);
          if (Buffer.byteLength(encoded) > 32 * 1024 ** 2) {
            throw new Error('private capture exceeds 32 MiB');
          }
          return capture;
        }
        const bounded = collection => {
          const entries = [];
          for (const entry of collection) {
            entries.push(entry);
            if (entries.length === 100) break;
          }
          return entries;
        };
        const finalBlock = node.bc.lastBlock();
        const validators = finalBlock.validators;
        const summarize = (hash, info) => {
          const block = info.block || node.bp.hashToBlockInfo.get(hash)?.block;
          const voters = [...new Set((info.votes || []).map(vote => vote.address))];
          return { hash, number: block?.number, epoch: block?.epoch, proposer: block?.proposer,
            declaredSize: block?.size, transactions: block?.transactions?.length,
            lastVotes: block?.last_votes?.length,
            notarized: info.notarized, votes: info.votes?.length || 0, uniqueVoters: voters.length,
            uniqueStake: voters.reduce((total, address) =>
              total + (validators[address]?.stake || 0), 0),
            evidenceGroups: Object.keys(block?.evidence || {}).length,
            stateHash: block?.state_proof_hash, previousHash: block?.last_hash };
        };
        return { at: new Date().toISOString(), pid: process.pid, address: node.account.address,
          memory: process.memoryUsage(), final: { number: finalBlock.number, hash: finalBlock.hash,
            timestamp: finalBlock.timestamp },
          totalStake: Object.values(validators).reduce((total, validator) =>
            total + validator.stake, 0),
          counts: { blocks: node.bp.hashToBlockInfo.size,
            invalid: node.bp.hashToInvalidBlockInfo.size, dbs: node.bp.hashToDb.size },
          tips: node.bp.longestNotarizedChainTips.slice(0, 30),
          largestBlocks: [...node.bp.hashToBlockInfo, ...node.bp.hashToInvalidBlockInfo]
            .sort((left, right) => (right[1].block?.size || 0) - (left[1].block?.size || 0))
            .slice(0, 5).map(([hash, info]) => ({ ...summarize(hash, info),
              componentBytes: ${measureBytes} ? Object.fromEntries(
                ['last_votes', 'evidence', 'transactions', 'receipts'].map(key =>
                  [key, Buffer.byteLength(JSON.stringify(info.block?.[key]) || '')])) :
                    undefined })),
          tipDetails: node.bp.longestNotarizedChainTips.slice(0, 30).map(hash =>
            summarize(hash, node.bp.hashToBlockInfo.get(hash))),
          network: ['inbound', 'outbound'].map(direction => {
            const peers = direction === 'inbound' ? this.inbound : this.client.outbound;
            const firstPeer = Object.values(peers)[0];
            const info = firstPeer?.peerInfo || {};
            const sizes = value => Object.fromEntries(Object.entries(value).slice(0, 50)
              .map(([key, entry]) => [key, Buffer.byteLength(JSON.stringify(entry) || '')]));
            return { direction, peerInfoBytes: ${measureBytes} ? sizes(info) : undefined,
              peerConfigBytes: ${measureBytes} ? sizes(info.config || {}) : undefined,
              peers: Object.entries(peers).slice(0, 30).map(([address, peer]) => {
              const socket = peer.socket;
              const inflate = socket?._extensions?.['permessage-deflate']?._inflate;
              const symbolValue = name => {
                const symbol = Object.getOwnPropertySymbols(inflate || {})
                  .find(symbol => symbol.description === name);
                return symbol ? inflate[symbol] : undefined;
              };
              const prefix = symbolValue('buffers')?.[0]?.subarray(0, 256).toString() || '';
              const type = prefix.match(/^\{"type":"([A-Z_]+)"/);
              const knownTypes = process.mainModule.require('/app/ain-blockchain/common/constants')
                .P2pMessageTypes;
              return { address, bufferedAmount: socket?.bufferedAmount,
                senderBytes: socket?._sender?._bufferedBytes,
                senderQueue: socket?._sender?._queue?.length,
                receivedBytes: socket?._socket?.bytesRead,
                sentBytes: socket?._socket?.bytesWritten,
                pendingPayload: socket?._receiver?._totalPayloadLength,
                inflatedBytes: symbolValue('total-length'),
                pendingType: type && Object.values(knownTypes).includes(type[1]) ? type[1] : null,
                receiveBuffer: socket?._receiver?._bufferedBytes };
            }) };
          }),
          blocks: bounded(node.bp.hashToBlockInfo).map(([hash, info]) => summarize(hash, info)),
          invalid: bounded(node.bp.hashToInvalidBlockInfo).map(([hash, info]) =>
            summarize(hash, info)),
          databases: bounded(node.bp.hashToDb).map(([hash, db]) => ({ hash,
            version: db.stateVersion, proof: db.getProofHash('/') })) };
      }).call(this)`,
    });
    assert.ok(!result.exceptionDetails, result.exceptionDetails?.text);
    if (inspectMessage) {
      assert.ok(result.result.objectId, 'message observation promise required');
      await call('Debugger.removeBreakpoint', { breakpointId: breakpoint });
      breakpoint = null;
      await call('Debugger.resume', {});
      pausedFrame = false;
      result = await call('Runtime.awaitPromise', {
        promiseObjectId: result.result.objectId, returnByValue: true,
      });
      assert.ok(!result.exceptionDetails, result.exceptionDetails?.text);
    }
    fs.writeFileSync(output, JSON.stringify(result.result.value, null, 2) + '\n', {
      flag: 'wx', mode: 0o600,
    });
  } finally {
    clearTimeout(pauseTimer);
    const cleanupErrors = [];
    const cleanup = async (method, params = {}) => {
      try {
 await call(method, params);
} catch (error) {
 cleanupErrors.push(`${method}: ${error.message}`);
}
    };
    if (breakpoint) await cleanup('Debugger.removeBreakpoint', { breakpointId: breakpoint });
    if (pausedFrame) await cleanup('Debugger.resume');
    await cleanup('Debugger.disable');
    await cleanup('Runtime.releaseObjectGroup', { objectGroup: 'bounded-consensus-diagnostic' });
    try {
      await call('Runtime.evaluate', {
        expression: 'setTimeout(() => process.mainModule.require(\'node:inspector\')' +
          '.close(), 1000).unref(); undefined',
      });
    } finally {
 socket.terminate();
}
    if (probe) await probe;
    if (cleanupErrors.length) {
      console.error(JSON.stringify({ cleanupErrors }));
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) {
console.log(JSON.stringify({ output, privateSnapshot: Boolean(blockHash || capturePending),
    scope: 'one status breakpoint; resumed without ledger writes; not performance evidence' }));
}
}

main().catch((error) => {
 console.error(error.message); process.exitCode = 1;
});
