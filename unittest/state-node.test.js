const StateNode = require('../db/state-node');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("state-node", () => {
  let node;

  beforeEach(() => {
    node = new StateNode();
  })

  describe("Initialization", () => {
    it("initial", () => {
      expect(node.isLeaf).to.equal(true);
      expect(node.childMap).to.not.be.null;
      expect(node.value).to.equal(null);
      expect(node.proofHash).to.equal(null);
      expect(node.versionSet).to.not.be.null;
    });
  });

  describe("clone", () => {
    it("leaf node", () => {
      node.setValue('value0');
      node.setProofHash('hash');
      node.addVersion('version1');
      const clone = node.clone();
      expect(clone.getIsLeaf()).to.equal(true);
      assert.deepEqual(clone.getChildNodes(), node.getChildNodes());
      expect(clone.getValue()).to.equal('value0');
      expect(clone.getProofHash()).to.equal('hash');
      assert.deepEqual(clone.getVersions(), node.getVersions());
    });

    it("internal node", () => {
      const label1 = 'label1';
      const label2 = 'label2';
      const child1 = new StateNode();
      const child2 = new StateNode();
      child1.setValue('value1');
      child2.setValue('value2');
      node.setChild(label1, child1);
      node.setChild(label2, child2);
      node.setProofHash('hash');
      node.addVersion('version1');
      const clone = node.clone();
      expect(clone.getIsLeaf()).to.equal(false);
      assert.deepEqual(clone.getChildNodes(), node.getChildNodes());
      expect(clone.getValue()).to.equal(null);
      expect(clone.getProofHash()).to.equal('hash');
      assert.deepEqual(clone.getVersions(), node.getVersions());
    });
  });

  describe("reset", () => {
    it("leaf node", () => {
      node.setValue('value0');
      node.setProofHash('hash');
      node.addVersion('version1');
      node.reset();
      expect(node.getIsLeaf()).to.equal(true);
      expect(node.childMap).to.not.be.null;
      expect(node.numChildren()).to.equal(0);
      expect(node.getValue()).to.equal(null);
      expect(node.getProofHash()).to.equal(null);
      expect(node.versionSet).to.not.be.null;
      expect(node.numVersions()).to.equal(0);
    });

    it("internal node", () => {
      const label1 = 'label1';
      const label2 = 'label2';
      const child1 = new StateNode();
      const child2 = new StateNode();
      child1.setValue('value1');
      child2.setValue('value2');
      node.setChild(label1, child1);
      node.setChild(label2, child2);
      node.setProofHash('hash');
      node.addVersion('version1');
      node.reset();
      expect(node.getIsLeaf()).to.equal(true);
      expect(node.childMap).to.not.be.null;
      expect(node.numChildren()).to.equal(0);
      expect(node.getValue()).to.equal(null);
      expect(node.getProofHash()).to.equal(null);
      expect(node.versionSet).to.not.be.null;
      expect(node.numVersions()).to.equal(0);
    });
  });

  describe("isLeaf", () => {
    it("get / set", () => {
      expect(node.getIsLeaf()).to.equal(true);
      node.setIsLeaf(true);
      expect(node.getIsLeaf()).to.equal(true);
      node.setIsLeaf(false);
      expect(node.getIsLeaf()).to.equal(false);
    });
  });

  describe("value", () => {
    it("get / set / reset", () => {
      expect(node.getValue()).to.equal(null);
      expect(node.getIsLeaf()).to.equal(true);
      node.setValue('value1');
      expect(node.getValue()).to.equal('value1');
      expect(node.getIsLeaf()).to.equal(true);
      node.setValue('value2');
      expect(node.getValue()).to.equal('value2');
      expect(node.getIsLeaf()).to.equal(true);
      node.resetValue();
      expect(node.getValue()).to.equal(null);
      expect(node.getIsLeaf()).to.equal(true);
    });
  });

  describe("child", () => {
    it("get / set / has / delete", () => {
      const label1 = 'label1';
      const label2 = 'label2';
      const child1 = new StateNode();
      const child2 = new StateNode();
      child1.setValue('value1');
      child2.setValue('value2');
      expect(node.hasChild(label1)).to.equal(false);
      expect(node.hasChild(label2)).to.equal(false);
      assert.deepEqual(node.getChild(label1), null);
      assert.deepEqual(node.getChild(label2), null);
      node.setChild(label1, child1);
      expect(node.hasChild(label1)).to.equal(true);
      expect(node.hasChild(label2)).to.equal(false);
      assert.deepEqual(node.getChild(label1), child1);
      assert.deepEqual(node.getChild(label2), null);
      node.setChild(label2, child2);
      expect(node.hasChild(label1)).to.equal(true);
      expect(node.hasChild(label2)).to.equal(true);
      assert.deepEqual(node.getChild(label1), child1);
      assert.deepEqual(node.getChild(label2), child2);
      node.deleteChild(label1);
      expect(node.hasChild(label1)).to.equal(false);
      expect(node.hasChild(label2)).to.equal(true);
      assert.deepEqual(node.getChild(label1), null);
      assert.deepEqual(node.getChild(label2), child2);
      node.deleteChild(label2);
      expect(node.hasChild(label1)).to.equal(false);
      expect(node.hasChild(label2)).to.equal(false);
      assert.deepEqual(node.getChild(label1), null);
      assert.deepEqual(node.getChild(label2), null);
    });

    it("getChildLabels / getChildNodes / numChildren / isLeaf", () => {
      const label1 = 'label1';
      const label2 = 'label2';
      const child1 = new StateNode();
      const child2 = new StateNode();
      child1.setValue('value1');
      child2.setValue('value2');
      assert.deepEqual(node.getChildLabels(), []);
      assert.deepEqual(node.getChildNodes(), []);
      expect(node.numChildren()).to.equal(0);
      expect(node.getIsLeaf()).to.equal(true);
      node.setChild(label1, child1);
      assert.deepEqual(node.getChildLabels(), ['label1']);
      assert.deepEqual(node.getChildNodes(), [child1]);
      expect(node.numChildren()).to.equal(1);
      expect(node.getIsLeaf()).to.equal(false);
      node.deleteChild(label2);
      node.setChild(label2, child2);
      assert.deepEqual(node.getChildLabels(), ['label1', 'label2']);
      assert.deepEqual(node.getChildNodes(), [child1, child2]);
      expect(node.numChildren()).to.equal(2);
      expect(node.getIsLeaf()).to.equal(false);
      node.deleteChild(label2);
      assert.deepEqual(node.getChildLabels(), ['label1']);
      assert.deepEqual(node.getChildNodes(), [child1]);
      expect(node.numChildren()).to.equal(1);
      expect(node.getIsLeaf()).to.equal(false);
      node.deleteChild(label1);
      assert.deepEqual(node.getChildLabels(), []);
      assert.deepEqual(node.getChildNodes(), []);
      expect(node.numChildren()).to.equal(0);
      expect(node.getIsLeaf()).to.equal(true);
    });
  });

  describe("proofHash", () => {
    it("get / set", () => {
      expect(node.getProofHash()).to.equal(null);
      node.setProofHash('hash');
      expect(node.getProofHash()).to.equal('hash');
    });
  });

  describe("version", () => {
    it("add / has / delete", () => {
      const version1 = 'version1';
      const version2 = 'version2';
      expect(node.hasVersion(version1)).to.equal(false);
      expect(node.hasVersion(version2)).to.equal(false);
      node.addVersion(version1);
      expect(node.hasVersion(version1)).to.equal(true);
      expect(node.hasVersion(version2)).to.equal(false);
      node.addVersion(version2);
      expect(node.hasVersion(version1)).to.equal(true);
      expect(node.hasVersion(version2)).to.equal(true);
      node.deleteVersion(version2);
      expect(node.hasVersion(version1)).to.equal(true);
      expect(node.hasVersion(version2)).to.equal(false);
      node.deleteVersion(version1);
      expect(node.hasVersion(version1)).to.equal(false);
      expect(node.hasVersion(version2)).to.equal(false);
    });

    it("getVersions / numVersions", () => {
      const version1 = 'version1';
      const version2 = 'version2';
      assert.deepEqual(node.getVersions(), []);
      expect(node.numVersions()).to.equal(0);
      node.addVersion(version1);
      assert.deepEqual(node.getVersions(), ['version1']);
      expect(node.numVersions()).to.equal(1);
      node.addVersion(version2);
      assert.deepEqual(node.getVersions(), ['version1', 'version2']);
      expect(node.numVersions()).to.equal(2);
      node.deleteVersion(version2);
      assert.deepEqual(node.getVersions(), ['version1']);
      expect(node.numVersions()).to.equal(1);
      node.deleteVersion(version1);
      assert.deepEqual(node.getVersions(), []);
      expect(node.numVersions()).to.equal(0);
    });

    it("resetVersions", () => {
      const version1 = 'version1';
      const version2 = 'version2';
      node.addVersion(version1);
      node.addVersion(version2);
      assert.deepEqual(node.getVersions(), ['version1', 'version2']);
      expect(node.numVersions()).to.equal(2);
      node.resetVersions();
      assert.deepEqual(node.getVersions(), []);
      expect(node.numVersions()).to.equal(0);
    });
  });
});