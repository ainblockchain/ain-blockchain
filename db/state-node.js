const logger = require('../logger')('STATE_NODE');

class StateNode {
  constructor(version) {
    this.isLeaf = true;
    // Used for internal nodes only.
    this.childMap = new Map();
    // Used for leaf nodes only.
    this.value = null;
    this.proofHash = null;
    this.version = version ? version : null;
    this.numRef = 0;
    this.treeSize = 1;
  }

  static _create(version, isLeaf, childMap, value, proofHash, treeSize) {
    const node = new StateNode(version);
    node.setIsLeaf(isLeaf);
    node.childMap = new Map(childMap);
    node.setValue(value);
    node.setProofHash(proofHash);
    node.setTreeSize(treeSize);
    return node;
  }

  clone(version) {
    const clonedNode = StateNode._create(version ? version : this.version,
        this.isLeaf, this.childMap, this.value, this.proofHash, this.treeSize);
    this.getChildNodes().forEach((child) => {
      child.increaseNumRef();
    });
    return clonedNode;
  }

  getIsLeaf() {
    return this.isLeaf;
  }

  setIsLeaf(isLeaf) {
    this.isLeaf = isLeaf;
  }

  getValue() {
    return this.value;
  }

  setValue(value) {
    this.value = value;
  }

  resetValue() {
    this.setValue(null);
  }

  getChild(label) {
    const child = this.childMap.get(label);
    if (child === undefined) {
      return null;
    }
    return child;
  }

  setChild(label, stateNode) {
    if (this.hasChild(label)) {
      if (this.getChild(label) === stateNode) {
        // Does nothing.
        return;
      }
      const child = this.getChild(label);
      child.decreaseNumRef();
    }
    this.childMap.set(label, stateNode);
    stateNode.increaseNumRef();
    if (this.getIsLeaf()) {
      this.setIsLeaf(false);
    }
  }

  hasChild(label) {
    return this.childMap.has(label);
  }

  deleteChild(label) {
    if (this.hasChild(label)) {
      const child = this.getChild(label);
      child.decreaseNumRef();
      this.childMap.delete(label);
      if (this.numChildren() === 0) {
        this.setIsLeaf(true);
      }
    }
  }

  getChildLabels() {
    return [...this.childMap.keys()];
  }

  getChildNodes() {
    return [...this.childMap.values()];
  }

  numChildren() {
    return this.childMap.size;
  }

  getProofHash() {
    return this.proofHash;
  }

  setProofHash(proofHash) {
    this.proofHash = proofHash;
  }

  resetProofHash() {
    this.setProofHash(null);
  }

  getVersion() {
    return this.version;
  }

  setVersion(version) {
    this.version = version;
  }

  getNumRef() {
    return this.numRef;
  }

  increaseNumRef() {
    this.numRef++;
  }

  decreaseNumRef() {
    const LOG_HEADER = 'decreaseNumRef';
    if (this.numRef > 0) {
      this.numRef--;
    } else {
      // This shouldn't happen.
      logger.error(`[${LOG_HEADER}] Failed to decrease numRef value: ${this.numRef}.`);
    }
  }

  getTreeSize() {
    return this.treeSize;
  }

  setTreeSize(treeSize) {
    this.treeSize = treeSize;
  }
}

module.exports = StateNode;
