class StateNode {
  constructor() {
    // Used for internal nodes only.
    this.childMap = new Map();
    // Used for leaf nodes only.
    this.value = null;
  }

  static create(childMap, value) {
    const node = new StateNode();
    node.childMap = new Map(childMap);
    node.value = value;
    return node;
  }

  makeCopy() {
    return StateNode.create(this.childMap, this.value);
  }

  setValue(value) {
    this.value = value;
  }

  getValue() {
    return this.value;
  }

  setChild(label, stateNode) {
    this.childMap.set(label, stateNode);
  }

  getChild(label) {
    const child = this.childMap.get(label);
    if (child === undefined) {
      return null;
    }
    return child;
  }

  hasChild(label) {
    return this.childMap.has(label);
  }

  deleteChild(label) {
    return this.childMap.delete(label);
  }

  getChildLabels() {
    const labels = [];
    for (let [key, value] of this.childMap) {
      labels.push(key);
    }
    return labels;
  }

  getChildNodes() {
    const nodes = [];
    for (let [key, value] of this.childMap) {
      nodes.push(value);
    }
    return nodes;
  }

  getNumChild() {
    return this.childMap.size;
  }

  isLeafNode() {
    return this.getNumChild() === 0;
  }

  getProofHash() {
    // TODO(minsu): Implement this.
  }

  setProofHash() {
    // TODO(minsu): Implement this.
  }
}

module.exports = StateNode;