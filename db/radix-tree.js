const logger = require('../logger')('RADIX_TREE');

const CommonUtil = require('../common/common-util');
const RadixNode = require('./radix-node');

/**
 * A database for (label, stateNode) pairs. For efficient update and retrieval of proof hashes,
 * it uses a radix tree internally.
 */
class RadixTree {
  constructor(version) {
    this.root = new RadixNode(version);
    this.terminalNodeMap = new Map();
  }

  static _toRadixLabel(stateLabel) {
    return CommonUtil.toHexString(stateLabel);
  }

  static _matchLabelSuffix(radixNode, radixLabel, index) {
    const labelSuffix = radixNode.getLabelSuffix();
    return labelSuffix.length === 0 ||
        (labelSuffix.length <= radixLabel.length - index &&
        radixLabel.startsWith(labelSuffix, index));
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

    const radixLabel = RadixTree._toRadixLabel(stateLabel);
    curNode = this.root
    let labelIndex = 0;
    while (labelIndex < radixLabel.length) {
      const labelRadix = radixLabel.charAt(labelIndex);

      // Case 1: No child with the label radix.
      if (!curNode.hasChild(labelRadix)) {
        const newChild = new RadixNode(this.root.getVersion());
        const labelSuffix = radixLabel.slice(labelIndex + 1);
        curNode.setChild(labelRadix, labelSuffix, newChild);

        return newChild;
      }

      // Case 2: Has a child with the label radix but no match with the label suffix.
      const child = curNode.getChild(labelRadix);
      if (!RadixTree._matchLabelSuffix(child, radixLabel, labelIndex + 1)) {
        const labelSuffix = radixLabel.slice(labelIndex + 1);
        const childLabelSuffix = child.getLabelSuffix();
        const commonPrefix = RadixTree._getCommonPrefix(labelSuffix, childLabelSuffix);

        // Delete existing child first.
        curNode.deleteChild(labelRadix);

        if (commonPrefix.length === labelSuffix.length) {
          // Insert an internal node between curNode and the existing child.
          const internalNode = new RadixNode(this.root.getVersion());
          curNode.setChild(labelRadix, commonPrefix, internalNode);

          // Insert the existing child node as a child of the internal node.
          const childNewLabel = childLabelSuffix.slice(commonPrefix.length);
          RadixTree._setChildWithLabel(internalNode, childNewLabel, child);

          // Return the new internal node
          return internalNode;
        } else {
          // Insert an internal node between curNode and two child nodes.
          const internalNode = new RadixNode(this.root.getVersion());
          curNode.setChild(labelRadix, commonPrefix, internalNode);

          // Insert the existing child node as a child of the internal node.
          const childNewLabel = childLabelSuffix.slice(commonPrefix.length);
          RadixTree._setChildWithLabel(internalNode, childNewLabel, child);

          // Insert new child node as a child of the internal node.
          const newChild = new RadixNode(this.root.getVersion());
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
    const parentNodes = node.getParentNodes();
    const labelRadix = node.getLabelRadix();
    const labelSuffix = node.getLabelSuffix();
    const child = node.getChildNodes()[0];
    const childLabelRadix = child.getLabelRadix();
    const childLabelSuffix = child.getLabelSuffix();
    const newChildLabelSuffix = labelSuffix + childLabelRadix + childLabelSuffix;
    node.deleteChild(childLabelRadix);
    for (const parent of parentNodes) {
      parent.deleteChild(labelRadix);
      parent.setChild(labelRadix, newChildLabelSuffix, child);
    }
    return parentNodes;
  }

  delete(stateLabel, shouldUpdateRadixInfo = false) {
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
    const labelRadix = node.getLabelRadix();
    node.resetStateNode();
    let nodesToUpdate = [node];
    if (node.numChildren() === 1) {  // the node has only 1 child.
      const theOnlyChild = node.getChildNodes()[0];
      if (theOnlyChild.numParents() === 1) {  // the child has only 1 parent.
        nodesToUpdate = this._mergeToChild(node);
      }
    } else if (node.numChildren() === 0) {
      if (node.numParents() === 1) {  // the node has only 1 parent.
        const theOnlyParent = node.getParentNodes()[0];
        theOnlyParent.deleteChild(labelRadix);
        nodesToUpdate.push(theOnlyParent);
        if (theOnlyParent.numChildren() === 1 &&  // the parent has only 1 child.
            !theOnlyParent.hasStateNode() &&  // the parent has no state node
            theOnlyParent.hasParent()) {  // the parent is not the root.
          nodesToUpdate = this._mergeToChild(theOnlyParent);
        }
      } else {
        nodesToUpdate = [];
        for (const parent of node.getParentNodes()) {
          parent.deleteChild(labelRadix);
          nodesToUpdate.push(parent);
        }
      }
    }
    if (shouldUpdateRadixInfo) {
      for (const toBeUpdated of nodesToUpdate) {
        toBeUpdated.updateRadixInfoForAllRootPaths();
      }
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

  updateRadixInfoForRadixTree() {
    return this.root.updateRadixInfoForRadixTree();
  }

  updateRadixInfoForAllRootPaths(updatedNodeLabel) {
    const LOG_HEADER = 'updateRadixInfoForAllRootPath';

    const node = this._getRadixNodeForReading(updatedNodeLabel);
    if (node === null) {
      logger.error(
          `[${LOG_HEADER}] Updating proof hash for non-existing child with label: ` +
          `${updatedNodeLabel} at: ${new Error().stack}.`);
      // Does nothing.
      return 0;
    }
    return node.updateRadixInfoForAllRootPaths();
  }

  verifyRadixInfoForRadixTree() {
    return this.root.verifyRadixInfoForRadixTree();
  }

  static getProofOfStateRecursive(radixLabel, curNode, labelIndex, stateProof) {
    if (labelIndex === radixLabel.length) {  // Reached the target node
      if (!curNode.hasStateNode()) {
        return null;
      }
      return curNode.getProofOfRadixNode(null, null, stateProof);
    }
    const labelRadix = radixLabel.charAt(labelIndex);
    const childNode = curNode.getChild(labelRadix);
    if (childNode === null) {
      return null;
    }
    const childLabelIndex = labelIndex + 1 + childNode.getLabelSuffix().length;
    const childProof =
        RadixTree.getProofOfStateRecursive(radixLabel, childNode, childLabelIndex, stateProof);
    if (childProof === null) {
      return null;
    }
    return curNode.getProofOfRadixNode(childNode.getLabel(), childProof, null);
  }

  getProofOfState(stateLabel, stateProof) {
    const radixLabel = RadixTree._toRadixLabel(stateLabel);
    return RadixTree.getProofOfStateRecursive(radixLabel, this.root, 0, stateProof);
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

  deleteRadixTree(parentStateNodeToDelete = null) {
    this.terminalNodeMap.clear();
    return this.root.deleteRadixTree(parentStateNodeToDelete);
  }

  /**
   * Converts the tree to a javascript object.
   * This is for testing / debugging purpose.
   */
  toJsObject(withVersion = false, withProofHash = false, withStateNodeDetails = false) {
    return this.root.toJsObject(withVersion, withProofHash, withStateNodeDetails);
  }
}

module.exports = RadixTree;