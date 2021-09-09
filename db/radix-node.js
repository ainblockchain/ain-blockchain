const logger = require('../logger')('RADIX_NODE');

const sizeof = require('object-sizeof');
const CommonUtil = require('../common/common-util');
const {
  LIGHTWEIGHT,
  HASH_DELIMITER,
  ProofProperties,
  RadixInfoProperties,
} = require('../common/constants');

/**
 * Implements Radix Node, which is used as a component of RadixTree.
 */
class RadixNode {
  constructor(version) {
    this.version = version || null;
    this.stateNode = null;
    this.labelRadix = '';
    this.labelSuffix = '';
    this.parentSet = new Set();
    this.radixChildMap = new Map();
    this.proofHash = null;
    this.treeHeight = 0;
    this.treeSize = 0;
    this.treeBytes = 0;
  }

  reset() {
    this.resetVersion();
    this.resetStateNode();
    this.resetLabelRadix();
    this.resetLabelSuffix();
    this.parentSet.clear();
    this.radixChildMap.clear();
    this.resetProofHash();
    this.resetTreeHeight();
    this.resetTreeSize();
    this.resetTreeBytes();
  }

  static _create(
      version, stateNode, labelRadix, labelSuffix, proofHash, treeHeight, treeSize, treeBytes) {
    const node = new RadixNode(version);
    node.setStateNode(stateNode);
    node.setLabelRadix(labelRadix);
    node.setLabelSuffix(labelSuffix);
    node.setProofHash(proofHash);
    node.setTreeHeight(treeHeight);
    node.setTreeSize(treeSize);
    node.setTreeBytes(treeBytes);
    return node;
  }

  clone(version) {
    const cloned = RadixNode._create(version ? version : this.version, this.stateNode,
        this.labelRadix, this.labelSuffix, this.proofHash, this.treeHeight, this.treeSize,
        this.treeBytes);
    for (const child of this.getChildNodes()) {
      cloned.setChild(child.getLabelRadix(), child.getLabelSuffix(), child);
    }
    return cloned;
  }

  getVersion() {
    return this.version;
  }

  setVersion(version) {
    this.version = version;
  }

  resetVersion() {
    this.version = null;
  }

  getStateNode() {
    return this.stateNode;
  }

  setStateNode(stateNode) {
    const LOG_HEADER = 'setStateNode';
    const StateNode = require('./state-node');

    if (!(stateNode instanceof StateNode)) {
      logger.error(
          `[${LOG_HEADER}] Setting with a non-StateNode instance at: ${new Error().stack}.`);
      // Does nothing.
      return false;
    }
    this.stateNode = stateNode;
    return true;
  }

  hasStateNode() {
    return this.getStateNode() !== null;
  }

  resetStateNode() {
    this.stateNode = null;
  }

  getLabelRadix() {
    return this.labelRadix;
  }

  setLabelRadix(labelRadix) {
    this.labelRadix = labelRadix;
  }

  resetLabelRadix() {
    this.setLabelRadix('');
  }

  getLabelSuffix() {
    return this.labelSuffix;
  }

  setLabelSuffix(labelSuffix) {
    this.labelSuffix = labelSuffix;
  }

  resetLabelSuffix() {
    this.setLabelSuffix('');
  }

  getLabel() {
    return this.getLabelRadix() + this.getLabelSuffix();
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

  hasParent(parent = null) {
    if (parent === null) {
      return this.numParents() > 0;
    }
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

  getChild(labelRadix) {
    const child = this.radixChildMap.get(labelRadix);
    if (child === undefined) {
      return null;
    }
    return child;
  }

  setChild(labelRadix, labelSuffix, child) {
    const LOG_HEADER = 'setChild';
    if (!CommonUtil.isString(labelRadix) || labelRadix.length !== 1) {
      logger.error(
          `[${LOG_HEADER}] Setting a child with invalid label radix ${labelRadix} ` +
          `at: ${new Error().stack}.`);
      // Does nothing.
      return false;
    }
    if (!CommonUtil.isString(labelSuffix)) {
      logger.error(
          `[${LOG_HEADER}] Setting a child with invalid label suffix ${labelRadix} ` +
          `at: ${new Error().stack}.`);
      // Does nothing.
      return false;
    }
    if (this.hasChild(labelRadix)) {
      logger.error(
          `[${LOG_HEADER}] Overwriting a child with label radix ${labelRadix} ` +
          `at: ${new Error().stack}.`);
      // Does nothing.
      return false;
    }
    this.radixChildMap.set(labelRadix, child);
    child.setLabelRadix(labelRadix);
    child.setLabelSuffix(labelSuffix);
    child.addParent(this);
    return true;
  }

  hasChild(labelRadix = null) {
    if (labelRadix === null) {
      return this.numChildren() > 0;
    }
    return this.radixChildMap.has(labelRadix);
  }

  deleteChild(labelRadix) {
    const LOG_HEADER = 'deleteChild';
    if (!CommonUtil.isString(labelRadix) || labelRadix.length !== 1) {
      logger.error(
          `[${LOG_HEADER}] Deleting a child with invalid label radix ${labelRadix} ` +
          `at: ${new Error().stack}.`);
      // Does nothing.
      return false;
    }
    if (!this.hasChild(labelRadix)) {
      logger.error(
          `[${LOG_HEADER}] Deleting a non-existing child with label radix: ${labelRadix} ` +
          `at: ${new Error().stack}.`);
      // Does nothing.
      return false;
    }
    const child = this.getChild(labelRadix);
    this.radixChildMap.delete(labelRadix);
    child.resetLabelRadix();
    child.resetLabelSuffix();
    child.deleteParent(this);
    return true;
  }

  getChildLabelRadices() {
    return [...this.radixChildMap.keys()];
  }

  getChildNodes() {
    return [...this.radixChildMap.values()];
  }

  numChildren() {
    return this.radixChildMap.size;
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

  getTreeHeight() {
    return this.treeHeight;
  }

  setTreeHeight(treeHeight) {
    this.treeHeight = treeHeight;
  }

  resetTreeHeight() {
    this.setTreeHeight(0);
  }

  getTreeSize() {
    return this.treeSize;
  }

  setTreeSize(treeSize) {
    this.treeSize = treeSize;
  }

  resetTreeSize() {
    this.setTreeSize(0);
  }

  getTreeBytes() {
    return this.treeBytes;
  }

  setTreeBytes(treeBytes) {
    this.treeBytes = treeBytes;
  }

  resetTreeBytes() {
    this.setTreeBytes(0);
  }

  buildRadixInfo() {
    let treeInfo = {
      preimage: '',
      treeHeight: 0,
      treeSize: 0,
      treeBytes: 0,
    };
    if (this.hasStateNode()) {
      const stateNode = this.getStateNode();
      const stateNodeLabel = CommonUtil.stringOrEmpty(stateNode.getLabel());
      const preimage = LIGHTWEIGHT ? '' : stateNode.getProofHash();
      treeInfo = {
        preimage,
        treeHeight: stateNode.getTreeHeight(),
        treeSize: stateNode.getTreeSize(),
        treeBytes: sizeof(stateNodeLabel) + stateNode.getTreeBytes(),
      };
    }
    treeInfo.preimage += `${HASH_DELIMITER}`;
    if (this.numChildren() === 0) {
      treeInfo.preimage += `${HASH_DELIMITER}`;
    } else {
      treeInfo = this.getChildNodes().reduce((acc, child) => {
        const accPreimage = LIGHTWEIGHT ? '' : acc.preimage +
            `${HASH_DELIMITER}${child.getLabel()}${HASH_DELIMITER}${child.getProofHash()}`;
        const accTreeHeight = Math.max(acc.treeHeight, child.getTreeHeight());
        const accTreeSize = acc.treeSize + child.getTreeSize();
        const accTreeBytes = acc.treeBytes + child.getTreeBytes();
        return {
          preimage: accPreimage,
          treeHeight: accTreeHeight,
          treeSize: accTreeSize,
          treeBytes: accTreeBytes,
        };
      }, treeInfo);
    }
    const proofHash = LIGHTWEIGHT ? '' : CommonUtil.hashString(treeInfo.preimage);
    return {
      proofHash,
      treeHeight: treeInfo.treeHeight,
      treeSize: treeInfo.treeSize,
      treeBytes: treeInfo.treeBytes,
    };
  }

  updateRadixInfo() {
    const treeInfo = this.buildRadixInfo();
    this.setProofHash(treeInfo.proofHash);
    this.setTreeHeight(treeInfo.treeHeight);
    this.setTreeSize(treeInfo.treeSize);
    this.setTreeBytes(treeInfo.treeBytes);
  }

  verifyRadixInfo() {
    const treeInfo = this.buildRadixInfo();
    return this.getProofHash() === treeInfo.proofHash &&
        this.getTreeHeight() === treeInfo.treeHeight &&
        this.getTreeSize() === treeInfo.treeSize &&
        this.getTreeBytes() === treeInfo.treeBytes;
  }

  updateRadixInfoForRadixTree() {
    let numAffectedNodes = 0;
    for (const child of this.getChildNodes()) {
      numAffectedNodes += child.updateRadixInfoForRadixTree();
    }
    this.updateRadixInfo();
    numAffectedNodes++;

    return numAffectedNodes;
  }

  updateRadixInfoForAllRootPaths() {
    let numAffectedNodes = 0;
    this.updateRadixInfo();
    numAffectedNodes++;
    for (const parent of this.getParentNodes()) {
      numAffectedNodes += parent.updateRadixInfoForAllRootPaths();
    }

    return numAffectedNodes;
  }

  verifyRadixInfoForRadixTree() {
    if (!this.verifyRadixInfo()) {
      return false;
    }
    for (const child of this.getChildNodes()) {
      if (!child.verifyRadixInfoForRadixTree()) {
        return false;
      }
    }
    return true;
  }

  getProofOfRadixNode(childLabel = null, childProof = null, stateProof = null) {
    const proof = { [ProofProperties.RADIX_PROOF_HASH]: this.getProofHash() };
    if (this.hasStateNode()) {
      const stateNode = this.getStateNode();
      Object.assign(proof, {
        [ProofProperties.LABEL]: stateNode.getLabel(),
        [ProofProperties.PROOF_HASH]: stateProof !== null ?  stateProof : stateNode.getProofHash()
      });
    }
    if (childLabel === null && stateProof !== null) {
      return proof;
    }
    this.getChildNodes().forEach((child) => {
      const label = child.getLabel();
      Object.assign(proof, {
        [label]: label === childLabel ? childProof : {
          [ProofProperties.RADIX_PROOF_HASH]: child.getProofHash()
        }
      });
    });
    return proof;
  }

  copyFrom(radixNode, newParentStateNode, terminalNodeMap) {
    if (radixNode.hasStateNode()) {
      const stateNode = radixNode.getStateNode();
      this.setStateNode(stateNode);
      stateNode.addParent(newParentStateNode);  // Add new parent state node.
      terminalNodeMap.set(stateNode.getLabel(), this);
    }
    this.setLabelRadix(radixNode.getLabelRadix());
    this.setLabelSuffix(radixNode.getLabelSuffix());
    this.setProofHash(radixNode.getProofHash());
    this.setTreeHeight(radixNode.getTreeHeight());
    this.setTreeSize(radixNode.getTreeSize());
    this.setTreeBytes(radixNode.getTreeBytes());
    for (const child of radixNode.getChildNodes()) {
      const clonedChild = new RadixNode(this.getVersion());
      this.setChild(child.getLabelRadix(), child.getLabelSuffix(), clonedChild);
      clonedChild.copyFrom(child, newParentStateNode, terminalNodeMap);
    }
  }

  /**
   * Deletes radix tree.
   * If parentStateNodeToDelete is given, it's deleted from the terminal state nodes' parent set.
   */
  deleteRadixTree(parentStateNodeToDelete = null) {
    let numAffectedNodes = 0;

    for (const child of this.getChildNodes()) {
      numAffectedNodes += child.deleteRadixTree(parentStateNodeToDelete);
    }

    if (parentStateNodeToDelete !== null && this.hasStateNode()) {
      const stateNode = this.getStateNode();
      stateNode.deleteParent(parentStateNodeToDelete);
    }
    this.reset();
    numAffectedNodes++;

    return numAffectedNodes;
  }

  /**
   * Converts the subtree to a js object.
   * This is for testing / debugging purpose.
   */
  toJsObject(withVersion = false, withProofHash = false, withTreeInfo = false) {
    const obj = {};
    if (withVersion) {
      obj[RadixInfoProperties.RADIX_VERSION] = this.getVersion();
    }
    if (withProofHash) {
      obj[RadixInfoProperties.RADIX_PROOF_HASH] = this.getProofHash();
    }
    if (withTreeInfo) {
      obj[RadixInfoProperties.TREE_HEIGHT] = this.getTreeHeight();
      obj[RadixInfoProperties.TREE_SIZE] = this.getTreeSize();
      obj[RadixInfoProperties.TREE_BYTES] = this.getTreeBytes();
    }
    if (this.hasStateNode()) {
      const stateNode = this.getStateNode();
      obj[RadixInfoProperties.LABEL] = stateNode.getLabel();
      if (withVersion) {
        obj[RadixInfoProperties.VERSION] = stateNode.getVersion();
      }
      if (withProofHash) {
        obj[RadixInfoProperties.PROOF_HASH] = stateNode.getProofHash();
      }
    }
    for (const child of this.getChildNodes()) {
      obj[child.getLabel()] = child.toJsObject(withVersion, withProofHash, withTreeInfo);
    }
    return obj;
  }
}

module.exports = RadixNode;