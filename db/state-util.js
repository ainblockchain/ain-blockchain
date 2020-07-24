const StateNode = require('./state-node');
const ChainUtil = require('../chain-util');

function isValidJsObjectForState(obj) {
  if (ChainUtil.isDict(obj)) {
    if (ChainUtil.isEmptyNode(obj)) {
      return false;
    }
    for (const key in obj) {
      const childObj = obj[key];
      const isValidChild = isValidJsObjectForState(childObj);
      if (!isValidChild) {
        return false;
      }
    }
    return true;
  } else {
    return ChainUtil.isBool(obj) || ChainUtil.isNumber(obj) || ChainUtil.isString(obj) ||
        obj === null;
  }
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

module.exports = {
  isValidJsObjectForState,
  jsObjectToStateTree,
  stateTreeToJsObject,
  deleteStateTree,
  makeCopyOfStateTree,
}