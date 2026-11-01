'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ain = require('@ainblockchain/ain-util');
const Transaction = require('../tx-pool/transaction');
const CommonUtil = require('../common/common-util');
const anchor = require('./anchor'), inbox = require('./inbox');
const { rpc, value } = require('./rpc');

function durableVote(directory, label, statement, signature) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, label + '.json');
  const record = { statement, signature };
  if (fs.existsSync(filename)) {
    const previous = JSON.parse(fs.readFileSync(filename));
    if (JSON.stringify(previous.statement) !== JSON.stringify(statement)) throw Error('Refusing conflicting attestation');
    return previous.signature;
  }
  const temporary = filename + '.' + crypto.randomUUID() + '.tmp';
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(record)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, filename);
  const dirFd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
  return signature;
}

function createAttestor(config, privateKey) {
  const key = Buffer.isBuffer(privateKey) ? privateKey : Buffer.from(privateKey, 'hex');
  const address = ain.privateToAddress(key);
  const checksum = ain.toChecksumAddress(typeof address === 'string' ? address : '0x' + address.toString('hex'));
  if (checksum !== config.address) throw Error('Attestor key/address mismatch');
  let busy = false;
  async function identity(endpoint, chainId, genesisHash) {
    const id = await rpc(endpoint, 'net_getChainId');
    const genesis = await rpc(endpoint, 'ain_getBlockByNumber', { number: 0, getFullTransactions: false });
    if (id !== chainId || genesis?.hash !== genesisHash) throw Error('Attestor chain identity mismatch');
  }
  async function attest(kind, input) {
    if (busy) throw Error('Attestor busy; retry');
    busy = true;
    try {
      if (!input || !Number.isSafeInteger(input.height) || input.height < 0) throw Error('Invalid height');
      const endpoint = kind === 'checkpoint' ? config.childEndpoint : config.parentEndpoint;
      await identity(endpoint, kind === 'checkpoint' ? config.childChainId : config.parentChainId,
        kind === 'checkpoint' ? config.childGenesisHash : config.parentGenesisHash);
      const height = await rpc(endpoint, 'ain_getLastBlockNumber');
      if (input.height > height) throw Error('Block is not finalized');
      const block = await rpc(endpoint, 'ain_getBlockByNumber', { number: input.height, getFullTransactions: kind === 'inbox' });
      if (!block || block.number !== input.height) throw Error('Finalized block unavailable');
      let statement, body, label, signingChain;
      if (kind === 'checkpoint' && config.keyRole === 'L2') {
        await identity(config.parentEndpoint, config.parentChainId, config.parentGenesisHash);
        const latest = await value(config.parentEndpoint, '/layer2/latest_checkpoint');
        const previous = latest ? anchor.statementHash(latest.statement) : '0x' + '0'.repeat(64);
        if (input.previous_anchor !== previous || (latest && input.height <= latest.statement.height)) throw Error('Checkpoint parent has changed');
        statement = anchor.statement({ version: 1, chain_id: config.checkpointChainId ?? config.childChainId, parent_chain_id: config.parentChainId,
          genesis_hash: config.childGenesisHash, height: block.number, block_hash: block.hash,
          state_root: block.state_proof_hash, transaction_root: block.transactions_hash,
          previous_anchor: previous, timestamp: block.timestamp });
        body = anchor.attestationBody(statement); signingChain = config.parentChainId; label = 'checkpoint-' + block.number;
      } else if (kind === 'inbox' && config.keyRole === 'L1') {
        if (!Number.isSafeInteger(input.index) || input.index < 0) throw Error('Invalid transaction index');
        const tx = block.transactions?.[input.index], receipt = block.receipts?.[input.index];
        if (!tx || !receipt || CommonUtil.isFailedTx(receipt)) throw Error('Successful finalized inbox transaction required');
        const op = tx.tx_body?.operation, marker = op?.ref?.split('/').at(-1);
        if (!inbox.MARKER.test(marker) || op.ref !== '/layer2/inbox/' + marker || (op.type && op.type !== 'SET_VALUE')) throw Error('Not an inbox transaction');
        const inner = Transaction.create(op.value?.tx_body, op.value?.signature, config.childChainId);
        if (!inner || !Transaction.verifyTransaction(inner, config.childChainId) || inner.tx_body.parent_tx_hash !== marker || inner.address !== tx.address) {
          throw Error('Inbox payload signature mismatch');
        }
        statement = inbox.canonical({ version: 1, marker, parent_chain_id: config.parentChainId,
          child_chain_id: config.childChainId, parent_genesis: config.parentGenesisHash, parent_height: block.number,
          parent_block_hash: block.hash, parent_tx_hash: tx.hash, inner_hash: inner.hash, timestamp: block.timestamp });
        body = inbox.body(statement); signingChain = config.childChainId; label = 'inbox-' + marker;
      } else throw Error('Attestation role mismatch');
      const signature = durableVote(config.journalDirectory, label, statement, ain.ecSignTransaction(body, key, signingChain));
      return { statement, address: checksum, signature };
    } finally { busy = false; }
  }
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || !['/checkpoint', '/inbox'].includes(req.url)) { res.writeHead(404); res.end(); return; }
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 4096) throw Error('Request too large'); chunks.push(chunk); }
      const result = await attest(req.url.slice(1), JSON.parse(Buffer.concat(chunks).toString()));
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(result));
    } catch (error) { res.writeHead(409, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000;
  return { server, attest };
}

if (require.main === module) {
  process.umask(0o077);
  const config = JSON.parse(fs.readFileSync(process.env.AIN_ATTEST_CONFIG));
  const key = ain.v3KeystoreToPrivate(JSON.parse(fs.readFileSync(config.keystore)), fs.readFileSync(config.passwordFile, 'utf8'));
  const service = createAttestor(config, key);
  service.server.listen(config.port, config.host || '127.0.0.1');
  process.on('SIGTERM', () => service.server.close(() => process.exit(0)));
  process.on('SIGINT', () => service.server.close(() => process.exit(0)));
}
module.exports = { createAttestor, durableVote };
