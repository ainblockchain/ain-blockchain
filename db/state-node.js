class StateNode {
  constructor(version) {
    this.isLeaf = true;
    // Used for internal nodes only.
    this.childMap = new Map();
    // Used for leaf nodes only.
    this.value = null;
    this.proofHash = null;
    this.version = version ? version : null;
  }

  static _create(isLeaf, childMap, value, proofHash, version) {
    const node = new StateNode();
    node.setIsLeaf(isLeaf);
    node.childMap = new Map(childMap);
    node.setValue(value);
    node.setProofHash(proofHash);
    node.setVersion(version);
    return node;
  }

  clone(version) {
    return StateNode._create(
        this.isLeaf, this.childMap, this.value, this.proofHash,
        version ? version : this.version);
  }

  reset() {
    this.setIsLeaf(true);
    this.childMap.clear();
    this.resetValue();
    this.setProofHash(null);
    this.setVersion(null);
  }

  getIsLeaf() {
    return this.isLeaf;
  }

  setIsLeaf(isLeaf) {
    this.isLeaf = isLeaf;
  }

  resetValue() {
    this.setValue(null);
  }

  setValue(value) {
    this.value = value;
  }

  getValue() {
    return this.value;
  }

  setChild(label, stateNode) {
    this.childMap.set(label, stateNode);
    if (this.getIsLeaf()) {
      this.setIsLeaf(false);
    }
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
    this.childMap.delete(label);
    if (this.numChildren() === 0) {
      this.setIsLeaf(true);
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

  setVersion(version) {
    return this.version = version;
  }

  getVersion() {
    return this.version;
  }
}

module.exports = StateNode;
