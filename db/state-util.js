const StateNode = require('./state-node');
const ChainUtil = require('../chain-util');

function isValidStateObject(obj) {
  if (ChainUtil.isDict(obj)) {
    for (const key in obj) {
      const childObj = obj[key];
      const isValidChild = isValidStateObject(childObj);
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

function convertToStateTree(obj) {
  const node = new StateNode();
  if (ChainUtil.isDict(obj)) {
    if (ChainUtil.isEmptyNode(obj)) {
      node.setIsLeaf(true);
    } else {
      for (const key in obj) {
        const childObj = obj[key];
        node.setChild(key, convertToStateTree(childObj));
      }
    }
  } else {
    node.setValue(obj);
  }
  return node;
}

function convertFromStateTree(root) {
  if (root === null) {
    return null;
  }
  if (root.getIsLeaf()) {
    return root.getValue();
  }
  const obj = {};
  for (const label of root.getChildLabels()) {
    const childNode = root.getChild(label);
    obj[label] = convertFromStateTree(childNode);
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
  isValidStateObject,
  convertToStateTree,
  convertFromStateTree,
  deleteStateTree,
  makeCopyOfStateTree,
}