const escapeStringRegexp = require('escape-string-regexp');
const ainUtil = require('@ainblockchain/ain-util');
const ChainUtil = require('../chain-util');
const Transaction = require('./transaction');
const BuiltInFunctions = require('./built-in-functions');
const {OperationTypes, PredefinedDbPaths, RuleProperties, DEBUG} = require('../constants');

class DB {
  constructor(blockchain) {
    this.db = {};
    this.func = new BuiltInFunctions(this);
    // TODO (lia): Add account importing functionality
    // TODO (lia): Add "address" property and change publicKey to "full public key" value.
    this.keyPair = ChainUtil.genKeyPair();
    this.publicKey = ainUtil.toChecksumAddress(ainUtil.bufferToHex(
        ainUtil.pubToAddress(
            Buffer.from(this.keyPair.getPublic().encode('hex'), 'hex'),
            true
        )
    ));
    if (this instanceof BackUpDB) return;
    this.nonce = this.getNonce(blockchain);
    console.log(`creating new db with id ${this.publicKey}`);
  }

  getNonce(blockchain) {
    // TODO (Chris): Search through all blocks for any previous nonced transaction with current publicKey
    let nonce = 0;
    for (let i = blockchain.chain.length - 1; i > -1; i--) {
      for (let j = blockchain.chain[i].data.length -1; j > -1; j--) {
        if (blockchain.chain[i].data[j].address == this.publicKey && blockchain.chain[i].data[j].nonce > -1) {
          // If blockchain is being restarted, retreive nocne from blockchain
          nonce = blockchain.chain[i].data[j].nonce + 1;
          break;
        }
      }
      if (nonce > 0) {
        break;
      }
    }
    console.log(`Setting nonce to ${nonce}`);
    return nonce;
  }

  static getDatabase(blockchain, tp) {
    const db = new DB(blockchain);
    blockchain.setBackDb(new BackUpDB(db.keyPair));
    db.reconstruct(blockchain, tp);
    return db;
  }

  writeDatabase(fullPath, value) {
    if (fullPath.length === 0) {
      this.db = value;
    } else if (fullPath.length === 1) {
      this.db[fullPath[0]] = value;
    } else {
      const pathToKey = fullPath.slice().splice(0, fullPath.length - 1);
      const refKey = fullPath[fullPath.length - 1];
      this.getRefForWriting(pathToKey)[refKey] = value;
    }
  }

  readDatabase(fullPath) {
    const result = this.getRefForReading(fullPath);
    return result !== undefined ? JSON.parse(JSON.stringify(result)) : null;
  }

  getValue(valuePath) {
    const parsedPath = ChainUtil.parsePath(valuePath);
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.VALUES_ROOT);
    return this.readDatabase(fullPath);
  }

  getRule(rulePath) {
    const parsedPath = ChainUtil.parsePath(rulePath);
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.RULES_ROOT);
    return this.readDatabase(fullPath);
  }

  getOwner(ownerPath) {
    const parsedPath = ChainUtil.parsePath(ownerPath);
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.OWNERS_ROOT);
    return this.readDatabase(fullPath);
  }

  get(opList) {
    const resultList = [];
    opList.forEach((item) => {
      if (item.type === undefined || item.type === OperationTypes.GET_VALUE) {
        resultList.push(this.getValue(item.ref));
      } else if (item.type === OperationTypes.GET_RULE) {
        resultList.push(this.getRule(item.ref));
      } else if (item.type === OperationTypes.GET_OWNER) {
        resultList.push(this.getOwner(item.ref));
      }
    });
    return resultList;
  }

  stake(stakeAmount) {
    return this.setValue([PredefinedDbPaths.STAKEHOLDER, this.publicKey].join('/'), stakeAmount);
  }

  // TODO(seo): Add dbPath validity check (e.g. '$', '.', etc).
  // TODO(seo): Make set operation and function run tightly bound, i.e., revert the former
  //            if the latter fails.
  // TODO(seo): Consider adding array to object transforming (see
  //            https://firebase.googleblog.com/2014/04/best-practices-arrays-in-firebase.html).
  // TODO(seo): Consider explicitly defining error code.
  setValue(valuePath, value, address, timestamp) {
    const parsedPath = ChainUtil.parsePath(valuePath);
    if (!this.getPermissionForValue(parsedPath, address, timestamp, value)) {
      return {code: 2, error_message: 'No write_value permission on: ' + valuePath};
    }
    const valueCopy = ChainUtil.isDict(value) ? JSON.parse(JSON.stringify(value)) : value;
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.VALUES_ROOT);
    this.writeDatabase(fullPath, valueCopy);
    this.func.runFunctions(parsedPath, valueCopy);
    return true;
  }

  incValue(valuePath, delta, address, timestamp) {
    const valueBefore = this.getValue(valuePath);
    if (DEBUG) {
      console.log(`VALUE BEFORE:  ${JSON.stringify(valueBefore)}`);
    }
    if ((valueBefore && typeof valueBefore !== 'number') || typeof delta !== 'number') {
      return {code: 1, error_message: 'Not a number type: ' + valuePath};
    }
    const valueAfter = (valueBefore === undefined ? 0 : valueBefore) + delta;
    return this.setValue(valuePath, valueAfter, address, timestamp);
  }

  decValue(valuePath, delta, address, timestamp) {
    const valueBefore = this.getValue(valuePath);
    if (DEBUG) {
      console.log(`VALUE BEFORE:  ${JSON.stringify(valueBefore)}`);
    }
    if ((valueBefore && typeof valueBefore !== 'number') || typeof delta !== 'number') {
      return {code: 1, error_message: 'Not a number type: ' + valuePath};
    }
    const valueAfter = (valueBefore === undefined ? 0 : valueBefore) - delta;
    return this.setValue(valuePath, valueAfter, address, timestamp);
  }

  setRule(rulePath, rule, address, timestamp) {
    const parsedPath = ChainUtil.parsePath(rulePath);
    if (!this.getPermissionForRule(parsedPath, address, timestamp, rule)) {
      return {code: 2, error_message: 'No write_rule permission on: ' + rulePath};
    }
    const ruleCopy = ChainUtil.isDict(rule) ? JSON.parse(JSON.stringify(rule)) : rule;
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.RULES_ROOT);
    this.writeDatabase(fullPath, ruleCopy);
    return true;
  }

  setOwner(ownerPath, owner, address, timestamp) {
    const parsedPath = ChainUtil.parsePath(ownerPath);
    if (!this.getPermissionForOwner(parsedPath, address, timestamp, owner)) {
      return {code: 2, error_message: 'No write_owner permission on: ' + ownerPath};
    }
    const ownerCopy = ChainUtil.isDict(owner) ? JSON.parse(JSON.stringify(owner)) : owner;
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.OWNERS_ROOT);
    this.writeDatabase(fullPath, ownerCopy);
    return true;
  }

  // TODO(seo): Make this operation atomic, i.e., rolled back when it fails.
  set(opList, address, timestamp) {
    let ret = true;
    for (let i = 0; i < opList.length; i++) {
      const op = opList[i];
      if (op.type === undefined || op.type === OperationTypes.SET_VALUE) {
        ret = this.setValue(op.ref, op.value, address, timestamp);
        if (ret !== true) {
          break;
        }
      } else if (op.type === OperationTypes.INC_VALUE) {
        ret = this.incValue(op.ref, op.value, address, timestamp);
        if (ret !== true) {
          break;
        }
      } else if (op.type === OperationTypes.DEC_VALUE) {
        ret = this.decValue(op.ref, op.value, address, timestamp);
        if (ret !== true) {
          break;
        }
      } else if (op.type === OperationTypes.SET_RULE) {
        ret = this.setRule(op.ref, op.value, address, timestamp);
        if (ret !== true) {
          break;
        }
      } else if (op.type === OperationTypes.SET_OWNER) {
        ret = this.setOwner(op.ref, op.value, address, timestamp);
        if (ret !== true) {
          break;
        }
      }
    }
    return ret;
  }

  batch(txList, address, timestamp) {
    const resultList = [];
    txList.forEach((tx) => {
      const operation = tx.operation;
      if (!operation) {
        resultList.push(null);
      } else {
        switch(operation.type) {
          case OperationTypes.GET_VALUE:
            resultList.push(this.getValue(operation.ref));
            break;
          case OperationTypes.GET_RULE:
            resultList.push(this.getRule(operation.ref));
            break;
          case OperationTypes.GET_OWNER:
            resultList.push(this.getOwner(operation.ref));
            break;
          case OperationTypes.GET:
            resultList.push(this.get(operation.op_list));
            break;
          case OperationTypes.SET_VALUE:
          case OperationTypes.INC_VALUE:
          case OperationTypes.DEC_VALUE:
          case OperationTypes.SET_RULE:
          case OperationTypes.SET_OWNER:
          case OperationTypes.SET:
            resultList.push(this.execute(operation, address, timestamp));
            break;
          default:
            console.log('Invalid batch operation type: ' + operation.type);
            resultList.push(null);
        }
      }
    });
    return resultList;
  }

  /**
   *  Returns full path with given root node.
   */
  getFullPath(parsedPath, root) {
    const fullPath = parsedPath.slice();
    fullPath.unshift(root);
    return fullPath;
  }

  /**
   * Returns reference to the input path for reading if exists, otherwise null.
   */
  getRefForReading(fullPath) {
    let subDb = this.db;
    for (let i = 0; i < fullPath.length; i++) {
      const key = fullPath[i];
      if (!ChainUtil.isDict(subDb) || !(key in subDb)) {
        return null;
      }
      subDb = subDb[key];
    }
    return subDb;
  }

  /**
   * Returns reference to the input path for writing if exists, otherwise creates path.
   */
  getRefForWriting(fullPath) {
    let subDb = this.db;
    fullPath.forEach((key) => {
      if (!(key in subDb) || !ChainUtil.isDict(subDb[key])) {
        subDb[key] = {};
      }
      subDb = subDb[key];
    });
    return subDb;
  }

  /**
    * Validates transaction is valid according to AIN database rules and returns a transaction instance
    *
    * @param {dict} operation - Database write operation to be converted to transaction
    * @param {boolean} isNoncedTransaction - Indicates whether transaction should include nonce or not
    * @return {Transaction} Instance of the transaction class
    */
  createTransaction(txData, isNoncedTransaction = true) {
    // TODO: (Chris) Depricate this function
    if (txData.nonce === undefined) {
      let nonce;
      if (isNoncedTransaction) {
        nonce = this.nonce;
        this.nonce++;
      } else {
        nonce = -1;
      }
      txData.nonce = nonce;
    }
    return Transaction.newTransaction(this.keyPair.priv, txData);
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
      case OperationTypes.SET_VALUE:
        return this.setValue(operation.ref, operation.value, address, timestamp);
      case OperationTypes.INC_VALUE:
        return this.incValue(operation.ref, operation.value, address, timestamp);
      case OperationTypes.DEC_VALUE:
        return this.decValue(operation.ref, operation.value, address, timestamp);
      case OperationTypes.SET_RULE:
        return this.setRule(operation.ref, operation.value, address, timestamp);
      case OperationTypes.SET_OWNER:
        return this.setOwner(operation.ref, operation.value, address, timestamp);
      case OperationTypes.SET:
        return this.set(operation.op_list, address, timestamp);
      case OperationTypes.BATCH:
        return this.batch(operation.tx_list, address, timestamp);
      default:
        console.log('Invalid operation type: ' + operation.type);
    }
  }

  getPermissionForValue(valuePath, address, timestamp, newValue) {
    let lastRuleSet;
    address = address || this.publicKey;
    timestamp = timestamp || Date.now();
    let rule = false;
    const wildCards = {};
    let currentRuleSet = this.db['rules'];
    let i = 0;
    do {
      if (RuleProperties.WRITE_VALUE in currentRuleSet) {
        rule = currentRuleSet[RuleProperties.WRITE_VALUE];
      }
      lastRuleSet = currentRuleSet;
      currentRuleSet = currentRuleSet[valuePath[i]];
      if (!currentRuleSet && valuePath[i]) {
        // If no rule set is available for specific key, check for wildcards
        const keys = Object.keys(lastRuleSet);
        for (let j=0; j<keys.length; j++) {
          if (keys[j].startsWith('$')) {
            wildCards[keys[j]] = valuePath[i];
            currentRuleSet = lastRuleSet[keys[j]];
          }
        }
      }
      i++;
    } while (currentRuleSet && i <= valuePath.length);

    if (typeof rule === 'string') {
      rule = this.evalWriteValue(rule, wildCards, valuePath, newValue, address, timestamp);
    }

    return rule;
  }

  getPermissionForRule(rulePath, address, timestamp, permissionQuery, newValue) {
    // TODO(seo): Implement this.
    return true;
  }

  getPermissionForOwner(ownerPath, address, timestamp, permissionQuery, newValue) {
    // TODO(seo): Implement this.
    return true;
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

  evalWriteValue(ruleString, wildCards, valuePath, newValue, address, timestamp) {
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
        ruleString.replace(/oldData/g, this.getValue(valuePath.join('/')));
    }
    if (ruleString.includes('db.getValue')) {
      ruleString = ruleString.replace(/db.getValue/g, 'this.getValue');
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
    this.publicKey = ainUtil.toChecksumAddress(ainUtil.bufferToHex(
        ainUtil.pubToAddress(
            Buffer.from(this.keyPair.getPublic().encode('hex'), 'hex'),
            true
        )
    ));
  }
}

module.exports = DB;
