const logger = require('../logger')('RADIX_NODE');

const CommonUtil = require('../common/common-util');
const {
  FeatureFlags,
  HASH_DELIMITER,
  ProofProperties,
} = require('../common/constants');
const RadixChildMap = require('./radix-child-map');

/**
 * Implements Radix Node, which is used as a component of RadixTree.
 */
class RadixNode {
  constructor() {
    this.stateNode = null;
    this.labelRadix = '';
    this.labelSuffix = '';
    this.parent = null;
    if (FeatureFlags.enableArrayRadixChildMap) {
      this.radixChildMap = new RadixChildMap();
    } else {
      this.radixChildMap = new Map();
    }
    this.proofHash = null;
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
    if (!CommonUtil.isString(labelRadix) || labelRadix.length === 0) {
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
    if (!CommonUtil.isString(labelRadix) || labelRadix.length === 0) {
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

  resetProofHash() {
    this.setProofHash(null);
  }

  _buildProofHash() {
    let preimage = '';
    if (this.hasStateNode()) {
      preimage = this.getStateNode().getProofHash();
    }
    // NOTE(platfowner): Put delimiter twice to distinguish the state node proof hash and
    // the radix child proof hash.
    preimage += `${HASH_DELIMITER}${HASH_DELIMITER}`;
    preimage += this.getChildNodes().map((child) => {
      return `${child.getLabel()}${HASH_DELIMITER}${child.getProofHash()}`;
    }).join(HASH_DELIMITER);
    return CommonUtil.hashString(preimage);
  }

  verifyProofHash() {
    return this.getProofHash() === this._buildProofHash();
  }

  updateProofHash() {
    this.setProofHash(this._buildProofHash());
  }

  updateProofHashForRadixSubtree() {
    let numAffectedNodes = 0;
    for (const child of this.getChildNodes()) {
      numAffectedNodes += child.updateProofHashForRadixSubtree();
    }
    this.updateProofHash();
    numAffectedNodes++;

    return numAffectedNodes;
  }

  updateProofHashForRadixPath() {
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

  verifyProofHashForRadixSubtree() {
    if (!this.verifyProofHash()) {
      return false;
    }
    for (const child of this.getChildNodes()) {
      if (!child.verifyProofHashForRadixSubtree()) {
        return false;
      }
    }
    return true;
  }

  getProofOfRadixNode(childLabel = null, childProof = null, stateLabel = null, stateProof = null) {
    const proof = { [ProofProperties.RADIX_PROOF_HASH]: this.getProofHash() };
    if (this.hasStateNode()) {
      Object.assign(proof, {
        [ProofProperties.LABEL]: stateLabel,
        [ProofProperties.PROOF_HASH]: stateProof !== null ?
            stateProof : this.getStateNode().getProofHash()
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

  copyFrom(radixNode, newParentStateNode) {
    if (radixNode.hasStateNode()) {
      const stateNode = radixNode.getStateNode();
      this.setStateNode(stateNode);
      stateNode.addParent(newParentStateNode);
    }
    this.setLabelRadix(radixNode.getLabelRadix());
    this.setLabelSuffix(radixNode.getLabelSuffix());
    this.setProofHash(radixNode.getProofHash());
    for (const child of radixNode.getChildNodes()) {
      const clonedChild = new RadixNode();
      this.setChild(child.getLabelRadix(), child.getLabelSuffix(), clonedChild);
      clonedChild.copyFrom(child, newParentStateNode);
    }
  }

  /**
   * Converts the subtree to a js object.
   * This is for testing / debugging purpose.
   */
  toJsObject(withProofHash = false) {
    const obj = {};
    if (withProofHash) {
      obj[ProofProperties.RADIX_PROOF_HASH] = this.getProofHash();
    }
    if (this.hasStateNode()) {
      const stateNode = this.getStateNode();
      obj[ProofProperties.LABEL] = stateNode.getLabel();
      obj[ProofProperties.PROOF_HASH] = stateNode.getProofHash();
    }
    for (const child of this.getChildNodes()) {
      obj[child.getLabel()] = child.toJsObject(withProofHash);
    }
    return obj;
  }
}

module.exports = RadixNode;