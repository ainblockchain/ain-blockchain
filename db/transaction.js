const ChainUtil = require('../chain-util');
const { OperationTypes, DEBUG } = require('../constants');
const ainUtil = require('@ainblockchain/ain-util');

class Transaction {
  constructor(transactionWithSig) {
    this.signature = transactionWithSig.signature;

    if (!Transaction.checkRequiredFields(transactionWithSig.transaction ?
          transactionWithSig.transaction : transactionWithSig)) {
      throw new Error("Transaction must contain timestamp, operation and nonce fields")
    }

    let transactionData = JSON.parse(JSON.stringify(transactionWithSig.transaction ?
          transactionWithSig.transaction : transactionWithSig));
    if (transactionData.hash !== undefined) delete transactionData.hash;
    if (transactionData.address !== undefined) delete transactionData.address;
    if (transactionData.signature !== undefined) delete transactionData.signature;
    Object.assign(this, transactionData);
    this.hash = ainUtil.hashTransaction(transactionData).toString('hex');

    const sigBuffer = ainUtil.toBuffer(this.signature);
    const len = sigBuffer.length;
    const lenHash = len - 65;
    const hashedData = sigBuffer.slice(0, lenHash);
    const { r, s, v } = ainUtil.ecSplitSig(sigBuffer.slice(lenHash, len));
    const publicKey = ainUtil.ecRecoverPub(Buffer.from(this.hash,'hex'), r, s, v);
    this.address = ainUtil.toChecksumAddress(ainUtil.bufferToHex(
        ainUtil.pubToAddress(publicKey, publicKey.length === 65)));

    if (DEBUG) {
      console.log("CREATING TRANSACTION: ",this);
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
  * Returns the data object used for signing the transaction.
  */
  get signingData() {
    return Object.assign(
        { operation: this.operation, nonce: this.nonce, timestamp: this.timestamp },
        this.parent_tx_hash !== undefined ? { parent_tx_hash: this.parent_tx_hash } : {}
      );
  }

  static newTransaction(db, operation, isNoncedTransaction = true) {
    let transaction = { operation };
    if (operation.nonce !== undefined) {
      transaction.nonce = operation.nonce;
      delete transaction.operation.nonce;
    } else if (isNoncedTransaction) {
      transaction.nonce = db.nonce;
      db.nonce ++;
    } else {
      transaction.nonce = -1;
    }
    transaction.timestamp = Date.now();
    const signature = ainUtil.ecSignTransaction(transaction, ainUtil.toBuffer(db.keyPair.priv));
    if (operation.address !== undefined) {
      delete operation.address;
    }
    return new this({ signature, transaction });
  }

  static verifyTransaction(transaction) {
    if ((Object.keys(OperationTypes).indexOf(transaction.operation.type) < 0)) {
      console.log(`Invalid transaction type ${transaction.operation.type}.`);
      return false;
    }
    return ainUtil.ecVerifySig(transaction.signingData, transaction.signature, transaction.address);
  }

  static checkRequiredFields(transaction) {
    return transaction.timestamp !== undefined &&
        transaction.operation !== undefined && transaction.nonce !== undefined
  }
}

module.exports = Transaction;
