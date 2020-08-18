const StateNode = require('./state-node');
const ChainUtil = require('../chain-util');
const { HASH_DELIMITER } = require('../constants');

function hasReservedChar(label) {
  const pathReservedRegex = /[\/\.\*\$#\{\}\[\]\x00-\x1F\x7F]/gm;
  return ChainUtil.isString(label) ? pathReservedRegex.test(label) : false;
}

function isValidPathForStates(fullPath) {
  let isValid = true;
  const path = [];
  for (const label of fullPath) {
    path.push(label);
    if (ChainUtil.isString(label)) {
      if (label === '' || hasReservedChar(label)) {
        isValid = false;
        break;
      }
    } else {
      isValid = false;
      break;
    }
  }
  return { isValid, invalidPath: isValid ? '' : ChainUtil.formatPath(path) };
}

function isValidJsObjectForStatesRecursive(obj, path) {
  if (ChainUtil.isDict(obj)) {
    if (ChainUtil.isEmptyNode(obj)) {
      return false;
    }
    for (const key in obj) {
      const childObj = obj[key];
      path.push(key);
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

function jsObjectToStateTree(obj) {
  const node = new StateNode();
  if (ChainUtil.isDict(obj)) {
    if (ChainUtil.isEmptyNode(obj)) {
      node.setIsLeaf(true);
    } else {
      for (const key in obj) {
        const childObj = obj[key];
        node.setChild(key, jsObjectToStateTree(childObj));
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

function deleteStateTree(root) {
  for (const label of root.getChildLabels()) {
    const childNode = root.getChild(label);
    root.deleteChild(label);
    deleteStateTree(childNode);
  }
  delete root;
}

function makeCopyOfStateTree(root) {
  const copy = root.makeCopy();
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
    preimage = StateNode.getChildLabels().map(label => {
      return `${label}${HASH_DELIMITER}${StateNode.getChild(label).getProofHash()}`;
    }, '').join(HASH_DELIMITER);
  }
  return ChainUtil.hashString(ChainUtil.toString(preimage));
}

function setProofHashForStateTree(stateTree) {
  if (!stateTree.getIsLeaf()) {
    stateTree.getChildNodes().forEach(node => {
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
  if (idx < 0 || idx >= path.length) {
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
  hasReservedChar,
  isValidPathForStates,
  isValidJsObjectForStates,
  jsObjectToStateTree,
  stateTreeToJsObject,
  deleteStateTree,
  makeCopyOfStateTree,
  buildProofHashOfStateNode,
  setProofHashForStateTree,
  updateProofHashForPath,
}