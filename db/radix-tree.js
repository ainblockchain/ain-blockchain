const logger = require('../logger')('RADIX_TREE');

const CommonUtil = require('../common/common-util');
const {
  FeatureFlags,
} = require('../common/constants');
const RadixNode = require('./radix-node');

/**
 * A database for (label, stateNode) pairs. For efficient update and retrieval of proof hashes,
 * it uses a radix tree internally.
 */
class RadixTree {
  constructor() {
    this.root = new RadixNode();
    this.terminalNodeMap = new Map();
    if (FeatureFlags.enableHexLabelCache) {
      this.hexLabelCache = new Map();
    }
  }

  _toHexLabel(stateLabel) {
    if (FeatureFlags.enableHexLabelCache) {
      if (this.hexLabelCache.has(stateLabel)) {
        return this.hexLabelCache.get(stateLabel);
      }
    }
    const hexLabelWithPrefix = CommonUtil.toHexString(stateLabel);
    const hexLabel = hexLabelWithPrefix.length >= 2 ? hexLabelWithPrefix.slice(2) : '';
    if (FeatureFlags.enableHexLabelCache) {
      this.hexLabelCache.set(stateLabel, hexLabel);
    }
    return hexLabel;
  }

  static _matchLabelSuffix(radixNode, hexLabel, index) {
    const labelSuffix = radixNode.getLabelSuffix();
    return labelSuffix.length === 0 ||
        (labelSuffix.length <= hexLabel.length - index &&
        hexLabel.startsWith(labelSuffix, index));
  }

  static _getCommonPrefix(label1, label2) {
    let labelIndex = 0;
    while (labelIndex < Math.min(label1.length, label2.length)) {
      if (label1.charAt(labelIndex) !== label2.charAt(labelIndex)) {
        break;
      }
      labelIndex++;
    }
    return label1.slice(0, labelIndex);
  }

  static _setChildWithLabel(node, childLabel, child) {
    const labelRadix = childLabel.charAt(0);
    const labelSuffix = childLabel.slice(1);
    return node.setChild(labelRadix, labelSuffix, child);
  }

  _getRadixNodeForReading(stateLabel) {
    const terminalNode = this.terminalNodeMap.get(stateLabel);
    if (terminalNode === undefined) {
      return null;
    }
    return terminalNode;
  }

  _getRadixNodeForWriting(hexLabel) {
    let curNode = this.root
    let labelIndex = 0;
    while (labelIndex < hexLabel.length) {
      const labelRadix = hexLabel.charAt(labelIndex);

      // Case 1: No child with the label radix.
      if (!curNode.hasChild(labelRadix)) {
        const newChild = new RadixNode();
        const labelSuffix = hexLabel.slice(labelIndex + 1);
        curNode.setChild(labelRadix, labelSuffix, newChild);

        return newChild;
      }

      // Case 2: Has a child with the label radix but no match with the label suffix.
      const child = curNode.getChild(labelRadix);
      if (!RadixTree._matchLabelSuffix(child, hexLabel, labelIndex + 1)) {
        const labelSuffix = hexLabel.slice(labelIndex + 1);
        const childLabelSuffix = child.getLabelSuffix();
        const commonPrefix = RadixTree._getCommonPrefix(labelSuffix, childLabelSuffix);

        // Delete existing child first.
        curNode.deleteChild(labelRadix);

        if (commonPrefix.length === labelSuffix.length) {
          // Insert an internal node between curNode and the existing child.
          const internalNode = new RadixNode();
          curNode.setChild(labelRadix, commonPrefix, internalNode);

          // Insert the existing child node as a child of the internal node.
          const childNewLabel = childLabelSuffix.slice(commonPrefix.length);
          RadixTree._setChildWithLabel(internalNode, childNewLabel, child);

          // Return the new internal node
          return internalNode;
        } else {
          // Insert an internal node between curNode and two child nodes.
          const internalNode = new RadixNode();
          curNode.setChild(labelRadix, commonPrefix, internalNode);

          // Insert the existing child node as a child of the internal node.
          const childNewLabel = childLabelSuffix.slice(commonPrefix.length);
          RadixTree._setChildWithLabel(internalNode, childNewLabel, child);

          // Insert new child node as a child of the internal node.
          const newChild = new RadixNode();
          const newChildLabel = labelSuffix.slice(commonPrefix.length);
          RadixTree._setChildWithLabel(internalNode, newChildLabel, newChild);

          return newChild;
        }
      }

      // Case 3: Has a child with matching label suffix.
      curNode = child;
      labelIndex += 1 + child.getLabelSuffix().length;
    }

    return curNode;
  }

  // NOTE(platfowner): Use hash map instead of radix tree as it faster.
  get(stateLabel) {
    const LOG_HEADER = '_getFromMap';

    const terminalNode = this.terminalNodeMap.get(stateLabel);
    if (terminalNode === undefined) {
      return null;
    }
    if (!terminalNode.hasStateNode()) {
      logger.error(
          `[${LOG_HEADER}] Terminal node without state node with label: ` +
          `${terminalNode.getLabel()} at: ${new Error().stack}.`);
      return null;
    }
    return terminalNode.getStateNode();
  }

  // NOTE(platfowner): Use hash map instead of radix tree as it faster.
  has(stateLabel) {
    return this.terminalNodeMap.has(stateLabel);
  }

  set(stateLabel, stateNode) {
    const hexLabel = this._toHexLabel(stateLabel);
    const node = this._getRadixNodeForWriting(hexLabel);
    // Set in the terminal node map.
    this.terminalNodeMap.set(stateLabel, node);
    return node.setStateNode(stateNode);
  }

  _mergeToChild(node) {
    const LOG_HEADER = '_mergeToChild';

    if (node.numChildren() !== 1) {
      logger.error(
          `[${LOG_HEADER}] Trying to merge a node with children: ${node.getLabel()} ` +
          `at: ${new Error().stack}.`);
      // Does nothing.
      return false;
    }
    if (node.hasStateNode()) {
      logger.error(
          `[${LOG_HEADER}] Trying to merge a node with state node: ${node.getLabel()} ` +
          `at: ${new Error().stack}.`);
      // Does nothing.
      return false;
    }
    const parent = node.getParent();
    const labelRadix = node.getLabelRadix();
    const labelSuffix = node.getLabelSuffix();
    const child = node.getChildNodes()[0];
    const childLabelRadix = child.getLabelRadix();
    const childLabelSuffix = child.getLabelSuffix();
    parent.deleteChild(labelRadix);
    node.deleteChild(childLabelRadix);
    const newChildLabelSuffix = labelSuffix + childLabelRadix + childLabelSuffix;
    parent.setChild(labelRadix, newChildLabelSuffix, child);
    return true;
  }

  delete(stateLabel) {
    const LOG_HEADER = '_deleteFromTree';

    const node = this._getRadixNodeForReading(stateLabel);
    if (node === null || !node.hasStateNode()) {
      logger.error(
          `[${LOG_HEADER}] Deleting a non-existing child of label: ${stateLabel} ` +
          `at: ${new Error().stack}.`);
      // Does nothing.
      return false;
    }
    if (!node.hasParent()) {
      logger.error(
          `[${LOG_HEADER}] Deleting the root node of label: ${stateLabel} ` +
          `at: ${new Error().stack}.`);
      // Does nothing.
      return false;
    }
    node.resetStateNode();
    let retVal = true;
    if (node.numChildren() === 1) {
      retVal = this._mergeToChild(node);
    } else if (node.numChildren() === 0) {
      if (!node.hasParent()) {
        logger.error(
            `[${LOG_HEADER}] Deleting a child without parent of label: ${stateLabel} ` +
            `at: ${new Error().stack}.`);
        // Does nothing.
        return false;
      }
      const parent = node.getParent();
      parent.deleteChild(node.getLabelRadix());
      if (parent.numChildren() === 1 && !parent.hasStateNode() && parent.hasParent()) {
        retVal = this._mergeToChild(parent);
      }
    }
    if (FeatureFlags.enableHexLabelCache) {
      this.hexLabelCache.delete(stateLabel);
    }
    // Delete from the terminal node map.
    this.terminalNodeMap.delete(stateLabel);
    return retVal;
  }

  labels() {
    return [...this.terminalNodeMap.keys()];
  }

  stateNodes() {
    const LOG_HEADER = 'stateNodes';

    const stateNodeList = [];
    for (const terminalNode of this.terminalNodeMap.values()) {
      if (!terminalNode.hasStateNode()) {
        logger.error(
            `[${LOG_HEADER}] Terminal node without state node with label: ` +
            `${terminalNode.getLabel()} at: ${new Error().stack}.`);
        continue;
      }
      stateNodeList.push(terminalNode.getStateNode());
    }
    return stateNodeList;
  }

  size() {
    return this.terminalNodeMap.size;
  }

  getRootProofHash() {
    return this.root.getProofHash();
  }

  updateProofHashForRadixTree() {
    return this.root.updateProofHashForRadixSubtree();
  }

  updateProofHashForRadixPath(updatedNodeLabel) {
    const LOG_HEADER = 'updateProofHashForRadixPath';

    const node = this._getRadixNodeForReading(updatedNodeLabel);
    if (node === null) {
      logger.error(
          `[${LOG_HEADER}] Updating proof hash for non-existing child with label: ` +
          `${updatedNodeLabel} at: ${new Error().stack}.`);
      // Does nothing.
      return 0;
    }
    return node.updateProofHashForRadixPath();
  }

  verifyProofHashForRadixTree() {
    return this.root.verifyProofHashForRadixSubtree();
  }

  getProofOfState(stateLabel, stateProof) {
    let curNode = this._getRadixNodeForReading(stateLabel);
    if (curNode === null || !curNode.hasStateNode()) {
      return null;
    }
    let proof = curNode.getProofOfRadixNode(null, null, stateLabel, stateProof);
    while (curNode.hasParent()) {
      const label = curNode.getLabel();
      curNode = curNode.getParent();
      proof = curNode.getProofOfRadixNode(label, proof);
    }
    return proof;
  }

  copyFrom(radixTree, newParentStateNode) {
    for (const stateLabel of radixTree.labels()) {
      const stateNode = radixTree.get(stateLabel);
      this.set(stateLabel, stateNode);
      stateNode.addParent(newParentStateNode);
    }
    this.updateProofHashForRadixTree();
  }

  /**
   * Converts the tree to a javascript object.
   * This is for testing / debugging purpose.
   */
  toJsObject(withProofHash = false, withStateNodeDetails = false) {
    return this.root.toJsObject(withProofHash, withStateNodeDetails);
  }
}

module.exports = RadixTree;