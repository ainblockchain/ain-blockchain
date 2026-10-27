// Local storage policy only: never changes blocks, state, votes or consensus.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const gunzip = promisify(zlib.gunzip);
const fsp = fs.promises;

async function syncDirectory(directory) {
  const handle = await fsp.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function atomicJson(filename, value) {
  const temporary = `${filename}.tmp`;
  const handle = await fsp.open(temporary, 'w', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
  finally { await handle.close(); }
  await fsp.rename(temporary, filename);
  await syncDirectory(path.dirname(filename));
}

class HistoryRetention {
  constructor(chainPath, config, files) {
    this.chainPath = chainPath;
    this.config = config;
    this.files = files;
    this.filename = path.join(chainPath, 'history-retention.json');
    this.busy = false;
    const keep = config.BLOCK_HISTORY_RETENTION;
    const minimum = config.MAX_NUM_SNAPSHOTS * config.SNAPSHOTS_INTERVAL_BLOCK_NUMBER +
        Math.max(config.ON_MEMORY_CHAIN_LENGTH, config.CHAIN_SEGMENT_LENGTH);
    if (!Number.isSafeInteger(keep) || keep < 0 || (keep > 0 && keep < minimum)) {
      throw Error(`BLOCK_HISTORY_RETENTION must be 0 or an integer >= ${minimum}`);
    }
    this.marker = this.readMarker();
    if ((keep > 0 || this.marker) && !['fast', 'peer'].includes(config.SYNC_MODE)) {
      throw Error('Bounded/pruned history requires snapshot recovery (SYNC_MODE=fast or peer)');
    }
  }

  readMarker() {
    try {
      const marker = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
      if (marker.version !== 1 || !Number.isSafeInteger(marker.retainFrom) ||
          marker.retainFrom < 1 || !Number.isSafeInteger(marker.nextBlock) ||
          marker.nextBlock < 1 || marker.nextBlock > marker.retainFrom) {
        throw Error('Invalid history retention marker; refusing unsafe recovery');
      }
      return marker;
    } catch (err) { if (err.code === 'ENOENT') return null; throw err; }
  }

  assertRecoverable(snapshotNumber) {
    if (this.marker && (!Number.isSafeInteger(snapshotNumber) ||
        snapshotNumber < this.marker.retainFrom)) {
      throw Error(`Pruned history requires a snapshot at or above ${this.marker.retainFrom}`);
    }
  }

  shouldBackfillHistory() {
    return this.config.BLOCK_HISTORY_RETENTION === 0 && !this.marker;
  }

  allowsBlock(number) {
    return number === 0 || !this.marker || number >= this.marker.retainFrom;
  }

  status() {
    return { retentionBlocks: this.config.BLOCK_HISTORY_RETENTION,
      historyPruned: !!this.marker, retainFrom: this.marker ? this.marker.retainFrom : 0,
      nextBlockToPrune: this.marker ? this.marker.nextBlock : null, pruning: this.busy };
  }

  // validateSnapshot must reread the durable file, recompute its state proof and
  // compare its block to the finalized on-disk chain. Never prune on write intent.
  async prune(snapshotNumber, validateSnapshot) {
    const keep = this.config.BLOCK_HISTORY_RETENTION;
    if (!keep || this.busy || snapshotNumber <= keep) return;
    this.busy = true;
    try {
      await validateSnapshot();
      const retainFrom = Math.max(snapshotNumber - keep + 1,
          this.marker ? this.marker.retainFrom : 1);
      let nextBlock = this.marker ? this.marker.nextBlock : 1;
      this.marker = { version: 1, retainFrom, nextBlock, snapshotNumber };
      // Durable fence before the first unlink, including on the first migration.
      await atomicJson(this.filename, this.marker);
      while (nextBlock < retainFrom) {
        const end = Math.min(nextBlock + 1024, retainFrom);
        const changedDirectories = new Set();
        // Bounded concurrency/memory; async I/O keeps consensus responsive.
        for (let start = nextBlock; start < end; start += 8) {
          const results = await Promise.allSettled(Array.from({ length: Math.min(8, end - start) },
              (_, offset) => this.removeBlock(start + offset)));
          const failed = results.find(result => result.status === 'rejected');
          if (failed) throw failed.reason;
          for (const result of results) {
            for (const directory of result.value || []) changedDirectories.add(directory);
          }
        }
        for (const directory of changedDirectories) await syncDirectory(directory);
        nextBlock = end;
        this.marker.nextBlock = nextBlock;
        await atomicJson(this.filename, this.marker);
      }
    } finally { this.busy = false; }
  }

  async removeBlock(number) {
    const filename = this.files.getBlockPath(this.chainPath, number);
    let block;
    try { block = JSON.parse(await gunzip(await fsp.readFile(filename))); }
    catch (err) { if (err.code === 'ENOENT') return; throw err; }
    if (block.number !== number || !/^0x[0-9a-fA-F]{64}$/.test(block.hash)) {
      throw Error(`Invalid historical block ${number}; pruning stopped`);
    }
    const index = this.files.getH2nPath(this.chainPath, block.hash);
    // Index first: interruption leaves a readable block, so retry removes both.
    await fsp.unlink(index).catch(err => { if (err.code !== 'ENOENT') throw err; });
    await fsp.unlink(filename);
    return [path.dirname(index), path.dirname(filename)];
  }
}

module.exports = { HistoryRetention, syncDirectory };
