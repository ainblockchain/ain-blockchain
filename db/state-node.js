const logger = require('../logger')('STATE_NODE');

const ChainUtil = require('../chain-util');
const { HASH_DELIMITER } = require('../constants');

class StateNode {
  constructor(version) {
    this.isLeaf = true;
    this.parentSet = new Set();
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

  addParent(parent) {
    const LOG_HEADER = 'addParent';
    if (this.parentSet.has(parent)) {
      logger.error(
          `[${LOG_HEADER}] Adding an existing parent: ${JSON.stringify(parent, null, 2)}.`);
      // Does nothing.
      return;
    }
    this.parentSet.add(parent);
  }

  hasParent(parent) {
    return this.parentSet.has(parent);
  }

  deleteParent(parent) {
    const LOG_HEADER = 'deleteParent';
    if (!this.parentSet.has(parent)) {
      logger.error(
          `[${LOG_HEADER}] Deleting a non-existing parent: ${JSON.stringify(parent, null, 2)}.`);
      // Does nothing.
      return;
    }
    this.parentSet.delete(parent);
  }

  getParentNodes() {
    return Array.from(this.parentSet);
  }

  getChild(label) {
    const child = this.childMap.get(label);
    if (child === undefined) {
      return null;
    }
    return child;
  }

  setChild(label, stateNode) {
    const LOG_HEADER = 'setChild';
    if (this.hasChild(label)) {
      if (this.getChild(label) === stateNode) {
        logger.error(
            `[${LOG_HEADER}] Setting a child with label ${label} which is already a child.`);
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
    const LOG_HEADER = 'deleteChild';
    if (!this.hasChild(label)) {
      logger.error(`[${LOG_HEADER}] Deleting a non-existing child with label: ${label}.`);
      // Does nothing.
      return;
    }
    const child = this.getChild(label);
    child.decreaseNumRef();
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

  buildProofHash() {
    let preimage;
    if (this.getIsLeaf()) {
      preimage = this.getValue();
    } else {
      preimage = this.getChildLabels().map((label) => {
        return `${label}${HASH_DELIMITER}${this.getChild(label).getProofHash()}`;
      }, '').join(HASH_DELIMITER);
    }
    return ChainUtil.hashString(ChainUtil.toString(preimage));
  }
  
  computeTreeSize() {
    if (this.getIsLeaf()) {
      return 1;
    } else {
      return this.getChildNodes().reduce((acc, cur) => acc + cur.getTreeSize(), 1);
    }
  }

  updateProofHashAndTreeSize() {
    this.setProofHash(this.buildProofHash());
    this.setTreeSize(this.computeTreeSize());
  }
}

module.exports = StateNode;
