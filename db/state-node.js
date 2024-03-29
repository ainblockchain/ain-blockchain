const logger = new (require('../logger'))('STATE_NODE');

const _ = require('lodash');
const sizeof = require('object-sizeof');
const CommonUtil = require('../common/common-util');
const {
  NodeConfigs,
  StateLabelProperties,
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
    this.treeMaxSiblings = 0;
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
    this.setTreeMaxSiblings(0);
  }

  static _create(
      version, label, isLeaf, value, proofHash, treeHeight, treeSize, treeBytes, treeMaxSiblings) {
    const node = new StateNode(version);
    node.setLabel(label);
    node.setIsLeaf(isLeaf);
    node.setValue(value);
    node.setProofHash(proofHash);
    node.setTreeHeight(treeHeight);
    node.setTreeSize(treeSize);
    node.setTreeBytes(treeBytes);
    node.setTreeMaxSiblings(treeMaxSiblings);
    return node;
  }

  clone(version) {
    // For easy testing
    const versionToSet = version ? version : this.version;
    const cloned = StateNode._create(
        versionToSet, this.label, this.isLeaf, this.value, this.proofHash,
        this.treeHeight, this.treeSize, this.treeBytes, this.treeMaxSiblings);
    if (!this.getIsLeaf()) {
      cloned.setRadixTree(this.radixTree.clone(versionToSet, cloned));
    }
    return cloned;
  }

  // NOTE(liayoo): Bytes for some data (e.g. parents & children references, version) are excluded
  // from this calculation, since their sizes can vary and affect the gas costs and
  // state proof hashes.
  // 4(isLeaf) + 132(proofHash) + 8(treeHeight) + 8(treeSize) + 8(treeBytes) = 160
  // NOTE(platfowner): treeMaxSiblings is not included in the node bytes computation since
  // it was added later (see https://github.com/ainblockchain/ain-blockchain/issues/1067).
  computeNodeBytes() {
    return sizeof(this.value) + 160;
  }

  /**
   * Constructs a sub-tree from the given snapshot object.
   */
  static fromRadixSnapshot(obj) {
    const curNode = new StateNode();
    if (CommonUtil.isDict(obj)) {
      if (!CommonUtil.isEmpty(obj)) {
        const radixTree = RadixTree.fromRadixSnapshot(obj);
        curNode.setRadixTree(radixTree);
        curNode.setIsLeaf(false);
        curNode.setVersion(radixTree.getVersion());
      }
    } else {
      curNode.setValue(obj);
    }
    return curNode;
  }

  /**
   * Converts this sub-tree to a snapshot object.
   */
  toRadixSnapshot() {
    if (this.getIsLeaf()) {
      return this.getValue();
    }
    return this.radixTree.toRadixSnapshot();
  }

  /**
   * Constructs a sub-tree from the given js object.
   */
  static fromStateSnapshot(obj, version) {
    const curNode = new StateNode(version);
    if (CommonUtil.isDict(obj)) {
      if (!CommonUtil.isEmpty(obj)) {
        for (const key in obj) {
          if (CommonUtil.isPrefixedLabel(key, StateLabelProperties.META_LABEL_PREFIX)) {
            // Skip state properties.
            continue;
          }
          const childObj = obj[key];
          curNode.setChild(key, StateNode.fromStateSnapshot(childObj, version));
        }
      }
    } else {
      curNode.setValue(obj);
    }
    return curNode;
  }

  /**
   * Converts this sub-tree to a js object.
   */
  toStateSnapshot(options) {
    const isShallow = options && options.isShallow;
    const isPartial = options && options.isPartial;
    const lastEndLabel = (options && options.lastEndLabel !== undefined) ?
        options.lastEndLabel : null;
    const includeVersion = options && options.includeVersion;
    const includeTreeInfo = options && options.includeTreeInfo;
    const includeProof = options && options.includeProof;
    if (this.getIsLeaf()) {
      return this.getValue();
    }
    const obj = {};
    const childLabelsWithEndLabel = this.getChildLabelsWithEndLabel(isPartial, lastEndLabel);
    if (isPartial) {
      obj[`${StateLabelProperties.END_LABEL}`] = childLabelsWithEndLabel.endLabel;
    }
    for (let i = 0; i < childLabelsWithEndLabel.list.length; i++) {
      const label = childLabelsWithEndLabel.list[i];
      const childNode = this.getChild(label);
      if (childNode.getIsLeaf()) {
        obj[label] = childNode.toStateSnapshot(options);
        if (includeVersion) {
          obj[`${StateLabelProperties.VERSION}:${label}`] = childNode.getVersion();
        }
        if (includeTreeInfo) {
          obj[`${StateLabelProperties.NUM_PARENTS}:${label}`] = childNode.numParents();
          obj[`${StateLabelProperties.NUM_CHILDREN}:${label}`] = childNode.numChildren();
          obj[`${StateLabelProperties.TREE_HEIGHT}:${label}`] = childNode.getTreeHeight();
          obj[`${StateLabelProperties.TREE_SIZE}:${label}`] = childNode.getTreeSize();
          obj[`${StateLabelProperties.TREE_BYTES}:${label}`] = childNode.getTreeBytes();
          obj[`${StateLabelProperties.TREE_MAX_SIBLINGS}:${label}`] = childNode.getTreeMaxSiblings();
        }
        if (includeProof) {
          obj[`${StateLabelProperties.STATE_PROOF_HASH}:${label}`] = childNode.getProofHash();
        }
      } else {
        obj[label] = (isShallow || isPartial) ?
            { [`${StateLabelProperties.STATE_PROOF_HASH}`]: childNode.getProofHash() } :
            childNode.toStateSnapshot(options);
        if (isPartial) {
          const serial = childLabelsWithEndLabel.serialList[i];
          obj[label][`${StateLabelProperties.SERIAL}`] = serial;
        }
      }
    }
    if (includeVersion) {
      obj[`${StateLabelProperties.VERSION}`] = this.getVersion();
    }
    if (includeTreeInfo) {
      obj[`${StateLabelProperties.NUM_PARENTS}`] = this.numParents();
      obj[`${StateLabelProperties.NUM_CHILDREN}`] = this.numChildren();
      obj[`${StateLabelProperties.TREE_HEIGHT}`] = this.getTreeHeight();
      obj[`${StateLabelProperties.TREE_SIZE}`] = this.getTreeSize();
      obj[`${StateLabelProperties.TREE_BYTES}`] = this.getTreeBytes();
      obj[`${StateLabelProperties.TREE_MAX_SIBLINGS}`] = this.getTreeMaxSiblings();
    }
    if (includeProof) {
      obj[`${StateLabelProperties.STATE_PROOF_HASH}`] = this.getProofHash();
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
      CommonUtil.logErrorWithStackTrace(
          logger, 
          `[${LOG_HEADER}] Adding an existing parent radix node of label: ` +
          `${parentRadixNode.getLabel()}`);
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
      CommonUtil.logErrorWithStackTrace(
          logger, 
          `[${LOG_HEADER}] Deleting a non-existing parent radix node of label: ` +
          `${parentRadixNode.getLabel()}`);
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
      CommonUtil.logErrorWithStackTrace(
          logger, `[${LOG_HEADER}] Adding an existing parent of label: ${parent.getLabel()}`);
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
      CommonUtil.logErrorWithStackTrace(
          logger, `[${LOG_HEADER}] Deleting a non-existing parent of label: ${parent.getLabel()}`);
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
        CommonUtil.logErrorWithStackTrace(
            logger, 
            `[${LOG_HEADER}] Setting a child with label ${label} which is already a child.`);
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
      CommonUtil.logErrorWithStackTrace(
          logger, `[${LOG_HEADER}] Deleting a non-existing child with label: ${label}`);
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
    return this.getChildLabelsWithEndLabel().list;
  }

  getChildLabelsWithEndLabel(isPartial = false, lastEndLabel = null) {
    return this.radixTree.getChildStateLabelsWithEndLabel(isPartial, lastEndLabel);
  }

  getChildNodes() {
    return this.getChildNodesWithEndLabel().list;
  }

  getChildNodesWithEndLabel(isPartial = false, lastEndLabel = null) {
    return this.radixTree.getChildStateNodesWithEndLabel(isPartial, lastEndLabel);
  }

  hasChildren() {
    return this.radixTree.hasChildStateNodes();
  }

  numChildren() {
    return this.radixTree.getNumChildStateNodes();
  }

  setRadixTree(radixTree) {
    this.radixTree = radixTree;
    // NOTE(platfowner): Need to set parent state node of the root radix node.
    radixTree.root.setParentStateNode(this);
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
    this.radixTree.setVersion(version);
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

  getTreeMaxSiblings() {
    return this.treeMaxSiblings;
  }

  setTreeMaxSiblings(treeMaxSiblings) {
    this.treeMaxSiblings = treeMaxSiblings;
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
      const proofHash = NodeConfigs.LIGHTWEIGHT ?
          '' : CommonUtil.hashString(CommonUtil.toString(this.getValue()));
      return {
        proofHash,
        treeHeight: 0,
        treeSize: 1,
        treeBytes: nodeBytes,
        treeMaxSiblings: 1
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
        treeBytes: nodeBytes + this.radixTree.getRootTreeBytes(),
        treeMaxSiblings: Math.max(this.numChildren(), this.radixTree.getRootTreeMaxSiblings())
      };
    }
  }

  updateStateInfo(updatedChildLabel = null, shouldRebuildRadixInfo = true) {
    const treeInfo = this.buildStateInfo(updatedChildLabel, shouldRebuildRadixInfo);
    this.setProofHash(treeInfo.proofHash);
    this.setTreeHeight(treeInfo.treeHeight);
    this.setTreeSize(treeInfo.treeSize);
    this.setTreeBytes(treeInfo.treeBytes);
    this.setTreeMaxSiblings(treeInfo.treeMaxSiblings);
  }

  verifyStateInfo(updatedChildLabel = null) {
    const treeInfo = this.buildStateInfo(updatedChildLabel, true);
    return this.getProofHash() === treeInfo.proofHash &&
        this.getTreeHeight() === treeInfo.treeHeight &&
        this.getTreeSize() === treeInfo.treeSize &&
        this.getTreeBytes() === treeInfo.treeBytes &&
        this.getTreeMaxSiblings() === treeInfo.treeMaxSiblings;
  }

  getProofOfStateNode(childLabel = null, childProof = null) {
    if (childLabel === null) {
      return {
        [StateLabelProperties.STATE_PROOF_HASH]: this.getProofHash()
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
