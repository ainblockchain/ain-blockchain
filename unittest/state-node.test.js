const StateNode = require('../db/state-node');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

const ChainUtil = require('../chain-util');
const { HASH_DELIMITER } = require('../constants');

describe("state-node", () => {
  let node;
  let nodeWithVersion;
  let child1;
  let child2;
  let child3;
  const label1 = 'label1';
  const label2 = 'label2';
  const label3 = 'label3';
  let stateTree;

  beforeEach(() => {
    node = new StateNode();

    child1 = new StateNode();
    child2 = new StateNode();
    child3 = new StateNode();
    child1.setValue('value1');
    child2.setValue('value2');
    child3.setValue('value3');
    stateTree = new StateNode();
    stateTree.setChild(label1, child1);
    stateTree.setChild(label2, child2);
    stateTree.setChild(label3, child3);
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
      stateTree.setProofHash('hash');
      stateTree.setVersion('version1');
      expect(stateTree.getNumRef()).to.equal(0);
      expect(child1.getNumRef()).to.equal(1);
      expect(child2.getNumRef()).to.equal(1);
      expect(child3.getNumRef()).to.equal(1);
      const clone = stateTree.clone();
      expect(clone.getIsLeaf()).to.equal(false);
      assert.deepEqual(clone.getChildNodes(), stateTree.getChildNodes());
      expect(clone.getValue()).to.equal(null);
      expect(clone.getProofHash()).to.equal('hash');
      expect(clone.getVersion()).to.equal(stateTree.getVersion());
      expect(clone.getNumRef()).to.equal(0);
      expect(child1.getNumRef()).to.equal(2);
      expect(child2.getNumRef()).to.equal(2);
      expect(child3.getNumRef()).to.equal(2);
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
      stateTree.setProofHash('hash');
      stateTree.setVersion('version1');
      expect(stateTree.getNumRef()).to.equal(0);
      expect(child1.getNumRef()).to.equal(1);
      expect(child2.getNumRef()).to.equal(1);
      expect(child3.getNumRef()).to.equal(1);
      const clone = stateTree.clone('version2');
      expect(clone.getIsLeaf()).to.equal(false);
      assert.deepEqual(clone.getChildNodes(), stateTree.getChildNodes());
      expect(clone.getValue()).to.equal(null);
      expect(clone.getProofHash()).to.equal('hash');
      expect(clone.getVersion()).to.equal('version2');
      expect(clone.getNumRef()).to.equal(0);
      expect(child1.getNumRef()).to.equal(2);
      expect(child2.getNumRef()).to.equal(2);
      expect(child3.getNumRef()).to.equal(2);
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
      const internal = new StateNode();
      expect(internal.hasChild(label1)).to.equal(false);
      expect(internal.hasChild(label2)).to.equal(false);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(0);
      assert.deepEqual(internal.getChild(label1), null);
      assert.deepEqual(internal.getChild(label2), null);
      expect(internal.getIsLeaf()).to.equal(true);

      internal.setChild(label1, child1);
      expect(internal.hasChild(label1)).to.equal(true);
      expect(internal.hasChild(label2)).to.equal(false);
      expect(child1.getNumRef()).to.equal(1);
      expect(child2.getNumRef()).to.equal(0);
      assert.deepEqual(internal.getChild(label1), child1);
      assert.deepEqual(internal.getChild(label2), null);
      expect(internal.getIsLeaf()).to.equal(false);

      internal.setChild(label2, child2);
      expect(internal.hasChild(label1)).to.equal(true);
      expect(internal.hasChild(label2)).to.equal(true);
      expect(child1.getNumRef()).to.equal(1);
      expect(child2.getNumRef()).to.equal(1);
      assert.deepEqual(internal.getChild(label1), child1);
      assert.deepEqual(internal.getChild(label2), child2);
      expect(internal.getIsLeaf()).to.equal(false);

      internal.deleteChild(label1);
      expect(internal.hasChild(label1)).to.equal(false);
      expect(internal.hasChild(label2)).to.equal(true);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(1);
      assert.deepEqual(internal.getChild(label1), null);
      assert.deepEqual(internal.getChild(label2), child2);
      expect(internal.getIsLeaf()).to.equal(false);

      internal.deleteChild(label2);
      expect(internal.hasChild(label1)).to.equal(false);
      expect(internal.hasChild(label2)).to.equal(false);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(0);
      assert.deepEqual(internal.getChild(label1), null);
      assert.deepEqual(internal.getChild(label2), null);
      expect(internal.getIsLeaf()).to.equal(true);
    });

    it("set existing child", () => {
      const label1 = 'label1';
      const child1 = new StateNode();
      child1.setValue('value1');
      const internal = new StateNode();
      expect(internal.hasChild(label1)).to.equal(false);
      expect(child1.getNumRef()).to.equal(0);
      assert.deepEqual(internal.getChild(label1), null);
      expect(internal.getIsLeaf()).to.equal(true);

      internal.setChild(label1, child1);
      expect(internal.hasChild(label1)).to.equal(true);
      expect(child1.getNumRef()).to.equal(1);
      assert.deepEqual(internal.getChild(label1), child1);
      expect(internal.getIsLeaf()).to.equal(false);

      internal.setChild(label1, child1);
      expect(internal.hasChild(label1)).to.equal(true);
      expect(child1.getNumRef()).to.equal(1);
      assert.deepEqual(internal.getChild(label1), child1);
      expect(internal.getIsLeaf()).to.equal(false);
    });

    it("override existing child", () => {
      const label = 'label1';
      const child1 = new StateNode();
      const child2 = new StateNode();
      child1.setValue('value1');
      child2.setValue('value2');
      const internal = new StateNode();
      expect(internal.hasChild(label)).to.equal(false);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(0);
      assert.deepEqual(internal.getChild(label), null);
      expect(internal.getIsLeaf()).to.equal(true);

      internal.setChild(label, child1);
      expect(internal.hasChild(label)).to.equal(true);
      expect(child1.getNumRef()).to.equal(1);
      expect(child2.getNumRef()).to.equal(0);
      assert.deepEqual(internal.getChild(label), child1);
      expect(internal.getIsLeaf()).to.equal(false);

      internal.setChild(label, child2);
      expect(internal.hasChild(label)).to.equal(true);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(1);
      assert.deepEqual(internal.getChild(label), child2);
      expect(internal.getIsLeaf()).to.equal(false);
    });

    it("delete non-existing child", () => {
      const label1 = 'label1';
      const child1 = new StateNode();
      child1.setValue('value1');
      const internal = new StateNode();
      expect(internal.hasChild(label1)).to.equal(false);
      expect(child1.getNumRef()).to.equal(0);
      assert.deepEqual(internal.getChild(label1), null);
      expect(internal.getIsLeaf()).to.equal(true);

      internal.deleteChild(label1);
      expect(internal.hasChild(label1)).to.equal(false);
      expect(child1.getNumRef()).to.equal(0);
      assert.deepEqual(internal.getChild(label1), null);
      expect(internal.getIsLeaf()).to.equal(true);
    });

    it("getChildLabels / getChildNodes / numChildren / isLeaf", () => {
      const label1 = 'label1';
      const label2 = 'label2';
      const child1 = new StateNode();
      const child2 = new StateNode();
      child1.setValue('value1');
      child2.setValue('value2');
      const internal = new StateNode();
      assert.deepEqual(internal.getChildLabels(), []);
      assert.deepEqual(internal.getChildNodes(), []);
      expect(internal.numChildren()).to.equal(0);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(internal.getIsLeaf()).to.equal(true);

      internal.setChild(label1, child1);
      assert.deepEqual(internal.getChildLabels(), ['label1']);
      assert.deepEqual(internal.getChildNodes(), [child1]);
      expect(internal.numChildren()).to.equal(1);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(internal.getIsLeaf()).to.equal(false);

      internal.setChild(label2, child2);
      assert.deepEqual(internal.getChildLabels(), ['label1', 'label2']);
      assert.deepEqual(internal.getChildNodes(), [child1, child2]);
      expect(internal.numChildren()).to.equal(2);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(internal.getIsLeaf()).to.equal(false);

      internal.deleteChild(label2);
      assert.deepEqual(internal.getChildLabels(), ['label1']);
      assert.deepEqual(internal.getChildNodes(), [child1]);
      expect(internal.numChildren()).to.equal(1);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(internal.getIsLeaf()).to.equal(false);

      internal.deleteChild(label1);
      assert.deepEqual(internal.getChildLabels(), []);
      assert.deepEqual(internal.getChildNodes(), []);
      expect(internal.numChildren()).to.equal(0);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(internal.getIsLeaf()).to.equal(true);
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

  describe("buildProofHash", () => {
    it("leaf node", () => {
      node.setValue(true);
      expect(node.buildProofHash()).to.equal(ChainUtil.hashString(ChainUtil.toString(true)));
      node.setValue(10);
      expect(node.buildProofHash()).to.equal(ChainUtil.hashString(ChainUtil.toString(10)));
      node.setValue(-200);
      expect(node.buildProofHash()).to.equal(ChainUtil.hashString(ChainUtil.toString(-200)));
      node.setValue('');
      expect(node.buildProofHash()).to.equal(ChainUtil.hashString(ChainUtil.toString('')));
      node.setValue('unittest');
      expect(node.buildProofHash()).to.equal(ChainUtil.hashString(ChainUtil.toString('unittest')));
      node.setValue(null);
      expect(node.buildProofHash()).to.equal(ChainUtil.hashString(ChainUtil.toString(null)));
      node.setValue(undefined);
      expect(node.buildProofHash()).to.equal(ChainUtil.hashString(ChainUtil.toString(undefined)));
    });

    it("internal node", () => {
      child1.setProofHash('proofHash1');
      child2.setProofHash('proofHash2');
      child3.setProofHash('proofHash3');
      const preimage =
          `${label1}${HASH_DELIMITER}${child1.getProofHash()}${HASH_DELIMITER}` +
          `${label2}${HASH_DELIMITER}${child2.getProofHash()}${HASH_DELIMITER}` +
          `${label3}${HASH_DELIMITER}${child3.getProofHash()}`;
      expect(stateTree.buildProofHash()).to.equal(
          ChainUtil.hashString(ChainUtil.toString(preimage)));
    });
  });

  describe("computeTreeSize", () => {
    it("leaf node", () => {
      node.setValue(true);
      expect(node.computeTreeSize()).to.equal(1);
      node.setValue(10);
      expect(node.computeTreeSize()).to.equal(1);
      node.setValue(-200);
      expect(node.computeTreeSize()).to.equal(1);
      node.setValue('');
      expect(node.computeTreeSize()).to.equal(1);
      node.setValue('unittest');
      expect(node.computeTreeSize()).to.equal(1);
      node.setValue(null);
      expect(node.computeTreeSize()).to.equal(1);
      node.setValue(undefined);
      expect(node.computeTreeSize()).to.equal(1);
    });

    it("internal node", () => {
      child1.setTreeSize(2);
      child2.setTreeSize(3);
      child3.setTreeSize(5);
      expect(stateTree.computeTreeSize()).to.equal(11);
    });
  });

  describe("updateProofHashAndTreeSize", () => {
    it("leaf node", () => {
      node.setValue(true);
      node.updateProofHashAndTreeSize();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
      node.setValue(10);
      node.updateProofHashAndTreeSize();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
      node.setValue(-200);
      node.updateProofHashAndTreeSize();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
      node.setValue('');
      node.updateProofHashAndTreeSize();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
      node.setValue('unittest');
      node.updateProofHashAndTreeSize();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
      node.setValue(null);
      node.updateProofHashAndTreeSize();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
      node.setValue(undefined);
      node.updateProofHashAndTreeSize();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
    });

    it("internal node", () => {
      child1.setProofHash('proofHash1');
      child2.setProofHash('proofHash2');
      child3.setProofHash('proofHash3');
      child1.setTreeSize(2);
      child2.setTreeSize(3);
      child3.setTreeSize(5);
      node.updateProofHashAndTreeSize();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
    });
  });
});