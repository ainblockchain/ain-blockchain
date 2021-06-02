/* eslint guard-for-in: "off" */
const logger = require('../logger')('STATE_UTIL');

const _ = require('lodash');
const validUrl = require('valid-url');
const ChainUtil = require('../common/chain-util');
const {
  FunctionProperties,
  FunctionTypes,
  RuleProperties,
  OwnerProperties,
  ShardingProperties,
} = require('../common/constants');
const Functions = require('./functions');

function isEmptyNode(node) {
  return node.getIsLeaf() && node.getValue() === null;
}

function hasConfig(node, label) {
  return node && node.hasChild(label);
}

function getConfig(node, label) {
  return hasConfig(node, label) ? node.getChild(label).toJsObject() : null;
}

function hasShardConfig(valueNode) {
  return hasConfig(valueNode, ShardingProperties.SHARD);
}

function getShardConfig(valueNode) {
  return getConfig(valueNode, ShardingProperties.SHARD);
}

function hasFunctionConfig(funcNode) {
  return hasConfig(funcNode, FunctionProperties.FUNCTION);
}

function getFunctionConfig(funcNode) {
  return getConfig(funcNode, FunctionProperties.FUNCTION);
}

function hasRuleConfig(ruleNode) {
  return hasConfig(ruleNode, RuleProperties.WRITE);
}

function getRuleConfig(ruleNode) {
  return getConfig(ruleNode, RuleProperties.WRITE);
}

function hasOwnerConfig(ownerNode) {
  return hasConfig(ownerNode, OwnerProperties.OWNER);
}

function getOwnerConfig(ownerNode) {
  return getConfig(ownerNode, OwnerProperties.OWNER);
}

function hasEnabledShardConfig(node) {
  let isEnabled = false;
  if (hasShardConfig(node)) {
    const shardConfig = getShardConfig(node);
    isEnabled = ChainUtil.boolOrFalse(shardConfig[ShardingProperties.SHARDING_ENABLED]);
  }
  return isEnabled;
}

function isWritablePathWithSharding(fullPath, root) {
  let isValid = true;
  const path = [];
  let curNode = root;
  for (const label of fullPath) {
    if (label !== ShardingProperties.SHARD && hasEnabledShardConfig(curNode)) {
      isValid = false;
      break;
    }
    if (curNode.hasChild(label)) {
      curNode = curNode.getChild(label);
      path.push(label);
    } else {
      break;
    }
  }
  if (hasEnabledShardConfig(curNode)) {
    isValid = false;
  }
  return {isValid, invalidPath: isValid ? '' : ChainUtil.formatPath(path)};
}

function hasReservedChar(label) {
  const reservedCharRegex = /[\/\.\$\*#\{\}\[\]<>'"` \x00-\x1F\x7F]/gm;
  return ChainUtil.isString(label) ? reservedCharRegex.test(label) : false;
}

function hasAllowedPattern(label) {
  const wildCardPatternRegex = /^\*$/gm;
  const configPatternRegex = /^[\.\$]{1}[^\/\.\$\*#\{\}\[\]<>'"` \x00-\x1F\x7F]+$/gm;
  return ChainUtil.isString(label) ?
      (wildCardPatternRegex.test(label) || configPatternRegex.test(label)) : false;
}

function isValidStateLabel(label) {
  if (!ChainUtil.isString(label) ||
      label === '' ||
      (hasReservedChar(label) && !hasAllowedPattern(label))) {
    return false;
  }
  return true;
}

function isValidPathForStates(fullPath) {
  let isValid = true;
  const path = [];
  for (const label of fullPath) {
    path.push(label);
    if (!isValidStateLabel(label)) {
      isValid = false;
      break;
    }
  }
  return { isValid, invalidPath: isValid ? '' : ChainUtil.formatPath(path) };
}

function isValidJsObjectForStatesRecursive(obj, path) {
  if (ChainUtil.isDict(obj)) {
    if (ChainUtil.isEmpty(obj)) {
      return { isValid: false, invalidPath: ChainUtil.formatPath(path) };
    }
    for (const key in obj) {
      path.push(key);
      if (!isValidStateLabel(key)) {
        return { isValid: false, invalidPath: ChainUtil.formatPath(path) };
      }
      const childObj = obj[key];
      const isValidChild = isValidJsObjectForStatesRecursive(childObj, path);
      if (!isValidChild.isValid) {
        return isValidChild;
      }
      path.pop();
    }
  } else {
    if (!ChainUtil.isBool(obj) && !ChainUtil.isNumber(obj) && !ChainUtil.isString(obj) &&
        obj !== null) {
      return { isValid: false, invalidPath: ChainUtil.formatPath(path) };
    }
  }

  return { isValid: true, invalidPath: '' };
}

function isValidJsObjectForStates(obj) {
  return isValidJsObjectForStatesRecursive(obj, []);
}

/**
 * Checks the validity of the given rule configuration.
 */
 function isValidRuleConfig(ruleConfig) {
  if (!ChainUtil.isBool(ruleConfig) && !ChainUtil.isString(ruleConfig)) {
    return { isValid: false, invalidPath: ChainUtil.formatPath([]) };
  }

  return { isValid: true, invalidPath: '' };
}

function sanitizeFunctionInfo(functionInfo) {
  if (!functionInfo) {
    return null;
  }

  const functionType = functionInfo[FunctionProperties.FUNCTION_TYPE];
  const sanitized = {};
  if (functionType === FunctionTypes.NATIVE) {
    sanitized[FunctionProperties.FUNCTION_TYPE] = functionType;
    sanitized[FunctionProperties.FUNCTION_ID] =
        ChainUtil.stringOrEmpty(functionInfo[FunctionProperties.FUNCTION_ID]);
  } else if (functionType === FunctionTypes.REST) {
    sanitized[FunctionProperties.FUNCTION_TYPE] = functionType;
    sanitized[FunctionProperties.FUNCTION_ID] =
        ChainUtil.stringOrEmpty(functionInfo[FunctionProperties.FUNCTION_ID]);
    sanitized[FunctionProperties.EVENT_LISTENER] =
        ChainUtil.stringOrEmpty(functionInfo[FunctionProperties.EVENT_LISTENER]);
    sanitized[FunctionProperties.SERVICE_NAME] =
        ChainUtil.stringOrEmpty(functionInfo[FunctionProperties.SERVICE_NAME]);
  }

  return sanitized;
}

function isValidFunctionInfo(functionInfo) {
  if (ChainUtil.isEmpty(functionInfo)) {
    return false;
  }
  const sanitized = sanitizeFunctionInfo(functionInfo);
  const isIdentical =
      _.isEqual(JSON.parse(JSON.stringify(sanitized)), functionInfo, { strict: true });
  if (!isIdentical) {
    return false;
  }
  const eventListener = functionInfo[FunctionProperties.EVENT_LISTENER];
  if (eventListener !== undefined &&
      !validUrl.isUri(functionInfo[FunctionProperties.EVENT_LISTENER])) {
    return false;
  }
  return true;
}

/**
 * Checks the validity of the given function configuration.
 */
function isValidFunctionConfig(functionConfig) {
  if (!ChainUtil.isDict(functionConfig)) {
    return { isValid: false, invalidPath: ChainUtil.formatPath([]) };
  }
  const fidList = Object.keys(functionConfig);
  if (ChainUtil.isEmpty(fidList)) {
    return { isValid: false, invalidPath: ChainUtil.formatPath([]) };
  }
  for (const fid of fidList) {
    const invalidPath = ChainUtil.formatPath([fid]);
    const functionInfo = functionConfig[fid];
    if (functionInfo === null) {
      // Function deletion.
      continue;
    }
    if (!isValidFunctionInfo(functionInfo)) {
      return { isValid: false, invalidPath };
    }
    if (functionInfo[FunctionProperties.FUNCTION_ID] !== fid) {
      return {
        isValid: false,
        invalidPath: ChainUtil.formatPath([fid, FunctionProperties.FUNCTION_ID])
      };
    }
  }

  return { isValid: true, invalidPath: '' };
}

function sanitizeOwnerPermissions(ownerPermissions) {
  if (!ownerPermissions) {
    return null;
  }
  return {
    [OwnerProperties.BRANCH_OWNER]:
        ChainUtil.boolOrFalse(ownerPermissions[OwnerProperties.BRANCH_OWNER]),
    [OwnerProperties.WRITE_FUNCTION]:
        ChainUtil.boolOrFalse(ownerPermissions[OwnerProperties.WRITE_FUNCTION]),
    [OwnerProperties.WRITE_OWNER]:
        ChainUtil.boolOrFalse(ownerPermissions[OwnerProperties.WRITE_OWNER]),
    [OwnerProperties.WRITE_RULE]:
        ChainUtil.boolOrFalse(ownerPermissions[OwnerProperties.WRITE_RULE]),
  };
}

function isValidOwnerPermissions(ownerPermissions) {
  if (ChainUtil.isEmpty(ownerPermissions)) {
    return false;
  }
  const sanitized = sanitizeOwnerPermissions(ownerPermissions);
  const isIdentical =
      _.isEqual(JSON.parse(JSON.stringify(sanitized)), ownerPermissions, { strict: true });
  return isIdentical;
}

/**
 * Checks the validity of the given owner configuration.
 */
function isValidOwnerConfig(ownerConfig) {
  if (!ChainUtil.isDict(ownerConfig)) {
    return { isValid: false, invalidPath: ChainUtil.formatPath([]) };
  }
  const path = [];
  const ownersProp = ownerConfig[OwnerProperties.OWNERS];
  if (ownersProp === undefined) {
    return { isValid: false, invalidPath: ChainUtil.formatPath(path) };
  }
  path.push(OwnerProperties.OWNERS);
  if (!ChainUtil.isDict(ownersProp)) {
    return { isValid: false, invalidPath: ChainUtil.formatPath(path) };
  }
  const ownerList = Object.keys(ownersProp);
  if (ChainUtil.isEmpty(ownerList)) {
    return { isValid: false, invalidPath: ChainUtil.formatPath(path) };
  }
  for (const owner of ownerList) {
    const invalidPath = ChainUtil.formatPath([...path, owner]);
    if (owner !== OwnerProperties.ANYONE && !ChainUtil.isCksumAddr(owner)) {
      if (!owner.startsWith(OwnerProperties.FID_PREFIX)) {
        return { isValid: false, invalidPath };
      }
      const fid = owner.substring(OwnerProperties.FID_PREFIX.length);
      if (!Functions.isNativeFunctionId(fid)) {
        return { isValid: false, invalidPath };
      }
    }
    const ownerPermissions = ChainUtil.getJsObject(ownerConfig, [...path, owner]);
    if (!isValidOwnerPermissions(ownerPermissions)) {
      return { isValid: false, invalidPath };
    }
  }

  return { isValid: true, invalidPath: '' };
}

function isValidConfigTreeRecursive(stateTree, path, configLabel, stateConfigValidator) {
  if (!ChainUtil.isDict(stateTree) || ChainUtil.isEmpty(stateTree)) {
    return { isValid: false, invalidPath: ChainUtil.formatPath(path) };
  }

  for (const label in stateTree) {
    path.push(label);
    const subtree = stateTree[label];
    if (label === configLabel) {
      const isValidConfig = stateConfigValidator(subtree);
      if (!isValidConfig.isValid) {
        return {
          isValid: false,
          invalidPath: ChainUtil.appendPath(ChainUtil.formatPath(path), isValidConfig.invalidPath)
        };
      }
    } else {
      const isValidSubtree =
          isValidConfigTreeRecursive(subtree, path, configLabel, stateConfigValidator);
      if (!isValidSubtree.isValid) {
        return isValidSubtree;
      }
    }
    path.pop();
  }

  return { isValid: true, invalidPath: '' };
}

/**
 * Checks the validity of the given rule tree.
 */
function isValidRuleTree(ruleTree) {
  if (ruleTree === null) {
    return { isValid: true, invalidPath: '' };
  }

  return isValidConfigTreeRecursive(ruleTree, [], RuleProperties.WRITE, isValidRuleConfig);
}

/**
 * Checks the validity of the given function tree.
 */
function isValidFunctionTree(functionTree) {
  if (functionTree === null) {
    return { isValid: true, invalidPath: '' };
  }

  return isValidConfigTreeRecursive(
      functionTree, [], FunctionProperties.FUNCTION, isValidFunctionConfig);
}

/**
 * Checks the validity of the given owner tree.
 */
function isValidOwnerTree(ownerTree) {
  if (ownerTree === null) {
    return { isValid: true, invalidPath: '' };
  }

  return isValidConfigTreeRecursive(ownerTree, [], OwnerProperties.OWNER, isValidOwnerConfig);
}

/**
 * Returns whether the given state tree object has the given config label as a property.
 */
function hasConfigObj(stateTreeObj, configLabel) {
  if (!ChainUtil.isDict(stateTreeObj)) {
    return false;
  }
  if (!ChainUtil.getJsObject(stateTreeObj, [configLabel])) {
    return false;
  }

  return true;
}

/**
 * Returns whether the given state tree object has the given config label as the only property.
 */
function hasOnlyConfigObj(stateTreeObj, configLabel) {
  if (!ChainUtil.isDict(stateTreeObj)) {
    return false;
  }
  if (!ChainUtil.getJsObject(stateTreeObj, [configLabel])) {
    return false;
  }
  if (Object.keys(stateTreeObj).length !== 1) {
    return false;
  }

  return true;
}

/**
 * Returns a new function tree created by applying the function change to
 * the current function tree.
 * @param {Object} curFuncTree current function tree (to be modified by this function)
 * @param {Object} functionChange function change
 */
function applyFunctionChange(curFuncTree, functionChange) {
  // NoTE(platfowner): Partial set is applied only when the current function tree has
  // .function property and the function change has .function property has the only property.
  if (!hasConfigObj(curFuncTree, FunctionProperties.FUNCTION) ||
      !hasOnlyConfigObj(functionChange, FunctionProperties.FUNCTION)) {
    return ChainUtil.isDict(functionChange) ?
        JSON.parse(JSON.stringify(functionChange)) : functionChange;
  }
  const funcChangeMap = ChainUtil.getJsObject(functionChange, [FunctionProperties.FUNCTION]);
  if (!funcChangeMap || Object.keys(funcChangeMap).length === 0) {
    return curFuncTree;
  }
  const newFuncConfig =
      ChainUtil.isDict(curFuncTree) ? JSON.parse(JSON.stringify(curFuncTree)) : {};
  let newFuncMap = ChainUtil.getJsObject(newFuncConfig, [FunctionProperties.FUNCTION]);
  if (!ChainUtil.isDict(newFuncMap)) {
    // Add a place holder.
    ChainUtil.setJsObject(newFuncConfig, [FunctionProperties.FUNCTION], {});
    newFuncMap = ChainUtil.getJsObject(newFuncConfig, [FunctionProperties.FUNCTION]);
  }
  for (const functionKey in funcChangeMap) {
    const functionInfo = funcChangeMap[functionKey];
    if (functionInfo === null) {
      delete newFuncMap[functionKey];
    } else {
      newFuncMap[functionKey] = functionInfo;
    }
  }

  return newFuncConfig;
}

/**
 * Returns a new owner tree created by applying the owner change to
 * the current owner tree.
 * @param {Object} curOwnerTree current owner tree (to be modified by this function)
 * @param {Object} ownerChange owner change
 */
function applyOwnerChange(curOwnerTree, ownerChange) {
  // NoTE(platfowner): Partial set is applied only when the current owner tree has
  // .owner property and the owner change has .owner property has the only property.
  if (!hasConfigObj(curOwnerTree, OwnerProperties.OWNER) ||
      !hasOnlyConfigObj(ownerChange, OwnerProperties.OWNER)) {
    return ChainUtil.isDict(ownerChange) ?
        JSON.parse(JSON.stringify(ownerChange)) : ownerChange;
  }
  const ownerMapPath = [OwnerProperties.OWNER, OwnerProperties.OWNERS];
  const ownerChangeMap = ChainUtil.getJsObject(ownerChange, ownerMapPath);
  if (!ownerChangeMap || Object.keys(ownerChangeMap).length === 0) {
    return curOwnerTree;
  }
  const newOwnerConfig =
      ChainUtil.isDict(curOwnerTree) ? JSON.parse(JSON.stringify(curOwnerTree)) : {};
  let newOwnerMap = ChainUtil.getJsObject(newOwnerConfig, ownerMapPath);
  if (!ChainUtil.isDict(newOwnerMap)) {
    // Add a place holder.
    ChainUtil.setJsObject(newOwnerConfig, ownerMapPath, {});
    newOwnerMap = ChainUtil.getJsObject(newOwnerConfig, ownerMapPath);
  }
  for (const ownerKey in ownerChangeMap) {
    const ownerPermissions = ownerChangeMap[ownerKey];
    if (ownerPermissions === null) {
      delete newOwnerMap[ownerKey];
    } else {
      newOwnerMap[ownerKey] = ownerPermissions;
    }
  }

  return newOwnerConfig;
}

/**
 * Returns affected nodes' number.
 */
function setStateTreeVersion(node, version) {
  let numAffectedNodes = 0;
  if (node === null) {
    return numAffectedNodes;
  }
  if (node.getVersion() !== version) {
    node.setVersion(version);
    numAffectedNodes++;
  }
  for (const child of node.getChildNodes()) {
    numAffectedNodes += setStateTreeVersion(child, version);
  }

  return numAffectedNodes;
}

/**
 * Renames the version of the given state tree. Each node's version of the state tree is set with
 * given to-version if its value is equal to the given from-version.
 * 
 * Returns affected nodes' number.
 */
function renameStateTreeVersion(node, fromVersion, toVersion, isRootNode = true) {
  let numAffectedNodes = 0;
  if (node === null) {
    return numAffectedNodes;
  }
  let versionRenamed = false;
  if (node.getVersion() === fromVersion) {
    node.setVersion(toVersion);
    versionRenamed = true;
    numAffectedNodes++;
  }
  if (isRootNode || versionRenamed) {
    for (const child of node.getChildNodes()) {
      numAffectedNodes += renameStateTreeVersion(child, fromVersion, toVersion, false);
    }
  }

  return numAffectedNodes;
}

/**
 * Returns affected nodes' number.
 */
function deleteStateTree(node) {
  let numAffectedNodes = 0;
  for (const label of node.getChildLabels()) {
    const child = node.getChild(label);
    node.deleteChild(label);
    numAffectedNodes += deleteStateTree(child);
  }
  node.resetValue();
  node.resetProofHash();
  numAffectedNodes++;

  return numAffectedNodes;
}

/**
 * Returns affected nodes' number.
 */
function deleteStateTreeVersion(node) {
  let numAffectedNodes = 0;
  if (node.numParents() > 0) {
    // Does nothing.
    return numAffectedNodes;
  }
  node.resetValue();
  node.resetProofHash();
  numAffectedNodes++;

  for (const label of node.getChildLabels()) {
    const child = node.getChild(label);
    node.deleteChild(label);
    numAffectedNodes += deleteStateTreeVersion(child);
  }

  return numAffectedNodes;
}

function makeCopyOfStateTree(node) {
  const copy = node.clone();
  for (const label of node.getChildLabels()) {
    const child = node.getChild(label);
    copy.setChild(label, makeCopyOfStateTree(child));
  }
  return copy;
}

function equalStateTrees(node1, node2) {
  if (!node1 && !node2) {
    return true;
  }
  if (!node1 || !node2) {
    return false;
  }
  if (!node1.equal(node2)) {
    return false;
  }
  // NOTE: The child label order matters.
  for (const label of node1.getChildLabels()) {
    const child1 = node1.getChild(label);
    const child2 = node2.getChild(label);
    if (!equalStateTrees(child1, child2)) {
      return false;
    }
  }

  return true;
}

function setProofHashForStateTree(stateTree) {
  let numAffectedNodes = 0;
  if (!stateTree.getIsLeaf()) {
    for (const node of stateTree.getChildNodes()) {
      numAffectedNodes += setProofHashForStateTree(node);
    }
  }
  stateTree.updateProofHashAndStateInfo();
  numAffectedNodes++;

  return numAffectedNodes;
}

function updateProofHashForAllRootPathsRecursive(node) {
  let numAffectedNodes = 0;
  node.updateProofHashAndStateInfo();
  numAffectedNodes++;
  for (const parent of node.getParentNodes()) {
    numAffectedNodes += updateProofHashForAllRootPathsRecursive(parent);
  }
  return numAffectedNodes;
}

function updateProofHashForAllRootPaths(fullPath, root) {
  const LOG_HEADER = 'updateProofHashForAllRootPaths';
  if (!root) {
    logger.error(`[${LOG_HEADER}] Trying to update proof hash for invalid root: ${root}.`);
    return 0;
  }
  let node = root;
  for (let i = 0; i < fullPath.length; i++) {
    const label = fullPath[i];
    const child = node.getChild(label);
    if (child === null) {
      logger.info(
          `[${LOG_HEADER}] Trying to update proof hash for non-existing path: ` +
          `${ChainUtil.formatPath(fullPath.slice(0, i + 1))}.`);
      break;
    }
    node = child;
  }
  return updateProofHashForAllRootPathsRecursive(node);
}

function verifyProofHashForStateTree(stateTree) {
  if (!stateTree.verifyProofHash()) {
    return false;
  }
  if (!stateTree.getIsLeaf()) {
    for (const childNode of stateTree.getChildNodes()) {
      if (!verifyProofHashForStateTree(childNode)) {
        return false;
      }
    }
  }
  return true;
}

module.exports = {
  isEmptyNode,
  hasShardConfig,
  getShardConfig,
  hasFunctionConfig,
  getFunctionConfig,
  hasRuleConfig,
  getRuleConfig,
  hasOwnerConfig,
  getOwnerConfig,
  hasEnabledShardConfig,
  hasReservedChar,
  hasAllowedPattern,
  isWritablePathWithSharding,
  isValidStateLabel,
  isValidPathForStates,
  isValidJsObjectForStates,
  isValidRuleConfig,
  isValidRuleTree,
  isValidFunctionConfig,
  isValidFunctionTree,
  isValidOwnerConfig,
  isValidOwnerTree,
  applyFunctionChange,
  applyOwnerChange,
  setStateTreeVersion,
  renameStateTreeVersion,
  deleteStateTree,
  deleteStateTreeVersion,
  makeCopyOfStateTree,
  equalStateTrees,
  setProofHashForStateTree,
  updateProofHashForAllRootPaths,
  verifyProofHashForStateTree
};
