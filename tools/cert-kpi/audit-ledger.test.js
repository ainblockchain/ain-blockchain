const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { test } = require('node:test');
const { audit, verifySignedTransaction } = require('./audit-ledger');
const { Block } = require('../../blockchain/block');
const Transaction = require('../../tx-pool/transaction');
const FileUtil = require('../../common/file-util');
const account = require('../../blockchain-configs/base/genesis_accounts.json').others[0];

function transaction() {
  return Transaction.toJsObject(Transaction.fromTxBody({ operation: { type: 'SET_VALUE',
    ref: '/apps/audit_fixture/value', value: 1 }, timestamp: 1789136000000,
  nonce: -1, gas_price: 0 }, account.private_key, 0));
}

test('native signed transaction verifies; byte-identical repeats reuse verification', () => {
  const cache = new Set();
  const raw = transaction();
  assert.equal(verifySignedTransaction(raw, 0, cache), true);
  assert.equal(verifySignedTransaction(raw, 0, cache), false);
});

for (const field of ['address', 'hash', 'body', 'signature']) {
  test(`modified ${field} cannot reuse an earlier signature check`, () => {
    const cache = new Set();
    const raw = transaction();
    verifySignedTransaction(raw, 0, cache);
    if (field === 'body') raw.tx_body.operation.value = 2;
    else raw[field] = '';
    assert.throws(() => verifySignedTransaction(raw, 0, cache));
  });
}

test('complete ledger audit, reference reuse and modified compressed file rejection', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-audit-test-'));
  try {
    const chain = path.join(directory, 'chain');
    const raw = transaction();
    const first = Block.create('', [], {}, [raw], [], 0, 0, 'state-0', account.address,
        {}, 0, 0, 1789136000000);
    const second = Block.create(first.hash, [], {}, [], [], 1, 1, 'state-1', account.address,
        {}, 0, 0, 1789136001000);
    for (const block of [first, second]) {
      const filename = FileUtil.getBlockPath(chain, block.number);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, zlib.gzipSync(JSON.stringify(block)));
    }
    const output = path.join(directory, 'first-audit');
    const firstAudit = audit(chain, 1, output);
    assert.equal(firstAudit.pass, true);
    assert.equal(firstAudit.signatureChecks, 1);
    assert.equal(firstAudit.blocksVerified, 2);
    const secondAudit = audit(chain, 1, path.join(directory, 'second-audit'),
        path.join(output, 'blocks.jsonl'));
    assert.equal(secondAudit.byteIdenticalBlocks, 2);
    assert.equal(secondAudit.signatureChecks, 0);
    second.last_hash = 'tampered';
    fs.writeFileSync(FileUtil.getBlockPath(chain, 1), zlib.gzipSync(JSON.stringify(second)));
    assert.throws(() => audit(chain, 1, path.join(directory, 'bad-audit'),
        path.join(output, 'blocks.jsonl')), /audit stopped at 1/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'bad-audit/summary.json'))).pass,
        false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
