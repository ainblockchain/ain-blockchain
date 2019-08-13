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
    if (isNoncedTransaction) {
      nonce = db.nonce;
      db.nonce ++;
    } else if (data.nonce) {
      nonce = data.nonce;
    } else {
      nonce = -1;
    }
    const transaction =
        new this(Date.now(), data, data.address ? data.address : db.publicKey,
            db.sign(ChainUtil.hash(data)), nonce);
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
