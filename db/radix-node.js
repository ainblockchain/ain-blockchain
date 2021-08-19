const logger = require('../logger')('RADIX_NODE');

const CommonUtil = require('../common/common-util');
const StateNode = require('./state-node');
const {
  HASH_DELIMITER,
} = require('../common/constants');

/**
 * Implements a radix node, which is used as a component of RadixTree.
 */
class RadixNode {
  constructor() {
    this.stateNode = null;
    this.labelRadix = '';
    this.labelSuffix = '';
    this.parent = null;
    this.radixChildMap = new Map();
    this.proofHash = null;
  }

  getStateNode() {
    return this.stateNode;
  }

  setStateNode(stateNode) {
    const LOG_HEADER = 'setStateNode';
    if (!(stateNode instanceof StateNode)) {
      logger.error(
          `[${LOG_HEADER}] Setting with a non-StateNode instance.`);
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

  hasLabelRadix() {
    return this.getLabelRadix() !== '';
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

  hasLabelSuffix() {
    return this.getLabelSuffix() !== '';
  }

  resetLabelSuffix() {
    this.setLabelSuffix('');
  }

  getParent() {
    return this.parent;
  }

  setParent(parent) {
    this.parent = parent;
  }

  hasParent() {
    return this.getParent() !== null;
  }

  resetParent() {
    this.setParent(null);
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
    if (this.hasChild(labelRadix)) {
      logger.error(
          `[${LOG_HEADER}] Overwriting a child with radix label ${labelRadix}.`);
      // Does nothing.
      return false;
    }
    this.radixChildMap.set(labelRadix, child);
    child.setLabelRadix(labelRadix);
    child.setLabelSuffix(labelSuffix);
    child.setParent(this);
    return true;
  }

  hasChild(labelRadix = null) {
    if (!labelRadix) {
      return this.numChildren() > 0;
    }
    return this.radixChildMap.has(labelRadix);
  }

  deleteChild(labelRadix) {
    const LOG_HEADER = 'deleteChild';
    if (!this.hasChild(labelRadix)) {
      logger.error(`[${LOG_HEADER}] Deleting a non-existing child with label: ${labelRadix}.`);
      // Does nothing.
      return false;
    }
    const child = this.getChild(labelRadix);
    this.radixChildMap.delete(labelRadix);
    child.resetLabelRadix();
    child.resetLabelSuffix();
    child.resetParent();
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

  hasProofHash() {
    return this.getProofHash() !== null;
  }

  resetProofHash() {
    this.setProofHash(null);
  }

  _buildProofHash() {
    let preimage = '';
    if (this.hasStateNode()) {
      preimage = this.getStateNode().getProofHash();
    }
    preimage += `${HASH_DELIMITER}${HASH_DELIMITER}`;
    preimage += this.getChildNodes().map((child) => {
      const childLabel = `${child.getLabelRadix()}${child.getLabelSuffix()}`;
      return `${childLabel}${HASH_DELIMITER}${child.getProofHash()}`;
    }, '').join(HASH_DELIMITER);
    return CommonUtil.hashString(preimage);
  }

  verifyProofHash() {
    return this.getProofHash() === this._buildProofHash();
  }

  updateProofHash() {
    this.setProofHash(this._buildProofHash());
  }

  setProofHashForRadixTree() {
    let numAffectedNodes = 0;
    for (const child of this.getChildNodes()) {
      numAffectedNodes += child.setProofHashForRadixTree();
    }
    this.updateProofHash();
    numAffectedNodes++;

    return numAffectedNodes;
  }

  updateProofHashForRootPath() {
    let numAffectedNodes = 0;
    let curNode = this;
    curNode.updateProofHash();
    numAffectedNodes++;
    while (curNode.hasParent()) {
      curNode = curNode.getParent();
      curNode.updateProofHash();
      numAffectedNodes++;
    }
    return numAffectedNodes;
  }

  verifyProofHashForRadixTree() {
    if (!this.verifyProofHash()) {
      return false;
    }
    for (const child of this.getChildNodes()) {
      if (!child.verifyProofHashForRadixTree()) {
        return false;
      }
    }
    return true;
  }

  /**
   * Converts the subtree to a js object.
   * This is for testing / debugging purpose.
   */
  toJsObject() {
    const obj = {};
    if (this.hasParent()) {
      obj['->'] = this.hasStateNode();
    }
    for (const child of this.getChildNodes()) {
      obj[child.getLabelRadix() + ':' + child.getLabelSuffix()] = child.toJsObject();
    }
    return obj;
  }
}

module.exports = RadixNode;