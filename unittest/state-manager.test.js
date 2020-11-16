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
      expect(manager.finalizedVersion).to.equal(StateVersions.INIT);
    });

    it("rootMap", () => {
      expect(manager.rootMap.size).to.equal(1);
      expect(manager.rootMap.get(StateVersions.INIT)).to.not.equal(null);
    });
  });

  describe("Get APIs", () => {
    it("numVersions", () => {
      expect(manager.numVersions()).to.equal(1);
      const newRoot = new StateNode();
      manager.setRoot('new version', newRoot);
      expect(manager.numVersions()).to.equal(2);
    });

    it("getFinalizedVersion", () => {
      expect(manager.getFinalizedVersion()).to.equal(StateVersions.INIT);
    });

    it("isFinalizedVersion", () => {
      expect(manager.isFinalizedVersion(StateVersions.INIT)).to.equal(true);
      expect(manager.isFinalizedVersion(StateVersions.NODE)).to.equal(false);
      expect(manager.isFinalizedVersion(null)).to.equal(false);
      expect(manager.isFinalizedVersion(undefined)).to.equal(false);
    });

    it("getFinalizedRoot", () => {
      expect(manager.getFinalizedRoot()).to.equal(manager.rootMap.get(StateVersions.INIT));
    });

    it("getRoot", () => {
      expect(manager.getRoot(StateVersions.INIT)).to.equal(manager.rootMap.get(StateVersions.INIT));
    });

    it("hasVersion", () => {
      expect(manager.hasVersion(StateVersions.INIT)).to.equal(true);
      expect(manager.hasVersion('some other version')).to.equal(false);
    });

    it("getVersionList", () => {
      assert.deepEqual(manager.getVersionList(), [StateVersions.INIT]);
    });
  });

  describe("Set APIs", () => {
    it("setRoot", () => {
      const newRoot = new StateNode();
      newRoot.setValue('some value');
      expect(manager.numVersions()).to.equal(1);

      manager.setRoot('new version', newRoot);

      expect(manager.numVersions()).to.equal(2);
      expect(manager.hasVersion(StateVersions.INIT)).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(manager.getVersionList(), [StateVersions.INIT, 'new version']);
      expect(manager.getFinalizedVersion()).to.equal(StateVersions.INIT);
      assert.deepEqual(stateTreeToJsObject(manager.getRoot('new version')), 'some value');
    });

    it("cloneFinalizedVersion", () => {
      const finalizedRoot = manager.getFinalizedRoot();
      finalizedRoot.setValue('some value');
      assert.deepEqual(stateTreeToJsObject(manager.getFinalizedRoot()), 'some value');
      expect(manager.numVersions()).to.equal(1);

      const clonedRoot = manager.cloneFinalizedVersion('new version');

      expect(clonedRoot).to.not.equal(null);
      assert.deepEqual(clonedRoot, manager.getRoot('new version'));
      expect(manager.numVersions()).to.equal(2);
      expect(manager.hasVersion(StateVersions.INIT)).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(manager.getVersionList(), [StateVersions.INIT, 'new version']);
      expect(manager.getFinalizedVersion()).to.equal(StateVersions.INIT);
      assert.deepEqual(stateTreeToJsObject(clonedRoot), 'some value');
    });

    it("cloneVersion", () => {
      const newRoot = new StateNode();
      newRoot.setValue('some value');
      manager.setRoot('new version', newRoot);
      expect(manager.numVersions()).to.equal(2);
      assert.deepEqual(manager.getVersionList(), [StateVersions.INIT, 'new version']);

      const clonedRoot = manager.cloneVersion('new version', 'new new version');

      expect(clonedRoot).to.not.equal(null);
      assert.deepEqual(clonedRoot, manager.getRoot('new new version'));
      expect(manager.numVersions()).to.equal(3);
      expect(manager.hasVersion(StateVersions.INIT)).to.equal(true);
      expect(manager.hasVersion('new new version')).to.equal(true);
      assert.deepEqual(
          manager.getVersionList(), [StateVersions.INIT, 'new version', 'new new version']);
      expect(manager.getFinalizedVersion()).to.equal(StateVersions.INIT);
      assert.deepEqual(stateTreeToJsObject(clonedRoot), 'some value');
    });

    it("deleteVersion w/ non-finalized version", () => {
      const newRoot = new StateNode();
      newRoot.setValue('some value');
      expect(manager.numVersions()).to.equal(1);
      manager.setRoot('new version', newRoot);
      expect(manager.numVersions()).to.equal(2);
      expect(manager.hasVersion(StateVersions.INIT)).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(manager.getVersionList(), [StateVersions.INIT, 'new version']);
      expect(manager.getFinalizedVersion()).to.equal(StateVersions.INIT);

      expect(manager.deleteVersion('new version')).to.not.equal(null);

      expect(manager.numVersions()).to.equal(1);
      expect(manager.hasVersion(StateVersions.INIT)).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(false);
      assert.deepEqual(manager.getVersionList(), [StateVersions.INIT]);
      expect(manager.getFinalizedVersion()).to.equal(StateVersions.INIT);
    });

    it("deleteVersion w/ finalized version", () => {
      const newRoot = new StateNode();
      newRoot.setValue('some value');
      expect(manager.numVersions()).to.equal(1);
      manager.setRoot('new version', newRoot);
      expect(manager.numVersions()).to.equal(2);
      expect(manager.hasVersion(StateVersions.INIT)).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(manager.getVersionList(), [StateVersions.INIT, 'new version']);
      expect(manager.getFinalizedVersion()).to.equal(StateVersions.INIT);

      expect(manager.deleteVersion(StateVersions.INIT)).to.equal(null);

      expect(manager.numVersions()).to.equal(2);
      expect(manager.hasVersion(StateVersions.INIT)).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(manager.getVersionList(), [StateVersions.INIT, 'new version']);
      expect(manager.getFinalizedVersion()).to.equal(StateVersions.INIT);
    });

    it("finalizeVersion w/ non-finalized version", () => {
      const newRoot = new StateNode();
      newRoot.setValue('some value');
      expect(manager.numVersions()).to.equal(1);
      manager.setRoot('new version', newRoot);
      expect(manager.numVersions()).to.equal(2);
      expect(manager.hasVersion(StateVersions.INIT)).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(manager.getVersionList(), [StateVersions.INIT, 'new version']);
      expect(manager.getFinalizedVersion()).to.equal(StateVersions.INIT);
      expect(manager.isFinalizedVersion(StateVersions.INIT)).to.equal(true);
      expect(manager.isFinalizedVersion('new version')).to.equal(false);

      expect(manager.finalizeVersion('new version')).to.equal(true);

      expect(manager.numVersions()).to.equal(1);
      expect(manager.hasVersion(StateVersions.INIT)).to.equal(false);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(manager.getVersionList(), ['new version']);
      expect(manager.getFinalizedVersion()).to.equal('new version');
      expect(manager.isFinalizedVersion(StateVersions.INIT)).to.equal(false);
      expect(manager.isFinalizedVersion('new version')).to.equal(true);
    });

    it("finalizeVersion w/ finalized version", () => {
      const newRoot = new StateNode();
      newRoot.setValue('some value');
      expect(manager.numVersions()).to.equal(1);
      manager.setRoot('new version', newRoot);
      expect(manager.numVersions()).to.equal(2);
      expect(manager.hasVersion(StateVersions.INIT)).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(manager.getVersionList(), [StateVersions.INIT, 'new version']);
      expect(manager.getFinalizedVersion()).to.equal(StateVersions.INIT);
      expect(manager.isFinalizedVersion(StateVersions.INIT)).to.equal(true);
      expect(manager.isFinalizedVersion('new version')).to.equal(false);

      expect(manager.finalizeVersion(StateVersions.INIT)).to.equal(false);

      expect(manager.numVersions()).to.equal(2);
      expect(manager.hasVersion(StateVersions.INIT)).to.equal(true);
      expect(manager.hasVersion('new version')).to.equal(true);
      assert.deepEqual(manager.getVersionList(), [StateVersions.INIT, 'new version']);
      expect(manager.getFinalizedVersion()).to.equal(StateVersions.INIT);
      expect(manager.isFinalizedVersion(StateVersions.INIT)).to.equal(true);
      expect(manager.isFinalizedVersion('new version')).to.equal(false);
    });
  });
});