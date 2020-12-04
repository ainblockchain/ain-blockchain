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
    it("constructor", () => {
      expect(node.isLeaf).to.equal(true);
      expect(node.childMap).to.not.be.null;
      expect(node.value).to.equal(null);
      expect(node.proofHash).to.equal(null);
      expect(node.version).to.equal(null);
      expect(node.getNumRef()).to.equal(0);
    });
  });

  describe("Initialization with version", () => {
    it("constructor", () => {
      const node2 = new StateNode('version1');
      expect(node2.isLeaf).to.equal(true);
      expect(node2.childMap).to.not.be.null;
      expect(node2.value).to.equal(null);
      expect(node2.proofHash).to.equal(null);
      expect(node2.version).to.equal('version1');
      expect(node2.getNumRef()).to.equal(0);
    });
  });

  describe("clone", () => {
    it("leaf node", () => {
      node.setValue('value0');
      node.setProofHash('hash');
      node.setVersion('version1');
      const clone = node.clone();
      expect(clone.getIsLeaf()).to.equal(true);
      assert.deepEqual(clone.getChildNodes(), node.getChildNodes());
      expect(clone.getValue()).to.equal('value0');
      expect(clone.getProofHash()).to.equal('hash');
      expect(clone.getVersion()).to.equal(node.getVersion());
      expect(clone.getNumRef()).to.equal(0);
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
      node.setVersion('version1');
      expect(node.getNumRef()).to.equal(0);
      expect(child1.getNumRef()).to.equal(1);
      expect(child2.getNumRef()).to.equal(1);
      const clone = node.clone();
      expect(clone.getIsLeaf()).to.equal(false);
      assert.deepEqual(clone.getChildNodes(), node.getChildNodes());
      expect(clone.getValue()).to.equal(null);
      expect(clone.getProofHash()).to.equal('hash');
      expect(clone.getVersion()).to.equal(node.getVersion());
      expect(clone.getNumRef()).to.equal(0);
      expect(child1.getNumRef()).to.equal(2);
      expect(child2.getNumRef()).to.equal(2);
    });
  });

  describe("clone with version", () => {
    it("leaf node", () => {
      node.setValue('value0');
      node.setProofHash('hash');
      node.setVersion('version1');
      const clone = node.clone('version2');
      expect(clone.getIsLeaf()).to.equal(true);
      assert.deepEqual(clone.getChildNodes(), node.getChildNodes());
      expect(clone.getValue()).to.equal('value0');
      expect(clone.getProofHash()).to.equal('hash');
      expect(clone.getVersion()).to.equal('version2');
      expect(clone.getNumRef()).to.equal(0);
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
      node.setVersion('version1');
      expect(node.getNumRef()).to.equal(0);
      expect(child1.getNumRef()).to.equal(1);
      expect(child2.getNumRef()).to.equal(1);
      const clone = node.clone('version2');
      expect(clone.getIsLeaf()).to.equal(false);
      assert.deepEqual(clone.getChildNodes(), node.getChildNodes());
      expect(clone.getValue()).to.equal(null);
      expect(clone.getProofHash()).to.equal('hash');
      expect(clone.getVersion()).to.equal('version2');
      expect(clone.getNumRef()).to.equal(0);
      expect(child1.getNumRef()).to.equal(2);
      expect(child2.getNumRef()).to.equal(2);
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
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(0);
      assert.deepEqual(node.getChild(label1), null);
      assert.deepEqual(node.getChild(label2), null);
      expect(node.getIsLeaf()).to.equal(true);

      node.setChild(label1, child1);
      expect(node.hasChild(label1)).to.equal(true);
      expect(node.hasChild(label2)).to.equal(false);
      expect(child1.getNumRef()).to.equal(1);
      expect(child2.getNumRef()).to.equal(0);
      assert.deepEqual(node.getChild(label1), child1);
      assert.deepEqual(node.getChild(label2), null);
      expect(node.getIsLeaf()).to.equal(false);

      node.setChild(label2, child2);
      expect(node.hasChild(label1)).to.equal(true);
      expect(node.hasChild(label2)).to.equal(true);
      expect(child1.getNumRef()).to.equal(1);
      expect(child2.getNumRef()).to.equal(1);
      assert.deepEqual(node.getChild(label1), child1);
      assert.deepEqual(node.getChild(label2), child2);
      expect(node.getIsLeaf()).to.equal(false);

      node.deleteChild(label1);
      expect(node.hasChild(label1)).to.equal(false);
      expect(node.hasChild(label2)).to.equal(true);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(1);
      assert.deepEqual(node.getChild(label1), null);
      assert.deepEqual(node.getChild(label2), child2);
      expect(node.getIsLeaf()).to.equal(false);

      node.deleteChild(label2);
      expect(node.hasChild(label1)).to.equal(false);
      expect(node.hasChild(label2)).to.equal(false);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(0);
      assert.deepEqual(node.getChild(label1), null);
      assert.deepEqual(node.getChild(label2), null);
      expect(node.getIsLeaf()).to.equal(true);
    });

    it("set existing child", () => {
      const label1 = 'label1';
      const child1 = new StateNode();
      child1.setValue('value1');
      expect(node.hasChild(label1)).to.equal(false);
      expect(child1.getNumRef()).to.equal(0);
      assert.deepEqual(node.getChild(label1), null);
      expect(node.getIsLeaf()).to.equal(true);

      node.setChild(label1, child1);
      expect(node.hasChild(label1)).to.equal(true);
      expect(child1.getNumRef()).to.equal(1);
      assert.deepEqual(node.getChild(label1), child1);
      expect(node.getIsLeaf()).to.equal(false);

      node.setChild(label1, child1);
      expect(node.hasChild(label1)).to.equal(true);
      expect(child1.getNumRef()).to.equal(1);
      assert.deepEqual(node.getChild(label1), child1);
      expect(node.getIsLeaf()).to.equal(false);
    });

    it("override existing child", () => {
      const label = 'label1';
      const child1 = new StateNode();
      const child2 = new StateNode();
      child1.setValue('value1');
      child2.setValue('value2');
      expect(node.hasChild(label)).to.equal(false);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(0);
      assert.deepEqual(node.getChild(label), null);
      expect(node.getIsLeaf()).to.equal(true);

      node.setChild(label, child1);
      expect(node.hasChild(label)).to.equal(true);
      expect(child1.getNumRef()).to.equal(1);
      expect(child2.getNumRef()).to.equal(0);
      assert.deepEqual(node.getChild(label), child1);
      expect(node.getIsLeaf()).to.equal(false);

      node.setChild(label, child2);
      expect(node.hasChild(label)).to.equal(true);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(1);
      assert.deepEqual(node.getChild(label), child2);
      expect(node.getIsLeaf()).to.equal(false);
    });

    it("delete non-existing child", () => {
      const label1 = 'label1';
      const child1 = new StateNode();
      child1.setValue('value1');
      expect(node.hasChild(label1)).to.equal(false);
      expect(child1.getNumRef()).to.equal(0);
      assert.deepEqual(node.getChild(label1), null);
      expect(node.getIsLeaf()).to.equal(true);

      node.deleteChild(label1);
      expect(node.hasChild(label1)).to.equal(false);
      expect(child1.getNumRef()).to.equal(0);
      assert.deepEqual(node.getChild(label1), null);
      expect(node.getIsLeaf()).to.equal(true);
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
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(node.getIsLeaf()).to.equal(true);

      node.setChild(label1, child1);
      assert.deepEqual(node.getChildLabels(), ['label1']);
      assert.deepEqual(node.getChildNodes(), [child1]);
      expect(node.numChildren()).to.equal(1);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(node.getIsLeaf()).to.equal(false);

      node.setChild(label2, child2);
      assert.deepEqual(node.getChildLabels(), ['label1', 'label2']);
      assert.deepEqual(node.getChildNodes(), [child1, child2]);
      expect(node.numChildren()).to.equal(2);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(node.getIsLeaf()).to.equal(false);

      node.deleteChild(label2);
      assert.deepEqual(node.getChildLabels(), ['label1']);
      assert.deepEqual(node.getChildNodes(), [child1]);
      expect(node.numChildren()).to.equal(1);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(node.getIsLeaf()).to.equal(false);

      node.deleteChild(label1);
      assert.deepEqual(node.getChildLabels(), []);
      assert.deepEqual(node.getChildNodes(), []);
      expect(node.numChildren()).to.equal(0);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(node.getIsLeaf()).to.equal(true);
    });
  });

  describe("proofHash", () => {
    it("get / set / reset", () => {
      expect(node.getProofHash()).to.equal(null);
      node.setProofHash('hash');
      expect(node.getProofHash()).to.equal('hash');
      node.resetProofHash();
      expect(node.getProofHash()).to.equal(null);
    });
  });

  describe("version", () => {
    it("get / set", () => {
      const version1 = 'version1';
      const version2 = 'version2';
      expect(node.getVersion()).to.equal(null);
      node.setVersion(version1);
      expect(node.getVersion()).to.equal(version1);
      node.setVersion(version2);
      expect(node.getVersion()).to.equal(version2);
    });
  });

  describe("numRef", () => {
    it("get / increase / decrease", () => {
      expect(node.getNumRef()).to.equal(0);
      node.increaseNumRef();
      expect(node.getNumRef()).to.equal(1);
      node.increaseNumRef();
      expect(node.getNumRef()).to.equal(2);
      node.decreaseNumRef();
      expect(node.getNumRef()).to.equal(1);
      node.decreaseNumRef();
      expect(node.getNumRef()).to.equal(0);
      // Not actually decrease to minus values.
      node.decreaseNumRef();
      expect(node.getNumRef()).to.equal(0);
    });
  });

  describe("treeSize", () => {
    it("get / set", () => {
      expect(node.getTreeSize()).to.equal(1);
      node.setTreeSize(10);
      expect(node.getTreeSize()).to.equal(10);
      node.setTreeSize(5);
      expect(node.getTreeSize()).to.equal(5);
    });
  });
});