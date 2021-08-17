const logger = require('../logger')('RADIX_NODE');

class RadixNode {
  constructor() {
    this.stateNode = null;
    this.labelRadix = '';
    this.labelSuffix = '';
    this.parent = null;
    this.childMap = new Map();
  }

  getStateNode() {
    return this.stateNode;
  }

  setStateNode(stateNode) {
    this.stateNode = stateNode;
  }

  hasStateNode() {
    return this.getStateNode() !== null;
  }

  resetStateNode() {
    this.setStateNode(null);
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
    const child = this.childMap.get(labelRadix);
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
    this.childMap.set(labelRadix, child);
    child.setLabelRadix(labelRadix);
    child.setLabelSuffix(labelSuffix);
    child.setParent(this);
    return true;
  }

  hasChild(labelRadix = null) {
    if (!labelRadix) {
      return this.numChildren() > 0;
    }
    return this.childMap.has(labelRadix);
  }

  deleteChild(labelRadix) {
    const LOG_HEADER = 'deleteChild';
    if (!this.hasChild(labelRadix)) {
      logger.error(`[${LOG_HEADER}] Deleting a non-existing child with label: ${labelRadix}.`);
      // Does nothing.
      return false;
    }
    const child = this.getChild(labelRadix);
    this.childMap.delete(labelRadix);
    child.resetLabelRadix();
    child.resetLabelSuffix();
    child.resetParent();
    return true;
  }

  getChildLabelRadices() {
    return [...this.childMap.keys()];
  }

  getChildNodes() {
    return [...this.childMap.values()];
  }

  numChildren() {
    return this.childMap.size;
  }
}

module.exports = RadixNode;