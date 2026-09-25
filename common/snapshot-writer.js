// Encode snapshots outside the consensus process and publish only complete files.
const fs = require('fs');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const ObjectUtil = require('./object-util');
const JsonStreamStringify = require('json-stream-stringify');

async function writeSnapshot({ filePath, snapshot, chunkSize }) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    await pipeline(new JsonStreamStringify({ docs: ObjectUtil.toChunks(snapshot, chunkSize) }),
        zlib.createGzip(), fs.createWriteStream(temporary, { flags: 'wx' }));
    const handle = await fs.promises.open(temporary, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.promises.rename(temporary, filePath);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

if (require.main === module) {
  process.once('message', async (data) => {
    try {
      await writeSnapshot(data);
      process.send({ ok: true }, () => process.exit(0));
    } catch (error) {
      process.send({ ok: false, error: error.message }, () => process.exit(1));
    }
  });
}

module.exports = { writeSnapshot };
