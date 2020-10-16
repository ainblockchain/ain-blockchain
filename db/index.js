const logger = require('../logger');
const {
  ReadDbOperations,
  WriteDbOperations,
  PredefinedDbPaths,
  OwnerProperties,
  RuleProperties,
  ProofProperties,
  ShardingProperties,
  GenesisSharding,
  LIGHTWEIGHT,
  buildOwnerPermissions,
} = require('../constants');
const ChainUtil = require('../chain-util');
const Transaction = require('../tx-pool/transaction');
const StateNode = require('./state-node');
const {
  hasFunctionConfig,
  getFunctionConfig,
  hasRuleConfig,
  getRuleConfig,
  hasOwnerConfig,
  getOwnerConfig,
  isWritablePathWithSharding,
  isValidPathForStates,
  isValidJsObjectForStates,
  jsObjectToStateTree,
  stateTreeToJsObject,
  makeCopyOfStateTree,
  setProofHashForStateTree,
  updateProofHashForPath,
} = require('./state-util');
const Functions = require('./functions');
const RuleUtil = require('./rule-util');

class DB {
  constructor(bc, blockNumberSnapshot) {
    this.shardingPath = null;
    this.isRoot = null;
    this.stateTree = new StateNode();
    this.initDbData();
    this.setShardingPath(GenesisSharding[ShardingProperties.SHARDING_PATH]);
    this.func = new Functions(this);
    this.bc = bc;
    this.blockNumberSnapshot = blockNumberSnapshot;
  }

  initDbData() {
    // Initialize DB owners.
    this.writeDatabase([PredefinedDbPaths.OWNERS_ROOT], {
      [OwnerProperties.OWNER]: {
        [OwnerProperties.OWNERS]: {
          [OwnerProperties.ANYONE]: buildOwnerPermissions(true, true, true, true),
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
  setFunctionsForTesting(functionsPath, functions) {
    this.writeDatabase([PredefinedDbPaths.FUNCTIONS_ROOT,
      ...ChainUtil.parsePath(functionsPath)], functions);
  }

  // For testing purpose only.
  setValuesForTesting(valuesPath, values) {
    this.writeDatabase([PredefinedDbPaths.VALUES_ROOT,
      ...ChainUtil.parsePath(valuesPath)], values);
  }

  // For testing purpose only.
  setShardingForTesting(sharding) {
    this.setValuesForTesting(
        ChainUtil.formatPath([PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_CONFIG]),
        sharding);
    this.setShardingPath(sharding[ShardingProperties.SHARDING_PATH]);
  }

  /**
   * Sets the sharding path of the database.
   */
  setShardingPath(shardingPath) {
    this.shardingPath = ChainUtil.parsePath(shardingPath);
    this.isRoot = (this.shardingPath.length === 0);
  }

  /**
   * Returns the sharding path of the database.
   */
  getShardingPath() {
    return ChainUtil.formatPath(this.shardingPath);
  }

  /**
   * Returns reference to the input path for reading if exists, otherwise null.
   */
  getRefForReading(fullPath) {
    let node = this.stateTree;
    for (let i = 0; i < fullPath.length; i++) {
      const label = fullPath[i];
      if (node.hasChild(label)) {
        node = node.getChild(label);
      } else {
        return null;
      }
    }
    return node;
  }

  /**
   * Returns reference to the input path for writing if exists, otherwise creates path.
   */
  getRefForWriting(fullPath) {
    let node = this.stateTree;
    for (let i = 0; i < fullPath.length; i++) {
      const label = fullPath[i];
      if (node.hasChild(label)) {
        node = node.getChild(label);
        if (node.getIsLeaf()) {
          node.resetValue();
        }
      } else {
        const child = new StateNode();
        node.setChild(label, child);
        node = child;
      }
    }
    return node;
  }

  writeDatabase(fullPath, stateObj) {
    const stateTree = jsObjectToStateTree(stateObj);
    const pathToParent = fullPath.slice().splice(0, fullPath.length - 1);
    if (fullPath.length === 0) {
      this.stateTree = stateTree;
    } else {
      const label = fullPath[fullPath.length - 1];
      const parent = this.getRefForWriting(pathToParent);
      parent.setChild(label, stateTree);
    }
    if (DB.isEmptyNode(stateTree)) {
      this.removeEmptyNodes(fullPath);
    } else if (!LIGHTWEIGHT) {
      setProofHashForStateTree(stateTree);
    }
    if (!LIGHTWEIGHT) {
      updateProofHashForPath(pathToParent, this.stateTree);
    }
  }

  static isEmptyNode(dbNode) {
    return dbNode.getIsLeaf() && dbNode.getValue() === null;
  }

  removeEmptyNodesRecursive(fullPath, depth, curDbNode) {
    if (depth < fullPath.length - 1) {
      const nextDbNode = curDbNode.getChild(fullPath[depth]);
      if (nextDbNode === null) {
        logger.error(`Unavailable path in the database: ${ChainUtil.formatPath(fullPath)}`);
      } else {
        this.removeEmptyNodesRecursive(fullPath, depth + 1, nextDbNode);
      }
    }
    for (const label of curDbNode.getChildLabels()) {
      const childNode = curDbNode.getChild(label);
      if (DB.isEmptyNode(childNode)) {
        curDbNode.deleteChild(label);
      }
    }
  }

  removeEmptyNodes(fullPath) {
    return this.removeEmptyNodesRecursive(fullPath, 0, this.stateTree);
  }

  readDatabase(fullPath) {
    const stateNode = this.getRefForReading(fullPath);
    return stateTreeToJsObject(stateNode);
  }

  getValue(valuePath, isGlobal) {
    const parsedPath = ChainUtil.parsePath(valuePath);
    const localPath = isGlobal === true ? this.toLocalPath(parsedPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    const fullPath = this.getFullPath(localPath, PredefinedDbPaths.VALUES_ROOT);
    return this.readDatabase(fullPath);
  }

  getFunction(functionPath, isGlobal) {
    const parsedPath = ChainUtil.parsePath(functionPath);
    const localPath = isGlobal === true ? this.toLocalPath(parsedPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    const fullPath = this.getFullPath(localPath, PredefinedDbPaths.FUNCTIONS_ROOT);
    return this.readDatabase(fullPath);
  }

  getRule(rulePath, isGlobal) {
    const parsedPath = ChainUtil.parsePath(rulePath);
    const localPath = isGlobal === true ? this.toLocalPath(parsedPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    const fullPath = this.getFullPath(localPath, PredefinedDbPaths.RULES_ROOT);
    return this.readDatabase(fullPath);
  }

  getOwner(ownerPath, isGlobal) {
    const parsedPath = ChainUtil.parsePath(ownerPath);
    const localPath = isGlobal === true ? this.toLocalPath(parsedPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    const fullPath = this.getFullPath(localPath, PredefinedDbPaths.OWNERS_ROOT);
    return this.readDatabase(fullPath);
  }

  /**
   * Returns a proof of a state node.
   * 
   * @param {string} fullPath full database path to the state node to be proved.
   */
  // TODO(seo): Consider supporting global path for getProof().
  getProof(fullPath) {
    const parsedPath = ChainUtil.parsePath(fullPath);
    let node = this.stateTree;
    const rootProof = { [ProofProperties.PROOF_HASH]: node.getProofHash() };
    let proof = rootProof;
    for (const label of parsedPath) {
      if (node.hasChild(label)) {
        node.getChildLabels().forEach(label => {
          Object.assign(proof,
            { [label]: { [ProofProperties.PROOF_HASH]: node.getChild(label).getProofHash() } });
        });
        proof = proof[label];
        node = node.getChild(label);
      } else {
        return null;
      }
    }
    return rootProof;
  }

  matchFunction(funcPath, isGlobal) {
    const parsedPath = ChainUtil.parsePath(funcPath);
    const localPath = isGlobal === true ? this.toLocalPath(parsedPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    return this.convertFunctionMatch(this.matchFunctionForParsedPath(localPath), isGlobal);
  }

  matchRule(valuePath, isGlobal) {
    const parsedPath = ChainUtil.parsePath(valuePath);
    const localPath = isGlobal === true ? this.toLocalPath(parsedPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    return this.convertRuleMatch(this.matchRuleForParsedPath(localPath), isGlobal);
  }

  matchOwner(rulePath, isGlobal) {
    const parsedPath = ChainUtil.parsePath(rulePath);
    const localPath = isGlobal === true ? this.toLocalPath(parsedPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    return this.convertOwnerMatch(this.matchOwnerForParsedPath(localPath), isGlobal);
  }

  evalRule(valuePath, value, address, timestamp, isGlobal) {
    const parsedPath = ChainUtil.parsePath(valuePath);
    const localPath = isGlobal === true ? this.toLocalPath(parsedPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    return this.getPermissionForValue(localPath, value, address, timestamp);
  }

  evalOwner(refPath, permission, address, isGlobal) {
    const parsedPath = ChainUtil.parsePath(refPath);
    const localPath = isGlobal === true ? this.toLocalPath(parsedPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    const matched = this.matchOwnerForParsedPath(localPath);
    return this.checkPermission(matched.closestOwner.config, address, permission);
  }

  get(opList) {
    const resultList = [];
    opList.forEach((op) => {
      if (op.type === undefined || op.type === ReadDbOperations.GET_VALUE) {
        resultList.push(this.getValue(op.ref, op.is_global));
      } else if (op.type === ReadDbOperations.GET_RULE) {
        resultList.push(this.getRule(op.ref, op.is_global));
      } else if (op.type === ReadDbOperations.GET_FUNCTION) {
        resultList.push(this.getFunction(op.ref, op.is_global));
      } else if (op.type === ReadDbOperations.GET_OWNER) {
        resultList.push(this.getOwner(op.ref, op.is_global));
      } else if (op.type === ReadDbOperations.GET_PROOF) {
        resultList.push(this.getProof(op.ref));
      } else if (op.type === ReadDbOperations.MATCH_FUNCTION) {
        resultList.push(this.matchFunction(op.ref, op.is_global));
      } else if (op.type === ReadDbOperations.MATCH_RULE) {
        resultList.push(this.matchRule(op.ref, op.is_global));
      } else if (op.type === ReadDbOperations.MATCH_OWNER) {
        resultList.push(this.matchOwner(op.ref, op.is_global));
      } else if (op.type === ReadDbOperations.EVAL_RULE) {
        resultList.push(
            this.evalRule(op.ref, op.value, op.address, op.timestamp || Date.now(), op.is_global));
      } else if (op.type === ReadDbOperations.EVAL_OWNER) {
        resultList.push(this.evalOwner(op.ref, op.permission, op.address, op.is_global));
      }
    });
    return resultList;
  }

  // TODO(seo): Define error code explicitly.
  // TODO(seo): Consider making set operation and native function run tightly bound, i.e., revert
  //            the former if the latter fails.
  // TODO(seo): Apply isWritablePathWithSharding() to setFunction(), setRule(), and setOwner()
  //            as well.
  setValue(valuePath, value, address, timestamp, transaction, isGlobal) {
    const isValidObj = isValidJsObjectForStates(value);
    if (!isValidObj.isValid) {
      return {code: 6, error_message: `Invalid object for states: ${isValidObj.invalidPath}`};
    }
    const parsedPath = ChainUtil.parsePath(valuePath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return {code: 7, error_message: `Invalid path: ${isValidPath.invalidPath}`};
    }
    const localPath = isGlobal === true ? this.toLocalPath(parsedPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return true;
    }
    if (!this.getPermissionForValue(localPath, value, address, timestamp)) {
      return {code: 2, error_message: `No .write permission on: ${valuePath}`};
    }
    const fullPath = this.getFullPath(localPath, PredefinedDbPaths.VALUES_ROOT);
    const isWritablePath = isWritablePathWithSharding(fullPath, this.stateTree);
    if (!isWritablePath.isValid) {
      if (isGlobal) {
        // There is nothing to do.
        return true;
      } else {
        return {
          code: 8,
          error_message: `Non-writable path with shard config: ${isWritablePath.invalidPath}`
        };
      }
    }
    const valueCopy = ChainUtil.isDict(value) ? JSON.parse(JSON.stringify(value)) : value;
    this.writeDatabase(fullPath, valueCopy);
    this.func.triggerFunctions(localPath, valueCopy, timestamp, Date.now(), transaction);
    return true;
  }

  incValue(valuePath, delta, address, timestamp, transaction, isGlobal) {
    const valueBefore = this.getValue(valuePath, isGlobal);
    logger.debug(`VALUE BEFORE:  ${JSON.stringify(valueBefore)}`);
    if ((valueBefore && typeof valueBefore !== 'number') || typeof delta !== 'number') {
      return { code: 1, error_message: `Not a number type: ${valueBefore} or ${delta}` };
    }
    const valueAfter = (valueBefore === undefined ? 0 : valueBefore) + delta;
    return this.setValue(valuePath, valueAfter, address, timestamp, transaction, isGlobal);
  }

  decValue(valuePath, delta, address, timestamp, transaction, isGlobal) {
    const valueBefore = this.getValue(valuePath, isGlobal);
    logger.debug(`VALUE BEFORE:  ${JSON.stringify(valueBefore)}`);
    if ((valueBefore && typeof valueBefore !== 'number') || typeof delta !== 'number') {
      return { code: 1, error_message: `Not a number type: ${valueBefore} or ${delta}` };
    }
    const valueAfter = (valueBefore === undefined ? 0 : valueBefore) - delta;
    return this.setValue(valuePath, valueAfter, address, timestamp, transaction, isGlobal);
  }

  setFunction(functionPath, functionInfo, address, isGlobal) {
    const isValidObj = isValidJsObjectForStates(functionInfo);
    if (!isValidObj.isValid) {
      return {code: 6, error_message: `Invalid object for states: ${isValidObj.invalidPath}`};
    }
    const parsedPath = ChainUtil.parsePath(functionPath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return {code: 7, error_message: `Invalid path: ${isValidPath.invalidPath}`};
    }
    const localPath = isGlobal === true ? this.toLocalPath(parsedPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return true;
    }
    if (!this.getPermissionForFunction(localPath, address)) {
      return {code: 3, error_message: `No write_function permission on: ${functionPath}`};
    }
    const fullPath = this.getFullPath(localPath, PredefinedDbPaths.FUNCTIONS_ROOT);
    const functionInfoCopy = ChainUtil.isDict(functionInfo) ?
        JSON.parse(JSON.stringify(functionInfo)) : functionInfo;
    this.writeDatabase(fullPath, functionInfoCopy);
    return true;
  }

  // TODO(seo): Add rule config sanitization logic (e.g. dup path variables,
  //            multiple path variables).
  setRule(rulePath, rule, address, isGlobal) {
    const isValidObj = isValidJsObjectForStates(rule);
    if (!isValidObj.isValid) {
      return {code: 6, error_message: `Invalid object for states: ${isValidObj.invalidPath}`};
    }
    const parsedPath = ChainUtil.parsePath(rulePath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return {code: 7, error_message: `Invalid path: ${isValidPath.invalidPath}`};
    }
    const localPath = isGlobal === true ? this.toLocalPath(parsedPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return true;
    }
    if (!this.getPermissionForRule(localPath, address)) {
      return {code: 3, error_message: `No write_rule permission on: ${rulePath}`};
    }
    const fullPath = this.getFullPath(localPath, PredefinedDbPaths.RULES_ROOT);
    const ruleCopy = ChainUtil.isDict(rule) ? JSON.parse(JSON.stringify(rule)) : rule;
    this.writeDatabase(fullPath, ruleCopy);
    return true;
  }

  // TODO(seo): Add owner config sanitization logic.
  setOwner(ownerPath, owner, address, isGlobal) {
    const isValidObj = isValidJsObjectForStates(owner);
    if (!isValidObj.isValid) {
      return {code: 6, error_message: `Invalid object for states: ${isValidObj.invalidPath}`};
    }
    const parsedPath = ChainUtil.parsePath(ownerPath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return {code: 7, error_message: `Invalid path: ${isValidPath.invalidPath}`};
    }
    const localPath = isGlobal === true ? this.toLocalPath(parsedPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return true;
    }
    if (!this.getPermissionForOwner(localPath, address)) {
      return {code: 4, error_message: `No write_owner or branch_owner permission on: ${ownerPath}`};
    }
    const fullPath = this.getFullPath(localPath, PredefinedDbPaths.OWNERS_ROOT);
    const ownerCopy = ChainUtil.isDict(owner) ? JSON.parse(JSON.stringify(owner)) : owner;
    this.writeDatabase(fullPath, ownerCopy);
    return true;
  }

  // TODO(seo): Make this operation atomic, i.e., rolled back when it fails.
  set(opList, address, timestamp, transaction) {
    let ret = true;
    for (let i = 0; i < opList.length; i++) {
      const op = opList[i];
      if (op.type === undefined || op.type === WriteDbOperations.SET_VALUE) {
        ret = this.setValue(op.ref, op.value, address, timestamp, transaction, op.is_global);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.INC_VALUE) {
        ret = this.incValue(op.ref, op.value, address, timestamp, transaction, op.is_global);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.DEC_VALUE) {
        ret = this.decValue(op.ref, op.value, address, timestamp, transaction, op.is_global);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.SET_FUNCTION) {
        ret = this.setFunction(op.ref, op.value, address, op.is_global);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.SET_RULE) {
        ret = this.setRule(op.ref, op.value, address, op.is_global);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.SET_OWNER) {
        ret = this.setOwner(op.ref, op.value, address, op.is_global);
        if (ret !== true) {
          break;
        }
      } else {
        // Invalid Operation
        return {code: 5, error_message: `Invalid opeartion type: ${op.type}`};
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
        logger.info(message);
      } else {
        switch(operation.type) {
          case undefined:
          case WriteDbOperations.SET_VALUE:
          case WriteDbOperations.INC_VALUE:
          case WriteDbOperations.DEC_VALUE:
          case WriteDbOperations.SET_FUNCTION:
          case WriteDbOperations.SET_RULE:
          case WriteDbOperations.SET_OWNER:
          case WriteDbOperations.SET:
            resultList.push(this.executeOperation(operation, tx.address, tx.timestamp, tx));
            break;
          default:
            const message = `Invalid operation type: ${operation.type}`;
            resultList.push({ code: 2, error_message: message });
            logger.info(message);
        }
      }
    });
    return resultList;
  }

  /**
   * Returns full path with given root node.
   */
  getFullPath(parsedPath, rootLabel) {
    const fullPath = parsedPath.slice();
    fullPath.unshift(rootLabel);
    return fullPath;
  }

  /**
   * Converts to local path by removing the sharding path part of the given parsed path.
   */
  toLocalPath(parsedPath) {
    if (this.isRoot) {
      return parsedPath;
    }
    if (parsedPath.length < this.shardingPath.length) {
      return null;
    }
    for (let i = 0; i < this.shardingPath.length; i++) {
      if (parsedPath[i] !== this.shardingPath[i]) {
        return null;
      }
    }
    return parsedPath.slice(this.shardingPath.length);
  }

  /**
   * Converts to global path by adding the sharding path to the front of the given parsed path.
   */
  toGlobalPath(parsedPath) {
    if (this.isRoot) {
      return parsedPath;
    }
    const globalPath = parsedPath.slice();
    globalPath.unshift(...this.shardingPath);
    return globalPath;
  }

  setDbToSnapshot(snapshot) {
    this.stateTree = makeCopyOfStateTree(snapshot.stateTree);
  }

  executeOperation(op, address, timestamp, tx) {
    if (!op) {
      return null;
    }
    switch (op.type) {
      case undefined:
      case WriteDbOperations.SET_VALUE:
        return this.setValue(op.ref, op.value, address, timestamp, tx, op.is_global);
      case WriteDbOperations.INC_VALUE:
        return this.incValue(op.ref, op.value, address, timestamp, tx, op.is_global);
      case WriteDbOperations.DEC_VALUE:
        return this.decValue(op.ref, op.value, address, timestamp, tx, op.is_global);
      case WriteDbOperations.SET_FUNCTION:
        return this.setFunction(op.ref, op.value, address, op.is_global);
      case WriteDbOperations.SET_RULE:
        return this.setRule(op.ref, op.value, address, op.is_global);
      case WriteDbOperations.SET_OWNER:
        return this.setOwner(op.ref, op.value, address, op.is_global);
      case WriteDbOperations.SET:
        return this.set(op.op_list, address, timestamp, tx);
    }
  }

  executeTransaction(tx) {
    if (Transaction.isBatchTransaction(tx)) {
      return this.batch(tx.tx_list);
    }
    return this.executeOperation(tx.operation, tx.address, tx.timestamp, tx);
  }

  executeTransactionList(txList) {
    for (const tx of txList) {
      const res = this.executeTransaction(tx);
      if (ChainUtil.transactionFailed(res)) {
        // FIXME: remove the failed transaction from tx pool?
        logger.error(`[executeTransactionList] tx failed: ${JSON.stringify(tx, null, 2)}\nresult: ${JSON.stringify(res)}`);
        return false;
      }
    }
    return true;
  }

  addPathToValue(value, matchedValuePath, closestConfigDepth) {
    const pathToAdd = matchedValuePath.slice(closestConfigDepth, matchedValuePath.length);
    let newValue = value;
    for (let i = pathToAdd.length - 1; i >= 0; i--) {
      newValue = { [pathToAdd[i]]: newValue };
    }
    return newValue;
  }

  // TODO(seo): Eval subtree rules.
  getPermissionForValue(parsedValuePath, newValue, address, timestamp) {
    const matched = this.matchRuleForParsedPath(parsedValuePath);
    const value = this.getValue(ChainUtil.formatPath(parsedValuePath));
    const data =
        this.addPathToValue(value, matched.matchedValuePath, matched.closestRule.path.length);
    const newData =
        this.addPathToValue(newValue, matched.matchedValuePath, matched.closestRule.path.length);
    return !!this.evalRuleString(
        matched.closestRule.config, matched.pathVars, data, newData, address, timestamp);
  }

  getPermissionForRule(parsedRulePath, address) {
    const matched = this.matchOwnerForParsedPath(parsedRulePath);
    return this.checkPermission(matched.closestOwner.config, address, OwnerProperties.WRITE_RULE);
  }

  getPermissionForFunction(parsedFuncPath, address) {
    const matched = this.matchOwnerForParsedPath(parsedFuncPath);
    return this.checkPermission(
        matched.closestOwner.config, address, OwnerProperties.WRITE_FUNCTION);
  }

  getPermissionForOwner(parsedOwnerPath, address) {
    const matched = this.matchOwnerForParsedPath(parsedOwnerPath);
    if (matched.closestOwner.path.length === parsedOwnerPath.length) {
      return this.checkPermission(
          matched.closestOwner.config, address, OwnerProperties.WRITE_OWNER);
    } else {
      return this.checkPermission(
          matched.closestOwner.config, address, OwnerProperties.BRANCH_OWNER);
    }
  }

  static getVariableLabel(node) {
    if (!node.getIsLeaf()) {
      for (const label of node.getChildLabels()) {
        if (label.startsWith('$')) {
          // It's assumed that there is at most one variable (i.e., with '$') child node.
          return label;
        }
      }
    }
    return null;
  }

  // Does a DFS search to find most specific nodes matched in the function tree.
  matchFunctionPathRecursive(parsedValuePath, depth, curFuncNode) {
    // Maximum depth reached.
    if (depth === parsedValuePath.length) {
      return {
        matchedValuePath: [],
        matchedFunctionPath: [],
        pathVars: {},
        matchedFunctionNode: curFuncNode,
      };
    }
    if (curFuncNode) {
      // 1) Try to match with non-variable child node.
      const nextFuncNode = curFuncNode.getChild(parsedValuePath[depth]);
      if (nextFuncNode !== null) {
        const matched = this.matchFunctionPathRecursive(parsedValuePath, depth + 1, nextFuncNode);
        matched.matchedValuePath.unshift(parsedValuePath[depth]);
        matched.matchedFunctionPath.unshift(parsedValuePath[depth]);
        return matched;
      }
      // 2) If no non-variable child node is matched, try to match with variable (i.e., with '$')
      //    child node.
      const varLabel = DB.getVariableLabel(curFuncNode);
      if (varLabel !== null) {
        const nextFuncNode = curFuncNode.getChild(varLabel);
        const matched = this.matchFunctionPathRecursive(parsedValuePath, depth + 1, nextFuncNode);
        matched.matchedValuePath.unshift(parsedValuePath[depth]);
        matched.matchedFunctionPath.unshift(varLabel);
        if (matched.pathVars[varLabel] !== undefined) {
          // This should not happen!
          logger.error('Duplicated path variables that should NOT happen!')
        } else {
          matched.pathVars[varLabel] = parsedValuePath[depth];
        }
        return matched;
      }
    }
    // No match with child nodes.
    return {
      matchedValuePath: [],
      matchedFunctionPath: [],
      pathVars: {},
      matchedFunctionNode: null,
    };
  }

  matchFunctionPath(parsedValuePath) {
    return this.matchFunctionPathRecursive(
        parsedValuePath, 0, this.stateTree.getChild(PredefinedDbPaths.FUNCTIONS_ROOT));
  }

  getSubtreeFunctionsRecursive(depth, curFuncNode) {
    const funcs = [];
    if (depth !== 0 && hasFunctionConfig(curFuncNode)) {
      funcs.push({
        path: [],
        config: getFunctionConfig(curFuncNode),
      })
    }
    if (curFuncNode && !curFuncNode.getIsLeaf()) {
      const varLabel = DB.getVariableLabel(curFuncNode);
      // 1) Traverse non-variable child nodes.
      for (const label of curFuncNode.getChildLabels()) {
        const nextFuncNode = curFuncNode.getChild(label);
        if (label !== varLabel) {
          const subtreeFuncs = this.getSubtreeFunctionsRecursive(depth + 1, nextFuncNode);
          subtreeFuncs.forEach((entry) => {
            entry.path.unshift(label);
            funcs.push(entry);
          });
        }
      }
      // 2) Traverse variable child node if available.
      if (varLabel !== null) {
        const nextFuncNode = curFuncNode.getChild(varLabel);
        const subtreeFuncs = this.getSubtreeFunctionsRecursive(depth + 1, nextFuncNode);
        subtreeFuncs.forEach((entry) => {
          entry.path.unshift(varLabel);
          funcs.push(entry);
        });
      }
    }
    return funcs;
  }

  getSubtreeFunctions(funcNode) {
    return this.getSubtreeFunctionsRecursive(0, funcNode);
  }

  matchFunctionForParsedPath(parsedValuePath) {
    const matched = this.matchFunctionPath(parsedValuePath);
    const subtreeFunctions = this.getSubtreeFunctions(matched.matchedFunctionNode);
    let matchedConfig = null;
    if (matched.matchedFunctionPath.length === parsedValuePath.length &&
        hasFunctionConfig(matched.matchedFunctionNode)) {
      matchedConfig = getFunctionConfig(matched.matchedFunctionNode);
    }
    return {
      matchedValuePath: matched.matchedValuePath,
      matchedFunctionPath: matched.matchedFunctionPath,
      pathVars: matched.pathVars,
      matchedFunction: {
        path: matched.matchedFunctionPath,
        config: matchedConfig,
      },
      subtreeFunctions,
    }
  }

  convertPathAndConfig(pathAndConfig, isGlobal) {
    const path = (isGlobal === true) ? this.toGlobalPath(pathAndConfig.path) : pathAndConfig.path;
    return {
      path: ChainUtil.formatPath(path),
      config: pathAndConfig.config,
    }
  }

  convertFunctionMatch(matched, isGlobal) {
    const functionPath = (isGlobal === true) ?
        this.toGlobalPath(matched.matchedFunctionPath) : matched.matchedFunctionPath;
    const valuePath = (isGlobal === true) ?
        this.toGlobalPath(matched.matchedValuePath) : matched.matchedValuePath;
    const subtreeFunctions =
        matched.subtreeFunctions.map(entry => this.convertPathAndConfig(entry, false));
    return {
      matched_path: {
        target_path: ChainUtil.formatPath(functionPath),
        ref_path: ChainUtil.formatPath(valuePath),
        path_vars: matched.pathVars,
      },
      matched_config: this.convertPathAndConfig(matched.matchedFunction, isGlobal),
      subtree_configs: subtreeFunctions,
    };
  }

  // Does a DFS search to find most specific nodes matched in the rule tree.
  matchRulePathRecursive(parsedValuePath, depth, curRuleNode) {
    // Maximum depth reached.
    if (depth === parsedValuePath.length) {
      return {
        matchedValuePath: [],
        matchedRulePath: [],
        pathVars: {},
        matchedRuleNode: curRuleNode,
        closestConfigNode: hasRuleConfig(curRuleNode) ? curRuleNode : null,
        closestConfigDepth: hasRuleConfig(curRuleNode) ? depth : 0,
      };
    }
    if (curRuleNode) {
      // 1) Try to match with non-variable child node.
      const nextRuleNode = curRuleNode.getChild(parsedValuePath[depth]);
      if (nextRuleNode !== null) {
        const matched = this.matchRulePathRecursive(parsedValuePath, depth + 1, nextRuleNode);
        matched.matchedValuePath.unshift(parsedValuePath[depth]);
        matched.matchedRulePath.unshift(parsedValuePath[depth]);
        if (!matched.closestConfigNode && hasRuleConfig(curRuleNode)) {
          matched.closestConfigNode = curRuleNode;
          matched.closestConfigDepth = depth;
        }
        return matched;
      }
      // 2) If no non-variable child node is matched, try to match with variable (i.e., with '$')
      //    child node.
      const varLabel = DB.getVariableLabel(curRuleNode);
      if (varLabel !== null) {
        const nextRuleNode = curRuleNode.getChild(varLabel);
        const matched = this.matchRulePathRecursive(parsedValuePath, depth + 1, nextRuleNode);
        matched.matchedValuePath.unshift(parsedValuePath[depth]);
        matched.matchedRulePath.unshift(varLabel);
        if (matched.pathVars[varLabel] !== undefined) {
          // This should not happen!
          logger.error('Duplicated path variables that should NOT happen!')
        } else {
          matched.pathVars[varLabel] = parsedValuePath[depth];
        }
        if (!matched.closestConfigNode && hasRuleConfig(curRuleNode)) {
          matched.closestConfigNode = curRuleNode;
          matched.closestConfigDepth = depth;
        }
        return matched;
      }
    }
    // No match with child nodes.
    return {
      matchedValuePath: [],
      matchedRulePath: [],
      pathVars: {},
      matchedRuleNode: curRuleNode,
      closestConfigNode: hasRuleConfig(curRuleNode) ? curRuleNode : null,
      closestConfigDepth: hasRuleConfig(curRuleNode) ? depth : 0,
    };
  }

  matchRulePath(parsedValuePath) {
    return this.matchRulePathRecursive(
        parsedValuePath, 0, this.stateTree.getChild(PredefinedDbPaths.RULES_ROOT));
  }

  getSubtreeRulesRecursive(depth, curRuleNode) {
    const rules = [];
    if (depth !== 0 && hasRuleConfig(curRuleNode)) {
      rules.push({
        path: [],
        config: getRuleConfig(curRuleNode),
      })
    }
    if (curRuleNode && !curRuleNode.getIsLeaf()) {
      const varLabel = DB.getVariableLabel(curRuleNode);
      // 1) Traverse non-variable child nodes.
      for (const label of curRuleNode.getChildLabels()) {
        const nextRuleNode = curRuleNode.getChild(label);
        if (label !== varLabel) {
          const subtreeRules = this.getSubtreeRulesRecursive(depth + 1, nextRuleNode);
          subtreeRules.forEach((entry) => {
            entry.path.unshift(label);
            rules.push(entry);
          });
        }
      }
      // 2) Traverse variable child node if available.
      if (varLabel !== null) {
        const nextRuleNode = curRuleNode.getChild(varLabel);
        const subtreeRules = this.getSubtreeRulesRecursive(depth + 1, nextRuleNode);
        subtreeRules.forEach((entry) => {
          entry.path.unshift(varLabel);
          rules.push(entry);
        });
      }
    }
    return rules;
  }

  getSubtreeRules(ruleNode) {
    return this.getSubtreeRulesRecursive(0, ruleNode);
  }

  matchRuleForParsedPath(parsedValuePath) {
    const matched = this.matchRulePath(parsedValuePath);
    const subtreeRules = this.getSubtreeRules(matched.matchedRuleNode);
    return {
      matchedValuePath: matched.matchedValuePath,
      matchedRulePath: matched.matchedRulePath,
      pathVars: matched.pathVars,
      closestRule: {
        path: matched.matchedRulePath.slice(0, matched.closestConfigDepth),
        config: getRuleConfig(matched.closestConfigNode),
      },
      subtreeRules,
    }
  }

  convertRuleMatch(matched, isGlobal) {
    const rulePath = (isGlobal === true) ?
        this.toGlobalPath(matched.matchedRulePath) : matched.matchedRulePath;
    const valuePath = (isGlobal === true) ?
        this.toGlobalPath(matched.matchedValuePath) : matched.matchedValuePath;
    const subtreeRules = matched.subtreeRules.map(entry => this.convertPathAndConfig(entry, false));
    return {
      matched_path: {
        target_path: ChainUtil.formatPath(rulePath),
        ref_path: ChainUtil.formatPath(valuePath),
        path_vars: matched.pathVars,
      },
      matched_config: this.convertPathAndConfig(matched.closestRule, isGlobal),
      subtree_configs: subtreeRules,
    };
  }

  makeEvalFunction(ruleString, pathVars) {
    return new Function('auth', 'data', 'newData', 'currentTime',
                        'getValue', 'getRule', 'getFunction', 'getOwner',
                        'evalRule', 'evalOwner', 'util', 'lastBlockNumber', ...Object.keys(pathVars),
                        '"use strict"; return ' + ruleString);
  }

  evalRuleString(ruleString, pathVars, data, newData, address, timestamp) {
    if (typeof ruleString === 'boolean') {
      return ruleString;
    } else if (typeof ruleString !== 'string') {
      return false;
    }
    const evalFunc = this.makeEvalFunction(ruleString, pathVars);
    return evalFunc(address, data, newData, timestamp, this.getValue.bind(this),
                    this.getRule.bind(this), this.getFunction.bind(this), this.getOwner.bind(this),
                    this.evalRule.bind(this), this.evalOwner.bind(this),
                    new RuleUtil(), this.lastBlockNumber(), ...Object.values(pathVars));
  }

  lastBlockNumber() {
    return !!this.bc ? this.bc.lastBlockNumber() : this.blockNumberSnapshot;
  }

  matchOwnerPathRecursive(parsedRefPath, depth, curOwnerNode) {
    // Maximum depth reached.
    if (depth === parsedRefPath.length) {
      return {
        matchedDepth: depth,
        closestConfigNode: hasOwnerConfig(curOwnerNode) ? curOwnerNode : null,
        closestConfigDepth: hasOwnerConfig(curOwnerNode) ? depth : 0,
      };
    }
    if (curOwnerNode) {
      const nextOwnerNode = curOwnerNode.getChild(parsedRefPath[depth]);
      if (nextOwnerNode !== null) {
        const matched = this.matchOwnerPathRecursive(parsedRefPath, depth + 1, nextOwnerNode);
        if (!matched.closestConfigNode && hasOwnerConfig(curOwnerNode)) {
          matched.closestConfigNode = curOwnerNode;
          matched.closestConfigDepth = depth;
        }
        return matched;
      }
    }
    // No match with child nodes.
    return {
      matchedDepth: depth,
      closestConfigNode: hasOwnerConfig(curOwnerNode) ? curOwnerNode : null,
      closestConfigDepth: hasOwnerConfig(curOwnerNode) ? depth : 0,
    };
  }

  matchOwnerPath(parsedRefPath) {
    return this.matchOwnerPathRecursive(
        parsedRefPath, 0, this.stateTree.getChild(PredefinedDbPaths.OWNERS_ROOT));
  }

  matchOwnerForParsedPath(parsedRefPath) {
    const matched = this.matchOwnerPath(parsedRefPath);
    return {
      matchedOwnerPath: parsedRefPath.slice(0, matched.matchedDepth),
      closestOwner: {
        path: parsedRefPath.slice(0, matched.closestConfigDepth),
        config: getOwnerConfig(matched.closestConfigNode),
      },
    }
  }

  convertOwnerMatch(matched, isGlobal) {
    const ownerPath = (isGlobal === true) ?
        this.toGlobalPath(matched.matchedOwnerPath) : matched.matchedOwnerPath;
    return {
      matched_path: {
        target_path: ChainUtil.formatPath(ownerPath),
      },
      matched_config: this.convertPathAndConfig(matched.closestOwner, isGlobal),
    };
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

  checkPermission(config, address, permission) {
    const permissions = this.getOwnerPermissions(config, address);
    return !!(permissions && permissions[permission] === true);
  }
}

module.exports = DB;
