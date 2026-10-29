'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ain = require('@ainblockchain/ain-util');
const Transaction = require('../tx-pool/transaction');
const CommonUtil = require('../common/common-util');
const anchor = require('./anchor'), inbox = require('./inbox');
const { rpc, value } = require('./rpc');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function save(filename, data) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temp = filename + '.' + crypto.randomUUID() + '.tmp', fd = fs.openSync(temp, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, filename);
  const directory = fs.openSync(path.dirname(filename), 'r');
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}

function createRelayer(config, privateKey) {
  const key = Buffer.isBuffer(privateKey) ? privateKey : Buffer.from(privateKey, 'hex');
  let stopped = false;
  const file = label => path.join(config.journalDirectory, label + '.json');
  async function chooseEndpoint(endpoints, chainId, genesisHash) {
    for (const endpoint of endpoints) {
      try {
        if (await rpc(endpoint, 'net_getChainId') !== chainId) continue;
        const genesis = await rpc(endpoint, 'ain_getBlockByNumber', { number: 0, getFullTransactions: false });
        if (genesis?.hash !== genesisHash || (await rpc(endpoint, 'net_consensusStatus'))?.health !== true) continue;
        return endpoint;
      } catch { /* Try another validator of the same pinned chain. */ }
    }
    throw Error('No healthy endpoint for the pinned chain');
  }

  async function refreshEndpoints() {
    if (!config.parentEndpoints) return;
    const [parent, child] = await Promise.all([
      chooseEndpoint(config.parentEndpoints, config.parentChainId, config.inboxConfiguration.parentGenesisHash),
      chooseEndpoint(config.childEndpoints, config.childChainId, config.checkpointConfiguration.genesisHash),
    ]);
    config.parentEndpoint = parent; config.childEndpoint = child;
  }
  async function quorum(urls, kind, input, verify) {
    const results = await Promise.allSettled(urls.map(async url => {
      const response = await fetch(url + '/' + kind, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw Error('Attestor unavailable');
      return response.json();
    }));
    const groups = new Map();
    for (const r of results) if (r.status === 'fulfilled') {
      const vote = r.value, identity = JSON.stringify(vote.statement);
      if (!groups.has(identity)) groups.set(identity, { statement: vote.statement, signatures: [] });
      groups.get(identity).signatures.push({ address: vote.address, signature: vote.signature });
    }
    for (const group of groups.values()) if (group.signatures.length >= 4) {
      // One unavailable or malicious operator must not veto four valid votes.
      for (let omitted = 0; omitted <= group.signatures.length; omitted++) {
        const certificate = { statement: group.statement,
          signatures: group.signatures.filter((_, i) => i !== omitted).slice(0, 4) };
        if (certificate.signatures.length !== 4) continue;
        try { verify(certificate); return certificate; } catch { /* Try the other quorum. */ }
      }
    }
    throw Error('Four matching valid attestations are not available');
  }

  async function submit(label, endpoint, chainId, operation, ref, matches = found => found !== null) {
    let found = await value(endpoint, ref);
    if (matches(found)) return found;
    const journal = file(label);
    let saved;
    if (fs.existsSync(journal)) saved = JSON.parse(fs.readFileSync(journal));
    else {
      const tx = Transaction.fromTxBody({ operation, timestamp: Date.now(), nonce: -1, gas_price: 0 }, key.toString('hex'), chainId);
      if (!tx) throw Error('Cannot construct relayer transaction');
      saved = { chainId, tx_body: tx.tx_body, signature: tx.signature, hash: tx.hash };
      save(journal, saved); // Persist the exact transaction before any network submission.
    }
    const sameCertificate = saved.tx_body.operation.ref === operation.ref &&
      saved.tx_body.operation.value?.statement && operation.value?.statement &&
      JSON.stringify(saved.tx_body.operation.value.statement) === JSON.stringify(operation.value.statement);
    if (saved.chainId !== chainId || (!sameCertificate && JSON.stringify(saved.tx_body.operation) !== JSON.stringify(operation))) {
      throw Error('Journal conflicts with requested submission');
    }
    const result = await rpc(endpoint, 'ain_sendSignedTransaction', { tx_body: saved.tx_body, signature: saved.signature });
    if (!result?.tx_hash && result?.result?.code !== 0) throw Error('Relayer submission rejected');
    for (let attempt = 0; attempt < 90 && !stopped; attempt++) {
      found = await value(endpoint, ref);
      if (matches(found)) return found;
      await sleep(2000);
    }
    throw Error('Relayer submission is not yet finalized');
  }

  async function checkpointOnce() {
    const previous = await value(config.parentEndpoint, '/layer2/latest_checkpoint');
    const previousHash = previous ? anchor.statementHash(previous.statement) : '0x' + '0'.repeat(64);
    const activeFile = file('checkpoint-active');
    const active = fs.existsSync(activeFile) ? JSON.parse(fs.readFileSync(activeFile)) : null;
    if (active && active.statement.previous_anchor === previousHash && (!previous || active.statement.height > previous.statement.height)) {
      const ref = '/layer2/checkpoints/' + active.statement.height;
      await submit('checkpoint-' + active.statement.height, config.parentEndpoint, config.parentChainId,
        { type: 'SET_VALUE', ref, value: active }, ref);
      save(activeFile, null); return;
    }
    const observations = await Promise.allSettled(config.childEndpoints.map(e => rpc(e, 'ain_getLastBlockNumber')));
    const heights = observations.filter(x => x.status === 'fulfilled').map(x => x.value)
      .filter(Number.isSafeInteger).sort((a, b) => b - a);
    if (heights.length < 4) throw Error('Fewer than four child validators available');
    const height = heights[3];
    if (previous && height < previous.statement.height + (config.checkpointInterval || 10)) return;
    const certificate = await quorum(config.childAttestors, 'checkpoint', { height, previous_anchor: previousHash },
      c => anchor.verifyCertificate(c, config.checkpointConfiguration, previous?.statement || null));
    const ref = '/layer2/checkpoints/' + height;
    save(activeFile, certificate);
    await submit('checkpoint-' + height, config.parentEndpoint, config.parentChainId,
      { type: 'SET_VALUE', ref, value: certificate }, ref);
    save(activeFile, null);
  }

  async function inboxOnce() {
    const cursorFile = file('inbox-cursor');
    let cursor = fs.existsSync(cursorFile) ? JSON.parse(fs.readFileSync(cursorFile)) : { height: config.startHeight, index: 0 };
    const tip = await rpc(config.parentEndpoint, 'ain_getLastBlockNumber');
    for (let count = 0; count < 20 && cursor.height <= tip && !stopped; count++) {
      const block = await rpc(config.parentEndpoint, 'ain_getBlockByNumber', { number: cursor.height, getFullTransactions: true });
      if (!block || block.number !== cursor.height) throw Error('Parent history unavailable');
      for (; cursor.index < block.transactions.length && !stopped; cursor.index++) {
        const tx = block.transactions[cursor.index], op = tx.tx_body?.operation;
        const marker = op?.ref?.split('/').at(-1);
        if (!inbox.MARKER.test(marker) || op.ref !== '/layer2/inbox/' + marker ||
            !block.receipts?.[cursor.index] || CommonUtil.isFailedTx(block.receipts[cursor.index])) continue;
        const ref = '/layer2/inbox_authorizations/' + marker;
        let approval = await value(config.childEndpoint, ref);
        if (!approval) {
          const certificate = await quorum(config.parentAttestors, 'inbox', { height: cursor.height, index: cursor.index },
            c => inbox.verify(c, config.inboxConfiguration));
          approval = await submit('inbox-authorization-' + marker, config.childEndpoint, config.childChainId,
            { type: 'SET_VALUE', ref, value: certificate }, ref);
        }
        if (!approval.consumed) {
          const payload = op.value;
          const result = await rpc(config.childEndpoint, 'ain_sendSignedTransaction', payload);
          if (result?.result && CommonUtil.isFailedTx(result.result)) {
            save(file('inbox-rejected-' + marker), { marker, inner_hash: approval.statement.inner_hash,
              observed_at: Date.now(), result: result.result });
          } else {
            let consumed = false;
            for (let i = 0; i < 45 && !stopped; i++) {
              approval = await value(config.childEndpoint, ref);
              if (approval?.consumed) { consumed = true; break; }
              await sleep(2000);
            }
            if (!consumed) throw Error('Inbox execution is still pending');
          }
        }
        save(cursorFile, { height: cursor.height, index: cursor.index + 1 });
      }
      cursor = { height: cursor.height + 1, index: 0 }; save(cursorFile, cursor);
    }
  }

  async function loop(name, task) {
    while (!stopped) {
      try { await refreshEndpoints(); await task(); }
      catch (error) { console.error(JSON.stringify({ task: name, error: error.message, at: Date.now() })); }
      await sleep(3000);
    }
  }
  return { checkpointOnce, inboxOnce, refreshEndpoints, start: () => Promise.all([loop('checkpoint', checkpointOnce), loop('inbox', inboxOnce)]),
    stop: () => { stopped = true; } };
}

if (require.main === module) {
  process.umask(0o077);
  const config = JSON.parse(fs.readFileSync(process.env.AIN_RELAYER_CONFIG));
  const key = ain.v3KeystoreToPrivate(JSON.parse(fs.readFileSync(config.keystore)), fs.readFileSync(config.passwordFile, 'utf8'));
  const relayer = createRelayer(config, key);
  process.on('SIGINT', relayer.stop); process.on('SIGTERM', relayer.stop);
  relayer.start().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { createRelayer, save };
