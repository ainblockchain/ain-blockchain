const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { Writable } = require('stream');
const FileUtil = require('../../common/file-util');
const BlockchainNode = require('../../node');
const CommonUtil = require('../../common/common-util');
const { NodeConfigs } = require('../../common/constants');

describe('Snapshot streaming failure containment and atomic publication', () => {
  let directory;
  let restorers;

  function replace(object, key, replacement) {
    const previous = object[key];
    restorers.push(() => {
      object[key] = previous;
    });
    object[key] = replacement;
  }

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-test-'));
    FileUtil.createSnapshotDir(directory);
    restorers = [];
  });

  afterEach(() => {
    for (const restore of restorers.reverse()) restore();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  for (const kind of ['missing', 'truncated-gzip', 'invalid-json']) {
    for (const method of ['read', 'process']) {
      it(`${method} reports ${kind} without an unhandled stream error`, async () => {
        const filename = path.join(directory, 'broken.json.gz');
        if (kind === 'truncated-gzip') {
          fs.writeFileSync(filename, zlib.gzipSync(JSON.stringify({ docs: [] })).subarray(0, 12));
        } else if (kind === 'invalid-json') {
          fs.writeFileSync(filename, zlib.gzipSync('{"docs": [invalid}'));
        }
        let completed = false;
        const result = method === 'read' ? await FileUtil.readChunkedJsonAsync(filename) :
          await FileUtil.processChunkedJsonAsync(filename, () => null, () => {
            completed = true;
          });
        assert.equal(result, method === 'read' ? null : false);
        assert.equal(completed, false);
      });
    }
  }

  it('round-trips and replaces the old snapshot only after completion', async () => {
    assert.equal(await FileUtil.writeSnapshotFile(directory, 10, { value: 1 }, 128), true);
    const filename = FileUtil.getSnapshotPathByBlockNumber(directory, 10);
    assert.deepEqual(await FileUtil.readChunkedJsonAsync(filename), { value: 1 });
    assert.equal(await FileUtil.writeSnapshotFile(directory, 10, { value: 2 }, 128), true);
    assert.deepEqual(await FileUtil.readChunkedJsonAsync(filename), { value: 2 });
    assert.deepEqual(fs.readdirSync(path.join(directory, 'n2s')), ['10.json.gz']);
    assert.equal(FileUtil.getLatestSnapshotInfo(directory).latestSnapshotBlockNumber, 10);
  });

  for (const failure of ['stream', 'rename']) {
    it(`preserves old bytes and cleans temporary output after ${failure} failure`, async () => {
      await FileUtil.writeSnapshotFile(directory, 10, { preserved: true }, 128);
      const filename = FileUtil.getSnapshotPathByBlockNumber(directory, 10);
      const before = fs.readFileSync(filename);
      if (failure === 'stream') {
        replace(fs, 'createWriteStream', () => new Writable({
          write(chunk, encoding, callback) {
            callback(new Error('forced write failure'));
          },
        }));
      } else {
        replace(fs.promises, 'rename', async () => {
          throw new Error('forced rename failure');
        });
      }
      assert.equal(await FileUtil.writeSnapshotFile(
          directory, 10, { replacement: true }, 128), false);
      assert.deepEqual(fs.readFileSync(filename), before);
      assert.deepEqual(fs.readdirSync(path.join(directory, 'n2s')), ['10.json.gz']);
    });
  }

  it('contains chunk callback exceptions and does not invoke successful completion', async () => {
    await FileUtil.writeSnapshotFile(directory, 10, { value: 1 }, 128);
    let completed = false;
    const result = await FileUtil.processChunkedJsonAsync(
        FileUtil.getSnapshotPathByBlockNumber(directory, 10),
        () => {
          throw new Error('callback failed');
        }, () => {
          completed = true;
        });
    assert.equal(result, false);
    assert.equal(completed, false);
  });

  it('keeps older snapshots when writing the replacement fails', async () => {
    const deleted = [];
    const fakeNode = { writeSnapshot: async () => false,
      deleteSnapshot: (number) => deleted.push(number) };
    const number = NodeConfigs.SNAPSHOTS_INTERVAL_BLOCK_NUMBER;
    await BlockchainNode.prototype.updateSnapshots.call(fakeNode, number);
    assert.deepEqual(deleted, []);
    fakeNode.writeSnapshot = async () => true;
    await BlockchainNode.prototype.updateSnapshots.call(fakeNode, number);
    assert.deepEqual(deleted, [number - NodeConfigs.MAX_NUM_SNAPSHOTS * number]);
  });

  it('does not accept an invalid latest snapshot as an empty bootstrap state', async () => {
    fs.writeFileSync(FileUtil.getSnapshotPathByBlockNumber(directory, 10), 'not gzip');
    let finishCalls = 0;
    let bootstrapCalls = 0;
    replace(CommonUtil, 'finishWithStackTrace', () => {
      finishCalls++;
    });
    const fakeNode = { snapshotDir: directory, setBootstrapSnapshot: () => {
      bootstrapCalls++;
    } };
    assert.equal(await BlockchainNode.prototype.loadLatestSnapshot.call(fakeNode), false);
    assert.equal(bootstrapCalls, 0);
    assert.equal(finishCalls, 1);
  });
});
