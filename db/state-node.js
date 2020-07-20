const logger = require('../logger');

class StateNode {
  constructor() {
    // Used for internal nodes only.
    this.childMap = new Map();
    // Used for leaf nodes only.
    this.value = null;
  }

  setValue(value) {
    this.value = value;
  }

  getValue() {
    return this.value;
  }

  setChild(key, stateNode) {
    this.childMap.set(key, stateNode);
  }

  getChild(key) {
    return this.childMap.get(key);
  }

  deleteChild(key) {
    return this.childMap.delete(key);
  }
}

module.exports = StateNode;