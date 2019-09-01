const ChainUtil = require('../chain-util');
const {DbOperations} = require('../constants');

class Transaction {
  constructor(timestamp, data, address, signature, nonce) {
    this.id = ChainUtil.id();
    this.timestamp = timestamp;
    this.operation = data;
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

  static newTransaction(db, data, isNoncedTransaction = true) {
    let nonce;
    if (data.nonce !== undefined) {
      nonce = data.nonce;
      delete data.nonce;
    } else if (isNoncedTransaction) {
      nonce = db.nonce;
      db.nonce ++;
    } else {
      nonce = -1;
    }
    const address = data.address != undefined ? data.address : db.publicKey;
    const signature = data.address != undefined ? '' : db.sign(ChainUtil.hash(data));
    if (data.address != undefined) {
      delete data.address;
    }
    return new this(Date.now(), data, address, signature, nonce);
  }

  static verifyTransaction(transaction) {
    if ((Object.keys(DbOperations).indexOf(transaction.operation.type) < 0)) {
      console.log(`Invalid transaction type ${transaction.operation.type}.`);
      return false;
    }
    return ChainUtil.verifySignature(
        transaction.address, transaction.signature, ChainUtil.hash(transaction.operation)
    );
  }
}

module.exports = Transaction;
