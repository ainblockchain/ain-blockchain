const logger = require('../logger')('STATE_NODE');

const ChainUtil = require('../common/chain-util');
const { HASH_DELIMITER } = require('../common/constants');

class StateNode {
  constructor(version) {
    this.version = version || null;
    this.isLeaf = true;
    this.parentSet = new Set();
    // Used for internal nodes only.
    this.childMap = new Map();
    // Used for leaf nodes only.
    this.value = null;
    this.proofHash = null;
    this.treeDepth = 1;
    this.treeSize = 1;
  }

  static _create(version, isLeaf, value, proofHash, treeDepth, treeSize) {
    const node = new StateNode(version);
    node.setIsLeaf(isLeaf);
    node.setValue(value);
    node.setProofHash(proofHash);
    node.setTreeDepth(treeDepth);
    node.setTreeSize(treeSize);
    return node;
  }

  clone(version) {
    const cloned = StateNode._create(version ? version : this.version,
        this.isLeaf, this.value, this.proofHash, this.treeDepth, this.treeSize);
    for (const label of this.getChildLabels()) {
      const child = this.getChild(label);
      cloned.setChild(label, child);
    }
    return cloned;
  }

  equal(that) {
    if (!that) {
      return false;
    }
    return (that.isLeaf === this.isLeaf &&
        that.numParents && typeof that.numParents === 'function' &&
        // NOTE: Compare only numParents() values.
        that.numParents() === this.numParents() &&
        that.getChildLabels && typeof that.getChildLabels === 'function' &&
        // NOTE: The child label order matters.
        JSON.stringify(that.getChildLabels()) === JSON.stringify(this.getChildLabels()) &&
        that.value === this.value &&
        that.proofHash === this.proofHash &&
        that.version === this.version &&
        that.treeDepth === this.treeDepth &&
        that.treeSize === this.treeSize);
  }

  static fromJsObject(obj, version) {
    const node = new StateNode(version);
    if (ChainUtil.isDict(obj)) {
      if (!ChainUtil.isEmpty(obj)) {
        for (const key in obj) {
          const childObj = obj[key];
          node.setChild(key, StateNode.fromJsObject(childObj, version));
        }
      }
    } else {
      node.setValue(obj);
    }
    return node;
  }

  toJsObject(withDetails) {
    if (this.getIsLeaf()) {
      return this.getValue();
    }
    const obj = {};
    for (const label of this.getChildLabels()) {
      const childNode = this.getChild(label);
      obj[label] = childNode.toJsObject(withDetails);
      if (childNode.getIsLeaf()) {
        if (withDetails) {
          obj[`.version:${label}`] = childNode.getVersion();
          obj[`.numParents:${label}`] = childNode.numParents();
          obj[`.proofHash:${label}`] = childNode.getProofHash();
          obj[`.treeDepth:${label}`] = childNode.getTreeDepth();
          obj[`.treeSize:${label}`] = childNode.getTreeSize();
        }
      }
    }
    if (withDetails) {
      obj['.version'] = this.getVersion();
      obj['.numParents'] = this.numParents();
      obj[`.proofHash`] = this.getProofHash();
      obj[`.treeDepth`] = this.getTreeDepth();
      obj[`.treeSize`] = this.getTreeSize();
    }

    return obj;
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

  _addParent(parent) {
    const LOG_HEADER = 'addParent';
    if (this._hasParent(parent)) {
      logger.error(
          `[${LOG_HEADER}] Adding an existing parent: ${JSON.stringify(parent, null, 2)}.`);
      // Does nothing.
      return;
    }
    this.parentSet.add(parent);
  }

  _hasParent(parent) {
    return this.parentSet.has(parent);
  }

  _deleteParent(parent) {
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

  numParents() {
    return this.parentSet.size;
  }

  getChild(label) {
    const child = this.childMap.get(label);
    if (child === undefined) {
      return null;
    }
    return child;
  }

  setChild(label, node) {
    const LOG_HEADER = 'setChild';
    if (this.hasChild(label)) {
      const child = this.getChild(label);
      if (child === node) {
        logger.error(
            `[${LOG_HEADER}] Setting a child with label ${label} which is already a child.`);
        // Does nothing.
        return;
      }
      // NOTE(seo): Use _deleteParent() instead of deleteChild() to keep the order of children.
      child._deleteParent(this);
    }
    this.childMap.set(label, node);
    node._addParent(this);
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
    child._deleteParent(this);
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

  getTreeDepth() {
    return this.treeDepth;
  }

  setTreeDepth(treeDepth) {
    this.treeDepth = treeDepth;
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

  verifyProofHash() {
    return this.getProofHash() === this.buildProofHash();
  }

  computeTreeDepth() {
    if (this.getIsLeaf()) {
      return 1;
    } else {
      return 1 + this.getChildNodes().reduce((max, cur) => Math.max(max, cur.getTreeDepth()), 0);
    }
  }

  computeTreeSize() {
    if (this.getIsLeaf()) {
      return 1;
    } else {
      return this.getChildNodes().reduce((acc, cur) => acc + cur.getTreeSize(), 1);
    }
  }

  updateProofHashAndTreeInfo() {
    this.setProofHash(this.buildProofHash());
    this.setTreeDepth(this.computeTreeDepth());
    this.setTreeSize(this.computeTreeSize());
  }
}

module.exports = StateNode;
