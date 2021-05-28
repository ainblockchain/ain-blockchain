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
  const reservedCharRegex = /[\/\.\$\*#\{\}\[\]\x00-\x1F\x7F]/gm;
  return ChainUtil.isString(label) ? reservedCharRegex.test(label) : false;
}

function hasAllowedPattern(label) {
  const wildCardPatternRegex = /^\*$/gm;
  const configPatternRegex = /^[\.\$]{1}[^\/\.\$\*#\{\}\[\]\x00-\x1F\x7F]+$/gm;
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
      return false;
    }
    for (const key in obj) {
      path.push(key);
      if (!isValidStateLabel(key)) {
        return false;
      }
      const childObj = obj[key];
      const isValidChild = isValidJsObjectForStatesRecursive(childObj, path);
      if (!isValidChild) {
        return false;
      }
      path.pop();
    }
    return true;
  } else {
    return ChainUtil.isBool(obj) || ChainUtil.isNumber(obj) || ChainUtil.isString(obj) ||
        obj === null;
  }
}

function isValidJsObjectForStates(obj) {
  const path = [];
  const isValid = isValidJsObjectForStatesRecursive(obj, path);
  return { isValid, invalidPath: isValid ? '' : ChainUtil.formatPath(path) };
}

function sanitizeFunctionInfo(functionInfo) {
  if (!functionInfo) {
    return null;
  }

  const functionType = functionInfo[FunctionProperties.FUNCTION_TYPE];
  const sanitized = {};
  if (functionType === FunctionTypes.NATIVE) {
    sanitized[FunctionProperties.FUNCTION_TYPE] = ChainUtil.stringOrEmpty(functionType)
    sanitized[FunctionProperties.FUNCTION_ID] =
        ChainUtil.stringOrEmpty(functionInfo[FunctionProperties.FUNCTION_ID]);
  } else if (functionType === FunctionTypes.REST) {
    sanitized[FunctionProperties.FUNCTION_TYPE] = ChainUtil.stringOrEmpty(functionType)
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

function isValidFunctionTreeRecursive(functionTree, path) {
  if (!ChainUtil.isDict(functionTree) || ChainUtil.isEmpty(functionTree)) {
    return { isValid: false, invalidPath: ChainUtil.formatPath(path) };
  }

  for (const label in functionTree) {
    path.push(label);
    const subtree = functionTree[label];
    if (label === FunctionProperties.FUNCTION) {
      const isValidConfig = isValidFunctionConfig(subtree);
      if (!isValidConfig.isValid) {
        return {
          isValid: false,
          invalidPath: ChainUtil.appendPath(ChainUtil.formatPath(path), isValidConfig.invalidPath)
        };
      }
    } else {
      const isValidSubtree = isValidFunctionTreeRecursive(subtree, path);
      if (!isValidSubtree.isValid) {
        return isValidSubtree;
      }
    }
    path.pop();
  }

  return { isValid: true, invalidPath: '' };
}

/**
 * Checks the validity of the given function tree.
 */
function isValidFunctionTree(functionTree) {
  if (functionTree === null) {
    return { isValid: true, invalidPath: '' };
  }

  return isValidFunctionTreeRecursive(functionTree, []);
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

function isValidOwnerTreeRecursive(ownerTree, path) {
  if (!ChainUtil.isDict(ownerTree) || ChainUtil.isEmpty(ownerTree)) {
    return { isValid: false, invalidPath: ChainUtil.formatPath(path) };
  }

  for (const label in ownerTree) {
    path.push(label);
    const subtree = ownerTree[label];
    if (label === OwnerProperties.OWNER) {
      const isValidConfig = isValidOwnerConfig(subtree);
      if (!isValidConfig.isValid) {
        return {
          isValid: false,
          invalidPath: ChainUtil.appendPath(ChainUtil.formatPath(path), isValidConfig.invalidPath)
        };
      }
    } else {
      const isValidSubtree = isValidOwnerTreeRecursive(subtree, path);
      if (!isValidSubtree.isValid) {
        return isValidSubtree;
      }
    }
    path.pop();
  }

  return { isValid: true, invalidPath: '' };
}

/**
 * Checks the validity of the given owner tree.
 */
function isValidOwnerTree(ownerTree) {
  if (ownerTree === null) {
    return { isValid: true, invalidPath: '' };
  }

  return isValidOwnerTreeRecursive(ownerTree, []);
}

/**
 * Returns a new function created by applying the function change to the current function.
 * @param {Object} curFunction current function (to be modified and returned by this function)
 * @param {Object} functionChange function change
 */
function applyFunctionChange(curFunction, functionChange) {
  if (curFunction === null) {
    // Just write the function change.
    return functionChange;
  }
  if (functionChange === null) {
    // Just delete the existing value.
    return null;
  }
  const funcChangeMap = ChainUtil.getJsObject(functionChange, [FunctionProperties.FUNCTION]);
  if (!funcChangeMap || Object.keys(funcChangeMap).length === 0) {
    return curFunction;
  }
  const newFunction =
      ChainUtil.isDict(curFunction) ? JSON.parse(JSON.stringify(curFunction)) : {};
  let newFuncMap = ChainUtil.getJsObject(newFunction, [FunctionProperties.FUNCTION]);
  if (!newFuncMap || !ChainUtil.isDict(newFunction)) {
    // Add a place holder.
    ChainUtil.setJsObject(newFunction, [FunctionProperties.FUNCTION], {});
    newFuncMap = ChainUtil.getJsObject(newFunction, [FunctionProperties.FUNCTION]);
  }
  for (const functionKey in funcChangeMap) {
    const functionValue = funcChangeMap[functionKey];
    if (functionValue === null) {
      delete newFuncMap[functionKey];
    } else {
      newFuncMap[functionKey] = functionValue;
    }
  }

  return newFunction;
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
  isValidFunctionConfig,
  isValidFunctionTree,
  isValidOwnerConfig,
  isValidOwnerTree,
  applyFunctionChange,
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
