const ChainUtil = require('../chain-util');
const { OperationTypes, DEBUG } = require('../constants');

class Transaction {
  constructor(id, timestamp, operation, address, signature, nonce) {
    this.id = id;
    this.timestamp = timestamp;
    this.operation = operation;
    this.address = address;
    this.signature = signature;
    this.nonce = nonce;
    this.hash = Transaction.hashTransaction(this);
    if (DEBUG) {
      console.log(`CREATING TRANSACTION: ${JSON.stringify(this)}`);
    }
  }

  toString() {
    return `id:        ${this.id},
            timestamp: ${this.timestamp},
            operation: ${JSON.stringify(this.operation)},
            address:   ${this.address},
            nonce:     ${this.nonce}
        `;
  }

  static hashTransaction(transaction) {
    return ChainUtil.hash(JSON.stringify({timestamp: transaction.timestamp, nonce: transaction.nonce, address: transaction.addresss, operation: transaction.operation, id: transaction.id}));
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
    const id = ChainUtil.id();
    const timestamp = Date.now();
    const address = operation.address !== undefined ? operation.address : db.publicKey;
    const signature = operation.address !== undefined ? '' : db.sign(Transaction.hashTransaction({timestamp, operation, address, nonce, id}));
    if (operation.address !== undefined) {
      delete operation.address;
    }
    return new this(id, timestamp, operation, address, signature, nonce);
  }

  static verifyTransaction(transaction) {
    if ((Object.keys(OperationTypes).indexOf(transaction.operation.type) < 0)) {
      console.log(`Invalid transaction type ${transaction.operation.type}.`);
      return false;
    }
    return ChainUtil.verifySignature(
        transaction.address, transaction.signature, Transaction.hashTransaction(transaction)
    );
  }
}

module.exports = Transaction;
