const logger = require('../logger')('RADIX_TREE');

const CommonUtil = require('../common/common-util');
const RadixNode = require('./radix-node');

/**
 * A database for (label, stateNode) pairs. For efficient update and retrieval of proof hashes,
 * it uses a radix tree internally.
 */
class RadixTree {
  constructor() {
    this.root = new RadixNode();
    this.terminalNodeMap = new Map();
  }

  static _toHexLabel(stateLabel) {
    const hexLabelWithPrefix = CommonUtil.toHexString(stateLabel);
    const hexLabel = hexLabelWithPrefix.length >= 2 ? hexLabelWithPrefix.slice(2) : '';
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

  _getRadixNodeForWriting(stateLabel) {
    let curNode = this._getRadixNodeForReading(stateLabel);
    if (curNode !== null) {
      return curNode;
    }

    const hexLabel = RadixTree._toHexLabel(stateLabel);
    curNode = this.root
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
    const LOG_HEADER = 'get';

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
    const node = this._getRadixNodeForWriting(stateLabel);
    // Set in the terminal node map.
    this.terminalNodeMap.set(stateLabel, node);
    return node.setStateNode(stateNode);
  }

  /**
   * Merges a radix node to its the only child.
   * 
   * returns the parent of the merged node
   */
  _mergeToChild(node) {
    const LOG_HEADER = '_mergeToChild';

    if (node.numChildren() !== 1) {
      logger.error(
          `[${LOG_HEADER}] Trying to merge a node with children: ${node.getLabel()} ` +
          `at: ${new Error().stack}.`);
      // Does nothing.
      return node;
    }
    if (node.hasStateNode()) {
      logger.error(
          `[${LOG_HEADER}] Trying to merge a node with state node: ${node.getLabel()} ` +
          `at: ${new Error().stack}.`);
      // Does nothing.
      return node;
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
    return parent;
  }

  delete(stateLabel, updateProofHash = false) {
    const LOG_HEADER = 'delete';

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
    let nodeToUpdateProofHash = node;
    if (node.numChildren() === 1) {
      nodeToUpdateProofHash = this._mergeToChild(node);
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
        nodeToUpdateProofHash = this._mergeToChild(parent);
      }
    }
    if (updateProofHash) {
      nodeToUpdateProofHash.updateRadixInfoForRadixPath();
    }
    // Delete from the terminal node map.
    this.terminalNodeMap.delete(stateLabel);
    return true;
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

  getRootTreeHeight() {
    return this.root.getTreeHeight();
  }

  getRootTreeSize() {
    return this.root.getTreeSize();
  }

  getRootTreeBytes() {
    return this.root.getTreeBytes();
  }

  deleteRadixTree(parentStateNode) {
    const LOG_HEADER = 'deleteRadixTree';

    for (const terminalNode of this.terminalNodeMap.values()) {
      if (!terminalNode.hasStateNode()) {
        logger.error(
            `[${LOG_HEADER}] Terminal node without state node with label: ` +
            `${terminalNode.getLabel()} at: ${new Error().stack}.`);
        continue;
      }
      const childStateNode = terminalNode.getStateNode();
      childStateNode.deleteParent(parentStateNode);
    }
    this.terminalNodeMap.clear();
    this.root = new RadixNode();
  }

  updateRadixInfoForRadixTree() {
    return this.root.updateRadixInfoForRadixTree();
  }

  updateRadixInfoForRadixPath(updatedNodeLabel) {
    const LOG_HEADER = 'updateProofHashForRadixPath';

    const node = this._getRadixNodeForReading(updatedNodeLabel);
    if (node === null) {
      logger.error(
          `[${LOG_HEADER}] Updating proof hash for non-existing child with label: ` +
          `${updatedNodeLabel} at: ${new Error().stack}.`);
      // Does nothing.
      return 0;
    }
    return node.updateRadixInfoForRadixPath();
  }

  verifyProofHashForRadixTree() {
    return this.root.verifyProofHashForRadixTree();
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
    const LOG_HEADER = 'copyFrom';

    const terminalNodeMap = new Map();
    this.root.copyFrom(radixTree.root, newParentStateNode, terminalNodeMap);
    // Keep the insertion order.
    for (const stateLabel of radixTree.labels()) {
      const terminalNode = terminalNodeMap.get(stateLabel);
      if (terminalNode === undefined) {
        logger.error(
            `[${LOG_HEADER}] Non-existing terminal radix node with label: ${stateLabel} ` +
            `at: ${new Error().stack}.`);
        continue;
      }
      this.terminalNodeMap.set(stateLabel, terminalNode);
    }
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