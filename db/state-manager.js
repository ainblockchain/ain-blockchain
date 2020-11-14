const StateNode = require('./state-node');
const { deleteStateTree } = require('./state-util');

const INITIAL_VERSION = "init";

class StateManager {
  constructor() {
    this.rootMap = new Map();
    this.finalizedVersion = INITIAL_VERSION;
    this.setRoot(INITIAL_VERSION, new StateNode());
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
    const finalizedVersion = this.getFinalizedVersion();
    return this.cloneVersion(finalizedVersion, newVersion);
  }

  /**
   * Clones the given version to create a new version.
   * 
   * @param {string} version state version
   * @param {string} newVersion new state version
   */
  cloneVersion(version, newVersion) {
    if (!this.hasVersion(version)) {
      return false;
    }
    if (this.hasVersion(newVersion)) {
      return false;
    }
    const root = this.getRoot(version);
    if (root === null) {
      return false;
    }
    const newRoot = makeCopyOfStateTree(root);
    this.rootMap.set(newVersion, newRoot);
    return true;
  }

  /**
   * Deletes the given version.
   * 
   * @param {string} version state version 
   */
  deleteVersion(version) {
    if (!this.hasVersion(version)) {
      return false;
    }
    const root = this.getRoot(version);
    if (root === null) {
      return false;
    }
    deleteStateTree(root);
    this.rootMap.delete(version);
    return true;
  }

  /**
   * Finalizes the given version.
   * 
   * @param {string} version state version
   */
  finalizeVersion(version) {
    if (!this.hasVersion(version)) {
      return false;
    }
    this.finalizeVersion = version;
    return true;
  }
}

module.exports = StateManager;