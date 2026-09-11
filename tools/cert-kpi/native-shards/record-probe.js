const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { get, value, waitFor } = require('./verify-network');

function confirmedBlockNumber(transaction) {
  assert.equal(transaction?.is_finalized, true, 'transaction is not finalized');
  assert.equal(transaction.exec_result?.code, 0, 'final execution failed');
  assert.ok(Number.isSafeInteger(transaction.number) && transaction.number >= 0, 'final receipt has no valid block number');
  return transaction.number;
}

function containsTransaction(block, number, hash) {
  return block?.number === number && Array.isArray(block.transactions) && block.transactions.some(transaction => (typeof transaction === 'string' ? transaction : transaction.hash) === hash);
}

async function main(manifestPath, label = 'control') {
  const Ain = require('@ainblockchain/ain-js').default;
  if (!/^[a-z0-9_-]+$/.test(label)) throw new Error('invalid probe label');
  const directory = path.dirname(manifestPath);
  const journal = path.join(directory, `probe-${label}.jsonl`);
  const output = path.join(directory, `probe-${label}.json`);
  if (fs.existsSync(journal) || fs.existsSync(output)) throw new Error('probe evidence already exists; inspect its transactions before submitting another probe');
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  const children = manifest.chains.slice(1);
  const root = manifest.chains[0];
  const accounts = JSON.parse(fs.readFileSync(path.join(directory, 'configs/root/genesis_accounts.json')));
  const owner = accounts.owner;
  const app = 'native_training';
  const reference = `/apps/${app}/${manifest.runId}/${label}`;
  const append = event => {
    const descriptor = fs.openSync(journal, 'a');
    try { fs.writeSync(descriptor, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n'); fs.fsyncSync(descriptor); }
    finally { fs.closeSync(descriptor); }
  };
  const results = [];
  for (const chain of children) {
    const sdk = new Ain(chain.nodes[0].endpoint, null, 0);
    sdk.wallet.addAndSetDefaultAccount(owner.private_key);
    async function submit(kind, ref, request, rule = false) {
      append({ stage: 'submission-intent', chain: chain.name, kind, ref, request });
      const response = await sdk.db.ref(ref)[rule ? 'setRule' : 'setValue']({ value: request, gas_price: 1, nonce: -1 });
      append({ stage: 'response', chain: chain.name, kind, response });
      assert.ok(response?.tx_hash && response.result?.code === 0, `${kind} rejected`);
      const confirmed = await waitFor(async () => {
        const transaction = await sdk.getTransactionByHash(response.tx_hash);
        return { ready: transaction?.is_finalized === true, transaction };
      }, path.join(directory, `probe-${label}-${chain.name}-${kind}.jsonl`), 120000);
      const number = confirmedBlockNumber(confirmed.transaction);
      const independent = await waitFor(async () => {
        const block = await get(chain.nodes.at(-1).endpoint, `/get_block_by_number?number=${number}`);
        return { ready: containsTransaction(block, number, response.tx_hash), block };
      }, path.join(directory, `probe-${label}-${chain.name}-${kind}-independent.jsonl`), 120000);
      return { txHash: response.tx_hash, transaction: confirmed.transaction, block: independent.block };
    }
    assert.equal(await value(chain.nodes[0].endpoint, reference), null);
    const config = await value(chain.nodes[0].endpoint, `/manage_app/${app}/config`);
    if (!config) await submit('create', `/manage_app/${app}/create/${Date.now()}`, { admin: { [owner.address]: true } });
    await submit('rule', `/apps/${app}`, { '.rule': { write: `auth.addr === '${owner.address}'` } }, true);
    const payload = { chain: chain.name, run: manifest.runId, label, purpose: 'native-shard isolation control, not an AI learning job' };
    const transaction = await submit('write', reference, payload);
    const independent = await value(chain.nodes.at(-1).endpoint, reference);
    assert.deepEqual(independent, payload);
    const ref = `${chain.shardPath}/.shard/proof_hash_map/${transaction.transaction.number}/proof_hash`;
    const proof = await waitFor(async () => {
      const recorded = await value(root.nodes.at(-1).endpoint, ref);
      return { ready: recorded === transaction.block.state_proof_hash, recorded };
    }, path.join(directory, `probe-${label}-${chain.name}-parent-proof.jsonl`), 120000);
    results.push({ chain: chain.name, reference, payload, independent, ...transaction, parentReference: ref, parentStateProof: proof.recorded });
  }
  assert.notDeepEqual(results[0].payload, results[1].payload);
  assert.equal(await value(root.nodes[0].endpoint, reference), null);
  const report = { runId: manifest.runId, completedAt: new Date().toISOString(), scope: 'ain-js signed writes to two real POA child chains, distinct state at the same local path, independently finalized and state-proof anchored on their parent; not a learning pipeline count', results, pass: true };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, chains: results.map(result => ({ chain: result.chain, txHash: result.txHash, block: result.transaction.number })), pass: true }));
}

if (require.main === module) main(...process.argv.slice(2)).catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { main, confirmedBlockNumber, containsTransaction };
