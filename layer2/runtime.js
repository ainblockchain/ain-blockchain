'use strict';
const Transaction = require('../tx-pool/transaction');
const CommonUtil = require('../common/common-util');
const { verifyCertificate } = require('./anchor');
const inbox = require('./inbox');
const HASH = /^0x[a-f0-9]{64}$/;
const ADDR = /^0x[a-fA-F0-9]{40}$/;
const CONFIG = '/blockchain_params/layer2';
const CODE = 12180;
const reject = message => CommonUtil.returnTxResult(CODE, message, 0);
const ok = () => CommonUtil.returnTxResult(0, null, 1);
const get = (db, path) => db.getValue(path);
// Native state objects cannot contain arrays. Preserve ordered lists as numeric
// dictionaries, including embedded signed inbox bodies (original bytes are in the block).
const stateValue = value => value && typeof value === 'object' ?
  Object.fromEntries(Object.entries(value).map(([key, child]) => [key, stateValue(child)])) : value;
const write = (db, path, value) => db.writeDatabase(['values', ...path.split('/').filter(Boolean)], stateValue(value));
const special = op => typeof op?.ref === 'string' && (op.ref === '/layer2' || op.ref.startsWith('/layer2/'));
function leaves(op) { return op?.type === 'SET' && Array.isArray(op.op_list) ? op.op_list.flatMap(leaves) : [op]; }
function consensus(op) {
  return (op?.type === 'SET_VALUE' || op?.type === undefined) && !op.is_global &&
    /^\/consensus\/number\/\d+\/(propose|0x[a-f0-9]{64}\/vote\/0x[a-fA-F0-9]{40})$/.test(op.ref);
}
function committee(list) {
  return Array.isArray(list) && list.length === 5 && list.every(a => ADDR.test(a)) &&
    new Set(list.map(a => a.toLowerCase())).size === 5;
}
function verifyChildConfig(config) {
  if (!config || config.version !== 1 || config.role !== 'L1' || !committee(config.validators) ||
      config.threshold !== 4 || !Number.isSafeInteger(config.chainId) || config.chainId < 0 || config.chainId > 109 ||
      !Number.isSafeInteger(config.parentChainId) || config.parentChainId < 0 || config.parentChainId > 109 ||
      config.chainId === config.parentChainId || !HASH.test(config.parentGenesisHash) || config.genesisHash !== null) {
    throw Error('Invalid L1 lock configuration');
  }
}

function precheck(db, tx, blockNumber) {
  if (blockNumber === 0) return true;
  const config = get(db, CONFIG), ops = leaves(tx?.tx_body?.operation);
  // A control command must stand alone; no partially committed mixed batch.
  if (ops.some(special) && (ops.length !== 1 || tx.tx_body.operation.type === 'SET')) {
    return reject('Layer control transactions cannot be batched');
  }
  if (!config) return true;
  if (config.role !== 'L1' && config.role !== 'L2') return reject('Invalid execution-layer configuration');
  if (config.role === 'L1') {
    if (tx.tx_body.gas_price !== 0 || tx.tx_body.billing !== undefined) return reject('Locked L1 accepts zero-fee control/inbox transactions only');
    if (!ops.every(op => consensus(op) || special(op))) return reject('State and assets are locked on L1; submit to L2 or the L1 inbox');
  } else {
    // Genesis, layer control, and their ancestors cannot be overwritten by ordinary operations.
    if (ops.some(op => {
      if (!op || typeof op.ref !== 'string') return true;
      const ref = CommonUtil.formatPath(CommonUtil.parsePath(op.ref));
      return ref === '/' || ref === '/blockchain_params' || ref === CONFIG || ref.startsWith(CONFIG + '/') ||
        ((ref === '/layer2' || ref.startsWith('/layer2/')) && ref !== op.ref);
    })) {
      return reject('Execution-layer configuration is immutable');
    }
    const marker = tx.tx_body.parent_tx_hash;
    if (typeof marker === 'string' && inbox.MARKER.test(marker)) {
      const approval = get(db, '/layer2/inbox_authorizations/' + marker);
      if (!approval || approval.statement.inner_hash !== tx.hash || approval.consumed) {
        return reject('L1 inbox transaction is not finalized, authorized, or is already consumed');
      }
    }
  }
  return true;
}

function execute(db, op, auth, tx, blockNumber) {
  if (blockNumber === 0 || !special(op)) return null;
  try {
    if ((op.type !== 'SET_VALUE' && op.type !== undefined) || op.is_global || tx.tx_body.gas_price !== 0 || tx.tx_body.billing !== undefined) {
      throw Error('Layer control requires a local zero-fee SET_VALUE');
    }
    const config = get(db, CONFIG), owner = get(db, '/blockchain_params/genesis/genesis_addr');
    if (op.ref === '/layer2/control/freeze') {
      if (config || auth.addr !== owner) throw Error('Only the genesis governor can initialize the migration lock once');
      verifyChildConfig(op.value);
      if (op.value.parentChainId !== get(db, '/blockchain_params/genesis/chain_id')) throw Error('Parent chain mismatch');
      const lock = { block_number: blockNumber, accounts_root: db.getProofHash('/values/accounts'),
        service_accounts_root: db.getProofHash('/values/service_accounts'), apps_root: db.getProofHash('/values/apps'),
        timestamp: tx.tx_body.timestamp, transaction_hash: tx.hash, status: 'LOCKED_FOR_L2' };
      write(db, CONFIG, op.value); write(db, '/layer2/lock', lock);
      // L1 becomes the custody/checkpoint layer; issuance continues only on L2.
      write(db, '/blockchain_params/reward/annual_rate', 0);
      return ok();
    }
    if (!config) throw Error('Layer migration is not initialized');
    if (op.ref === '/layer2/control/bind') {
      if (config.role !== 'L1' || config.genesisHash !== null || auth.addr !== owner || !HASH.test(op.value?.genesis_hash) ||
          !HASH.test(op.value?.source_state_root) || !HASH.test(op.value?.source_block_hash) ||
          !Number.isSafeInteger(op.value?.source_height) || op.value.source_height < get(db, '/layer2/lock/block_number')) {
        throw Error('Invalid one-time child binding');
      }
      write(db, CONFIG, { ...config, genesisHash: op.value.genesis_hash });
      write(db, '/layer2/migration', op.value);
      return ok();
    }
    const checkpoint = op.ref.match(/^\/layer2\/checkpoints\/(0|[1-9][0-9]*)$/);
    if (checkpoint && config.role === 'L1') {
      if (get(db, op.ref) !== null) throw Error('Checkpoint already recorded');
      const previous = get(db, '/layer2/latest_checkpoint');
      const verified = verifyCertificate(op.value, config, previous?.statement || null);
      if (Number(checkpoint[1]) !== verified.statement.height) throw Error('Checkpoint height mismatch');
      const record = { ...op.value, commitment_hash: verified.hash, l1_block: blockNumber, l1_tx_hash: tx.hash,
        settlement: 'OPERATOR_ATTESTED', trust_model: 'operator-validated' };
      write(db, op.ref, record); write(db, '/layer2/latest_checkpoint', record);
      return ok();
    }
    const pending = op.ref.match(/^\/layer2\/inbox\/(0x4c31494e[a-f0-9]{56})$/);
    if (pending && config.role === 'L1' && config.genesisHash) {
      if (get(db, op.ref) !== null) throw Error('Inbox marker already recorded');
      const inner = Transaction.create(op.value?.tx_body, op.value?.signature, config.chainId);
      if (!inner || !Transaction.verifyTransaction(inner, config.chainId) || inner.address !== auth.addr ||
          inner.tx_body.parent_tx_hash !== pending[1] || leaves(inner.tx_body.operation).some(special)) {
        throw Error('Invalid signed L2 inbox payload');
      }
      write(db, op.ref, { tx_body: inner.tx_body, signature: inner.signature, inner_hash: inner.hash,
        l1_tx_hash: tx.hash, l1_block: blockNumber, address: inner.address });
      return ok();
    }
    const approve = op.ref.match(/^\/layer2\/inbox_authorizations\/(0x4c31494e[a-f0-9]{56})$/);
    if (approve && config.role === 'L2') {
      if (get(db, op.ref) !== null) throw Error('Inbox already authorized');
      const statement = inbox.verify(op.value, config);
      if (statement.marker !== approve[1]) throw Error('Inbox marker mismatch');
      write(db, op.ref, { ...op.value, consumed: false });
      return ok();
    }
    throw Error('Unsupported or immutable layer control path');
  } catch (error) { return reject(error.message); }
}

function afterExecution(db, tx, result, blockNumber) {
  const config = get(db, CONFIG), marker = tx.tx_body.parent_tx_hash;
  if (config?.role !== 'L2' || typeof marker !== 'string' || !inbox.MARKER.test(marker) || CommonUtil.isFailedTx(result)) return;
  const path = '/layer2/inbox_authorizations/' + marker, approval = get(db, path);
  if (!approval || approval.consumed || approval.statement.inner_hash !== tx.hash) throw Error('Inbox execution invariant failed');
  write(db, path, { ...approval, consumed: true, l2_tx_hash: tx.hash, l2_block: blockNumber });
}

const isControlTransaction = tx => leaves(tx?.tx_body?.operation).some(special);
module.exports = { precheck, execute, afterExecution, isControlTransaction, CONFIG, CODE, committee };
