const { WriteDbOperations, DEBUG } = require('../constants');
const ainUtil = require('@ainblockchain/ain-util');

// TODO(seo): Remove 'txWithSig.transaction ?' use cases.
class Transaction {
  constructor(txWithSig) {
    this.signature = txWithSig.signature;

    const transaction = txWithSig.transaction ? txWithSig.transaction : txWithSig;
    if (!Transaction.hasRequiredFields(transaction)) {
      console.log('Transaction must contain timestamp, operation and nonce fields: ' + JSON.stringify(transaction));
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
    this.address = txData.address !== undefined ? txData.address :
        Transaction.getAddress(this.hash.slice(2), this.signature);

    if (DEBUG) {
      console.log(`CREATING TRANSACTION: ${JSON.stringify(this)}`);
    }
  }

  static newTransaction(privateKey, txData) {
    const transaction = JSON.parse(JSON.stringify(txData));
    transaction.timestamp = Date.now();
    // Workaround for skip_verif with custom address
    const signature = transaction.address !== undefined ? '' :
        ainUtil.ecSignTransaction(transaction, ainUtil.toBuffer(privateKey));
    return new this({ signature, transaction });
  }

  toString() {
    // TODO (lia): change JSON.stringify to 'fast-json-stable-stringify' or add
    // an utility function to ain-util.
    return `hash:       ${this.hash},
            nonce:      ${this.nonce},
            timestamp:  ${this.timestamp},
            operation:  ${JSON.stringify(this.operation)},
            address:    ${this.address},
            ${this.parent_tx_hash !== undefined ? 'parent_tx_hash: '+this.parent_tx_hash : ''}
        `;
  }

  /**
   * Gets address from hash and signature.
   */
  static getAddress(hash, signature) {
    const sigBuffer = ainUtil.toBuffer(signature);
    const len = sigBuffer.length;
    const lenHash = len - 65;
    const { r, s, v } = ainUtil.ecSplitSig(sigBuffer.slice(lenHash, len));
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
   * Sanitize op_list of SET operation.
   */
  static sanitizeSetOpList(opList) {
    const sanitized = [];
    if (Array.isArray(opList)) {
      opList.forEach((op) => {
        const sanitizedOp = { ref: op.ref, value: op.value };
        if (op.type === WriteDbOperations.SET_VALUE || op.type === WriteDbOperations.INC_VALUE ||
            op.type === WriteDbOperations.DEC_VALUE || op.type === WriteDbOperations.SET_RULE ||
            op.type === WriteDbOperations.SET_OWNER) {
          sanitizedOp.type = op.type;
        }
        sanitized.push(sanitizedOp);
      });
    }
    return sanitized;
  }

  /**
   * Sanitize operation.
   */
  static sanitizeOperation(op) {
    const sanitized = {}
    switch(op.type) {
      case undefined:
      case WriteDbOperations.SET_VALUE:
      case WriteDbOperations.INC_VALUE:
      case WriteDbOperations.DEC_VALUE:
      case WriteDbOperations.SET_RULE:
      case WriteDbOperations.SET_OWNER:
        sanitized.ref = op.ref;
        sanitized.value = op.value;
        break;
      case WriteDbOperations.SET:
        sanitized.op_list = this.sanitizeSetOpList(op.op_list);
        break;
      default:
        return sanitized;
    }
    sanitized.type = op.type;
    return sanitized;
  }

  /**
   * Sanitize transaction data.
   */
  static sanitizeTxData(txData) {
    const sanitized = {
      nonce: txData.nonce,
      timestamp: txData.timestamp,
      operation: Transaction.sanitizeOperation(txData.operation),
    };
    if (txData.parent_tx_hash !== undefined) {
      sanitized.parent_tx_hash = txData.parent_tx_hash;
    }
    return sanitized;
  }

  static verifyTransaction(transaction) {
    if ((Object.keys(WriteDbOperations).indexOf(transaction.operation.type) === -1)) {
      console.log(`Invalid transaction type ${transaction.operation.type}.`);
      return false;
    }
    // Workaround for skip_verif with custom address
    if (transaction.skip_verif) {
      console.log('Skip verifying signature for transaction: ' + JSON.stringify(transaction, null, 2));
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
