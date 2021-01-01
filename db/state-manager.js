const logger = require('../logger')('STATE_MANAGER');
const StateNode = require('./state-node');
const {
  makeCopyOfStateTree,
  replaceStateTreeVersion,
  deleteStateTree,
  deleteStateTreeVersion,
} = require('./state-util');
const {
  FeatureFlags,
  StateVersions,
} = require('../common/constants');

class StateManager {
  constructor() {
    this.rootMap = new Map();
    this._setRoot(StateVersions.EMPTY, new StateNode(StateVersions.EMPTY));
    this._setFinalVersion(null);
  }

  /**
   * Returns the number of versions.
   */
  numVersions() {
    return this.rootMap.size;
  }

  /**
   * Returns the final version.
   */
  getFinalVersion() {
    return this.finalVersion;
  }

  /**
   * Returns whether the given version is finalized.
   */
  isFinalVersion(version) {
    return this.getFinalVersion() === version;
  }

  /**
   * Sets the final version.
   * This is priviate method. Use finalizeVersion() instead.
   */
  _setFinalVersion(version) {
    this.finalVersion = version;
  }

  /**
   * Returns the final state root.
   */
  getFinalRoot() {
    return this.getRoot(this.finalVersion);
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
   * This is priviate method. Use clone methods instead.
   * 
   * @param {string} version state version
   * @param {StateNode} root state root
   */
  _setRoot(version, root) {
    this.rootMap.set(version, root);
  }

  /**
   * Deletes the state root of the given version.
   * This is priviate method. Use deleteVersion() instead.
   * 
   * @param {string} version state version
   */
  _deleteRoot(version) {
    this.rootMap.delete(version);
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
   * Clones the final version to create a new version.
   * 
   * @param {string} newVersion 
   */
  cloneFinalVersion(newVersion) {
    return this.cloneVersion(this.getFinalVersion(), newVersion);
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
      logger.error(`[${LOG_HEADER}] Non-existing version: ${version}`);
      return null;
    }
    if (this.hasVersion(newVersion)) {
      logger.error(`[${LOG_HEADER}] Already existing new version: ${newVersion}`);
      return null;
    }
    const root = this.getRoot(version);
    if (root === null) {
      logger.error(`[${LOG_HEADER}] Null root of version: ${version}`);
      return null;
    }
    let newRoot = null;
    if (FeatureFlags.enableStateVersionOpt) {
      newRoot = root.clone(newVersion);
    } else {
      newRoot = makeCopyOfStateTree(root);
    }
    this._setRoot(newVersion, newRoot);
    return newRoot;
  }

  /**
   * Replaces the subtree nodes' version of the given newVersion root with newVersion
   * if their version is the given oldVersion.
   * 
   * @param {string} oldVersion state version to replace
   * @param {string} newVersion new state version 
   */
  replaceVersion(oldVersion, newVersion) {
    const LOG_HEADER = 'renameVersion';
    logger.info(
        `[${LOG_HEADER}] Renaming version ${oldVersion} -> ${newVersion} (${this.numVersions()})`);
    if (!this.hasVersion(newVersion)) {
      logger.error(`[${LOG_HEADER}] Non-existing version: ${newVersion}`);
      return false;
    }
    const root = this.getRoot(newVersion);
    if (root === null) {
      logger.error(`[${LOG_HEADER}] Null root of version: ${newVersion}`);
      return false;
    }
    let numRenamedNodes = replaceStateTreeVersion(root, oldVersion, newVersion);
    logger.info(`[${LOG_HEADER}] Renamed ${numRenamedNodes} state nodes.`);
    return true;
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
      logger.error(`[${LOG_HEADER}] Non-existing version: ${version}`);
      return null;
    }
    if (version === this.finalVersion) {
      logger.error(`[${LOG_HEADER}] Not allowed to delete final version: ${version}`);
      return null;
    }
    const root = this.getRoot(version);
    if (root === null) {
      logger.error(`[${LOG_HEADER}] Null root of version: ${version}`);
      return null;
    }
    let numDeletedNodes = null;
    if (FeatureFlags.enableStateVersionOpt) {
      numDeletedNodes = deleteStateTreeVersion(root, version);
    } else {
      numDeletedNodes = deleteStateTree(root);
    }
    logger.info(`[${LOG_HEADER}] Deleted ${numDeletedNodes} state nodes.`);
    this._deleteRoot(version);
    return root;
  }

  /**
   * Finalize the given version.
   * 
   * @param {string} version state version to finalize
   */
  finalizeVersion(version) {
    const LOG_HEADER = 'finalizeVersion';
    logger.info(`[${LOG_HEADER}] Finalizing version '${version}' among ` +
        `${this.numVersions()} versions: ${JSON.stringify(this.getVersionList())}` +
        ` with latest final version: '${this.getFinalVersion()}'`);
    if (version === this.finalVersion) {
      logger.error(`[${LOG_HEADER}] Already final version: ${version}`);
      return false;
    }
    if (!this.hasVersion(version)) {
      logger.error(`[${LOG_HEADER}] Non-existing version: ${version}`);
      return false;
    }
    this._setFinalVersion(version);
    return true;
  }

  /**
   * Returns a random state version with the given version prefix.
   * @param {string} versionPrefix version prefix
   */
  static createRandomVersion(versionPrefix) {
    return `${versionPrefix}:${Date.now()}:${Math.floor(Math.random() * 10000)}`;
  }
}

module.exports = StateManager;