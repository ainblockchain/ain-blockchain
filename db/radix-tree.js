const logger = new (require('../logger'))('RADIX_TREE');

const CommonUtil = require('../common/common-util');
const {
  NodeConfigs,
  StateLabelProperties,
} = require('../common/constants');
const RadixNode = require('./radix-node');

/**
 * A database for (label, stateNode) pairs. For efficient update and retrieval of proof hashes,
 * it uses a radix tree internally.
 */
class RadixTree {
  constructor(version = null, parentStateNode = null) {
    this.version = version;
    this.nextSerial = 0;
    this.root = this._newRadixNode(parentStateNode);
    this.numChildStateNodes = 0;
  }

  clone(version, parentStateNode) {
    const clonedTree = new RadixTree(version);
    clonedTree.setNextSerial(this.getNextSerial());
    clonedTree.setRoot(this.root.clone(version, parentStateNode));
    clonedTree.setNumChildStateNodes(this.getNumChildStateNodes());
    return clonedTree;
  }

  _newRadixNode(parentStateNode = null) {
    return new RadixNode(this.getVersion(), this.getAndIncNextSerial(), parentStateNode);
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
    const radixLabel = RadixTree._toRadixLabel(stateLabel);
    let curNode = this.root
    let labelIndex = 0;
    while (labelIndex < radixLabel.length) {
      const childLabelRadix = radixLabel.charAt(labelIndex);

      // Case 1: Has no child with the label radix.
      if (!curNode.hasChild(childLabelRadix)) {
        return null;
      }
      const child = curNode.getChild(childLabelRadix);

      // Case 2: Has a child with the label radix but no match with the label suffix.
      if (!RadixTree._matchLabelSuffix(child, radixLabel, labelIndex + 1)) {
        return null;
      }

      // Case 3: Has a child with matching label suffix.
      curNode = child;
      labelIndex += 1 + child.getLabelSuffix().length;
    }

    return curNode;
  }

  _getRadixNodeForSetting(stateLabel) {
    const radixLabel = RadixTree._toRadixLabel(stateLabel);
    let curNode = this.root
    let labelIndex = 0;
    while (labelIndex < radixLabel.length) {
      const childLabelRadix = radixLabel.charAt(labelIndex);

      // Case 1: Has no child with the label radix.
      if (!curNode.hasChild(childLabelRadix)) {
        const newChild = this._newRadixNode();
        const labelSuffix = radixLabel.slice(labelIndex + 1);
        curNode.setChild(childLabelRadix, labelSuffix, newChild);

        return newChild;
      }
      let child = curNode.getChild(childLabelRadix);

      // Case 2: Has a child with the label radix but no match with the label suffix.
      if (!RadixTree._matchLabelSuffix(child, radixLabel, labelIndex + 1)) {
        if (child.numParents() > 1) {
          child = child.clone(this.getVersion());
        }

        const labelSuffix = radixLabel.slice(labelIndex + 1);
        const childLabelSuffix = child.getLabelSuffix();
        const commonPrefix = RadixTree._getCommonPrefix(labelSuffix, childLabelSuffix);

        // Delete existing child first.
        curNode.deleteChild(childLabelRadix);

        // Insert an internal node as a child of curNode.
        const internalNode = this._newRadixNode();
        curNode.setChild(childLabelRadix, commonPrefix, internalNode);

        // Case 2.1: The remaining part of the radix label is
        //           a substring of the existing child's label suffix.
        if (commonPrefix.length === labelSuffix.length) {
          // Insert the existing child node as a child of the internal node.
          const childNewLabel = childLabelSuffix.slice(commonPrefix.length);
          RadixTree._setChildWithLabel(internalNode, childNewLabel, child);

          // Return the new internal node
          return internalNode;
        // Case 2.2: The remaining part of the radix label is NOT
        //           a substring of the existing child's label suffix.
        } else {
          // Insert the existing child node as a child of the internal node.
          const childNewLabel = childLabelSuffix.slice(commonPrefix.length);
          RadixTree._setChildWithLabel(internalNode, childNewLabel, child);

          // Insert new child node as a child of the internal node.
          const newChild = this._newRadixNode();
          const newChildLabel = labelSuffix.slice(commonPrefix.length);
          RadixTree._setChildWithLabel(internalNode, newChildLabel, newChild);

          return newChild;
        }
      }

      // Case 3: Has a child with matching label suffix.
      const childLabelSuffix = child.getLabelSuffix();
      if (child.numParents() > 1) {
        const clonedChild = child.clone(this.getVersion());
        curNode.setChild(childLabelRadix, childLabelSuffix, clonedChild);
        curNode = clonedChild;
      } else {
        curNode = child;
      }
      labelIndex += 1 + childLabelSuffix.length;
    }

    return curNode;
  }

  _getRadixNodeForDeleting(stateLabel) {
    const LOG_HEADER = '_getRadixNodeForDeleting';

    const radixLabel = RadixTree._toRadixLabel(stateLabel);
    let curNode = this.root
    let labelIndex = 0;
    while (labelIndex < radixLabel.length) {
      const childLabelRadix = radixLabel.charAt(labelIndex);

      // Case 1: Has no child with the label radix.
      if (!curNode.hasChild(childLabelRadix)) {
        CommonUtil.logErrorWithStackTrace(
            logger, `[${LOG_HEADER}] No radix node exists for state label: ${stateLabel}`);
        return null;
      }
      const child = curNode.getChild(childLabelRadix);

      // Case 2: Has a child with the label radix but no match with the label suffix.
      if (!RadixTree._matchLabelSuffix(child, radixLabel, labelIndex + 1)) {
        CommonUtil.logErrorWithStackTrace(
            logger, `[${LOG_HEADER}] No radix node exists for state label: ${stateLabel}`);
        return null;
      }

      // Case 3: Has a child with matching label suffix.
      const childLabelSuffix = child.getLabelSuffix();
      if (child.numParents() > 1) {
        const clonedChild = child.clone(this.getVersion());
        curNode.setChild(childLabelRadix, childLabelSuffix, clonedChild);
        curNode = clonedChild;
      } else {
        curNode = child;
      }
      labelIndex += 1 + childLabelSuffix.length;
    }

    return curNode;
  }

  get(stateLabel) {
    const LOG_HEADER = 'get';

    const node = this._getRadixNodeForReading(stateLabel);
    if (node === null) {
      return null;
    }
    if (!node.hasChildStateNode()) {
      CommonUtil.logErrorWithStackTrace(
          logger, `[${LOG_HEADER}] A node without state node with label: ${node.getLabel()}`);
      return null;
    }
    return node.getChildStateNode();
  }

  has(stateLabel) {
    return this.get(stateLabel) !== null;
  }

  set(stateLabel, stateNode) {
    const node = this._getRadixNodeForSetting(stateLabel);
    if (!node.hasChildStateNode()) {
      // Update the node serial with a new value to keep the insertion order.
      node.setSerial(this.getAndIncNextSerial());
      // Increase the number of the terminal numbers.
      this.incNumChildStateNodes();
    }
    node.setChildStateNode(stateNode);
  }

  /**
   * Merges a radix node to its the only child.
   * 
   * returns the parent of the merged node
   */
  static _mergeToChild(node) {
    const LOG_HEADER = '_mergeToChild';

    if (node.numParents() === 0) {
      CommonUtil.logErrorWithStackTrace(logger, `[${LOG_HEADER}] Trying to merge a root node.`);
      // Does nothing.
      return [node];
    }
    if (node.numChildren() !== 1) {
      CommonUtil.logErrorWithStackTrace(
          logger, 
          `[${LOG_HEADER}] Trying to merge a node having ${node.numChildren()} children: ` +
          `${node.getLabel()}`);
      // Does nothing.
      return [node];
    }
    if (node.hasChildStateNode()) {
      CommonUtil.logErrorWithStackTrace(
          logger, `[${LOG_HEADER}] Trying to merge a node having a state node: ${node.getLabel()}`);
      // Does nothing.
      return [node];
    }
    const theOnlyChild = node.getChildNodes()[0];
    if (theOnlyChild.numParents() > 1) {
      // Cannot merged!!
      // Does nothing.
      return [node];
    }
    const parentNodes = node.getParentNodes();
    const labelRadix = node.getLabelRadix();
    const labelSuffix = node.getLabelSuffix();
    const childLabelRadix = theOnlyChild.getLabelRadix();
    const childLabelSuffix = theOnlyChild.getLabelSuffix();
    const newChildLabelSuffix = labelSuffix + childLabelRadix + childLabelSuffix;
    node.deleteChild(childLabelRadix);
    for (const parent of parentNodes) {
      parent.deleteChild(labelRadix);
      parent.setChild(labelRadix, newChildLabelSuffix, theOnlyChild);
    }
    return parentNodes;
  }

  delete(stateLabel, shouldUpdateRadixInfo = false) {
    const LOG_HEADER = 'delete';

    const node = this._getRadixNodeForDeleting(stateLabel);
    if (node === null || !node.hasChildStateNode()) {
      CommonUtil.logErrorWithStackTrace(
          logger, `[${LOG_HEADER}] Deleting a non-existing child of label: ${stateLabel}`);
      // Does nothing.
      return false;
    }
    if (node.numParents() === 0) {
      CommonUtil.logErrorWithStackTrace(
          logger, `[${LOG_HEADER}] Deleting the root node with label: ${stateLabel}`);
      // Does nothing.
      return false;
    }
    node.resetChildStateNode();
    this.decNumChildStateNodes();
    const labelRadix = node.getLabelRadix();
    let nodesToUpdate = [node];
    if (node.numChildren() === 1) {  // the node has only 1 child.
      const theOnlyChild = node.getChildNodes()[0];
      if (theOnlyChild.numParents() === 1) {  // the child has only 1 parent.
        nodesToUpdate = RadixTree._mergeToChild(node);
      }
    } else if (node.numChildren() === 0) {
      if (node.numParents() !== 1) {
        CommonUtil.logErrorWithStackTrace(
            logger, `[${LOG_HEADER}] Multiple parents of a cloned node with label: ${stateLabel}`);
        // Does nothing.
        return false;
      } else {  // the node has only 1 parent.
        const theOnlyParent = node.getParentNodes()[0];
        theOnlyParent.deleteChild(labelRadix);  // delete child!
        nodesToUpdate.push(theOnlyParent);
        if (theOnlyParent.numChildren() === 1 &&  // the parent has only 1 child after deletion.
            !theOnlyParent.hasChildStateNode() &&  // the parent has no state node
            theOnlyParent.numParents() === 1) {  // the parent is not a root.
          nodesToUpdate = RadixTree._mergeToChild(theOnlyParent);
        }
      }
    }
    if (shouldUpdateRadixInfo) {
      for (const toBeUpdated of nodesToUpdate) {
        toBeUpdated.updateRadixInfoForAllRootPaths();
      }
    }
    return true;
  }

  static getParentStateNodes(radixNodeList) {
    const parentNodes = [];
    for (const radixNode of radixNodeList) {
      parentNodes.push(...radixNode.getParentStateNodeList());
    }
    return parentNodes;
  }

  static hasMultipleParentStateNodes(radixNode) {
    return radixNode.hasMultipleParentStateNodes();
  }

  getVersion() {
    return this.version;
  }

  setVersion(version) {
    this.version = version;
    this.root.setVersion(version);
  }

  getNextSerial() {
    return this.nextSerial;
  }

  getAndIncNextSerial() {
    return this.nextSerial++;
  }

  setNextSerial(nextSerial) {
    this.nextSerial = nextSerial;
  }

  setRoot(root) {
    this.root = root;
  }

  getNumChildStateNodes() {
    return this.numChildStateNodes;
  }

  setNumChildStateNodes(numChildStateNodes) {
    this.numChildStateNodes = numChildStateNodes;
  }

  incNumChildStateNodes() {
    this.numChildStateNodes++;
  }

  decNumChildStateNodes() {
    this.numChildStateNodes--
  }

  getChildStateLabelsWithEndLabel(isPartial = false, lastEndLabel = null) {
    const nodesWithEndLabel = this.getChildStateNodesWithEndLabel(isPartial, lastEndLabel);
    const labelList = nodesWithEndLabel.list.map(entry => entry.getLabel());
    return {
      list: labelList,
      serialList: nodesWithEndLabel.serialList,
      endLabel: nodesWithEndLabel.endLabel,
    };
  }

  getChildStateNodesWithEndLabel(isPartial = false, lastEndLabel = null) {
    const maxListSize = isPartial ? NodeConfigs.GET_RESP_MAX_SIBLINGS : null;
    const nodeListWithEndLabel =
        this.root.getChildStateNodeListWithEndLabel(maxListSize, lastEndLabel);
    const sorted = CommonUtil.isString(lastEndLabel) ?
        nodeListWithEndLabel.list : // Skip sorting
        nodeListWithEndLabel.list.sort((a, b) => a.serial - b.serial);
    const stateNodeList = [];
    const serialList = [];
    for (const entry of sorted) {
      stateNodeList.push(entry.stateNode);
      serialList.push(entry.serial);
    }
    return {
      list: stateNodeList,
      serialList,
      endLabel: nodeListWithEndLabel.endLabel,
    };
  }

  hasChildStateNodes() {
    return this.numChildStateNodes > 0;
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

  getRootTreeMaxSiblings() {
    return this.root.getTreeMaxSiblings();
  }

  updateRadixInfoForRadixTree() {
    return this.root.updateRadixInfoForRadixTree();
  }

  updateRadixInfoForAllRootPaths(updatedNodeLabel) {
    const LOG_HEADER = 'updateRadixInfoForAllRootPath';

    const node = this._getRadixNodeForReading(updatedNodeLabel);
    if (node === null) {
      CommonUtil.logErrorWithStackTrace(
          logger, 
          `[${LOG_HEADER}] Updating proof hash for non-existing child with label: ` +
          `${updatedNodeLabel}`);
      // Does nothing.
      return 0;
    }
    return node.updateRadixInfoForAllRootPaths();
  }

  verifyRadixInfoForRadixTree() {
    return this.root.verifyRadixInfoForRadixTree();
  }

  static getProofOfStateNodeRecursive(
      radixLabel, curNode, isRootRadixNode, labelIndex, stateProof) {
    if (labelIndex === radixLabel.length) {  // Reached the target node
      if (!curNode.hasChildStateNode()) {
        return null;
      }
      return curNode.getProofOfRadixNode(null, null, stateProof, isRootRadixNode);
    }
    const labelRadix = radixLabel.charAt(labelIndex);
    const childNode = curNode.getChild(labelRadix);
    if (childNode === null) {
      return null;
    }
    const childLabelIndex = labelIndex + 1 + childNode.getLabelSuffix().length;
    const childProof = RadixTree.getProofOfStateNodeRecursive(
        radixLabel, childNode, false, childLabelIndex, stateProof);
    if (childProof === null) {
      return null;
    }
    return curNode.getProofOfRadixNode(
        childNode.getLabel(), childProof, null, isRootRadixNode);
  }

  getProofOfStateNode(stateLabel, stateProof) {
    const radixLabel = RadixTree._toRadixLabel(stateLabel);
    return RadixTree.getProofOfStateNodeRecursive(radixLabel, this.root, true, 0, stateProof);
  }

  verifyProofHashForRadixTree(curLabels = []) {
    return this.root.verifyProofHashForRadixTree(curLabels);
  }

  deleteRadixTreeVersion() {
    this.setNumChildStateNodes(0);
    return this.root.deleteRadixTreeVersion();
  }

  /**
   * Constructs a radix tree from the given snapshot object.
   */
  static fromRadixSnapshot(obj) {
    const root = RadixNode.fromRadixSnapshot(obj);
    const version = root.getVersion();
    const tree = new RadixTree(version);
    tree.setRoot(root);
    tree.setNextSerial(obj[StateLabelProperties.NEXT_SERIAL]);
    // NOTE(platfowner): Need to recompute and set numChildStateNodes.
    const numChildStateNodes = tree.getChildStateLabelsWithEndLabel().list.length;
    tree.setNumChildStateNodes(numChildStateNodes);
    return tree;
  }

  /**
   * Converts this radix tree to a snapshot object.
   */
  toRadixSnapshot() {
    return this.root.toRadixSnapshot(this.getNextSerial());
  }

  /**
   * Converts this tree to a javascript object.
   * This is for testing / debugging purpose.
   */
  toJsObject(
      withVersion = false, withSerial = false, withProofHash = false, withTreeInfo = false,
      withNumParents = false, withHasParentStateNode = false) {
    return this.root.toJsObject(
        withVersion, withSerial, withProofHash, withTreeInfo, withNumParents,
        withHasParentStateNode);
  }
}

module.exports = RadixTree;