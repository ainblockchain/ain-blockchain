const StateNode = require('./state-node');

const BASE_VERSION = 'base';

class StateManager {
  constructor() {
    this.rootMap = new Map();
    this.setRoot(BASE_VERSION, new StateNode());
  }

  getBaseRoot() {
    return this.getRoot(BASE_VERSION);
  }

  getRoot(version) {
    const root = this.rootMap.get(version);
    if (root === undefined) {
      return null;
    }
    return root;
  }

  setRoot(version, root) {
    this.rootMap.set(version, root);
  }

  cloneRoot(version, newVersion) {
    // TODO(lia): Implement this.
  }

  deleteVersion(version) {
    // TODO(lia): Implement this.
  }
}

module.exports = StateManager;