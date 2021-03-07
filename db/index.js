const logger = require('../logger')('DATABASE');
const {
  ReadDbOperations,
  WriteDbOperations,
  PredefinedDbPaths,
  OwnerProperties,
  RuleProperties,
  ProofProperties,
  ShardingProperties,
  GenesisSharding,
  FeatureFlags,
  LIGHTWEIGHT,
  buildOwnerPermissions,
} = require('../common/constants');
const ChainUtil = require('../common/chain-util');
const Transaction = require('../tx-pool/transaction');
const StateNode = require('./state-node');
const {
  isEmptyNode,
  hasFunctionConfig,
  getFunctionConfig,
  hasRuleConfig,
  getRuleConfig,
  hasOwnerConfig,
  getOwnerConfig,
  isWritablePathWithSharding,
  isValidPathForStates,
  isValidJsObjectForStates,
  setProofHashForStateTree,
  updateProofHashForAllRootPaths,
} = require('./state-util');
const Functions = require('./functions');
const RuleUtil = require('./rule-util');

class DB {
  constructor(stateRoot, stateVersion, bc, tp, isNodeDb, blockNumberSnapshot) {
    this.shardingPath = null;
    this.isRootBlockchain = null;  // Is this the database of the root blockchain?
    this.stateRoot = stateRoot;
    this.stateVersion = stateVersion;
    this.setShardingPath(GenesisSharding[ShardingProperties.SHARDING_PATH]);
    this.func = new Functions(this, tp);
    this.bc = bc;
    this.isNodeDb = isNodeDb;
    this.blockNumberSnapshot = blockNumberSnapshot;
  }

  initDbStates() {
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

  dumpDbStates() {
    if (this.stateRoot === null) {
      return null;
    }
    return this.stateRoot.toJsObject(true);
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
    this.writeDatabase([PredefinedDbPaths.VALUES_ROOT, ...ChainUtil.parsePath(valuesPath)], values);
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
    this.isRootBlockchain = (this.shardingPath.length === 0);
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
  static getRefForReading(node, fullPath) {
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
    let node = this.stateRoot;
    for (let i = 0; i < fullPath.length; i++) {
      const label = fullPath[i];
      if (FeatureFlags.enableStateVersionOpt) {
        if (node.hasChild(label)) {
          const child = node.getChild(label);
          if (child.getVersion() === this.stateVersion) {
            child.resetValue();
            node = child;
          } else {
            const clonedChild = child.clone(this.stateVersion);
            clonedChild.resetValue();
            node.setChild(label, clonedChild);
            node = clonedChild;
          }
        } else {
          const newChild = new StateNode(this.stateVersion);
          node.setChild(label, newChild);
          node = newChild;
        }
      } else {
        if (node.hasChild(label)) {
          const child = node.getChild(label);
          child.resetValue();
          node = child;
        } else {
          const newChild = new StateNode(this.stateVersion);
          node.setChild(label, newChild);
          node = newChild;
        }
      }
    }
    return node;
  }

  writeDatabase(fullPath, stateObj) {
    const stateTree = StateNode.fromJsObject(stateObj, this.stateVersion);
    const pathToParent = fullPath.slice().splice(0, fullPath.length - 1);
    if (fullPath.length === 0) {
      this.stateRoot = stateTree;
    } else {
      const label = fullPath[fullPath.length - 1];
      const parent = this.getRefForWriting(pathToParent);
      parent.setChild(label, stateTree);
    }
    if (isEmptyNode(stateTree)) {
      this.removeEmptyNodes(fullPath);
    } else if (!LIGHTWEIGHT) {
      setProofHashForStateTree(stateTree);
    }
    if (!LIGHTWEIGHT) {
      updateProofHashForAllRootPaths(pathToParent, this.stateRoot);
    }
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
      if (isEmptyNode(childNode)) {
        curDbNode.deleteChild(label);
      }
    }
  }

  removeEmptyNodes(fullPath) {
    return this.removeEmptyNodesRecursive(fullPath, 0, this.stateRoot);
  }

  static readFromStateRoot(stateRoot, rootLabel, refPath, isGlobal, shardingPath) {
    if (!stateRoot) return null;
    const parsedPath = ChainUtil.parsePath(refPath);
    const localPath = isGlobal === true ? DB.toLocalPath(parsedPath, shardingPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    const fullPath = DB.getFullPath(localPath, rootLabel);
    const stateNode = DB.getRefForReading(stateRoot, fullPath);
    return stateNode !== null ? stateNode.toJsObject() : null;
  }

  readDatabase(refPath, rootLabel, isGlobal) {
    return DB.readFromStateRoot(this.stateRoot, rootLabel, refPath, isGlobal, this.shardingPath);
  }

  // TODO(seo): Support lookups on the final version.
  getValue(valuePath, isGlobal) {
    return this.readDatabase(valuePath, PredefinedDbPaths.VALUES_ROOT, isGlobal);
  }

  getFunction(functionPath, isGlobal) {
    return this.readDatabase(functionPath, PredefinedDbPaths.FUNCTIONS_ROOT, isGlobal);
  }

  getRule(rulePath, isGlobal) {
    return this.readDatabase(rulePath, PredefinedDbPaths.RULES_ROOT, isGlobal);
  }

  getOwner(ownerPath, isGlobal) {
    return this.readDatabase(ownerPath, PredefinedDbPaths.OWNERS_ROOT, isGlobal);
  }

  /**
   * Returns a proof of a state node.
   * @param {string} treePath full database path to the state node to be proved.
   */
  // TODO(seo): Consider supporting global path for getProof().
  getProof(treePath) {
    const parsedPath = ChainUtil.parsePath(treePath);
    let node = this.stateRoot;
    const rootProof = {[ProofProperties.PROOF_HASH]: node.getProofHash()};
    let proof = rootProof;
    for (const label of parsedPath) {
      if (node.hasChild(label)) {
        node.getChildLabels().forEach((label) => {
          Object.assign(proof,
              {[label]: {[ProofProperties.PROOF_HASH]: node.getChild(label).getProofHash()}});
        });
        proof = proof[label];
        node = node.getChild(label);
      } else {
        return null;
      }
    }
    return rootProof;
  }

  getTreeSize(treePath) {
    const parsedPath = ChainUtil.parsePath(treePath);
    const stateNode = DB.getRefForReading(this.stateRoot, parsedPath);
    if (stateNode === null) {
      return 0;
    }
    return stateNode.getTreeSize();
  }

  matchFunction(funcPath, isGlobal) {
    const parsedPath = ChainUtil.parsePath(funcPath);
    const localPath = isGlobal === true ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    return this.convertFunctionMatch(this.matchFunctionForParsedPath(localPath), isGlobal);
  }

  matchRule(valuePath, isGlobal) {
    const parsedPath = ChainUtil.parsePath(valuePath);
    const localPath = isGlobal === true ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    return this.convertRuleMatch(this.matchRuleForParsedPath(localPath), isGlobal);
  }

  matchOwner(rulePath, isGlobal) {
    const parsedPath = ChainUtil.parsePath(rulePath);
    const localPath = isGlobal === true ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    return this.convertOwnerMatch(this.matchOwnerForParsedPath(localPath), isGlobal);
  }

  evalRule(valuePath, value, auth, timestamp, isGlobal) {
    const parsedPath = ChainUtil.parsePath(valuePath);
    const localPath = isGlobal === true ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    return this.getPermissionForValue(localPath, value, auth, timestamp);
  }

  evalOwner(refPath, permission, auth, isGlobal) {
    const parsedPath = ChainUtil.parsePath(refPath);
    const localPath = isGlobal === true ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    const matched = this.matchOwnerForParsedPath(localPath);
    return this.checkPermission(matched.closestOwner.config, auth, permission);
  }

  // TODO(seo): Add tests for op.fid.
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
        const auth = {};
        if (op.address) {
          auth.addr = op.address;
        }
        if (op.fid) {
          auth.fid = op.fid;
        }
        resultList.push(this.evalRule(
            op.ref, op.value, auth, op.timestamp || Date.now(), op.is_global));
      } else if (op.type === ReadDbOperations.EVAL_OWNER) {
        const auth = {};
        if (op.address) {
          auth.addr = op.address;
        }
        if (op.fid) {
          auth.fid = op.fid;
        }
        resultList.push(this.evalOwner(op.ref, op.permission, auth, op.is_global));
      }
    });
    return resultList;
  }

  // TODO(seo): Define error code explicitly.
  // TODO(seo): Consider making set operation and native function run tightly bound, i.e., revert
  //            the former if the latter fails.
  // TODO(seo): Apply isWritablePathWithSharding() to setFunction(), setRule(), and setOwner()
  //            as well.
  setValue(valuePath, value, auth, timestamp, transaction, isGlobal) {
    const isValidObj = isValidJsObjectForStates(value);
    if (!isValidObj.isValid) {
      return ChainUtil.returnError(101, `Invalid object for states: ${isValidObj.invalidPath}`);
    }
    const parsedPath = ChainUtil.parsePath(valuePath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return ChainUtil.returnError(102, `Invalid path: ${isValidPath.invalidPath}`);
    }
    const localPath = isGlobal === true ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return true;
    }
    if (!this.getPermissionForValue(localPath, value, auth, timestamp)) {
      return ChainUtil.returnError(103, `No .write permission on: ${valuePath}`);
    }
    const fullPath = DB.getFullPath(localPath, PredefinedDbPaths.VALUES_ROOT);
    const isWritablePath = isWritablePathWithSharding(fullPath, this.stateRoot);
    if (!isWritablePath.isValid) {
      if (isGlobal) {
        // There is nothing to do.
        return true;
      } else {
        return ChainUtil.returnError(
            104, `Non-writable path with shard config: ${isWritablePath.invalidPath}`);
      }
    }
    const valueCopy = ChainUtil.isDict(value) ? JSON.parse(JSON.stringify(value)) : value;
    this.writeDatabase(fullPath, valueCopy);
    // NOTE(seo): As of now (2021-01), we don't allow recursive function triggering.
    // NOTE(lia): Allow recursive function triggering for service accounts. Should update this logic
    // to prevent infinite recursion.
    if (auth && (auth.addr || auth.fid)) {
      this.func.triggerFunctions(localPath, valueCopy, auth, timestamp, Date.now(), transaction);
    }

    return true;
  }

  incValue(valuePath, delta, auth, timestamp, transaction, isGlobal) {
    const valueBefore = this.getValue(valuePath, isGlobal);
    logger.debug(`VALUE BEFORE:  ${JSON.stringify(valueBefore)}`);
    if ((valueBefore && typeof valueBefore !== 'number') || typeof delta !== 'number') {
      return ChainUtil.returnError(201, `Not a number type: ${valueBefore} or ${delta}`);
    }
    const valueAfter = (valueBefore === undefined ? 0 : valueBefore) + delta;
    return this.setValue(valuePath, valueAfter, auth, timestamp, transaction, isGlobal);
  }

  decValue(valuePath, delta, auth, timestamp, transaction, isGlobal) {
    const valueBefore = this.getValue(valuePath, isGlobal);
    logger.debug(`VALUE BEFORE:  ${JSON.stringify(valueBefore)}`);
    if ((valueBefore && typeof valueBefore !== 'number') || typeof delta !== 'number') {
      return ChainUtil.returnError(301, `Not a number type: ${valueBefore} or ${delta}`);
    }
    const valueAfter = (valueBefore === undefined ? 0 : valueBefore) - delta;
    return this.setValue(valuePath, valueAfter, auth, timestamp, transaction, isGlobal);
  }

  // TODO(seo): Do not allow users to set native functions to arbitrary paths.
  setFunction(functionPath, functionChange, auth, isGlobal) {
    const isValidObj = isValidJsObjectForStates(functionChange);
    if (!isValidObj.isValid) {
      return ChainUtil.returnError(401, `Invalid object for states: ${isValidObj.invalidPath}`);
    }
    const parsedPath = ChainUtil.parsePath(functionPath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return ChainUtil.returnError(402, `Invalid path: ${isValidPath.invalidPath}`);
    }
    const localPath = isGlobal === true ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return true;
    }
    if (!this.getPermissionForFunction(localPath, auth)) {
      return ChainUtil.returnError(403, `No write_function permission on: ${functionPath}`);
    }
    const curFunction = this.getFunction(functionPath, isGlobal);
    const newFunction = Functions.applyFunctionChange(curFunction, functionChange);
    const fullPath = DB.getFullPath(localPath, PredefinedDbPaths.FUNCTIONS_ROOT);
    this.writeDatabase(fullPath, newFunction);

    return true;
  }

  // TODO(seo): Add rule config sanitization logic (e.g. dup path variables,
  //            multiple path variables).
  setRule(rulePath, rule, auth, isGlobal) {
    const isValidObj = isValidJsObjectForStates(rule);
    if (!isValidObj.isValid) {
      return ChainUtil.returnError(501, `Invalid object for states: ${isValidObj.invalidPath}`);
    }
    const parsedPath = ChainUtil.parsePath(rulePath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return ChainUtil.returnError(502, `Invalid path: ${isValidPath.invalidPath}`);
    }
    const localPath = isGlobal === true ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return true;
    }
    if (!this.getPermissionForRule(localPath, auth)) {
      return ChainUtil.returnError(503, `No write_rule permission on: ${rulePath}`);
    }
    const fullPath = DB.getFullPath(localPath, PredefinedDbPaths.RULES_ROOT);
    const ruleCopy = ChainUtil.isDict(rule) ? JSON.parse(JSON.stringify(rule)) : rule;
    this.writeDatabase(fullPath, ruleCopy);

    return true;
  }

  // TODO(seo): Add owner config sanitization logic.
  setOwner(ownerPath, owner, auth, isGlobal) {
    const isValidObj = isValidJsObjectForStates(owner);
    if (!isValidObj.isValid) {
      return ChainUtil.returnError(601, `Invalid object for states: ${isValidObj.invalidPath}`);
    }
    const parsedPath = ChainUtil.parsePath(ownerPath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return ChainUtil.returnError(602, `Invalid path: ${isValidPath.invalidPath}`);
    }
    const localPath = isGlobal === true ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return true;
    }
    if (!this.getPermissionForOwner(localPath, auth)) {
      return ChainUtil.returnError(
          603, `No write_owner or branch_owner permission on: ${ownerPath}`);
    }
    const fullPath = DB.getFullPath(localPath, PredefinedDbPaths.OWNERS_ROOT);
    const ownerCopy = ChainUtil.isDict(owner) ? JSON.parse(JSON.stringify(owner)) : owner;
    this.writeDatabase(fullPath, ownerCopy);

    return true;
  }

  set(opList, auth, timestamp, transaction) {
    let ret = true;
    for (let i = 0; i < opList.length; i++) {
      const op = opList[i];
      if (op.type === undefined || op.type === WriteDbOperations.SET_VALUE) {
        ret = this.setValue(op.ref, op.value, auth, timestamp, transaction, op.is_global);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.INC_VALUE) {
        ret = this.incValue(op.ref, op.value, auth, timestamp, transaction, op.is_global);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.DEC_VALUE) {
        ret = this.decValue(op.ref, op.value, auth, timestamp, transaction, op.is_global);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.SET_FUNCTION) {
        ret = this.setFunction(op.ref, op.value, auth, op.is_global);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.SET_RULE) {
        ret = this.setRule(op.ref, op.value, auth, op.is_global);
        if (ret !== true) {
          break;
        }
      } else if (op.type === WriteDbOperations.SET_OWNER) {
        ret = this.setOwner(op.ref, op.value, auth, op.is_global);
        if (ret !== true) {
          break;
        }
      } else {
        // Invalid Operation
        return ChainUtil.returnError(701, `Invalid opeartion type: ${op.type}`);
      }
    }
    return ret;
  }

  batch(txList) {
    const resultList = [];
    for (const tx of txList) {
      const txBody = tx.tx_body;
      if (!txBody) {
        resultList.push(ChainUtil.returnError(801, 'No tx_body'));
        continue;
      }
      const op = txBody.operation;
      if (!op) {
        resultList.push(ChainUtil.returnError(802, 'No operation'));
        continue;
      }
      switch (op.type) {
        case undefined:
        case WriteDbOperations.SET_VALUE:
        case WriteDbOperations.INC_VALUE:
        case WriteDbOperations.DEC_VALUE:
        case WriteDbOperations.SET_FUNCTION:
        case WriteDbOperations.SET_RULE:
        case WriteDbOperations.SET_OWNER:
        case WriteDbOperations.SET:
          // NOTE(seo): It's not allowed for users to send transactions with auth.fid.
          resultList.push(this.executeOperation(op, { addr: tx.address }, txBody.timestamp, tx));
          break;
        default:
          resultList.push(ChainUtil.returnError(803, `Invalid operation type: ${op.type}`));
      }
    }
    return resultList;
  }

  /**
   * Returns full path with given root node.
   */
  static getFullPath(parsedPath, rootLabel) {
    const fullPath = parsedPath.slice();
    fullPath.unshift(rootLabel);
    return fullPath;
  }

  /**
   * Converts to local path by removing the sharding path part of the given parsed path.
   */
  static toLocalPath(parsedPath, shardingPath) {
    if (shardingPath.length === 0) {
      return parsedPath;
    }
    if (parsedPath.length < shardingPath.length) {
      return null;
    }
    for (let i = 0; i < shardingPath.length; i++) {
      if (parsedPath[i] !== shardingPath[i]) {
        return null;
      }
    }
    return parsedPath.slice(shardingPath.length);
  }

  /**
   * Converts to global path by adding the sharding path to the front of the given parsed path.
   */
  toGlobalPath(parsedPath) {
    if (this.isRootBlockchain) {
      return parsedPath;
    }
    const globalPath = parsedPath.slice();
    globalPath.unshift(...this.shardingPath);
    return globalPath;
  }

  /**
   * Sets state version with its state root.
   * 
   * @param {StateNode} stateRoot state root
   * @param {string} stateVersion state version
   */
  setStateVersion(stateRoot, stateVersion) {
    this.stateRoot = stateRoot;
    this.stateVersion = stateVersion;
  }

  executeOperation(op, auth, timestamp, tx) {
    if (!op) {
      return null;
    }
    switch (op.type) {
      case undefined:
      case WriteDbOperations.SET_VALUE:
        return this.setValue(op.ref, op.value, auth, timestamp, tx, op.is_global);
      case WriteDbOperations.INC_VALUE:
        return this.incValue(op.ref, op.value, auth, timestamp, tx, op.is_global);
      case WriteDbOperations.DEC_VALUE:
        return this.decValue(op.ref, op.value, auth, timestamp, tx, op.is_global);
      case WriteDbOperations.SET_FUNCTION:
        return this.setFunction(op.ref, op.value, auth, op.is_global);
      case WriteDbOperations.SET_RULE:
        return this.setRule(op.ref, op.value, auth, op.is_global);
      case WriteDbOperations.SET_OWNER:
        return this.setOwner(op.ref, op.value, auth, op.is_global);
      case WriteDbOperations.SET:
        return this.set(op.op_list, auth, timestamp, tx);
    }
  }

  executeTransaction(tx) {
    const LOG_HEADER = 'executeTransaction';
    if (Transaction.isBatchTransaction(tx)) {
      return this.batch(tx.tx_list);
    }
    const txBody = tx.tx_body;
    if (!txBody) {
      logger.error(`[${LOG_HEADER}] Missing tx_body: ${JSON.stringify(tx, null, 2)}`);
      return false;
    }
    // NOTE(seo): It's not allowed for users to send transactions with auth.fid.
    return this.executeOperation(txBody.operation, { addr: tx.address}, txBody.timestamp, tx);
  }

  executeTransactionList(txList) {
    const LOG_HEADER = 'executeTransactionList';
    for (const tx of txList) {
      const res = this.executeTransaction(tx);
      if (ChainUtil.transactionFailed(res)) {
        // FIXME: remove the failed transaction from tx pool?
        logger.error(`[${LOG_HEADER}] tx failed: ${JSON.stringify(tx, null, 2)}` +
            `\nresult: ${JSON.stringify(res)}`);
        return false;
      }
    }
    return true;
  }

  addPathToValue(value, matchedValuePath, closestConfigDepth) {
    const pathToAdd = matchedValuePath.slice(closestConfigDepth, matchedValuePath.length);
    let newValue = value;
    for (let i = pathToAdd.length - 1; i >= 0; i--) {
      newValue = {[pathToAdd[i]]: newValue};
    }
    return newValue;
  }

  // TODO(seo): Eval subtree rules.
  getPermissionForValue(parsedValuePath, newValue, auth, timestamp) {
    const LOG_HEADER = 'getPermissionForValue';
    const matched = this.matchRuleForParsedPath(parsedValuePath);
    const value = this.getValue(ChainUtil.formatPath(parsedValuePath));
    const data =
        this.addPathToValue(value, matched.matchedValuePath, matched.closestRule.path.length);
    const newData =
        this.addPathToValue(newValue, matched.matchedValuePath, matched.closestRule.path.length);
    let evalRuleRes = false;
    try {
      evalRuleRes = !!this.evalRuleString(
        matched.closestRule.config, matched.pathVars, data, newData, auth, timestamp);
    } catch (e) {
      logger.debug(`[${LOG_HEADER}] Failed to eval rule.\n` +
          `matched: ${JSON.stringify(matched, null, 2)}, data: ${JSON.stringify(data)}, ` +
          `newData: ${JSON.stringify(newData)}, auth: ${JSON.stringify(auth)}, ` +
          `timestamp: ${timestamp}\nError: ${e}`);
    }
    return evalRuleRes;
  }

  getPermissionForRule(parsedRulePath, auth) {
    const matched = this.matchOwnerForParsedPath(parsedRulePath);
    return this.checkPermission(matched.closestOwner.config, auth, OwnerProperties.WRITE_RULE);
  }

  getPermissionForFunction(parsedFuncPath, auth) {
    const matched = this.matchOwnerForParsedPath(parsedFuncPath);
    return this.checkPermission(
        matched.closestOwner.config, auth, OwnerProperties.WRITE_FUNCTION);
  }

  getPermissionForOwner(parsedOwnerPath, auth) {
    const matched = this.matchOwnerForParsedPath(parsedOwnerPath);
    if (matched.closestOwner.path.length === parsedOwnerPath.length) {
      return this.checkPermission(
          matched.closestOwner.config, auth, OwnerProperties.WRITE_OWNER);
    } else {
      return this.checkPermission(
          matched.closestOwner.config, auth, OwnerProperties.BRANCH_OWNER);
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
        parsedValuePath, 0, this.stateRoot.getChild(PredefinedDbPaths.FUNCTIONS_ROOT));
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
        matched.subtreeFunctions.map((entry) => this.convertPathAndConfig(entry, false));
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
        parsedValuePath, 0, this.stateRoot.getChild(PredefinedDbPaths.RULES_ROOT));
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
    const subtreeRules = matched.subtreeRules.map((entry) =>
      this.convertPathAndConfig(entry, false));
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

  // XXX(minsu): need to be investigated. Using new Function() is not recommended.
  makeEvalFunction(ruleString, pathVars) {
    return new Function('auth', 'data', 'newData', 'currentTime', 'getValue', 'getRule',
        'getFunction', 'getOwner', 'evalRule', 'evalOwner', 'util', 'lastBlockNumber',
        ...Object.keys(pathVars), '"use strict"; return ' + ruleString);
  }

  // TODO(seo): Extend function for auth.fid.
  evalRuleString(ruleString, pathVars, data, newData, auth, timestamp) {
    if (typeof ruleString === 'boolean') {
      return ruleString;
    } else if (typeof ruleString !== 'string') {
      return false;
    }
    const evalFunc = this.makeEvalFunction(ruleString, pathVars);
    return evalFunc(auth, data, newData, timestamp, this.getValue.bind(this),
        this.getRule.bind(this), this.getFunction.bind(this), this.getOwner.bind(this),
        this.evalRule.bind(this), this.evalOwner.bind(this),
        new RuleUtil(), this.lastBlockNumber(), ...Object.values(pathVars));
  }

  lastBlockNumber() {
    return this.bc ? this.bc.lastBlockNumber() : this.blockNumberSnapshot;
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
        parsedRefPath, 0, this.stateRoot.getChild(PredefinedDbPaths.OWNERS_ROOT));
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

  getOwnerPermissions(config, auth) {
    if (!config) {
      return null;
    }
    let owners = null;
    owners = config[OwnerProperties.OWNERS];
    if (!owners) {
      return null;
    }
    let permissions = null;
    // Step 1: Check if the given address or fid exists in owners.
    if (auth) {
      if (auth.addr) {
        permissions = owners[auth.addr];
      } else if (auth.fid) {
        permissions = owners[auth.fid];
      }
    }
    // Step 2: If not, check permissions for anyone ('*').
    if (!permissions) {
      permissions = owners[OwnerProperties.ANYONE];
    }
    if (!permissions) {
      return null;
    }
    return permissions;
  }

  checkPermission(config, auth, permission) {
    const permissions = this.getOwnerPermissions(config, auth);
    return !!(permissions && permissions[permission] === true);
  }
}

module.exports = DB;
