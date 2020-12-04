/* eslint guard-for-in: "off" */
const logger = require('../logger')('STATE_UTIL');

const StateNode = require('./state-node');
const ChainUtil = require('../chain-util');
const {
  HASH_DELIMITER,
  FunctionProperties,
  RuleProperties,
  OwnerProperties,
  ShardingProperties,
} = require('../constants');

function isEmptyNode(node) {
  return node.getIsLeaf() && node.getValue() === null;
}

function hasConfig(node, label) {
  return node && node.hasChild(label);
}

function getConfig(node, label) {
  return hasConfig(node, label) ? stateTreeToJsObject(node.getChild(label)) : null;
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

function jsObjectToStateTree(obj, version) {
  const node = new StateNode(version);
  if (ChainUtil.isDict(obj)) {
    if (!ChainUtil.isEmpty(obj)) {
      for (const key in obj) {
        const childObj = obj[key];
        node.setChild(key, jsObjectToStateTree(childObj, version));
      }
    }
  } else {
    node.setValue(obj);
  }
  return node;
}

function stateTreeToJsObject(root) {
  if (root === null) {
    return null;
  }
  if (root.getIsLeaf()) {
    return root.getValue();
  }
  const obj = {};
  for (const label of root.getChildLabels()) {
    const childNode = root.getChild(label);
    obj[label] = stateTreeToJsObject(childNode);
  }
  return obj;
}

function stateTreeVersionsToJsObject(root) {
  if (root === null) {
    return null;
  }
  if (root.getIsLeaf()) {
    return root.getValue();
  }
  const obj = {};
  for (const label of root.getChildLabels()) {
    const childNode = root.getChild(label);
    obj[label] = stateTreeVersionsToJsObject(childNode);
    if (childNode.getIsLeaf()) {
      obj[`.version:${label}`] = childNode.getVersion();
      obj[`.numRef:${label}`] = childNode.getNumRef();
    }
  }
  obj['.version'] = root.getVersion();
  obj['.numRef'] = root.getNumRef();
  return obj;
}

/**
 * Returns affected nodes number.
 */
function setStateTreeVersion(root, version) {
  let numNodes = 0;
  if (root === null) {
    return numNodes;
  }
  if (root.getVersion() !== version) {
    root.setVersion(version);
    numNodes++;
  }
  for (const label of root.getChildLabels()) {
    const childNode = root.getChild(label);
    numNodes += setStateTreeVersion(childNode, version);
  }

  return numNodes;
}

/**
 * Returns affected nodes number.
 */
function deleteStateTree(root) {
  let numNodes = 0;
  for (const label of root.getChildLabels()) {
    const childNode = root.getChild(label);
    numNodes += deleteStateTree(childNode);
    root.deleteChild(label);
  }
  root.resetValue();
  root.resetProofHash();
  numNodes++;

  return numNodes;
}

/**
 * Returns affected nodes number.
 */
function deleteStateTreeVersion(root, version) {
  const LOG_HEADER = 'deleteStateTreeVersion';
  let numNodes = 0;
  if (root.getVersion() !== version) {
    // Does nothing.
    return numNodes;
  }
  if (root.getNumRef() > 0) {
    // This shouldn't happen.
    logger.error(
        `[${LOG_HEADER}] Trying to delete a node with invalid numRef value: ${root.getNumRef()} ` +
        `with version: ${version}.`);
    return numNodes;
  }

  for (const label of root.getChildLabels()) {
    const childNode = root.getChild(label);
    root.deleteChild(label);
    if (childNode.getNumRef() == 0) {
      numNodes += deleteStateTreeVersion(childNode, version);
    } else if (childNode.getNumRef() < 0) {
      // This shouldn't happen.
      logger.error(
          `[${LOG_HEADER}] Deleted a child node with ` +
          `invalid numRef value: ${childNode.getNumRef()} with label: ${label}.`);
    }
  }
  root.resetValue();
  root.resetProofHash();
  numNodes++;

  return numNodes;
}

function makeCopyOfStateTree(root) {
  const copy = root.clone();
  for (const label of root.getChildLabels()) {
    const childNode = root.getChild(label);
    copy.setChild(label, makeCopyOfStateTree(childNode));
  }
  return copy;
}

function buildProofHashOfStateNode(StateNode) {
  let preimage;
  if (StateNode.getIsLeaf()) {
    preimage = StateNode.getValue();
  } else {
    preimage = StateNode.getChildLabels().map((label) => {
      return `${label}${HASH_DELIMITER}${StateNode.getChild(label).getProofHash()}`;
    }, '').join(HASH_DELIMITER);
  }
  return ChainUtil.hashString(ChainUtil.toString(preimage));
}

function setProofHashForStateTree(stateTree) {
  if (!stateTree.getIsLeaf()) {
    stateTree.getChildNodes().forEach((node) => {
      setProofHashForStateTree(node);
    });
  }
  updateProofHashOfStateNode(stateTree);
}

function updateProofHashOfStateNode(stateNode) {
  const proof = buildProofHashOfStateNode(stateNode);
  stateNode.setProofHash(proof);
}

function updateProofHashForPathRecursive(path, stateTree, idx) {
  if (idx < 0 || idx > path.length) {
    return;
  }
  const child = stateTree.getChild(path[idx]);
  if (child != null) {
    updateProofHashForPathRecursive(path, child, idx + 1);
  }
  updateProofHashOfStateNode(stateTree);
}

function updateProofHashForPath(fullPath, root) {
  return updateProofHashForPathRecursive(fullPath, root, 0);
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
  jsObjectToStateTree,
  stateTreeToJsObject,
  stateTreeVersionsToJsObject,
  setStateTreeVersion,
  deleteStateTree,
  deleteStateTreeVersion,
  makeCopyOfStateTree,
  buildProofHashOfStateNode,
  setProofHashForStateTree,
  updateProofHashForPath,
};
