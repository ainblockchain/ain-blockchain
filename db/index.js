const logger = require('../logger');
const {
  ReadDbOperations, WriteDbOperations, PredefinedDbPaths, OwnerProperties, RuleProperties,
  FunctionProperties, DEBUG
} = require('../constants');
const ChainUtil = require('../chain-util');
const Transaction = require('../tx-pool/transaction');
const StateNode = require('./state-node');
const {
  isValidPathForStates,
  isValidJsObjectForStates,
  jsObjectToStateTree,
  stateTreeToJsObject,
  makeCopyOfStateTree,
  setProofHashForStateTree,
  updateProofHashForPath
} = require('./state-util');
const Functions = require('./functions');
const RuleUtil = require('./rule-util');

class DB {
  constructor(bc, blockNumberSnapshot) {
    this.dbRoot = new StateNode();
    this.initDbData();
    this.func = new Functions(this);
    this.bc = bc;
    this.blockNumberSnapshot = blockNumberSnapshot;
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

  /**
   * Returns reference to the input path for reading if exists, otherwise null.
   */
  getRefForReading(fullPath) {
    let node = this.dbRoot;
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
    let node = this.dbRoot;
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

  writeDatabase(fullPath, value) {
    const valueTree = jsObjectToStateTree(value);
    const pathToParent = fullPath.slice().splice(0, fullPath.length - 1);
    if (fullPath.length === 0) {
      this.dbRoot = valueTree;
    } else {
      const label = fullPath[fullPath.length - 1];
      const parent = this.getRefForWriting(pathToParent);
      parent.setChild(label, valueTree);
    }
    if (DB.isEmptyNode(valueTree)) {
      this.removeEmptyNodes(fullPath);
    } else {
      setProofHashForStateTree(valueTree);
    }
    updateProofHashForPath(pathToParent, this.dbRoot);
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
    return this.removeEmptyNodesRecursive(fullPath, 0, this.dbRoot);
  }

  readDatabase(fullPath) {
    const node = this.getRefForReading(fullPath);
    return stateTreeToJsObject(node);
  }

  getValue(valuePath) {
    const parsedPath = ChainUtil.parsePath(valuePath);
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.VALUES_ROOT);
    return this.readDatabase(fullPath);
  }

  getFunction(functionPath) {
    const parsedPath = ChainUtil.parsePath(functionPath);
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.FUNCTIONS_ROOT);
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

  matchFunction(funcPath) {
    const parsedPath = ChainUtil.parsePath(funcPath);
    return this.convertFunctionMatch(this.matchFunctionForParsedPath(parsedPath));
  }

  matchRule(valuePath) {
    const parsedPath = ChainUtil.parsePath(valuePath);
    return this.convertRuleMatch(this.matchRuleForParsedPath(parsedPath));
  }

  matchOwner(rulePath) {
    const parsedPath = ChainUtil.parsePath(rulePath);
    return this.convertOwnerMatch(this.matchOwnerForParsedPath(parsedPath));
  }

  evalRule(valuePath, value, address, timestamp) {
    const parsedPath = ChainUtil.parsePath(valuePath);
    return this.getPermissionForValue(parsedPath, value, address, timestamp);
  }

  evalOwner(refPath, permission, address) {
    const parsedPath = ChainUtil.parsePath(refPath);
    const matched = this.matchOwnerForParsedPath(parsedPath);
    return this.checkPermission(matched.closestOwner.config, address, permission);
  }

  get(opList) {
    const resultList = [];
    opList.forEach((item) => {
      if (item.type === undefined || item.type === ReadDbOperations.GET_VALUE) {
        resultList.push(this.getValue(item.ref));
      } else if (item.type === ReadDbOperations.GET_RULE) {
        resultList.push(this.getRule(item.ref));
      } else if (item.type === ReadDbOperations.GET_FUNCTION) {
        resultList.push(this.getFunction(item.ref));
      } else if (item.type === ReadDbOperations.GET_OWNER) {
        resultList.push(this.getOwner(item.ref));
      } else if (item.type === ReadDbOperations.MATCH_FUNCTION) {
        resultList.push(this.matchFunction(item.ref));
      } else if (item.type === ReadDbOperations.MATCH_RULE) {
        resultList.push(this.matchRule(item.ref));
      } else if (item.type === ReadDbOperations.MATCH_OWNER) {
        resultList.push(this.matchOwner(item.ref));
      } else if (item.type === ReadDbOperations.EVAL_RULE) {
        resultList.push(
            this.evalRule(item.ref, item.value, item.address, item.timestamp || Date.now()));
      } else if (item.type === ReadDbOperations.EVAL_OWNER) {
        resultList.push(this.evalOwner(item.ref, item.permission, item.address));
      }
    });
    return resultList;
  }

  // TODO(seo): Add dbPath validity check (e.g. '$', '.', etc).
  // TODO(seo): Define error code explicitly.
  // TODO(seo): Consider making set operation and native function run tightly bound, i.e., revert
  //            the former if the latter fails.
  setValue(valuePath, value, address, timestamp, transaction) {
    const isValidObj = isValidJsObjectForStates(value);
    if (!isValidObj.isValid) {
      return {code: 6, error_message: `Invalid object for states: ${isValidObj.invalidPath}`};
    }
    const parsedPath = ChainUtil.parsePath(valuePath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return {code: 7, error_message: `Invalid path: ${isValidPath.invalidPath}`};
    }
    if (!this.getPermissionForValue(parsedPath, value, address, timestamp)) {
      return {code: 2, error_message: `No .write permission on: ${valuePath}`};
    }
    const valueCopy = ChainUtil.isDict(value) ? JSON.parse(JSON.stringify(value)) : value;
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.VALUES_ROOT);
    this.writeDatabase(fullPath, valueCopy);
    this.func.triggerFunctions(parsedPath, valueCopy, timestamp, Date.now(), transaction);
    return true;
  }

  incValue(valuePath, delta, address, timestamp, transaction) {
    const valueBefore = this.getValue(valuePath);
    if (DEBUG) {
      logger.debug(`VALUE BEFORE:  ${JSON.stringify(valueBefore)}`);
    }
    if ((valueBefore && typeof valueBefore !== 'number') || typeof delta !== 'number') {
      return {code: 1, error_message: `Not a number type: ${valueBefore} or ${delta}`};
    }
    const valueAfter = (valueBefore === undefined ? 0 : valueBefore) + delta;
    return this.setValue(valuePath, valueAfter, address, timestamp, transaction);
  }

  decValue(valuePath, delta, address, timestamp, transaction) {
    const valueBefore = this.getValue(valuePath);
    if (DEBUG) {
      logger.debug(`VALUE BEFORE:  ${JSON.stringify(valueBefore)}`);
    }
    if ((valueBefore && typeof valueBefore !== 'number') || typeof delta !== 'number') {
      return {code: 1, error_message: `Not a number type: ${valueBefore} or ${delta}`};
    }
    const valueAfter = (valueBefore === undefined ? 0 : valueBefore) - delta;
    return this.setValue(valuePath, valueAfter, address, timestamp, transaction);
  }

  setFunction(functionPath, functionInfo, address) {
    const isValidObj = isValidJsObjectForStates(functionInfo);
    if (!isValidObj.isValid) {
      return {code: 6, error_message: `Invalid object for states: ${isValidObj.invalidPath}`};
    }
    const parsedPath = ChainUtil.parsePath(functionPath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return {code: 7, error_message: `Invalid path: ${isValidPath.invalidPath}`};
    }
    if (!this.getPermissionForFunction(parsedPath, address)) {
      return {code: 3, error_message: `No write_function permission on: ${functionPath}`};
    }
    const functionInfoCopy = ChainUtil.isDict(functionInfo) ?
        JSON.parse(JSON.stringify(functionInfo)) : functionInfo;
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.FUNCTIONS_ROOT);
    this.writeDatabase(fullPath, functionInfoCopy);
    return true;
  }

  // TODO(seo): Add rule config sanitization logic (e.g. dup path variables,
  //            multiple path variables).
  setRule(rulePath, rule, address) {
    const isValidObj = isValidJsObjectForStates(rule);
    if (!isValidObj.isValid) {
      return {code: 6, error_message: `Invalid object for states: ${isValidObj.invalidPath}`};
    }
    const parsedPath = ChainUtil.parsePath(rulePath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return {code: 7, error_message: `Invalid path: ${isValidPath.invalidPath}`};
    }
    if (!this.getPermissionForRule(parsedPath, address)) {
      return {code: 3, error_message: `No write_rule permission on: ${rulePath}`};
    }
    const ruleCopy = ChainUtil.isDict(rule) ? JSON.parse(JSON.stringify(rule)) : rule;
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.RULES_ROOT);
    this.writeDatabase(fullPath, ruleCopy);
    return true;
  }

  // TODO(seo): Add owner config sanitization logic.
  setOwner(ownerPath, owner, address) {
    const isValidObj = isValidJsObjectForStates(owner);
    if (!isValidObj.isValid) {
      return {code: 6, error_message: `Invalid object for states: ${isValidObj.invalidPath}`};
    }
    const parsedPath = ChainUtil.parsePath(ownerPath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return {code: 7, error_message: `Invalid path: ${isValidPath.invalidPath}`};
    }
    if (!this.getPermissionForOwner(parsedPath, address)) {
      return {code: 4, error_message: `No write_owner or branch_owner permission on: ${ownerPath}`};
    }
    const ownerCopy = ChainUtil.isDict(owner) ? JSON.parse(JSON.stringify(owner)) : owner;
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.OWNERS_ROOT);
    this.writeDatabase(fullPath, ownerCopy);
    return true;
  }

  // TODO(seo): Make this operation atomic, i.e., rolled back when it fails.
  set(opList, address, timestamp, transaction) {
    let ret = true;
    for (let i = 0; i < opList.length; i++) {
      const op = opList[i];
      if (op.type === undefined || op.type === WriteDbOperations.SET_VALUE) {
        ret = this.setValue(op.ref, op.value, address, timestamp, transaction);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.INC_VALUE) {
        ret = this.incValue(op.ref, op.value, address, timestamp, transaction);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.DEC_VALUE) {
        ret = this.decValue(op.ref, op.value, address, timestamp, transaction);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.SET_FUNCTION) {
        ret = this.setFunction(op.ref, op.value, address);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.SET_RULE) {
        ret = this.setRule(op.ref, op.value, address);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.SET_OWNER) {
        ret = this.setOwner(op.ref, op.value, address);
        if (ret !== true) {
          break;
        }
      } else {
        // Invalid Operation
        return {code: 5, error_message: `Invalid opeartionn type: ${op.type}`};
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
   *  Returns full path with given root node.
   */
  getFullPath(parsedPath, root) {
    const fullPath = parsedPath.slice();
    fullPath.unshift(root);
    return fullPath;
  }

  setDbToSnapshot(snapshot) {
    this.dbRoot = makeCopyOfStateTree(snapshot.dbRoot);
  }

  executeOperation(operation, address, timestamp, transaction) {
    if (!operation) {
      return null;
    }
    switch (operation.type) {
      case undefined:
      case WriteDbOperations.SET_VALUE:
        return this.setValue(operation.ref, operation.value, address, timestamp, transaction);
      case WriteDbOperations.INC_VALUE:
        return this.incValue(operation.ref, operation.value, address, timestamp, transaction);
      case WriteDbOperations.DEC_VALUE:
        return this.decValue(operation.ref, operation.value, address, timestamp, transaction);
      case WriteDbOperations.SET_FUNCTION:
        return this.setFunction(operation.ref, operation.value, address);
      case WriteDbOperations.SET_RULE:
        return this.setRule(operation.ref, operation.value, address);
      case WriteDbOperations.SET_OWNER:
        return this.setOwner(operation.ref, operation.value, address);
      case WriteDbOperations.SET:
        return this.set(operation.op_list, address, timestamp, transaction);
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

  static hasConfig(node, label) {
    return node && node.hasChild(label);
  }

  static getConfig(node, label) {
    return DB.hasConfig(node, label) ? stateTreeToJsObject(node.getChild(label)) : null;
  }

  static hasFunctionConfig(funcNode) {
    return DB.hasConfig(funcNode, FunctionProperties.FUNCTION);
  }

  static getFunctionConfig(funcNode) {
    return DB.getConfig(funcNode, FunctionProperties.FUNCTION);
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
        parsedValuePath, 0, this.dbRoot.getChild(PredefinedDbPaths.FUNCTIONS_ROOT));
  }

  getSubtreeFunctionsRecursive(depth, curFuncNode) {
    const funcs = [];
    if (depth !== 0 && DB.hasFunctionConfig(curFuncNode)) {
      funcs.push({
        path: [],
        config: DB.getFunctionConfig(curFuncNode),
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
        DB.hasFunctionConfig(matched.matchedFunctionNode)) {
      matchedConfig = DB.getFunctionConfig(matched.matchedFunctionNode);
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

  convertPathAndConfig(pathAndConfig) {
    return {
      path: ChainUtil.formatPath(pathAndConfig.path),
      config: pathAndConfig.config,
    }
  }

  convertFunctionMatch(matched) {
    const subtreeFunctions =
        matched.subtreeFunctions.map(entry => this.convertPathAndConfig(entry));
    return {
      matched_path: {
        target_path: ChainUtil.formatPath(matched.matchedFunctionPath),
        ref_path: ChainUtil.formatPath(matched.matchedValuePath),
        path_vars: matched.pathVars,
      },
      matched_config: this.convertPathAndConfig(matched.matchedFunction),
      subtree_configs: subtreeFunctions,
    };
  }

  static hasRuleConfig(ruleNode) {
    return DB.hasConfig(ruleNode, RuleProperties.WRITE);
  }

  static getRuleConfig(ruleNode) {
    return DB.getConfig(ruleNode, RuleProperties.WRITE);
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
        closestConfigNode: DB.hasRuleConfig(curRuleNode) ? curRuleNode : null,
        closestConfigDepth: DB.hasRuleConfig(curRuleNode) ? depth : 0,
      };
    }
    if (curRuleNode) {
      // 1) Try to match with non-variable child node.
      const nextRuleNode = curRuleNode.getChild(parsedValuePath[depth]);
      if (nextRuleNode !== null) {
        const matched = this.matchRulePathRecursive(parsedValuePath, depth + 1, nextRuleNode);
        matched.matchedValuePath.unshift(parsedValuePath[depth]);
        matched.matchedRulePath.unshift(parsedValuePath[depth]);
        if (!matched.closestConfigNode && DB.hasRuleConfig(curRuleNode)) {
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
        if (!matched.closestConfigNode && DB.hasRuleConfig(curRuleNode)) {
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
      closestConfigNode: DB.hasRuleConfig(curRuleNode) ? curRuleNode : null,
      closestConfigDepth: DB.hasRuleConfig(curRuleNode) ? depth : 0,
    };
  }

  matchRulePath(parsedValuePath) {
    return this.matchRulePathRecursive(
        parsedValuePath, 0, this.dbRoot.getChild(PredefinedDbPaths.RULES_ROOT));
  }

  getSubtreeRulesRecursive(depth, curRuleNode) {
    const rules = [];
    if (depth !== 0 && DB.hasRuleConfig(curRuleNode)) {
      rules.push({
        path: [],
        config: DB.getRuleConfig(curRuleNode),
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
        config: DB.getRuleConfig(matched.closestConfigNode),
      },
      subtreeRules,
    }
  }

  convertRuleMatch(matched) {
    const subtreeRules = matched.subtreeRules.map(entry => this.convertPathAndConfig(entry));
    return {
      matched_path: {
        target_path: ChainUtil.formatPath(matched.matchedRulePath),
        ref_path: ChainUtil.formatPath(matched.matchedValuePath),
        path_vars: matched.pathVars,
      },
      matched_config: this.convertPathAndConfig(matched.closestRule),
      subtree_configs: subtreeRules,
    };
  }

  makeEvalFunction(ruleString, pathVars) {
    return new Function('auth', 'data', 'newData', 'currentTime', 'getValue', 'getRule',
                        'getFunction', 'getOwner', 'util', 'lastBlockNumber', ...Object.keys(pathVars),
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
                    new RuleUtil(), this.lastBlockNumber(), ...Object.values(pathVars));
  }

  lastBlockNumber() {
    return !!this.bc ? this.bc.lastBlockNumber() : this.blockNumberSnapshot;
  }

  static hasOwnerConfig(ownerNode) {
    return DB.hasConfig(ownerNode, OwnerProperties.OWNER);
  }

  static getOwnerConfig(ownerNode) {
    return DB.getConfig(ownerNode, OwnerProperties.OWNER);
  }

  matchOwnerPathRecursive(parsedRefPath, depth, curOwnerNode) {
    // Maximum depth reached.
    if (depth === parsedRefPath.length) {
      return {
        matchedDepth: depth,
        closestConfigNode: DB.hasOwnerConfig(curOwnerNode) ? curOwnerNode : null,
        closestConfigDepth: DB.hasOwnerConfig(curOwnerNode) ? depth : 0,
      };
    }
    if (curOwnerNode) {
      const nextOwnerNode = curOwnerNode.getChild(parsedRefPath[depth]);
      if (nextOwnerNode !== null) {
        const matched = this.matchOwnerPathRecursive(parsedRefPath, depth + 1, nextOwnerNode);
        if (!matched.closestConfigNode && DB.hasOwnerConfig(curOwnerNode)) {
          matched.closestConfigNode = curOwnerNode;
          matched.closestConfigDepth = depth;
        }
        return matched;
      }
    }
    // No match with child nodes.
    return {
      matchedDepth: depth,
      closestConfigNode: DB.hasOwnerConfig(curOwnerNode) ? curOwnerNode : null,
      closestConfigDepth: DB.hasOwnerConfig(curOwnerNode) ? depth : 0,
    };
  }

  matchOwnerPath(parsedRefPath) {
    return this.matchOwnerPathRecursive(
        parsedRefPath, 0, this.dbRoot.getChild(PredefinedDbPaths.OWNERS_ROOT));
  }

  matchOwnerForParsedPath(parsedRefPath) {
    const matched = this.matchOwnerPath(parsedRefPath);
    return {
      matchedOwnerPath: parsedRefPath.slice(0, matched.matchedDepth),
      closestOwner: {
        path: parsedRefPath.slice(0, matched.closestConfigDepth),
        config: DB.getOwnerConfig(matched.closestConfigNode),
      },
    }
  }

  convertOwnerMatch(matched) {
    return {
      matched_path: {
        target_path: ChainUtil.formatPath(matched.matchedOwnerPath),
      },
      matched_config: this.convertPathAndConfig(matched.closestOwner),
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
