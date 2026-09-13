const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function checkHead(chainDirectory, expectedHead) {
  if (chainDirectory === undefined && expectedHead === undefined) return;
  assert.ok(chainDirectory && Number.isSafeInteger(expectedHead) && expectedHead >= 0);
  const FileUtil = require('../../common/file-util');
  const head = FileUtil.getLatestBlockInfo(chainDirectory);
  assert.equal(head.latestBlockNumber, expectedHead,
      'target disk head differs from seed; missing-history replay or a newer seed is required');
}

function check(destination, source, expected, chainDirectory, expectedHead) {
  checkHead(chainDirectory, expectedHead);
  assert.match(expected, /^[a-f0-9]{64}$/);
  assert.ok(fs.statSync(path.dirname(destination)).isDirectory());
  assert.equal(hash(fs.readFileSync(source)), expected, 'verified seed source changed');
  let existing;
  try {
    existing = fs.lstatSync(destination);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (existing) {
    assert.ok(existing.isFile(), 'existing seed must be a regular file, not a symlink');
    assert.equal(hash(fs.readFileSync(destination)), expected, 'existing snapshot differs');
    return { mode: 'reuse', sha256: expected };
  }
  assert.equal(fs.existsSync(`${destination}.recovery-part`), false, 'staged seed already exists');
  return { mode: 'create', sha256: expected };
}

function install(destination, source, expected, chainDirectory, expectedHead) {
  const result = check(destination, source, expected, chainDirectory, expectedHead);
  if (result.mode === 'reuse') return result;
  const bytes = fs.readFileSync(source);
  assert.equal(hash(bytes), expected, 'verified seed source changed before installation');
  const temporary = `${destination}.recovery-part`;
  const descriptor = fs.openSync(temporary, 'wx', 0o600);
  try {
    try {
      fs.writeFileSync(descriptor, bytes);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.linkSync(temporary, destination);
    const directory = fs.openSync(path.dirname(destination), 'r');
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  } finally {
    fs.unlinkSync(temporary);
  }
  assert.equal(hash(fs.readFileSync(destination)), expected);
  return result;
}

if (require.main === module) {
  try {
    const [, , mode, destination, source, expected, chainDirectory, number] = process.argv;
    assert.ok(mode === 'check' || mode === 'install');
    const action = mode === 'check' ? check : install;
    console.log(JSON.stringify(action(destination, source, expected, chainDirectory,
        number === undefined ? undefined : Number(number))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { check, install, hash, checkHead };
