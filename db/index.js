const logger = require('../logger');
const {
  ReadDbOperations, WriteDbOperations, PredefinedDbPaths, OwnerProperties, RuleProperties,
  FunctionProperties, DEBUG
} = require('../constants');
const ChainUtil = require('../chain-util');
const Transaction = require('../tx-pool/transaction');
const StateNode = require('./state-node');
const Functions = require('./functions');
const RuleUtil = require('./rule-util');

class DB {
  constructor() {
    this.dbDataLegacy = {};
    this.dbData = new StateNode();
    this.initDbDataLegacy();
    this.func = new Functions(this);
  }

  initDbDataLegacy() {
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

  writeDatabase(fullPath, value) {
    if (fullPath.length === 0) {
      this.dbDataLegacy = value;
    } else if (fullPath.length === 1) {
      this.dbDataLegacy[fullPath[0]] = value;
    } else {
      const pathToKey = fullPath.slice().splice(0, fullPath.length - 1);
      const refKey = fullPath[fullPath.length - 1];
      this.getRefForWriting(pathToKey)[refKey] = value;
    }
    if (DB.isEmptyNode(value)) {
      this.removeEmptyNodes(fullPath);
    }
  }

  static isEmptyNode(dbNode) {
    return dbNode === null || dbNode === undefined ||
        (ChainUtil.isDict(dbNode) && Object.keys(dbNode).length === 0);
  }

  removeEmptyNodesRecursive(fullPath, depth, curDbNode) {
    if (depth < fullPath.length - 1) {
      const nextDbNode = curDbNode[fullPath[depth]];
      if (!ChainUtil.isDict(nextDbNode)) {
        logger.error(`Unavailable path in the database: ${ChainUtil.formatPath(fullPath)}`);
      } else {
        this.removeEmptyNodesRecursive(fullPath, depth + 1, nextDbNode);
      }
    }
    for (const child in curDbNode) {
      if (DB.isEmptyNode(curDbNode[child])) {
        delete curDbNode[child];
      }
    }
  }

  removeEmptyNodes(fullPath) {
    return this.removeEmptyNodesRecursive(fullPath, 0, this.dbDataLegacy);
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
  // TODO(seo): Consider adding array to object transforming (see
  //            https://firebase.googleblog.com/2014/04/best-practices-arrays-in-firebase.html).
  setValue(valuePath, value, address, timestamp, transaction) {
    const parsedPath = ChainUtil.parsePath(valuePath);
    if (!this.getPermissionForValue(parsedPath, value, address, timestamp)) {
      return {code: 2, error_message: 'No .write permission on: ' + valuePath};
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
      return {code: 1, error_message: 'Not a number type: ' + valuePath};
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
      return {code: 1, error_message: 'Not a number type: ' + valuePath};
    }
    const valueAfter = (valueBefore === undefined ? 0 : valueBefore) - delta;
    return this.setValue(valuePath, valueAfter, address, timestamp, transaction);
  }

  setFunction(functionPath, functionInfo, address) {
    const parsedPath = ChainUtil.parsePath(functionPath);
    if (!this.getPermissionForFunction(parsedPath, address)) {
      return {code: 3, error_message: 'No write_function permission on: ' + functionPath};
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
        return {code: 5, error_message: 'Invalid opeartionn type: ' + op.type};
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

  /**
   * Returns reference to the input path for reading if exists, otherwise null.
   */
  getRefForReading(fullPath) {
    let subData = this.dbDataLegacy;
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
    let subData = this.dbDataLegacy;
    fullPath.forEach((key) => {
      if (!(key in subData) || !ChainUtil.isDict(subData[key])) {
        subData[key] = {};
      }
      subData = subData[key];
    });
    return subData;
  }

  setDbToSnapshot(snapshot) {
    this.dbDataLegacy = JSON.parse(JSON.stringify(snapshot.dbData));
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
    txList.forEach((tx) => {
      this.executeTransaction(tx);
    });
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

  static getVariableNodeName(node) {
    if (ChainUtil.isDict(node)) {
      const keys = Object.keys(node);
      for (let i = 0; i < keys.length; i++) {
        if (keys[i].startsWith('$')) {
          // It's assumed that there is at most one variable (i.e., with '$') child node.
          return keys[i];
        }
      }
    }
    return null;
  }

  static hasFunctionConfig(funcNode) {
    return funcNode && funcNode[FunctionProperties.FUNCTION] !== undefined;
  }

  static getFunctionConfig(funcNode) {
    return DB.hasFunctionConfig(funcNode) ? funcNode[FunctionProperties.FUNCTION] : null;
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
      const nextFuncNode = curFuncNode[parsedValuePath[depth]];
      if (nextFuncNode !== undefined) {
        const matched = this.matchFunctionPathRecursive(parsedValuePath, depth + 1, nextFuncNode);
        matched.matchedValuePath.unshift(parsedValuePath[depth]);
        matched.matchedFunctionPath.unshift(parsedValuePath[depth]);
        return matched;
      }
      // 2) If no non-variable child node is matched, try to match with variable (i.e., with '$')
      //    child node.
      const varNodeName = DB.getVariableNodeName(curFuncNode);
      if (varNodeName !== null) {
        const nextFuncNode = curFuncNode[varNodeName];
        const matched = this.matchFunctionPathRecursive(parsedValuePath, depth + 1, nextFuncNode);
        matched.matchedValuePath.unshift(parsedValuePath[depth]);
        matched.matchedFunctionPath.unshift(varNodeName);
        if (matched.pathVars[varNodeName] !== undefined) {
          // This should not happen!
          logger.error('Duplicated path variables that should NOT happen!')
        } else {
          matched.pathVars[varNodeName] = parsedValuePath[depth];
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
        parsedValuePath, 0, this.dbDataLegacy[PredefinedDbPaths.FUNCTIONS_ROOT]);
  }

  getSubtreeFunctionsRecursive(depth, curFuncNode) {
    const funcs = [];
    if (depth !== 0 && DB.hasFunctionConfig(curFuncNode)) {
      funcs.push({
        path: [],
        config: DB.getFunctionConfig(curFuncNode),
      })
    }
    if (ChainUtil.isDict(curFuncNode)) {
      const varNodeName = DB.getVariableNodeName(curFuncNode);
      // 1) Traverse non-variable child nodes.
      for (const key in curFuncNode) {
        const nextFuncNode = curFuncNode[key];
        if (key !== varNodeName) {
          const subtreeFuncs = this.getSubtreeFunctionsRecursive(depth + 1, nextFuncNode);
          subtreeFuncs.forEach((entry) => {
            entry.path.unshift(key);
            funcs.push(entry);
          });
        }
      }
      // 2) Traverse variable child node if available.
      if (varNodeName !== null) {
        const nextFuncNode = curFuncNode[varNodeName];
        const subtreeFuncs = this.getSubtreeFunctionsRecursive(depth + 1, nextFuncNode);
        subtreeFuncs.forEach((entry) => {
          entry.path.unshift(varNodeName);
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
    const subtreeFunctions = matched.subtreeFunctions.map(entry => this.convertPathAndConfig(entry));
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
    return ruleNode && ruleNode[RuleProperties.WRITE] !== undefined;
  }

  static getRuleConfig(ruleNode) {
    return DB.hasRuleConfig(ruleNode) ? ruleNode[RuleProperties.WRITE] : null;
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
      const nextRuleNode = curRuleNode[parsedValuePath[depth]];
      if (nextRuleNode !== undefined) {
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
      const varNodeName = DB.getVariableNodeName(curRuleNode);
      if (varNodeName !== null) {
        const nextRuleNode = curRuleNode[varNodeName];
        const matched = this.matchRulePathRecursive(parsedValuePath, depth + 1, nextRuleNode);
        matched.matchedValuePath.unshift(parsedValuePath[depth]);
        matched.matchedRulePath.unshift(varNodeName);
        if (matched.pathVars[varNodeName] !== undefined) {
          // This should not happen!
          logger.error('Duplicated path variables that should NOT happen!')
        } else {
          matched.pathVars[varNodeName] = parsedValuePath[depth];
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
        parsedValuePath, 0, this.dbDataLegacy[PredefinedDbPaths.RULES_ROOT]);
  }

  getSubtreeRulesRecursive(depth, curRuleNode) {
    const rules = [];
    if (depth !== 0 && DB.hasRuleConfig(curRuleNode)) {
      rules.push({
        path: [],
        config: DB.getRuleConfig(curRuleNode),
      })
    }
    if (ChainUtil.isDict(curRuleNode)) {
      const varNodeName = DB.getVariableNodeName(curRuleNode);
      // 1) Traverse non-variable child nodes.
      for (const key in curRuleNode) {
        const nextRuleNode = curRuleNode[key];
        if (key !== varNodeName) {
          const subtreeRules = this.getSubtreeRulesRecursive(depth + 1, nextRuleNode);
          subtreeRules.forEach((entry) => {
            entry.path.unshift(key);
            rules.push(entry);
          });
        }
      }
      // 2) Traverse variable child node if available.
      if (varNodeName !== null) {
        const nextRuleNode = curRuleNode[varNodeName];
        const subtreeRules = this.getSubtreeRulesRecursive(depth + 1, nextRuleNode);
        subtreeRules.forEach((entry) => {
          entry.path.unshift(varNodeName);
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
                        'getFunction', 'getOwner', 'util', ...Object.keys(pathVars),
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
                    new RuleUtil(), ...Object.values(pathVars));
  }

  static hasOwnerConfig(ownerNode) {
    return ownerNode && ownerNode[OwnerProperties.OWNER] !== undefined;
  }

  static getOwnerConfig(ownerNode) {
    return DB.hasOwnerConfig(ownerNode) ? ownerNode[OwnerProperties.OWNER] : null;
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
      const nextOwnerNode = curOwnerNode[parsedRefPath[depth]];
      if (nextOwnerNode !== undefined) {
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
        parsedRefPath, 0, this.dbDataLegacy[PredefinedDbPaths.OWNERS_ROOT]);
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
