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

    const unsanitizedData = JSON.parse(JSON.stringify(transactionWithSig.transaction ?
          transactionWithSig.transaction : transactionWithSig));
    let transactionData = {
      nonce: unsanitizedData.nonce,
      timestamp: unsanitizedData.timestamp,
      operation: unsanitizedData.operation
    }
    if (unsanitizedData.parent_tx_hash !== undefined) {
      transactionData.parent_tx_hash = unsanitizedData.parent_tx_hash
    }
    // Workaround for skip_verif with custom address
    if (unsanitizedData.skip_verif !== undefined) {
      this.skip_verif = unsanitizedData.skip_verif;
    }
    Object.assign(this, transactionData);
    this.hash = ainUtil.hashTransaction(transactionData).toString('hex');
    // Workaround for skip_verif with custom address
    this.address = unsanitizedData.address !== undefined ? unsanitizedData.address :
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
        { operation: this.operation, nonce: this.nonce, timestamp: this.timestamp },
        this.parent_tx_hash !== undefined ? { parent_tx_hash: this.parent_tx_hash } : {}
      );
  }

  static newTransaction(db, operation, isNoncedTransaction = true) {
    let transaction = { operation };
    // Workaround for skip_verif with custom address
    if (operation.skip_verif !== undefined) {
      transaction.skip_verif = operation.skip_verif;
      delete transaction.operation.skip_verif;
    }
    if (operation.address !== undefined) {
      transaction.address = operation.address;
      delete transaction.operation.address;
    }
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
    // Workaround for skip_verif with custom address
    const signature = transaction.address !== undefined ? '' :
        ainUtil.ecSignTransaction(transaction, ainUtil.toBuffer(db.keyPair.priv));
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
        transaction.operation !== undefined && transaction.nonce !== undefined
  }
}

module.exports = Transaction;
