const logger = require('../logger')('STATE_NODE');

const sizeof = require('object-sizeof');
const CommonUtil = require('../common/common-util');
const {
  FeatureFlags,
  LIGHTWEIGHT,
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
      this.radixTree = new RadixTree(version);
    }
    this.childMap = new Map();
    this.proofHash = null;
    this.treeHeight = 0;
    this.treeSize = 0;
    this.treeBytes = 0;
  }

  reset() {
    this.setVersion(null);  // should be reset for deleteStateTree().
    this.resetLabel();
    this.setIsLeaf(true);
    this.resetValue();
    this.parentSet.clear();
    if (FeatureFlags.enableRadixTreeLayers) {
      this.deleteRadixTree();
    }
    this.childMap.clear();
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
      if (FeatureFlags.enableRadixTreeLayers) {
        cloned.copyRadixTreeFrom(this, cloned);
      } else {
        for (const label of this.getChildLabels()) {
          const child = this.getChild(label);
          cloned.setChild(label, child);
        }
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
      obj[label] = isShallow ? true : childNode.toJsObject(options);
      if (childNode.getIsLeaf()) {
        if (includeVersion) {
          obj[`.${StateInfoProperties.VERSION}:${label}`] = childNode.getVersion();
        }
        if (includeProof) {
          obj[`.${StateInfoProperties.PROOF_HASH}:${label}`] = childNode.getProofHash();
        }
        if (includeTreeInfo) {
          obj[`.${StateInfoProperties.NUM_PARENTS}:${label}`] = childNode.numParents();
          obj[`.${StateInfoProperties.TREE_HEIGHT}:${label}`] = childNode.getTreeHeight();
          obj[`.${StateInfoProperties.TREE_SIZE}:${label}`] = childNode.getTreeSize();
          obj[`.${StateInfoProperties.TREE_BYTES}:${label}`] = childNode.getTreeBytes();
        }
      }
    }
    if (includeVersion) {
      obj[`.${StateInfoProperties.VERSION}`] = this.getVersion();
    }
    if (includeProof) {
      obj[`.${StateInfoProperties.PROOF_HASH}`] = this.getProofHash();
    }
    if (includeTreeInfo) {
      obj[`.${StateInfoProperties.NUM_PARENTS}`] = this.numParents();
      obj[`.${StateInfoProperties.TREE_HEIGHT}`] = this.getTreeHeight();
      obj[`.${StateInfoProperties.TREE_SIZE}`] = this.getTreeSize();
      obj[`.${StateInfoProperties.TREE_BYTES}`] = this.getTreeBytes();
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
    const LOG_HEADER = 'setLabel';

    const curLabel = this.getLabel();
    if (curLabel !== null && curLabel !== label) {
      logger.error(
          `[${LOG_HEADER}] Overwriting label ${curLabel} with ${label} at: ${new Error().stack}.`);
    }
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
      // NOTE(platfowner): Use deleteParent() instead of deleteChild() to keep
      // the order of children.
      child.deleteParent(this);
    }
    if (FeatureFlags.enableRadixTreeLayers) {
      this.radixTree.set(label, node);
    } else {
      this.childMap.set(label, node);
    }
    node.addParent(this);
    node.setLabel(label);
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

  deleteChild(label, shouldUpdateStateInfo = false) {
    const LOG_HEADER = 'deleteChild';
    if (!this.hasChild(label)) {
      logger.error(
          `[${LOG_HEADER}] Deleting a non-existing child with label: ${label} ` +
          `at: ${new Error().stack}.`);
      // Does nothing.
      return;
    }
    const child = this.getChild(label);
    child.deleteParent(this);
    if (FeatureFlags.enableRadixTreeLayers) {
      this.radixTree.delete(label, shouldUpdateStateInfo);  // with shouldUpdateStateInfo
      if (shouldUpdateStateInfo) {
        this.updateStateInfo(null, false);  // shouldRebuildRadixInfo = false
      }
    } else {
      this.childMap.delete(label);
      if (shouldUpdateStateInfo) {
        this.updateStateInfo();
      }
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
      if (FeatureFlags.enableRadixTreeLayers) {
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
      } else {
        const treeInfo = this.getChildLabels().reduce((acc, label) => {
          const child = this.getChild(label);
          const childPreimage = `${label}${HASH_DELIMITER}${child.getProofHash()}`;
          const accPreimage = LIGHTWEIGHT ? '' : acc.preimage === '' ?
              childPreimage : `${acc.preimage}${HASH_DELIMITER}${childPreimage}`;
          const accTreeHeight = Math.max(acc.treeHeight, child.getTreeHeight() + 1);
          const accTreeSize = acc.treeSize + child.getTreeSize();
          const accTreeBytes = acc.treeBytes + sizeof(label) + child.getTreeBytes();
          return {
            preimage: accPreimage,
            treeHeight: accTreeHeight,
            treeSize: accTreeSize,
            treeBytes: accTreeBytes,
          };
        }, {
          preimage: '',
          treeHeight: 0,
          treeSize: 1,
          treeBytes: nodeBytes
        });
        const proofHash = LIGHTWEIGHT ?  '' : CommonUtil.hashString(treeInfo.preimage);
        return {
          proofHash,
          treeHeight: treeInfo.treeHeight,
          treeSize: treeInfo.treeSize,
          treeBytes: treeInfo.treeBytes,
        }
      }
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

  deleteRadixTree(shouldDeleteParent = true) {
    return this.radixTree.deleteRadixTree(shouldDeleteParent ? this : null);
  }
}

module.exports = StateNode;
