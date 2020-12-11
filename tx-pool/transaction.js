const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger')('TRANSACTION');
const {WriteDbOperations} = require('../constants');
const ChainUtil = require('../chain-util');

class Transaction {
  constructor(txBody, signature) {
    this.tx_body = JSON.parse(JSON.stringify(txBody));
    this.signature = signature;

    if (!Transaction.hasRequiredFields(this.tx_body)) {
      logger.info(
          `Transaction body with missing timestamp, operation or nonce: ` +
          `${JSON.stringify(this.tx_body)}`);
      return null;
    }
    // TODO(seo): Enable stricter input format checking.
    // const sanitized = Transaction.sanitizeTxBody(this.tx_body);
    // if (JSON.stringify(sanitized) !== JSON.stringify(this.tx_body)) {
    //   logger.info(`Transaction body in non-standard format: ${JSON.stringify(this.tx_body)}`);
    //   return null;
    // }

    Object.assign(this, JSON.parse(JSON.stringify(this.tx_body)));
    this.hash = '0x' + ainUtil.hashTransaction(this.tx_body).toString('hex');

    // Workaround for the transaction verification.
    if (this.tx_body.address !== undefined) {
      this.address = this.tx_body.address;
      this.skip_verif = true;
    } else {
      this.address = Transaction.getAddress(this.hash.slice(2), this.signature);
    }

    logger.debug(`CREATED TRANSACTION: ${JSON.stringify(this)}`);
  }

  static signTxBody(inputTxBody, privateKey) {
    const txBody = JSON.parse(JSON.stringify(inputTxBody));
    txBody.timestamp = Date.now();
    // Workaround for the transaction verification.
    const signature = txBody.address !== undefined ?
        '' : ainUtil.ecSignTransaction(txBody, Buffer.from(privateKey, 'hex'));
    return new Transaction(txBody, signature);
  }

  toString() {
    // TODO (lia): change JSON.stringify to 'fast-json-stable-stringify' or add
    // an utility function to ain-util.
    return `hash:       ${this.hash},
            nonce:      ${this.tx_body.nonce},
            timestamp:  ${this.tx_body.timestamp},
            operation:  ${JSON.stringify(this.tx_body.operation)},
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
   * Sanitize transaction body.
   */
  static sanitizeTxBody(txBody) {
    const sanitized = {
      nonce: ChainUtil.numberOrZero(txBody.nonce),
      timestamp: ChainUtil.numberOrZero(txBody.timestamp),
      operation: Transaction.sanitizeOperation(txBody.operation),
    };
    if (txBody.parent_tx_hash !== undefined) {
      sanitized.parent_tx_hash = ChainUtil.stringOrEmpty(txBody.parent_tx_hash);
    }
    return sanitized;
  }

  static verifyTransaction(tx) {
    if (tx.operation.type !== undefined &&
        Object.keys(WriteDbOperations).indexOf(tx.operation.type) === -1) {
      logger.info(`Invalid transaction type: ${tx.operation.type}`);
      return false;
    }
    // Workaround for the transaction verification.
    if (tx.skip_verif) {
      logger.info('Skip verifying signature for transaction: ' +
          JSON.stringify(tx, null, 2));
      return true;
    }
    return ainUtil.ecVerifySig(tx.tx_body, tx.signature, tx.address);
  }

  static hasRequiredFields(txBody) {
    return txBody.timestamp !== undefined && txBody.nonce !== undefined &&
        txBody.operation !== undefined;
  }

  static isBatchTxBody(txBody) {
    return Array.isArray(txBody.tx_list);
  }

  static isBatchTransaction(tx) {
    return Array.isArray(tx.tx_list);
  }
}

module.exports = Transaction;
