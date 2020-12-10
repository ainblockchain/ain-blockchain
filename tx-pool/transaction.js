const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger')('TRANSACTION');
const {WriteDbOperations} = require('../constants');
const ChainUtil = require('../chain-util');

class Transaction {
  constructor(txWithSig) {
    this.signature = txWithSig.signature;

    const transaction = txWithSig.transaction;
    if (!Transaction.hasRequiredFields(transaction)) {
      logger.info('Transaction must contain timestamp, operation and nonce fields: ' +
          JSON.stringify(transaction));
      return null;
    }

    const txData = JSON.parse(JSON.stringify(transaction));
    const sanitizedTxData = Transaction.sanitizeTxData(txData);
    // Workaround for skip_verif with custom address
    if (txData.skip_verif !== undefined) {
      this.skip_verif = txData.skip_verif;
    }
    Object.assign(this, sanitizedTxData);
    this.hash = '0x' + ainUtil.hashTransaction(sanitizedTxData).toString('hex');
    // Workaround for skip_verif with custom address
    this.address = txData.address !== undefined ?
        txData.address : Transaction.getAddress(this.hash.slice(2), this.signature);

    logger.debug(`CREATING TRANSACTION: ${JSON.stringify(this)}`);
  }

  static signTxBody(txData, privateKey) {
    const transaction = JSON.parse(JSON.stringify(txData));
    transaction.timestamp = Date.now();
    // Workaround for skip_verif with custom address
    const signature = transaction.address !== undefined ?
        '' : ainUtil.ecSignTransaction(transaction, Buffer.from(privateKey, 'hex'));
    return new Transaction({ signature, transaction });
  }

  toString() {
    // TODO (lia): change JSON.stringify to 'fast-json-stable-stringify' or add
    // an utility function to ain-util.
    return `hash:       ${this.hash},
            nonce:      ${this.nonce},
            timestamp:  ${this.timestamp},
            operation:  ${JSON.stringify(this.operation)},
            address:    ${this.address},
            ${this.parent_tx_hash !== undefined ? 'parent_tx_hash: ' + this.parent_tx_hash : ''}
        `;
  }

  /**
   * Gets address from hash and signature.
   */
  static getAddress(hash, signature) {
    const sigBuffer = ainUtil.toBuffer(signature);
    const len = sigBuffer.length;
    const lenHash = len - 65;
    const {r, s, v} = ainUtil.ecSplitSig(sigBuffer.slice(lenHash, len));
    const publicKey = ainUtil.ecRecoverPub(Buffer.from(hash, 'hex'), r, s, v);
    return ainUtil.toChecksumAddress(ainUtil.bufferToHex(
        ainUtil.pubToAddress(publicKey, publicKey.length === 65)));
  }

  /**
   * Returns the data object used for signing the transaction.
   */
  get signingData() {
    return Object.assign(
        {operation: this.operation, nonce: this.nonce, timestamp: this.timestamp},
        this.parent_tx_hash !== undefined ? {parent_tx_hash: this.parent_tx_hash} : {}
    );
  }

  /**
   * Sanitize SET operation.
   */
  static sanitizeSetOperation(op) {
    const sanitizedOpList = []
    if (Array.isArray(op.op_list)) {
      op.op_list.forEach((op) => {
        sanitizedOpList.push(this.sanitizeSimpleOperation(op));
      });
    }
    return {
      type: op.type,
      op_list: sanitizedOpList,
    };
  }

  /**
   * Sanitize simple operation.
   */
  static sanitizeSimpleOperation(op) {
    const sanitized = {}
    switch (op.type) {
      case undefined:
      case WriteDbOperations.SET_VALUE:
      case WriteDbOperations.SET_RULE:
      case WriteDbOperations.SET_FUNCTION:
      case WriteDbOperations.SET_OWNER:
        sanitized.ref = ChainUtil.stringOrEmpty(op.ref);
        sanitized.value = op.value;
        break;
      case WriteDbOperations.INC_VALUE:
      case WriteDbOperations.DEC_VALUE:
        sanitized.ref = ChainUtil.stringOrEmpty(op.ref);
        sanitized.value = ChainUtil.numberOrZero(op.value);
        break;
      default:
        return sanitized;
    }
    sanitized.type = op.type;
    if (op.is_global !== undefined) {
      sanitized.is_global = ChainUtil.boolOrFalse(op.is_global);
    }
    return sanitized;
  }

  /**
   * Sanitize operation.
   */
  static sanitizeOperation(op) {
    return (op.type === WriteDbOperations.SET) ?
        this.sanitizeSetOperation(op) : this.sanitizeSimpleOperation(op);
  }

  /**
   * Sanitize transaction data.
   */
  static sanitizeTxData(txData) {
    const sanitized = {
      nonce: ChainUtil.numberOrZero(txData.nonce),
      timestamp: ChainUtil.numberOrZero(txData.timestamp),
      operation: Transaction.sanitizeOperation(txData.operation),
    };
    if (txData.parent_tx_hash !== undefined) {
      sanitized.parent_tx_hash = ChainUtil.stringOrEmpty(txData.parent_tx_hash);
    }
    return sanitized;
  }

  static verifyTransaction(transaction) {
    if (transaction.operation.type !== undefined &&
        Object.keys(WriteDbOperations).indexOf(transaction.operation.type) === -1) {
      logger.info(`Invalid transaction type: ${transaction.operation.type}`);
      return false;
    }
    // Workaround for skip_verif with custom address
    if (transaction.skip_verif) {
      logger.info('Skip verifying signature for transaction: ' +
          JSON.stringify(transaction, null, 2));
      return true;
    }
    return ainUtil.ecVerifySig(transaction.signingData, transaction.signature, transaction.address);
  }

  static hasRequiredFields(transaction) {
    return transaction.timestamp !== undefined && transaction.nonce !== undefined &&
        transaction.operation !== undefined;
  }

  static isBatchTransaction(transaction) {
    return Array.isArray(transaction.tx_list);
  }
}

module.exports = Transaction;
