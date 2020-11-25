class StateNode {
  constructor() {
    this.isLeaf = true;
    // Used for internal nodes only.
    this.childMap = new Map();
    // Used for leaf nodes only.
    this.value = null;
    this.proofHash = null;
    this.versionSet = new Set();
  }

  static create(isLeaf, childMap, value, proofHash, versionSet) {
    const node = new StateNode();
    node.isLeaf = isLeaf;
    node.childMap = new Map(childMap);
    node.value = value;
    node.proofHash = proofHash;
    node.versionSet = new Set(versionSet);
    return node;
  }

  clone() {
    return StateNode.create(
        this.isLeaf, this.childMap, this.value, this.proofHash, this.versionSet);
  }

  getIsLeaf() {
    return this.isLeaf;
  }

  setIsLeaf(isLeaf) {
    this.isLeaf = isLeaf;
  }

  resetValue() {
    this.setValue(null);
    this.setIsLeaf(false);
  }

  setValue(value) {
    this.value = value;
    this.setIsLeaf(true);
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
    this.setProofHash(null);
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

  addVersion(version) {
    return this.versionSet.add(version);
  }

  hasVersion(version) {
    return this.versionSet.has(version);
  }

  deleteVersion(version) {
    return this.versionSet.delete(version);
  }

  getVersions() {
    return [...this.versionSet.keys()];
  }

  numVersions() {
    return this.versionSet.size;
  }
}

module.exports = StateNode;
