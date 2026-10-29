'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ain = require('@ainblockchain/ain-util');
const { createAttestor } = require('../../layer2/attestor');
const { createRelayer } = require('../../layer2/relayer');
const anchor = require('../../layer2/anchor');
const Transaction = require('../../tx-pool/transaction');
const hash = n => '0x' + n.toString(16).padStart(64, '0');
async function listen(server) { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return 'http://127.0.0.1:' + server.address().port; }
async function close(server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

test('operator quorum survives one invalid vote; journals recover and reject conflicting finalized blocks', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ain-attestors-'));
  const keys = Array.from({ length: 5 }, () => ain.createAccount());
  const checkpointConfig = { chainId: 104, parentChainId: 102, genesisHash: hash(104),
    validators: keys.map(k => k.address), threshold: 4 };
  let latest = null, blockHash = hash(10), height = 10, submissions = 0, poisoned = false, offline = false;
  const submitted = [];
  const servers = [];
  const rpcServer = role => http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const { method, params } = JSON.parse(Buffer.concat(chunks)); let result;
    if (method === 'net_getChainId') result = role === 'parent' ? 102 : 104;
    else if (method === 'net_consensusStatus') result = { health: true };
    else if (method === 'ain_getLastBlockNumber') result = height;
    else if (method === 'ain_getBlockByNumber') result = params.number === 0 ? { number: 0, hash: role === 'parent' ? hash(102) : hash(104) } :
      { number: params.number, hash: blockHash, state_proof_hash: hash(20), transactions_hash: hash(30), timestamp: 10000 + params.number };
    else if (method === 'ain_get') result = params.ref === '/layer2/latest_checkpoint' ? latest :
      submitted.find(c => params.ref === '/layer2/checkpoints/' + c.statement.height) || null;
    else if (method === 'ain_sendSignedTransaction') {
      const tx = Transaction.create(params.tx_body, params.signature, 102);
      assert.ok(Transaction.verifyTransaction(tx, 102));
      const certificate = params.tx_body.operation.value;
      anchor.verifyCertificate(certificate, checkpointConfig, latest?.statement || null);
      latest = certificate; submitted.push(certificate); submissions++;
      result = { tx_hash: tx.hash, result: { code: 0 } };
    } else throw Error(method);
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ result: { result } }));
  });
  try {
    const parent = rpcServer('parent'), child = rpcServer('child'); servers.push(parent, child);
    const parentEndpoint = await listen(parent), childEndpoint = await listen(child);
    const configs = keys.map((k, i) => ({ address: k.address, keyRole: 'L2', parentChainId: 102, childChainId: 104,
      parentGenesisHash: hash(102), childGenesisHash: hash(104), parentEndpoint, childEndpoint,
      journalDirectory: path.join(directory, 'validator-' + i) }));
    const services = keys.map((k, i) => createAttestor(configs[i], k.private_key));
    const urls = [];
    for (const service of services) { servers.push(service.server); urls.push(await listen(service.server)); }
    const first = await services[0].attest('checkpoint', { height: 10, previous_anchor: hash(0) });
    const restarted = createAttestor(configs[0], keys[0].private_key);
    assert.deepEqual(await restarted.attest('checkpoint', { height: 10, previous_anchor: hash(0) }), first);
    blockHash = hash(99);
    await assert.rejects(restarted.attest('checkpoint', { height: 10, previous_anchor: hash(0) }), /conflicting/);
    blockHash = hash(10);
    await assert.rejects(restarted.attest('checkpoint', { height: 11, previous_anchor: hash(0) }), /not finalized/);
    const faulty = http.createServer(async (req, res) => {
      for await (const _ of req) { /* Drain */ }
      if (offline) { res.writeHead(503); res.end(); return; }
      const vote = { ...first, address: keys[4].address, signature: poisoned ? '0xdead' : first.signature };
      res.end(JSON.stringify(vote));
    }); servers.push(faulty);
    urls[4] = await listen(faulty); poisoned = true;
    const relayerConfig = { parentEndpoint, parentChainId: 102, childEndpoints: Array(5).fill(childEndpoint),
      childAttestors: urls, checkpointConfiguration: checkpointConfig, journalDirectory: path.join(directory, 'relayer') };
    const relayer = createRelayer(relayerConfig, ain.createAccount().private_key);
    relayerConfig.parentEndpoints = [childEndpoint, parentEndpoint];
    relayerConfig.childChainId = 104;
    relayerConfig.inboxConfiguration = { parentGenesisHash: hash(102) };
    await relayer.refreshEndpoints();
    assert.equal(relayerConfig.parentEndpoint, parentEndpoint);
    assert.equal(relayerConfig.childEndpoint, childEndpoint);
    relayerConfig.parentEndpoints = [childEndpoint];
    await assert.rejects(relayer.refreshEndpoints(), /No healthy endpoint/);
    relayerConfig.parentEndpoints = [parentEndpoint];
    await relayer.checkpointOnce(); assert.equal(submissions, 1); assert.equal(latest.signatures.length, 4);
    await createRelayer(relayerConfig, ain.createAccount().private_key).checkpointOnce(); assert.equal(submissions, 1);
    height = 20; blockHash = hash(20); offline = true;
    await relayer.checkpointOnce(); assert.equal(submissions, 2);
    await close(services[3].server); servers.splice(servers.indexOf(services[3].server), 1);
    height = 30; blockHash = hash(30);
    await assert.rejects(relayer.checkpointOnce(), /Four matching/); assert.equal(submissions, 2);
    assert.equal(latest.statement.height, 20);
  } finally { for (const server of servers) await close(server); fs.rmSync(directory, { recursive: true, force: true }); }
});
