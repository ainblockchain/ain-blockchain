const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { Block } = require('../../blockchain/block');
const Transaction = require('../../tx-pool/transaction');
const FileUtil = require('../../common/file-util');
const { NodeConfigs } = require('../../common/constants');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function verifySignedTransaction(raw, chainId, cache) {
  assert.ok(raw && raw.tx_body && raw.signature, 'unsigned or missing transaction');
  const identity = sha256(JSON.stringify([raw.tx_body, raw.signature, raw.hash, raw.address]));
  if (cache.has(identity)) return false;
  const executable = Transaction.toExecutable(raw, chainId);
  assert.ok(executable && !executable.extra.skip_verif, 'signature bypass prohibited');
  assert.equal(executable.hash, raw.hash, 'stored transaction hash mismatch');
  assert.equal(executable.address, raw.address, 'stored transaction address mismatch');
  assert.equal(Transaction.verifyTransaction(executable, chainId), true, 'invalid signature');
  cache.add(identity);
  return true;
}

function verifyBlockTransactions(block, chainId, cache) {
  let verified = 0;
  let reused = 0;
  const blocks = [block];
  while (blocks.length) {
    const current = blocks.pop();
    const transactions = [...current.last_votes, ...current.transactions];
    for (const evidence of Object.values(current.evidence).flat()) {
      transactions.push(...evidence.transactions, ...evidence.votes);
      assert.ok(Block.validateHashes(evidence.block), 'nested evidence block hash mismatch');
      blocks.push(evidence.block);
    }
    for (const transaction of transactions) {
      if (verifySignedTransaction(transaction, chainId, cache)) verified++;
      else reused++;
    }
  }
  return { verified, reused };
}

function audit(chainDirectory, lastNumber, outputDirectory, referenceFile) {
  assert.equal(NodeConfigs.ENABLE_TX_SIG_VERIF_WORKAROUND, false);
  assert.ok(Number.isSafeInteger(lastNumber) && lastNumber >= 0);
  fs.mkdirSync(outputDirectory, { mode: 0o700 });
  const startedAt = new Date().toISOString();
  const manifest = path.join(outputDirectory, 'blocks.jsonl');
  const journal = path.join(outputDirectory, 'progress.jsonl');
  fs.writeFileSync(manifest, '', { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(journal, '', { flag: 'wx', mode: 0o600 });
  let reference;
  if (referenceFile) {
    const summaryPath = path.join(path.dirname(referenceFile), 'summary.json');
    const summary = JSON.parse(fs.readFileSync(summaryPath));
    assert.equal(summary.pass, true, 'reference audit must have passed');
    const referenceBytes = fs.readFileSync(referenceFile);
    assert.equal(sha256(referenceBytes), summary.manifestSha256, 'reference manifest changed');
    reference = new Map(referenceBytes.toString().trim().split('\n').map((line) => {
      const record = JSON.parse(line);
      return [record.number, record];
    }));
  }
  const cache = new Set();
  let previousHash;
  let genesisHash;
  let signatureChecks = 0;
  let reusedTransactions = 0;
  let byteIdenticalBlocks = 0;
  let totalBytes = 0;
  let error;
  let number = 0;
  try {
    for (; number <= lastNumber; number++) {
      const filename = FileUtil.getBlockPath(chainDirectory, number);
      const bytes = fs.readFileSync(filename);
      const fileSha256 = sha256(bytes);
      const trusted = reference?.get(number);
      let record;
      if (trusted && trusted.fileSha256 === fileSha256) {
        record = { ...trusted, signatureScope: 'byte-identical to passed reference audit' };
        byteIdenticalBlocks++;
      } else {
        const block = JSON.parse(zlib.gunzipSync(bytes, { maxOutputLength: 64 * 1024 ** 2 }));
        assert.equal(block.number, number, 'block number mismatch');
        assert.ok(Block.validateHashes(block), 'block header/body hashes mismatch');
        if (number > 0) assert.equal(block.last_hash, previousHash, 'broken parent linkage');
        const counts = verifyBlockTransactions(block, 0, cache);
        signatureChecks += counts.verified;
        reusedTransactions += counts.reused;
        record = { number, hash: block.hash, parentHash: block.last_hash,
          stateProofHash: block.state_proof_hash, fileSha256, bytes: bytes.length,
          transactions: block.transactions.length, lastVotes: block.last_votes.length,
          signatureScope: 'native signature verification, chain ID 0', ...counts };
        if (trusted) assert.equal(block.hash, trusted.hash, 'block differs from reference ledger');
      }
      if (number > 0) assert.equal(record.parentHash, previousHash, 'broken parent linkage');
      else genesisHash = record.hash;
      previousHash = record.hash;
      totalBytes += bytes.length;
      fs.appendFileSync(manifest, JSON.stringify(record) + '\n');
      if (number % 1000 === 0 || number === lastNumber) {
        const progress = { at: new Date().toISOString(), number, signatureChecks,
          reusedTransactions, byteIdenticalBlocks, totalBytes };
        fs.appendFileSync(journal, JSON.stringify(progress) + '\n');
        console.log(JSON.stringify(progress));
      }
    }
  } catch (failure) {
    error = { number, message: failure.message };
  }
  const summary = { startedAt, completedAt: new Date().toISOString(),
    scope: 'all selected disk blocks: bytes, native hashes, linkage and signatures; not DB replay',
    signatureBypass: false, chainId: 0, genesisHash, lastHash: previousHash,
    requestedLastNumber: lastNumber, blocksVerified: number, signatureChecks,
    reusedTransactions, byteIdenticalBlocks, totalBytes, referenceFile: referenceFile || null,
    manifestSha256: sha256(fs.readFileSync(manifest)), error: error || null, pass: !error };
  fs.writeFileSync(path.join(outputDirectory, 'summary.json'),
      JSON.stringify(summary, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 });
  if (error) throw new Error(`ledger audit stopped at ${error.number}: ${error.message}`);
  return summary;
}

if (require.main === module) {
  try {
    const [, , directory, lastNumber, output, reference] = process.argv;
    console.log(JSON.stringify(audit(directory, Number(lastNumber), output, reference)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { audit, verifySignedTransaction };
