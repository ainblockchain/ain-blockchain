const ChainUtil = require('../chain-util');
const {DbOperations} = require('../constants');

class Transaction {
  constructor(timestamp, data, address, signature, nonce) {
    this.id = ChainUtil.id();
    this.timestamp = timestamp;
    this.output = data;
    this.address = address;
    this.signature = signature;
    this.nonce = nonce;
  }

  toString() {
    return `id:        ${this.id},
            timestamp: ${this.timestamp},
            output:    ${JSON.stringify(this.output)},
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
    const signature = data.address != undefined ? "" : db.sign(ChainUtil.hash(data));
    if (data.address != undefined) {
      delete data.address;
    }
    const transaction =
        new this(Date.now(), data, address, signature, nonce);
    return transaction;
  }

  static verifyTransaction(transaction) {
    if ((Object.keys(DbOperations).indexOf(transaction.output.type) < 0)) {
      console.log(`Invalid transaction type ${transaction.output.type}.`);
      return false;
    }
    return ChainUtil.verifySignature(
        transaction.address, transaction.signature, ChainUtil.hash(transaction.output)
    );
  }
}

module.exports = Transaction;
