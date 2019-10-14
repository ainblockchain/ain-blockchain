const { OperationTypes, DEBUG } = require('../constants');
const ainUtil = require('@ainblockchain/ain-util');

class Transaction {
  constructor(txWithSig) {
    this.signature = txWithSig.signature;

    if (!Transaction.checkRequiredFields(txWithSig.transaction ? txWithSig.transaction :
        txWithSig)) {
      throw new Error('Transaction must contain timestamp, operation and nonce fields');
    }

    const txData = JSON.parse(JSON.stringify(txWithSig.transaction ?
        txWithSig.transaction : txWithSig));
    const sanitizedTxData = Transaction.sanitizeTxData(txData);
    // Workaround for skip_verif with custom address
    if (txData.skip_verif !== undefined) {
      this.skip_verif = txData.skip_verif;
    }
    Object.assign(this, sanitizedTxData);
    this.hash = ainUtil.hashTransaction(sanitizedTxData).toString('hex');
    // Workaround for skip_verif with custom address
    this.address = txData.address !== undefined ? txData.address :
        Transaction.getAddress(this.hash, this.signature);

    if (DEBUG) {
      console.log(`CREATING TRANSACTION: ${JSON.stringify(this)}`);
    }
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
   * Sanitize op_list of GET operation.
   */
  static sanitizeGetOpList(opList) {
    const sanitized = [];
    if (Array.isArray(opList)) {
      opList.forEach((item) => {
        const type = item.type ? item.type : OperationTypes.GET_VALUE;
        if (type === OperationTypes.GET_VALUE || type === OperationTypes.GET_RULE ||
            type === OperationTypes.GET_OWNER) {
          sanitized.push({ type, ref: item.ref });
        }
      });
    }
    return sanitized;
  }

  /**
   * Sanitize op_list of SET operation.
   */
  static sanitizeSetOpList(opList) {
    const sanitized = [];
    if (Array.isArray(opList)) {
      opList.forEach((item) => {
        const type = item.type ? item.type : OperationTypes.SET_VALUE;
        if (type === OperationTypes.SET_VALUE || type === OperationTypes.INC_VALUE ||
            type === OperationTypes.DEC_VALUE || type === OperationTypes.SET_RULE ||
            type === OperationTypes.SET_OWNER) {
          sanitized.push({ type, ref: item.ref, value: item.value });
        }
      });
    }
    return sanitized;
  }

  /**
   * Sanitize tx_list of BATCH operation.
   */
  static sanitizeTxList(txList) {
    // TODO(seo): Fill this out after BATCH operation is refactored.
    return txList;
  }

  /**
   * Sanitize operation.
   */
  static sanitizeOperation(op) {
    const sanitized = {}
    switch(op.type) {
      case OperationTypes.GET_VALUE:
      case OperationTypes.GET_RULE:
      case OperationTypes.GET_OWNER:
        sanitized.ref = op.ref;
        break;
      case OperationTypes.GET:
        sanitized.op_list = this.sanitizeGetOpList(op.op_list);
        break;
      case OperationTypes.SET_VALUE:
      case OperationTypes.INC_VALUE:
      case OperationTypes.DEC_VALUE:
      case OperationTypes.SET_RULE:
      case OperationTypes.SET_OWNER:
        sanitized.ref = op.ref;
        sanitized.value = op.value;
        break;
      case OperationTypes.SET:
        sanitized.op_list = this.sanitizeSetOpList(op.op_list);
        break;
      case OperationTypes.BATCH:
        sanitized.tx_list = this.sanitizeTxList(op.tx_list);
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

  static newTransaction(privateKey, txData) {
    const transaction = JSON.parse(JSON.stringify(txData));
    transaction.timestamp = Date.now();
    // Workaround for skip_verif with custom address
    const signature = transaction.address !== undefined ? '' :
        ainUtil.ecSignTransaction(transaction, ainUtil.toBuffer(privateKey));
    return new this({ signature, transaction });
  }

  static verifyTransaction(transaction) {
    if ((Object.keys(OperationTypes).indexOf(transaction.operation.type) < 0)) {
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

  static checkRequiredFields(transaction) {
    return transaction.timestamp !== undefined &&
        transaction.operation !== undefined && transaction.nonce !== undefined;
  }
}

module.exports = Transaction;
