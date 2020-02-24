const {ReadDbOperations, WriteDbOperations, PredefinedDbPaths, OwnerProperties, RuleProperties,
       DEBUG} = require('../constants');
const ChainUtil = require('../chain-util');
const Transaction = require('../tx-pool/transaction');
const Functions = require('./functions');
const BuiltInRuleUtil = require('./built-in-rule-util');

class DB {
  constructor() {
    this.dbData = {};
    this.initDbData();
    this.func = new Functions(this);
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

  getFunction(functionPath) {
    const parsedPath = ChainUtil.parsePath(functionPath);
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.FUNCTIONS_ROOT);
    return this.readDatabase(fullPath);
  }

  getOwner(ownerPath) {
    const parsedPath = ChainUtil.parsePath(ownerPath);
    const fullPath = this.getFullPath(parsedPath, PredefinedDbPaths.OWNERS_ROOT);
    return this.readDatabase(fullPath);
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
    this.func.runBuiltInFunctions(parsedPath, valueCopy, timestamp, Date.now());
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
      } else if (op.type === WriteDbOperations.SET_FUNCTION) {
        ret = this.setFunc(op.ref, op.value, address);
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
        console.log(message);
      } else {
        switch(operation.type) {
          case undefined:
          case WriteDbOperations.SET_VALUE:
          case WriteDbOperations.INC_VALUE:
          case WriteDbOperations.DEC_VALUE:
          case WriteDbOperations.SET_RULE:
          case WriteDbOperations.SET_FUNCTION:
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

  setDbToSnapshot(snapshot) {
    this.dbData = JSON.parse(JSON.stringify(snapshot.dbData));
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
      case WriteDbOperations.SET_FUNCTION:
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
    const result = this.executeOperation(tx.operation, tx.address, tx.timestamp);
    // TODO(minhyun): Support BATCH & SET.
    //console.log(result);
    if (result && (tx.operation.type == WriteDbOperations.SET_VALUE
        || tx.operation.type == WriteDbOperations.INC_VALUE
        || tx.operation.type == WriteDbOperations.DEC_VALUE)) {
      //console.log("trigger");
      this.func.triggerEvent(tx);
    }
    return result;
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

  static getVariableNodeName(ruleNode) {
    const keys = Object.keys(ruleNode);
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].startsWith('$')) {
        // It's assumed that there is at most one variable (i.e., with '$') child node.
        return keys[i];
      }
    }
    return null;
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
        console.log('Duplicated path variables that should NOT happen!')
      } else {
        matched.pathVars[varNodeName] = parsedValuePath[depth];
      }
      if (!matched.closestConfigNode && DB.hasRuleConfig(curRuleNode)) {
        matched.closestConfigNode = curRuleNode;
        matched.closestConfigDepth = depth;
      }
      return matched;
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
        parsedValuePath, 0, this.dbData[PredefinedDbPaths.RULES_ROOT]);
  }

  getSubtreeRulesRecursive(depth, curRuleNode) {
    const rules = [];
    if (depth !== 0 && DB.hasRuleConfig(curRuleNode)) {
      rules.push({
        path: [],
        config: DB.getRuleConfig(curRuleNode),
      })
    }
    const varNodeName = DB.getVariableNodeName(curRuleNode);
    // 1) Traverse non-variable child nodes.
    for (const key in curRuleNode) {
      const nextRuleNode = curRuleNode[key];
      if (key !== varNodeName && ChainUtil.isDict(nextRuleNode)) {
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

  convertPathAndConfig(pathAndConfig) {
    return {
      path: ChainUtil.formatPath(pathAndConfig.path),
      config: pathAndConfig.config,
    }
  }

  convertRuleMatch(matched) {
    const subtreeRules = matched.subtreeRules.map(entry => this.convertPathAndConfig(entry));
    return {
      matched_value_path: ChainUtil.formatPath(matched.matchedValuePath),
      matched_rule_path: ChainUtil.formatPath(matched.matchedRulePath),
      path_vars: matched.pathVars,
      closest_rule: this.convertPathAndConfig(matched.closestRule),
      subtree_rules: subtreeRules,
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
                    new BuiltInRuleUtil(), ...Object.values(pathVars));
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
    const nextOwnerNode = curOwnerNode[parsedRefPath[depth]];
    if (nextOwnerNode !== undefined) {
      const matched = this.matchOwnerPathRecursive(parsedRefPath, depth + 1, nextOwnerNode);
      if (!matched.closestConfigNode && DB.hasOwnerConfig(curOwnerNode)) {
        matched.closestConfigNode = curOwnerNode;
        matched.closestConfigDepth = depth;
      }
      return matched;
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
        parsedRefPath, 0, this.dbData[PredefinedDbPaths.OWNERS_ROOT]);
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
      matched_owner_path: ChainUtil.formatPath(matched.matchedOwnerPath),
      closest_owner: this.convertPathAndConfig(matched.closestOwner),
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
