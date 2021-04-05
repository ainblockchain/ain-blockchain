const StateNode = require('../db/state-node');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

const ChainUtil = require('../common/chain-util');
const { HASH_DELIMITER } = require('../common/constants');

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
      expect(node.numParents()).to.equal(0);
      assert.deepEqual(node.getChildLabels(), []);
      assert.deepEqual(node.getChildNodes(), []);
      expect(node.value).to.equal(null);
      expect(node.proofHash).to.equal(null);
      expect(node.version).to.equal(null);
    });
  });

  describe("Initialization with version", () => {
    it("constructor", () => {
      const node2 = new StateNode('version1');
      expect(node2.isLeaf).to.equal(true);
      expect(node2.parentSet).to.not.be.null;
      expect(node2.childMap).to.not.be.null;
      assert.deepEqual(node2.getParentNodes(), []);
      expect(node2.numParents()).to.equal(0);
      assert.deepEqual(node2.getChildLabels(), []);
      assert.deepEqual(node2.getChildNodes(), []);
      expect(node2.value).to.equal(null);
      expect(node2.proofHash).to.equal(null);
      expect(node2.version).to.equal('version1');
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
      assert.deepEqual(clone.toJsObject(true), node.toJsObject(true));
      expect(node.equal(clone)).to.equal(true);
    });

    it("internal node", () => {
      stateTree.setProofHash('hash');
      stateTree.setVersion('version1');
      assert.deepEqual(stateTree.getParentNodes(), []);
      assert.deepEqual(child1.getParentNodes(), [stateTree]);
      assert.deepEqual(child2.getParentNodes(), [stateTree]);
      assert.deepEqual(child3.getParentNodes(), [stateTree]);

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
      assert.deepEqual(clone.toJsObject(true), stateTree.toJsObject(true));
      expect(stateTree.equal(clone)).to.equal(true);
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
    });

    it("internal node", () => {
      stateTree.setProofHash('hash');
      stateTree.setVersion('version1');
      assert.deepEqual(stateTree.getParentNodes(), []);
      assert.deepEqual(child1.getParentNodes(), [stateTree]);
      assert.deepEqual(child2.getParentNodes(), [stateTree]);
      assert.deepEqual(child3.getParentNodes(), [stateTree]);

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

      node1.setTreeSize(5);
      expect(node1.equal(node2)).to.equal(false);
      node2.setTreeSize(5);
      expect(node1.equal(node2)).to.equal(true);
    });
  });

  describe("fromJsObject / toJsObject", () => {
    it("leaf node", () => {
      expect(StateNode.fromJsObject(true).toJsObject()).to.equal(true);
      expect(StateNode.fromJsObject(false).toJsObject()).to.equal(false);
      expect(StateNode.fromJsObject(10).toJsObject()).to.equal(10);
      expect(StateNode.fromJsObject('str').toJsObject()).to.equal('str');
      expect(StateNode.fromJsObject(null).toJsObject()).to.equal(null);
    })

    it("internal node", () => {
      const stateObj = {
        bool: false,
        number: 10,
        str: 'str',
        empty_str: '',
        null: null,
        undef: undefined,
        empty_obj: {},
        subobj1: {
          bool: true,
          number: 20,
          str: 'str2',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: {},
        },
        subobj2: {
          bool: true,
          number: -10,
          str: 'str3',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: {},
        }
      };
      assert.deepEqual(StateNode.fromJsObject(stateObj).toJsObject(), {
        bool: false,
        number: 10,
        str: 'str',
        empty_str: '',
        null: null,
        undef: undefined,
        empty_obj: null,
        subobj1: {
          bool: true,
          number: 20,
          str: 'str2',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: null,
        },
        subobj2: {
          bool: true,
          number: -10,
          str: 'str3',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: null,
        }
      });
    })
  })

  describe("fromJsObject with version / toJsObject", () => {
    it("leaf node", () => {
      const ver1 = 'ver1';

      expect(StateNode.fromJsObject(true, ver1).toJsObject(true)).to.equal(true);
      expect(StateNode.fromJsObject(false, ver1).toJsObject(true)).to.equal(false);
      expect(StateNode.fromJsObject(10, ver1).toJsObject(true)).to.equal(10);
      expect(StateNode.fromJsObject('str', ver1).toJsObject(true)).to.equal('str');
      expect(StateNode.fromJsObject(null, ver1).toJsObject(true)).to.equal(null);
    })

    it("internal node", () => {
      const ver1 = 'ver1';

      const stateObj = {
        bool: false,
        number: 10,
        str: 'str',
        empty_str: '',
        null: null,
        undef: undefined,
        empty_obj: {},
        subobj1: {
          bool: true,
          number: 20,
          str: 'str2',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: {},
        },
        subobj2: {
          bool: true,
          number: -10,
          str: 'str3',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: {},
        }
      };
      // Expect no updates on proof hash and state info (tree depth and tree size).
      assert.deepEqual(StateNode.fromJsObject(stateObj, ver1).toJsObject(true), {
        ".version": "ver1",
        ".version:bool": "ver1",
        ".version:empty_obj": "ver1",
        ".version:empty_str": "ver1",
        ".version:null": "ver1",
        ".version:number": "ver1",
        ".version:str": "ver1",
        ".version:undef": "ver1",
        ".numParents": 0,
        ".numParents:bool": 1,
        ".numParents:empty_obj": 1,
        ".numParents:empty_str": 1,
        ".numParents:null": 1,
        ".numParents:number": 1,
        ".numParents:str": 1,
        ".numParents:undef": 1,
        ".proofHash": null,
        ".proofHash:bool": null,
        ".proofHash:empty_obj": null,
        ".proofHash:empty_str": null,
        ".proofHash:null": null,
        ".proofHash:number": null,
        ".proofHash:str": null,
        ".proofHash:undef": null,
        ".treeDepth": 1,
        ".treeDepth:bool": 1,
        ".treeDepth:empty_obj": 1,
        ".treeDepth:empty_str": 1,
        ".treeDepth:null": 1,
        ".treeDepth:number": 1,
        ".treeDepth:str": 1,
        ".treeDepth:undef": 1,
        ".treeSize": 1,
        ".treeSize:bool": 1,
        ".treeSize:empty_obj": 1,
        ".treeSize:empty_str": 1,
        ".treeSize:null": 1,
        ".treeSize:number": 1,
        ".treeSize:str": 1,
        ".treeSize:undef": 1,
        bool: false,
        number: 10,
        str: 'str',
        empty_str: '',
        null: null,
        undef: undefined,
        empty_obj: null,
        subobj1: {
          ".version": "ver1",
          ".version:bool": "ver1",
          ".version:empty_obj": "ver1",
          ".version:empty_str": "ver1",
          ".version:null": "ver1",
          ".version:number": "ver1",
          ".version:str": "ver1",
          ".version:undef": "ver1",
          ".numParents": 1,
          ".numParents:bool": 1,
          ".numParents:empty_obj": 1,
          ".numParents:empty_str": 1,
          ".numParents:null": 1,
          ".numParents:number": 1,
          ".numParents:str": 1,
          ".numParents:undef": 1,
          ".proofHash": null,
          ".proofHash:bool": null,
          ".proofHash:empty_obj": null,
          ".proofHash:empty_str": null,
          ".proofHash:null": null,
          ".proofHash:number": null,
          ".proofHash:str": null,
          ".proofHash:undef": null,
          ".treeDepth": 1,
          ".treeDepth:bool": 1,
          ".treeDepth:empty_obj": 1,
          ".treeDepth:empty_str": 1,
          ".treeDepth:null": 1,
          ".treeDepth:number": 1,
          ".treeDepth:str": 1,
          ".treeDepth:undef": 1,
          ".treeSize": 1,
          ".treeSize:bool": 1,
          ".treeSize:empty_obj": 1,
          ".treeSize:empty_str": 1,
          ".treeSize:null": 1,
          ".treeSize:number": 1,
          ".treeSize:str": 1,
          ".treeSize:undef": 1,
          bool: true,
          number: 20,
          str: 'str2',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: null,
        },
        subobj2: {
          ".version": "ver1",
          ".version:bool": "ver1",
          ".version:empty_obj": "ver1",
          ".version:empty_str": "ver1",
          ".version:null": "ver1",
          ".version:number": "ver1",
          ".version:str": "ver1",
          ".version:undef": "ver1",
          ".numParents": 1,
          ".numParents:bool": 1,
          ".numParents:empty_obj": 1,
          ".numParents:empty_str": 1,
          ".numParents:null": 1,
          ".numParents:number": 1,
          ".numParents:str": 1,
          ".numParents:undef": 1,
          ".proofHash": null,
          ".proofHash:bool": null,
          ".proofHash:empty_obj": null,
          ".proofHash:empty_str": null,
          ".proofHash:null": null,
          ".proofHash:number": null,
          ".proofHash:str": null,
          ".proofHash:undef": null,
          ".treeDepth": 1,
          ".treeDepth:bool": 1,
          ".treeDepth:empty_obj": 1,
          ".treeDepth:empty_str": 1,
          ".treeDepth:null": 1,
          ".treeDepth:number": 1,
          ".treeDepth:str": 1,
          ".treeDepth:undef": 1,
          ".treeSize": 1,
          ".treeSize:bool": 1,
          ".treeSize:empty_obj": 1,
          ".treeSize:empty_str": 1,
          ".treeSize:null": 1,
          ".treeSize:number": 1,
          ".treeSize:str": 1,
          ".treeSize:undef": 1,
          bool: true,
          number: -10,
          str: 'str3',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: null,
        }
      });
    })
  })

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
      expect(child._hasParent(parent1)).to.equal(false);
      expect(child._hasParent(parent2)).to.equal(false);
      assert.deepEqual(child.getParentNodes(), []);
      expect(child.numParents()).to.equal(0);

      child._addParent(parent1);
      expect(child._hasParent(parent1)).to.equal(true);
      expect(child._hasParent(parent2)).to.equal(false);
      assert.deepEqual(child.getParentNodes(), [parent1]);
      expect(child.numParents()).to.equal(1);

      child._addParent(parent2);
      expect(child._hasParent(parent1)).to.equal(true);
      expect(child._hasParent(parent2)).to.equal(true);
      assert.deepEqual(child.getParentNodes(), [parent1, parent2]);
      expect(child.numParents()).to.equal(2);

      child._deleteParent(parent1);
      expect(child._hasParent(parent1)).to.equal(false);
      expect(child._hasParent(parent2)).to.equal(true);
      assert.deepEqual(child.getParentNodes(), [parent2]);
      expect(child.numParents()).to.equal(1);

      child._deleteParent(parent2);
      expect(child._hasParent(parent1)).to.equal(false);
      expect(child._hasParent(parent2)).to.equal(false);
      assert.deepEqual(child.getParentNodes(), []);
      expect(child.numParents()).to.equal(0);
    });

    it("_add / has / _delete / getParentNodes with multiple children", () => {
      const child1 = new StateNode();
      const child2 = new StateNode();
      child1.setValue('value1');
      child2.setValue('value2');
      const parent1 = new StateNode();
      const parent2 = new StateNode();
      expect(child1._hasParent(parent1)).to.equal(false);
      expect(child1._hasParent(parent2)).to.equal(false);
      expect(child2._hasParent(parent1)).to.equal(false);
      expect(child2._hasParent(parent2)).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(0);

      child1._addParent(parent1);
      child2._addParent(parent2);
      expect(child1._hasParent(parent1)).to.equal(true);
      expect(child1._hasParent(parent2)).to.equal(false);
      expect(child2._hasParent(parent1)).to.equal(false);
      expect(child2._hasParent(parent2)).to.equal(true);
      assert.deepEqual(child1.getParentNodes(), [parent1]);
      assert.deepEqual(child2.getParentNodes(), [parent2]);
      expect(child1.numParents()).to.equal(1);
      expect(child2.numParents()).to.equal(1);

      child1._addParent(parent2);
      child2._addParent(parent1);
      expect(child1._hasParent(parent1)).to.equal(true);
      expect(child1._hasParent(parent2)).to.equal(true);
      expect(child2._hasParent(parent1)).to.equal(true);
      expect(child2._hasParent(parent2)).to.equal(true);
      assert.deepEqual(child1.getParentNodes(), [parent1, parent2]);
      assert.deepEqual(child2.getParentNodes(), [parent2, parent1]);
      expect(child1.numParents()).to.equal(2);
      expect(child2.numParents()).to.equal(2);

      child1._deleteParent(parent1);
      child2._deleteParent(parent2);
      expect(child1._hasParent(parent1)).to.equal(false);
      expect(child1._hasParent(parent2)).to.equal(true);
      expect(child2._hasParent(parent1)).to.equal(true);
      expect(child2._hasParent(parent2)).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), [parent2]);
      assert.deepEqual(child2.getParentNodes(), [parent1]);
      expect(child1.numParents()).to.equal(1);
      expect(child2.numParents()).to.equal(1);

      child1._deleteParent(parent2);
      child2._deleteParent(parent1);
      expect(child1._hasParent(parent1)).to.equal(false);
      expect(child1._hasParent(parent2)).to.equal(false);
      expect(child2._hasParent(parent1)).to.equal(false);
      expect(child2._hasParent(parent2)).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(0);
    });

    it("_add existing parent", () => {
      const child = new StateNode();
      child.setValue('value1');
      const parent = new StateNode();
      expect(child._hasParent(parent)).to.equal(false);
      assert.deepEqual(child.getParentNodes(), []);
      expect(child.numParents()).to.equal(0);

      child._addParent(parent);
      expect(child._hasParent(parent)).to.equal(true);
      assert.deepEqual(child.getParentNodes(), [parent]);
      expect(child.numParents()).to.equal(1);

      child._addParent(parent);
      expect(child._hasParent(parent)).to.equal(true);
      assert.deepEqual(child.getParentNodes(), [parent]);
      expect(child.numParents()).to.equal(1);
    });

    it("_delete non-existing parent", () => {
      const child = new StateNode();
      child.setValue('value1');
      const parent1 = new StateNode();
      const parent2 = new StateNode();
      expect(child._hasParent(parent1)).to.equal(false);
      expect(child._hasParent(parent2)).to.equal(false);
      assert.deepEqual(child.getParentNodes(), []);
      expect(child.numParents()).to.equal(0);

      child._addParent(parent1);
      expect(child._hasParent(parent1)).to.equal(true);
      expect(child._hasParent(parent2)).to.equal(false);
      assert.deepEqual(child.getParentNodes(), [parent1]);
      expect(child.numParents()).to.equal(1);

      child._deleteParent(parent2);
      expect(child._hasParent(parent1)).to.equal(true);
      expect(child._hasParent(parent2)).to.equal(false);
      assert.deepEqual(child.getParentNodes(), [parent1]);
      expect(child.numParents()).to.equal(1);
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
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(0);
      expect(parent.getIsLeaf()).to.equal(true);

      parent.setChild(label1, child1);
      expect(parent.hasChild(label1)).to.equal(true);
      expect(parent.hasChild(label2)).to.equal(false);
      assert.deepEqual(parent.getChild(label1), child1);
      assert.deepEqual(parent.getChild(label2), null);
      assert.deepEqual(child1.getParentNodes(), [parent]);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.numParents()).to.equal(1);
      expect(child2.numParents()).to.equal(0);
      expect(parent.getIsLeaf()).to.equal(false);

      parent.setChild(label2, child2);
      expect(parent.hasChild(label1)).to.equal(true);
      expect(parent.hasChild(label2)).to.equal(true);
      assert.deepEqual(parent.getChild(label1), child1);
      assert.deepEqual(parent.getChild(label2), child2);
      assert.deepEqual(child1.getParentNodes(), [parent]);
      assert.deepEqual(child2.getParentNodes(), [parent]);
      expect(child1.numParents()).to.equal(1);
      expect(child2.numParents()).to.equal(1);
      expect(parent.getIsLeaf()).to.equal(false);

      parent.deleteChild(label1);
      expect(parent.hasChild(label1)).to.equal(false);
      expect(parent.hasChild(label2)).to.equal(true);
      assert.deepEqual(parent.getChild(label1), null);
      assert.deepEqual(parent.getChild(label2), child2);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), [parent]);
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(1);
      expect(parent.getIsLeaf()).to.equal(false);

      parent.deleteChild(label2);
      expect(parent.hasChild(label1)).to.equal(false);
      expect(parent.hasChild(label2)).to.equal(false);
      assert.deepEqual(parent.getChild(label1), null);
      assert.deepEqual(parent.getChild(label2), null);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(0);
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
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(0);
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
      expect(child1.numParents()).to.equal(1);
      expect(child2.numParents()).to.equal(1);
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
      expect(child1.numParents()).to.equal(2);
      expect(child2.numParents()).to.equal(2);
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
      expect(child1.numParents()).to.equal(1);
      expect(child2.numParents()).to.equal(1);
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
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(0);
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
      expect(child.numParents()).to.equal(0);
      assert.deepEqual(parent.getChild(label), null);
      expect(parent.getIsLeaf()).to.equal(true);

      parent.setChild(label, child);
      expect(parent.hasChild(label)).to.equal(true);
      assert.deepEqual(child.getParentNodes(), [parent]);
      expect(child.numParents()).to.equal(1);
      assert.deepEqual(parent.getChild(label), child);
      expect(parent.getIsLeaf()).to.equal(false);

      parent.setChild(label, child);
      expect(parent.hasChild(label)).to.equal(true);
      assert.deepEqual(child.getParentNodes(), [parent]);
      expect(child.numParents()).to.equal(1);
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
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(0);
      assert.deepEqual(parent.getChild(label), null);
      expect(parent.getIsLeaf()).to.equal(true);

      parent.setChild(label, child1);
      expect(parent.hasChild(label)).to.equal(true);
      assert.deepEqual(child1.getParentNodes(), [parent]);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.numParents()).to.equal(1);
      expect(child2.numParents()).to.equal(0);
      assert.deepEqual(parent.getChild(label), child1);
      expect(parent.getIsLeaf()).to.equal(false);

      parent.setChild(label, child2);
      expect(parent.hasChild(label)).to.equal(true);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), [parent]);
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(1);
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
      expect(child.numParents()).to.equal(0);
      assert.deepEqual(parent.getChild(label), null);
      expect(parent.getIsLeaf()).to.equal(true);

      parent.deleteChild(label);
      expect(parent.hasChild(label)).to.equal(false);
      assert.deepEqual(child.getParentNodes(), []);
      expect(child.numParents()).to.equal(0);
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

  describe("computeTreeDepth", () => {
    it("leaf node", () => {
      node.setValue(true);
      expect(node.computeTreeDepth()).to.equal(1);
      node.setValue(10);
      expect(node.computeTreeDepth()).to.equal(1);
      node.setValue(-200);
      expect(node.computeTreeDepth()).to.equal(1);
      node.setValue('');
      expect(node.computeTreeDepth()).to.equal(1);
      node.setValue('unittest');
      expect(node.computeTreeDepth()).to.equal(1);
      node.setValue(null);
      expect(node.computeTreeDepth()).to.equal(1);
      node.setValue(undefined);
      expect(node.computeTreeDepth()).to.equal(1);
    });

    it("internal node", () => {
      child1.setTreeDepth(1);
      child2.setTreeDepth(2);
      child3.setTreeDepth(3);
      expect(stateTree.computeTreeDepth()).to.equal(4);
    });
  });

  describe("updateProofHashAndStateInfo", () => {
    it("leaf node", () => {
      node.setValue(true);
      node.updateProofHashAndStateInfo();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeDepth()).to.equal(node.computeTreeDepth());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
      node.setValue(10);
      node.updateProofHashAndStateInfo();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeDepth()).to.equal(node.computeTreeDepth());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
      node.setValue(-200);
      node.updateProofHashAndStateInfo();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeDepth()).to.equal(node.computeTreeDepth());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
      node.setValue('');
      node.updateProofHashAndStateInfo();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeDepth()).to.equal(node.computeTreeDepth());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
      node.setValue('unittest');
      node.updateProofHashAndStateInfo();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeDepth()).to.equal(node.computeTreeDepth());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
      node.setValue(null);
      node.updateProofHashAndStateInfo();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeDepth()).to.equal(node.computeTreeDepth());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
      node.setValue(undefined);
      node.updateProofHashAndStateInfo();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeDepth()).to.equal(node.computeTreeDepth());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
    });

    it("internal node", () => {
      child1.setProofHash('proofHash1');
      child2.setProofHash('proofHash2');
      child3.setProofHash('proofHash3');
      child1.setTreeDepth(1);
      child2.setTreeDepth(2);
      child3.setTreeDepth(3);
      child1.setTreeSize(2);
      child2.setTreeSize(3);
      child3.setTreeSize(5);
      node.updateProofHashAndStateInfo();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.getTreeDepth()).to.equal(node.computeTreeDepth());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
    });
  });
});