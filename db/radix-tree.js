const logger = require('../logger')('RADIX_TREE');

const CommonUtil = require('../common/common-util');
const RadixNode = require('./radix-node');

/**
 * A database for (label, stateNode) pairs. For efficient update and retrieval of proof hashes,
 * it uses a radix tree internally.
 */
// TODO(platfowner): Add access methods for proof hashes.
class RadixTree {
  constructor() {
    this.root = new RadixNode();
    this.stateNodeMap = new Map();
  }

  static _toHexLabel(label) {
    const hexLabel = CommonUtil.toHexString(label);
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

        // Insert new internal node between curNode and child.
        const newInternal = new RadixNode();
        curNode.deleteChild(labelRadix);
        curNode.setChild(labelRadix, commonPrefix, newInternal);
        const childNewLabel = childLabelSuffix.slice(commonPrefix.length);
        newInternal.setChild(childNewLabel.charAt(0), childNewLabel.slice(1), child);

        // Insert new child node.
        const newChild = new RadixNode();
        const newChildLabel = labelSuffix.slice(commonPrefix.length);
        newInternal.setChild(newChildLabel.charAt(0), newChildLabel.slice(1), newChild);

        return newChild;
      }

      // Case 3: Has a child with matching label suffix.
      curNode = child;
      labelIndex += 1 + child.getLabelSuffix().length;
    }

    return curNode;
  }

  _getFromTree(label) {
    const hexLabel = RadixTree._toHexLabel(label);
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

  _setInTree(label, stateNode) {
    const hexLabel = RadixTree._toHexLabel(label);
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

  _hasInTree(label) {
    const hexLabel = RadixTree._toHexLabel(label);
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

  _deleteFromTree(label) {
    const LOG_HEADER = '_deleteFromTree';

    const hexLabel = RadixTree._toHexLabel(label);
    const node = this._getRadixNodeForReading(hexLabel);
    if (node === null || !node.hasStateNode()) {
      logger.error(`[${LOG_HEADER}] Deleting a non-existing child with label: ${label}.`);
      // Does nothing.
      return false;
    }
    if (!node.hasParent()) {
      logger.error(`[${LOG_HEADER}] Deleting the root node with label: ${label}?`);
      // Does nothing.
      return false;
    }
    node.resetStateNode();
    if (node.numChildren() === 1) {
      return this._mergeToChild(node);
    } else if (node.numChildren() === 0) {
      if (!node.hasParent()) {
        logger.error(`[${LOG_HEADER}] Deleting a child without parent with label: ${label}.`);
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

  _deleteFromMap(label) {
    this.stateNodeMap.delete(label);
  }

  delete(label) {
    // 1. Delete from the radix tree.
    this._deleteFromTree(label);
    // 2. Delete from the hash map.
    this._deleteFromMap(label);
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

  /**
   * Converts the tree to a javascript object.
   * This is for testing / debugging purpose.
   */
  toJsObject() {
    return this.root.toJsObject();
  }
}

module.exports = RadixTree;