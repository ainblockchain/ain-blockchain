const Transaction = require('./transaction');
const { DEBUG } = require('../constants');

class TransactionPool {
  constructor() {
    // MUST IMPLEMENT WAY TO RESET NONCE WHEN TRANSACTION IS LOST IN NETWORK
    this.transactions = {};
    this.nonceTracker = {};
  }

  addTransaction(transaction) {
    // Quick verification of transaction on entry
    // TODO (lia): pull verification out to the very front
    // (closer to the communication layers where nodes first receives transactions)
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
    if (DEBUG) {
      console.log(`ADDING: ${JSON.stringify(transaction)}`);
    }
    return true;
  }

  isAlreadyAdded(transaction) {
    return Boolean((transaction.address in this.transactions) &&
            (this.transactions[transaction.address].find((trans) => trans.hash === transaction.hash) !== undefined)) ||
            (transaction.nonce > 0 && Boolean(transaction.nonce <= this.nonceTracker[transaction.address]));
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
      const tempNonceTracker = JSON.parse(JSON.stringify(this.nonceTracker));
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
    const transactionHashes = block.data.map((transaction) => {
      if (transaction.nonce >= 0) {
        // Update nonceTracker while extracting transaction hashes
        this.nonceTracker[transaction.address] = transaction.nonce;
      }
      return transaction.hash;
    });

    for (const address in this.transactions) {
      this.transactions[address] = this.transactions[address].filter((transaction) => {
        if (transactionHashes.indexOf(transaction.hash) < 0) {
          return transaction;
        }
      });

      if (this.transactions[address].length === 0) {
        delete this.transactions[address];
      }
    }
  }
}

module.exports = TransactionPool;
