const StateNode = require('./state-node');
const { deleteStateTree } = require('./state-util');

const INITIAL_VERSION = "init";

class StateManager {
  constructor() {
    this.rootMap = new Map();
    this.finalizedVersion = INITIAL_VERSION;
    this.rootMap.set(INITIAL_VERSION, new StateNode());
  }

  /**
   * Returns the finalized version.
   */
  getFinalizedVersion() {
    return this.finalizedVersion;
  }

  /**
   * Returns the finalized version.
   */
  getFinalizedRoot() {
    return this.getRoot(this.finalizedVersion);
  }

  /**
   * Returns the corresponding state root of the given version if available.
   * Otherwise, returns null.
   * 
   * @param {string} version 
   */
  getRoot(version) {
    const root = this.rootMap.get(version);
    return root === undefined ? null : root;
  }

  /**
   * Returns true if the given version exists, otherwise false.
   * 
   * @param {string} version 
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
   * Clones the state root of the given version to create a new root with the given new version.
   * 
   * @param {string} version 
   * @param {string} newVersion 
   */
  cloneVersion(version, newVersion) {
    if (!this.hasVersion(version)) {
      return false;
    }
    const root = this.getRoot(version);
    const newRoot = makeCopyOfStateTree(root);
    this.rootMap.set(newVersion, newRoot);
    return true;
  }

  /**
   * Deletes the state roots of the given version.
   * 
   * @param {string} version 
   */
  deleteVersion(version) {
    if (!this.hasVersion(version)) {
      return false;
    }
    this.rootMap.delete(version);
    const root = this.getRoot(version);
    deleteStateTree(root);
    return true;
  }

  /**
   * Finalize the given version by deleting all state roots of versions lower than
   * the given version.
   * 
   * @param {string} version 
   */
  finalizeVersion(version) {
    this.finalizeVersion = version;
  }
}

module.exports = StateManager;