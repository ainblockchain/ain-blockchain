const logger = new (require('../logger'))('RADIX_NODE');

const _ = require('lodash');
const sizeof = require('object-sizeof');
const CommonUtil = require('../common/common-util');
const {
  NodeConfigs,
  StateLabelProperties,
} = require('../common/constants');
const {
  verifyProofHashForStateTree,
  deleteStateTreeVersion,
} = require('./state-util');

/**
 * Implements Radix Node, which is used as a component of RadixTree.
 */
class RadixNode {
  constructor(version = null, serial = null, parentStateNode = null) {
    this.version = version;
    this.serial = serial;
    this.parentStateNode = parentStateNode;
    this.childStateNode = null;
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
    this.resetSerial();
    this.resetParentStateNode();
    this.resetChildStateNode();
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
      version, serial, parentStateNode, childStateNode, labelRadix, labelSuffix, proofHash,
      treeHeight, treeSize, treeBytes) {
    const node = new RadixNode(version, serial, parentStateNode);
    if (childStateNode) {
      node.setChildStateNode(childStateNode);
    }
    node.setLabelRadix(labelRadix);
    node.setLabelSuffix(labelSuffix);
    node.setProofHash(proofHash);
    node.setTreeHeight(treeHeight);
    node.setTreeSize(treeSize);
    node.setTreeBytes(treeBytes);
    return node;
  }

  clone(version, parentStateNode = null) {
    const cloned = RadixNode._create(
        version, this.getSerial(), parentStateNode, this.getChildStateNode(), this.getLabelRadix(),
        this.getLabelSuffix(), this.getProofHash(), this.getTreeHeight(), this.getTreeSize(),
        this.getTreeBytes());
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

  getSerial() {
    return this.serial;
  }

  setSerial(serial) {
    this.serial = serial;
  }

  resetSerial() {
    this.serial = null;
  }

  getParentStateNode() {
    return this.parentStateNode;
  }

  setParentStateNode(parentStateNode) {
    this.parentStateNode = parentStateNode;
  }

  hasParentStateNode() {
    return this.getParentStateNode() !== null;
  }

  resetParentStateNode() {
    this.parentStateNode = null;
  }

  getChildStateNode() {
    return this.childStateNode;
  }

  setChildStateNode(childStateNode) {
    const LOG_HEADER = 'setChildStateNode';
    if (!childStateNode) {
      CommonUtil.logErrorWithStackTrace(
          logger, `[${LOG_HEADER}] Setting invalid state node: ${childStateNode}`);
      // Does nothing.
      return;
    }
    if (this.hasChildStateNode()) {
      const existingStateNode = this.getChildStateNode();
      existingStateNode.deleteParentRadixNode(this);
    }
    if (!childStateNode.hasParentRadixNode(this)) {
      childStateNode.addParentRadixNode(this);
    }
    this.childStateNode = childStateNode;
  }

  hasChildStateNode() {
    return this.getChildStateNode() !== null;
  }

  resetChildStateNode() {
    if (this.hasChildStateNode()) {
      this.getChildStateNode().deleteParentRadixNode(this);
    }
    this.childStateNode = null;
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

  setChild(labelRadix, labelSuffix, node) {
    const LOG_HEADER = 'setChild';
    if (!CommonUtil.isString(labelRadix) || labelRadix.length !== 1) {
      CommonUtil.logErrorWithStackTrace(
          logger, `[${LOG_HEADER}] Setting a child with invalid label radix ${labelRadix}`);
      // Does nothing.
      return false;
    }
    if (!CommonUtil.isString(labelSuffix)) {
      CommonUtil.logErrorWithStackTrace(
          logger, `[${LOG_HEADER}] Setting a child with invalid label suffix ${labelRadix}`);
      // Does nothing.
      return false;
    }
    if (this.hasChild(labelRadix)) {
      const child = this.getChild(labelRadix);
      if (child === node) {
        CommonUtil.logErrorWithStackTrace(
            logger,
            `[${LOG_HEADER}] Setting an existing child with label ${labelRadix + labelSuffix}`);
        // Does nothing.
        return false;
      }
      // NOTE(platfowner): Use deleteParent() instead of deleteChild() to keep
      // the order of children.
      child.deleteParent(this);
    }
    this.radixChildMap.set(labelRadix, node);
    node.setLabelRadix(labelRadix);
    node.setLabelSuffix(labelSuffix);
    node.addParent(this);
    return true;
  }

  hasChild(labelRadix) {
    return this.radixChildMap.has(labelRadix);
  }

  deleteChild(labelRadix) {
    const LOG_HEADER = 'deleteChild';
    if (!CommonUtil.isString(labelRadix) || labelRadix.length !== 1) {
      CommonUtil.logErrorWithStackTrace(
          logger, `[${LOG_HEADER}] Deleting a child with invalid label radix ${labelRadix}`);
      // Does nothing.
      return false;
    }
    if (!this.hasChild(labelRadix)) {
      CommonUtil.logErrorWithStackTrace(
          logger, `[${LOG_HEADER}] Deleting a non-existing child with label radix: ${labelRadix}`);
      // Does nothing.
      return false;
    }
    const child = this.getChild(labelRadix);
    this.radixChildMap.delete(labelRadix);
    child.deleteParent(this);
    return true;
  }

  getChildLabelRadices() {
    // NOTE(platfowner): Sort child nodes by label radix for stability.
    return [...this.radixChildMap.keys()]
        .sort((a, b) => a.localeCompare(b));
  }

  getChildNodes() {
    // NOTE(platfowner): Sort child nodes by label radix for stability.
    return [...this.radixChildMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))  // compare keys (label radices)
        .map((entry) => entry[1]);
  }

  numChildren() {
    return this.radixChildMap.size;
  }

  getParentStateNodeList() {
    if (this.hasParentStateNode()) {
      return [this.getParentStateNode()];
    }

    const parentStateNodeList = [];
    for (const parent of this.getParentNodes()) {
      parentStateNodeList.push(...parent.getParentStateNodeList());
    }
    return parentStateNodeList;
  }

  _getNumMultipleParentStateNodes(numParentStateNodes) {
    if (this.hasParentStateNode()) {
      // This is a root node.
      return numParentStateNodes + 1;
    }

    for (const parent of this.getParentNodes()) {
      numParentStateNodes = parent._getNumMultipleParentStateNodes(numParentStateNodes);
      if (numParentStateNodes > 1) {
        // Stops early.
        return numParentStateNodes;
      }
    }
    return numParentStateNodes;
  }

  hasMultipleParentStateNodes() {
    if (this.hasParentStateNode()) {
      // This is a root node, so has only one parent state node.
      return false;
    }

    let numParentStateNodes = 0;
    for (const parent of this.getParentNodes()) {
      numParentStateNodes = parent._getNumMultipleParentStateNodes(numParentStateNodes);
      if (numParentStateNodes > 1) {
        // Stops early.
        return true;
      }
    }
    return false;
  }

  getChildStateNodeList() {
    const stateNodeList = [];
    if (this.hasChildStateNode()) {
      stateNodeList.push({
        serial: this.getSerial(),
        stateNode: this.getChildStateNode()
      });
    }
    for (const child of this.getChildNodes()) {
      stateNodeList.push(...child.getChildStateNodeList());
    }
    return stateNodeList;
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
    if (this.hasChildStateNode()) {
      const childStateNode = this.getChildStateNode();
      const childStateNodeLabel = CommonUtil.stringOrEmpty(childStateNode.getLabel());
      const preimage = NodeConfigs.LIGHTWEIGHT ? '' : childStateNode.getProofHash();
      treeInfo = {
        preimage,
        treeHeight: childStateNode.getTreeHeight(),
        treeSize: childStateNode.getTreeSize(),
        treeBytes: sizeof(childStateNodeLabel) + childStateNode.getTreeBytes(),
      };
    }
    treeInfo.preimage += StateLabelProperties.HASH_DELIMITER;
    if (this.numChildren() === 0) {
      treeInfo.preimage += StateLabelProperties.HASH_DELIMITER;
    } else {
      treeInfo = this.getChildNodes().reduce((acc, child) => {
        const accPreimage = NodeConfigs.LIGHTWEIGHT ? '' : acc.preimage +
            `${StateLabelProperties.HASH_DELIMITER}${child.getLabel()}${StateLabelProperties.HASH_DELIMITER}${child.getProofHash()}`;
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
    const proofHash = NodeConfigs.LIGHTWEIGHT ? '' : CommonUtil.hashString(treeInfo.preimage);
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

  verifyProofHashForRadixTree(curLabels = []) {
    const curPath = CommonUtil.formatPath(curLabels);
    let preimage = '';
    if (this.hasChildStateNode()) {
      const childStateNode = this.getChildStateNode();
      const proofStateLabel = StateLabelProperties.STATE_LABEL_PREFIX + childStateNode.getLabel();
      const childStateVerif =
          verifyProofHashForStateTree(childStateNode, [...curLabels, proofStateLabel]);
      if (childStateVerif.isVerified !== true) {
        return childStateVerif;
      }
      preimage += childStateNode.getProofHash();
    }
    preimage += StateLabelProperties.HASH_DELIMITER;
    if (this.numChildren() === 0) {
      preimage += StateLabelProperties.HASH_DELIMITER;
    } else {
      for (const child of this.getChildNodes()) {
        const label = child.getLabel();
        const proofRadixLabel = StateLabelProperties.RADIX_LABEL_PREFIX + label;
        const childRadixVerif = child.verifyProofHashForRadixTree([...curLabels, proofRadixLabel]);
        if (childRadixVerif.isVerified !== true) {
          return childRadixVerif;
        }
        preimage += `${StateLabelProperties.HASH_DELIMITER}${child.getLabel()}${StateLabelProperties.HASH_DELIMITER}${child.getProofHash()}`;
      }
    }
    const proofHashComputed = CommonUtil.hashString(preimage);
    const isVerified = proofHashComputed === this.getProofHash();
    const mismatchedPath = isVerified ? null : curPath;
    const mismatchedProofHash = isVerified ? null : this.getProofHash();
    const mismatchedProofHashComputed = isVerified ? null : proofHashComputed;
    return {
      isVerified,
      mismatchedPath,
      mismatchedProofHash,
      mismatchedProofHashComputed,
    };
  }

  getProofOfRadixNode(
      childLabel = null, childRadixProof = null, childStateProof = null, isRootRadixNode = false) {
    // NOTE(platfowner): Root radix node uses STATE_PROOF_HASH as the proof label.
    const proofLabel = isRootRadixNode ?
        StateLabelProperties.STATE_PROOF_HASH : StateLabelProperties.RADIX_PROOF_HASH;
    const proof = { [proofLabel]: this.getProofHash() };
    if (this.hasChildStateNode()) {
      const childStateNode = this.getChildStateNode();
      const proofStateLabel = StateLabelProperties.STATE_LABEL_PREFIX + childStateNode.getLabel();
      Object.assign(proof, {
        [proofStateLabel]: childStateProof !== null ? childStateProof : {
          [StateLabelProperties.STATE_PROOF_HASH]: childStateNode.getProofHash()
        }
      });
    }
    if (childLabel === null && childStateProof !== null) {
      return proof;
    }
    this.getChildNodes().forEach((child) => {
      const label = child.getLabel();
      const proofRadixLabel = StateLabelProperties.RADIX_LABEL_PREFIX + label;
      Object.assign(proof, {
        [proofRadixLabel]: label === childLabel ? childRadixProof : {
          [StateLabelProperties.RADIX_PROOF_HASH]: child.getProofHash()
        }
      });
    });
    return proof;
  }

  /**
   * Deletes radix tree version.
   */
  deleteRadixTreeVersion() {
    let numAffectedNodes = 0;
    if (this.numParents() > 0) {
      // Does nothing.
      return numAffectedNodes;
    }

    // 1. Recursive call for all child radix nodes.
    for (const child of this.getChildNodes()) {
      this.deleteChild(child.getLabelRadix());
      numAffectedNodes += child.deleteRadixTreeVersion();
    }
    // 2. Recursive call for the child state node if available.
    if (this.hasChildStateNode()) {
      const childStateNode = this.getChildStateNode();
      this.resetChildStateNode();
      numAffectedNodes += deleteStateTreeVersion(childStateNode);
    }
    // 3. Delete node itself.
    this.reset();
    numAffectedNodes++;

    return numAffectedNodes;
  }

  static getChildStateNodeFromRadixSnapshot(obj) {
    const StateNode = require('./state-node');
    let childStateLabel = null;
    let childStateObj = null;
    for (const key in obj) {
      if (_.startsWith(key, StateLabelProperties.STATE_LABEL_PREFIX)) {
        childStateLabel = key.slice(StateLabelProperties.STATE_LABEL_PREFIX.length);
        childStateObj = obj[key];
      }
    }
    if (childStateLabel === null) {
      return null;
    }
    const childStateNode = StateNode.fromRadixSnapshot(childStateObj);
    childStateNode.setLabel(childStateLabel);
    const version = obj[`${StateLabelProperties.VERSION}:${childStateLabel}`];
    if (version) {
      // leaf node case
      childStateNode.setVersion(version);
    }
    return childStateNode;
  }

  /**
   * Constructs a sub-tree from the given snspshot object.
   */
  static fromRadixSnapshot(obj) {
    const version = obj[StateLabelProperties.VERSION];
    const serial = obj[StateLabelProperties.SERIAL];
    const curNode = new RadixNode(version, serial);
    const childStateNode = RadixNode.getChildStateNodeFromRadixSnapshot(obj);
    if (childStateNode !== null) {
      curNode.setChildStateNode(childStateNode);
    }
    for (const key in obj) {
      if (_.startsWith(key, StateLabelProperties.RADIX_LABEL_PREFIX)) {
        const childLabel = key.slice(StateLabelProperties.RADIX_LABEL_PREFIX.length);
        const childObj = obj[key];
        if (CommonUtil.isEmpty(childLabel)) {
          return null;
        }
        const childNode = RadixNode.fromRadixSnapshot(childObj);
        const childLabelRadix = childLabel.charAt(0);
        const childLabelSuffix = childLabel.slice(1);
        curNode.setChild(childLabelRadix, childLabelSuffix, childNode);
      }
    }
    return curNode;
  }

  /**
   * Converts this sub-tree to a snapshot object.
   */
  toRadixSnapshot(nextSerial = null) {
    const obj = {};
    if (nextSerial !== null) {
      obj[StateLabelProperties.NEXT_SERIAL] = nextSerial;
    }
    obj[StateLabelProperties.VERSION] = this.getVersion();
    obj[StateLabelProperties.SERIAL] = this.getSerial();
    if (this.hasChildStateNode()) {
      const childStateNode = this.getChildStateNode();
      obj[StateLabelProperties.STATE_LABEL_PREFIX + childStateNode.getLabel()] =
          childStateNode.toRadixSnapshot();
      if (childStateNode.getIsLeaf()) {
        obj[`${StateLabelProperties.VERSION}:${childStateNode.getLabel()}`] =
            childStateNode.getVersion();
      }
    }
    for (const child of this.getChildNodes()) {
      obj[StateLabelProperties.RADIX_LABEL_PREFIX + child.getLabel()] =
          child.toRadixSnapshot();
    }
    return obj;
  }

  /**
   * Converts this sub-tree to a js object.
   * This is for testing / debugging purpose.
   */
  toJsObject(
      withVersion = false, withSerial = false, withProofHash = false, withTreeInfo = false,
      withNumParents = false, withHasParentStateNode = false) {
    const obj = {};
    if (withVersion) {
      obj[StateLabelProperties.VERSION] = this.getVersion();
    }
    if (withSerial) {
      obj[StateLabelProperties.SERIAL] = this.getSerial();
    }
    if (withProofHash) {
      obj[StateLabelProperties.RADIX_PROOF_HASH] = this.getProofHash();
    }
    if (withTreeInfo) {
      obj[StateLabelProperties.TREE_HEIGHT] = this.getTreeHeight();
      obj[StateLabelProperties.TREE_SIZE] = this.getTreeSize();
      obj[StateLabelProperties.TREE_BYTES] = this.getTreeBytes();
    }
    if (withNumParents) {
      obj[StateLabelProperties.NUM_PARENTS] = this.numParents();
    }
    if (withHasParentStateNode) {
      obj[StateLabelProperties.HAS_PARENT_STATE_NODE] = this.hasParentStateNode();
    }
    if (this.hasChildStateNode()) {
      const stateObj = {};
      const childStateNode = this.getChildStateNode();
      if (withVersion) {
        stateObj[StateLabelProperties.VERSION] = childStateNode.getVersion();
      }
      if (withProofHash) {
        stateObj[StateLabelProperties.STATE_PROOF_HASH] = childStateNode.getProofHash();
      }
      obj[`${StateLabelProperties.STATE_LABEL_PREFIX}${childStateNode.getLabel()}`] = stateObj;
    }
    for (const child of this.getChildNodes()) {
      obj[child.getLabel()] = child.toJsObject(
          withVersion, withSerial, withProofHash, withTreeInfo, withNumParents,
          withHasParentStateNode);
    }
    return obj;
  }
}

module.exports = RadixNode;