/* eslint guard-for-in: "off" */
const logger = require('../logger')('STATE_UTIL');

const _ = require('lodash');
const validUrl = require('valid-url');
const CommonUtil = require('../common/common-util');
const {
  FeatureFlags,
  HASH_DELIMITER,
  PredefinedDbPaths,
  FunctionProperties,
  FunctionTypes,
  isNativeFunctionId,
  RuleProperties,
  OwnerProperties,
  ShardingProperties,
  StateInfoProperties,
  STATE_LABEL_LENGTH_LIMIT,
} = require('../common/constants');

function isEmptyNode(node) {
  return node.getIsLeaf() && node.getValue() === null;
}

function hasConfig(node, label) {
  return node && node.getChild(label) !== null;
}

function getConfig(node, label) {
  return hasConfig(node, label) ? node.getChild(label).toJsObject() : null;
}

function hasShardConfig(valueNode) {
  return hasConfig(valueNode, PredefinedDbPaths.DOT_SHARD);
}

function getShardConfig(valueNode) {
  return getConfig(valueNode, PredefinedDbPaths.DOT_SHARD);
}

function hasFunctionConfig(funcNode) {
  return hasConfig(funcNode, PredefinedDbPaths.DOT_FUNCTION);
}

function getFunctionConfig(funcNode) {
  return getConfig(funcNode, PredefinedDbPaths.DOT_FUNCTION);
}

function hasRuleConfig(ruleNode) {
  return hasConfig(ruleNode, PredefinedDbPaths.DOT_RULE);
}

function getRuleConfig(ruleNode) {
  return getConfig(ruleNode, PredefinedDbPaths.DOT_RULE);
}

function hasOwnerConfig(ownerNode) {
  return hasConfig(ownerNode, PredefinedDbPaths.DOT_OWNER);
}

function getOwnerConfig(ownerNode) {
  return getConfig(ownerNode, PredefinedDbPaths.DOT_OWNER);
}

function hasEnabledShardConfig(node) {
  let isEnabled = false;
  if (hasShardConfig(node)) {
    const shardConfig = getShardConfig(node);
    isEnabled = CommonUtil.boolOrFalse(shardConfig[ShardingProperties.SHARDING_ENABLED]);
  }
  return isEnabled;
}

function isWritablePathWithSharding(fullPath, root) {
  let isValid = true;
  const path = [];
  let curNode = root;
  for (const label of fullPath) {
    if (label !== PredefinedDbPaths.DOT_SHARD && hasEnabledShardConfig(curNode)) {
      isValid = false;
      break;
    }
    const child = curNode.getChild(label);
    if (child !== null) {
      curNode = child;
      path.push(label);
    } else {
      break;
    }
  }
  if (hasEnabledShardConfig(curNode)) {
    isValid = false;
  }
  return {isValid, invalidPath: isValid ? '' : CommonUtil.formatPath(path)};
}

function hasVarNamePattern(name) {
  const varNameRegex = /^[A-Za-z_]+[A-Za-z0-9_]*$/gm;
  return CommonUtil.isString(name) ? varNameRegex.test(name) : false;
}

function hasReservedChar(label) {
  const reservedCharRegex = /[\/\.\$\*#\{\}\[\]<>'"` \x00-\x1F\x7F]/gm;
  return CommonUtil.isString(label) ? reservedCharRegex.test(label) : false;
}

function hasAllowedPattern(label) {
  const wildCardPatternRegex = /^\*$/gm;
  const configPatternRegex = /^[\.\$]{1}[^\/\.\$\*#\{\}\[\]<>'"` \x00-\x1F\x7F]+$/gm;
  return CommonUtil.isString(label) ?
      (wildCardPatternRegex.test(label) || configPatternRegex.test(label)) : false;
}

function isValidServiceName(name) {
  return hasVarNamePattern(name);
}

function isValidStateLabel(label) {
  if (!CommonUtil.isString(label) ||
      label === '' ||
      label.length > STATE_LABEL_LENGTH_LIMIT ||
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
  return { isValid, invalidPath: isValid ? '' : CommonUtil.formatPath(path) };
}

function isValidJsObjectForStatesRecursive(obj, path) {
  if (CommonUtil.isDict(obj)) {
    if (CommonUtil.isEmpty(obj)) {
      return { isValid: false, invalidPath: CommonUtil.formatPath(path) };
    }
    for (const key in obj) {
      path.push(key);
      if (!isValidStateLabel(key)) {
        return { isValid: false, invalidPath: CommonUtil.formatPath(path) };
      }
      const childObj = obj[key];
      const isValidChild = isValidJsObjectForStatesRecursive(childObj, path);
      if (!isValidChild.isValid) {
        return isValidChild;
      }
      path.pop();
    }
  } else {
    if (!CommonUtil.isBool(obj) && !CommonUtil.isNumber(obj) && !CommonUtil.isString(obj) &&
        obj !== null) {
      return { isValid: false, invalidPath: CommonUtil.formatPath(path) };
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
 function isValidRuleConfig(ruleConfigObj) {
  if (!CommonUtil.isDict(ruleConfigObj)) {
    return { isValid: false, invalidPath: CommonUtil.formatPath([]) };
  }
  if (!ruleConfigObj.hasOwnProperty(RuleProperties.WRITE)) {
    return { isValid: false, invalidPath: CommonUtil.formatPath([]) };
  }
  const writeProp = ruleConfigObj[RuleProperties.WRITE];
  if (!CommonUtil.isBool(writeProp) && !CommonUtil.isString(writeProp)) {
    return { isValid: false, invalidPath: CommonUtil.formatPath([RuleProperties.WRITE]) };
  }

  return { isValid: true, invalidPath: '' };
}

function sanitizeFunctionInfo(functionInfoObj) {
  if (!functionInfoObj) {
    return null;
  }

  const functionType = functionInfoObj[FunctionProperties.FUNCTION_TYPE];
  const sanitized = {};
  if (functionType === FunctionTypes.NATIVE) {
    sanitized[FunctionProperties.FUNCTION_TYPE] = functionType;
    sanitized[FunctionProperties.FUNCTION_ID] =
        CommonUtil.stringOrEmpty(functionInfoObj[FunctionProperties.FUNCTION_ID]);
  } else if (functionType === FunctionTypes.REST) {
    sanitized[FunctionProperties.FUNCTION_TYPE] = functionType;
    sanitized[FunctionProperties.FUNCTION_ID] =
        CommonUtil.stringOrEmpty(functionInfoObj[FunctionProperties.FUNCTION_ID]);
    sanitized[FunctionProperties.EVENT_LISTENER] =
        CommonUtil.stringOrEmpty(functionInfoObj[FunctionProperties.EVENT_LISTENER]);
    sanitized[FunctionProperties.SERVICE_NAME] =
        CommonUtil.stringOrEmpty(functionInfoObj[FunctionProperties.SERVICE_NAME]);
  }

  return sanitized;
}

function isValidFunctionInfo(functionInfoObj) {
  if (CommonUtil.isEmpty(functionInfoObj)) {
    return false;
  }
  const sanitized = sanitizeFunctionInfo(functionInfoObj);
  const isIdentical =
      _.isEqual(JSON.parse(JSON.stringify(sanitized)), functionInfoObj, { strict: true });
  if (!isIdentical) {
    return false;
  }
  const eventListener = functionInfoObj[FunctionProperties.EVENT_LISTENER];
  if (eventListener !== undefined &&
      !validUrl.isUri(functionInfoObj[FunctionProperties.EVENT_LISTENER])) {
    return false;
  }
  return true;
}

/**
 * Checks the validity of the given function configuration.
 */
function isValidFunctionConfig(functionConfigObj) {
  if (!CommonUtil.isDict(functionConfigObj)) {
    return { isValid: false, invalidPath: CommonUtil.formatPath([]) };
  }
  const fidList = Object.keys(functionConfigObj);
  if (CommonUtil.isEmpty(fidList)) {
    return { isValid: false, invalidPath: CommonUtil.formatPath([]) };
  }
  for (const fid of fidList) {
    const invalidPath = CommonUtil.formatPath([fid]);
    const functionInfo = functionConfigObj[fid];
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
        invalidPath: CommonUtil.formatPath([fid, FunctionProperties.FUNCTION_ID])
      };
    }
  }

  return { isValid: true, invalidPath: '' };
}

function sanitizeOwnerPermissions(ownerPermissionsObj) {
  if (!ownerPermissionsObj) {
    return null;
  }
  return {
    [OwnerProperties.BRANCH_OWNER]:
        CommonUtil.boolOrFalse(ownerPermissionsObj[OwnerProperties.BRANCH_OWNER]),
    [OwnerProperties.WRITE_FUNCTION]:
        CommonUtil.boolOrFalse(ownerPermissionsObj[OwnerProperties.WRITE_FUNCTION]),
    [OwnerProperties.WRITE_OWNER]:
        CommonUtil.boolOrFalse(ownerPermissionsObj[OwnerProperties.WRITE_OWNER]),
    [OwnerProperties.WRITE_RULE]:
        CommonUtil.boolOrFalse(ownerPermissionsObj[OwnerProperties.WRITE_RULE]),
  };
}

function isValidOwnerPermissions(ownerPermissionsObj) {
  if (CommonUtil.isEmpty(ownerPermissionsObj)) {
    return false;
  }
  const sanitized = sanitizeOwnerPermissions(ownerPermissionsObj);
  const isIdentical =
      _.isEqual(JSON.parse(JSON.stringify(sanitized)), ownerPermissionsObj, { strict: true });
  return isIdentical;
}

/**
 * Checks the validity of the given owner configuration.
 */
function isValidOwnerConfig(ownerConfigObj) {
  if (!CommonUtil.isDict(ownerConfigObj)) {
    return { isValid: false, invalidPath: CommonUtil.formatPath([]) };
  }
  const path = [];
  if (!ownerConfigObj.hasOwnProperty(OwnerProperties.OWNERS)) {
    return { isValid: false, invalidPath: CommonUtil.formatPath(path) };
  }
  const ownersProp = ownerConfigObj[OwnerProperties.OWNERS];
  path.push(OwnerProperties.OWNERS);
  if (!CommonUtil.isDict(ownersProp)) {
    return { isValid: false, invalidPath: CommonUtil.formatPath(path) };
  }
  const ownerList = Object.keys(ownersProp);
  if (CommonUtil.isEmpty(ownerList)) {
    return { isValid: false, invalidPath: CommonUtil.formatPath(path) };
  }
  for (const owner of ownerList) {
    const invalidPath = CommonUtil.formatPath([...path, owner]);
    if (owner !== OwnerProperties.ANYONE && !CommonUtil.isCksumAddr(owner)) {
      if (!owner.startsWith(OwnerProperties.FID_PREFIX)) {
        return { isValid: false, invalidPath };
      }
      const fid = owner.substring(OwnerProperties.FID_PREFIX.length);
      if (!isNativeFunctionId(fid)) {
        return { isValid: false, invalidPath };
      }
    }
    const ownerPermissions = CommonUtil.getJsObject(ownerConfigObj, [...path, owner]);
    if (ownerPermissions === null) {
      // Owner deletion.
      continue;
    }
    if (!isValidOwnerPermissions(ownerPermissions)) {
      return { isValid: false, invalidPath };
    }
  }

  return { isValid: true, invalidPath: '' };
}

function isValidConfigTreeRecursive(stateTreeObj, path, configLabel, stateConfigValidator) {
  if (!CommonUtil.isDict(stateTreeObj) || CommonUtil.isEmpty(stateTreeObj)) {
    return { isValid: false, invalidPath: CommonUtil.formatPath(path) };
  }

  for (const label in stateTreeObj) {
    path.push(label);
    const subtree = stateTreeObj[label];
    if (label === configLabel) {
      const isValidConfig = stateConfigValidator(subtree);
      if (!isValidConfig.isValid) {
        return {
          isValid: false,
          invalidPath: CommonUtil.appendPath(CommonUtil.formatPath(path), isValidConfig.invalidPath)
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
function isValidRuleTree(ruleTreeObj) {
  if (ruleTreeObj === null) {
    return { isValid: true, invalidPath: '' };
  }

  return isValidConfigTreeRecursive(ruleTreeObj, [], PredefinedDbPaths.DOT_RULE, isValidRuleConfig);
}

/**
 * Checks the validity of the given function tree.
 */
function isValidFunctionTree(functionTreeObj) {
  if (functionTreeObj === null) {
    return { isValid: true, invalidPath: '' };
  }

  return isValidConfigTreeRecursive(
      functionTreeObj, [], PredefinedDbPaths.DOT_FUNCTION, isValidFunctionConfig);
}

/**
 * Checks the validity of the given owner tree.
 */
function isValidOwnerTree(ownerTreeObj) {
  if (ownerTreeObj === null) {
    return { isValid: true, invalidPath: '' };
  }

  return isValidConfigTreeRecursive(
      ownerTreeObj, [], PredefinedDbPaths.DOT_OWNER, isValidOwnerConfig);
}

/**
 * Returns whether the given state tree object has the given config label as a property.
 */
function hasConfigLabel(stateTreeObj, configLabel) {
  if (!CommonUtil.isDict(stateTreeObj)) {
    return false;
  }
  if (CommonUtil.getJsObject(stateTreeObj, [configLabel]) === null) {
    return false;
  }

  return true;
}

/**
 * Returns whether the given state tree object has the given config label as the only property.
 */
function hasConfigLabelOnly(stateTreeObj, configLabel) {
  if (!hasConfigLabel(stateTreeObj, configLabel)) {
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
  // NOTE(platfowner): Partial set is applied only when the current function tree has
  // .function property and the function change has .function property as the only property.
  if (!hasConfigLabel(curFuncTree, PredefinedDbPaths.DOT_FUNCTION) ||
      !hasConfigLabelOnly(functionChange, PredefinedDbPaths.DOT_FUNCTION)) {
    return CommonUtil.isDict(functionChange) ?
        JSON.parse(JSON.stringify(functionChange)) : functionChange;
  }
  const funcChangeMap = CommonUtil.getJsObject(functionChange, [PredefinedDbPaths.DOT_FUNCTION]);
  if (!funcChangeMap || Object.keys(funcChangeMap).length === 0) {
    return curFuncTree;
  }
  const newFuncConfig =
      CommonUtil.isDict(curFuncTree) ? JSON.parse(JSON.stringify(curFuncTree)) : {};
  let newFuncMap = CommonUtil.getJsObject(newFuncConfig, [PredefinedDbPaths.DOT_FUNCTION]);
  if (!CommonUtil.isDict(newFuncMap)) {
    // Add a place holder.
    CommonUtil.setJsObject(newFuncConfig, [PredefinedDbPaths.DOT_FUNCTION], {});
    newFuncMap = CommonUtil.getJsObject(newFuncConfig, [PredefinedDbPaths.DOT_FUNCTION]);
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
  // NOTE(platfowner): Partial set is applied only when the current owner tree has
  // .owner property and the owner change has .owner property as the only property.
  if (!hasConfigLabel(curOwnerTree, PredefinedDbPaths.DOT_OWNER) ||
      !hasConfigLabelOnly(ownerChange, PredefinedDbPaths.DOT_OWNER)) {
    return CommonUtil.isDict(ownerChange) ?
        JSON.parse(JSON.stringify(ownerChange)) : ownerChange;
  }
  const ownerMapPath = [PredefinedDbPaths.DOT_OWNER, OwnerProperties.OWNERS];
  const ownerChangeMap = CommonUtil.getJsObject(ownerChange, ownerMapPath);
  if (!ownerChangeMap || Object.keys(ownerChangeMap).length === 0) {
    return curOwnerTree;
  }
  const newOwnerConfig =
      CommonUtil.isDict(curOwnerTree) ? JSON.parse(JSON.stringify(curOwnerTree)) : {};
  let newOwnerMap = CommonUtil.getJsObject(newOwnerConfig, ownerMapPath);
  if (!CommonUtil.isDict(newOwnerMap)) {
    // Add a place holder.
    CommonUtil.setJsObject(newOwnerConfig, ownerMapPath, {});
    newOwnerMap = CommonUtil.getJsObject(newOwnerConfig, ownerMapPath);
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
function deleteStateTreeVersion(node) {
  let numAffectedNodes = 0;
  if (node.hasAtLeastOneParent()) {
    // Does nothing.
    return numAffectedNodes;
  }

  // 1. Delete children
  numAffectedNodes += node.deleteRadixTreeVersion();
  // 2. Reset node
  node.reset();
  numAffectedNodes++;

  return numAffectedNodes;
}

function updateStateInfoForAllRootPathsRecursive(
    curNode, updatedChildLabel = null, updatedChildEmpty = false) {
  let numAffectedNodes = 0;
  if (updatedChildEmpty) {
    curNode.deleteChild(updatedChildLabel, true);  // shouldUpdateStateInfo = true
  } else {
    if (!FeatureFlags.enableStateInfoUpdates) {
      return 0;
    }
    curNode.updateStateInfo(updatedChildLabel, true);  // shouldRebuildRadixInfo = true
  }
  const curLabel = curNode.getLabel();
  const curNodeEmpty = updatedChildEmpty && isEmptyNode(curNode);
  numAffectedNodes++;
  for (const parent of curNode.getParentNodes()) {
    numAffectedNodes +=
        updateStateInfoForAllRootPathsRecursive(parent, curLabel, curNodeEmpty);
  }
  return numAffectedNodes;
}

function updateStateInfoForAllRootPaths(curNode, updatedChildLabel = null) {
  const LOG_HEADER = 'updateStateInfoForAllRootPaths';

  const childNode = curNode.getChild(updatedChildLabel);
  if (childNode === null) {
    logger.error(
        `[${LOG_HEADER}] Updating state info with non-existing label: ${updatedChildLabel} ` +
        `at: ${new Error().stack}.`);
    return 0;
  }
  return updateStateInfoForAllRootPathsRecursive(
      curNode, updatedChildLabel, isEmptyNode(childNode));
}

function updateStateInfoForStateTree(stateTree) {
  if (!FeatureFlags.enableStateInfoUpdates) {
    return 0;
  }
  let numAffectedNodes = 0;
  if (!stateTree.getIsLeaf()) {
    for (const node of stateTree.getChildNodes()) {
      numAffectedNodes += updateStateInfoForStateTree(node);
    }
  }
  stateTree.updateStateInfo(null, true);  // shouldRebuildRadixInfo = true
  numAffectedNodes++;

  return numAffectedNodes;
}

function verifyStateInfoForStateTree(stateTree) {
  if (!stateTree.verifyStateInfo()) {
    return false;
  }
  if (!stateTree.getIsLeaf()) {
    for (const childNode of stateTree.getChildNodes()) {
      if (!verifyStateInfoForStateTree(childNode)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * An internal version of getStateProofFromStateRoot().
 * 
 * @param {Object} fullPath array of parsed full path labels
 * @param {Object} curNode current state node
 * @param {Object} index index of fullPath
 */
function getStateProofRecursive(fullPath, curNode, index) {
  if (index > fullPath.length - 1) {
    return curNode.getProofOfStateNode();
  }
  const childLabel = fullPath[index];
  const child = curNode.getChild(childLabel);
  if (child === null) {
    return null;
  }
  const childProof = getStateProofRecursive(fullPath, child, index + 1);
  if (childProof === null) {
    return null;
  }
  return curNode.getProofOfStateNode(childLabel, childProof);
}

/**
 * Returns proof of a state path.
 * 
 * @param {Object} root root state node
 * @param {Object} fullPath array of parsed full path labels
 */
function getStateProofFromStateRoot(root, fullPath) {
  return getStateProofRecursive(fullPath, root, 0);
}

/**
 * Returns proof hash of a state path.
 * 
 * @param {Object} root root state node
 * @param {Object} fullPath array of parsed full path labels
 */
function getProofHashFromStateRoot(root, fullPath) {
  let curNode = root;
  for (let i = 0; i < fullPath.length; i++) {
    const childLabel = fullPath[i];
    const child = curNode.getChild(childLabel);
    if (child === null) {
      return null;
    }
    curNode = child;
  }
  return curNode.getProofHash();
}

/**
 * Returns proof hash of a radix node.
 * 
 * @param {Object} childStatePh proof hash of child state node. null if not available.
 * @param {Object} subProofList proof list of child radix nodes
 */
function getProofHashOfRadixNode(childStatePh, subProofList) {
  let preimage = childStatePh !== null ? childStatePh : '';
  preimage += `${HASH_DELIMITER}`;
  if (subProofList.length === 0) {
    preimage += `${HASH_DELIMITER}`;
  } else {
    for (const subProof of subProofList) {
      preimage += `${HASH_DELIMITER}${subProof.label}${HASH_DELIMITER}${subProof.proofHash}`;
    }
  }
  return CommonUtil.hashString(preimage);
}

/**
 * An internal version of verifyStateProof().
 * 
 * @param {Object} proof state proof
 * 
 * Returns { proofHash, isStateNode } when successful, otherwise null.
 */
function verifyStateProofInternal(proof, curLabels) {
  const curPath = CommonUtil.formatPath(curLabels);
  let childStatePh = null;
  let curProofHash = null;
  let isStateNode = false;
  let childIsVerified = true;
  let childMismatchedPath = null;
  const subProofList = [];
  // NOTE(platfowner): Sort child nodes by label radix for stability.
  const sortedProof = Object.entries(proof).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [label, value] of sortedProof) {
    let childProofHash = null;
    if (CommonUtil.isDict(value)) {
      const subProof = verifyStateProofInternal(value, [...curLabels, label]);
      if (childIsVerified === true && subProof.isVerified !== true) {
        childIsVerified = false;
        childMismatchedPath = subProof.mismatchedPath;
      }
      if (subProof.isStateNode === true) {
        childStatePh = subProof.proofHash;
        continue;  // continue
      }
      childProofHash = subProof.proofHash;
    } else {
      childProofHash = value;
    }
    if (label === StateInfoProperties.STATE_PROOF_HASH) {
      curProofHash = childProofHash;
      isStateNode = true;
      continue;  // continue
    }
    if (label === StateInfoProperties.RADIX_PROOF_HASH) {
      curProofHash = childProofHash;
      continue;  // continue
    }
    subProofList.push({
      label,
      proofHash: childProofHash,
    });
  }
  if (subProofList.length === 0 && childStatePh === null) {
    const isVerified = childIsVerified && curProofHash !== null;
    const mismatchedPath = childIsVerified ? (isVerified ? null : curPath) : childMismatchedPath;
    return {
      proofHash: curProofHash,
      isStateNode: isStateNode,
      isVerified: isVerified,
      mismatchedPath: mismatchedPath,
    };
  }
  const computedProofHash = getProofHashOfRadixNode(childStatePh, subProofList);
  const isVerified = childIsVerified && computedProofHash === curProofHash;
  const mismatchedPath = childIsVerified ? (isVerified ? null : curPath) : childMismatchedPath;
  return {
    proofHash: computedProofHash,
    isStateNode: isStateNode,
    isVerified: isVerified,
    mismatchedPath: mismatchedPath,
  }
}

/**
 * Verifies a state path.
 * 
 * @param {Object} proof state proof
 * 
 * Returns root proof hash if successful, otherwise null.
 */
function verifyStateProof(proof) {
  const result = verifyStateProofInternal(proof, []);
  return {
    rootProofHash: result.proofHash,
    isVerified: result.isVerified,
    mismatchedPath: result.mismatchedPath,
  };
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
  isValidServiceName,
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
  renameStateTreeVersion,
  deleteStateTreeVersion,
  updateStateInfoForAllRootPaths,
  updateStateInfoForStateTree,
  verifyStateInfoForStateTree,
  getStateProofFromStateRoot,
  getProofHashFromStateRoot,
  verifyStateProof,
};
