const ChainUtil = require('../chain-util');
const Transaction = require('./transaction');
const InvalidPermissionsError = require('../errors');
const {DbOperations} = require('../constants');

class DB {
  constructor() {
    this.db = {};
    this.keyPair = ChainUtil.genKeyPair();
    this.publicKey = this.keyPair.getPublic().encode('hex');
    this.nonce = 0;
    console.log(`creating new db with id ${this.publicKey}`);
  }

  static getDatabase(blockchain, tp) {
    const db = new DB();
    blockchain.setBackDb(new BackUpDB(db.keyPair));
    db.reconstruct(blockchain, tp);
    return db;
  }

  get(queryPath) {
    const listQueryPath = ChainUtil.queryParser(queryPath);

    if (listQueryPath.length < 1) {
      return this.db;
    }
    let result = this.db;
    try {
      listQueryPath.forEach(function(key) {
        result = result[key];
      });
    } catch (error) {
      if (error instanceof TypeError) {
        return null;
      }
      throw error;
    }
    return result ? JSON.parse(JSON.stringify(result)) : null;
  }

  stake(stakeAmount) {
    return this.set(['stakes', this.publicKey].join('/'), stakeAmount);
  }

  set(queryPath, value, auth, timestamp) {
    let valueCopy;
    const listQueryPath = ChainUtil.queryParser(queryPath);
    // TODO: Find a better way to manage seeting of rules than this dodgy condition
    // In future should be able to accomidate other types of rules beyoned wrie
    if (!(listQueryPath.length === 1 && listQueryPath[0] === 'rules')
        && this.getPermissions(listQueryPath, auth, timestamp, '.write', value)
         == false) {
      throw new
      InvalidPermissionsError(`Invalid set permissons for ${queryPath}`);
    }

    if (ChainUtil.isDict(value)) {
      valueCopy = JSON.parse(JSON.stringify(value));
    } else {
      valueCopy = value;
    }
    if (listQueryPath.length < 1) {
      this.db = valueCopy;
    } else if (listQueryPath.length == 1) {
      this.db[listQueryPath[0]] = valueCopy;
    } else {
      const pathToKey = listQueryPath.splice(0, listQueryPath.length - 1);
      const refKey = listQueryPath[listQueryPath.length - 1];
      this._forcePath(pathToKey)[refKey] = valueCopy;
    }
    return true;
  }

  update(data, auth, timestamp) {
    for (const key in data) {
      this.set(key, data[key], auth, timestamp);
    }
    return true;
  }

  batch(batchList, auth, timestamp) {
    const resultList = [];
    batchList.forEach((item) => {
      if (item.op === 'set') {
        resultList
            .push(this.set(item.ref, item.value, auth, timestamp));
      } else if (item.op === 'increase') {
        resultList
            .push(this.increase(item.diff, auth, timestamp));
      } else if (item.op === 'get') {
        resultList
            .push(this.get(item.ref, auth, timestamp));
      } else if (item.op === 'update') {
        resultList
            .push(this.update(item.data, auth, timestamp));
      } else if (item.op === 'batch') {
        resultList
            .push(this.batch(item.batch_list, auth, timestamp));
      }
    });
    return resultList;
  }

  _forcePath(listQueryPath) {
    // Returns reference to provided path if exists, otherwise creates path
    let subDb = this.db;
    listQueryPath.forEach((key) => {
      if ((!ChainUtil.isDict(subDb[key])) || (!(key in subDb))) {
        subDb[key] = {};
      }
      subDb = subDb[key];
    });
    return subDb;
  }

  increase(diff, auth, timestamp) {
    for (const k in diff) {
      if (this.get(k, auth) && typeof this.get(k, auth) != 'number') {
        // TODO: Raise error here
        return {code: -1, error_message: 'Not a number type: ' + k};
      }
    }
    const results = {};
    for (const k in diff) {
      const result = (this.get(k, auth) || 0) + diff[k];
      this.set(k, result, auth, timestamp);
      results[k] = result;
    }
    return results;
  }

  /**
    * Validates transaction is valid according to AIN database rules and returns a transaction instance
    *
    * @param {dict} data - Database write request to be converted to transaction
    * @return {Transaction} Instance of the transaction class
    * @throws {InvalidPermissionsError} InvalidPermissionsError when database rules don't allow the transaction
    */
  createTransaction(data, isNoncedTransaction = true) {
    return Transaction.newTransaction(this, data, isNoncedTransaction);
  }

  sign(dataHash) {
    return this.keyPair.sign(dataHash);
  }

  reconstruct(blockchain, transactionPool) {
    console.log('Reconstructing database');
    this.setDBToBackUp(blockchain.backUpDB);
    this.createDatabase(blockchain);
    this.addTransactionPool(transactionPool.validTransactions());
  }

  createDatabase(blockchain) {
    blockchain.chain.forEach((block) => {
      this.executeBlockTransactions(block);
    });
  }

  executeBlockTransactions(block) {
    block.data.forEach((transaction) =>{
      this.execute(transaction.output, transaction.address, transaction.timestamp);
    });
  }

  addTransactionPool(transactions) {
    console.log(JSON.stringify(transactions));
    transactions.forEach((trans) => {
      this.execute(trans.output, trans.address, trans.timestamp);
    });
  }

  setDBToBackUp(backUpDB) {
    if (this.publicKey === backUpDB.publicKey) {
      this.db = JSON.parse(JSON.stringify(backUpDB.db));
    }
  }

  execute(transaction, address, timestamp) {
    switch (transaction.type) {
      case DbOperations.SET:
        return this.set(transaction.ref, transaction.value, address, timestamp);
      case DbOperations.INCREASE:
        return this.increase(transaction.diff, address, timestamp);
      case DbOperations.UPDATE:
        return this.update(transaction.data, address, timestamp);
      case DbOperations.BATCH:
        return this.batch(transaction.batch_list, address, timestamp);
    }
  }

  getPermissions(queryPath, auth, timestamp, permissionQuery, newValue=null) {
    let lastRuleSet;
    auth = auth || this.publicKey;
    timestamp = timestamp || Date.now();
    let rule = false;
    const wildCards = {};
    let currentRuleSet = this.db['rules'];
    let i = 0;
    do {
      if (permissionQuery in currentRuleSet) {
        rule = currentRuleSet[permissionQuery];
      }
      lastRuleSet = currentRuleSet;
      currentRuleSet = currentRuleSet[queryPath[i]];
      if (!currentRuleSet && queryPath[i]) {
        // If no rule set is available for specific key, check for wildcards
        const keys = Object.keys(lastRuleSet);
        for (let j=0; j<keys.length; j++) {
          if (keys[j].startsWith('$')) {
            wildCards[keys[j]] = queryPath[i];
            currentRuleSet = lastRuleSet[keys[j]];
          }
        }
      }
      i++;
    } while (currentRuleSet && i <= queryPath.length);

    if (typeof rule === 'string') {
      rule = this.verifyAuth(rule, wildCards, queryPath, newValue, auth, timestamp);
    }

    return rule;
  }


  verifyAuth(ruleString, wildCards, queryPath, newValue, auth, timestamp) {
    if (ruleString.includes('auth')) {
      ruleString = ruleString.replace(/auth/g, `'${auth}'`);
    }
    if (Object.keys(wildCards).length > 0) {
      for (const wildCard in wildCards) {
        if (ruleString.includes(wildCard)) {
          // May need to come back here to figure out how to change ALL occurrences of wildCards
          ruleString = ruleString.replace(wildCard, `${wildCards[wildCard]}`);
        }
      }
    }
    if (ruleString.includes('newData')) {
      ruleString = ruleString.replace(/newData/g, JSON.stringify(newValue));
    }
    if (ruleString.includes('currentTime')) {
      ruleString = ruleString.replace(/currentTime/g, timestamp);
    }
    if (ruleString.includes('oldData')) {
      ruleString =
        ruleString.replace(/oldData/g, this.get(queryPath.join('/')));
    }
    if (ruleString.includes('db.get')) {
      ruleString = ruleString.replace(/db.get/g, 'this.get');
    }

    const permission = eval(ruleString);
    if (!permission) {
      console.log(`"${ruleString}" evaluated as false`);
    }
    return permission;
  }
}

class BackUpDB extends DB {
  constructor(keyPair) {
    super();
    this.keyPair = keyPair;
    this.publicKey = this.keyPair.getPublic().encode('hex');
  }
}

module.exports = DB;

