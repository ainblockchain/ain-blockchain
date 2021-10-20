const logger = require('../logger')('STATE_NODE');

const sizeof = require('object-sizeof');
const CommonUtil = require('../common/common-util');
const {
  FeatureFlags,
  LIGHTWEIGHT,
  HASH_DELIMITER,
  StateInfoProperties,
} = require('../common/constants');
const RadixTree = require('./radix-tree');

class StateNode {
  constructor(version = null) {
    this.version = version;
    this.label = null;
    this.isLeaf = true;
    // Used for leaf nodes only.
    this.value = null;
    this.parentRadixNodeSet = new Set();
    this.parentSet = new Set();
    // Used for internal nodes only.
    this.radixTree = new RadixTree(version, this);
    this.proofHash = null;
    this.treeHeight = 0;
    this.treeSize = 0;
    this.treeBytes = 0;
  }

  reset() {
    this.setVersion(null);
    this.resetLabel();
    this.setIsLeaf(true);
    this.resetValue();
    this.parentRadixNodeSet.clear();
    this.parentSet.clear();
    this.deleteRadixTreeVersion();
    this.setProofHash(null);
    this.setTreeHeight(0);
    this.setTreeSize(0);
    this.setTreeBytes(0);
  }

  static _create(
      version, label, isLeaf, value, proofHash, treeHeight, treeSize, treeBytes) {
    const node = new StateNode(version);
    node.setLabel(label);
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
        this.isLeaf, this.value, this.proofHash, this.treeHeight,
        this.treeSize, this.treeBytes);
    if (!this.getIsLeaf()) {
      cloned.radixTree = this.radixTree.clone(version, cloned);
    }
    return cloned;
  }

  // NOTE(liayoo): Bytes for some data (e.g. parents & children references, version) are excluded
  // from this calculation, since their sizes can vary and affect the gas costs and
  // state proof hashes.
  // 4(isLeaf) + 132(proofHash) + 8(treeHeight) + 8(treeSize) + 8(treeBytes) = 160
  computeNodeBytes() {
    return sizeof(this.value) + 160;
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
    const includeVersion = options && options.includeVersion;
    const includeProof = options && options.includeProof;
    const includeTreeInfo = options && options.includeTreeInfo;
    if (this.getIsLeaf()) {
      return this.getValue();
    }
    const obj = {};
    for (const label of this.getChildLabels()) {
      const childNode = this.getChild(label);
      obj[label] = (isShallow && !childNode.getIsLeaf()) ?
          { [`${StateInfoProperties.STATE_PROOF_HASH}`]: childNode.getProofHash() } :
          childNode.toJsObject(options);
      if (childNode.getIsLeaf()) {
        if (includeVersion) {
          obj[`${StateInfoProperties.VERSION}:${label}`] = childNode.getVersion();
        }
        if (includeProof) {
          obj[`${StateInfoProperties.STATE_PROOF_HASH}:${label}`] = childNode.getProofHash();
        }
        if (includeTreeInfo) {
          obj[`${StateInfoProperties.NUM_PARENTS}:${label}`] = childNode.numParents();
          obj[`${StateInfoProperties.TREE_HEIGHT}:${label}`] = childNode.getTreeHeight();
          obj[`${StateInfoProperties.TREE_SIZE}:${label}`] = childNode.getTreeSize();
          obj[`${StateInfoProperties.TREE_BYTES}:${label}`] = childNode.getTreeBytes();
        }
      }
    }
    if (includeVersion) {
      obj[`${StateInfoProperties.VERSION}`] = this.getVersion();
    }
    if (includeProof) {
      obj[`${StateInfoProperties.STATE_PROOF_HASH}`] = this.getProofHash();
    }
    if (includeTreeInfo) {
      obj[`${StateInfoProperties.NUM_PARENTS}`] = this.numParents();
      obj[`${StateInfoProperties.TREE_HEIGHT}`] = this.getTreeHeight();
      obj[`${StateInfoProperties.TREE_SIZE}`] = this.getTreeSize();
      obj[`${StateInfoProperties.TREE_BYTES}`] = this.getTreeBytes();
    }

    return obj;
  }

  getLabel() {
    return this.label;
  }

  hasLabel() {
    return this.getLabel() !== null;
  }

  setLabel(label) {
    this.label = label;
  }

  resetLabel() {
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

  addParentRadixNode(parentRadixNode) {
    const LOG_HEADER = 'addParentRadixNode';
    if (this.hasParentRadixNode(parentRadixNode)) {
      logger.error(
          `[${LOG_HEADER}] Adding an existing parent radix node of label: ` +
          `${parentRadixNode.getLabel()} at: ${new Error().stack}.`);
      // Does nothing.
      return;
    }
    this.parentRadixNodeSet.add(parentRadixNode);
  }

  hasParentRadixNode(parentRadixNode) {
    return this.parentRadixNodeSet.has(parentRadixNode);
  }

  deleteParentRadixNode(parentRadixNode) {
    const LOG_HEADER = 'deleteParentRadixNode';
    if (!this.parentRadixNodeSet.has(parentRadixNode)) {
      logger.error(
          `[${LOG_HEADER}] Deleting a non-existing parent radix node of label: ` +
          `${parentRadixNode.getLabel()} at: ${new Error().stack}.`);
      // Does nothing.
      return;
    }
    this.parentRadixNodeSet.delete(parentRadixNode);
  }

  getParentRadixNodes() {
    return Array.from(this.parentRadixNodeSet);
  }

  numParentRadixNodes() {
    return this.parentRadixNodeSet.size;
  }

  _hasAtLeastOneParentRadixNode() {
    return this.parentRadixNodeSet.size > 0;
  }

  _hasMultipleParentStateNodes() {
    if (this.numParentRadixNodes() === 0) {
      return false;
    }
    if (this.numParentRadixNodes() > 1) {
      return true;
    }
    const theOnlyParentRadixNode = this.getParentRadixNodes()[0];
    return RadixTree.hasMultipleParentStateNodes(theOnlyParentRadixNode);
  }

  addParent(parent) {
    const LOG_HEADER = 'addParent';
    if (this.hasParent(parent)) {
      logger.error(
          `[${LOG_HEADER}] Adding an existing parent of label: ${parent.getLabel()} ` +
          `at: ${new Error().stack}.`);
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
          `[${LOG_HEADER}] Deleting a non-existing parent of label: ${parent.getLabel()} ` +
          `at: ${new Error().stack}.`);
      // Does nothing.
      return;
    }
    this.parentSet.delete(parent);
  }

  getParentNodes() {
    return RadixTree.getParentStateNodes(this.getParentRadixNodes())
  }

  hasAtLeastOneParent() {
    return this._hasAtLeastOneParentRadixNode();
  }

  hasMultipleParents() {
    return this._hasMultipleParentStateNodes();
  }

  numParents() {
    const parentNodes = this.getParentNodes();
    return parentNodes.length;
  }

  getChild(label) {
    const child = this.radixTree.get(label);
    if (child === undefined) {
      return null;
    }
    return child;
  }

  setChild(label, node) {
    const LOG_HEADER = 'setChild';
    const child = this.getChild(label);
    if (child !== null) {
      if (child === node) {
        logger.error(
            `[${LOG_HEADER}] Setting a child with label ${label} which is already a child ` +
            `at: ${new Error().stack}.`);
        // Does nothing.
        return;
      }
    }
    this.radixTree.set(label, node);
    node.setLabel(label);
    if (this.getIsLeaf()) {
      this.setIsLeaf(false);
    }
  }

  deleteChild(label, shouldUpdateStateInfo = false) {
    const LOG_HEADER = 'deleteChild';
    const child = this.getChild(label);
    if (child === null) {
      logger.error(
          `[${LOG_HEADER}] Deleting a non-existing child with label: ${label} ` +
          `at: ${new Error().stack}.`);
      // Does nothing.
      return;
    }
    this.radixTree.delete(label, shouldUpdateStateInfo);  // with shouldUpdateStateInfo
    if (shouldUpdateStateInfo) {
      this.updateStateInfo(null, false);  // shouldRebuildRadixInfo = false
    }
    if (!this.hasChildren()) {
      this.setIsLeaf(true);
    }
  }

  getChildLabels() {
    return [...this.radixTree.getChildStateLabels()];
  }

  getChildNodes() {
    return [...this.radixTree.getChildStateNodes()];
  }

  hasChildren() {
    return this.radixTree.hasChildStateNodes();
  }

  numChildren() {
    return this.radixTree.numChildStateNodes();
  }

  getProofHash() {
    return this.proofHash;
  }

  setProofHash(proofHash) {
    this.proofHash = proofHash;
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
   * @param {boolean} shouldRebuildRadixInfo rebuild radix info
   */
  // NOTE(platfowner): This function changes proof hashes of the radix tree.
  buildStateInfo(updatedChildLabel = null, shouldRebuildRadixInfo = true) {
    const nodeBytes = this.computeNodeBytes();
    if (this.getIsLeaf()) {
      const proofHash = LIGHTWEIGHT ?
          '' : CommonUtil.hashString(CommonUtil.toString(this.getValue()));
      return {
        proofHash,
        treeHeight: 0,
        treeSize: 1,
        treeBytes: nodeBytes
      };
    } else {
      if (shouldRebuildRadixInfo) {
        if (updatedChildLabel === null) {
          this.radixTree.updateRadixInfoForRadixTree();
        } else {
          this.radixTree.updateRadixInfoForAllRootPaths(updatedChildLabel);
        }
      }
      return {
        proofHash: this.radixTree.getRootProofHash(),
        treeHeight: 1 + this.radixTree.getRootTreeHeight(),
        treeSize: 1 + this.radixTree.getRootTreeSize(),
        treeBytes: nodeBytes + this.radixTree.getRootTreeBytes()
      };
    }
  }

  updateStateInfo(updatedChildLabel = null, shouldRebuildRadixInfo = true) {
    const treeInfo = this.buildStateInfo(updatedChildLabel, shouldRebuildRadixInfo);
    this.setProofHash(treeInfo.proofHash);
    this.setTreeHeight(treeInfo.treeHeight);
    this.setTreeSize(treeInfo.treeSize);
    this.setTreeBytes(treeInfo.treeBytes);
  }

  verifyStateInfo(updatedChildLabel = null) {
    const treeInfo = this.buildStateInfo(updatedChildLabel, true);
    return this.getProofHash() === treeInfo.proofHash &&
        this.getTreeHeight() === treeInfo.treeHeight &&
        this.getTreeSize() === treeInfo.treeSize &&
        this.getTreeBytes() === treeInfo.treeBytes;
  }

  getProofOfStateNode(childLabel = null, childProof = null) {
    if (childLabel === null) {
      return {
        [StateInfoProperties.STATE_PROOF_HASH]: this.getProofHash()
      };
    } else {
      return this.radixTree.getProofOfStateNode(childLabel, childProof);
    }
  }

  deleteRadixTreeVersion() {
    return this.radixTree.deleteRadixTreeVersion();
  }
}

module.exports = StateNode;
