const StateManager = require('../db/state-manager');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const { StateVersions } = require('../common/constants');
const StateNode = require('../db/state-node');

describe("state-manager", () => {
  let manager;

  beforeEach(() => {
    manager = new StateManager();
  })

  describe("Initialize", () => {
    it("finalVersion", () => {
      expect(manager.getFinalVersion()).to.equal(null);
    });

    it("rootMap", () => {
      expect(manager.rootMap.size).to.equal(1);
      expect(manager.rootMap.get(StateVersions.EMPTY)).to.not.equal(null);
    });
  });

  describe("Get API", () => {
    const finalVersion = 'final version';

    beforeEach(() => {
      const finalRoot = new StateNode();
      finalRoot.setValue('final value');
      manager._setRoot(finalVersion, finalRoot);
      manager.finalizeVersion(finalVersion);
    })

    it("numVersions", () => {
      expect(manager.numVersions()).to.equal(2);
      const newRoot = new StateNode();
      manager._setRoot('new version', newRoot);
      expect(manager.numVersions()).to.equal(3);
    });

    it("getFinalVersion", () => {
      expect(manager.getFinalVersion()).to.equal(finalVersion);
    });

    it("isFinalVersion", () => {
      expect(manager.isFinalVersion(finalVersion)).to.equal(true);
      expect(manager.isFinalVersion(StateVersions.EMPTY)).to.equal(false);
      expect(manager.isFinalVersion(null)).to.equal(false);
      expect(manager.isFinalVersion(undefined)).to.equal(false);
    });

    it("getFinalRoot", () => {
      expect(manager.getFinalRoot()).to.equal(manager.rootMap.get(finalVersion));
    });

    it("getRoot", () => {
      expect(manager.getRoot(StateVersions.EMPTY)).to.equal(manager.rootMap.get(StateVersions.EMPTY));
      expect(manager.getRoot(finalVersion)).to.equal(manager.rootMap.get(finalVersion));
    });

    it("hasVersion", () => {
      expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
      expect(manager.hasVersion(finalVersion)).to.equal(true);
      expect(manager.hasVersion('some other version')).to.equal(false);
      expect(manager.hasVersion(null)).to.equal(false);
      expect(manager.hasVersion(undefined)).to.equal(false);
    });

    it("getVersionList", () => {
      assert.deepEqual(manager.getVersionList(), [StateVersions.EMPTY, finalVersion]);
    });
  });

  describe("Set API", () => {
    const finalVersion = 'final version';

    beforeEach(() => {
      const finalRoot = new StateNode();
      finalRoot.setValue(finalVersion);
      manager._setRoot(finalVersion, finalRoot);
      manager.finalizeVersion(finalVersion);
    })

    describe("_setRoot", () => {
      it("_setRoot", () => {
        expect(manager.numVersions()).to.equal(2);

        const newRoot = new StateNode();
        newRoot.setValue('some value');
        manager._setRoot('new version', newRoot);
        expect(manager.numVersions()).to.equal(3);
        expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
        expect(manager.hasVersion(finalVersion)).to.equal(true);
        expect(manager.hasVersion('new version')).to.equal(true);
        assert.deepEqual(
            manager.getVersionList(), [StateVersions.EMPTY, finalVersion, 'new version']);
        expect(manager.isFinalVersion(finalVersion)).to.equal(true);
        assert.deepEqual(manager.getRoot('new version').toJsObject(), 'some value');
      });
    })

    describe("cloneFinalVersion", () => {
      it("cloneFinalVersion", () => {
        const finalRoot = manager.getFinalRoot();
        finalRoot.setValue('final value');
        assert.deepEqual(manager.getFinalRoot().toJsObject(), 'final value');
        expect(manager.numVersions()).to.equal(2);

        const clonedRoot = manager.cloneFinalVersion('new version');
        expect(clonedRoot).to.not.equal(null);
        assert.deepEqual(clonedRoot, manager.getRoot('new version'));
        expect(manager.numVersions()).to.equal(3);
        expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
        expect(manager.hasVersion(finalVersion)).to.equal(true);
        expect(manager.hasVersion('new version')).to.equal(true);
        assert.deepEqual(
            manager.getVersionList(), [StateVersions.EMPTY, finalVersion, 'new version']);
        expect(manager.isFinalVersion(finalVersion)).to.equal(true);
        assert.deepEqual(clonedRoot.toJsObject(), 'final value');
      });
    });

    describe("cloneVersion", () => {
      it("cloneVersion", () => {
        const newRoot = new StateNode();
        newRoot.setValue('some value');
        manager._setRoot('new version', newRoot);
        expect(manager.numVersions()).to.equal(3);
        assert.deepEqual(
            manager.getVersionList(), [StateVersions.EMPTY, finalVersion, 'new version']);

        const clonedRoot = manager.cloneVersion('new version', 'new new version');
        expect(clonedRoot).to.not.equal(null);
        assert.deepEqual(clonedRoot, manager.getRoot('new new version'));
        expect(manager.numVersions()).to.equal(4);
        expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
        expect(manager.hasVersion(finalVersion)).to.equal(true);
        expect(manager.hasVersion('new version')).to.equal(true);
        expect(manager.hasVersion('new new version')).to.equal(true);
        assert.deepEqual(
            manager.getVersionList(),
            [StateVersions.EMPTY, finalVersion, 'new version', 'new new version']);
        expect(manager.isFinalVersion(finalVersion)).to.equal(true);
        assert.deepEqual(clonedRoot.toJsObject(), 'some value');
      });
    });

    describe("transferStateTree", () => {
      it("transferStateTree w/ existing version", () => {
        const newRoot = new StateNode();
        newRoot.setValue('some value');
        manager._setRoot('new version', newRoot);
        expect(manager.numVersions()).to.equal(3);
        assert.deepEqual(
            manager.getVersionList(), [StateVersions.EMPTY, finalVersion, 'new version']);

        expect(manager.transferStateTree(finalVersion, 'new version')).to.equal(true);
      });

      it("transferStateTree w/ non-existing version", () => {
        const newRoot = new StateNode();
        newRoot.setValue('some value');
        manager._setRoot('new version', newRoot);
        expect(manager.numVersions()).to.equal(3);
        assert.deepEqual(
            manager.getVersionList(), [StateVersions.EMPTY, finalVersion, 'new version']);

        expect(manager.transferStateTree(finalVersion, 'non-existing version')).to.equal(false);
      });

      it("transferStateTree w/ a version of null root", () => {
        manager._setRoot('new version', null);
        expect(manager.numVersions()).to.equal(3);
        assert.deepEqual(
            manager.getVersionList(), [StateVersions.EMPTY, finalVersion, 'new version']);

        expect(manager.transferStateTree(finalVersion, 'new version')).to.equal(false);
      });
    });

    describe("deleteVersion", () => {
      it("deleteVersion w/ non-final version", () => {
        const newRoot = new StateNode();
        newRoot.setValue('some value');
        manager._setRoot('new version', newRoot);
        expect(manager.numVersions()).to.equal(3);
        expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
        expect(manager.hasVersion(finalVersion)).to.equal(true);
        expect(manager.hasVersion('new version')).to.equal(true);
        assert.deepEqual(
            manager.getVersionList(), [StateVersions.EMPTY, finalVersion, 'new version']);
        expect(manager.isFinalVersion(finalVersion)).to.equal(true);

        expect(manager.deleteVersion('new version')).to.not.equal(null);
        expect(manager.numVersions()).to.equal(2);
        expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
        expect(manager.hasVersion(finalVersion)).to.equal(true);
        expect(manager.hasVersion('new version')).to.equal(false);
        assert.deepEqual(manager.getVersionList(), [StateVersions.EMPTY, finalVersion]);
        expect(manager.isFinalVersion(finalVersion)).to.equal(true);
      });

      it("deleteVersion w/ final version", () => {
        expect(manager.numVersions()).to.equal(2);
        expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
        expect(manager.hasVersion(finalVersion)).to.equal(true);
        assert.deepEqual(manager.getVersionList(), [StateVersions.EMPTY, finalVersion]);
        expect(manager.isFinalVersion(finalVersion)).to.equal(true);

        expect(manager.deleteVersion(finalVersion)).to.equal(false);
        expect(manager.numVersions()).to.equal(2);
        expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
        expect(manager.hasVersion(finalVersion)).to.equal(true);
        assert.deepEqual(manager.getVersionList(), [StateVersions.EMPTY, finalVersion]);
        expect(manager.isFinalVersion(finalVersion)).to.equal(true);
      });
    });

    describe("finalizeVersion", () => {
      it("finalizeVersion w/ non-final version", () => {
        const newRoot = new StateNode();
        newRoot.setValue('some value');
        manager._setRoot('new version', newRoot);
        expect(manager.numVersions()).to.equal(3);
        expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
        expect(manager.hasVersion(finalVersion)).to.equal(true);
        expect(manager.hasVersion('new version')).to.equal(true);
        assert.deepEqual(
            manager.getVersionList(), [StateVersions.EMPTY, finalVersion, 'new version']);
        expect(manager.isFinalVersion(StateVersions.EMPTY)).to.equal(false);
        expect(manager.isFinalVersion(finalVersion)).to.equal(true);
        expect(manager.isFinalVersion('new version')).to.equal(false);

        expect(manager.finalizeVersion('new version')).to.equal(true);
        expect(manager.numVersions()).to.equal(3);
        expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
        expect(manager.hasVersion(finalVersion)).to.equal(true);
        expect(manager.hasVersion('new version')).to.equal(true);
        assert.deepEqual(
            manager.getVersionList(), [StateVersions.EMPTY, finalVersion, 'new version']);
        expect(manager.isFinalVersion(StateVersions.EMPTY)).to.equal(false);
        expect(manager.isFinalVersion(finalVersion)).to.equal(false);
        expect(manager.isFinalVersion('new version')).to.equal(true);
      });

      it("finalizeVersion w/ final version", () => {
        const newRoot = new StateNode();
        newRoot.setValue('some value');
        manager._setRoot('new version', newRoot);
        expect(manager.numVersions()).to.equal(3);
        expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
        expect(manager.hasVersion(finalVersion)).to.equal(true);
        expect(manager.hasVersion('new version')).to.equal(true);
        assert.deepEqual(
            manager.getVersionList(), [StateVersions.EMPTY, finalVersion, 'new version']);
        expect(manager.isFinalVersion(StateVersions.EMPTY)).to.equal(false);
        expect(manager.isFinalVersion(finalVersion)).to.equal(true);
        expect(manager.isFinalVersion('new version')).to.equal(false);

        expect(manager.finalizeVersion(finalVersion)).to.equal(false);
        expect(manager.numVersions()).to.equal(3);
        expect(manager.hasVersion(StateVersions.EMPTY)).to.equal(true);
        expect(manager.hasVersion(finalVersion)).to.equal(true);
        expect(manager.hasVersion('new version')).to.equal(true);
        assert.deepEqual(
            manager.getVersionList(), [StateVersions.EMPTY, finalVersion, 'new version']);
        expect(manager.isFinalVersion(StateVersions.EMPTY)).to.equal(false);
        expect(manager.isFinalVersion(finalVersion)).to.equal(true);
        expect(manager.isFinalVersion('new version')).to.equal(false);
      });
    });
  });
});