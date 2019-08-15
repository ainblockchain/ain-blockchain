const ChainUtil = require('../chain-util');
const Transaction = require('./transaction');
const BuiltInFunctions = require('./built-in-functions');
const InvalidPermissionsError = require('../errors');
const {DbOperations} = require('../constants');

class DB {
  constructor() {
    this.db = {};
    this.func = new BuiltInFunctions(this);
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

  get(dbPath) {
    const parsedPath = ChainUtil.queryParser(dbPath);

    if (parsedPath.length === 0) {
      return this.db;
    }
    let result = this.db;
    try {
      parsedPath.forEach(function(key) {
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

  set(dbPath, value, address, timestamp) {
    const parsedPath = ChainUtil.queryParser(dbPath);
    // TODO: Find a better way to manage seeting of rules than this dodgy condition
    // In future should be able to accomidate other types of rules beyoned wrie
    if (!(parsedPath.length === 1 && parsedPath[0] === 'rules')
        && this.getPermissions(parsedPath, address, timestamp, '.write', value)
         == false) {
      throw new
      InvalidPermissionsError(`Invalid set permissons for ${dbPath}`);
    }
    const valueCopy = ChainUtil.isDict(value) ? JSON.parse(JSON.stringify(value)) : value;
    this.setWithPermission(dbPath, valueCopy);
    if (parsedPath.length > 0 && parsedPath[0] === 'transfer') {
      const context = {
        params: {
          dbPath,
          from: 'abcd',
          to: 'efgh'
        }
      };
      this.func.transfer(valueCopy, context);
    }
    return true;
  }

  setWithPermission(dbPath, value) {
    const parsedPath = ChainUtil.queryParser(dbPath);
    if (parsedPath.length === 0) {
      this.db = value;
    } else if (parsedPath.length === 1) {
      this.db[parsedPath[0]] = value;
    } else {
      const pathToKey = parsedPath.slice().splice(0, parsedPath.length - 1);
      const refKey = parsedPath[parsedPath.length - 1];
      this._forcePath(pathToKey)[refKey] = value;
    }
  }

  update(data, address, timestamp) {
    for (const key in data) {
      this.set(key, data[key], address, timestamp);
    }
    return true;
  }

  batch(batchList, address, timestamp) {
    const resultList = [];
    batchList.forEach((item) => {
      if (item.op.toUpperCase() === DbOperations.SET) {
        resultList
            .push(this.set(item.ref, item.value, address, timestamp));
      } else if (item.op.toUpperCase() === DbOperations.INCREASE) {
        resultList
            .push(this.increase(item.diff, address, timestamp));
      } else if (item.op.toUpperCase() === DbOperations.UPDATE) {
        resultList
            .push(this.update(item.data, address, timestamp));
      } else if (item.op.toUpperCase() === DbOperations.GET) {
        resultList
            .push(this.get(item.ref));
      } else if (item.op.toUpperCase() === DbOperations.BATCH) {
        resultList
            .push(this.batch(item.batch_list, address, timestamp));
      }
    });
    return resultList;
  }

  _forcePath(parsedPath) {
    // Returns reference to provided path if exists, otherwise creates path
    let subDb = this.db;
    parsedPath.forEach((key) => {
      if ((!ChainUtil.isDict(subDb[key])) || (!(key in subDb))) {
        subDb[key] = {};
      }
      subDb = subDb[key];
    });
    return subDb;
  }

  increase(diff, address, timestamp) {
    for (const k in diff) {
      if (this.get(k, address) && typeof this.get(k, address) != 'number') {
        // TODO: Raise error here
        return {code: -1, error_message: 'Not a number type: ' + k};
      }
    }
    const results = {};
    for (const k in diff) {
      const result = (this.get(k, address) || 0) + diff[k];
      this.set(k, result, address, timestamp);
      results[k] = result;
    }
    return results;
  }

  /**
    * Validates transaction is valid according to AIN database rules and returns a transaction instance
    *
    * @param {dict} data - Database write request to be converted to transaction
    * @param {boolean} isNoncedTransaction - Indicates whether transaction should include nonce or not
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

  getPermissions(dbPath, address, timestamp, permissionQuery, newValue=null) {
    let lastRuleSet;
    address = address || this.publicKey;
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
      currentRuleSet = currentRuleSet[dbPath[i]];
      if (!currentRuleSet && dbPath[i]) {
        // If no rule set is available for specific key, check for wildcards
        const keys = Object.keys(lastRuleSet);
        for (let j=0; j<keys.length; j++) {
          if (keys[j].startsWith('$')) {
            wildCards[keys[j]] = dbPath[i];
            currentRuleSet = lastRuleSet[keys[j]];
          }
        }
      }
      i++;
    } while (currentRuleSet && i <= dbPath.length);

    if (typeof rule === 'string') {
      rule = this.verifyAuth(rule, wildCards, dbPath, newValue, address, timestamp);
    }

    return rule;
  }

  verifyAuth(ruleString, wildCards, dbPath, newValue, address, timestamp) {
    if (ruleString.includes('auth')) {
      ruleString = ruleString.replace(/auth/g, `'${address}'`);
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
        ruleString.replace(/oldData/g, this.get(dbPath.join('/')));
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

