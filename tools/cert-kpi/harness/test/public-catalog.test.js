const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

async function runAudit(pages, expected, requireListed = '1') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ain-public-test-'));
  fs.mkdirSync(path.join(directory, 'evidence'));
  const errors = [];
  const calls = [];
  const processStub = { env: { RUN_ID: 'test', EXPECTED_PATCH_IDS: expected, CATALOG_REQUIRE_LISTED: requireListed } };
  try {
    const source = fs.readFileSync(path.join(__dirname, '..', 'verify-public-catalog.js'), 'utf8');
    await vm.runInNewContext(source, {
      require, __dirname: path.join(directory, 'harness'), process: processStub, URL, AbortSignal,
      console: { log() {}, error(message) { errors.push(message); } },
      fetch: async url => {
        calls.push(url.pathname + url.search);
        const body = url.pathname === '/api/info' ? { node: { address: 'test' }, ledger: { kind: 'local' } } : pages.shift();
        assert.ok(body, `unexpected request ${url}`);
        return { ok: true, text: async () => JSON.stringify(body) };
      },
    });
    const file = path.join(directory, 'evidence/test/result.json');
    return { code: processStub.exitCode || 0, errors, calls, result: fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('empty public catalog cannot pass without expected IDs', async () => {
  const result = await runAudit([{ total: 0, items: [] }], '');
  assert.equal(result.code, 1);
  assert.equal(result.result.pass, false);
});

test('all 100 expected LISTED patches are checked across pages', async () => {
  const items = Array.from({ length: 100 }, (_, index) => ({ anchor: { id: `patch-${index}` }, status: 'LISTED' }));
  const result = await runAudit([{ total: 100, items: items.slice(0, 50) }, { total: 100, items: items.slice(50) }], items.map(item => item.anchor.id).join(','));
  assert.equal(result.code, 0);
  assert.equal(result.result.matches.length, 100);
  assert.equal(result.result.returnedItems, 100);
  assert.ok(result.calls.includes('/api/catalog?limit=200&offset=50'));
});

test('current VERIFIED and legacy LISTED share the verified counter without changing raw status', async () => {
  const items = [{ anchor: { id: 'current' }, status: 'VERIFIED' }, { anchor: { id: 'legacy' }, status: 'LISTED' }];
  const result = await runAudit([{ total: 2, items }], 'current,legacy');
  assert.equal(result.code, 0);
  assert.equal(result.result.verifiedCount, 2);
  assert.equal(result.result.listedCount, 2);
  assert.equal(result.result.matches[0].status, 'VERIFIED');
  assert.equal(result.result.matches[1].status, 'LISTED');
});

test('ANNOUNCED is not LISTED', async () => {
  const result = await runAudit([{ total: 1, items: [{ anchor: { id: 'patch' }, status: 'ANNOUNCED' }] }], 'patch');
  assert.equal(result.code, 1);
  assert.equal(result.result.matches[0].found, true);
  assert.equal(result.result.catalogPresenceComplete, true);
  assert.equal(result.result.verificationComplete, false);
});

test('presence-only observation reports ANNOUNCED without pretending independent verification passed', async () => {
  const result = await runAudit([{ total: 1, items: [{ anchor: { id: 'patch' }, status: 'ANNOUNCED' }] }], 'patch', '0');
  assert.equal(result.code, 0);
  assert.equal(result.result.catalogPresenceComplete, true);
  assert.equal(result.result.visibleCount, 1);
  assert.equal(result.result.listedCount, 0);
  assert.equal(result.result.verificationComplete, false);
});

test('duplicate pagination IDs fail closed', async () => {
  const item = { anchor: { id: 'patch' }, status: 'LISTED' };
  const result = await runAudit([{ total: 2, items: [item] }, { total: 2, items: [item] }], 'patch');
  assert.equal(result.code, 1);
  assert.match(result.errors[0], /duplicate/);
  assert.equal(result.result, null);
});
