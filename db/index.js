const ainUtil = require('@ainblockchain/ain-util');
const {ReadDbOperations, WriteDbOperations, PredefinedDbPaths, OwnerProperties,
       RuleProperties, DEBUG, GenesisAccounts} = require('../constants');
const ChainUtil = require('../chain-util');
const Transaction = require('./transaction');
const BuiltInFunctions = require('./built-in-functions');
const BuiltInRuleUtil = require('./built-in-rule-util');
const ACCOUNT_INDEX = process.env.ACCOUNT_INDEX || null;

class DB {
  constructor() {
    this.dbData = {};
    this.initDbData();
    this.func = new BuiltInFunctions(this);
    // TODO(lia): Add account importing functionality.
    this.account = ACCOUNT_INDEX !== null ?
        GenesisAccounts.others[ACCOUNT_INDEX] : ainUtil.createAccount();
    if (this instanceof BackUpDB) {
      return;
    }
    console.log(`Creating new db with account: ${this.account.address}`);
  }

  initDbData() {
    // Initialize DB owners.
    this.writeDatabase([PredefinedDbPaths.OWNERS_ROOT], {
      [OwnerProperties.OWNER]: {
        [OwnerProperties.OWNERS]: {
          [OwnerProperties.ANYONE]: {
            [OwnerProperties.BRANCH_OWNER]: true,
            [OwnerProperties.WRITE_FUNCTION]: true,
            [OwnerProperties.WRITE_OWNER]: true,
            [OwnerProperties.WRITE_RULE]: true
          }
        }
      }
    });
    // Initialize DB rules.
    this.writeDatabase([PredefinedDbPaths.RULES_ROOT], {
      [RuleProperties.WRITE]: true
    });
  }

  // For testing purpose only.
  setOwnersForTesting(ownersPath, owners) {
    this.writeDatabase([PredefinedDbPaths.OWNERS_ROOT, ...ChainUtil.parsePath(ownersPath)], owners);
  }

  // For testing purpose only.
  setRulesForTesting(rulesPath, rules) {
    this.writeDatabase([PredefinedDbPaths.RULES_ROOT, ...ChainUtil.parsePath(rulesPath)], rules);
  }

  // For testing purpose only.
  setAccountForTesting(accountIndex) {
    this.account = GenesisAccounts.others[accountIndex];
  }

  startWithBlockchain(blockchain, tp) {
    console.log('Starting database with a blockchain..')
    blockchain.setBackDb(new BackUpDB(this.account));
    this.nonce = this.getNonce(blockchain);
    this.reconstruct(blockchain, tp);
  }

  getNonce(blockchain) {
    // TODO (Chris): Search through all blocks for any previous nonced transaction with current
    //               publicKey
    let nonce = 0;
    for (let i = blockchain.chain.length - 1; i > -1; i--) {
      for (let j = blockchain.chain[i].transactions.length -1; j > -1; j--) {
        if (ainUtil.areSameAddresses(blockchain.chain[i].transactions[j].address,
                                     this.account.address)
            && blockchain.chain[i].transactions[j].nonce > -1) {
          // If blockchain is being restarted, retreive nonce from blockchain
          nonce = blockchain.chain[i].transactions[j].nonce + 1;
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

  writeDatabase(fullPath, value) {
    if (fullPath.length === 0) {
      this.dbData = value;
    } else if (fullPath.length === 1) {
      this.dbData[fullPath[0]] = value;
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

  getFunc(functionPath) {
    const parsedPath = ChainUtil.parsePath(functionPath);
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.FUNCTIONS_ROOT);
    return this.readDatabase(fullPath);
  }

  getOwner(ownerPath) {
    const parsedPath = ChainUtil.parsePath(ownerPath);
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.OWNERS_ROOT);
    return this.readDatabase(fullPath);
  }

  evalRule(valuePath, value, address, timestamp) {
    const parsedPath = ChainUtil.parsePath(valuePath);
    return this.getPermissionForValue(parsedPath, value, address, timestamp);
  }

  evalOwner(ruleOrOwnerPath, address) {
    const parsedPath = ChainUtil.parsePath(ruleOrOwnerPath);
    const { ownerConfig } = this.getOwnerConfig(parsedPath);
    const permissions = this.getOwnerPermissions(ownerConfig, address);
    if (!permissions) {
      return {};
    }
    return permissions;
  }

  get(opList) {
    const resultList = [];
    opList.forEach((item) => {
      if (item.type === undefined || item.type === ReadDbOperations.GET_VALUE) {
        resultList.push(this.getValue(item.ref));
      } else if (item.type === ReadDbOperations.GET_RULE) {
        resultList.push(this.getRule(item.ref));
      } else if (item.type === ReadDbOperations.GET_FUNC) {
        resultList.push(this.getFunc(item.ref));
      } else if (item.type === ReadDbOperations.GET_OWNER) {
        resultList.push(this.getOwner(item.ref));
      } else if (item.type === ReadDbOperations.EVAL_RULE) {
        resultList.push(this.evalRule(item.ref, item.value, item.address));
      } else if (item.type === ReadDbOperations.EVAL_OWNER) {
        resultList.push(this.evalOwner(item.ref, item.address));
      }
    });
    return resultList;
  }

  // TODO(seo): Add logic for deleting rule paths with only dangling points.
  // TODO(seo): Add dbPath validity check (e.g. '$', '.', etc).
  // TODO(seo): Define error code explicitly.
  // TODO(seo): Consider making set operation and built-in-function run tightly bound, i.e., revert
  //            the former if the latter fails.
  // TODO(seo): Consider adding array to object transforming (see
  //            https://firebase.googleblog.com/2014/04/best-practices-arrays-in-firebase.html).
  setValue(valuePath, value, address, timestamp) {
    const parsedPath = ChainUtil.parsePath(valuePath);
    if (!this.getPermissionForValue(parsedPath, value, address, timestamp)) {
      return {code: 2, error_message: 'No .write permission on: ' + valuePath};
    }
    const valueCopy = ChainUtil.isDict(value) ? JSON.parse(JSON.stringify(value)) : value;
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.VALUES_ROOT);
    this.writeDatabase(fullPath, valueCopy);
    this.func.runFunctions(parsedPath, valueCopy, timestamp, Date.now());
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

  // TODO(seo): Add rule config sanitization logic (e.g. dup path variables,
  //            multiple path variables).
  // TODO(seo): Add logic for deleting rule paths with only dangling points (w/o .write).
  setRule(rulePath, rule, address) {
    const parsedPath = ChainUtil.parsePath(rulePath);
    if (!this.getPermissionForRule(parsedPath, address)) {
      return {code: 3, error_message: 'No write_rule permission on: ' + rulePath};
    }
    const ruleCopy = ChainUtil.isDict(rule) ? JSON.parse(JSON.stringify(rule)) : rule;
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.RULES_ROOT);
    this.writeDatabase(fullPath, ruleCopy);
    return true;
  }

  // TODO(seo): Add owner config sanitization logic.
  // TODO(seo): Add logic for deleting owner paths with only dangling points (w/o .owner).
  setOwner(ownerPath, owner, address) {
    const parsedPath = ChainUtil.parsePath(ownerPath);
    if (!this.getPermissionForOwner(parsedPath, address)) {
      return {code: 4, error_message: 'No write_owner or branch_owner permission on: ' + ownerPath};
    }
    const ownerCopy = ChainUtil.isDict(owner) ? JSON.parse(JSON.stringify(owner)) : owner;
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.OWNERS_ROOT);
    this.writeDatabase(fullPath, ownerCopy);
    return true;
  }

  setFunc(functionPath, functionInfo, address) {
    const parsedPath = ChainUtil.parsePath(functionPath);
    if (!this.getPermissionForFunction(parsedPath, address)) {
      return {code: 3, error_message: 'No write_function permission on: ' + functionPath};
    }
    const functionInfoCopy = ChainUtil.isDict(functionInfo) ? JSON.parse(JSON.stringify(functionInfo)) : functionInfo;
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.FUNCTIONS_ROOT);
    this.writeDatabase(fullPath, functionInfoCopy);
    return true;
  }

  // TODO(seo): Make this operation atomic, i.e., rolled back when it fails.
  set(opList, address, timestamp) {
    let ret = true;
    for (let i = 0; i < opList.length; i++) {
      const op = opList[i];
      if (op.type === undefined || op.type === WriteDbOperations.SET_VALUE) {
        ret = this.setValue(op.ref, op.value, address, timestamp);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.INC_VALUE) {
        ret = this.incValue(op.ref, op.value, address, timestamp);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.DEC_VALUE) {
        ret = this.decValue(op.ref, op.value, address, timestamp);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.SET_RULE) {
        ret = this.setRule(op.ref, op.value, address);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.SET_FUNC) {
        ret = this.setFunc(op.ref, op.value, address);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.SET_OWNER) {
        ret = this.setOwner(op.ref, op.value, address);
        if (ret !== true) {
          break;
        }
      }
    }
    return ret;
  }

  batch(txList) {
    const resultList = [];
    txList.forEach((tx) => {
      const operation = tx.operation;
      if (!operation) {
        const message = 'No operation';
        resultList.push({ code: 1, error_message: message });
        console.log(message);
      } else {
        switch(operation.type) {
          case undefined:
          case WriteDbOperations.SET_VALUE:
          case WriteDbOperations.INC_VALUE:
          case WriteDbOperations.DEC_VALUE:
          case WriteDbOperations.SET_RULE:
          case WriteDbOperations.SET_FUNC:
          case WriteDbOperations.SET_OWNER:
          case WriteDbOperations.SET:
            resultList.push(this.executeOperation(operation, tx.address, tx.timestamp));
            break;
          default:
            const message = `Invalid operation type: ${operation.type}`;
            resultList.push({ code: 2, error_message: message });
            console.log(message);
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
    let subData = this.dbData;
    for (let i = 0; i < fullPath.length; i++) {
      const key = fullPath[i];
      if (!ChainUtil.isDict(subData) || !(key in subData)) {
        return null;
      }
      subData = subData[key];
    }
    return subData;
  }

  /**
   * Returns reference to the input path for writing if exists, otherwise creates path.
   */
  getRefForWriting(fullPath) {
    let subData = this.dbData;
    fullPath.forEach((key) => {
      if (!(key in subData) || !ChainUtil.isDict(subData[key])) {
        subData[key] = {};
      }
      subData = subData[key];
    });
    return subData;
  }

  /**
    * Validates transaction is valid according to AIN database rules and returns a transaction
    * instance
    *
    * @param {dict} operation - Database write operation to be converted to transaction
    * @param {boolean} isNoncedTransaction - Indicates whether transaction should include nonce or
    *                                        not
    * @return {Transaction} Instance of the transaction class
    */
  // TODO(Chris): Depricate this function
  createTransaction(txData, isNoncedTransaction = true) {
    if (Transaction.isBatchTransaction(txData)) {
      const txList = [];
      txData.tx_list.forEach((subData) => {
        txList.push(this.createSingleTransaction(subData, isNoncedTransaction));
      })
      return { tx_list: txList };
    }
    return this.createSingleTransaction(txData, isNoncedTransaction);
  }

  createSingleTransaction(txData, isNoncedTransaction) {
    // Workaround for skip_verif with custom address
    if (txData.address !== undefined) {
      txData.skip_verif = true;
    }
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
    return Transaction.newTransaction(this.account.private_key, txData);
  }

  sign(dataString) {
    return ainUtil.ecSignMessage(dataString, Buffer.from(this.account.private_key, 'hex'));
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
    block.transactions.forEach((tx) =>{
      this.executeTransaction(tx);
    });
  }

  addTransactionPool(transactions) {
    transactions.forEach((tx) => {
      this.executeTransaction(tx);
    });
  }

  setDBToBackUp(backUpDB) {
    if (ainUtil.areSameAddresses(this.account.address, backUpDB.account.address)) {
      this.dbData = JSON.parse(JSON.stringify(backUpDB.dbData));
    }
  }

  executeOperation(operation, address, timestamp) {
    if (!operation) {
      return null;
    }
    switch (operation.type) {
      case undefined:
      case WriteDbOperations.SET_VALUE:
        return this.setValue(operation.ref, operation.value, address, timestamp);
      case WriteDbOperations.INC_VALUE:
        return this.incValue(operation.ref, operation.value, address, timestamp);
      case WriteDbOperations.DEC_VALUE:
        return this.decValue(operation.ref, operation.value, address, timestamp);
      case WriteDbOperations.SET_RULE:
        return this.setRule(operation.ref, operation.value, address);
      case WriteDbOperations.SET_FUNC:
        return this.setFunc(operation.ref, operation.value, address);
      case WriteDbOperations.SET_OWNER:
        return this.setOwner(operation.ref, operation.value, address);
      case WriteDbOperations.SET:
        return this.set(operation.op_list, address, timestamp);
    }
  }

  executeTransaction(tx) {
    if (Transaction.isBatchTransaction(tx)) {
      return this.batch(tx.tx_list);
    }
    return this.executeOperation(tx.operation, tx.address, tx.timestamp);
  }

  // TODO(seo): Add rule check for sub-nodes when newValue is an opject.
  getPermissionForValue(valuePath, newValue, address, timestamp) {
    let lastRuleNode;
    const pathVars = {};
    const ruleNodes = [];
    let currentRuleNode = this.dbData[PredefinedDbPaths.RULES_ROOT];
    ruleNodes.push(currentRuleNode);
    for (let i = 0; i < valuePath.length && currentRuleNode; i++) {
      // Specific rule path has higher precedence over wildcard rule path.
      lastRuleNode = currentRuleNode;
      currentRuleNode = currentRuleNode[valuePath[i]];
      if (currentRuleNode) {
        ruleNodes.push(currentRuleNode);
      } else {
        // If no rule config is available for specific path, check for wildcards.
        const keys = Object.keys(lastRuleNode);
        for (let j = 0; j < keys.length; j++) {
          if (keys[j].startsWith('$')) {
            if (pathVars[keys[j]] !== undefined) {
              console.log('Duplicated path variables.')
              return false;
            }
            pathVars[keys[j]] = valuePath[i];
            currentRuleNode = lastRuleNode[keys[j]];
            ruleNodes.push(currentRuleNode);
          }
        }
      }
    }
    let rule = false;
    // Find the closest ancestor that has a rule config.
    for (let i = ruleNodes.length - 1; i >= 0; i--) {
      const refRuleConfig = ruleNodes[i];
      if (refRuleConfig[RuleProperties.WRITE]) {
        rule = refRuleConfig[RuleProperties.WRITE];
        break;
      }
    }
    return !!this.evalRuleString(rule, pathVars, valuePath, newValue, address, timestamp);
  }

  getPermissionForRule(rulePath, address) {
    const { ownerConfig } = this.getOwnerConfig(rulePath);
    const permissions =  this.getOwnerPermissions(ownerConfig, address);
    if (!permissions) {
      return false;
    }
    return (permissions[OwnerProperties.WRITE_RULE] === true);
  }

  getPermissionForFunction(functionPath, address) {
    const { ownerConfig } = this.getOwnerConfig(functionPath);
    const permissions =  this.getOwnerPermissions(ownerConfig, address);
    if (!permissions) {
      return false;
    }
    return (permissions[OwnerProperties.WRITE_FUNCTION] === true);
  }

  getPermissionForOwner(ownerPath, address) {
    const { ownerConfig, isAncestorConfig } = this.getOwnerConfig(ownerPath);
    const permissions =  this.getOwnerPermissions(ownerConfig, address);
    if (!permissions) {
      return false;
    }
    if (isAncestorConfig) {
      return (permissions[OwnerProperties.BRANCH_OWNER] === true);
    } else {
      return (permissions[OwnerProperties.WRITE_OWNER] === true);
    }
  }

  makeEvalFunction(ruleString, pathVars) {
    return new Function('auth', 'data', 'newData', 'currentTime', 'getValue', 'getRule',
                        'getFunc', 'getOwner', 'util', ...Object.keys(pathVars),
                        '"use strict"; return ' + ruleString);
  }

  evalRuleString(rule, pathVars, valuePath, newValue, address, timestamp) {
    if (typeof rule === 'boolean') {
      return rule;
    } else if (typeof rule !== 'string') {
      return false;
    }
    let evalFunc = this.makeEvalFunction(rule, pathVars);
    const data = this.getValue(valuePath.join('/'));
    return evalFunc(address, data, newValue, timestamp, this.getValue.bind(this),
                    this.getRule.bind(this), this.getFunc.bind(this), this.getOwner.bind(this),
                    new BuiltInRuleUtil(), ...Object.values(pathVars));
  }

  getOwnerConfig(ownerPath) {
    const ownerNodes = [];
    let currentOwnerNode = this.dbData[PredefinedDbPaths.OWNERS_ROOT];
    ownerNodes.push(currentOwnerNode);
    for (let i = 0; i < ownerPath.length && currentOwnerNode; i++) {
      currentOwnerNode = currentOwnerNode[ownerPath[i]];
      if (currentOwnerNode) {
        ownerNodes.push(currentOwnerNode);
      }
    }
    let ownerConfig = null;
    let isAncestorConfig = (ownerPath.length !== 0);
    // Find the closest ancestor that has a owner config.
    for (let i = ownerNodes.length - 1; i >= 0; i--) {
      const refOwnerConfig = ownerNodes[i];
      if (refOwnerConfig[OwnerProperties.OWNER]) {
        ownerConfig = refOwnerConfig[OwnerProperties.OWNER];
        isAncestorConfig = (i !== ownerPath.length);
        break;
      }
    }
    return { ownerConfig, isAncestorConfig };
  }

  getOwnerPermissions(config, address) {
    if (!config) {
      return null;
    }
    let owners = null;
    owners = config[OwnerProperties.OWNERS];
    if (!owners) {
      return null;
    }
    // Step 1: Check if the address exists in owners.
    let permissions = owners[address];
    // Step 2: If the address does not exist in owners, check permissions for anyone ('*').
    if (!permissions) {
      permissions = owners[OwnerProperties.ANYONE];
    }
    if (!permissions) {
      return null;
    }
    return permissions;
  }
}

class BackUpDB extends DB {
  constructor(account) {
    super();
    this.account = account;
  }
}

module.exports = DB;
