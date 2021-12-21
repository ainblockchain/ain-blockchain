const logger = new (require('../logger'))('DATABASE');

const _ = require('lodash');
const {
  DevFlags,
  NodeConfigs,
  ReadDbOperations,
  WriteDbOperations,
  PredefinedDbPaths,
  OwnerProperties,
  RuleProperties,
  StateInfoProperties,
  BlockchainSnapshotProperties,
  ShardingProperties,
  StateVersions,
  buildOwnerPermissions,
  BlockchainParams,
} = require('../common/constants');
const { TxResultCode } = require('../common/result-code');
const CommonUtil = require('../common/common-util');
const Transaction = require('../tx-pool/transaction');
const StateNode = require('./state-node');
const {
  hasFunctionConfig,
  getFunctionConfig,
  hasRuleConfigWithProp,
  getRuleConfig,
  hasOwnerConfig,
  getOwnerConfig,
  isWritablePathWithSharding,
  isValidPathForStates,
  isValidJsObjectForStates,
  makeWriteRuleCodeSnippet,
  isValidRuleTree,
  isValidFunctionTree,
  isValidOwnerTree,
  applyRuleChange,
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

class DB {
  constructor(stateRoot, stateVersion, bc, blockNumberSnapshot, stateManager) {
    this.shardingPath = null;
    this.isRootBlockchain = null;  // Is this the database of the root blockchain?
    this.stateRoot = stateRoot;
    this.stateVersion = stateVersion;
    this.backupStateRoot = null;
    this.backupStateVersion = null;
    this.setShardingPath(BlockchainParams.sharding[ShardingProperties.SHARDING_PATH]);
    this.func = new Functions(this);
    this.bc = bc;
    this.blockNumberSnapshot = blockNumberSnapshot;
    this.stateManager = stateManager;
    this.restFunctionsUrlWhitelistCache = { hash: null, whitelist: [] };
    this.updateRestFunctionsUrlWhitelistCache();
  }

  static formatRawRestFunctionsWhitelist(raw) {
    if (CommonUtil.isEmpty(raw) || !CommonUtil.isDict(raw)) return [];
    const whitelist = new Set();
    for (const val of Object.values(raw)) {
      for (const url of Object.values(val)) {
        whitelist.add(url);
      }
    }
    return [...whitelist];
  }

  /**
   * Compares the state proof hash of the current restFunctionsUrlWhitelistCache and the state proof
   * hash at the path /developers/rest_functions/url_whitelist, and if outdated, update the cache of
   * the latest hash and the mapping of whitelisted REST function urls.
   */
  updateRestFunctionsUrlWhitelistCache() {
    const currentHash = this.restFunctionsUrlWhitelistCache.hash;
    const restFunctionsUrlWhitelistPath = PathUtil.getDevelopersRestFunctionsUrlWhitelistPath();
    const updatedHash = this.getProofHash(
        CommonUtil.appendPath(PredefinedDbPaths.VALUES_ROOT, restFunctionsUrlWhitelistPath));
    if (!currentHash || currentHash !== updatedHash) {
      const rawWhitelist = this.getValue(restFunctionsUrlWhitelistPath);
      const whitelist = DB.formatRawRestFunctionsWhitelist(rawWhitelist);
      this.restFunctionsUrlWhitelistCache = { hash: updatedHash, whitelist };
    }
  }

  getRestFunctionsUrlWhitelist() {
    this.updateRestFunctionsUrlWhitelistCache();
    return this.restFunctionsUrlWhitelistCache.whitelist;
  }

  initDb(snapshot = null) {
    if (snapshot) {
      this.resetDbWithSnapshot(snapshot);
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
   * Resets the database with the given snapshot.
   *
   * @param {StateNode} snapshot snapshot to reset with
   */
  resetDbWithSnapshot(snapshot) {
    const LOG_HEADER = 'resetDbWithSnapshot';
    const hashDelimiter = DB.getBlockchainParam('genesis/hash_delimiter');
    const newRoot =
        StateNode.fromRadixSnapshot(snapshot[BlockchainSnapshotProperties.RADIX_SNAPSHOT], hashDelimiter);
    updateStateInfoForStateTree(newRoot);
    const rootProofHash = snapshot[BlockchainSnapshotProperties.ROOT_PROOF_HASH];
    // Checks the state proof hash
    if (newRoot.getProofHash() !== rootProofHash) {
      CommonUtil.finishWithStackTrace(
          logger,
          `[${LOG_HEADER}] Root proof hash mismatch: ${newRoot.getProofHash()} / ${rootProofHash}`);
    }
    const newVersion = newRoot.getVersion();
    if (this.stateManager.hasVersion(newVersion)) {
      CommonUtil.finishWithStackTrace(
          logger, `[${LOG_HEADER}] State version already exists: ${newVersion}`);
    }
    this.stateManager.setRoot(newVersion, newRoot);
    if (!this.setStateVersion(newVersion, newRoot)) {
      CommonUtil.finishWithStackTrace(
          logger, `[${LOG_HEADER}] Failed to set version: ${newVersion}`);
    }
    if (!this.stateManager.finalizeVersion(newVersion)) {
      CommonUtil.finishWithStackTrace(
          logger, `[${LOG_HEADER}] Failed to finalize version: ${newVersion}`);
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
    if (this.stateVersion === stateVersion) {
      logger.error(`[${LOG_HEADER}] State version already set with version: ${stateVersion}`);
      return false;
    }
    if (this.backupStateVersion === stateVersion) {
      logger.error(
          `[${LOG_HEADER}] State version equals to backup state version: ${stateVersion}`);
      return false;
    }
    if (!this.stateManager.isFinalVersion(this.stateVersion)) {
      this.deleteStateVersion();
    }

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

  static create(baseVersion, newVersion, bc, finalizeVersion, blockNumberSnapshot, stateManager) {
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

  takeStateSnapshot() {
    if (this.stateRoot === null) {
      return null;
    }
    return this.stateRoot.toStateSnapshot();
  }
 
  takeRadixSnapshot() {
    if (this.stateRoot === null) {
      return null;
    }
    return this.stateRoot.toRadixSnapshot();
  }

  // For testing purpose only.
  setOwnersForTesting(ownersPath, owners) {
    this.writeDatabase(
        [PredefinedDbPaths.OWNERS_ROOT, ...CommonUtil.parsePath(ownersPath)], owners);
  }

  // For testing purpose only.
  setRulesForTesting(rulesPath, rules) {
    this.writeDatabase(
        [PredefinedDbPaths.RULES_ROOT, ...CommonUtil.parsePath(rulesPath)], rules);
  }

  // For testing purpose only.
  setFunctionsForTesting(functionsPath, functions) {
    this.writeDatabase(
        [PredefinedDbPaths.FUNCTIONS_ROOT, ...CommonUtil.parsePath(functionsPath)], functions);
  }

  // For testing purpose only.
  setValuesForTesting(valuesPath, values) {
    this.writeDatabase(
        [PredefinedDbPaths.VALUES_ROOT, ...CommonUtil.parsePath(valuesPath)], values);
  }

  // For testing purpose only.
  setShardingForTesting(sharding) {
    this.setValuesForTesting(
        CommonUtil.formatPath([PredefinedDbPaths.BLOCKCHAIN_PARAMS, PredefinedDbPaths.BLOCKCHAIN_PARAMS_SHARDING]),
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
    const hashDelimiter = DB.getBlockchainParam('genesis/hash_delimiter');
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
        const newChild = new StateNode(hashDelimiter, this.stateVersion);
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
    const stateInfoPrefix = DB.getBlockchainParam('genesis/state_info_prefix');
    const hashDelimiter = DB.getBlockchainParam('genesis/hash_delimiter');
    const tree = StateNode.fromStateSnapshot(stateObj, hashDelimiter, stateVersion, stateInfoPrefix);
    if (!NodeConfigs.LIGHTWEIGHT) {
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
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, shardingPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    const fullPath = DB.getFullPath(localPath, rootLabel);
    const stateNode = DB.getRefForReadingFromStateRoot(stateRoot, fullPath);
    if (stateNode === null) {
      return null;
    }
    return stateNode.toStateSnapshot(options);
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

  static getBlockchainParam(paramName, blockNumber = 0, stateRoot = null) {
    const LOG_HEADER = 'getBlockchainParam';
    const split = paramName.split('/');
    if (split.length !== 2) {
      logger.error(`[${LOG_HEADER}] Invalid paramName: ${paramName}`);
      return null;
    }
    const category = split[0];
    const name = split[1];
    // NOTE(liayoo): For certain parameters such as network params, we might need them before we
    // have the genesis block and the params in the state.
    if (blockNumber <= 0) {
      return BlockchainParams[category][name];
    }
    return DB.getValueFromStateRoot(stateRoot, PathUtil.getSingleBlockchainParamPath(category, name));
  }

  static getVariableLabelPrefix() {
    return DB.getBlockchainParam('genesis/variable_label_prefix');
  }

  isConsensusAppAdmin(address) {
    const admins = this.getValue(PathUtil.getManageAppConfigAdminPath('consensus'));
    if (admins === null) {
      return address === DB.getBlockchainParam('genesis/genesis_addr');
    }
    return admins[address] === true;
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
    const matched = this.matchRuleForParsedPath(localPath);
    return {
      write: this.convertRuleMatch(matched.write, isGlobal),
      state: this.convertRuleMatch(matched.state, isGlobal)
    };
  }

  matchOwner(rulePath, options) {
    const isGlobal = options && options.isGlobal;
    const parsedPath = CommonUtil.parsePath(rulePath);
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    return this.convertOwnerMatch(this.matchOwnerForParsedPath(localPath), isGlobal);
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

  // TODO(platfowner): Consider allowing the callers to specify target config.
  evalOwner(refPath, permission, auth, options) {
    const isGlobal = options && options.isGlobal;
    const parsedPath = CommonUtil.parsePath(refPath);
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // No matched local path.
      return null;
    }
    if (permission === OwnerProperties.WRITE_RULE) {
      return this.getPermissionForRule(localPath, auth, options && options.isMerge);
    } else if (permission === OwnerProperties.WRITE_FUNCTION) {
      return this.getPermissionForFunction(localPath, auth, options && options.isMerge);
    } else if (permission === OwnerProperties.WRITE_OWNER ||
        permission === OwnerProperties.BRANCH_OWNER) {
      return this.getPermissionForOwner(localPath, auth, options && options.isMerge);
    } else {
      return {
        code: TxResultCode.EVAL_OWNER_INVALID_PERMISSION,
        error_message: `Invalid permission '${permission}' ` +
            `for local path '${CommonUtil.formatPath(localPath)}' ` +
            `with auth '${JSON.stringify(auth)}'`,
        matched: null,
      };
    }
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
  setValue(valuePath, value, auth, timestamp, transaction, blockNumber, blockTime, options) {
    const LOG_HEADER = 'setValue';
    const isGlobal = options && options.isGlobal;
    const parsedPath = CommonUtil.parsePath(valuePath);
    const stateLabelLengthLimit = DB.getBlockchainParam(
        'resource/state_label_length_limit', blockNumber, this.stateRoot);
    const unitWriteGasLimit = DB.getBlockchainParam(
        'resource/unit_write_gas_amount', blockNumber, this.stateRoot);
    const isValidPath = isValidPathForStates(parsedPath, stateLabelLengthLimit);
    if (!isValidPath.isValid) {
      return CommonUtil.returnTxResult(
          TxResultCode.SET_VALUE_INVALID_VALUE_PATH,
          `Invalid value path: ${isValidPath.invalidPath}`,
          unitWriteGasLimit);
    }
    const isValidObj = isValidJsObjectForStates(value, stateLabelLengthLimit);
    if (!isValidObj.isValid) {
      return CommonUtil.returnTxResult(
          TxResultCode.SET_VALUE_INVALID_VALUE_STATES,
          `Invalid object for states: ${isValidObj.invalidPath}`,
          unitWriteGasLimit);
    }
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return CommonUtil.returnTxResult(
          TxResultCode.SUCCESS,
          null,
          unitWriteGasLimit);
    }
    const ruleEvalRes = this.getPermissionForValue(localPath, value, auth, timestamp);
    if (CommonUtil.isFailedTxResultCode(ruleEvalRes.code)) {
      return CommonUtil.returnTxResult(
          ruleEvalRes.code,
          ruleEvalRes.error_message,
          unitWriteGasLimit);
    }
    const fullPath = DB.getFullPath(localPath, PredefinedDbPaths.VALUES_ROOT);
    const isWritablePath = isWritablePathWithSharding(fullPath, this.stateRoot);
    if (!isWritablePath.isValid) {
      if (isGlobal) {
        // There is nothing to do.
        return CommonUtil.returnTxResult(
            TxResultCode.SUCCESS,
            null, unitWriteGasLimit);
      } else {
        return CommonUtil.returnTxResult(
            TxResultCode.SET_VALUE_NO_WRITABLE_PATH_WITH_SHARD_CONFIG,
            `Non-writable path with shard config: ${isWritablePath.invalidPath}`,
            unitWriteGasLimit);
      }
    }
    const prevValue = this.getValue(valuePath, { isShallow: false, isGlobal });
    const prevValueCopy =
        CommonUtil.isDict(prevValue) ? JSON.parse(JSON.stringify(prevValue)) : prevValue;
    const valueCopy = CommonUtil.isDict(value) ? JSON.parse(JSON.stringify(value)) : value;
    this.writeDatabase(fullPath, valueCopy);
    let funcResults = null;
    if (auth && (auth.addr || auth.fid)) {
      if (blockTime === null) {
        blockTime = this.lastBlockTimestamp();
      }
      const accountRegistrationGasAmount = DB.getBlockchainParam(
          'resource/account_registration_gas_amount', blockNumber, this.stateRoot);
      const restFunctionCallGasAmount = DB.getBlockchainParam(
          'resource/rest_function_call_gas_amount', blockNumber, this.stateRoot);
      const { func_results } = this.func.matchAndTriggerFunctions(
          localPath, valueCopy, prevValueCopy, auth, timestamp, transaction, blockNumber, blockTime,
          accountRegistrationGasAmount, restFunctionCallGasAmount);
      funcResults = func_results;
      if (CommonUtil.isFailedFuncTrigger(funcResults)) {
        return CommonUtil.returnTxResult(
            TxResultCode.SET_VALUE_TRIGGERED_FUNCTION_CALL_FAILED,
            `Triggered function call failed`,
            unitWriteGasLimit,
            funcResults);
      }
    }
    if (value !== null) {
      // NOTE(liayoo): Only apply the state garbage collection rules when it's not a deletion.
      const applyStateGcRuleRes =
          this.applyStateGarbageCollectionRule(ruleEvalRes.matched.state, localPath);
      logger.debug(
          `[${LOG_HEADER}] applyStateGcRuleRes: deleted ${applyStateGcRuleRes} child nodes`);
    }

    return CommonUtil.returnTxResult(
        TxResultCode.SUCCESS,
        null,
        unitWriteGasLimit,
        funcResults);
  }

  incValue(valuePath, delta, auth, timestamp, transaction, blockNumber, blockTime, options) {
    const isGlobal = options && options.isGlobal;
    const valueBefore = this.getValue(valuePath, { isShallow: false, isGlobal });
    logger.debug(`VALUE BEFORE:  ${JSON.stringify(valueBefore)}`);
    if ((valueBefore !== null && !CommonUtil.isNumber(valueBefore)) || !CommonUtil.isNumber(delta)) {
      const unitWriteGasLimit = DB.getBlockchainParam(
          'resource/unit_write_gas_amount', blockNumber, this.stateRoot);
      return CommonUtil.returnTxResult(
          TxResultCode.INC_VALUE_NOT_A_NUMBER_TYPE,
          `Not a number type: ${valueBefore} or ${delta}`,
          unitWriteGasLimit);
    }
    const valueAfter = CommonUtil.numberOrZero(valueBefore) + delta;
    return this.setValue(
        valuePath, valueAfter, auth, timestamp, transaction, blockNumber, blockTime, options);
  }

  decValue(valuePath, delta, auth, timestamp, transaction, blockNumber, blockTime, options) {
    const isGlobal = options && options.isGlobal;
    const valueBefore = this.getValue(valuePath, { isShallow: false, isGlobal });
    logger.debug(`VALUE BEFORE:  ${JSON.stringify(valueBefore)}`);
    if ((valueBefore !== null && !CommonUtil.isNumber(valueBefore)) || !CommonUtil.isNumber(delta)) {
      const unitWriteGasLimit = DB.getBlockchainParam(
          'resource/unit_write_gas_amount', blockNumber, this.stateRoot);
      return CommonUtil.returnTxResult(
          TxResultCode.DEC_VALUE_NOT_A_NUMBER_TYPE,
          `Not a number type: ${valueBefore} or ${delta}`,
          unitWriteGasLimit);
    }
    const valueAfter = CommonUtil.numberOrZero(valueBefore) - delta;
    return this.setValue(
        valuePath, valueAfter, auth, timestamp, transaction, blockNumber, blockTime, options);
  }

  setFunction(functionPath, func, auth, blockNumber, options) {
    const isGlobal = options && options.isGlobal;
    const stateLabelLengthLimit = DB.getBlockchainParam(
        'resource/state_label_length_limit', blockNumber, this.stateRoot);
    const unitWriteGasLimit = DB.getBlockchainParam(
        'resource/unit_write_gas_amount', blockNumber, this.stateRoot);
    const variableLabelPrefix = DB.getVariableLabelPrefix();
    const isValidObj = isValidJsObjectForStates(func, stateLabelLengthLimit);
    if (!isValidObj.isValid) {
      return CommonUtil.returnTxResult(
          TxResultCode.SET_FUNCTION_INVALID_FUNCTION_STATES,
          `Invalid object for states: ${isValidObj.invalidPath}`,
          unitWriteGasLimit);
    }
    const parsedPath = CommonUtil.parsePath(functionPath);
    const isValidPath = isValidPathForStates(parsedPath, stateLabelLengthLimit);
    if (!isValidPath.isValid) {
      return CommonUtil.returnTxResult(
          TxResultCode.SET_FUNCTION_INVALID_FUNCTION_PATH,
          `Invalid function path: ${isValidPath.invalidPath}`,
          unitWriteGasLimit);
    }
    const isValidFunction = isValidFunctionTree(parsedPath, func, variableLabelPrefix);
    if (!isValidFunction.isValid) {
      return CommonUtil.returnTxResult(
          TxResultCode.SET_FUNCTION_INVALID_FUNCTION_TREE,
          `Invalid function tree: ${isValidFunction.invalidPath}`,
          unitWriteGasLimit);
    }
    if (!auth || !this.isConsensusAppAdmin(auth.addr)) {
      const ownerOnlyFid = this.func.hasOwnerOnlyFunction(func);
      if (ownerOnlyFid !== null) {
        return CommonUtil.returnTxResult(
            TxResultCode.SET_FUNCTION_OWNER_ONLY_FUNCTION,
            `Trying to write owner-only function: ${ownerOnlyFid}`,
            unitWriteGasLimit);
      }
    }
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return CommonUtil.returnTxResult(
          TxResultCode.SUCCESS,
          null,
          unitWriteGasLimit);
    }
    const curFunction = this.getFunction(functionPath, { isShallow: false, isGlobal });
    const applyRes = applyFunctionChange(curFunction, func);
    const permCheckRes = this.getPermissionForFunction(localPath, auth, applyRes.isMerge);
    if (CommonUtil.isFailedTxResultCode(permCheckRes.code)) {
      return CommonUtil.returnTxResult(
          permCheckRes.code,
          permCheckRes.error_message,
          unitWriteGasLimit);
    }
    const fullPath = DB.getFullPath(localPath, PredefinedDbPaths.FUNCTIONS_ROOT);
    this.writeDatabase(fullPath, applyRes.funcConfig);
    return CommonUtil.returnTxResult(
        TxResultCode.SUCCESS,
        null,
        unitWriteGasLimit);
  }

  // TODO(platfowner): Add rule config sanitization logic (e.g. dup path variables,
  //                   multiple path variables).
  setRule(rulePath, rule, auth, blockNumber, options) {
    const isGlobal = options && options.isGlobal;
    const stateLabelLengthLimit = DB.getBlockchainParam(
        'resource/state_label_length_limit', blockNumber, this.stateRoot);
    const unitWriteGasLimit = DB.getBlockchainParam(
        'resource/unit_write_gas_amount', blockNumber, this.stateRoot);
    const variableLabelPrefix = DB.getVariableLabelPrefix();
    const isValidObj = isValidJsObjectForStates(rule, stateLabelLengthLimit);
    if (!isValidObj.isValid) {
      return CommonUtil.returnTxResult(
          TxResultCode.SET_RULE_INVALID_RULE_STATES,
          `Invalid object for states: ${isValidObj.invalidPath}`,
          unitWriteGasLimit);
    }
    const parsedPath = CommonUtil.parsePath(rulePath);
    const isValidPath = isValidPathForStates(parsedPath, stateLabelLengthLimit);
    if (!isValidPath.isValid) {
      return CommonUtil.returnTxResult(
          TxResultCode.SET_RULE_INVALID_RULE_PATH,
          `Invalid rule path: ${isValidPath.invalidPath}`,
          unitWriteGasLimit);
    }
    const isValidRule = isValidRuleTree(parsedPath, rule, variableLabelPrefix);
    if (!isValidRule.isValid) {
      return CommonUtil.returnTxResult(
          TxResultCode.SET_RULE_INVALID_RULE_TREE,
          `Invalid rule tree: ${isValidRule.invalidPath}`,
          unitWriteGasLimit);
    }
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return CommonUtil.returnTxResult(
          TxResultCode.SUCCESS,
          null,
          unitWriteGasLimit);
    }
    const curRule = this.getRule(rulePath, { isShallow: false, isGlobal });
    const applyRes = applyRuleChange(curRule, rule);
    const permCheckRes = this.getPermissionForRule(localPath, auth, applyRes.isMerge);
    if (CommonUtil.isFailedTxResultCode(permCheckRes.code)) {
      return CommonUtil.returnTxResult(
          permCheckRes.code,
          permCheckRes.error_message,
          unitWriteGasLimit);
    }
    const fullPath = DB.getFullPath(localPath, PredefinedDbPaths.RULES_ROOT);
    this.writeDatabase(fullPath, applyRes.ruleConfig);
    return CommonUtil.returnTxResult(
        TxResultCode.SUCCESS,
        null,
        unitWriteGasLimit);
  }

  setOwner(ownerPath, owner, auth, blockNumber, options) {
    const isGlobal = options && options.isGlobal;
    const stateLabelLengthLimit = DB.getBlockchainParam(
        'resource/state_label_length_limit', blockNumber, this.stateRoot);
    const unitWriteGasLimit = DB.getBlockchainParam(
        'resource/unit_write_gas_amount', blockNumber, this.stateRoot);
    const variableLabelPrefix = DB.getVariableLabelPrefix();
    const isValidObj = isValidJsObjectForStates(owner, stateLabelLengthLimit);
    if (!isValidObj.isValid) {
      return CommonUtil.returnTxResult(
          TxResultCode.SET_OWNER_INVALID_OWNER_STATES,
          `Invalid object for states: ${isValidObj.invalidPath}`,
          unitWriteGasLimit);
    }
    const parsedPath = CommonUtil.parsePath(ownerPath);
    const isValidPath = isValidPathForStates(parsedPath, stateLabelLengthLimit);
    if (!isValidPath.isValid) {
      return CommonUtil.returnTxResult(
          TxResultCode.SET_OWNER_INVALID_OWNER_PATH,
          `Invalid owner path: ${isValidPath.invalidPath}`,
          unitWriteGasLimit);
    }
    const isValidOwner = isValidOwnerTree(parsedPath, owner, variableLabelPrefix);
    if (!isValidOwner.isValid) {
      return CommonUtil.returnTxResult(
          TxResultCode.SET_OWNER_INVALID_OWNER_TREE,
          `Invalid owner tree: ${isValidOwner.invalidPath}`,
          unitWriteGasLimit);
    }
    const localPath = isGlobal ? DB.toLocalPath(parsedPath, this.shardingPath) : parsedPath;
    if (localPath === null) {
      // There is nothing to do.
      return CommonUtil.returnTxResult(
          TxResultCode.SUCCESS,
          null,
          unitWriteGasLimit);
    }
    const curOwner = this.getOwner(ownerPath, { isShallow: false, isGlobal });
    const applyRes = applyOwnerChange(curOwner, owner);
    const permCheckRes = this.getPermissionForOwner(localPath, auth, applyRes.isMerge);
    if (CommonUtil.isFailedTxResultCode(permCheckRes.code)) {
      return CommonUtil.returnTxResult(
          permCheckRes.code,
          permCheckRes.error_message,
          unitWriteGasLimit);
    }
    const fullPath = DB.getFullPath(localPath, PredefinedDbPaths.OWNERS_ROOT);
    this.writeDatabase(fullPath, applyRes.ownerConfig);
    return CommonUtil.returnTxResult(
        TxResultCode.SUCCESS,
        null,
        unitWriteGasLimit);
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

  executeSingleSetOperation(op, auth, timestamp, tx, blockNumber, blockTime) {
    let result;
    switch (op.type) {
      case undefined:
      case WriteDbOperations.SET_VALUE:
        result = this.setValue(
            op.ref, op.value, auth, timestamp, tx, blockNumber, blockTime,
            CommonUtil.toSetOptions(op));
        break;
      case WriteDbOperations.INC_VALUE:
        result = this.incValue(
            op.ref, op.value, auth, timestamp, tx, blockNumber, blockTime,
            CommonUtil.toSetOptions(op));
        break;
      case WriteDbOperations.DEC_VALUE:
        result = this.decValue(
            op.ref, op.value, auth, timestamp, tx, blockNumber, blockTime,
            CommonUtil.toSetOptions(op));
        break;
      case WriteDbOperations.SET_FUNCTION:
        result = this.setFunction(op.ref, op.value, auth, blockNumber, CommonUtil.toSetOptions(op));
        break;
      case WriteDbOperations.SET_RULE:
        result = this.setRule(op.ref, op.value, auth, blockNumber, CommonUtil.toSetOptions(op));
        break;
      case WriteDbOperations.SET_OWNER:
        result = this.setOwner(op.ref, op.value, auth, blockNumber, CommonUtil.toSetOptions(op));
        break;
      default:
        const unitWriteGasLimit = DB.getBlockchainParam(
            'resource/unit_write_gas_amount', blockNumber, this.stateRoot);
        return CommonUtil.returnTxResult(
            TxResultCode.TX_INVALID_OPERATION_TYPE,
            `Invalid operation type: ${op.type}`,
            unitWriteGasLimit);
    }
    return result;
  }

  executeMultiSetOperation(opList, auth, timestamp, tx, blockNumber, blockTime) {
    const resultList = {};
    for (let i = 0; i < opList.length; i++) {
      const op = opList[i];
      const result =
          this.executeSingleSetOperation(op, auth, timestamp, tx, blockNumber, blockTime);
      resultList[i] = result;
      if (CommonUtil.isFailedTx(result)) {
        break;
      }
    }
    return { result_list: resultList };
  }

  static updateGasAmountTotal(tx, gasAmountTotal, executionResult) {
    gasAmountTotal.bandwidth =
        CommonUtil.getTotalBandwidthGasAmount(tx.tx_body.operation, executionResult);
    executionResult.gas_amount_total = gasAmountTotal;
    tx.setExtraField('gas', gasAmountTotal);
  }

  executeOperation(op, auth, timestamp, tx, blockNumber, blockTime) {
    const gasAmountTotal = {
      bandwidth: { service: 0 },
      state: { service: 0 }
    };
    const result = {
      gas_amount_total: gasAmountTotal,
      gas_cost_total: 0
    };
    if (!op) {
      const unitWriteGasLimit = DB.getBlockchainParam(
          'resource/unit_write_gas_amount', blockNumber, this.stateRoot);
      Object.assign(result, CommonUtil.returnTxResult(
          TxResultCode.TX_INVALID_OPERATION,
          `Invalid operation: ${op}`,
          unitWriteGasLimit));
      DB.updateGasAmountTotal(tx, gasAmountTotal, result);
      return result;
    }
    const allStateUsageBefore = this.getAllStateUsages();
    const stateUsagePerAppBefore = this.getStateUsagePerApp(op);
    if (op.type === WriteDbOperations.SET) {
      Object.assign(
          result,
          this.executeMultiSetOperation(op.op_list, auth, timestamp, tx, blockNumber, blockTime));
    } else {
      Object.assign(
          result, this.executeSingleSetOperation(op, auth, timestamp, tx, blockNumber, blockTime));
    }
    const stateUsagePerAppAfter = this.getStateUsagePerApp(op);
    DB.updateGasAmountTotal(tx, gasAmountTotal, result);
    if (!CommonUtil.isFailedTx(result)) {
      const budgets = DB.getStateBudgets(blockNumber, this.stateRoot);
      const heightCheck = this.checkTreeHeightAndSize(budgets, blockNumber);
      if (CommonUtil.isFailedTx(heightCheck)) {
        return Object.assign(result, heightCheck);
      }
      // NOTE(platfowner): There is no chance to have invalid gas price as its validity check is
      //                   done in isValidTxBody() when transactions are created.
      const allStateUsageAfter = this.getAllStateUsages();
      DB.updateStateGasAmount(
          tx, result, allStateUsageBefore, allStateUsageAfter, stateUsagePerAppBefore,
          stateUsagePerAppAfter, blockNumber, this.stateRoot);
      const stateGasBudgetCheck = this.checkStateGasBudgets(
          op, allStateUsageAfter.apps, allStateUsageAfter.service, result, budgets);
      if (stateGasBudgetCheck !== true) {
        return stateGasBudgetCheck;
      }
      if (tx && auth && auth.addr && !auth.fid) {
        this.updateAccountNonceAndTimestamp(auth.addr, tx.tx_body.nonce, tx.tx_body.timestamp);
      }
    }
    return result;
  }

  static updateStateGasAmount(
      tx, result, allStateUsageBefore, allStateUsageAfter, stateUsagePerAppBefore,
      stateUsagePerAppAfter, blockNumber, stateRoot) {
    const LOG_HEADER = 'updateStateGasAmounts';
    const stateGasCoefficient = DB.getBlockchainParam(
        'resource/state_gas_coefficient', blockNumber, stateRoot);
    const serviceTreeBytesDelta =
        _.get(allStateUsageAfter, `service.${StateInfoProperties.TREE_BYTES}`, 0) -
        _.get(allStateUsageBefore, `service.${StateInfoProperties.TREE_BYTES}`, 0);
    const appStateGasAmount = Object.keys(stateUsagePerAppAfter).reduce((acc, appName) => {
      const delta = stateUsagePerAppAfter[appName][StateInfoProperties.TREE_BYTES] -
          stateUsagePerAppBefore[appName][StateInfoProperties.TREE_BYTES];
      if (delta > 0) {
        acc[appName] = delta * stateGasCoefficient;
      }
      return acc;
    }, {});
    const stateGasAmount = {
      service: Math.max(serviceTreeBytesDelta, 0) * stateGasCoefficient
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

  static getStateBudgets(blockNumber, stateRoot) {
    const stateTreeBytesLimit = DB.getBlockchainParam(
        'resource/state_tree_bytes_limit', blockNumber, stateRoot);
    const serviceStateBudgetRatio = DB.getBlockchainParam(
        'resource/service_state_budget_ratio', blockNumber, stateRoot);
    const appsStateBudgetRatio = DB.getBlockchainParam(
        'resource/apps_state_budget_ratio', blockNumber, stateRoot);
    const freeStateBudgetRatio = DB.getBlockchainParam(
        'resource/free_state_budget_ratio', blockNumber, stateRoot);
    const maxStateTreeSizePerByte = DB.getBlockchainParam(
        'resource/max_state_tree_size_per_byte', blockNumber, stateRoot);
    const serviceStateBudget = stateTreeBytesLimit * serviceStateBudgetRatio;
    const appsStateBudget = stateTreeBytesLimit * appsStateBudgetRatio;
    const freeStateBudget = stateTreeBytesLimit * freeStateBudgetRatio;
    const treeSizeBudget = stateTreeBytesLimit * maxStateTreeSizePerByte;
    const serviceTreeSizeBudget = serviceStateBudget * maxStateTreeSizePerByte;
    const appsTreeSizeBudget = appsStateBudget * maxStateTreeSizePerByte;
    const freeTreeSizeBudget = freeStateBudget * maxStateTreeSizePerByte;
    return {
      serviceStateBudget,
      appsStateBudget,
      freeStateBudget,
      treeSizeBudget,
      serviceTreeSizeBudget,
      appsTreeSizeBudget,
      freeTreeSizeBudget,
    };
  }

  checkStateGasBudgets(op, allAppsStateUsage, serviceStateUsage, result, budgets) {
    if (serviceStateUsage[StateInfoProperties.TREE_BYTES] > budgets.serviceStateBudget) {
      return Object.assign(result, {
          code: TxResultCode.GAS_EXCEED_STATE_BUDGET_LIMIT_FOR_ALL_SERVICES,
          error_message: `Exceeded state budget limit for services ` +
              `(${serviceStateUsage[StateInfoProperties.TREE_BYTES]} > ${budgets.serviceStateBudget})`
      });
    }
    if (allAppsStateUsage[StateInfoProperties.TREE_BYTES] > budgets.appsStateBudget) {
      return Object.assign(result, {
          code: TxResultCode.GAS_EXCEED_STATE_BUDGET_LIMIT_FOR_ALL_APPS,
          error_message: `Exceeded state budget limit for apps ` +
              `(${allAppsStateUsage[StateInfoProperties.TREE_BYTES]} > ${budgets.appsStateBudget})`
      });
    }
    if (serviceStateUsage[StateInfoProperties.TREE_SIZE] > budgets.serviceTreeSizeBudget) {
      return Object.assign(result, {
          code: TxResultCode.GAS_EXCEED_STATE_TREE_SIZE_LIMIT_FOR_ALL_SERVICES,
          error_message: `Exceeded state tree size limit for services ` +
              `(${serviceStateUsage[StateInfoProperties.TREE_SIZE]} > ${budgets.serviceTreeSizeBudget})`
      });
    }
    if (allAppsStateUsage[StateInfoProperties.TREE_SIZE] > budgets.appsTreeSizeBudget) {
      return Object.assign(result, {
          code: TxResultCode.GAS_EXCEED_STATE_TREE_SIZE_LIMIT_FOR_ALL_APPS,
          error_message: `Exceeded state tree size limit for apps ` +
              `(${allAppsStateUsage[StateInfoProperties.TREE_SIZE]} > ${budgets.appsTreeSizeBudget})`
      });
    }
    const stateFreeTierUsage = this.getStateFreeTierUsage();
    const freeTierTreeBytesLimitReached = stateFreeTierUsage[StateInfoProperties.TREE_BYTES] >= budgets.freeStateBudget;
    const freeTierTreeSizeLimitReached = stateFreeTierUsage[StateInfoProperties.TREE_SIZE] >= budgets.freeTreeSizeBudget;
    const appStakesTotal = this.getAppStakesTotal();
    for (const appName of CommonUtil.getAppNameList(op, this.shardingPath)) {
      const appStateUsage = this.getStateUsageAtPath(`${PredefinedDbPaths.APPS}/${appName}`);
      const appStake = this.getAppStake(appName);
      if (appStake === 0) {
        if (freeTierTreeBytesLimitReached) {
          return Object.assign(result, {
              code: TxResultCode.GAS_EXCEED_STATE_BUDGET_LIMIT_FOR_FREE_TIER,
              error_message: `Exceeded state budget limit for free tier ` +
                  `(${stateFreeTierUsage[StateInfoProperties.TREE_BYTES]} > ${budgets.freeStateBudget})`
          });
        }
        if (freeTierTreeSizeLimitReached) {
          return Object.assign(result, {
            code: TxResultCode.GAS_EXCEED_STATE_TREE_SIZE_LIMIT_FOR_FREE_TIER,
            error_message: `Exceeded state tree size limit for free tier ` +
                `(${stateFreeTierUsage[StateInfoProperties.TREE_SIZE]} > ${budgets.freeTreeSizeBudget})`
          });
        }
        // else, we allow apps without stakes
      } else {
        const singleAppStateBudget = budgets.appsStateBudget * appStake / appStakesTotal;
        const singleAppTreeSizeBudget = budgets.appsStateBudget * appStake / appStakesTotal;
        if (appStateUsage[StateInfoProperties.TREE_BYTES] > singleAppStateBudget) {
          return Object.assign(result, {
              code: TxResultCode.GAS_EXCEED_STATE_BUDGET_LIMIT_FOR_APP,
              error_message: `Exceeded state budget limit for app ${appName} ` +
                  `(${appStateUsage[StateInfoProperties.TREE_BYTES]} > ${singleAppStateBudget})`
          });
        }
        if (appStateUsage[StateInfoProperties.TREE_SIZE] > singleAppTreeSizeBudget) {
          return Object.assign(result, {
              code: TxResultCode.GAS_EXCEED_STATE_TREE_SIZE_LIMIT_FOR_APP,
              error_message: `Exceeded state tree size limit for app ${appName} ` +
                  `(${appStateUsage[StateInfoProperties.TREE_SIZE]} > ${singleAppTreeSizeBudget})`
          });
        }
      }
    }
    return true;
  }

  collectFee(auth, timestamp, tx, blockNumber, executionResult) {
    const gasPriceUnit = DB.getBlockchainParam('resource/gas_price_unit', blockNumber, this.stateRoot);
    const gasPrice = tx.tx_body.gas_price;
    // Use only the service gas amount total
    const serviceBandwidthGasAmount = _.get(tx, 'extra.gas.bandwidth.service', 0);
    const serviceStateGasAmount = _.get(tx, 'extra.gas.state.service', 0);
    let gasAmountChargedByTransfer = serviceBandwidthGasAmount +
        (CommonUtil.isFailedTx(executionResult) ? 0 : serviceStateGasAmount);
    if (gasAmountChargedByTransfer <= 0 || gasPrice === 0) { // No fees to collect
      executionResult.gas_amount_charged = gasAmountChargedByTransfer;
      executionResult.gas_cost_total =
          CommonUtil.getTotalGasCost(gasPrice, gasAmountChargedByTransfer, gasPriceUnit);
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
    const gasCost = CommonUtil.getTotalGasCost(gasPrice, gasAmountChargedByTransfer, gasPriceUnit);
    if (balance < gasCost) {
      Object.assign(executionResult, {
        code: TxResultCode.FEE_BALANCE_TOO_LOW,
        error_message: `Failed to collect gas fee: balance too low (${balance} / ${gasCost})`
      });
      this.restoreDb(); // Revert changes made by the tx operations
      balance = this.getBalance(billedTo);
      gasAmountChargedByTransfer = Math.min(balance, serviceBandwidthGasAmount);
    }
    executionResult.gas_amount_charged = gasAmountChargedByTransfer;
    executionResult.gas_cost_total =
        CommonUtil.getTotalGasCost(gasPrice, executionResult.gas_amount_charged, gasPriceUnit);
    if (executionResult.gas_cost_total <= 0) return;
    const gasFeeCollectPath = PathUtil.getGasFeeCollectPath(blockNumber, billedTo, tx.hash);
    const gasFeeCollectRes = this.setValue(
        gasFeeCollectPath,
        { amount: executionResult.gas_cost_total },
        auth, timestamp, tx, blockNumber, null);
    if (CommonUtil.isFailedTx(gasFeeCollectRes)) { // Should not happend
      Object.assign(executionResult, {
        code: TxResultCode.FEE_FAILED_TO_COLLECT_GAS_FEE,
        error_message: `Failed to collect gas fee: ${JSON.stringify(gasFeeCollectRes, null, 2)}`
      });
    }
  }

  static trimExecutionResult(executionResult) {
    const trimmed = _.pick(executionResult, [
      PredefinedDbPaths.RECEIPTS_EXEC_RESULT_CODE,
      PredefinedDbPaths.RECEIPTS_EXEC_RESULT_GAS_AMOUNT_CHARGED,
      PredefinedDbPaths.RECEIPTS_EXEC_RESULT_GAS_COST_TOTAL,
    ]);
    if (executionResult[PredefinedDbPaths.RECEIPTS_EXEC_RESULT_RESULT_LIST]) {
      trimmed[PredefinedDbPaths.RECEIPTS_EXEC_RESULT_RESULT_LIST] = {};
      for (const [key, val] of Object.entries(
          executionResult[PredefinedDbPaths.RECEIPTS_EXEC_RESULT_RESULT_LIST])) {
        trimmed[PredefinedDbPaths.RECEIPTS_EXEC_RESULT_RESULT_LIST][key] = _.pick(val, [
          PredefinedDbPaths.RECEIPTS_EXEC_RESULT_CODE,
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
    const parsedPath = CommonUtil.parsePath(receiptPath);
    this.writeDatabase([PredefinedDbPaths.VALUES_ROOT, ...parsedPath], receipt);
  }

  removeOldReceipts() {
    const LOG_HEADER = 'removeOldReceipts';
    const receiptsPath = [PredefinedDbPaths.RECEIPTS, 'a']; // dummy value to garbage-collect at /receipts/$tx_hash.
    const matchedStateRule = this.matchRulePath(receiptsPath, RuleProperties.STATE);
    const closestRule = {
      path: matchedStateRule.matchedRulePath.slice(0, matchedStateRule.closestConfigDepth),
      config: getRuleConfig(matchedStateRule.closestConfigNode)
    };
    const applyStateGcRuleRes = this.applyStateGarbageCollectionRule({ closestRule }, receiptsPath);
    logger.debug(`[${LOG_HEADER}] applyStateGcRuleRes: deleted ${applyStateGcRuleRes} child nodes`);
  }

  isBillingUser(billingAppName, billingId, userAddr) {
    return this.getValue(
        PathUtil.getManageAppBillingUsersPath(billingAppName, billingId) + '/' + userAddr) === true;
  }

  precheckNonceAndTimestamp(nonce, timestamp, addr) {
    if (!CommonUtil.isNumber(nonce)) {
      return CommonUtil.returnTxResult(
          TxResultCode.TX_NON_NUMERIC_NONCE,
          `Non-numeric nonce value: ${nonce}`);
    }
    if (!CommonUtil.isNumber(timestamp)) {
      return CommonUtil.returnTxResult(
          TxResultCode.TX_NON_NUMERIC_TIMESTAMP,
          `Non-numeric timestamp value: ${timestamp}`);
    }
    const { nonce: accountNonce, timestamp: accountTimestamp } = this.getAccountNonceAndTimestamp(addr);
    if (nonce >= 0 && nonce !== accountNonce) {
      return CommonUtil.returnTxResult(
          TxResultCode.TX_INVALID_NONCE_FOR_ACCOUNT,
          `Invalid nonce: ${nonce} !== ${accountNonce}`);
    }
    if (nonce === -2 && timestamp <= accountTimestamp) {
      return CommonUtil.returnTxResult(
          TxResultCode.TX_INVALID_TIMESTAMP_FOR_ACCOUNT,
          `Invalid timestamp: ${timestamp} <= ${accountTimestamp}`);
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
      return CommonUtil.logAndReturnTxResult(
          logger,
          TxResultCode.BILLING_INVALID_PARAM,
          `[${LOG_HEADER}] Invalid billing param`);
    }
    if (!this.isBillingUser(billingParsed[0], billingParsed[1], addr)) {
      return CommonUtil.logAndReturnTxResult(
          logger,
          TxResultCode.BILLING_NO_ACCOUNT_PERMISSION,
          `[${LOG_HEADER}] User doesn't have permission to the billing account`);
    }
    const appNameList = CommonUtil.getServiceDependentAppNameList(op);
    if (appNameList.length > 1) {
      // More than 1 apps are involved. Cannot charge an app-related billing account.
      return CommonUtil.logAndReturnTxResult(
          logger,
          TxResultCode.BILLING_MULTI_APP_DEPENDENCY,
          `[${LOG_HEADER}] Multiple app-dependent service operations for a billing account`);
    }
    if (appNameList.length === 1) {
      if (appNameList[0] !== billingParsed[0]) {
        // Tx app name doesn't match the billing account.
        return CommonUtil.logAndReturnTxResult(
            logger,
            TxResultCode.BILLING_INVALID_BILLING_ACCOUNT,
            `[${LOG_HEADER}] Invalid billing account`);
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
      const minBalanceForServiceTx = DB.getBlockchainParam(
          'resource/min_balance_for_service_tx', blockNumber, this.stateRoot);
      if (balance < minBalanceForServiceTx) {
        return CommonUtil.logAndReturnTxResult(
            logger,
            TxResultCode.BILLING_BALANCE_TOO_LOW,
            `[${LOG_HEADER}] Balance too low (${balance} < ${minBalanceForServiceTx})`);
      }
    }
    const minStakingForAppTx = DB.getBlockchainParam(
        'resource/min_staking_for_app_tx', blockNumber, this.stateRoot);
    const appNameList = CommonUtil.getAppNameList(op, this.shardingPath);
    appNameList.forEach((appName) => {
      const appStake = this.getAppStake(appName);
      if (appStake < minStakingForAppTx) {
        return CommonUtil.logAndReturnTxResult(
            logger,
            TxResultCode.BILLING_APP_STAKE_TOO_LOW,
            `[${LOG_HEADER}] App stake too low (${appStake} < ${minStakingForAppTx})`);
      }
    });
    return true;
  }

  precheckTransaction(tx, skipFees, blockNumber) {
    const LOG_HEADER = 'precheckTransaction';
    // NOTE(platfowner): A transaction needs to be converted to an executable form
    //                   before being executed.
    if (!Transaction.isExecutable(tx)) {
      return CommonUtil.logAndReturnTxResult(
          logger,
          TxResultCode.TX_NOT_EXECUTABLE,
          `[${LOG_HEADER}] Not executable transaction: ${JSON.stringify(tx)}`, 0);
    }
    if (!tx.tx_body) {
      return CommonUtil.logAndReturnTxResult(
          logger,
          TxResultCode.TX_NO_TX_BODY,
          `[${LOG_HEADER}] Missing tx_body: ${JSON.stringify(tx)}`, 0);
    }
    const billing = tx.tx_body.billing;
    const op = tx.tx_body.operation;
    const addr = tx.address;
    const checkNonceTimestampResult = this.precheckNonceAndTimestamp(
        tx.tx_body.nonce, tx.tx_body.timestamp, addr);
    if (checkNonceTimestampResult !== true) {
      return checkNonceTimestampResult;
    }
    if (!skipFees) {
      const checkBillingResult = this.precheckTxBillingParams(op, addr, billing, blockNumber);
      if (checkBillingResult !== true) {
        return checkBillingResult;
      }
      const checkBalanceResult = this.precheckBalanceAndStakes(op, addr, billing, blockNumber);
      if (checkBalanceResult !== true) {
        return checkBalanceResult;
      }
    }
    return true;
  }

  executeTransaction(tx, skipFees = false, restoreIfFails = false, blockNumber = 0, blockTime = null) {
    const LOG_HEADER = 'executeTransaction';
    const precheckResult = this.precheckTransaction(tx, skipFees, blockNumber);
    if (precheckResult !== true) {
      logger.debug(`[${LOG_HEADER}] Pre-check failed`);
      return precheckResult;
    }
    if (restoreIfFails) {
      if (!this.backupDb()) {
        return CommonUtil.logAndReturnTxResult(
          logger,
          TxResultCode.DB_FAILED_TO_BACKUP_DB,
          `[${LOG_HEADER}] Failed to backup db for tx: ${tx.hash}`, 0);
      }
    }
    // Record when the tx was executed.
    const txBody = tx.tx_body;
    tx.setExtraField('executed_at', Date.now());
    // NOTE(platfowner): It's not allowed for users to send transactions with auth.fid.
    const auth = { addr: tx.address };
    const timestamp = txBody.timestamp;
    const executionResult =
        this.executeOperation(txBody.operation, auth, timestamp, tx, blockNumber, blockTime);
    if (CommonUtil.isFailedTx(executionResult)) {
      if (restoreIfFails) {
        this.restoreDb();
      } else {
        this.deleteBackupStateVersion();
        return executionResult;
      }
    }
    if (!skipFees) {
      this.collectFee(auth, timestamp, tx, blockNumber, executionResult);
      if (DevFlags.enableReceiptsRecording) {
        this.recordReceipt(auth, tx, blockNumber, executionResult);
      }
    }
    return executionResult;
  }

  executeTransactionList(
      txList, skipFees = false, restoreIfFails = false, blockNumber = 0, blockTime = null) {
    const LOG_HEADER = 'executeTransactionList';
    const resList = [];
    for (const tx of txList) {
      const executableTx = Transaction.toExecutable(tx);
      const res =
        this.executeTransaction(executableTx, skipFees, restoreIfFails, blockNumber, blockTime);
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

  checkTreeHeightAndSize(budgets, blockNumber) {
    const {
      [StateInfoProperties.TREE_HEIGHT]: treeHeight,
      [StateInfoProperties.TREE_SIZE]: treeSize,
    } = this.getStateInfo('/');
    const stateTreeHeightLimit = DB.getBlockchainParam(
        'resource/state_tree_height_limit', blockNumber, this.stateRoot);
    if (treeHeight > stateTreeHeightLimit) {
      return {
        code: TxResultCode.TREE_OUT_OF_TREE_HEIGHT_LIMIT,
        error_message: `Out of tree height limit (${treeHeight} > ${stateTreeHeightLimit})`
      };
    }
    if (treeSize > budgets.treeSizeBudget) {
      return {
        code: TxResultCode.TREE_OUT_OF_TREE_SIZE_LIMIT,
        error_message: `Out of tree size budget (${treeSize} > ${budgets.treeSizeBudget})`
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

  getPermissionForValue(parsedValuePath, newValue, auth, timestamp) {
    const LOG_HEADER = 'getPermissionForValue';
    // Evaluate write rules and return matched configs
    const matched = this.matchRuleForParsedPath(parsedValuePath);
    const matchedWriteRules = matched.write;
    const matchedStateRules = matched.state;
    const value = this.getValue(CommonUtil.formatPath(parsedValuePath));
    const data =
        this.addPathToValue(value, matchedWriteRules.matchedValuePath, matchedWriteRules.closestRule.path.length);
    const newData =
        this.addPathToValue(newValue, matchedWriteRules.matchedValuePath, matchedWriteRules.closestRule.path.length);
    // NOTE(platfowner): Value write operations with non-empty subtree write rules are not allowed.
    if (matchedWriteRules.subtreeRules && matchedWriteRules.subtreeRules.length > 0) {
      const subtreeRulePathList = this.getSubtreeConfigPathList(matchedWriteRules.subtreeRules);
      return {
        code: TxResultCode.EVAL_RULE_NON_EMPTY_SUBTREE_RULES,
        error_message: `Non-empty (${matchedWriteRules.subtreeRules.length}) ` +
            `subtree rules for value path '${CommonUtil.formatPath(parsedValuePath)}'': ` +
            `${JSON.stringify(subtreeRulePathList)}`,
        matched,
      };
    }
    try {
      const evalWriteRuleRes = this.evalWriteRuleConfig(
        matchedWriteRules.closestRule.config, matchedWriteRules.pathVars, data, newData, auth, timestamp);
      if (!evalWriteRuleRes.evalResult) {
        logger.debug(`[${LOG_HEADER}] evalWriteRuleRes ${JSON.stringify(evalWriteRuleRes, null, 2)}, ` +
            `matchedWriteRules: ${JSON.stringify(matchedWriteRules, null, 2)}, ` +
            `data: ${JSON.stringify(data)}, ` +
            `newData: ${JSON.stringify(newData)}, auth: ${JSON.stringify(auth)}, ` +
            `timestamp: ${timestamp}\n`);
        return {
          code: TxResultCode.EVAL_RULE_FALSE_WRITE_RULE_EVAL,
          error_message: `Write rule evaluated false: [${evalWriteRuleRes.ruleString}] ` +
              `at '${CommonUtil.formatPath(matchedWriteRules.closestRule.path)}' ` +
              `for value path '${CommonUtil.formatPath(parsedValuePath)}' ` +
              `with path vars '${JSON.stringify(matchedWriteRules.pathVars)}', ` +
              `data '${JSON.stringify(data)}', newData '${JSON.stringify(newData)}', ` +
              `auth '${JSON.stringify(auth)}', timestamp '${timestamp}'`,
          matched,
        };
      }
      const evalStateRuleRes = this.evalStateRuleConfig(matchedStateRules.closestRule.config, newValue);
      if (!evalStateRuleRes.evalResult) {
        logger.debug(`[${LOG_HEADER}] evalStateRuleRes ${evalStateRuleRes}, ` +
            `matchedStateRules: ${JSON.stringify(matchedStateRules, null, 2)}, ` +
            `parsedValuePath: ${parsedValuePath}, ` +
            `newValue: ${JSON.stringify(newValue)}\n`);
        return {
          code: TxResultCode.EVAL_RULE_FALSE_STATE_RULE_EVAL,
          error_message: `State rule evaluated false: [${evalStateRuleRes.ruleString}] ` +
              `at '${CommonUtil.formatPath(matchedStateRules.closestRule.path)}' ` +
              `for value path '${CommonUtil.formatPath(parsedValuePath)}' ` +
              `with newValue '${JSON.stringify(newValue)}'`,
          matched,
        };
      }
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Failed to eval rule.\n` +
          `matched: ${JSON.stringify(matched, null, 2)}, data: ${JSON.stringify(data)}, ` +
          `newData: ${JSON.stringify(newData)}, auth: ${JSON.stringify(auth)}, ` +
          `timestamp: ${timestamp}\nError: ${err} ${err.stack}`);
      return {
        code: TxResultCode.EVAL_RULE_INTERNAL_ERROR,
        error_message: `Internal error: ${JSON.stringify(err)}`,
        matched,
      };
    }
    return {
      code: TxResultCode.SUCCESS,
      matched,
    };
  }

  getPermissionForRule(parsedRulePath, auth, isMerge) {
    const matched = this.matchOwnerForParsedPath(parsedRulePath);
    if (!isMerge && matched.subtreeOwners && matched.subtreeOwners.length > 0) {
      const subtreeOwnerPathList = this.getSubtreeConfigPathList(matched.subtreeOwners);
      return {
        code: TxResultCode.EVAL_OWNER_NON_EMPTY_SUBTREE_OWNERS_FOR_RULE,
        error_message: `Non-empty (${matched.subtreeOwners.length}) ` +
            `subtree owners for rule path '${CommonUtil.formatPath(parsedRulePath)}': ` +
            `${JSON.stringify(subtreeOwnerPathList)}`,
        matched,
      };
    }
    const permission = OwnerProperties.WRITE_RULE;
    const checkRes = this.checkPermission(matched.closestOwner.config, auth, permission);
    if (!checkRes.checkResult) {
      return {
        code: TxResultCode.EVAL_OWNER_FALSE_PERMISSION_CHECK_FOR_RULE,
        error_message: `${OwnerProperties.WRITE_RULE} ` +
            `permission evaluated false: [${checkRes.permissionString}] ` +
            `at '${CommonUtil.formatPath(matched.closestOwner.path)}' ` +
            `for rule path '${CommonUtil.formatPath(parsedRulePath)}' ` +
            `with permission '${permission}', ` +
            `auth '${JSON.stringify(auth)}'`,
        matched,
      };
    }
    return {
      code: TxResultCode.SUCCESS,
      matched,
    };
  }

  getPermissionForFunction(parsedFuncPath, auth, isMerge) {
    const matched = this.matchOwnerForParsedPath(parsedFuncPath);
    if (!isMerge && matched.subtreeOwners && matched.subtreeOwners.length > 0) {
      const subtreeOwnerPathList = this.getSubtreeConfigPathList(matched.subtreeOwners);
      return {
        code: TxResultCode.EVAL_OWNER_NON_EMPTY_SUBTREE_OWNERS_FOR_FUNCTION,
        error_message: `Non-empty (${matched.subtreeOwners.length}) ` +
            `subtree owners for function path '${CommonUtil.formatPath(parsedFuncPath)}': ` +
            `${JSON.stringify(subtreeOwnerPathList)}`,
        matched,
      };
    }
    const permission = OwnerProperties.WRITE_FUNCTION;
    const checkRes = this.checkPermission(matched.closestOwner.config, auth, permission);
    if (!checkRes.checkResult) {
      return {
        code: TxResultCode.EVAL_OWNER_FALSE_PERMISSION_CHECK_FOR_FUNCTION,
        error_message: `${OwnerProperties.WRITE_FUNCTION} ` +
            `permission evaluated false: [${checkRes.permissionString}] ` +
            `at '${CommonUtil.formatPath(matched.closestOwner.path)}' ` +
            `for function path '${CommonUtil.formatPath(parsedFuncPath)}' ` +
            `with permission '${permission}', ` +
            `auth '${JSON.stringify(auth)}'`,
        matched,
      };
    }
    return {
      code: TxResultCode.SUCCESS,
      matched,
    };
  }

  getPermissionForOwner(parsedOwnerPath, auth, isMerge) {
    const matched = this.matchOwnerForParsedPath(parsedOwnerPath);
    if (!isMerge && matched.subtreeOwners && matched.subtreeOwners.length > 0) {
      const subtreeOwnerPathList = this.getSubtreeConfigPathList(matched.subtreeOwners);
      return {
        code: TxResultCode.EVAL_OWNER_NON_EMPTY_SUBTREE_OWNERS_FOR_OWNER,
        error_message: `Non-empty (${matched.subtreeOwners.length}) ` +
            `subtree owners for owner path '${CommonUtil.formatPath(parsedOwnerPath)}': ` +
            `${JSON.stringify(subtreeOwnerPathList)}`,
        matched,
      };
    }
    const permission = matched.closestOwner.path.length === parsedOwnerPath.length ?
        OwnerProperties.WRITE_OWNER : OwnerProperties.BRANCH_OWNER;
    const checkRes = this.checkPermission(matched.closestOwner.config, auth, permission);
    if (!checkRes.checkResult) {
      return {
        code: TxResultCode.EVAL_OWNER_FALSE_PERMISSION_CHECK_FOR_OWNER,
        error_message: `${permission} ` +
            `permission evaluated false: [${checkRes.permissionString}] ` +
            `at '${CommonUtil.formatPath(matched.closestOwner.path)}' ` +
            `for owner path '${CommonUtil.formatPath(parsedOwnerPath)}' ` +
            `with permission '${permission}', ` +
            `auth '${JSON.stringify(auth)}'`,
        matched,
      };
    }
    return {
      code: TxResultCode.SUCCESS,
      matched,
    };
  }

  static getVariableLabel(node) {
    const variableLabelPrefix = DB.getVariableLabelPrefix();
    if (!node.getIsLeaf()) {
      for (const label of node.getChildLabels()) {
        if (CommonUtil.isVariableLabel(label, variableLabelPrefix)) {
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
  matchRulePathRecursive(parsedValuePath, depth, curRuleNode, ruleProp) {
    // Maximum depth reached.
    if (depth === parsedValuePath.length) {
      return {
        matchedValuePath: [],
        matchedRulePath: [],
        pathVars: {},
        matchedRuleNode: curRuleNode,
        closestConfigNode: hasRuleConfigWithProp(curRuleNode, ruleProp) ? curRuleNode : null,
        closestConfigDepth: hasRuleConfigWithProp(curRuleNode, ruleProp) ? depth : 0,
      };
    }
    if (curRuleNode) {
      // 1) Try to match with non-variable child node.
      const nextRuleNode = curRuleNode.getChild(parsedValuePath[depth]);
      if (nextRuleNode !== null) {
        const matched = this.matchRulePathRecursive(parsedValuePath, depth + 1, nextRuleNode, ruleProp);
        matched.matchedValuePath.unshift(parsedValuePath[depth]);
        matched.matchedRulePath.unshift(parsedValuePath[depth]);
        if (!matched.closestConfigNode && hasRuleConfigWithProp(curRuleNode, ruleProp)) {
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
        const matched = this.matchRulePathRecursive(parsedValuePath, depth + 1, nextRuleNode, ruleProp);
        matched.matchedValuePath.unshift(parsedValuePath[depth]);
        matched.matchedRulePath.unshift(varLabel);
        if (matched.pathVars[varLabel] !== undefined) {
          // This should not happen!
          logger.error('Duplicated path variables that should NOT happen!')
        } else {
          matched.pathVars[varLabel] = parsedValuePath[depth];
        }
        if (!matched.closestConfigNode && hasRuleConfigWithProp(curRuleNode, ruleProp)) {
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
      matchedRuleNode: null,
      closestConfigNode: hasRuleConfigWithProp(curRuleNode, ruleProp) ? curRuleNode : null,
      closestConfigDepth: hasRuleConfigWithProp(curRuleNode, ruleProp) ? depth : 0,
    };
  }

  matchRulePath(parsedValuePath, ruleProp) {
    return this.matchRulePathRecursive(
        parsedValuePath, 0, this.stateRoot.getChild(PredefinedDbPaths.RULES_ROOT), ruleProp);
  }

  getSubtreeRulesRecursive(depth, curRuleNode, ruleProp) {
    const rules = [];
    if (depth !== 0 && hasRuleConfigWithProp(curRuleNode, ruleProp)) {
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
          const subtreeRules = this.getSubtreeRulesRecursive(depth + 1, nextRuleNode, ruleProp);
          subtreeRules.forEach((entry) => {
            entry.path.unshift(label);
            rules.push(entry);
          });
        }
      }
      // 2) Traverse variable child node if available.
      if (varLabel !== null) {
        const nextRuleNode = curRuleNode.getChild(varLabel);
        const subtreeRules = this.getSubtreeRulesRecursive(depth + 1, nextRuleNode, ruleProp);
        subtreeRules.forEach((entry) => {
          entry.path.unshift(varLabel);
          rules.push(entry);
        });
      }
    }
    return rules;
  }

  getSubtreeRules(ruleNode, ruleProp) {
    return this.getSubtreeRulesRecursive(0, ruleNode, ruleProp);
  }

  matchRuleForParsedPath(parsedValuePath) {
    const matchedWriteRule = this.matchRulePath(parsedValuePath, RuleProperties.WRITE);
    const matchedStateRule = this.matchRulePath(parsedValuePath, RuleProperties.STATE);
    // Only write rules matched for the subtree
    const subtreeRules = matchedWriteRule.matchedRuleNode ?
        this.getSubtreeRules(matchedWriteRule.matchedRuleNode, RuleProperties.WRITE) : [];
    return {
      write: {
        matchedValuePath: matchedWriteRule.matchedValuePath,
        matchedRulePath: matchedWriteRule.matchedRulePath,
        pathVars: matchedWriteRule.pathVars,
        closestRule: {
          path: matchedWriteRule.matchedRulePath.slice(0, matchedWriteRule.closestConfigDepth),
          config: getRuleConfig(matchedWriteRule.closestConfigNode)
        },
        subtreeRules
      },
      state: {
        matchedValuePath: matchedStateRule.matchedValuePath,
        matchedRulePath: matchedStateRule.matchedRulePath,
        pathVars: matchedStateRule.pathVars,
        closestRule: {
          path: matchedStateRule.matchedRulePath.slice(0, matchedStateRule.closestConfigDepth),
          config: getRuleConfig(matchedStateRule.closestConfigNode)
        }
      }
    };
  }

  convertRuleMatch(matched, isGlobal) {
    const rulePath = isGlobal ?
        this.toGlobalPath(matched.matchedRulePath) : matched.matchedRulePath;
    const valuePath = isGlobal ?
        this.toGlobalPath(matched.matchedValuePath) : matched.matchedValuePath;
    const converted = {
      matched_path: {
        target_path: CommonUtil.formatPath(rulePath),
        ref_path: CommonUtil.formatPath(valuePath),
        path_vars: matched.pathVars,
      },
      matched_config: this.convertPathAndConfig(matched.closestRule, isGlobal),
    }
    if (matched.subtreeRules) {
      converted.subtree_configs = matched.subtreeRules.map((entry) =>
          this.convertPathAndConfig(entry, false));
    }
    return converted;
  }

  // TODO(minsulee2): Need to be investigated. Using new Function() is not recommended.
  static makeWriteRuleEvalFunction(ruleCodeSnippet, pathVars) {
    return new Function('auth', 'data', 'newData', 'currentTime', 'getValue', 'getRule',
        'getFunction', 'getOwner', 'evalRule', 'evalOwner', 'util', 'lastBlockNumber',
        ...Object.keys(pathVars), ruleCodeSnippet);
  }

  evalWriteRuleConfig(writeRuleConfig, pathVars, data, newData, auth, timestamp) {
    if (!CommonUtil.isDict(writeRuleConfig)) {
      return {
        ruleString: '',
        evalResult: false,
      };
    }
    const ruleString = writeRuleConfig[RuleProperties.WRITE];
    if (CommonUtil.isBool(ruleString)) {
      return {
        ruleString: String(ruleString),
        evalResult: ruleString,
      };
    } else if (!CommonUtil.isString(ruleString)) {
      return {
        ruleString: String(ruleString),
        evalResult: false,
      };
    }
    const writeRuleCodeSnippet = makeWriteRuleCodeSnippet(ruleString);
    const writeRuleEvalFunc = DB.makeWriteRuleEvalFunction(writeRuleCodeSnippet, pathVars);
    const evalResult = !!writeRuleEvalFunc(auth, data, newData, timestamp, this.getValue.bind(this),
        this.getRule.bind(this), this.getFunction.bind(this), this.getOwner.bind(this),
        this.evalRule.bind(this), this.evalOwner.bind(this),
        new RuleUtil(), this.lastBlockNumber(), ...Object.values(pathVars));
    return {
      ruleString,
      evalResult,
    };
  }

  evalStateRuleConfig(stateRuleConfig, newValue) {
    if (!CommonUtil.isDict(stateRuleConfig) ||
        !CommonUtil.isDict(newValue)) {
      return {
        ruleString: '',
        evalResult: true,
      };
    }
    const stateRuleObj = stateRuleConfig[RuleProperties.STATE];
    if (CommonUtil.isEmpty(stateRuleObj) ||
        !stateRuleObj.hasOwnProperty(RuleProperties.MAX_CHILDREN)) {
      return {
        ruleString: JSON.stringify(stateRuleObj),
        evalResult: true,
      };
    }
    const maxChildren = stateRuleObj[RuleProperties.MAX_CHILDREN];
    const maxChildrenEvalResult = Object.keys(newValue).length <= maxChildren;
    return {
      ruleString: JSON.stringify(stateRuleObj),
      evalResult: maxChildrenEvalResult,
    };
  }

  applyStateGarbageCollectionRule(matchedRules, parsedValuePath) {
    const stateRuleConfig = matchedRules.closestRule.config;
    if (!CommonUtil.isDict(stateRuleConfig)) {
      return 0;
    }
    const stateRuleObj = stateRuleConfig[RuleProperties.STATE];
    if (CommonUtil.isEmpty(stateRuleObj) || !stateRuleObj[RuleProperties.GC_MAX_SIBLINGS]) {
      return 0;
    }
    const gcMaxSiblings = stateRuleObj[RuleProperties.GC_MAX_SIBLINGS];
    // Check the number of children of the parent
    const parentPathLen = matchedRules.closestRule.path.length - 1;
    if (parentPathLen < 0) {
      return 0;
    }
    const parentPath = [PredefinedDbPaths.VALUES_ROOT, ...parsedValuePath.slice(0, parentPathLen)];
    const stateNodeForReading = this.getRefForReading(parentPath);
    if (stateNodeForReading === null) {
      return 0;
    }
    if (stateNodeForReading.numChildren() <= gcMaxSiblings) {
      return 0;
    }
    let numDeleted = 0;
    const childLabelList = stateNodeForReading.getChildLabels();
    const numChildren = childLabelList.length;
    while (numChildren - numDeleted > gcMaxSiblings) {
      const childLabel = childLabelList[numDeleted++];
      this.writeDatabase([...parentPath, childLabel], null);
    }
    return numDeleted;
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
        matchedOwnerNode: curOwnerNode,
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
      matchedOwnerNode: null,
      matchedDepth: depth,
      closestConfigNode: hasOwnerConfig(curOwnerNode) ? curOwnerNode : null,
      closestConfigDepth: hasOwnerConfig(curOwnerNode) ? depth : 0,
    };
  }

  matchOwnerPath(parsedRefPath) {
    return this.matchOwnerPathRecursive(
        parsedRefPath, 0, this.stateRoot.getChild(PredefinedDbPaths.OWNERS_ROOT));
  }

  getSubtreeOwnersRecursive(depth, curOwnerNode) {
    const owners = [];
    if (depth !== 0 && hasOwnerConfig(curOwnerNode)) {
      owners.push({
        path: [],
        config: getOwnerConfig(curOwnerNode),
      })
    }
    if (curOwnerNode && !curOwnerNode.getIsLeaf()) {
      // Traverse child nodes.
      for (const label of curOwnerNode.getChildLabels()) {
        const nextOwnerNode = curOwnerNode.getChild(label);
        const subtreeOwners = this.getSubtreeOwnersRecursive(depth + 1, nextOwnerNode);
        subtreeOwners.forEach((entry) => {
          entry.path.unshift(label);
          owners.push(entry);
        });
      }
    }
    return owners;
  }

  getSubtreeOwners(ownerNode) {
    return this.getSubtreeOwnersRecursive(0, ownerNode);
  }

  matchOwnerForParsedPath(parsedRefPath) {
    const matched = this.matchOwnerPath(parsedRefPath);
    const subtreeOwners = matched.matchedOwnerNode ?
        this.getSubtreeOwners(matched.matchedOwnerNode) : [];
    return {
      matchedOwnerPath: parsedRefPath.slice(0, matched.matchedDepth),
      closestOwner: {
        path: parsedRefPath.slice(0, matched.closestConfigDepth),
        config: getOwnerConfig(matched.closestConfigNode),
      },
      subtreeOwners,
    }
  }

  convertOwnerMatch(matched, isGlobal) {
    const ownerPath = isGlobal ?
        this.toGlobalPath(matched.matchedOwnerPath) : matched.matchedOwnerPath;
    const converted = {
      matched_path: {
        target_path: CommonUtil.formatPath(ownerPath),
      },
      matched_config: this.convertPathAndConfig(matched.closestOwner, isGlobal),
    };
    if (matched.subtreeOwners) {
      converted.subtree_configs = matched.subtreeOwners.map((entry) =>
          this.convertPathAndConfig(entry, false));
    }
    return converted;
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
    const permissionObj = this.getOwnerPermissions(config, auth);
    const checkResult = !!(permissionObj && permissionObj[permission] === true);
    return {
      permissionString: JSON.stringify(permissionObj),
      checkResult,
    };
  }

  getSubtreeConfigPathList(subtreeConfigs) {
    return subtreeConfigs.map((config) => CommonUtil.formatPath(config.path));
  }
}

module.exports = DB;
