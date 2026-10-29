'use strict';

const Database = require('better-sqlite3');
const { RpcError } = require('./protocol');
const anchor = require('../../layer2/anchor');
const CommonUtil = require('../../common/common-util');

class IndexStore {
  constructor(filename) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chains (layer TEXT PRIMARY KEY, genesis TEXT NOT NULL, height INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS blocks (layer TEXT NOT NULL, number INTEGER NOT NULL, hash TEXT NOT NULL,
        state_root TEXT, timestamp INTEGER, PRIMARY KEY(layer,number));
      CREATE TABLE IF NOT EXISTS transactions (layer TEXT NOT NULL, hash TEXT NOT NULL, block_number INTEGER NOT NULL,
        tx_index INTEGER NOT NULL, address TEXT, body TEXT NOT NULL, receipt TEXT,
        PRIMARY KEY(layer,hash), UNIQUE(layer,block_number,tx_index));
      CREATE INDEX IF NOT EXISTS transaction_order ON transactions(layer,block_number DESC,tx_index DESC);
      CREATE INDEX IF NOT EXISTS transaction_address ON transactions(layer,address,block_number DESC,tx_index DESC);
      CREATE TABLE IF NOT EXISTS anchors (height INTEGER PRIMARY KEY, block_hash TEXT NOT NULL,
        state_root TEXT NOT NULL, l1_block INTEGER NOT NULL, l1_tx_hash TEXT NOT NULL, certificate TEXT NOT NULL);
    `);
  }

  bind(layer, genesis) {
    const old = this.db.prepare('SELECT genesis FROM chains WHERE layer=?').get(layer);
    if (old && old.genesis !== genesis) throw Error('Refusing to reuse an index for another genesis');
    this.db.prepare('INSERT OR IGNORE INTO chains VALUES(?,?,-1)').run(layer, genesis);
  }

  head(layer) { return this.db.prepare('SELECT * FROM chains WHERE layer=?').get(layer); }

  configureSettlement(configuration) { this.settlementConfiguration = configuration; }

  settlement(height) {
    const row = this.db.prepare(`SELECT a.* FROM anchors a JOIN blocks b
      ON b.layer='L2' AND b.number=a.height AND b.hash=a.block_hash AND b.state_root=a.state_root
      WHERE a.height>=? ORDER BY a.height LIMIT 1`).get(height);
    return row ? { status: 'OPERATOR_ATTESTED_ON_L1', l2_checkpoint_height: row.height,
      l1_block: row.l1_block, l1_tx_hash: row.l1_tx_hash, certificate: JSON.parse(row.certificate),
      trust_model: 'operator-validated' } : { status: 'AWAITING_L1_CHECKPOINT' };
  }

  append(layer, block) {
    this.db.transaction(() => {
      const head = this.head(layer);
      if (!head || block.number !== head.height + 1) throw Error('Noncontiguous finalized block');
      if (block.number === 0 && block.hash !== head.genesis) throw Error('Genesis mismatch');
      if (block.number > 0) {
        const previous = this.db.prepare('SELECT hash FROM blocks WHERE layer=? AND number=?').get(layer, head.height);
        if (block.last_hash !== previous.hash) throw Error('Finalized history fork; index halted');
      }
      if (!Array.isArray(block.transactions)) throw Error('Full transactions required');
      this.db.prepare('INSERT INTO blocks VALUES(?,?,?,?,?)').run(layer, block.number, block.hash,
        block.state_proof_hash || null, block.timestamp || null);
      const insert = this.db.prepare('INSERT INTO transactions VALUES(?,?,?,?,?,?,?)');
      block.transactions.forEach((tx, index) => {
        if (!tx || typeof tx.hash !== 'string' || !tx.tx_body) throw Error('Full transaction required');
        insert.run(layer, tx.hash, block.number, index, tx.address || null, JSON.stringify(tx),
          block.receipts?.[index] === undefined ? null : JSON.stringify(block.receipts[index]));
        const op = tx.tx_body.operation, receipt = block.receipts?.[index];
        if (layer === 'L1' && this.settlementConfiguration && op?.type === 'SET_VALUE' &&
            /^\/layer2\/checkpoints\/\d+$/.test(op.ref) && receipt && !CommonUtil.isFailedTx(receipt)) {
          const previous = this.db.prepare('SELECT certificate FROM anchors ORDER BY height DESC LIMIT 1').get();
          const verified = anchor.verifyCertificate(op.value, this.settlementConfiguration,
            previous ? JSON.parse(previous.certificate).statement : null);
          if (op.ref !== '/layer2/checkpoints/' + verified.statement.height) throw Error('Checkpoint path mismatch');
          this.db.prepare('INSERT INTO anchors VALUES(?,?,?,?,?,?)').run(verified.statement.height,
            verified.statement.block_hash, verified.statement.state_root, block.number, tx.hash, JSON.stringify(op.value));
        }
      });
      this.db.prepare('UPDATE chains SET height=? WHERE layer=?').run(block.number, layer);
    })();
  }

  list(layer, { limit = 50, cursor, address } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RpcError(-32602, 'limit must be 1..100');
    if (address !== undefined && !/^0x[a-fA-F0-9]{40}$/.test(address)) throw new RpcError(-32602, 'Invalid address');
    const head = this.head(layer);
    if (!head || head.height < 0) throw new RpcError(-32053, 'Layer history is not indexed yet');
    let snapshot = head.height, beforeBlock = snapshot + 1, beforeIndex = 0;
    if (cursor !== undefined) {
      try {
        if (typeof cursor !== 'string' || cursor.length > 1024) throw Error();
        const c = JSON.parse(Buffer.from(cursor, 'base64url').toString());
        if (c.layer !== layer || c.genesis !== head.genesis || c.address !== (address || null) ||
            ![c.snapshot, c.block, c.index].every(Number.isSafeInteger) || c.snapshot < 0 ||
            c.snapshot > head.height || c.block < 0 || c.block > c.snapshot || c.index < 0) throw Error();
        snapshot = c.snapshot; beforeBlock = c.block; beforeIndex = c.index;
      } catch { throw new RpcError(-32602, 'Invalid cursor for this layer, chain or filter'); }
    }
    const filter = address ? 'AND address=? COLLATE NOCASE' : '';
    const args = [layer, snapshot, beforeBlock, beforeBlock, beforeIndex];
    if (address) args.push(address);
    args.push(limit + 1);
    const rows = this.db.prepare(`SELECT hash,block_number,tx_index,address FROM transactions
      WHERE layer=? AND block_number<=? AND (block_number<? OR (block_number=? AND tx_index<?))
      ${filter} ORDER BY block_number DESC,tx_index DESC LIMIT ?`).all(...args);
    const more = rows.length > limit, selected = rows.slice(0, limit), last = selected.at(-1);
    return { layer, genesis_hash: head.genesis, indexed_height: head.height, snapshot_height: snapshot,
      transactions: selected.map(row => ({ ...row, layer, execution_status: layer === 'L2' ? 'L2_COMMITTED' : 'L1_FINALIZED',
        ...(layer === 'L2' ? { settlement: this.settlement(row.block_number) } : {}) })),
      next_cursor: more ? Buffer.from(JSON.stringify({ layer, genesis: head.genesis, snapshot,
        block: last.block_number, index: last.tx_index, address: address || null })).toString('base64url') : null };
  }

  transaction(layer, hash) {
    if (typeof hash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new RpcError(-32602, 'Invalid hash');
    const row = this.db.prepare('SELECT * FROM transactions WHERE layer=? AND hash=?').get(layer, hash);
    if (!row) return null;
    const transaction = JSON.parse(row.body), op = transaction.tx_body.operation;
    const inbox = layer === 'L1' && /^\/layer2\/inbox\/0x4c31494e[a-f0-9]{56}$/.test(op?.ref) && op.value?.signature ?
      { submission_layer: 'L1', execution_layer: 'L2', marker: op.ref.split('/').at(-1),
        l2_tx_hash: CommonUtil.hashSignature(op.value.signature) } : null;
    return { layer, hash, transaction, execution_result: row.receipt ? JSON.parse(row.receipt) : null,
      block_number: row.block_number, tx_index: row.tx_index,
      inbox, ...(layer === 'L2' ? { settlement: this.settlement(row.block_number) } : {}),
      execution_status: layer === 'L2' ? 'L2_COMMITTED' : 'L1_FINALIZED' };
  }

  close() { this.db.close(); }
}

module.exports = { IndexStore };
