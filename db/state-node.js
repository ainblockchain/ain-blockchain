const logger = require('../logger')('STATE_NODE');

const sizeof = require('object-sizeof');
const CommonUtil = require('../common/common-util');
const {
  FeatureFlags,
  HASH_DELIMITER,
  StateInfoProperties,
  ProofProperties,
} = require('../common/constants');
const RadixTree = require('./radix-tree');

class StateNode {
  // NOTE(seo): Once new member variables are added, computeNodeBytes() should be updated.
  constructor(version) {
    this.version = version || null;
    this.label = null;
    this.isLeaf = true;
    // Used for leaf nodes only.
    this.value = null;
    this.parentSet = new Set();
    // Used for internal nodes only.
    if (FeatureFlags.enableRadixTreeLayers) {
      this.radixTree = new RadixTree();
    } else {
      this.childMap = new Map();
    }
    this.proofHash = null;
    this.treeHeight = 0;
    this.treeSize = 0;
    this.treeBytes = 0;
  }

  static _create(version, label, isLeaf, value, proofHash, treeHeight, treeSize, treeBytes) {
    const node = new StateNode(version);
    node._setLabel(label);
    node.setIsLeaf(isLeaf);
    node.setValue(value);
    node.setProofHash(proofHash);
    node.setTreeHeight(treeHeight);
    node.setTreeSize(treeSize);
    node.setTreeBytes(treeBytes);
    return node;
  }

  clone(version) {
    const cloned = StateNode._create(version ? version : this.version, this.label,
        this.isLeaf, this.value, this.proofHash, this.treeHeight, this.treeSize, this.treeBytes);
    if (FeatureFlags.enableRadixTreeLayers) {
      cloned.copyRadixTreeFrom(this, cloned);
    } else {
      for (const label of this.getChildLabels()) {
        const child = this.getChild(label);
        cloned.setChild(label, child);
      }
    }
    return cloned;
  }

  copyRadixTreeFrom(stateNode, newParentStateNode) {
    this.radixTree.copyFrom(stateNode.radixTree, newParentStateNode);
  }

  equal(that) {
    if (!that) {
      return false;
    }
    return (that.version === this.version &&
        that.label === this.label &&
        that.isLeaf === this.isLeaf &&
        that.value === this.value &&
        that.numParents && typeof that.numParents === 'function' &&
        // NOTE: Compare only numParents() values.
        that.numParents() === this.numParents() &&
        that.getChildLabels && typeof that.getChildLabels === 'function' &&
        // NOTE: The child label order matters.
        JSON.stringify(that.getChildLabels()) === JSON.stringify(this.getChildLabels()) &&
        that.proofHash === this.proofHash &&
        that.treeHeight === this.treeHeight &&
        that.treeSize === this.treeSize &&
        that.treeBytes === this.treeBytes);
  }

  // NOTE(liayoo): Bytes for some data (e.g. parents & children references, version) are excluded
  // from this calculation, since their sizes can vary and affect the gas costs and
  // state proof hashes.
  computeNodeBytes() {
    return sizeof(this.isLeaf) +
        sizeof(this.value) +
        sizeof(this.proofHash) +
        sizeof(this.treeHeight) +
        sizeof(this.treeSize) +
        sizeof(this.treeBytes);
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

  getLabel() {
    return this.label;
  }

  hasLabel() {
    return this.getLabel() !== null;
  }

  _setLabel(label) {
    const LOG_HEADER = '_setLabel';

    const curLabel = this.getLabel();
    if (curLabel !== null && curLabel !== label) {
      logger.error(
          `[${LOG_HEADER}] Overwriting label ${curLabel} with ${label} at: ${new Error().stack}.`);
    }
    this.label = label;
  }

  _resetLabel() {
    this.label = null;
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
    if (this._hasParent(parent)) {
      logger.error(
          `[${LOG_HEADER}] Adding an existing parent of label: ${parent.getLabel()} ` +
          `at: ${new Error().stack}.`);
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
          `[${LOG_HEADER}] Deleting a non-existing parent of label: ${parent.getLabel()} ` +
          `at: ${new Error().stack}.`);
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
    let child;
    if (FeatureFlags.enableRadixTreeLayers) {
      child = this.radixTree.get(label);
    } else {
      child = this.childMap.get(label);
    }
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
            `[${LOG_HEADER}] Setting a child with label ${label} which is already a child ` +
            `at: ${new Error().stack}.`);
        // Does nothing.
        return;
      }
      // NOTE(platfowner): Use _deleteParent() instead of deleteChild()
      //                   to keep the order of children.
      child._deleteParent(this);
    }
    if (FeatureFlags.enableRadixTreeLayers) {
      this.radixTree.set(label, node);
    } else {
      this.childMap.set(label, node);
    }
    node.addParent(this);
    node._setLabel(label);
    if (this.getIsLeaf()) {
      this.setIsLeaf(false);
    }
  }

  hasChild(label) {
    if (FeatureFlags.enableRadixTreeLayers) {
      return this.radixTree.has(label);
    } else {
      return this.childMap.has(label);
    }
  }

  deleteChild(label) {
    const LOG_HEADER = 'deleteChild';
    if (!this.hasChild(label)) {
      logger.error(
          `[${LOG_HEADER}] Deleting a non-existing child with label: ${label} ` +
          `at: ${new Error().stack}.`);
      // Does nothing.
      return;
    }
    const child = this.getChild(label);
    child._deleteParent(this);
    if (FeatureFlags.enableRadixTreeLayers) {
      this.radixTree.delete(label);
    } else {
      this.childMap.delete(label);
    }
    if (this.numChildren() === 0) {
      this.setIsLeaf(true);
    }
  }

  getChildLabels() {
    if (FeatureFlags.enableRadixTreeLayers) {
      return [...this.radixTree.labels()];
    } else {
      return [...this.childMap.keys()];
    }
  }

  getChildNodes() {
    if (FeatureFlags.enableRadixTreeLayers) {
      return [...this.radixTree.stateNodes()];
    } else {
      return [...this.childMap.values()];
    }
  }

  numChildren() {
    if (FeatureFlags.enableRadixTreeLayers) {
      return this.radixTree.size();
    } else {
      return this.childMap.size;
    }
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

  /**
   * Returns newly buildt proof hash. If updatedChildLabel is given, it signifies that
   * only the child of the given child label among the children is not up-to-date now,
   * so only the proof hashes of the radix nodes related to the given child label
   * need to be updated, and this function does so.
   * 
   * @param {string} updatedChildLabel label of the child whose proof hash is not up-to-date
   */
  // NOTE(platfowner): This function changes proof hashes of the radix tree.
  buildProofHash(updatedChildLabel = null) {
    let preimage;
    if (this.getIsLeaf()) {
      preimage = this.getValue();
    } else {
      if (FeatureFlags.enableRadixTreeLayers) {
        if (updatedChildLabel === null) {
          this.radixTree.updateProofHashForRadixTree();
        } else {
          this.radixTree.updateProofHashForRadixPath(updatedChildLabel);
        }
        return this.radixTree.getRootProofHash();
      } else {
        preimage = this.getChildLabels().map((label) => {
          return `${label}${HASH_DELIMITER}${this.getChild(label).getProofHash()}`;
        }).join(HASH_DELIMITER);
      }
    }
    return CommonUtil.hashString(CommonUtil.toString(preimage));
  }

  verifyProofHash(updatedChildLabel = null) {
    return this.getProofHash() === this.buildProofHash(updatedChildLabel);
  }

  getProofOfState(childLabel = null, childProof = null) {
    if (childLabel === null) {
      return { [ProofProperties.PROOF_HASH]: this.getProofHash() };
    } else {
      if (FeatureFlags.enableRadixTreeLayers) {
        return this.radixTree.getProofOfState(childLabel, childProof);
      } else {
        const proof = { [ProofProperties.PROOF_HASH]: this.getProofHash() };
        this.getChildLabels().forEach((label) => {
          const child = this.getChild(label);
          Object.assign(proof, {
            [label]: label === childLabel ? childProof : {
              [ProofProperties.PROOF_HASH]: child.getProofHash()
            }
          });
        });
        return proof;
      }
    }
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

  updateStateInfo(updatedChildLabel = null) {
    this.setProofHash(this.buildProofHash(updatedChildLabel));
    this.setTreeHeight(this.computeTreeHeight());
    this.setTreeSize(this.computeTreeSize());
    this.setTreeBytes(this.computeTreeBytes());
  }
}

module.exports = StateNode;
