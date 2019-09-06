const ChainUtil = require('../chain-util');
const { OperationTypes } = require('../constants');

class Transaction {
  constructor(timestamp, operation, address, signature, nonce) {
    this.id = ChainUtil.id();
    this.timestamp = timestamp;
    this.operation = operation;
    this.address = address;
    this.signature = signature;
    this.nonce = nonce;
    this.hash = ChainUtil.hash(this.operation);
  }

  toString() {
    return `id:        ${this.id},
            timestamp: ${this.timestamp},
            operation: ${JSON.stringify(this.operation)},
            address:   ${this.address},
            nonce:     ${this.nonce}
        `;
  }

  static newTransaction(db, operation, isNoncedTransaction = true) {
    let nonce;
    if (operation.nonce !== undefined) {
      nonce = operation.nonce;
      delete operation.nonce;
    } else if (isNoncedTransaction) {
      nonce = db.nonce;
      db.nonce ++;
    } else {
      nonce = -1;
    }
    const address = operation.address !== undefined ? operation.address : db.publicKey;
    const signature = operation.address !== undefined ? '' : db.sign(ChainUtil.hash(operation));
    if (operation.address !== undefined) {
      delete operation.address;
    }
    return new this(Date.now(), operation, address, signature, nonce);
  }

  static verifyTransaction(transaction) {
    if ((Object.keys(OperationTypes).indexOf(transaction.operation.type) < 0)) {
      console.log(`Invalid transaction type ${transaction.operation.type}.`);
      return false;
    }
    return ChainUtil.verifySignature(
        transaction.address, transaction.signature, ChainUtil.hash(transaction.operation)
    );
  }
}

module.exports = Transaction;
