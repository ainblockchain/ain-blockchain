const logger = require('../logger')('STATE_NODE');

const sizeof = require('object-sizeof');
const CommonUtil = require('../common/common-util');
const {
  HASH_DELIMITER,
  JS_REF_SIZE_IN_BYTES,
  StateInfoProperties,
} = require('../common/constants');

class StateNode {
  // NOTE(seo): Once new member variables are added, computeNodeBytes() should be updated.
  constructor(version) {
    this.version = version || null;
    this.isLeaf = true;
    this.parentSet = new Set();
    // Used for internal nodes only.
    this.childMap = new Map();
    // Used for leaf nodes only.
    this.value = null;
    this.proofHash = null;
    this.treeHeight = 0;
    this.treeSize = 0;
    this.treeBytes = 0;
  }

  static _create(version, isLeaf, value, proofHash, treeHeight, treeSize, treeBytes) {
    const node = new StateNode(version);
    node.setIsLeaf(isLeaf);
    node.setValue(value);
    node.setProofHash(proofHash);
    node.setTreeHeight(treeHeight);
    node.setTreeSize(treeSize);
    node.setTreeBytes(treeBytes);
    return node;
  }

  clone(version) {
    const cloned = StateNode._create(version ? version : this.version,
        this.isLeaf, this.value, this.proofHash, this.treeHeight, this.treeSize, this.treeBytes);
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
        that.treeHeight === this.treeHeight &&
        that.treeSize === this.treeSize &&
        that.treeBytes === this.treeBytes);
  }

  computeNodeBytes() {
    return sizeof(this.isLeaf) +
        sizeof(this.value) +
        sizeof(this.proofHash) +
        sizeof(this.treeHeight) +
        sizeof(this.treeSize) +
        sizeof(this.treeBytes) +
        (this.numParents() + this.numChildren()) * JS_REF_SIZE_IN_BYTES;
  }

  static fromJsObject(obj, version) {
    const node = new StateNode(version);
    if (CommonUtil.isDict(obj)) {
      if (!CommonUtil.isEmpty(obj)) {
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

  toJsObject(options) {
    const isShallow = options && options.isShallow;
    const includeTreeInfo = options && options.includeTreeInfo;
    const includeProof = options && options.includeProof;
    const includeVersion = options && options.includeVersion;
    if (this.getIsLeaf()) {
      return this.getValue();
    }
    const obj = {};
    for (const label of this.getChildLabels()) {
      const childNode = this.getChild(label);
      obj[label] = isShallow ? true : childNode.toJsObject(options);
      if (childNode.getIsLeaf()) {
        if (includeTreeInfo) {
          obj[`.${StateInfoProperties.NUM_PARENTS}:${label}`] = childNode.numParents();
          obj[`.${StateInfoProperties.TREE_HEIGHT}:${label}`] = childNode.getTreeHeight();
          obj[`.${StateInfoProperties.TREE_SIZE}:${label}`] = childNode.getTreeSize();
          obj[`.${StateInfoProperties.TREE_BYTES}:${label}`] = childNode.getTreeBytes();
        }
        if (includeProof) {
          obj[`.${StateInfoProperties.PROOF_HASH}:${label}`] = childNode.getProofHash();
        }
        if (includeVersion) {
          obj[`.${StateInfoProperties.VERSION}:${label}`] = childNode.getVersion();
        }
      }
    }
    if (includeTreeInfo) {
      obj[`.${StateInfoProperties.NUM_PARENTS}`] = this.numParents();
      obj[`.${StateInfoProperties.TREE_HEIGHT}`] = this.getTreeHeight();
      obj[`.${StateInfoProperties.TREE_SIZE}`] = this.getTreeSize();
      obj[`.${StateInfoProperties.TREE_BYTES}`] = this.getTreeBytes();
    }
    if (includeProof) {
      obj[`.${StateInfoProperties.PROOF_HASH}`] = this.getProofHash();
    }
    if (includeVersion) {
      obj[`.${StateInfoProperties.VERSION}`] = this.getVersion();
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
      // NOTE(platfowner): Use _deleteParent() instead of deleteChild()
      //                   to keep the order of children.
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

  getTreeHeight() {
    return this.treeHeight;
  }

  setTreeHeight(treeHeight) {
    this.treeHeight = treeHeight;
  }

  getTreeSize() {
    return this.treeSize;
  }

  setTreeSize(treeSize) {
    this.treeSize = treeSize;
  }

  getTreeBytes() {
    return this.treeBytes;
  }

  setTreeBytes(treeBytes) {
    this.treeBytes = treeBytes;
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
    return CommonUtil.hashString(CommonUtil.toString(preimage));
  }

  verifyProofHash() {
    return this.getProofHash() === this.buildProofHash();
  }

  computeTreeHeight() {
    if (this.getIsLeaf()) {
      return 0;
    } else {
      return this.getChildNodes().reduce(
          (max, cur) => Math.max(max, CommonUtil.numberOrZero(cur.getTreeHeight()) + 1), 0);
    }
  }

  computeTreeSize() {
    if (this.getIsLeaf()) {
      return 1;
    } else {
      return this.getChildNodes().reduce(
          (acc, cur) => acc + CommonUtil.numberOrZero(cur.getTreeSize()), 1);
    }
  }

  computeTreeBytes() {
    if (this.getIsLeaf()) {
      return this.computeNodeBytes();
    } else {
      return this.getChildLabels().reduce((acc, label) => {
        const child = this.getChild(label);
        return acc + sizeof(label) + CommonUtil.numberOrZero(child.getTreeBytes());
      }, this.computeNodeBytes());
    }
  }

  updateProofHashAndStateInfo() {
    this.setProofHash(this.buildProofHash());
    this.setTreeHeight(this.computeTreeHeight());
    this.setTreeSize(this.computeTreeSize());
    this.setTreeBytes(this.computeTreeBytes());
  }
}

module.exports = StateNode;
