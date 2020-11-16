const StateManager = require('../db/state-manager');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const { StateVersions } = require('../constants');
const { stateTreeToJsObject } = require('../db/state-util');
const StateNode = require('../db/state-node');

describe("state-manager", () => {
  let manager;

  beforeEach(() => {
    manager = new StateManager();
  })

  describe("Initialize", () => {
    it("finalizedVersion", () => {
      expect(manager.finalizedVersion).to.equal(null);
    });

    it("rootMap", () => {
      expect(manager.rootMap.size).to.equal(1);
      expect(manager.rootMap.get(StateVersions.EMPTY)).to.not.equal(null);
    });
  });

  describe("Get APIs", () => {
    beforeEach(() => {
      const finalRoot = new StateNode();
      finalRoot.setValue('final value');
      manager._setRoot('final version', finalRoot);
      manager.finalizeVersion('final version');
    })

    it("numVersions", () => {
      expect(manager.numVersions()).to.equal(2);
      const newRoot = new StateNode();
      manager._setRoot('new version', newRoot);
      expect(manager.numVersions()).to.equal(3);
    });

    it("getFinalizedVersion", () => {
      expect(manager.getFinalizedVersion()).to.equal('final version');
    });

    it("isFinalizedVersion", () => {
      expect(manager.isFinalizedVersion('final version')).to.equal(true);
      expect(manager.isFinalizedVersion(StateVersions.EMPTY)).to.equal(false);
      expect(manager.isFinalizedVersion(null)).to.equal(false);
      expect(manager.isFinalizedVersion(undefined)).to.equal(false);
    });

    it("getFinalizedRoot", () => {
      expect(manager.getFinalizedRoot()).to.equal(manager.rootMap.get('final version'));
    });

    it("getRoot", () => {
      expect(manager.getRoot(StateVersions.EMPTY)).to.equal(manager.rootMap.get(StateVersions.EMPTY));
      expect(manager.getRoot('final version')).to.equal(manager.rootMap.get('final version'));
    });

    it("hasVersion", () => {
      expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
      expect(manager.hasVersion('final version')).to.equal(true);
      expect(manager.hasVersion('some other version')).to.equal(false);
      expect(manager.hasVersion(null)).to.equal(false);
      expect(manager.hasVersion(undefined)).to.equal(false);
    });

    it("getVersionList", () => {
      assert.deepEqual(manager.getVersionList(), [StateVersions.EMPTY, 'final version']);
    });
  });

  describe("Set APIs", () => {
    beforeEach(() => {
      const finalRoot = new StateNode();
      finalRoot.setValue('final value');
      manager._setRoot('final version', finalRoot);
      manager.finalizeVersion('final version');
    })

    it("_setRoot", () => {
      expect(manager.numVersions()).to.equal(2);

      const newRoot = new StateNode();
      newRoot.setValue('some value');
      manager._setRoot('new version', newRoot);
      expect(manager.numVersions()).to.equal(3);
      expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
      expect(manager.hasVersion('final version')).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(
          manager.getVersionList(), [StateVersions.EMPTY, 'final version', 'new version']);
      expect(manager.isFinalizedVersion('final version')).to.equal(true);
      assert.deepEqual(stateTreeToJsObject(manager.getRoot('new version')), 'some value');
    });

    it("cloneFinalizedVersion", () => {
      const finalizedRoot = manager.getFinalizedRoot();
      finalizedRoot.setValue('final value');
      assert.deepEqual(stateTreeToJsObject(manager.getFinalizedRoot()), 'final value');
      expect(manager.numVersions()).to.equal(2);

      const clonedRoot = manager.cloneFinalizedVersion('new version');
      expect(clonedRoot).to.not.equal(null);
      assert.deepEqual(clonedRoot, manager.getRoot('new version'));
      expect(manager.numVersions()).to.equal(3);
      expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
      expect(manager.hasVersion('final version')).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(
          manager.getVersionList(), [StateVersions.EMPTY, 'final version', 'new version']);
      expect(manager.isFinalizedVersion('final version')).to.equal(true);
      assert.deepEqual(stateTreeToJsObject(clonedRoot), 'final value');
    });

    it("cloneVersion", () => {
      const newRoot = new StateNode();
      newRoot.setValue('some value');
      manager._setRoot('new version', newRoot);
      expect(manager.numVersions()).to.equal(3);
      assert.deepEqual(
          manager.getVersionList(), [StateVersions.EMPTY, 'final version', 'new version']);

      const clonedRoot = manager.cloneVersion('new version', 'new new version');
      expect(clonedRoot).to.not.equal(null);
      assert.deepEqual(clonedRoot, manager.getRoot('new new version'));
      expect(manager.numVersions()).to.equal(4);
      expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
      expect(manager.hasVersion('final version')).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      expect(manager.hasVersion('new new version')).to.equal(true);
      assert.deepEqual(
          manager.getVersionList(),
          [StateVersions.EMPTY, 'final version', 'new version', 'new new version']);
      expect(manager.isFinalizedVersion('final version')).to.equal(true);
      assert.deepEqual(stateTreeToJsObject(clonedRoot), 'some value');
    });

    it("deleteVersion w/ non-finalized version", () => {
      const newRoot = new StateNode();
      newRoot.setValue('some value');
      manager._setRoot('new version', newRoot);
      expect(manager.numVersions()).to.equal(3);
      expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
      expect(manager.hasVersion('final version')).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(
          manager.getVersionList(), [StateVersions.EMPTY, 'final version', 'new version']);
      expect(manager.isFinalizedVersion('final version')).to.equal(true);

      expect(manager.deleteVersion('new version')).to.not.equal(null);
      expect(manager.numVersions()).to.equal(2);
      expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
      expect(manager.hasVersion('final version')).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(false);
      assert.deepEqual(manager.getVersionList(), [StateVersions.EMPTY, 'final version']);
      expect(manager.isFinalizedVersion('final version')).to.equal(true);
    });

    it("deleteVersion w/ finalized version", () => {
      expect(manager.numVersions()).to.equal(2);
      expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
      expect(manager.hasVersion('final version')).to.equal(true);
      assert.deepEqual(manager.getVersionList(), [StateVersions.EMPTY, 'final version']);
      expect(manager.isFinalizedVersion('final version')).to.equal(true);

      expect(manager.deleteVersion('final version')).to.equal(null);
      expect(manager.numVersions()).to.equal(2);
      expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
      expect(manager.hasVersion('final version')).to.equal(true);
      assert.deepEqual(manager.getVersionList(), [StateVersions.EMPTY, 'final version']);
      expect(manager.isFinalizedVersion('final version')).to.equal(true);
    });

    it("finalizeVersion w/ non-finalized version", () => {
      const newRoot = new StateNode();
      newRoot.setValue('some value');
      manager._setRoot('new version', newRoot);
      expect(manager.numVersions()).to.equal(3);
      expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
      expect(manager.hasVersion('final version')).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(
          manager.getVersionList(), [StateVersions.EMPTY, 'final version', 'new version']);
      expect(manager.isFinalizedVersion(StateVersions.EMPTY)).to.equal(false);
      expect(manager.isFinalizedVersion('final version')).to.equal(true);
      expect(manager.isFinalizedVersion('new version')).to.equal(false);

      expect(manager.finalizeVersion('new version')).to.equal(true);
      expect(manager.numVersions()).to.equal(3);
      expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
      expect(manager.hasVersion('final version')).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(
          manager.getVersionList(), [StateVersions.EMPTY, 'final version', 'new version']);
      expect(manager.isFinalizedVersion(StateVersions.EMPTY)).to.equal(false);
      expect(manager.isFinalizedVersion('final version')).to.equal(false);
      expect(manager.isFinalizedVersion('new version')).to.equal(true);
    });

    it("finalizeVersion w/ finalized version", () => {
      const newRoot = new StateNode();
      newRoot.setValue('some value');
      manager._setRoot('new version', newRoot);
      expect(manager.numVersions()).to.equal(3);
      expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
      expect(manager.hasVersion('final version')).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(
          manager.getVersionList(), [StateVersions.EMPTY, 'final version', 'new version']);
      expect(manager.isFinalizedVersion(StateVersions.EMPTY)).to.equal(false);
      expect(manager.isFinalizedVersion('final version')).to.equal(true);
      expect(manager.isFinalizedVersion('new version')).to.equal(false);

      expect(manager.finalizeVersion('final version')).to.equal(false);
      expect(manager.numVersions()).to.equal(3);
      expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
      expect(manager.hasVersion('final version')).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(
          manager.getVersionList(), [StateVersions.EMPTY, 'final version', 'new version']);
      expect(manager.isFinalizedVersion(StateVersions.EMPTY)).to.equal(false);
      expect(manager.isFinalizedVersion('final version')).to.equal(true);
      expect(manager.isFinalizedVersion('new version')).to.equal(false);
    });
  });
});