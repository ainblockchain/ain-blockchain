const CommonUtil = require('../common/common-util');

/**
 * Implements Radix Child Map, which is used as a component of RadixNode.
 */
class RadixChildMap {
  constructor() {
    this.size = 0;
    this.childArray = RadixChildMap.initChildArray();
  }

  static initChildArray() {
    const arr = [];
    for (let i = 0; i < 16; i++) {
      arr.push(null);
    }
    return arr;
  }

  static _labelRadixToIndex(labelRadix) {
    if (!CommonUtil.isString(labelRadix)) {
      return -1;
    }
    const code = labelRadix.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      return code - 48;
    }
    if (code >= 97 && code <= 102) {
      return code - 97 + 10;
    }
    return -1;
  }

  static _indexToLabelRadix(index) {
    if (!CommonUtil.isInteger(index)) {
      return '';
    }
    let code;
    if (index >= 0 && index <= 9) {
      code = index + 48;
    } else if (index >= 10 && index < 16) {
      code = index - 10 + 97;
    } else {
      return '';
    }
    return String.fromCharCode(code);
  }

  get(labelRadix) {
    const index = RadixChildMap._labelRadixToIndex(labelRadix);
    if (index >= 0 && index < 16) {
      return this.childArray[index];
    }
    return null;
  }

  set(labelRadix, child) {
    const index = RadixChildMap._labelRadixToIndex(labelRadix);
    if (index >= 0 && index < 16) {
      const isOverwriting = this._has(index);
      this.childArray[index] = child;
      if (!isOverwriting) {
        this.size++;
      }
      return true;
    }
    return false;
  }

  _has(index) {
    if (index >= 0 && index < 16) {
      const child = this.childArray[index];
      return child !== null;
    }
    return false;
  }

  has(labelRadix) {
    const index = RadixChildMap._labelRadixToIndex(labelRadix);
    return this._has(index);
  }

  delete(labelRadix) {
    const index = RadixChildMap._labelRadixToIndex(labelRadix);
    if (index >= 0 && index < 16) {
      if (this._has(index)) {
        this.childArray[index] = null;
        this.size--;
        return true;
      }
    }
    return false;
  }

  keys() {
    const keys = [];
    for (let i = 0; i < 16; i++) {
      if (this._has(i)) {
        keys.push(RadixChildMap._indexToLabelRadix(i));
      }
    }
    return keys;
  }

  values() {
    const values = [];
    for (let i = 0; i < 16; i++) {
      if (this._has(i)) {
        values.push(this.childArray[i]);
      }
    }
    return values;
  }
}

module.exports = RadixChildMap;