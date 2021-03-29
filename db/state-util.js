/* eslint guard-for-in: "off" */
const logger = require('../logger')('STATE_UTIL');

const ChainUtil = require('../common/chain-util');
const {
  FunctionProperties,
  RuleProperties,
  OwnerProperties,
  ShardingProperties,
} = require('../common/constants');

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
  return {isValid, invalidPath: isValid ? '' : ChainUtil.formatPath(path)};
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
  return {isValid, invalidPath: isValid ? '' : ChainUtil.formatPath(path)};
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
  stateTree.updateProofHashAndTreeSize();
  numAffectedNodes++;

  return numAffectedNodes;
}

function updateProofHashForAllRootPathsRecursive(node) {
  let numAffectedNodes = 0;
  node.updateProofHashAndTreeSize();
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
