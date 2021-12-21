/* eslint guard-for-in: "off" */
const logger = new (require('../logger'))('STATE_UTIL');

const _ = require('lodash');
const espree = require('espree');
const CommonUtil = require('../common/common-util');
const {
  PredefinedDbPaths,
  FunctionProperties,
  FunctionTypes,
  isNativeFunctionId,
  RuleProperties,
  OwnerProperties,
  ShardingProperties,
  StateInfoProperties,
} = require('../common/constants');

const WRITE_RULE_ECMA_VERSION = 12;
const WRITE_RULE_CODE_SNIPPET_PREFIX = '"use strict"; return ';
const WRITE_RULE_ID_TOKEN_WHITELIST_BASE = [
  // 1) from parameters
  'auth',
  'currentTime',
  'data',
  'evalOwner',
  'evalRule',
  'getFunction',
  'getOwner',
  'getRule',
  'getValue',
  'lastBlockNumber',
  'newData',
  'util',
  // 2) from language
  'Number',  // type casting
  'String',  // type casting
  'Boolean',  // type casting
];
const WRITE_RULE_PUNC_TOKEN_BLACKLIST = [
  '=',  // assignment
];

function isEmptyNode(node) {
  return node.getIsLeaf() && node.getValue() === null;
}

function hasConfig(node, label) {
  return node && node.getChild(label) !== null;
}

function getConfig(node, label) {
  return hasConfig(node, label) ? node.getChild(label).toStateSnapshot() : null;
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

function hasRuleConfigWithProp(ruleNode, ruleProp) {
  return hasRuleConfig(ruleNode) && ruleNode.getChild(PredefinedDbPaths.DOT_RULE).getChild(ruleProp) !== null;
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

function isValidStateLabel(label, stateLabelLengthLimit) {
  if (!CommonUtil.isString(label) || label === '' || label.length > stateLabelLengthLimit ||
      (hasReservedChar(label) && !hasAllowedPattern(label))) {
    return false;
  }
  return true;
}

function isValidPathForStates(fullPath, stateLabelLengthLimit) {
  let isValid = true;
  const path = [];
  for (const label of fullPath) {
    path.push(label);
    if (!isValidStateLabel(label, stateLabelLengthLimit)) {
      isValid = false;
      break;
    }
  }
  return { isValid, invalidPath: isValid ? '' : CommonUtil.formatPath(path) };
}

function isValidJsObjectForStates(obj, stateLabelLengthLimit, path = []) {
  if (CommonUtil.isDict(obj)) {
    if (CommonUtil.isEmpty(obj)) {
      return { isValid: false, invalidPath: CommonUtil.formatPath(path) };
    }
    for (const key in obj) {
      path.push(key);
      if (!isValidStateLabel(key, stateLabelLengthLimit)) {
        return { isValid: false, invalidPath: CommonUtil.formatPath(path) };
      }
      const childObj = obj[key];
      const isValidChild = isValidJsObjectForStates(childObj, stateLabelLengthLimit, path);
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

function sanitizeRuleConfig(rule) {
  if (!rule) {
    return null;
  }
  const sanitized = {};
  if (rule.hasOwnProperty(RuleProperties.WRITE)) {
    CommonUtil.setJsObject(sanitized, [RuleProperties.WRITE], rule[RuleProperties.WRITE]);
  }
  if (rule.hasOwnProperty(RuleProperties.STATE)) {
    if (rule[RuleProperties.STATE] === null) {
      CommonUtil.setJsObject(sanitized, [RuleProperties.STATE], null);
    } else {
      if (rule[RuleProperties.STATE].hasOwnProperty(RuleProperties.MAX_CHILDREN)) {
        CommonUtil.setJsObject(sanitized, [RuleProperties.STATE, RuleProperties.MAX_CHILDREN],
            rule[RuleProperties.STATE][RuleProperties.MAX_CHILDREN]);
      }
      if (rule[RuleProperties.STATE].hasOwnProperty(RuleProperties.GC_MAX_SIBLINGS)) {
        CommonUtil.setJsObject(sanitized, [RuleProperties.STATE, RuleProperties.GC_MAX_SIBLINGS],
            rule[RuleProperties.STATE][RuleProperties.GC_MAX_SIBLINGS]);
      }
    }
  }
  return sanitized;
}

function makeWriteRuleCodeSnippet(ruleString) {
  return WRITE_RULE_CODE_SNIPPET_PREFIX + ruleString;
}

function getVariableLabels(parsedRulePath, variableLabelPrefix) {
  return parsedRulePath.filter((label) => CommonUtil.isVariableLabel(label, variableLabelPrefix));
}

/**
 * Extract top-level identifier tokens (e.g. auth, newData, not auth.addr nor newData.proposer)
 * from the given token list.
 */
function getTopLevelIdTokens(tokenList) {
  let withProceedingDot = false;
  return tokenList.filter((token) => {
    const isTopLevelIdToken = token.type === 'Identifier' && !withProceedingDot;
    withProceedingDot = token.type === 'Punctuator' && token.value === '.';
    return isTopLevelIdToken;
  }).map((token) => token.value);
}

/**
 * Extract punctuator tokens from the given token list.
 */
function getPuncTokens(tokenList) {
  return tokenList.filter((token) => token.type === 'Punctuator').map((token) => token.value);
}

function isValidWriteRule(parsedRulePath, ruleString, variableLabelPrefix) {
  const LOG_HEADER = 'isValidWriteRule';

  if (ruleString !== null && !CommonUtil.isBool(ruleString) && !CommonUtil.isString(ruleString)) {
    return false;
  }
  if (CommonUtil.isString(ruleString)) {
    const variableLabelList = getVariableLabels(parsedRulePath, variableLabelPrefix);
    const idTokenWhitelistSet = new Set([
      ...WRITE_RULE_ID_TOKEN_WHITELIST_BASE,
      ...variableLabelList,
    ]);
    const ruleCodeSnippet = makeWriteRuleCodeSnippet(ruleString);
    const tokenList = espree.tokenize(ruleCodeSnippet, { ecmaVersion: WRITE_RULE_ECMA_VERSION });
    const idTokens = getTopLevelIdTokens(tokenList);
    for (const token of idTokens) {
      if (!idTokenWhitelistSet.has(token)) {
        logger.info(
            `[${LOG_HEADER}] Rule includes a not-allowed identifier token (${token}) ` +
            `in rule string: ${ruleString}`);
        return false;
      }
    }
    const puncTokenBlacklistSet = new Set([
      ...WRITE_RULE_PUNC_TOKEN_BLACKLIST
    ]);
    const puncTokens = getPuncTokens(tokenList);
    for (const token of puncTokens) {
      if (puncTokenBlacklistSet.has(token)) {
        logger.info(
            `[${LOG_HEADER}] Rule includes a not-allowed punctuator token (${token}) ` +
            `in rule string: ${ruleString}`);
        return false;
      }
    }
  }

  return true;
}

function isValidStateRule(stateRule) {
  if (stateRule === null) {
    return true;
  }
  if (!CommonUtil.isDict(stateRule) || CommonUtil.isEmpty(stateRule)) {
    return false;
  }
  let hasValidProperty = false;
  if (stateRule.hasOwnProperty(RuleProperties.MAX_CHILDREN)) {
    if (!CommonUtil.isNumber(stateRule[RuleProperties.MAX_CHILDREN]) ||
        stateRule[RuleProperties.MAX_CHILDREN] <= 0) {
      return false;
    }
    hasValidProperty = true;
  }
  if (stateRule.hasOwnProperty(RuleProperties.GC_MAX_SIBLINGS)) {
    if (!CommonUtil.isNumber(stateRule[RuleProperties.GC_MAX_SIBLINGS]) ||
      stateRule[RuleProperties.GC_MAX_SIBLINGS] <= 0) {
      return false;
    }
    hasValidProperty = true;
  }
  return hasValidProperty;
}

/**
 * Checks the validity of the given rule configuration.
 * 
 * @param {Object} configPath path of the config
 * @param {Object} ruleConfigObj rule config object
 */
// NOTE(platfowner): Should have the same parameters as isValidFunctionConfig() and
// isValidOwnerConfig() to be used with isValidConfigTreeRecursive().
function isValidRuleConfig(configPath, ruleConfigObj, variableLabelPrefix) {
  if (!CommonUtil.isDict(ruleConfigObj)) {
    return { isValid: false, invalidPath: CommonUtil.formatPath([]) };
  }
  if (!ruleConfigObj.hasOwnProperty(RuleProperties.WRITE) &&
      !ruleConfigObj.hasOwnProperty(RuleProperties.STATE)) {
    return { isValid: false, invalidPath: CommonUtil.formatPath([]) };
  }

  const sanitized = sanitizeRuleConfig(ruleConfigObj);
  const isIdentical = _.isEqual(JSON.parse(JSON.stringify(sanitized)), ruleConfigObj);
  if (!isIdentical) {
    return { isValid: false, invalidPath: CommonUtil.formatPath([]) };
  }
  const writeRule = sanitized[RuleProperties.WRITE];
  if (sanitized.hasOwnProperty(RuleProperties.WRITE) &&
      !isValidWriteRule(configPath, writeRule, variableLabelPrefix)) {
    return { isValid: false, invalidPath: CommonUtil.formatPath([RuleProperties.WRITE]) };
  }
  const stateRule = sanitized[RuleProperties.STATE];
  if (sanitized.hasOwnProperty(RuleProperties.STATE) && !isValidStateRule(stateRule)) {
    return { isValid: false, invalidPath: CommonUtil.formatPath([RuleProperties.STATE]) };
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
    sanitized[FunctionProperties.FUNCTION_URL] =
        CommonUtil.stringOrEmpty(functionInfoObj[FunctionProperties.FUNCTION_URL]);
  }

  return sanitized;
}

function isValidFunctionInfo(functionInfoObj) {
  const LOG_HEADER = 'isValidFunctionInfo';

  if (CommonUtil.isEmpty(functionInfoObj)) {
    return false;
  }
  const sanitized = sanitizeFunctionInfo(functionInfoObj);
  const isIdentical =
      _.isEqual(JSON.parse(JSON.stringify(sanitized)), functionInfoObj, { strict: true });
  if (!isIdentical) {
    const diffLines = CommonUtil.getJsonDiff(sanitized, functionInfoObj);
    logger.info(`[${LOG_HEADER}] Function info is in a non-standard format:\n${diffLines}\n`);
    return false;
  }
  const functionUrl = functionInfoObj[FunctionProperties.FUNCTION_URL];
  if (functionUrl !== undefined && !CommonUtil.isValidUrl(functionUrl)) {
    return false;
  }
  return true;
}

/**
 * Checks the validity of the given function configuration.
 * 
 * @param {Object} configPath path of the config
 * @param {Object} functionConfigObj function config object
 */
// NOTE(platfowner): Should have the same parameters as isValidRuleConfig() and
// isValidOwnerConfig() to be used with isValidConfigTreeRecursive().
function isValidFunctionConfig(configPath, functionConfigObj) {
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

function sanitizeOwnerPermissions(permissionObj) {
  if (!permissionObj) {
    return null;
  }
  return {
    [OwnerProperties.BRANCH_OWNER]:
        CommonUtil.boolOrFalse(permissionObj[OwnerProperties.BRANCH_OWNER]),
    [OwnerProperties.WRITE_FUNCTION]:
        CommonUtil.boolOrFalse(permissionObj[OwnerProperties.WRITE_FUNCTION]),
    [OwnerProperties.WRITE_OWNER]:
        CommonUtil.boolOrFalse(permissionObj[OwnerProperties.WRITE_OWNER]),
    [OwnerProperties.WRITE_RULE]:
        CommonUtil.boolOrFalse(permissionObj[OwnerProperties.WRITE_RULE]),
  };
}

function isValidOwnerPermissions(permissionObj) {
  const LOG_HEADER = 'isValidOwnerPermissions';

  if (CommonUtil.isEmpty(permissionObj)) {
    return false;
  }
  const sanitized = sanitizeOwnerPermissions(permissionObj);
  const isIdentical =
      _.isEqual(JSON.parse(JSON.stringify(sanitized)), permissionObj, { strict: true });
  if (!isIdentical) {
    const diffLines = CommonUtil.getJsonDiff(sanitized, permissionObj);
    logger.info(`[${LOG_HEADER}] Owner permission is in a non-standard format:\n${diffLines}\n`);
  }
  return isIdentical;
}

/**
 * Checks the validity of the given owner configuration.
 * 
 * @param {Object} configPath path of the config
 * @param {Object} ownerConfigObj owner config object
 */
// NOTE(platfowner): Should have the same parameters as isValidFunctionConfig() and
// isValidRuleConfig() to be used with isValidConfigTreeRecursive().
function isValidOwnerConfig(configPath, ownerConfigObj) {
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

/**
 * Checks the validity of the given state tree with the given config label and
 * state config validator.
 * 
 * @param {*} treePath path of the state tree
 * @param {*} stateTreeObj state tree to check the validity
 * @param {*} path recursion path
 * @param {*} configLabel config label
 * @param {*} stateConfigValidator state config validator function
 */
function isValidConfigTreeRecursive(
    treePath, stateTreeObj, subtreePath, configLabel, stateConfigValidator, variableLabelPrefix) {
  if (!CommonUtil.isDict(stateTreeObj) || CommonUtil.isEmpty(stateTreeObj)) {
    return { isValid: false, invalidPath: CommonUtil.formatPath(subtreePath) };
  }

  for (const label in stateTreeObj) {
    subtreePath.push(label);
    const subtree = stateTreeObj[label];
    if (label === configLabel) {
      const isValidConfig = stateConfigValidator([...treePath, ...subtreePath], subtree, variableLabelPrefix);
      if (!isValidConfig.isValid) {
        return {
          isValid: false,
          invalidPath: CommonUtil.appendPath(CommonUtil.formatPath(subtreePath), isValidConfig.invalidPath)
        };
      }
    } else {
      const isValidSubtree = isValidConfigTreeRecursive(
          treePath, subtree, subtreePath, configLabel, stateConfigValidator, variableLabelPrefix);
      if (!isValidSubtree.isValid) {
        return isValidSubtree;
      }
    }
    subtreePath.pop();
  }

  return { isValid: true, invalidPath: '' };
}

/**
 * Checks the validity of the given rule tree.
 */
function isValidRuleTree(treePath, ruleTreeObj, variableLabelPrefix) {
  if (ruleTreeObj === null) {
    return { isValid: true, invalidPath: '' };
  }

  return isValidConfigTreeRecursive(
      treePath, ruleTreeObj, [], PredefinedDbPaths.DOT_RULE, isValidRuleConfig, variableLabelPrefix);
}

/**
 * Checks the validity of the given function tree.
 */
function isValidFunctionTree(treePath, functionTreeObj, variableLabelPrefix) {
  if (functionTreeObj === null) {
    return { isValid: true, invalidPath: '' };
  }

  return isValidConfigTreeRecursive(
      treePath, functionTreeObj, [], PredefinedDbPaths.DOT_FUNCTION, isValidFunctionConfig, variableLabelPrefix);
}

/**
 * Checks the validity of the given owner tree.
 */
function isValidOwnerTree(treePath, ownerTreeObj, variableLabelPrefix) {
  if (ownerTreeObj === null) {
    return { isValid: true, invalidPath: '' };
  }

  return isValidConfigTreeRecursive(
      treePath, ownerTreeObj, [], PredefinedDbPaths.DOT_OWNER, isValidOwnerConfig, variableLabelPrefix);
}

/**
 * Returns whether the given state tree object has the given config label as a property.
 */
function hasConfigLabel(stateTreeObj, configLabel) {
  return CommonUtil.getJsObject(stateTreeObj, [configLabel]) !== null;
}

/**
 * Returns whether the given state tree object has the given config label as the only property.
 */
function hasConfigLabelOnly(stateTreeObj, configLabel) {
  if (!hasConfigLabel(stateTreeObj, configLabel)) {
    return false;
  }
  return Object.keys(stateTreeObj).length === 1;
}

/**
 * Returns a config at the given path of the given state tree object if available,
 * otherwise null.
 */
function getConfigFromStateTreeObj(stateTreeObj, configPath) {
  return CommonUtil.getJsObject(stateTreeObj, configPath);
}

/**
 * Sets a config at the given path of the given state tree object.
 */
function setConfigToStateTreeObj(stateTreeObj, configPath, config) {
  if (!CommonUtil.isDict(stateTreeObj)) {
    return false;
  }
  return CommonUtil.setJsObject(stateTreeObj, configPath, config);
}

/**
 * Returns a new rule tree created by applying the rule change to
 * the current rule tree.
 * 
 * @param {Object} curRuleTree current rule tree (to be modified by this rule)
 * @param {Object} ruleChange rule change
 */
// NOTE(platfowner): Config merge is applied only when the current rule tree has
// .rule property and the rule change has .rule property as the only property.
function applyRuleChange(curRuleTree, ruleChange) {
  // 1. Config overwriting case (isMerge = false):
  if (!hasConfigLabel(curRuleTree, PredefinedDbPaths.DOT_RULE) ||
      !hasConfigLabelOnly(ruleChange, PredefinedDbPaths.DOT_RULE)) {
    const newRuleConfig = CommonUtil.isDict(ruleChange) ?
        JSON.parse(JSON.stringify(ruleChange)) : ruleChange;
    return {
      isMerge: false,
      ruleConfig: newRuleConfig,
    };
  }
  // 2. Config no changes case (isMerge = true):
  const ruleChangeMap = getConfigFromStateTreeObj(ruleChange, [PredefinedDbPaths.DOT_RULE]);
  if (!ruleChangeMap || Object.keys(ruleChangeMap).length === 0) {
    return {
      isMerge: true,
      ruleConfig: curRuleTree,
    };
  }
  // 3. Config merge case (isMerge = true):
  const newRuleConfig =
      CommonUtil.isDict(curRuleTree) ? JSON.parse(JSON.stringify(curRuleTree)) : {};
  let newRuleMap = getConfigFromStateTreeObj(newRuleConfig, [PredefinedDbPaths.DOT_RULE]);
  if (!CommonUtil.isDict(newRuleMap)) {
    // Add a place holder.
    setConfigToStateTreeObj(newRuleConfig, [PredefinedDbPaths.DOT_RULE], {});
    newRuleMap = getConfigFromStateTreeObj(newRuleConfig, [PredefinedDbPaths.DOT_RULE]);
  }
  for (const ruleKey in ruleChangeMap) {
    const ruleInfo = ruleChangeMap[ruleKey];
    if (ruleInfo === null) {
      delete newRuleMap[ruleKey];
    } else {
      newRuleMap[ruleKey] = ruleInfo;
    }
  }

  return {
    isMerge: true,
    ruleConfig: newRuleConfig,
  };
}

/**
 * Returns a new function tree created by applying the function change to
 * the current function tree.
 * 
 * @param {Object} curFuncTree current function tree (to be modified by this function)
 * @param {Object} functionChange function change
 */
// NOTE(platfowner): Config merge is applied only when the current function tree has
// .function property and the function change has .function property as the only property.
function applyFunctionChange(curFuncTree, functionChange) {
  // 1. Config overwriting case (isMerge = false):
  if (!hasConfigLabel(curFuncTree, PredefinedDbPaths.DOT_FUNCTION) ||
      !hasConfigLabelOnly(functionChange, PredefinedDbPaths.DOT_FUNCTION)) {
    const newFuncConfig = CommonUtil.isDict(functionChange) ?
        JSON.parse(JSON.stringify(functionChange)) : functionChange;
    return {
      isMerge: false,
      funcConfig: newFuncConfig,
    };
  }
  // 2. Config no changes case (isMerge = true):
  const funcChangeMap = getConfigFromStateTreeObj(functionChange, [PredefinedDbPaths.DOT_FUNCTION]);
  if (!funcChangeMap || Object.keys(funcChangeMap).length === 0) {
    return {
      isMerge: true,
      funcConfig: curFuncTree,
    };
  }
  // 3. Config merge case (isMerge = true):
  const newFuncConfig =
      CommonUtil.isDict(curFuncTree) ? JSON.parse(JSON.stringify(curFuncTree)) : {};
  let newFuncMap = getConfigFromStateTreeObj(newFuncConfig, [PredefinedDbPaths.DOT_FUNCTION]);
  if (!CommonUtil.isDict(newFuncMap)) {
    // Add a place holder.
    setConfigToStateTreeObj(newFuncConfig, [PredefinedDbPaths.DOT_FUNCTION], {});
    newFuncMap = getConfigFromStateTreeObj(newFuncConfig, [PredefinedDbPaths.DOT_FUNCTION]);
  }
  for (const functionKey in funcChangeMap) {
    const functionInfo = funcChangeMap[functionKey];
    if (functionInfo === null) {
      delete newFuncMap[functionKey];
    } else {
      newFuncMap[functionKey] = functionInfo;
    }
  }

  return {
    isMerge: true,
    funcConfig: newFuncConfig,
  };
}

/**
 * Returns a new owner tree created by applying the owner change to
 * the current owner tree.
 * 
 * @param {Object} curOwnerTree current owner tree (to be modified by this function)
 * @param {Object} ownerChange owner change
 */
// NOTE(platfowner): Config merge is applied only when the current owner tree has
// .owner property and the owner change has .owner property as the only property.
function applyOwnerChange(curOwnerTree, ownerChange) {
  // 1. Config overwriting case (isMerge = false):
  if (!hasConfigLabel(curOwnerTree, PredefinedDbPaths.DOT_OWNER) ||
      !hasConfigLabelOnly(ownerChange, PredefinedDbPaths.DOT_OWNER)) {
    const newOwnerConfig = CommonUtil.isDict(ownerChange) ?
        JSON.parse(JSON.stringify(ownerChange)) : ownerChange;
    return {
      isMerge: false,
      ownerConfig: newOwnerConfig,
    };
  }
  // 2. Config no changes case (isMerge = true):
  const ownerMapPath = [PredefinedDbPaths.DOT_OWNER, OwnerProperties.OWNERS];
  const ownerChangeMap = getConfigFromStateTreeObj(ownerChange, ownerMapPath);
  if (!ownerChangeMap || Object.keys(ownerChangeMap).length === 0) {
    return {
      isMerge: true,
      ownerConfig: curOwnerTree,
    };
  }
  // 3. Config merge case (isMerge = true):
  const newOwnerConfig =
      CommonUtil.isDict(curOwnerTree) ? JSON.parse(JSON.stringify(curOwnerTree)) : {};
  let newOwnerMap = getConfigFromStateTreeObj(newOwnerConfig, ownerMapPath);
  if (!CommonUtil.isDict(newOwnerMap)) {
    // Add a place holder.
    setConfigToStateTreeObj(newOwnerConfig, ownerMapPath, {});
    newOwnerMap = getConfigFromStateTreeObj(newOwnerConfig, ownerMapPath);
  }
  for (const ownerKey in ownerChangeMap) {
    const ownerPermissions = ownerChangeMap[ownerKey];
    if (ownerPermissions === null) {
      delete newOwnerMap[ownerKey];
    } else {
      newOwnerMap[ownerKey] = ownerPermissions;
    }
  }

  return {
    isMerge: true,
    ownerConfig: newOwnerConfig,
  };
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
    CommonUtil.logErrorWithStackTrace(
        logger, 
        `[${LOG_HEADER}] Updating state info with non-existing label: ${updatedChildLabel}`);
    return 0;
  }
  return updateStateInfoForAllRootPathsRecursive(
      curNode, updatedChildLabel, isEmptyNode(childNode));
}

function updateStateInfoForStateTree(stateTree) {
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

function verifyProofHashForStateTree(stateTree, curLabels = []) {
  const curPath = CommonUtil.formatPath(curLabels);
  if (stateTree.getIsLeaf()) {
    const proofHashComputed = CommonUtil.hashString(CommonUtil.toString(stateTree.getValue()));
    const isVerified = proofHashComputed === stateTree.getProofHash();
    const mismatchedPath = isVerified ? null : curPath;
    const mismatchedProofHash = isVerified ? null : stateTree.getProofHash();
    const mismatchedProofHashComputed = isVerified ? null : proofHashComputed;
    return {
      isVerified,
      mismatchedPath,
      mismatchedProofHash,
      mismatchedProofHashComputed,
    };
  } else {
    if (stateTree.getProofHash() !== stateTree.radixTree.getRootProofHash()) {
      return {
        isVerified: false,
        mismatchedPath: curPath,
        mismatchedProofHash: stateTree.getProofHash(),
        mismatchedProofHashComputed: stateTree.radixTree.getRootProofHash(),
      };
    }
    return stateTree.radixTree.verifyProofHashForRadixTree(curLabels);
  }
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
function getProofHashOfRadixNode(hashDelimiter, childStatePh, subProofList) {
  let preimage = childStatePh !== null ? childStatePh : '';
  preimage += hashDelimiter;
  if (subProofList.length === 0) {
    preimage += hashDelimiter;
  } else {
    for (const subProof of subProofList) {
      const radixLabel = subProof.label.slice(StateInfoProperties.RADIX_LABEL_PREFIX.length);
      preimage += `${hashDelimiter}${radixLabel}${hashDelimiter}${subProof.proofHash}`;
    }
  }
  return CommonUtil.hashString(preimage);
}

/**
 * Verifies a state path.
 * 
 * @param {Object} proof state proof
 */
function verifyStateProof(hashDelimiter, proof, curLabels = []) {
  const curPath = CommonUtil.formatPath(curLabels);
  let childStatePh = null;
  let curProofHash = null;
  let childIsVerified = true;
  let childMismatchedPath = null;
  let childMismatchedProofHash = null;
  let childMismatchedProofHashComputed = null;
  const subProofList = [];
  // NOTE(platfowner): Sort child nodes by label radix for stability.
  const sortedProof = Object.entries(proof).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [label, value] of sortedProof) {
    let childProofHash = null;
    if (CommonUtil.isDict(value)) {
      const subVerif = verifyStateProof(hashDelimiter, value, [...curLabels, label]);
      if (childIsVerified === true && subVerif.isVerified !== true) {
        childIsVerified = false;
        childMismatchedPath = subVerif.mismatchedPath;
        childMismatchedProofHash = subVerif.mismatchedProofHash;
        childMismatchedProofHashComputed = subVerif.mismatchedProofHashComputed;
      }
      if (_.startsWith(label, StateInfoProperties.STATE_LABEL_PREFIX)) {
        childStatePh = subVerif.curProofHash;
        continue;  // continue
      }
      childProofHash = subVerif.curProofHash;
    } else {
      childProofHash = value;
    }
    if (label === StateInfoProperties.STATE_PROOF_HASH) {
      curProofHash = childProofHash;
    } else if (label === StateInfoProperties.RADIX_PROOF_HASH) {
      curProofHash = childProofHash;
    } else {
      subProofList.push({
        label,
        proofHash: childProofHash,
      });
    }
  }
  if (subProofList.length === 0 && childStatePh === null) {
    const isVerified = childIsVerified && curProofHash !== null;
    const mismatchedPath = childIsVerified ? (isVerified ? null : curPath) : childMismatchedPath;
    const mismatchedProofHash = childIsVerified ? (isVerified ? null : curProofHash) : childMismatchedProofHash;
    const mismatchedProofHashComputed = childIsVerified ? null : childMismatchedProofHashComputed;
    return {
      curProofHash,
      isVerified,
      mismatchedPath,
      mismatchedProofHash,
      mismatchedProofHashComputed,
    };
  }
  const computedProofHash = getProofHashOfRadixNode(hashDelimiter, childStatePh, subProofList);
  const isVerified = childIsVerified && computedProofHash === curProofHash;
  const mismatchedPath = childIsVerified ? (isVerified ? null : curPath) : childMismatchedPath;
  const mismatchedProofHash = childIsVerified ? (isVerified ? null : curProofHash) : childMismatchedProofHash;
  const mismatchedProofHashComputed = childIsVerified ? (isVerified ? null : computedProofHash) : childMismatchedProofHashComputed;
  return {
    curProofHash,
    isVerified,
    mismatchedPath,
    mismatchedProofHash,
    mismatchedProofHashComputed,
  }
}

module.exports = {
  isEmptyNode,
  hasShardConfig,
  getShardConfig,
  hasFunctionConfig,
  getFunctionConfig,
  hasRuleConfig,
  hasRuleConfigWithProp,
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
  makeWriteRuleCodeSnippet,
  isValidWriteRule,
  isValidStateRule,
  isValidRuleConfig,
  isValidRuleTree,
  isValidFunctionConfig,
  isValidFunctionTree,
  isValidOwnerConfig,
  isValidOwnerTree,
  applyRuleChange,
  applyFunctionChange,
  applyOwnerChange,
  renameStateTreeVersion,
  deleteStateTreeVersion,
  updateStateInfoForAllRootPaths,
  updateStateInfoForStateTree,
  verifyStateInfoForStateTree,
  verifyProofHashForStateTree,
  getStateProofFromStateRoot,
  getProofHashFromStateRoot,
  verifyStateProof,
};
