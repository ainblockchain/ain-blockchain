const escapeStringRegexp = require('escape-string-regexp');
const ChainUtil = require('../chain-util');
const Transaction = require('./transaction');
const BuiltInFunctions = require('./built-in-functions');
const { InvalidPermissionsError, InvalidArgumentsError } = require('../errors');
const { OperationTypes, UpdateTypes, PredefinedDbPaths } = require('../constants');

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
    const parsedPath = ChainUtil.parsePath(dbPath);

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
    return this.setValue([PredefinedDbPaths.STAKEHOLDER, this.publicKey].join('/'), stakeAmount);
  }

  // TODO(seo): Add dbPath validity check (e.g. '$', '.', etc).
  // TODO(seo): Make set operation and function run tightly bound, i.e., revert the former
  //            if the latter fails.
  setValue(dbPath, value, address, timestamp) {
    const parsedPath = ChainUtil.parsePath(dbPath);
    // TODO: Find a better way to manage seeting of rules than this dodgy condition
    // In future should be able to accomidate other types of rules beyoned wrie
    if (!(parsedPath.length === 1 && parsedPath[0] === 'rules')
        && this.getPermissions(parsedPath, address, timestamp, '.write', value) == false) {
      throw new InvalidPermissionsError(`Invalid permissons for ${dbPath}`);
    }
    const valueCopy = ChainUtil.isDict(value) ? JSON.parse(JSON.stringify(value)) : value;
    this.setValueWithPermission(dbPath, valueCopy);
    this.func.runFunctions(parsedPath, valueCopy);
    return true;
  }

  setValueWithPermission(dbPath, value) {
    const parsedPath = ChainUtil.parsePath(dbPath);
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

  incrementValue(dbPath, delta, address, timestamp) {
    const valueBefore = this.get(dbPath);
    if (typeof valueBefore !== 'number' || typeof delta !== 'number') {
      throw new InvalidArgumentsError(`Invalid permissons for ${dbPath}`);
    }
    const valueAfter = valueBefore + delta;
    return this.setValue(dbPath, valueAfter, address, timestamp);
  }

  decrementValue(dbPath, delta, address, timestamp) {
    const valueBefore = this.get(dbPath);
    if (typeof valueBefore !== 'number' || typeof delta !== 'number') {
      throw new InvalidArgumentsError(`Invalid permissons for ${dbPath}`);
    }
    const valueAfter = valueBefore - delta;
    return this.setValue(dbPath, valueAfter, address, timestamp);
  }

  update(data, address, timestamp) {
    for (const key in data) {
      this.setValue(key, data[key], address, timestamp);
    }
    return true;
  }

  // TODO(seo): Make this operation atomic, i.e., rolled back when it fails.
  updates(updateList, address, timestamp) {
    let success = true;
    for (let i = 0; i < updateList.length; i++) {
      const update = updateList[i];
      if (update.type === undefined || update.type === UpdateTypes.SET_VALUE) {
        if (!this.setValue(update.ref, update.value, address, timestamp)) {
          success = false;
          break;
        }
      } else if (update.type === UpdateTypes.INC_VALUE) {
        if (!this.incrementValue(update.ref, update.value, address, timestamp)) {
          success = false;
          break;
        }
      } else if (update.type === UpdateTypes.DEC_VALUE) {
        if (!this.decrementValue(update.ref, update.value, address, timestamp)) {
          success = false;
          break;
        }
      }
    }
    return success;
  }

  batch(batchList, address, timestamp) {
    const resultList = [];
    batchList.forEach((item) => {
      if (item.op.toUpperCase() === OperationTypes.SET) {
        resultList
            .push(this.setValue(item.ref, item.value, address, timestamp));
      } else if (item.op.toUpperCase() === OperationTypes.INCREASE) {
        resultList
            .push(this.increase(item.diff, address, timestamp));
      } else if (item.op.toUpperCase() === OperationTypes.UPDATE) {
        resultList
            .push(this.update(item.data, address, timestamp));
      } else if (item.op.toUpperCase() === OperationTypes.GET) {
        resultList
            .push(this.get(item.ref));
      } else if (item.op.toUpperCase() === OperationTypes.BATCH) {
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
      this.setValue(k, result, address, timestamp);
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
    block.data.forEach((tx) =>{
      this.execute(tx.operation, tx.address, tx.timestamp);
    });
  }

  addTransactionPool(transactions) {
    transactions.forEach((tx) => {
      this.execute(tx.operation, tx.address, tx.timestamp);
    });
  }

  setDBToBackUp(backUpDB) {
    if (this.publicKey === backUpDB.publicKey) {
      this.db = JSON.parse(JSON.stringify(backUpDB.db));
    }
  }

  execute(operation, address, timestamp) {
    switch (operation.type) {
      case OperationTypes.SET:
        return this.setValue(operation.ref, operation.value, address, timestamp);
      case OperationTypes.UPDATES:
        return this.updates(operation.data, address, timestamp);
      case OperationTypes.SET_VALUE:
        return this.setValue(operation.data.ref, operation.data.value, address, timestamp);
      case OperationTypes.INC_VALUE:
        return this.incrementValue(operation.data.ref, operation.data.value, address, timestamp);
      case OperationTypes.DEC_VALUE:
        return this.decrementValue(operation.data.ref, operation.data.value, address, timestamp);
      case OperationTypes.INCREASE:
        return this.increase(operation.diff, address, timestamp);
      case OperationTypes.UPDATE:
        return this.update(operation.data, address, timestamp);
      case OperationTypes.BATCH:
        return this.batch(operation.batch_list, address, timestamp);
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

  static substituteWildCards(ruleString, wildCards) {
    for (const wildCard in wildCards) {
      if (ruleString.includes(wildCard)) {
        // May need to come back here to figure out how to change ALL occurrences of wildCards
        ruleString = ruleString.replace(
            new RegExp(escapeStringRegexp(wildCard), 'g'), `${wildCards[wildCard]}`);
      }
    }
    return ruleString;
  }

  verifyAuth(ruleString, wildCards, dbPath, newValue, address, timestamp) {
    if (ruleString.includes('auth')) {
      ruleString = ruleString.replace(/auth/g, `'${address}'`);
    }
    if (Object.keys(wildCards).length > 0) {
      ruleString = DB.substituteWildCards(ruleString, wildCards);
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
      console.log(`Failed to get permission with rule "${ruleString}"`);
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
