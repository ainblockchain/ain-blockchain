const logger = require('../logger')('STATE_MANAGER');
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
   * Returns the number of versions.
   */
  numVersions() {
    return this.rootMap.size;
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
    const LOG_HEADER = 'cloneVersion';
    logger.info(`[${LOG_HEADER}] Cloning version ${version} to version ${newVersion} ` +
        `(${this.numVersions()})`);
    if (!this.hasVersion(version)) {
      logger.error(`[${LOG_HEADER}] non-existing version: ${version}`);
      return null;
    }
    if (this.hasVersion(newVersion)) {
      logger.error(`[${LOG_HEADER}] already existing new version: ${newVersion}`);
      return null;
    }
    const root = this.getRoot(version);
    if (root === null) {
      logger.error(`[${LOG_HEADER}] null root of version: ${version}`);
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
    const LOG_HEADER = 'deleteVersion';
    logger.info(`[${LOG_HEADER}] Deleting version ${version} (${this.numVersions()})`);
    if (!this.hasVersion(version)) {
      logger.error(`[${LOG_HEADER}] non-existing version: ${version}`);
      return null;
    }
    if (version === this.finalizedVersion) {
      logger.error(`[${LOG_HEADER}] not allowed to delete finalized version: ${version}`);
      return null;
    }
    const root = this.getRoot(version);
    if (root === null) {
      logger.error(`[${LOG_HEADER}] null root of version: ${version}`);
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
    const LOG_HEADER = 'finalizeVersion';
    logger.info(`[${LOG_HEADER}] Finalizing version ${version} (${this.numVersions()})`);
    if (version === this.finalizedVersion) {
      logger.error(`[${LOG_HEADER}] already finalized version: ${version}`);
      return false;
    }
    if (!this.hasVersion(version)) {
      logger.error(`[${LOG_HEADER}] non-existing version: ${version}`);
      return false;
    }
    const finalizedVersion = this.getFinalizedVersion();
    this.finalizedVersion = version;
    this.deleteVersion(finalizedVersion);
    return true;
  }
}

module.exports = StateManager;