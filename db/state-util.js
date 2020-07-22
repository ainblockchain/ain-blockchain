const StateNode = require('./state-node');
const ChainUtil = require('../chain-util');

function isValidStateObject(obj) {
  // TODO(seo): Implement this.
  return true;
}

function convertToStateTree(obj) {
  const state = new StateNode();
  if (ChainUtil.isDict(obj)) {
    for (const childKey in obj) {
      const childValue = obj[child];
      state.setChild(childKey, convertToStateTree(childValue));
    }
  } else {
    state.setValue(obj);
  }
  return state;
}

function convertFromStateTree(root) {
  if (root.isLeafNode()) {
    return root.getValue();
  }
  const obj = {};
  for (const label of root.getChildLabels()) {
    const node = root.getChild(label);
    obj[label] = convertFromStateTree(node);
  }
  return obj;
}

module.exports = {
  isValidStateObject,
  convertToStateTree,
  convertFromStateTree,
}