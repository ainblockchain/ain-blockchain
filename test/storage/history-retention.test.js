const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { HistoryRetention } = require('../../blockchain/history-retention');
const config = { BLOCK_HISTORY_RETENTION: 5, MAX_NUM_SNAPSHOTS: 2,
  SNAPSHOTS_INTERVAL_BLOCK_NUMBER: 1, ON_MEMORY_CHAIN_LENGTH: 1,
  CHAIN_SEGMENT_LENGTH: 1, SYNC_MODE: 'fast' };
const files = {
  getBlockPath: (p, n) => path.join(p, 'n2b', `${n}.json.gz`),
  getH2nPath: (p, h) => path.join(p, 'h2n', h),
};
const hash = n => '0x' + n.toString(16).padStart(64, '0');
function fixture(t, count = 20) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'history-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'n2b')); fs.mkdirSync(path.join(dir, 'h2n'));
  const put = n => {
    fs.writeFileSync(files.getBlockPath(dir, n), zlib.gzipSync(JSON.stringify({ number: n, hash: hash(n) })));
    fs.writeFileSync(files.getH2nPath(dir, hash(n)), String(n));
  };
  for (let n = 0; n <= count; n++) put(n);
  return { dir, put, retention: new HistoryRetention(dir, config, files) };
}
test('bounded window removes both files, preserves genesis and all recent blocks', async t => {
  const { dir, retention } = fixture(t);
  await retention.prune(20, async () => {});
  for (let n = 0; n <= 20; n++) {
    assert.equal(fs.existsSync(files.getBlockPath(dir, n)), n === 0 || n >= 16);
    assert.equal(fs.existsSync(files.getH2nPath(dir, hash(n))), n === 0 || n >= 16);
  }
  assert.equal(retention.status().nextBlockToPrune, 16);
  assert.equal(retention.shouldBackfillHistory(), false);
  assert.equal(retention.allowsBlock(0), true);
  assert.equal(retention.allowsBlock(15), false);
  assert.equal(retention.allowsBlock(16), true);
});
test('repeated writes plateau instead of growing with elapsed blocks', async t => {
  const { dir, put, retention } = fixture(t, 5);
  for (let n = 6; n <= 70; n++) {
    put(n); await retention.prune(n, async () => {});
    assert.equal(fs.readdirSync(path.join(dir, 'n2b')).length, 6);
    assert.equal(fs.readdirSync(path.join(dir, 'h2n')).length, 6);
  }
});
test('failed snapshot validation deletes nothing and writes no marker', async t => {
  const { dir, retention } = fixture(t);
  await assert.rejects(retention.prune(20, async () => { throw Error('bad proof'); }), /bad proof/);
  assert.equal(fs.readdirSync(path.join(dir, 'n2b')).length, 21);
  assert.equal(fs.existsSync(retention.filename), false);
  assert.equal(retention.busy, false);
});
test('archive mode is a no-op', async t => {
  const { dir } = fixture(t);
  const r = new HistoryRetention(dir, { ...config, BLOCK_HISTORY_RETENTION: 0 }, files);
  assert.equal(r.shouldBackfillHistory(), true);
  await r.prune(20, () => { throw Error('must not validate'); });
  assert.equal(fs.readdirSync(path.join(dir, 'n2b')).length, 21);
});
test('rejects unsafe config and full replay, including after retention is disabled', async t => {
  const { dir, retention } = fixture(t);
  for (const keep of [-1, 1, 1.5, NaN, '5']) {
    assert.throws(() => new HistoryRetention(dir, { ...config, BLOCK_HISTORY_RETENTION: keep }, files));
  }
  assert.throws(() => new HistoryRetention(dir, { ...config, SYNC_MODE: 'full' }, files));
  await retention.prune(20, async () => {});
  assert.throws(() => new HistoryRetention(dir, { ...config, BLOCK_HISTORY_RETENTION: 0, SYNC_MODE: 'full' }, files));
  assert.throws(() => retention.assertRecoverable(-1));
  assert.throws(() => retention.assertRecoverable(15));
  retention.assertRecoverable(16);
  retention.assertRecoverable(20);
});
test('interruption between index/block unlink resumes idempotently from durable fence', async t => {
  const { dir, retention } = fixture(t);
  const remove = retention.removeBlock.bind(retention);
  retention.removeBlock = async n => {
    if (n === 1) { fs.unlinkSync(files.getH2nPath(dir, hash(n))); throw Error('interrupted'); }
    return remove(n);
  };
  await assert.rejects(retention.prune(20, async () => {}), /interrupted/);
  const recovered = new HistoryRetention(dir, config, files);
  await recovered.prune(20, async () => {});
  assert.equal(fs.readdirSync(path.join(dir, 'n2b')).length, 6);
  assert.equal(fs.readdirSync(path.join(dir, 'h2n')).length, 6);
});
test('corrupt block fails closed; unsafe hash cannot escape index directory', async t => {
  const { dir, retention } = fixture(t);
  fs.writeFileSync(files.getBlockPath(dir, 1), zlib.gzipSync(JSON.stringify({ number: 1, hash: '../escape' })));
  await assert.rejects(retention.prune(20, async () => {}), /Invalid historical block/);
  assert.equal(fs.existsSync(files.getBlockPath(dir, 1)), true);
  assert.equal(retention.status().nextBlockToPrune, 1);
});
test('concurrent pruning is serialized and the boundary never moves backwards', async t => {
  const { retention } = fixture(t);
  let finish;
  const first = retention.prune(20, () => new Promise(resolve => { finish = resolve; }));
  await retention.prune(19, () => { throw Error('concurrent validation'); });
  finish(); await first;
  await retention.prune(18, async () => {});
  assert.equal(retention.status().retainFrom, 16);
});
test('malformed persisted marker fails closed', t => {
  const { dir, retention } = fixture(t);
  fs.writeFileSync(retention.filename, '{');
  assert.throws(() => new HistoryRetention(dir, config, files));
});
