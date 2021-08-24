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
    this.stateNodeMap = new Map();
  }

  static _toHexLabel(stateLabel) {
    const hexLabel = CommonUtil.toHexString(stateLabel);
    if (hexLabel.length < 2) {
      return hexLabel;
    }
    return hexLabel.slice(2);
  }

  static _matchLabelSuffix(radixNode, hexLabel, index) {
    const labelSuffix = radixNode.getLabelSuffix();
    return labelSuffix.length === 0 ||
        (labelSuffix.length <= hexLabel.length - index &&
        labelSuffix === hexLabel.slice(index, index + labelSuffix.length));
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

  _getRadixNodeForReading(hexLabel) {
    let curNode = this.root
    let labelIndex = 0;
    while (labelIndex < hexLabel.length) {
      const labelRadix = hexLabel.charAt(labelIndex);
      if (!curNode.hasChild(labelRadix)) {
        return null;
      }
      const child = curNode.getChild(labelRadix);
      if (!RadixTree._matchLabelSuffix(child, hexLabel, labelIndex + 1)) {
        return null;
      }
      curNode = child;
      labelIndex += 1 + child.getLabelSuffix().length;
    }
    return curNode;
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

        // Delete current child first.
        curNode.deleteChild(labelRadix);

        // Insert an internal node between curNode and child.
        const internalNode = new RadixNode();
        curNode.setChild(labelRadix, commonPrefix, internalNode);
        const childNewLabel = childLabelSuffix.slice(commonPrefix.length);
        internalNode.setChild(childNewLabel.charAt(0), childNewLabel.slice(1), child);

        // Insert new child node.
        const newChild = new RadixNode();
        const newChildLabel = labelSuffix.slice(commonPrefix.length);
        internalNode.setChild(newChildLabel.charAt(0), newChildLabel.slice(1), newChild);

        return newChild;
      }

      // Case 3: Has a child with matching label suffix.
      curNode = child;
      labelIndex += 1 + child.getLabelSuffix().length;
    }

    return curNode;
  }

  _getFromTree(stateLabel) {
    const hexLabel = RadixTree._toHexLabel(stateLabel);
    const node = this._getRadixNodeForReading(hexLabel);
    if (node === null) {
      return null;
    }
    return node.getStateNode();
  }

  _getFromMap(label) {
    const child = this.stateNodeMap.get(label);
    if (child === undefined) {
      return null;
    }
    return child;
  }

  get(label) {
    // NOTE(platfowner): Use hash map instead of radix tree as it faster.
    return this._getFromMap(label);
  }

  _setInTree(stateLabel, stateNode) {
    const hexLabel = RadixTree._toHexLabel(stateLabel);
    const node = this._getRadixNodeForWriting(hexLabel);
    return node.setStateNode(stateNode);
  }

  _setInMap(label, stateNode) {
    this.stateNodeMap.set(label, stateNode);
  }

  set(label, stateNode) {
    // 1. Set in the radix tree.
    if (!this._setInTree(label, stateNode)) {
      return false;
    }
    // 2. Set in the hash map.
    this._setInMap(label, stateNode);
    return true;
  }

  _hasInTree(stateLabel) {
    const hexLabel = RadixTree._toHexLabel(stateLabel);
    const node = this._getRadixNodeForReading(hexLabel);
    return node !== null;
  }

  _hasInMap(label) {
    return this.stateNodeMap.has(label);
  }

  has(label) {
    // NOTE(platfowner): Use hash map instead of radix tree as it faster.
    return this._hasInMap(label);
  }

  _mergeToChild(node) {
    const LOG_HEADER = '_mergeToChild';

    if (node.numChildren() !== 1) {
      logger.error(`[${LOG_HEADER}] Trying to merge a node with children: ` +
          `${node.labelRadix}:${node.labelSuffix}.`);
      // Does nothing.
      return false;
    }
    if (node.hasStateNode()) {
      logger.error(`[${LOG_HEADER}] Trying to merge a node with state node: ` +
          `${node.labelRadix}:${node.labelSuffix}.`);
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

  _deleteFromTree(stateLabel) {
    const LOG_HEADER = '_deleteFromTree';

    const hexLabel = RadixTree._toHexLabel(stateLabel);
    const node = this._getRadixNodeForReading(hexLabel);
    if (node === null || !node.hasStateNode()) {
      logger.error(`[${LOG_HEADER}] Deleting a non-existing child of label: ${stateLabel}.`);
      // Does nothing.
      return false;
    }
    if (!node.hasParent()) {
      logger.error(`[${LOG_HEADER}] Deleting the root node of label: ${stateLabel}?`);
      // Does nothing.
      return false;
    }
    node.resetStateNode();
    if (node.numChildren() === 1) {
      return this._mergeToChild(node);
    } else if (node.numChildren() === 0) {
      if (!node.hasParent()) {
        logger.error(`[${LOG_HEADER}] Deleting a child without parent of label: ${stateLabel}.`);
        // Does nothing.
        return false;
      }
      const parent = node.getParent();
      parent.deleteChild(node.getLabelRadix());
      if (parent.numChildren() === 1 && !parent.hasStateNode() && parent.hasParent()) {
        return this._mergeToChild(parent);
      }
    }
    return true;
  }

  _deleteFromMap(stateLabel) {
    this.stateNodeMap.delete(stateLabel);
  }

  delete(stateLabel) {
    // 1. Delete from the radix tree.
    this._deleteFromTree(stateLabel);
    // 2. Delete from the hash map.
    this._deleteFromMap(stateLabel);
  }

  labels() {
    return [...this.stateNodeMap.keys()];
  }

  stateNodes() {
    return [...this.stateNodeMap.values()];
  }

  size() {
    return this.stateNodeMap.size;
  }

  getRootProofHash() {
    return this.root.getProofHash();
  }

  setProofHashForRadixTree() {
    return this.root.setProofHashForRadixTree();
  }

  updateProofHashForRadixPath(updatedNodeLabel) {
    const LOG_HEADER = 'updateProofHashForRadixPath';

    const hexLabel = RadixTree._toHexLabel(updatedNodeLabel);
    const node = this._getRadixNodeForReading(hexLabel);
    if (node === null) {
      logger.error(
          `[${LOG_HEADER}] Updating proof hash for non-existing child with label: ` +
          `${updatedNodeLabel}.`);
      // Does nothing.
      return 0;
    }
    return node.updateProofHashForRadixPath();
  }

  verifyProofHashForRadixTree() {
    return this.root.verifyProofHashForRadixTree();
  }

  getProofOfState(stateLabel, stateProof) {
    const hexLabel = RadixTree._toHexLabel(stateLabel);
    let curNode = this._getRadixNodeForReading(hexLabel);
    if (curNode === null || !curNode.hasStateNode()) {
      return null;
    }
    let proof = curNode.getProofOfRadixNode(null, null, stateLabel, stateProof);
    if (proof === null) {
      return null;
    }
    while (curNode.hasParent()) {
      const label = curNode.getLabel();
      curNode = curNode.getParent();
      proof = curNode.getProofOfRadixNode(label, proof);
      if (proof === null) {
        return null;
      }
    }
    return proof;
  }


  _copyTreeFrom(radixTree, newParentStateNode) {
    this.root.copyFrom(radixTree.root, newParentStateNode);
  }

  _copyMapFrom(radixTree) {
    radixTree.stateNodeMap.forEach((value, key) => {
      this._setInMap(key, value);
    });
  }

  copyFrom(radixTree, newParentStateNode) {
    this._copyTreeFrom(radixTree, newParentStateNode);
    this._copyMapFrom(radixTree);
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