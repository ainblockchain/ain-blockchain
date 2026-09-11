const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const { check, install, hash } = require('./recovery-seed');

function fixture(action) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-seed-'));
  const source = path.join(directory, 'verified.gz');
  const destination = path.join(directory, '100.json.gz');
  const bytes = Buffer.from('the already native-verified snapshot bytes');
  fs.writeFileSync(source, bytes);
  try {
    action({ directory, source, destination, bytes, expected: hash(bytes) });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('preflight precedes exclusive atomic seed installation', () => fixture((sample) => {
  const { source, destination, expected, bytes } = sample;
  assert.equal(check(destination, source, expected).mode, 'create');
  assert.equal(fs.existsSync(destination), false);
  assert.equal(install(destination, source, expected).mode, 'create');
  assert.deepEqual(fs.readFileSync(destination), bytes);
  assert.equal(fs.existsSync(`${destination}.recovery-part`), false);
  assert.equal(fs.statSync(destination).mode & 0o777, 0o600);
}));

for (const head of [99, 100, 101]) {
  test(`post-finality recovery requires seed height to match disk head ${head}`, () =>
    fixture((sample) => {
      const FileUtil = require('../../common/file-util');
      const chain = path.join(sample.directory, 'chain');
      const filename = FileUtil.getBlockPath(chain, head);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, 'head metadata fixture, not a native block');
      const action = (operation) => operation(sample.destination, sample.source,
          sample.expected, chain, 100);
      if (head === 100) {
        assert.equal(action(check).mode, 'create');
        assert.equal(action(install).mode, 'create');
      } else {
        assert.throws(() => action(check), /target disk head differs/);
        assert.throws(() => action(install), /target disk head differs/);
        assert.equal(fs.existsSync(sample.destination), false);
      }
    }));
}

test('head advancement after preflight refuses installation without overwriting the seed', () =>
  fixture((sample) => {
    const FileUtil = require('../../common/file-util');
    const chain = path.join(sample.directory, 'chain');
    const first = FileUtil.getBlockPath(chain, 100);
    fs.mkdirSync(path.dirname(first), { recursive: true });
    fs.writeFileSync(first, 'head fixture');
    const preflight = check(sample.destination, sample.source, sample.expected, chain, 100);
    assert.equal(preflight.mode, 'create');
    fs.writeFileSync(FileUtil.getBlockPath(chain, 101), 'advanced fixture');
    assert.throws(() => install(sample.destination, sample.source, sample.expected, chain, 100),
        /target disk head differs/);
    assert.equal(fs.existsSync(sample.destination), false);
  }));

test('identical seed reuses the existing inode and bytes', () => fixture((sample) => {
  const { source, destination, expected, bytes } = sample;
  fs.writeFileSync(destination, bytes);
  const before = fs.statSync(destination);
  assert.equal(check(destination, source, expected).mode, 'reuse');
  assert.equal(install(destination, source, expected).mode, 'reuse');
  const after = fs.statSync(destination);
  assert.equal(before.ino, after.ino);
  assert.equal(before.mtimeMs, after.mtimeMs);
}));

for (const failure of ['different-existing', 'different-source', 'leftover-part', 'symlink']) {
  test(`refuses ${failure} without overwriting retained bytes`, () => fixture((sample) => {
    const { source, destination, expected } = sample;
    if (failure === 'different-existing') fs.writeFileSync(destination, 'retained');
    if (failure === 'different-source') fs.writeFileSync(source, 'changed');
    if (failure === 'leftover-part') fs.writeFileSync(`${destination}.recovery-part`, 'retained');
    if (failure === 'symlink') fs.symlinkSync(source, destination);
    const before = new Map(fs.readdirSync(sample.directory).map((name) =>
      [name, fs.readFileSync(path.join(sample.directory, name)).toString('hex')]));
    assert.throws(() => check(destination, source, expected));
    assert.throws(() => install(destination, source, expected));
    assert.deepEqual(new Map(fs.readdirSync(sample.directory).map((name) =>
      [name, fs.readFileSync(path.join(sample.directory, name)).toString('hex')])), before);
  }));
}

test('a racing destination is never overwritten and the owned temporary file is removed', () =>
  fixture((sample) => {
    const { source, destination, expected } = sample;
    const link = fs.linkSync;
    fs.linkSync = () => {
      fs.writeFileSync(destination, 'racing snapshot');
      throw Object.assign(new Error('destination exists'), { code: 'EEXIST' });
    };
    try {
      assert.throws(() => install(destination, source, expected), /destination exists/);
      assert.equal(fs.readFileSync(destination, 'utf8'), 'racing snapshot');
      assert.equal(fs.existsSync(`${destination}.recovery-part`), false);
    } finally {
      fs.linkSync = link;
    }
  }));

test('failed staged write is closed and cleaned without installing a partial seed', () =>
  fixture((sample) => {
    const sync = fs.fsyncSync;
    fs.fsyncSync = () => {
      throw new Error('simulated fsync failure');
    };
    try {
      assert.throws(() => install(sample.destination, sample.source, sample.expected),
          /simulated fsync failure/);
      assert.equal(fs.existsSync(sample.destination), false);
      assert.equal(fs.existsSync(`${sample.destination}.recovery-part`), false);
    } finally {
      fs.fsyncSync = sync;
    }
  }));
