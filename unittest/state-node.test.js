const StateNode = require('../db/state-node');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

const ChainUtil = require('../chain-util');
const { HASH_DELIMITER } = require('../constants');

describe("state-node", () => {
  let node;
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
      assert.deepEqual(node.getParentNodes(), []);
      assert.deepEqual(node.getChildLabels(), []);
      assert.deepEqual(node.getChildNodes(), []);
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
      expect(node2.parentSet).to.not.be.null;
      expect(node2.childMap).to.not.be.null;
      assert.deepEqual(node2.getParentNodes(), []);
      assert.deepEqual(node2.getChildLabels(), []);
      assert.deepEqual(node2.getChildNodes(), []);
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
      assert.deepEqual(clone.getParentNodes(), []);
      assert.deepEqual(clone.getChildLabels(), []);
      assert.deepEqual(clone.getChildNodes(), []);
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
      assert.deepEqual(child1.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(child2.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(child3.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(clone.getParentNodes(), []);
      assert.deepEqual(clone.getChildLabels(), stateTree.getChildLabels());
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
      assert.deepEqual(clone.getParentNodes(), []);
      assert.deepEqual(clone.getChildLabels(), []);
      assert.deepEqual(clone.getChildNodes(), []);
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
      assert.deepEqual(child1.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(child2.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(child3.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(clone.getParentNodes(), []);
      assert.deepEqual(clone.getChildLabels(), stateTree.getChildLabels());
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

  describe("equal", () => {
    let node1;
    let node2;
    let child1;
    let child2;
    let parent;

    beforeEach(() => {
      node1 = new StateNode();
      node2 = new StateNode();
      child1 = new StateNode();
      child2 = new StateNode();
      parent = new StateNode();
    })

    it("non-object", () => {
      expect(node1.equal(null)).to.equal(false);
      expect(node1.equal(undefined)).to.equal(false);
      expect(node1.equal(true)).to.equal(false);
      expect(node1.equal(false)).to.equal(false);
    });

    it("leaf", () => {
      expect(node1.equal(node2)).to.equal(true);

      node1.setValue('value');
      expect(node1.equal(node2)).to.equal(false);
      node2.setValue('value');
      expect(node1.equal(node2)).to.equal(true);

      node1._addParent(parent);
      expect(node1.equal(node2)).to.equal(false);
      node2._addParent(parent);
      expect(node1.equal(node2)).to.equal(true);
    });

    it("internal", () => {
      expect(node1.equal(node2)).to.equal(true);

      node1._addParent(parent);
      expect(node1.equal(node2)).to.equal(false);
      node2._addParent(parent);
      expect(node1.equal(node2)).to.equal(true);

      node1.setChild(label1, child1);
      expect(node1.equal(node2)).to.equal(false);
      node1.setChild(label2, child2);
      node2.setChild(label1, child1);
      node2.setChild(label2, child2);
      expect(node1.equal(node2)).to.equal(true);

      node1.setProofHash('proof_hash1');
      expect(node1.equal(node2)).to.equal(false);
      node2.setProofHash('proof_hash1');
      expect(node1.equal(node2)).to.equal(true);

      node1.setVersion('version1');
      expect(node1.equal(node2)).to.equal(false);
      node2.setVersion('version1');
      expect(node1.equal(node2)).to.equal(true);

      node1.increaseNumRef();
      expect(node1.equal(node2)).to.equal(false);
      node2.increaseNumRef();
      expect(node1.equal(node2)).to.equal(true);

      node1.setTreeSize(5);
      expect(node1.equal(node2)).to.equal(false);
      node2.setTreeSize(5);
      expect(node1.equal(node2)).to.equal(true);
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

  describe("parent", () => {
    it("_add / has / _delete / getParentNodes with single child", () => {
      const child = new StateNode();
      child.setValue('value1');
      const parent1 = new StateNode();
      const parent2 = new StateNode();
      expect(child.hasParent(parent1)).to.equal(false);
      expect(child.hasParent(parent2)).to.equal(false);
      expect(child.numParents()).to.equal(0);
      assert.deepEqual(child.getParentNodes(), []);

      child._addParent(parent1);
      expect(child.hasParent(parent1)).to.equal(true);
      expect(child.hasParent(parent2)).to.equal(false);
      expect(child.numParents()).to.equal(1);
      assert.deepEqual(child.getParentNodes(), [parent1]);

      child._addParent(parent2);
      expect(child.hasParent(parent1)).to.equal(true);
      expect(child.hasParent(parent2)).to.equal(true);
      expect(child.numParents()).to.equal(2);
      assert.deepEqual(child.getParentNodes(), [parent1, parent2]);

      child._deleteParent(parent1);
      expect(child.hasParent(parent1)).to.equal(false);
      expect(child.hasParent(parent2)).to.equal(true);
      expect(child.numParents()).to.equal(1);
      assert.deepEqual(child.getParentNodes(), [parent2]);

      child._deleteParent(parent2);
      expect(child.hasParent(parent1)).to.equal(false);
      expect(child.hasParent(parent2)).to.equal(false);
      expect(child.numParents()).to.equal(0);
      assert.deepEqual(child.getParentNodes(), []);
    });

    it("_add / has / _delete / getParentNodes with multiple children", () => {
      const child1 = new StateNode();
      const child2 = new StateNode();
      child1.setValue('value1');
      child2.setValue('value2');
      const parent1 = new StateNode();
      const parent2 = new StateNode();
      expect(child1.hasParent(parent1)).to.equal(false);
      expect(child1.hasParent(parent2)).to.equal(false);
      expect(child2.hasParent(parent1)).to.equal(false);
      expect(child2.hasParent(parent2)).to.equal(false);
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(0);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), []);

      child1._addParent(parent1);
      child2._addParent(parent2);
      expect(child1.hasParent(parent1)).to.equal(true);
      expect(child1.hasParent(parent2)).to.equal(false);
      expect(child2.hasParent(parent1)).to.equal(false);
      expect(child2.hasParent(parent2)).to.equal(true);
      expect(child1.numParents()).to.equal(1);
      expect(child2.numParents()).to.equal(1);
      assert.deepEqual(child1.getParentNodes(), [parent1]);
      assert.deepEqual(child2.getParentNodes(), [parent2]);

      child1._addParent(parent2);
      child2._addParent(parent1);
      expect(child1.hasParent(parent1)).to.equal(true);
      expect(child1.hasParent(parent2)).to.equal(true);
      expect(child2.hasParent(parent1)).to.equal(true);
      expect(child2.hasParent(parent2)).to.equal(true);
      expect(child1.numParents()).to.equal(2);
      expect(child2.numParents()).to.equal(2);
      assert.deepEqual(child1.getParentNodes(), [parent1, parent2]);
      assert.deepEqual(child2.getParentNodes(), [parent2, parent1]);

      child1._deleteParent(parent1);
      child2._deleteParent(parent2);
      expect(child1.hasParent(parent1)).to.equal(false);
      expect(child1.hasParent(parent2)).to.equal(true);
      expect(child2.hasParent(parent1)).to.equal(true);
      expect(child2.hasParent(parent2)).to.equal(false);
      expect(child1.numParents()).to.equal(1);
      expect(child2.numParents()).to.equal(1);
      assert.deepEqual(child1.getParentNodes(), [parent2]);
      assert.deepEqual(child2.getParentNodes(), [parent1]);

      child1._deleteParent(parent2);
      child2._deleteParent(parent1);
      expect(child1.hasParent(parent1)).to.equal(false);
      expect(child1.hasParent(parent2)).to.equal(false);
      expect(child2.hasParent(parent1)).to.equal(false);
      expect(child2.hasParent(parent2)).to.equal(false);
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(0);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), []);
    });

    it("_add existing parent", () => {
      const child = new StateNode();
      child.setValue('value1');
      const parent = new StateNode();
      expect(child.hasParent(parent)).to.equal(false);
      expect(child.numParents()).to.equal(0);
      assert.deepEqual(child.getParentNodes(), []);

      child._addParent(parent);
      expect(child.hasParent(parent)).to.equal(true);
      expect(child.numParents()).to.equal(1);
      assert.deepEqual(child.getParentNodes(), [parent]);

      child._addParent(parent);
      expect(child.hasParent(parent)).to.equal(true);
      expect(child.numParents()).to.equal(1);
      assert.deepEqual(child.getParentNodes(), [parent]);
    });

    it("_delete non-existing parent", () => {
      const child = new StateNode();
      child.setValue('value1');
      const parent1 = new StateNode();
      const parent2 = new StateNode();
      expect(child.hasParent(parent1)).to.equal(false);
      expect(child.hasParent(parent2)).to.equal(false);
      expect(child.numParents()).to.equal(0);
      assert.deepEqual(child.getParentNodes(), []);

      child._addParent(parent1);
      expect(child.hasParent(parent1)).to.equal(true);
      expect(child.hasParent(parent2)).to.equal(false);
      expect(child.numParents()).to.equal(1);
      assert.deepEqual(child.getParentNodes(), [parent1]);

      child._deleteParent(parent2);
      expect(child.hasParent(parent1)).to.equal(true);
      expect(child.hasParent(parent2)).to.equal(false);
      expect(child.numParents()).to.equal(1);
      assert.deepEqual(child.getParentNodes(), [parent1]);
    });
  });

  describe("child", () => {
    it("get / set / has / delete with single parent", () => {
      const label1 = 'label1';
      const label2 = 'label2';
      const child1 = new StateNode();
      const child2 = new StateNode();
      child1.setValue('value1');
      child2.setValue('value2');
      const parent = new StateNode();
      expect(parent.hasChild(label1)).to.equal(false);
      expect(parent.hasChild(label2)).to.equal(false);
      assert.deepEqual(parent.getChild(label1), null);
      assert.deepEqual(parent.getChild(label2), null);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(0);
      expect(parent.getIsLeaf()).to.equal(true);

      parent.setChild(label1, child1);
      expect(parent.hasChild(label1)).to.equal(true);
      expect(parent.hasChild(label2)).to.equal(false);
      assert.deepEqual(parent.getChild(label1), child1);
      assert.deepEqual(parent.getChild(label2), null);
      assert.deepEqual(child1.getParentNodes(), [parent]);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.getNumRef()).to.equal(1);
      expect(child2.getNumRef()).to.equal(0);
      expect(parent.getIsLeaf()).to.equal(false);

      parent.setChild(label2, child2);
      expect(parent.hasChild(label1)).to.equal(true);
      expect(parent.hasChild(label2)).to.equal(true);
      assert.deepEqual(parent.getChild(label1), child1);
      assert.deepEqual(parent.getChild(label2), child2);
      assert.deepEqual(child1.getParentNodes(), [parent]);
      assert.deepEqual(child2.getParentNodes(), [parent]);
      expect(child1.getNumRef()).to.equal(1);
      expect(child2.getNumRef()).to.equal(1);
      expect(parent.getIsLeaf()).to.equal(false);

      parent.deleteChild(label1);
      expect(parent.hasChild(label1)).to.equal(false);
      expect(parent.hasChild(label2)).to.equal(true);
      assert.deepEqual(parent.getChild(label1), null);
      assert.deepEqual(parent.getChild(label2), child2);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), [parent]);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(1);
      expect(parent.getIsLeaf()).to.equal(false);

      parent.deleteChild(label2);
      expect(parent.hasChild(label1)).to.equal(false);
      expect(parent.hasChild(label2)).to.equal(false);
      assert.deepEqual(parent.getChild(label1), null);
      assert.deepEqual(parent.getChild(label2), null);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(0);
      expect(parent.getIsLeaf()).to.equal(true);
    });

    it("get / set / has / delete with multiple parents", () => {
      const label1 = 'label1';
      const label2 = 'label2';
      const child1 = new StateNode();
      const child2 = new StateNode();
      child1.setValue('value1');
      child2.setValue('value2');
      const parent1 = new StateNode();
      const parent2 = new StateNode();
      expect(parent1.hasChild(label1)).to.equal(false);
      expect(parent1.hasChild(label2)).to.equal(false);
      expect(parent2.hasChild(label1)).to.equal(false);
      expect(parent2.hasChild(label2)).to.equal(false);
      assert.deepEqual(parent1.getChild(label1), null);
      assert.deepEqual(parent1.getChild(label2), null);
      assert.deepEqual(parent2.getChild(label1), null);
      assert.deepEqual(parent2.getChild(label2), null);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(0);
      expect(parent1.getIsLeaf()).to.equal(true);
      expect(parent2.getIsLeaf()).to.equal(true);

      parent1.setChild(label1, child1);
      parent2.setChild(label2, child2);
      expect(parent1.hasChild(label1)).to.equal(true);
      expect(parent1.hasChild(label2)).to.equal(false);
      expect(parent2.hasChild(label1)).to.equal(false);
      expect(parent2.hasChild(label2)).to.equal(true);
      assert.deepEqual(parent1.getChild(label1), child1);
      assert.deepEqual(parent1.getChild(label2), null);
      assert.deepEqual(parent2.getChild(label1), null);
      assert.deepEqual(parent2.getChild(label2), child2);
      assert.deepEqual(child1.getParentNodes(), [parent1]);
      assert.deepEqual(child2.getParentNodes(), [parent2]);
      expect(child1.getNumRef()).to.equal(1);
      expect(child2.getNumRef()).to.equal(1);
      expect(parent1.getIsLeaf()).to.equal(false);
      expect(parent2.getIsLeaf()).to.equal(false);

      parent1.setChild(label2, child2);
      parent2.setChild(label1, child1);
      expect(parent1.hasChild(label1)).to.equal(true);
      expect(parent1.hasChild(label2)).to.equal(true);
      expect(parent2.hasChild(label1)).to.equal(true);
      expect(parent2.hasChild(label2)).to.equal(true);
      assert.deepEqual(parent1.getChild(label1), child1);
      assert.deepEqual(parent1.getChild(label2), child2);
      assert.deepEqual(parent2.getChild(label1), child1);
      assert.deepEqual(parent2.getChild(label2), child2);
      assert.deepEqual(child1.getParentNodes(), [parent1, parent2]);
      assert.deepEqual(child2.getParentNodes(), [parent2, parent1]);
      expect(child1.getNumRef()).to.equal(2);
      expect(child2.getNumRef()).to.equal(2);
      expect(parent1.getIsLeaf()).to.equal(false);
      expect(parent2.getIsLeaf()).to.equal(false);

      parent1.deleteChild(label1, child1);
      parent2.deleteChild(label2, child2);
      expect(parent1.hasChild(label1)).to.equal(false);
      expect(parent1.hasChild(label2)).to.equal(true);
      expect(parent2.hasChild(label1)).to.equal(true);
      expect(parent2.hasChild(label2)).to.equal(false);
      assert.deepEqual(parent1.getChild(label1), null);
      assert.deepEqual(parent1.getChild(label2), child2);
      assert.deepEqual(parent2.getChild(label1), child1);
      assert.deepEqual(parent2.getChild(label2), null);
      assert.deepEqual(child1.getParentNodes(), [parent2]);
      assert.deepEqual(child2.getParentNodes(), [parent1]);
      expect(child1.getNumRef()).to.equal(1);
      expect(child2.getNumRef()).to.equal(1);
      expect(parent1.getIsLeaf()).to.equal(false);
      expect(parent2.getIsLeaf()).to.equal(false);

      parent1.deleteChild(label2, child2);
      parent2.deleteChild(label1, child1);
      expect(parent1.hasChild(label1)).to.equal(false);
      expect(parent1.hasChild(label2)).to.equal(false);
      expect(parent2.hasChild(label1)).to.equal(false);
      expect(parent2.hasChild(label2)).to.equal(false);
      assert.deepEqual(parent1.getChild(label1), null);
      assert.deepEqual(parent1.getChild(label2), null);
      assert.deepEqual(parent2.getChild(label1), null);
      assert.deepEqual(parent2.getChild(label2), null);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(0);
      expect(parent1.getIsLeaf()).to.equal(true);
      expect(parent2.getIsLeaf()).to.equal(true);
    });

    it("set existing child", () => {
      const label = 'label1';
      const child = new StateNode();
      child.setValue('value1');
      const parent = new StateNode();
      expect(parent.hasChild(label)).to.equal(false);
      assert.deepEqual(child.getParentNodes(), []);
      expect(child.getNumRef()).to.equal(0);
      assert.deepEqual(parent.getChild(label), null);
      expect(parent.getIsLeaf()).to.equal(true);

      parent.setChild(label, child);
      expect(parent.hasChild(label)).to.equal(true);
      assert.deepEqual(child.getParentNodes(), [parent]);
      expect(child.getNumRef()).to.equal(1);
      assert.deepEqual(parent.getChild(label), child);
      expect(parent.getIsLeaf()).to.equal(false);

      parent.setChild(label, child);
      expect(parent.hasChild(label)).to.equal(true);
      assert.deepEqual(child.getParentNodes(), [parent]);
      expect(child.getNumRef()).to.equal(1);
      assert.deepEqual(parent.getChild(label), child);
      expect(parent.getIsLeaf()).to.equal(false);
    });

    it("override existing child", () => {
      const label = 'label1';
      const child1 = new StateNode();
      const child2 = new StateNode();
      child1.setValue('value1');
      child2.setValue('value2');
      const parent = new StateNode();
      expect(parent.hasChild(label)).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(0);
      assert.deepEqual(parent.getChild(label), null);
      expect(parent.getIsLeaf()).to.equal(true);

      parent.setChild(label, child1);
      expect(parent.hasChild(label)).to.equal(true);
      assert.deepEqual(child1.getParentNodes(), [parent]);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.getNumRef()).to.equal(1);
      expect(child2.getNumRef()).to.equal(0);
      assert.deepEqual(parent.getChild(label), child1);
      expect(parent.getIsLeaf()).to.equal(false);

      parent.setChild(label, child2);
      expect(parent.hasChild(label)).to.equal(true);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), [parent]);
      expect(child1.getNumRef()).to.equal(0);
      expect(child2.getNumRef()).to.equal(1);
      assert.deepEqual(parent.getChild(label), child2);
      expect(parent.getIsLeaf()).to.equal(false);
    });

    it("delete non-existing child", () => {
      const label = 'label1';
      const child = new StateNode();
      child.setValue('value1');
      const parent = new StateNode();
      expect(parent.hasChild(label)).to.equal(false);
      assert.deepEqual(child.getParentNodes(), []);
      expect(child.getNumRef()).to.equal(0);
      assert.deepEqual(parent.getChild(label), null);
      expect(parent.getIsLeaf()).to.equal(true);

      parent.deleteChild(label);
      expect(parent.hasChild(label)).to.equal(false);
      assert.deepEqual(child.getParentNodes(), []);
      expect(child.getNumRef()).to.equal(0);
      assert.deepEqual(parent.getChild(label), null);
      expect(parent.getIsLeaf()).to.equal(true);
    });

    it("getChildLabels / getChildNodes / numChildren / isLeaf", () => {
      const label1 = 'label1';
      const label2 = 'label2';
      const child1 = new StateNode();
      const child2 = new StateNode();
      child1.setValue('value1');
      child2.setValue('value2');
      const parent = new StateNode();
      assert.deepEqual(parent.getChildLabels(), []);
      assert.deepEqual(parent.getChildNodes(), []);
      expect(parent.numChildren()).to.equal(0);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(parent.getIsLeaf()).to.equal(true);

      parent.setChild(label1, child1);
      assert.deepEqual(parent.getChildLabels(), ['label1']);
      assert.deepEqual(parent.getChildNodes(), [child1]);
      expect(parent.numChildren()).to.equal(1);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(parent.getIsLeaf()).to.equal(false);

      parent.setChild(label2, child2);
      assert.deepEqual(parent.getChildLabels(), ['label1', 'label2']);
      assert.deepEqual(parent.getChildNodes(), [child1, child2]);
      expect(parent.numChildren()).to.equal(2);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(parent.getIsLeaf()).to.equal(false);

      parent.deleteChild(label2);
      assert.deepEqual(parent.getChildLabels(), ['label1']);
      assert.deepEqual(parent.getChildNodes(), [child1]);
      expect(parent.numChildren()).to.equal(1);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(parent.getIsLeaf()).to.equal(false);

      parent.deleteChild(label1);
      assert.deepEqual(parent.getChildLabels(), []);
      assert.deepEqual(parent.getChildNodes(), []);
      expect(parent.numChildren()).to.equal(0);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(parent.getIsLeaf()).to.equal(true);
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