const StateNode = require('./state-node');
const {
  makeCopyOfStateTree,
  deleteStateTree,
} = require('./state-util');
const { StateVersions } = require('../constants');

class StateManager {
  constructor() {
    this.rootMap = new Map();
    this.setRoot(StateVersions.FINAL, new StateNode());
    this.finalizeVersion(StateVersions.FINAL);
  }

  /**
   * Returns the finalized version.
   */
  getFinalizedVersion() {
    return this.finalizedVersion;
  }

  /**
   * Returns the finalized state root.
   */
  getFinalizedRoot() {
    return this.getRoot(this.finalizedVersion);
  }

  /**
   * Returns the state root of the given version if available, otherwise null.
   * 
   * @param {string} version state version
   */
  getRoot(version) {
    const root = this.rootMap.get(version);
    return root === undefined ? null : root;
  }

  /**
   * Sets the state root of the given version.
   * 
   * @param {string} version state version
   * @param {StateNode} root state root
   */
  setRoot(version, root) {
    this.rootMap.set(version, root);
  }

  /**
   * Returns true if the given version exists, otherwise false.
   * 
   * @param {string} version state version
   */
  hasVersion(version) {
    return this.rootMap.has(version);
  }

  /**
   * Returns all versions.
   */
  getVersionList() {
    return Array.from(this.rootMap.keys());
  }

  /**
   * Clones the finalized version to create a new version.
   * 
   * @param {string} newVersion 
   */
  cloneFinalizedVersion(newVersion) {
    return this.cloneVersion(this.getFinalizedVersion(), newVersion);
  }

  /**
   * Clones the given version to create a new version.
   * 
   * @param {string} version state version
   * @param {string} newVersion new state version
   */
  cloneVersion(version, newVersion) {
    if (!this.hasVersion(version)) {
      return null;
    }
    if (this.hasVersion(newVersion)) {
      return null;
    }
    const root = this.getRoot(version);
    if (root === null) {
      return null;
    }
    const newRoot = makeCopyOfStateTree(root);
    this.setRoot(newVersion, newRoot);
    return newRoot;
  }

  /**
   * Deletes the given version.
   * 
   * @param {string} version state version 
   */
  deleteVersion(version) {
    if (!this.hasVersion(version)) {
      return null;
    }
    if (version === this.finalizedVersion) {
      return null;
    }
    const root = this.getRoot(version);
    if (root === null) {
      return null;
    }
    deleteStateTree(root);
    this.rootMap.delete(version);
    return root;
  }

  /**
   * Sets a the given version finalized and deletes the existing finalized version.
   * 
   * @param {string} version state version
   */
  finalizeVersion(version) {
    if (version === this.finalizedVersion) {
      return false;
    }
    if (!this.hasVersion(version)) {
      return false;
    }
    const finalizedVersion = this.getFinalizedVersion();
    this.finalizedVersion = version;
    this.deleteVersion(finalizedVersion);
    return true;
  }
}

module.exports = StateManager;