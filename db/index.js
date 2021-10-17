const logger = require('../logger')('DATABASE');
const {
  FeatureFlags,
  AccountProperties,
  ReadDbOperations,
  WriteDbOperations,
  PredefinedDbPaths,
  OwnerProperties,
  RuleProperties,
  StateInfoProperties,
  ShardingProperties,
  GenesisAccounts,
  GenesisSharding,
  StateVersions,
  buildOwnerPermissions,
  LIGHTWEIGHT,
  STATE_TREE_HEIGHT_LIMIT,
  TREE_SIZE_BUDGET,
  SERVICE_TREE_SIZE_BUDGET,
  APPS_TREE_SIZE_BUDGET,
  FREE_TREE_SIZE_BUDGET,
  SERVICE_STATE_BUDGET,
  APPS_STATE_BUDGET,
  FREE_STATE_BUDGET,
  STATE_GAS_COEFFICIENT,
  MIN_STAKING_FOR_APP_TX,
  MIN_BALANCE_FOR_SERVICE_TX,
} = require('../common/constants');
const CommonUtil = require('../common/common-util');
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
  isValidRuleTree,
  isValidFunctionTree,
  isValidOwnerTree,
  applyFunctionChange,
  applyOwnerChange,
  updateStateInfoForAllRootPaths,
  updateStateInfoForStateTree,
  getStateProofFromStateRoot,
  getProofHashFromStateRoot,
} = require('./state-util');
const Functions = require('./functions');
const RuleUtil = require('./rule-util');
const PathUtil = require('../common/path-util');
const _ = require('lodash');

class DB {
  constructor(stateRoot, stateVersion, bc, blockNumberSnapshot, stateManager) {
    this.shardingPath = null;
    this.isRootBlockchain = null;  // Is this the database of the root blockchain?
    this.stateRoot = stateRoot;
    this.stateVersion = stateVersion;
    this.backupStateRoot = null;
    this.backupStateVersion = null;
    this.setShardingPath(GenesisSharding[ShardingProperties.SHARDING_PATH]);
    this.func = new Functions(this);
    this.bc = bc;
    this.blockNumberSnapshot = blockNumberSnapshot;
    this.stateManager = stateManager;
    this.ownerAddress = CommonUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.ADDRESS]);
  }

  initDbStates(snapshot) {
    if (snapshot) {
      this.writeDatabase([PredefinedDbPaths.OWNERS_ROOT], JSON.parse(JSON.stringify(snapshot[PredefinedDbPaths.OWNERS_ROOT])));
      this.writeDatabase([PredefinedDbPaths.RULES_ROOT], JSON.parse(JSON.stringify(snapshot[PredefinedDbPaths.RULES_ROOT])));
      this.writeDatabase([PredefinedDbPaths.VALUES_ROOT], JSON.parse(JSON.stringify(snapshot[PredefinedDbPaths.VALUES_ROOT])));
      this.writeDatabase([PredefinedDbPaths.FUNCTIONS_ROOT], JSON.parse(JSON.stringify(snapshot[PredefinedDbPaths.FUNCTIONS_ROOT])));
    } else {
      // Initialize DB owners.
      this.writeDatabase([PredefinedDbPaths.OWNERS_ROOT], {
        [PredefinedDbPaths.DOT_OWNER]: {
          [OwnerProperties.OWNERS]: {
            [OwnerProperties.ANYONE]: buildOwnerPermissions(true, true, true, true),
          }
        }
      });
      // Initialize DB rules.
      this.writeDatabase([PredefinedDbPaths.RULES_ROOT], {
        [PredefinedDbPaths.DOT_RULE]: {
          [RuleProperties.WRITE]: true
        }
      });
    }
  }

  /**
   * Sets state version with its state root.
   *
   * @param {string} stateVersion state version
   * @param {StateNode} stateRoot state root
   */
  setStateVersion(stateVersion, stateRoot) {
    const LOG_HEADER = 'setStateVersion';
    if (!this.stateVersion === stateVersion) {
      logger.error(`[${LOG_HEADER}] State version already set with version: ${stateVersion}`);
      return false;
    }
    if (this.backupStateVersion === stateVersion) {
      logger.error(
          `[${LOG_HEADER}] State version equals to backup state version: ${stateVersion}`);
      return false;
    }
    this.deleteStateVersion();

    this.stateVersion = stateVersion;
    this.stateRoot = stateRoot;

    return true;
  }

  /**
   * Sets backup state version with its state root.
   *
   * @param {string} backupStateVersion backup state version
   * @param {StateNode} backupStateRoot backup state root
   */
  setBackupStateVersion(backupStateVersion, backupStateRoot) {
    const LOG_HEADER = 'setBackupStateVersion';
    if (this.backupStateVersion === backupStateVersion) {
      logger.error(
          `[${LOG_HEADER}] Backup state version already set with version: ${backupStateVersion}`);
      return false;
    }
    if (this.stateVersion === backupStateVersion) {
      logger.error(
          `[${LOG_HEADER}] Backup state version equals to state version: ${backupStateVersion}`);
      return false;
    }
    this.deleteBackupStateVersion();

    this.backupStateVersion = backupStateVersion;
    this.backupStateRoot = backupStateRoot;

    return true;
  }

  /**
   * Deletes state version with its state root.
   */
  deleteStateVersion() {
    const LOG_HEADER = 'deleteStateVersion';
    if (!this.stateManager) {
      logger.error(`[${LOG_HEADER}] No state manager: ${this.stateManager}`);
      return false;
    }
    if (this.stateVersion) {
      if (!this.stateManager.deleteVersion(this.stateVersion)) {
        logger.error(`[${LOG_HEADER}] Failed to delete version: ${this.stateVersion}`);
      }
      this.stateVersion = null;
      this.stateRoot = null;
    }
    return true;
  }

  /**
   * Deletes backup state version with its state root.
   */
  deleteBackupStateVersion() {
    const LOG_HEADER = 'deleteBackupStateVersion';
    if (!this.stateManager) {
      logger.error(`[${LOG_HEADER}] No state manager: ${this.stateManager}`);
      return false;
    }
    if (this.backupStateVersion) {
      if (!this.stateManager.deleteVersion(this.backupStateVersion)) {
        logger.error(`[${LOG_HEADER}] Failed to delete version: ${this.backupStateVersion}`);
      }
      this.backupStateVersion = null;
      this.backupStateRoot = null;
    }
    return true;
  }

  /**
   * Backs up database.
   */
  backupDb() {
    const LOG_HEADER = 'backupDb';
    if (!this.stateManager) {
      logger.error(`[${LOG_HEADER}] No state manager: ${this.stateManager}`);
      return false;
    }
    const backupVersion = this.stateManager.createUniqueVersionName(
        `${StateVersions.BACKUP}:${this.lastBlockNumber()}`);
    const backupRoot = this.stateManager.cloneVersion(this.stateVersion, backupVersion);
    if (!backupRoot) {
      logger.error(`[${LOG_HEADER}] Failed to clone state version: ${this.stateVersion}`);
      return false;
    }
    this.setBackupStateVersion(backupVersion, backupRoot);
    return true;
  }

  /**
   * Restores backup database.
   */
  restoreDb() {
    const LOG_HEADER = 'restoreDb';
    if (!this.stateManager) {
      logger.error(`[${LOG_HEADER}] No state manager: ${this.stateManager}`);
      return false;
    }
    const restoreVersion = this.stateManager.createUniqueVersionName(
      `${StateVersions.NODE}:${this.lastBlockNumber()}`);
    const restoreRoot = this.stateManager.cloneVersion(this.backupStateVersion, restoreVersion);
    if (!restoreRoot) {
      logger.error(`[${LOG_HEADER}] Failed to clone state version: ${this.backupStateVersion}`);
      return false;
    }
    if (this.stateManager.isFinalVersion(this.stateVersion)) {
      if (!this.stateManager.finalizeVersion(restoreVersion)) {
        logger.error(`[${LOG_HEADER}] Failed to finalize version: ${restoreVersion}`);
      }
    }
    this.setStateVersion(restoreVersion, restoreRoot);
    this.deleteBackupStateVersion();
    return true;
  }

  destroyDb() {
    const LOG_HEADER = 'destroyDb';
    logger.debug(`[${LOG_HEADER}] Destroying DB with state version: ${this.stateVersion}`);
    this.deleteStateVersion();
    this.deleteBackupStateVersion();
  }

  static create(
      baseVersion, newVersion, bc, finalizeVersion, blockNumberSnapshot, stateManager) {
    const LOG_HEADER = 'create';

    logger.debug(`[${LOG_HEADER}] Creating a new DB by cloning state version: ` +
        `${baseVersion} -> ${newVersion}`);
    const newRoot = stateManager.cloneVersion(baseVersion, newVersion);
    if (!newRoot) {
      logger.error(
          `[${LOG_HEADER}] Failed to clone state version: ${baseVersion} -> ${newVersion}`);
      return null;
    }
    if (finalizeVersion) {
      stateManager.finalizeVersion(newVersion);
    }
    return new DB(newRoot, newVersion, bc, blockNumberSnapshot, stateManager);
  }

  dumpDbStates(options) {
    if (this.stateRoot === null) {
      return null;
    }
    return this.stateRoot.toJsObject(options);
  }

  // For testing purpose only.
  setOwnersForTesting(ownersPath, owners) {
    this.writeDatabase([PredefinedDbPaths.OWNERS_ROOT, ...CommonUtil.parsePath(ownersPath)], owners);
  }

  // For testing purpose only.
  setRulesForTesting(rulesPath, rules) {
    this.writeDatabase([PredefinedDbPaths.RULES_ROOT, ...CommonUtil.parsePath(rulesPath)], rules);
  }

  // For testing purpose only.
  setFunctionsForTesting(functionsPath, functions) {
    this.writeDatabase([PredefinedDbPaths.FUNCTIONS_ROOT,
      ...CommonUtil.parsePath(functionsPath)], functions);
  }

  // For testing purpose only.
  setValuesForTesting(valuesPath, values) {
    this.writeDatabase([PredefinedDbPaths.VALUES_ROOT, ...CommonUtil.parsePath(valuesPath)], values);
  }

  // For testing purpose only.
  setShardingForTesting(sharding) {
    this.setValuesForTesting(
        CommonUtil.formatPath([PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_CONFIG]),
        sharding);
    this.setShardingPath(sharding[ShardingProperties.SHARDING_PATH]);
  }

  /**
   * Sets the sharding path of the database.
   */
  setShardingPath(shardingPath) {
    this.shardingPath = CommonUtil.parsePath(shardingPath);
    this.isRootBlockchain = (this.shardingPath.length === 0);
  }

  /**
   * Returns the sharding path of the database.
   */
  getShardingPath() {
    return CommonUtil.formatPath(this.shardingPath);
  }

  /**
   * Returns reference to the input path for reading if exists, otherwise null.
   */
  static getRefForReadingFromStateRoot(stateRoot, fullPath) {
    let node = stateRoot;
    for (let i = 0; i < fullPath.length; i++) {
      const label = fullPath[i];
      const child = node.getChild(label);
      if (child !== null) {
        node = child;
      } else {
        return null;
      }
    }
    return node;
  }

  getRefForReading(fullPath) {
    return DB.getRefForReadingFromStateRoot(this.stateRoot, fullPath);
  }

  /**
   * Returns reference to the input path for writing if exists, otherwise creates path.
   */
  // NOTE(platfowner): The nodes with multiple ref paths (i.e., multiple roots) should be cloned
  //                   in order not to affect other ref paths to the altered node.
  //
  // Typical case:
  // - root_a has subtree child_1a -> child_2 -> child_3
  // - root_b has subtree child_1b -> child_2 -> child_3 (child_2 and child_3 are shared)
  // - Want to change child_3 -> child_3a from root_a
  //
  // Expected behavior:
  // - Shared node child_2 is cloned along with child_3
  // - Reference from root_a: child_1a -> child_2a -> child_3a
  // - Reference from root_b: child_1b -> child_2 -> child_3 (not affected)
  //
  static getRefForWritingToStateRoot(stateRoot, fullPath) {
    let node = stateRoot;
    for (let i = 0; i < fullPath.length; i++) {
      const label = fullPath[i];
      const child = node.getChild(label);
      if (child !== null) {
        if (child.hasMultipleParents()) {
          const clonedChild = child.clone(this.stateVersion);
          clonedChild.resetValue();
          node.setChild(label, clonedChild);
          node = clonedChild;
        } else {
          child.resetValue();
          node = child;
        }
      } else {
        const newChild = new StateNode(this.stateVersion);
        node.setChild(label, newChild);
        node = newChild;
      }
    }
    return node;
  }

  getRefForWriting(fullPath) {
    return DB.getRefForWritingToStateRoot(this.stateRoot, fullPath);
  }

  static writeToStateRoot(stateRoot, stateVersion, fullPath, stateObj) {
    const tree = StateNode.fromJsObject(stateObj, stateVersion);
    if (!LIGHTWEIGHT) {
      updateStateInfoForStateTree(tree);
    }
    if (fullPath.length === 0) {
      stateRoot = tree;
    } else {
      const pathToParent = fullPath.slice(0, fullPath.length - 1);
      const treeLabel = fullPath[fullPath.length - 1];
      const parent = DB.getRefForWritingToStateRoot(stateRoot, pathToParent);
      parent.setChild(treeLabel, tree);
      updateStateInfoForAllRootPaths(parent, treeLabel);
    }
    return stateRoot;
  }

  writeDatabase(fullPath, stateObj) {
    this.stateRoot = DB.writeToStateRoot(this.stateRoot, this.stateVersion, fullPath, stateObj);
  }

  static readFromStateRoot(stateRoot, rootLabel, refPath, options, shardingPath) {
    const isGlobal = options && options.isGlobal;
    if (!stateRoot) return null;
    const parsedPath = CommonUtil.parsePath(refPath);
    const localPath = isGlobal ?  DB.toLocalPath(parsedPath, shardingPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    const fullPath = DB.getFullPath(localPath, rootLabel);
    const stateNode = DB.getRefForReadingFromStateRoot(stateRoot, fullPath);
    if (stateNode === null) {
      return null;
    }
    return stateNode.toJsObject(options);
  }

  readDatabase(refPath, rootLabel, options) {
    const isFinal = _.get(options, 'isFinal', false);
    const targetStateRoot = isFinal ? this.stateManager.getFinalRoot() : this.stateRoot;
    return DB.readFromStateRoot(targetStateRoot, rootLabel, refPath, options, this.shardingPath);
  }

  getValue(valuePath, options) {
    return this.readDatabase(valuePath, PredefinedDbPaths.VALUES_ROOT, options);
  }

  getFunction(functionPath, options) {
    return this.readDatabase(functionPath, PredefinedDbPaths.FUNCTIONS_ROOT, options);
  }

  getRule(rulePath, options) {
    return this.readDatabase(rulePath, PredefinedDbPaths.RULES_ROOT, options);
  }

  getOwner(ownerPath, options) {
    return this.readDatabase(ownerPath, PredefinedDbPaths.OWNERS_ROOT, options);
  }

  /**
   * Returns proof of a state node.
   * @param {string} statePath full database path to the state node
   */
  getStateProof(statePath) {
    const parsedPath = CommonUtil.parsePath(statePath);
    return getStateProofFromStateRoot(this.stateRoot, parsedPath);
  }

  /**
   * Returns proof hash of a state node.
   * @param {string} statePath full database path to the state node
   */
  getProofHash(statePath) {
    const parsedPath = CommonUtil.parsePath(statePath);
    return getProofHashFromStateRoot(this.stateRoot, parsedPath);
  }

  static getValueFromStateRoot(stateRoot, statePath, isShallow = false) {
    return DB.readFromStateRoot(
        stateRoot, PredefinedDbPaths.VALUES_ROOT, statePath, { isShallow }, []);
  }

  /**
   * Returns a state node's information.
   * @param {string} statePath full database path to the state node
   */
  getStateInfo(statePath) {
    const parsedPath = CommonUtil.parsePath(statePath);
    const stateNode = this.getRefForReading(parsedPath);
    if (stateNode === null) {
      return null;
    }
    return {
      [StateInfoProperties.TREE_HEIGHT]: stateNode.getTreeHeight(),
      [StateInfoProperties.TREE_SIZE]: stateNode.getTreeSize(),
      [StateInfoProperties.TREE_BYTES]: stateNode.getTreeBytes(),
      [StateInfoProperties.STATE_PROOF_HASH]: stateNode.getProofHash(),
      [StateInfoProperties.VERSION]: stateNode.getVersion(),
    };
  }

  matchFunction(funcPath, options) {
    const isGlobal = options && options.isGlobal;
    const parsedPath = CommonUtil.parsePath(funcPath);
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    return this.convertFunctionMatch(
        this.matchFunctionForParsedPath(localPath), isGlobal);
  }

  matchRule(valuePath, options) {
    const isGlobal = options && options.isGlobal;
    const parsedPath = CommonUtil.parsePath(valuePath);
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    return this.convertRuleMatch(
        this.matchRuleForParsedPath(localPath), isGlobal);
  }

  matchOwner(rulePath, options) {
    const isGlobal = options && options.isGlobal;
    const parsedPath = CommonUtil.parsePath(rulePath);
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    return this.convertOwnerMatch(
        this.matchOwnerForParsedPath(localPath), isGlobal);
  }

  evalRule(valuePath, value, auth, timestamp, options) {
    const isGlobal = options && options.isGlobal;
    const parsedPath = CommonUtil.parsePath(valuePath);
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    return this.getPermissionForValue(localPath, value, auth, timestamp);
  }

  evalOwner(refPath, permission, auth, options) {
    const isGlobal = options && options.isGlobal;
    const parsedPath = CommonUtil.parsePath(refPath);
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    const matched = this.matchOwnerForParsedPath(localPath);
    return this.checkPermission(matched.closestOwner.config, auth, permission);
  }

  // TODO(platfowner): Add tests for op.fid.
  get(opList) {
    const resultList = [];
    opList.forEach((op) => {
      if (op.type === undefined || op.type === ReadDbOperations.GET_VALUE) {
        resultList.push(this.getValue(op.ref, CommonUtil.toGetOptions(op)));
      } else if (op.type === ReadDbOperations.GET_RULE) {
        resultList.push(this.getRule(op.ref, CommonUtil.toGetOptions(op)));
      } else if (op.type === ReadDbOperations.GET_FUNCTION) {
        resultList.push(this.getFunction(op.ref, CommonUtil.toGetOptions(op)));
      } else if (op.type === ReadDbOperations.GET_OWNER) {
        resultList.push(this.getOwner(op.ref, CommonUtil.toGetOptions(op)));
      } else if (op.type === ReadDbOperations.MATCH_FUNCTION) {
        resultList.push(this.matchFunction(op.ref, CommonUtil.toMatchOrEvalOptions(op)));
      } else if (op.type === ReadDbOperations.MATCH_RULE) {
        resultList.push(this.matchRule(op.ref, CommonUtil.toMatchOrEvalOptions(op)));
      } else if (op.type === ReadDbOperations.MATCH_OWNER) {
        resultList.push(this.matchOwner(op.ref, CommonUtil.toMatchOrEvalOptions(op)));
      } else if (op.type === ReadDbOperations.EVAL_RULE) {
        const auth = {};
        if (op.address) {
          auth.addr = op.address;
        }
        if (op.fid) {
          auth.fid = op.fid;
        }
        const timestamp = op.timestamp || Date.now();
        resultList.push(this.evalRule(
            op.ref, op.value, auth, timestamp, CommonUtil.toMatchOrEvalOptions(op)));
      } else if (op.type === ReadDbOperations.EVAL_OWNER) {
        const auth = {};
        if (op.address) {
          auth.addr = op.address;
        }
        if (op.fid) {
          auth.fid = op.fid;
        }
        resultList.push(this.evalOwner(
            op.ref, op.permission, auth, CommonUtil.toMatchOrEvalOptions(op)));
      }
    });
    return resultList;
  }

  static getAccountNonceAndTimestampFromStateRoot(stateRoot, address) {
    const noncePath = PathUtil.getAccountNoncePath(address);
    const timestampPath = PathUtil.getAccountTimestampPath(address);
    const nonce = DB.getValueFromStateRoot(stateRoot, noncePath) || 0;
    const timestamp = DB.getValueFromStateRoot(stateRoot, timestampPath) || 0;
    return { nonce, timestamp };
  }

  getAccountNonceAndTimestamp(address) {
    return DB.getAccountNonceAndTimestampFromStateRoot(this.stateRoot, address);
  }

  static updateAccountNonceAndTimestampToStateRoot(
      stateRoot, stateVersion, address, nonce, timestamp) {
    if (nonce >= 0) { // numbered nonce
      const noncePath = PathUtil.getAccountNoncePath(address);
      const fullNoncePath =
          DB.getFullPath(CommonUtil.parsePath(noncePath), PredefinedDbPaths.VALUES_ROOT);
      DB.writeToStateRoot(stateRoot, stateVersion, fullNoncePath, nonce + 1);
    } else if (nonce === -2) { // ordered nonce
      const timestampPath = PathUtil.getAccountTimestampPath(address);
      const fullTimestampPath =
          DB.getFullPath(CommonUtil.parsePath(timestampPath), PredefinedDbPaths.VALUES_ROOT);
      DB.writeToStateRoot(stateRoot, stateVersion, fullTimestampPath, timestamp);
    }

    return true;
  }

  updateAccountNonceAndTimestamp(address, nonce, timestamp) {
    return DB.updateAccountNonceAndTimestampToStateRoot(
        this.stateRoot, this.stateVersion, address, nonce, timestamp);
  }

  static getAppStakesTotalFromStateRoot(stateRoot) {
    const appStakes = DB.getValueFromStateRoot(stateRoot, PredefinedDbPaths.STAKING, true) || {};
    return Object.keys(appStakes).filter((appName) => appName !== PredefinedDbPaths.CONSENSUS)
        .reduce((acc, appName) => acc +
            DB.getValueFromStateRoot(stateRoot, PathUtil.getStakingBalanceTotalPath(appName)), 0);
  }

  getAppStakesTotal() {
    return DB.getAppStakesTotalFromStateRoot(this.stateRoot);
  }

  static getAppStakeFromStateRoot(stateRoot, appName) {
    const appStakePath = PathUtil.getStakingBalanceTotalPath(appName);
    return DB.getValueFromStateRoot(stateRoot, appStakePath) || 0;
  }

  getAppStake(appName) {
    return DB.getAppStakeFromStateRoot(this.stateRoot, appName);
  }

  // TODO(platfowner): Define error code explicitly.
  // TODO(platfowner): Apply .shard (isWritablePathWithSharding()) to setFunction(), setRule(),
  //                   and setOwner() as well.
  setValue(valuePath, value, auth, timestamp, transaction, blockTime, options) {
    const isGlobal = options && options.isGlobal;
    const isValidObj = isValidJsObjectForStates(value);
    if (!isValidObj.isValid) {
      return CommonUtil.returnTxResult(101, `Invalid object for states: ${isValidObj.invalidPath}`, 1);
    }
    const parsedPath = CommonUtil.parsePath(valuePath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return CommonUtil.returnTxResult(102, `Invalid path: ${isValidPath.invalidPath}`, 1);
    }
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return CommonUtil.returnTxResult(0, null, 1);
    }
    if (!this.getPermissionForValue(localPath, value, auth, timestamp)) {
      return CommonUtil.returnTxResult(103, `No write permission on: ${valuePath}`, 1);
    }
    const fullPath = DB.getFullPath(localPath, PredefinedDbPaths.VALUES_ROOT);
    const isWritablePath = isWritablePathWithSharding(fullPath, this.stateRoot);
    if (!isWritablePath.isValid) {
      if (isGlobal) {
        // There is nothing to do.
        return CommonUtil.returnTxResult(0, null, 1);
      } else {
        return CommonUtil.returnTxResult(
            104, `Non-writable path with shard config: ${isWritablePath.invalidPath}`, 1);
      }
    }
    const prevValue = this.getValue(valuePath, { isShallow: false, isGlobal });
    const prevValueCopy = CommonUtil.isDict(prevValue) ? JSON.parse(JSON.stringify(prevValue)) : prevValue;
    const valueCopy = CommonUtil.isDict(value) ? JSON.parse(JSON.stringify(value)) : value;
    this.writeDatabase(fullPath, valueCopy);
    let funcResults = null;
    if (auth && (auth.addr || auth.fid)) {
      if (blockTime === null) {
        blockTime = this.lastBlockTimestamp();
      }
      const { func_results } =
          this.func.triggerFunctions(localPath, valueCopy, prevValueCopy, auth, timestamp, transaction, blockTime);
      funcResults = func_results;
      if (CommonUtil.isFailedFuncTrigger(funcResults)) {
        return CommonUtil.returnTxResult(105, `Triggered function call failed`, 1, funcResults);
      }
    }

    return CommonUtil.returnTxResult(0, null, 1, funcResults);
  }

  incValue(valuePath, delta, auth, timestamp, transaction, blockTime, options) {
    const isGlobal = options && options.isGlobal;
    const valueBefore = this.getValue(valuePath, { isShallow: false, isGlobal });
    logger.debug(`VALUE BEFORE:  ${JSON.stringify(valueBefore)}`);
    if ((valueBefore !== null && !CommonUtil.isNumber(valueBefore)) || !CommonUtil.isNumber(delta)) {
      return CommonUtil.returnTxResult(201, `Not a number type: ${valueBefore} or ${delta}`, 1);
    }
    const valueAfter = CommonUtil.numberOrZero(valueBefore) + delta;
    return this.setValue(valuePath, valueAfter, auth, timestamp, transaction, blockTime, options);
  }

  decValue(valuePath, delta, auth, timestamp, transaction, blockTime, options) {
    const isGlobal = options && options.isGlobal;
    const valueBefore = this.getValue(valuePath, { isShallow: false, isGlobal });
    logger.debug(`VALUE BEFORE:  ${JSON.stringify(valueBefore)}`);
    if ((valueBefore !== null && !CommonUtil.isNumber(valueBefore)) || !CommonUtil.isNumber(delta)) {
      return CommonUtil.returnTxResult(301, `Not a number type: ${valueBefore} or ${delta}`, 1);
    }
    const valueAfter = CommonUtil.numberOrZero(valueBefore) - delta;
    return this.setValue(valuePath, valueAfter, auth, timestamp, transaction, blockTime, options);
  }

  setFunction(functionPath, func, auth, options) {
    const isGlobal = options && options.isGlobal;
    const isValidObj = isValidJsObjectForStates(func);
    if (!isValidObj.isValid) {
      return CommonUtil.returnTxResult(401, `Invalid object for states: ${isValidObj.invalidPath}`, 1);
    }
    const isValidFunction = isValidFunctionTree(func);
    if (!isValidFunction.isValid) {
      return CommonUtil.returnTxResult(405, `Invalid function tree: ${isValidFunction.invalidPath}`, 1);
    }
    const parsedPath = CommonUtil.parsePath(functionPath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return CommonUtil.returnTxResult(402, `Invalid path: ${isValidPath.invalidPath}`, 1);
    }
    if (!auth || auth.addr !== this.ownerAddress) {
      const ownerOnlyFid = this.func.hasOwnerOnlyFunction(func);
      if (ownerOnlyFid !== null) {
        return CommonUtil.returnTxResult(
            403, `Trying to write owner-only function: ${ownerOnlyFid}`, 1);
      }
    }
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return CommonUtil.returnTxResult(0, null, 1);
    }
    if (!this.getPermissionForFunction(localPath, auth)) {
      return CommonUtil.returnTxResult(404, `No write_function permission on: ${functionPath}`, 1);
    }
    const curFunction = this.getFunction(functionPath, { isShallow: false, isGlobal });
    const newFunction = applyFunctionChange(curFunction, func);
    const fullPath = DB.getFullPath(localPath, PredefinedDbPaths.FUNCTIONS_ROOT);
    this.writeDatabase(fullPath, newFunction);
    return CommonUtil.returnTxResult(0, null, 1);
  }

  // TODO(platfowner): Add rule config sanitization logic (e.g. dup path variables,
  //                   multiple path variables).
  setRule(rulePath, rule, auth, options) {
    const isGlobal = options && options.isGlobal;
    const isValidObj = isValidJsObjectForStates(rule);
    if (!isValidObj.isValid) {
      return CommonUtil.returnTxResult(501, `Invalid object for states: ${isValidObj.invalidPath}`, 1);
    }
    const isValidRule = isValidRuleTree(rule);
    if (!isValidRule.isValid) {
      return CommonUtil.returnTxResult(504, `Invalid rule tree: ${isValidRule.invalidPath}`, 1);
    }
    const parsedPath = CommonUtil.parsePath(rulePath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return CommonUtil.returnTxResult(502, `Invalid path: ${isValidPath.invalidPath}`, 1);
    }
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return CommonUtil.returnTxResult(0, null, 1);
    }
    if (!this.getPermissionForRule(localPath, auth)) {
      return CommonUtil.returnTxResult(503, `No write_rule permission on: ${rulePath}`, 1);
    }
    const fullPath = DB.getFullPath(localPath, PredefinedDbPaths.RULES_ROOT);
    const ruleCopy = CommonUtil.isDict(rule) ? JSON.parse(JSON.stringify(rule)) : rule;
    this.writeDatabase(fullPath, ruleCopy);
    return CommonUtil.returnTxResult(0, null, 1);
  }

  setOwner(ownerPath, owner, auth, options) {
    const isGlobal = options && options.isGlobal;
    const isValidObj = isValidJsObjectForStates(owner);
    if (!isValidObj.isValid) {
      return CommonUtil.returnTxResult(601, `Invalid object for states: ${isValidObj.invalidPath}`, 1);
    }
    const isValidOwner = isValidOwnerTree(owner);
    if (!isValidOwner.isValid) {
      return CommonUtil.returnTxResult(604, `Invalid owner tree: ${isValidOwner.invalidPath}`, 1);
    }
    const parsedPath = CommonUtil.parsePath(ownerPath);
    const isValidPath = isValidPathForStates(parsedPath);
    if (!isValidPath.isValid) {
      return CommonUtil.returnTxResult(602, `Invalid path: ${isValidPath.invalidPath}`, 1);
    }
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return CommonUtil.returnTxResult(0, null, 1);
    }
    if (!this.getPermissionForOwner(localPath, auth)) {
      return CommonUtil.returnTxResult(
          603, `No write_owner or branch_owner permission on: ${ownerPath}`, 1);
    }
    const curOwner = this.getOwner(ownerPath, { isShallow: false, isGlobal });
    const newOwner = applyOwnerChange(curOwner, owner);
    const fullPath = DB.getFullPath(localPath, PredefinedDbPaths.OWNERS_ROOT);
    this.writeDatabase(fullPath, newOwner);
    return CommonUtil.returnTxResult(0, null, 1);
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

  executeSingleSetOperation(op, auth, timestamp, tx, blockTime) {
    let result;
    switch (op.type) {
      case undefined:
      case WriteDbOperations.SET_VALUE:
        result = this.setValue(op.ref, op.value, auth, timestamp, tx, blockTime, CommonUtil.toSetOptions(op));
        break;
      case WriteDbOperations.INC_VALUE:
        result = this.incValue(op.ref, op.value, auth, timestamp, tx, blockTime, CommonUtil.toSetOptions(op));
        break;
      case WriteDbOperations.DEC_VALUE:
        result = this.decValue(op.ref, op.value, auth, timestamp, tx, blockTime, CommonUtil.toSetOptions(op));
        break;
      case WriteDbOperations.SET_FUNCTION:
        result = this.setFunction(op.ref, op.value, auth, CommonUtil.toSetOptions(op));
        break;
      case WriteDbOperations.SET_RULE:
        result = this.setRule(op.ref, op.value, auth, CommonUtil.toSetOptions(op));
        break;
      case WriteDbOperations.SET_OWNER:
        result = this.setOwner(op.ref, op.value, auth, CommonUtil.toSetOptions(op));
        break;
      default:
        return CommonUtil.returnTxResult(14, `Invalid operation type: ${op.type}`, 1);
    }
    return result;
  }

  executeMultiSetOperation(opList, auth, timestamp, tx, blockTime) {
    const resultList = {};
    for (let i = 0; i < opList.length; i++) {
      const op = opList[i];
      const result = this.executeSingleSetOperation(op, auth, timestamp, tx, blockTime);
      resultList[i] = result;
      if (CommonUtil.isFailedTx(result)) {
        break;
      }
    }
    return { result_list: resultList };
  }

  static updateGasAmountTotal(tx, gasAmountTotal, executionResult) {
    gasAmountTotal.bandwidth = CommonUtil.getTotalBandwidthGasAmount(tx.tx_body.operation, executionResult);
    executionResult.gas_amount_total = gasAmountTotal;
    tx.setExtraField('gas', gasAmountTotal);
  }

  executeOperation(op, auth, timestamp, tx, blockTime) {
    const gasAmountTotal = {
      bandwidth: { service: 0 },
      state: { service: 0 }
    };
    const result = {
      gas_amount_total: gasAmountTotal,
      gas_cost_total: 0
    };
    if (!op) {
      Object.assign(result, CommonUtil.returnTxResult(11, `Invalid operation: ${op}`, 1));
      DB.updateGasAmountTotal(tx, gasAmountTotal, result);
      return result;
    }
    const allStateUsageBefore = this.getAllStateUsages();
    const stateUsagePerAppBefore = this.getStateUsagePerApp(op);
    if (op.type === WriteDbOperations.SET) {
      Object.assign(result, this.executeMultiSetOperation(op.op_list, auth, timestamp, tx, blockTime));
    } else {
      Object.assign(result, this.executeSingleSetOperation(op, auth, timestamp, tx, blockTime));
    }
    const stateUsagePerAppAfter = this.getStateUsagePerApp(op);
    DB.updateGasAmountTotal(tx, gasAmountTotal, result);
    if (!CommonUtil.isFailedTx(result)) {
      const heightCheck = this.checkTreeHeightAndSize();
      if (CommonUtil.isFailedTx(heightCheck)) {
        return Object.assign(result, heightCheck);
      }
      // NOTE(platfowner): There is no chance to have invalid gas price as its validity check is
      //                   done in isValidTxBody() when transactions are created.
      const allStateUsageAfter = this.getAllStateUsages();
      DB.updateStateGasAmount(
          tx, result, allStateUsageBefore, allStateUsageAfter, stateUsagePerAppBefore, stateUsagePerAppAfter);
      const stateGasBudgetCheck = this.checkStateGasBudgets(op, allStateUsageAfter.apps, allStateUsageAfter.service, result);
      if (stateGasBudgetCheck !== true) {
        return stateGasBudgetCheck;
      }
      if (tx && auth && auth.addr && !auth.fid) {
        this.updateAccountNonceAndTimestamp(auth.addr, tx.tx_body.nonce, tx.tx_body.timestamp);
      }
    }
    return result;
  }

  static updateStateGasAmount(tx, result, allStateUsageBefore, allStateUsageAfter, stateUsagePerAppBefore, stateUsagePerAppAfter) {
    const LOG_HEADER = 'updateStateGasAmounts';
    const serviceTreeBytesDelta =
        _.get(allStateUsageAfter, `service.${StateInfoProperties.TREE_BYTES}`, 0) -
        _.get(allStateUsageBefore, `service.${StateInfoProperties.TREE_BYTES}`, 0);
    const appStateGasAmount = Object.keys(stateUsagePerAppAfter).reduce((acc, appName) => {
      const delta = stateUsagePerAppAfter[appName][StateInfoProperties.TREE_BYTES] -
          stateUsagePerAppBefore[appName][StateInfoProperties.TREE_BYTES];
      if (delta > 0) {
        acc[appName] = delta * STATE_GAS_COEFFICIENT;
      }
      return acc;
    }, {});
    const stateGasAmount = {
      service: Math.max(serviceTreeBytesDelta, 0) * STATE_GAS_COEFFICIENT
    };
    if (!CommonUtil.isEmpty(appStateGasAmount)) {
      stateGasAmount.app = appStateGasAmount;
    }
    logger.debug(`[${LOG_HEADER}] stateGasAmount: ${JSON.stringify(stateGasAmount, null, 2)}`);
    CommonUtil.setJsObject(result, ['gas_amount_total', 'state'], stateGasAmount);
    const txGas = _.get(tx, 'extra.gas', { bandwidth: { service: 0 } });
    CommonUtil.setJsObject(txGas, ['state'], stateGasAmount);
    tx.setExtraField('gas', txGas);
  }

  // TODO(liayoo): reduce computation by remembering & reusing the computed values.
  getStateFreeTierUsage() {
    const usage = {};
    const apps = DB.getValueFromStateRoot(this.stateRoot, PredefinedDbPaths.APPS, true) || {};
    for (const appName of Object.keys(apps)) {
      if (!DB.getValueFromStateRoot(
          this.stateRoot,
          `/${PredefinedDbPaths.STAKING}/${appName}/${PredefinedDbPaths.STAKING_BALANCE_TOTAL}`)) {
        CommonUtil.mergeNumericJsObjects(
            usage, this.getStateUsageAtPath(`${PredefinedDbPaths.APPS}/${appName}`));
      }
    }
    return usage;
  }

  getStateUsageAtPath(path) {
    if (!path || path === '/') {
      return this.getStateInfo('/');
    }
    const usageList = [
      this.getStateInfo(`/${PredefinedDbPaths.VALUES_ROOT}/${path}`),
      this.getStateInfo(`/${PredefinedDbPaths.RULES_ROOT}/${path}`),
      this.getStateInfo(`/${PredefinedDbPaths.FUNCTIONS_ROOT}/${path}`),
      this.getStateInfo(`/${PredefinedDbPaths.OWNERS_ROOT}/${path}`)
    ];
    const usage = usageList.reduce((acc, cur) => {
      CommonUtil.mergeNumericJsObjects(acc, cur);
      return acc;
    }, {});
    delete usage[StateInfoProperties.VERSION];
    delete usage[StateInfoProperties.STATE_PROOF_HASH];
    return usage;
  }

  getAllStateUsages() {
    const root = this.getStateUsageAtPath('/');
    const apps = this.getStateUsageAtPath(PredefinedDbPaths.APPS);
    const service = {
      [StateInfoProperties.TREE_BYTES]: root[StateInfoProperties.TREE_BYTES] - apps[StateInfoProperties.TREE_BYTES],
      [StateInfoProperties.TREE_SIZE]: root[StateInfoProperties.TREE_SIZE] - apps[StateInfoProperties.TREE_SIZE]
    };
    return { root, apps, service };
  }

  getStateUsagePerApp(op) {
    const appNameList = CommonUtil.getAppNameList(op, this.shardingPath);
    return appNameList.reduce((acc, appName) => {
      acc[appName] = this.getStateUsageAtPath(`${PredefinedDbPaths.APPS}/${appName}`);
      return acc;
    }, {});
  }

  checkStateGasBudgets(op, allAppsStateUsage, serviceStateUsage, result) {
    if (serviceStateUsage[StateInfoProperties.TREE_BYTES] > SERVICE_STATE_BUDGET) {
      return Object.assign(result, {
          code: 25,
          error_message: `Exceeded state budget limit for services ` +
            `(${serviceStateUsage[StateInfoProperties.TREE_BYTES]} > ${SERVICE_STATE_BUDGET})`
      });
    }
    if (allAppsStateUsage[StateInfoProperties.TREE_BYTES] > APPS_STATE_BUDGET) {
      return Object.assign(result, {
          code: 26,
          error_message: `Exceeded state budget limit for apps ` +
            `(${allAppsStateUsage[StateInfoProperties.TREE_BYTES]} > ${APPS_STATE_BUDGET})`
      });
    }
    if (serviceStateUsage[StateInfoProperties.TREE_SIZE] > SERVICE_TREE_SIZE_BUDGET) {
      return Object.assign(result, {
          code: 27,
          error_message: `Exceeded state tree size limit for services ` +
            `(${serviceStateUsage[StateInfoProperties.TREE_SIZE]} > ${SERVICE_TREE_SIZE_BUDGET})`
      });
    }
    if (allAppsStateUsage[StateInfoProperties.TREE_SIZE] > APPS_TREE_SIZE_BUDGET) {
      return Object.assign(result, {
          code: 28,
          error_message: `Exceeded state tree size limit for apps ` +
            `(${allAppsStateUsage[StateInfoProperties.TREE_SIZE]} > ${APPS_TREE_SIZE_BUDGET})`
      });
    }
    const stateFreeTierUsage = this.getStateFreeTierUsage();
    const freeTierTreeBytesLimitReached = stateFreeTierUsage[StateInfoProperties.TREE_BYTES] >= FREE_STATE_BUDGET;
    const freeTierTreeSizeLimitReached = stateFreeTierUsage[StateInfoProperties.TREE_SIZE] >= FREE_TREE_SIZE_BUDGET;
    const appStakesTotal = this.getAppStakesTotal();
    for (const appName of CommonUtil.getAppNameList(op, this.shardingPath)) {
      const appStateUsage = this.getStateUsageAtPath(`${PredefinedDbPaths.APPS}/${appName}`);
      const appStake = this.getAppStake(appName);
      if (appStake === 0) {
        if (freeTierTreeBytesLimitReached) {
          return Object.assign(result, {
              code: 29,
              error_message: `Exceeded state budget limit for free tier ` +
                `(${stateFreeTierUsage[StateInfoProperties.TREE_BYTES]} > ${FREE_STATE_BUDGET})`
          });
        }
        if (freeTierTreeSizeLimitReached) {
          return Object.assign(result, {
            code: 30,
            error_message: `Exceeded state tree size limit for free tier ` +
              `(${stateFreeTierUsage[StateInfoProperties.TREE_SIZE]} > ${FREE_TREE_SIZE_BUDGET})`
          });
        }
        // else, we allow apps without stakes
      } else {
        const appStateBudget = APPS_STATE_BUDGET * appStake / appStakesTotal;
        const appTreeSizeBudget = APPS_TREE_SIZE_BUDGET * appStake / appStakesTotal;
        if (appStateUsage[StateInfoProperties.TREE_BYTES] > appStateBudget) {
          return Object.assign(result, {
              code: 31,
              error_message: `Exceeded state budget limit for app ${appName} ` +
                `(${appStateUsage[StateInfoProperties.TREE_BYTES]} > ${appStateBudget})`
          });
        }
        if (appStateUsage[StateInfoProperties.TREE_SIZE] > appTreeSizeBudget) {
          return Object.assign(result, {
              code: 32,
              error_message: `Exceeded state tree size limit for app ${appName} ` +
                `(${appStateUsage[StateInfoProperties.TREE_SIZE]} > ${appTreeSizeBudget})`
          });
        }
      }
    }
    return true;
  }

  collectFee(auth, timestamp, tx, blockNumber, executionResult) {
    const gasPrice = tx.tx_body.gas_price;
    // Use only the service gas amount total
    const serviceBandwidthGasAmount = _.get(tx, 'extra.gas.bandwidth.service', 0);
    const serviceStateGasAmount = _.get(tx, 'extra.gas.state.service', 0);
    let gasAmountChargedByTransfer = serviceBandwidthGasAmount +
        (CommonUtil.isFailedTx(executionResult) ? 0 : serviceStateGasAmount);
    if (gasAmountChargedByTransfer <= 0 || gasPrice === 0) { // No fees to collect
      executionResult.gas_amount_charged = gasAmountChargedByTransfer;
      executionResult.gas_cost_total = CommonUtil.getTotalGasCost(gasPrice, gasAmountChargedByTransfer);
      return;
    }
    const billing = tx.tx_body.billing;
    let billedTo = billing ? CommonUtil.toBillingAccountName(billing) : auth.addr;
    if (billing) {
      const billingParsed = CommonUtil.parseServAcntName(billing);
      if (!this.isBillingUser(billingParsed[0], billingParsed[1], auth.addr)) {
        // No longer in the billing users list. Charge the tx signer instead
        billedTo = auth.addr;
      }
    }
    let balance = this.getBalance(billedTo);
    const gasCost = CommonUtil.getTotalGasCost(gasPrice, gasAmountChargedByTransfer);
    if (balance < gasCost) {
      Object.assign(executionResult, {
        code: 36,
        error_message: `Failed to collect gas fee: balance too low (${balance} / ${gasCost})`
      });
      this.restoreDb(); // Revert changes made by the tx operations
      balance = this.getBalance(billedTo);
      gasAmountChargedByTransfer = Math.min(balance, serviceBandwidthGasAmount);
    }
    executionResult.gas_amount_charged = gasAmountChargedByTransfer;
    executionResult.gas_cost_total = CommonUtil.getTotalGasCost(gasPrice, executionResult.gas_amount_charged);
    if (executionResult.gas_cost_total <= 0) return;
    const gasFeeCollectPath = PathUtil.getGasFeeCollectPath(blockNumber, billedTo, tx.hash);
    const gasFeeCollectRes = this.setValue(
        gasFeeCollectPath, { amount: executionResult.gas_cost_total }, auth, timestamp, tx, null);
    if (CommonUtil.isFailedTx(gasFeeCollectRes)) { // Should not happend
      Object.assign(executionResult, {
        code: 18,
        error_message: `Failed to collect gas fee: ${JSON.stringify(gasFeeCollectRes, null, 2)}`
      });
    }
  }

  static trimExecutionResult(executionResult) {
    const trimmed = _.pick(executionResult, [
      PredefinedDbPaths.RECEIPTS_EXEC_RESULT_CODE,
      PredefinedDbPaths.RECEIPTS_EXEC_RESULT_ERROR_MESSAGE,
      PredefinedDbPaths.RECEIPTS_EXEC_RESULT_GAS_AMOUNT_CHARGED,
      PredefinedDbPaths.RECEIPTS_EXEC_RESULT_GAS_COST_TOTAL,
    ]);
    if (executionResult[PredefinedDbPaths.RECEIPTS_EXEC_RESULT_RESULT_LIST]) {
      trimmed[PredefinedDbPaths.RECEIPTS_EXEC_RESULT_RESULT_LIST] = {};
      for (const [key, val] of Object.entries(executionResult[PredefinedDbPaths.RECEIPTS_EXEC_RESULT_RESULT_LIST])) {
        trimmed[PredefinedDbPaths.RECEIPTS_EXEC_RESULT_RESULT_LIST][key] = _.pick(val, [
          PredefinedDbPaths.RECEIPTS_EXEC_RESULT_CODE,
          PredefinedDbPaths.RECEIPTS_EXEC_RESULT_ERROR_MESSAGE,
        ]);
      }
    }
    return trimmed;
  }

  recordReceipt(auth, tx, blockNumber, executionResult) {
    const receiptPath = PathUtil.getReceiptPath(tx.hash);
    const receipt = {
      [PredefinedDbPaths.RECEIPTS_ADDRESS]: auth.addr,
      [PredefinedDbPaths.RECEIPTS_BLOCK_NUMBER]: blockNumber,
      [PredefinedDbPaths.RECEIPTS_EXEC_RESULT]: DB.trimExecutionResult(executionResult)
    };
    if (tx.tx_body.billing) {
      receipt[PredefinedDbPaths.RECEIPTS_BILLING] = tx.tx_body.billing;
    }
    // NOTE(liayoo): necessary balance & permission checks have been done in precheckTransaction()
    //               and collectFee().
    this.writeDatabase([PredefinedDbPaths.VALUES_ROOT, ...CommonUtil.parsePath(receiptPath)], receipt);
  }

  isBillingUser(billingAppName, billingId, userAddr) {
    return this.getValue(
        PathUtil.getManageAppBillingUsersPath(billingAppName, billingId) + '/' + userAddr) === true;
  }

  precheckNonceAndTimestamp(nonce, timestamp, addr) {
    if (!CommonUtil.isNumber(nonce)) {
      return CommonUtil.returnTxResult(19, `Invalid nonce value: ${nonce}`);
    }
    if (!CommonUtil.isNumber(timestamp)) {
      return CommonUtil.returnTxResult(20, `Invalid timestamp value: ${timestamp}`);
    }
    const { nonce: accountNonce, timestamp: accountTimestamp } = this.getAccountNonceAndTimestamp(addr);
    if (nonce >= 0 && nonce !== accountNonce) {
      return CommonUtil.returnTxResult(
          12, `Invalid nonce: ${nonce} !== ${accountNonce}`);
    }
    if (nonce === -2 && timestamp <= accountTimestamp) {
      return CommonUtil.returnTxResult(
          13, `Invalid timestamp: ${timestamp} <= ${accountTimestamp}`);
    }
    return true;
  }

  precheckTxBillingParams(op, addr, billing, blockNumber) {
    const LOG_HEADER = 'precheckTxBillingParams';
    if (!billing || blockNumber === 0) {
      return true;
    }
    const billingParsed = CommonUtil.parseServAcntName(billing);
    if (billingParsed[0] === null || billingParsed[1] === null || billingParsed[2] !== null) {
      return CommonUtil.logAndReturnTxResult(logger, 15, `[${LOG_HEADER}] Invalid billing param`);
    }
    if (!this.isBillingUser(billingParsed[0], billingParsed[1], addr)) {
      return CommonUtil.logAndReturnTxResult(
        logger, 33, `[${LOG_HEADER}] User doesn't have permission to the billing account`);
    }
    const appNameList = CommonUtil.getServiceDependentAppNameList(op);
    if (appNameList.length > 1) {
      // More than 1 apps are involved. Cannot charge an app-related billing account.
      return CommonUtil.logAndReturnTxResult(
        logger, 16, `[${LOG_HEADER}] Multiple app-dependent service operations for a billing account`);
    }
    if (appNameList.length === 1) {
      if (appNameList[0] !== billingParsed[0]) {
        // Tx app name doesn't match the billing account.
        return CommonUtil.logAndReturnTxResult(logger, 17, `[${LOG_HEADER}] Invalid billing account`);
      }
      // App name matches the billing account.
    }
    // Tx is app-independent.
    return true;
  }

  getBalance(addrOrServAcnt) {
    return this.getValue(CommonUtil.getBalancePath(addrOrServAcnt)) || 0;
  }

  precheckBalanceAndStakes(op, addr, billing, blockNumber) {
    const LOG_HEADER = 'precheckBalanceAndStakes';
    if (blockNumber === 0) {
      return true;
    }
    const billedTo = billing ? CommonUtil.toBillingAccountName(billing) : addr;
    if (CommonUtil.hasServiceOp(op)) {
      const balance = this.getBalance(billedTo);
      if (balance < MIN_BALANCE_FOR_SERVICE_TX) {
        return CommonUtil.logAndReturnTxResult(
          logger, 34, `[${LOG_HEADER}] Balance too low (${balance} < ${MIN_BALANCE_FOR_SERVICE_TX})`);
      }
    }
    const appNameList = CommonUtil.getAppNameList(op, this.shardingPath);
    appNameList.forEach((appName) => {
      const appStake = this.getAppStake(appName);
      if (appStake < MIN_STAKING_FOR_APP_TX) {
        return CommonUtil.logAndReturnTxResult(
          logger, 35, `[${LOG_HEADER}] App stake too low (${appStake} < ${MIN_STAKING_FOR_APP_TX})`);
      }
    });
    return true;
  }

  precheckTransaction(tx, blockNumber) {
    const LOG_HEADER = 'precheckTransaction';
    // NOTE(platfowner): A transaction needs to be converted to an executable form
    //                   before being executed.
    if (!Transaction.isExecutable(tx)) {
      return CommonUtil.logAndReturnTxResult(
          logger, 21,
          `[${LOG_HEADER}] Not executable transaction: ${JSON.stringify(tx)}`, 0);
    }
    if (!tx.tx_body) {
      return CommonUtil.logAndReturnTxResult(
          logger, 22, `[${LOG_HEADER}] Missing tx_body: ${JSON.stringify(tx)}`, 0);
    }
    const billing = tx.tx_body.billing;
    const op = tx.tx_body.operation;
    const addr = tx.address;
    const checkNonceTimestampResult = this.precheckNonceAndTimestamp(
        tx.tx_body.nonce, tx.tx_body.timestamp, addr);
    if (checkNonceTimestampResult !== true) {
      return checkNonceTimestampResult;
    }
    const checkBillingResult = this.precheckTxBillingParams(op, addr, billing, blockNumber);
    if (checkBillingResult !== true) {
      return checkBillingResult;
    }
    const checkBalanceResult = this.precheckBalanceAndStakes(op, addr, billing, blockNumber);
    if (checkBalanceResult !== true) {
      return checkBalanceResult;
    }
    return true;
  }

  executeTransaction(tx, skipFees = false, restoreIfFails = false, blockNumber = 0, blockTime = null) {
    const LOG_HEADER = 'executeTransaction';
    const precheckResult = this.precheckTransaction(tx, blockNumber);
    if (precheckResult !== true) {
      logger.debug(`[${LOG_HEADER}] Pre-check failed`);
      return precheckResult;
    }
    if (restoreIfFails) {
      if (!this.backupDb()) {
        return CommonUtil.logAndReturnTxResult(
          logger, 3, `[${LOG_HEADER}] Failed to backup db for tx: ${tx.hash}`, 0);
      }
    }
    // Record when the tx was executed.
    const txBody = tx.tx_body;
    tx.setExtraField('executed_at', Date.now());
    // NOTE(platfowner): It's not allowed for users to send transactions with auth.fid.
    const auth = { addr: tx.address };
    const timestamp = txBody.timestamp;
    const executionResult = this.executeOperation(txBody.operation, auth, timestamp, tx, blockTime);
    if (CommonUtil.isFailedTx(executionResult)) {
      if (restoreIfFails) {
        this.restoreDb();
      } else {
        return executionResult;
      }
    }
    if (!skipFees) {
      this.collectFee(auth, timestamp, tx, blockNumber, executionResult);
      if (FeatureFlags.enableReceiptsRecording) {
        this.recordReceipt(auth, tx, blockNumber, executionResult);
      }
    }
    return executionResult;
  }

  executeTransactionList(txList, skipFees = false, restoreIfFails = false, blockNumber = 0, blockTime = null) {
    const LOG_HEADER = 'executeTransactionList';
    const resList = [];
    for (const tx of txList) {
      const executableTx = Transaction.toExecutable(tx);
      const res = this.executeTransaction(executableTx, skipFees, restoreIfFails, blockNumber, blockTime);
      if (CommonUtil.isFailedTx(res)) {
        logger.debug(`[${LOG_HEADER}] tx failed: ${JSON.stringify(executableTx, null, 2)}` +
            `\nresult: ${JSON.stringify(res)}`);
        if (CommonUtil.txPrecheckFailed(res) && !restoreIfFails) { // abort right away
          return false;
        }
      }
      resList.push(res);
    }
    return resList;
  }

  checkTreeHeightAndSize() {
    const {
      [StateInfoProperties.TREE_HEIGHT]: treeHeight,
      [StateInfoProperties.TREE_SIZE]: treeSize,
    } = this.getStateInfo('/');
    if (treeHeight > STATE_TREE_HEIGHT_LIMIT) {
      return {
        code: 23,
        error_message: `Out of tree height limit (${treeHeight} > ${STATE_TREE_HEIGHT_LIMIT})`
      };
    }
    if (treeSize > TREE_SIZE_BUDGET) {
      return {
        code: 24,
        error_message: `Out of tree size budget (${treeSize} > ${TREE_SIZE_BUDGET})`
      };
    }
    return {
      code: 0
    }
  }

  addPathToValue(value, matchedValuePath, closestConfigDepth) {
    const pathToAdd = matchedValuePath.slice(closestConfigDepth, matchedValuePath.length);
    let newValue = value;
    for (let i = pathToAdd.length - 1; i >= 0; i--) {
      newValue = {[pathToAdd[i]]: newValue};
    }
    return newValue;
  }

  // TODO(platfowner): Eval subtree rules.
  getPermissionForValue(parsedValuePath, newValue, auth, timestamp) {
    const LOG_HEADER = 'getPermissionForValue';
    const matched = this.matchRuleForParsedPath(parsedValuePath);
    const value = this.getValue(CommonUtil.formatPath(parsedValuePath));
    const data =
        this.addPathToValue(value, matched.matchedValuePath, matched.closestRule.path.length);
    const newData =
        this.addPathToValue(newValue, matched.matchedValuePath, matched.closestRule.path.length);
    let evalRuleRes = false;
    try {
      evalRuleRes = !!this.evalRuleConfig(
        matched.closestRule.config, matched.pathVars, data, newData, auth, timestamp);
      if (!evalRuleRes) {
        logger.debug(`[${LOG_HEADER}] evalRuleRes ${evalRuleRes}, ` +
          `matched: ${JSON.stringify(matched, null, 2)}, data: ${JSON.stringify(data)}, ` +
          `newData: ${JSON.stringify(newData)}, auth: ${JSON.stringify(auth)}, ` +
          `timestamp: ${timestamp}\n`);
      }
    } catch (err) {
      logger.debug(`[${LOG_HEADER}] Failed to eval rule.\n` +
          `matched: ${JSON.stringify(matched, null, 2)}, data: ${JSON.stringify(data)}, ` +
          `newData: ${JSON.stringify(newData)}, auth: ${JSON.stringify(auth)}, ` +
          `timestamp: ${timestamp}\nError: ${err} ${err.stack}`);
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
    const path = isGlobal ? this.toGlobalPath(pathAndConfig.path) : pathAndConfig.path;
    return {
      path: CommonUtil.formatPath(path),
      config: pathAndConfig.config,
    }
  }

  convertFunctionMatch(matched, isGlobal) {
    const functionPath = isGlobal ?
        this.toGlobalPath(matched.matchedFunctionPath) : matched.matchedFunctionPath;
    const valuePath = isGlobal ?
        this.toGlobalPath(matched.matchedValuePath) : matched.matchedValuePath;
    const subtreeFunctions =
        matched.subtreeFunctions.map((entry) => this.convertPathAndConfig(entry, false));
    return {
      matched_path: {
        target_path: CommonUtil.formatPath(functionPath),
        ref_path: CommonUtil.formatPath(valuePath),
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
    const rulePath = isGlobal ?
        this.toGlobalPath(matched.matchedRulePath) : matched.matchedRulePath;
    const valuePath = isGlobal ?
        this.toGlobalPath(matched.matchedValuePath) : matched.matchedValuePath;
    const subtreeRules = matched.subtreeRules.map((entry) =>
      this.convertPathAndConfig(entry, false));
    return {
      matched_path: {
        target_path: CommonUtil.formatPath(rulePath),
        ref_path: CommonUtil.formatPath(valuePath),
        path_vars: matched.pathVars,
      },
      matched_config: this.convertPathAndConfig(matched.closestRule, isGlobal),
      subtree_configs: subtreeRules,
    };
  }

  // TODO(minsulee2): Need to be investigated. Using new Function() is not recommended.
  makeEvalFunction(ruleString, pathVars) {
    return new Function('auth', 'data', 'newData', 'currentTime', 'getValue', 'getRule',
        'getFunction', 'getOwner', 'evalRule', 'evalOwner', 'util', 'lastBlockNumber',
        ...Object.keys(pathVars), '"use strict"; return ' + ruleString);
  }

  // TODO(platfowner): Extend function for auth.fid.
  evalRuleConfig(ruleConfig, pathVars, data, newData, auth, timestamp) {
    if (!CommonUtil.isDict(ruleConfig)) {
      return false;
    }
    const ruleString = ruleConfig[RuleProperties.WRITE];
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

  lastBlockTimestamp() {
    return this.bc ? this.bc.lastBlockTimestamp() : Date.now();
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
    const ownerPath = isGlobal ?
        this.toGlobalPath(matched.matchedOwnerPath) : matched.matchedOwnerPath;
    return {
      matched_path: {
        target_path: CommonUtil.formatPath(ownerPath),
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
      // Step 1.1: Try to use the auth fid first.
      if (auth.fid) {
        permissions = owners[OwnerProperties.FID_PREFIX + auth.fid];
      // Step 1.2: Try to use the auth address then.
      } else if (auth.addr) {
        permissions = owners[auth.addr];
      } else {
        return null;
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
