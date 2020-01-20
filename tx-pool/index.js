const {DEBUG, TransactionStatus} = require('../constants');
const Transaction = require('./transaction');

class TransactionPool {
  constructor() {
    // MUST IMPLEMENT WAY TO RESET NONCE WHEN TRANSACTION IS LOST IN NETWORK
    this.transactions = {};
    this.committedNonceTracker = {};
    this.pendingNonceTracker = {};
    // TODO (lia): do not store txs in the pool
    // (they're already tracked by this.transactions..)
    this.transactionTracker = {};
  }

  addTransaction(transaction) {
    // Quick verification of transaction on entry
    // TODO (lia): pull verification out to the very front
    // (closer to the communication layers where the node first receives transactions)
    if (!Transaction.verifyTransaction(transaction)) {
      console.log('Invalid transaction');
      if (DEBUG) {
        console.log(`NOT ADDING: ${JSON.stringify(transaction)}`);
      }
      return false;
    }

    if (!(transaction.address in this.transactions)) {
      this.transactions[transaction.address] = [];
    }
    this.transactions[transaction.address].push(transaction);
    const status = TransactionStatus.POOL_STATUS;
    const address = transaction.address;
    const index = this.transactions[transaction.address].length - 1;
    this.transactionTracker[transaction.hash] = { status, address, index };
    if (transaction.nonce >= 0 && (!(address in this.pendingNonceTracker) ||
        transaction.nonce > this.pendingNonceTracker[address])) {
      this.pendingNonceTracker[address] = transaction.nonce;
    }

    if (DEBUG) {
      console.log(`ADDING: ${JSON.stringify(transaction)}`);
    }
    return true;
  }

  isNotEligibleTransaction(transaction) {
    return ((transaction.address in this.transactions) &&
            (this.transactions[transaction.address].find((trans) => trans.hash === transaction.hash) !== undefined)) ||
            (transaction.nonce >= 0 && transaction.nonce <= this.committedNonceTracker[transaction.address]) ||
            (transaction.nonce < 0 && transaction.hash in this.transactionTracker);
  }

  validTransactions() {
    // Transactions are first ordered by nonce in their individual lists by publicKey
    const unvalidatedTransactions = JSON.parse(JSON.stringify(this.transactions));
    for (const address in unvalidatedTransactions) {
      // Order by noncing if transactions are nonced, else by timestamp
      unvalidatedTransactions[address].sort((a, b) => (a.nonce < 0 || b.nonce < 0) ?
            ((a.timestamp > b.timestamp) ? 1 : ((b.timestamp > a.timestamp) ? -1 : 0)) :
                (a.nonce > b.nonce) ? 1 : ((b.nonce > a.nonce) ? -1 : 0));
    }
    // Secondly transaction are combined and ordered by timestamp, while still remaining ordered noncing from the initial sort by nonce
    const orderedUnvalidatedTransactions = Object.values(unvalidatedTransactions);
    while (orderedUnvalidatedTransactions.length > 1) {
      const tempNonceTracker = JSON.parse(JSON.stringify(this.committedNonceTracker));
      const list1 = orderedUnvalidatedTransactions.shift();
      const list2 = orderedUnvalidatedTransactions.shift();
      const newList = [];
      let listToTakeValue;
      while (list1.length + list2.length > 0) {
        if ((list2.length == 0 || (list1.length > 0 && list1[0].timestamp <= list2[0].timestamp))) {
          listToTakeValue = list1;
        } else {
          listToTakeValue = list2;
        }
        if (listToTakeValue[0].nonce === tempNonceTracker[listToTakeValue[0].address] + 1) {
          tempNonceTracker[listToTakeValue[0].address] = listToTakeValue[0].nonce;
          newList.push(listToTakeValue.shift());
        } else if (!(listToTakeValue[0].address in tempNonceTracker) && listToTakeValue[0].nonce === 0) {
          tempNonceTracker[listToTakeValue[0].address] = 0;
          newList.push(listToTakeValue.shift());
        } else if (listToTakeValue[0].nonce < 0) {
          newList.push(listToTakeValue.shift());
        } else {
          const invalidNoncedTransaction = listToTakeValue.shift();
          console.log('Dropping transactions!: ' + JSON.stringify(invalidNoncedTransaction));
        }
      }

      orderedUnvalidatedTransactions.push(newList);
    }
    return orderedUnvalidatedTransactions.length > 0 ? orderedUnvalidatedTransactions[0]: [];
  }

  removeCommitedTransactions(block) {
    // Remove transactions of newly added block to blockchain from the current transaction pool
    const transactionHashes = [];
    let transaction;
    for (let i = 0; i < block.transactions.length; i++) {
      transaction = block.transactions[i];
      if (transaction.nonce >= 0) {
        // Update nonceTracker while extracting transaction hashes
        this.committedNonceTracker[transaction.address] = transaction.nonce;
      }
      const status = TransactionStatus.BLOCK_STATUS;
      const number = block.number;
      const index = i;
      this.transactionTracker[transaction.hash] = { status, number, index };
      transactionHashes.push(transaction.hash);
    }

    for (const address in this.transactions) {
      this.transactions[address] = this.transactions[address].filter((transaction) => {
        return transactionHashes.indexOf(transaction.hash) < 0
      });

      if (this.transactions[address].length === 0) {
        delete this.transactions[address];
      } else {
        this.transactions[address].forEach((transaction) => {
          this.transactionTracker[transaction.hash].index = this.transactions[address].indexOf(transaction);
        });
      }
    }
  }

  updateCommittedNonces(transactions) {
    let len = transactions.length;
    for (let i = 0; i < len; i++) {
      const tx = transactions[i];
      if (tx.nonce >= 0 && (this.committedNonceTracker[tx.address] === undefined ||
                            this.committedNonceTracker[tx.address] < tx.nonce)) {
        this.committedNonceTracker[tx.address] = tx.nonce;
      }
    }
  }
}

module.exports = TransactionPool;
