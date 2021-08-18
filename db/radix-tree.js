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

  static toHexLabel(label) {
    const hexLabel = CommonUtil.toHexString(label);
    if (hexLabel.length < 2) {
      return hexLabel;
    }
    return hexLabel.slice(2);
  }

  static matchLabelSuffix(radixNode, hexLabel, index) {
    const labelSuffix = radixNode.getLabelSuffix();
    return labelSuffix.length === 0 ||
        (labelSuffix.length <= hexLabel.length - index &&
        labelSuffix === hexLabel.slice(index, index + labelSuffix.length));
  }

  static getCommonPrefix(label1, label2) {
    let labelIndex = 0;
    while (labelIndex < Math.min(label1.length, label2.length)) {
      if (label1.charAt(labelIndex) !== label2.charAt(labelIndex)) {
        break;
      }
      labelIndex++;
    }
    return label1.slice(0, labelIndex);
  }

  getRadixNodeForReading(hexLabel) {
    let curNode = this.root
    let labelIndex = 0;
    while (labelIndex < hexLabel.length) {
      const labelRadix = hexLabel.charAt(labelIndex);
      if (!curNode.hasChild(labelRadix)) {
        return null;
      }
      const child = curNode.getChild(labelRadix);
      if (!RadixTree.matchLabelSuffix(child, hexLabel, labelIndex + 1)) {
        return null;
      }
      curNode = child;
      labelIndex += 1 + child.getLabelSuffix().length;
    }
    return curNode;
  }

  getRadixNodeForWriting(hexLabel) {
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
      if (!RadixTree.matchLabelSuffix(child, hexLabel, labelIndex + 1)) {
        const labelSuffix = hexLabel.slice(labelIndex + 1);
        const childLabelSuffix = child.getLabelSuffix();
        const commonPrefix = RadixTree.getCommonPrefix(labelSuffix, childLabelSuffix);

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

  getFromTree(label) {
    const hexLabel = RadixTree.toHexLabel(label);
    const node = this.getRadixNodeForReading(hexLabel);
    if (node === null) {
      return null;
    }
    return node.getStateNode();
  }

  getFromMap(label) {
    const child = this.stateNodeMap.get(label);
    if (child === undefined) {
      return null;
    }
    return child;
  }

  get(label) {
    // NOTE(platfowner): Use hash map instead of radix tree as it faster.
    return this.getFromMap(label);
  }

  setInTree(label, stateNode) {
    const hexLabel = RadixTree.toHexLabel(label);
    const node = this.getRadixNodeForWriting(hexLabel);
    node.setStateNode(stateNode);
  }

  setInMap(label, stateNode) {
    this.stateNodeMap.set(label, stateNode);
  }

  set(label, stateNode) {
    // 1. Set in the radix tree.
    this.setInTree(label, stateNode);
    // 2. Set in the hash map.
    this.setInMap(label, stateNode);
  }

  hasInTree(label) {
    const hexLabel = RadixTree.toHexLabel(label);
    const node = this.getRadixNodeForReading(hexLabel);
    if (node === null) {
      return false;
    }
    return true;
  }

  hasInMap(label) {
    return this.stateNodeMap.has(label);
  }

  has(label) {
    // NOTE(platfowner): Use hash map instead of radix tree as it faster.
    return this.hasInMap(label);
  }

  mergeToChild(node) {
    const LOG_HEADER = 'mergeToChild';

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

  deleteFromTree(label) {
    const LOG_HEADER = 'deleteFromTree';

    const hexLabel = RadixTree.toHexLabel(label);
    const node = this.getRadixNodeForReading(hexLabel);
    if (node === null || !node.hasStateNode()) {
      logger.error(`[${LOG_HEADER}] Deleting a non-existing child with label: ${label}.`);
      // Does nothing.
      return false;
    }
    node.resetStateNode();
    if (node.numChildren() === 1 && node.hasParent()) {
      this.mergeToChild(node);
    } else if (node.numChildren() === 0) {
      if (!node.hasParent()) {
        logger.error(`[${LOG_HEADER}] Deleting a child without parent with label: ${label}.`);
        // Does nothing.
        return false;
      }
      const parent = node.getParent();
      parent.deleteChild(node.getLabelRadix());
      if (parent.numChildren() === 1 && !parent.hasStateNode() && parent.hasParent()) {
        this.mergeToChild(parent);
      }
    }
  }

  deleteFromMap(label) {
    this.stateNodeMap.delete(label);
  }

  delete(label) {
    // 1. Delete from the radix tree.
    this.deleteFromTree(label);
    // 2. Delete from the hash map.
    this.deleteFromMap(label);
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

  toJsObject() {
    return this.root.toJsObject();
  }
}

module.exports = RadixTree;