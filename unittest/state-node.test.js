const StateNode = require('../db/state-node');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

const CommonUtil = require('../common/common-util');
const { GET_OPTIONS_INCLUDE_ALL } = require('./test-util');
const {
  updateStateInfoForStateTree,
  verifyProofHashForStateTree,
} = require('../db/state-util');

describe("state-node", () => {
  let node;

  let child1;
  let child2;
  let child3;
  let child4;
  const label1 = '0x00aaaa';
  const label2 = '0x11bbbb';
  const label3 = '0x11bb00';
  const label4 = '0x11bb11';
  let stateTree;

  beforeEach(() => {
    node = new StateNode();

    child1 = new StateNode();
    child2 = new StateNode();
    child3 = new StateNode();
    child4 = new StateNode();
    child1.setValue('value1');
    child2.setValue('value2');
    child3.setValue('value3');
    child4.setValue('value4');
    stateTree = new StateNode();
    stateTree.setChild(label1, child1);
    stateTree.setChild(label2, child2);
    stateTree.setChild(label3, child3);
    stateTree.setChild(label4, child4);
  })

  describe("Initialization", () => {
    it("constructor", () => {
      expect(node.label).to.equal(null);
      expect(node.isLeaf).to.equal(true);
      assert.deepEqual(node.getParentNodes(), []);
      expect(node.numParents()).to.equal(0);
      assert.deepEqual(node.getChildLabels(), []);
      assert.deepEqual(node.getChildNodes(), []);
      expect(node.label).to.equal(null);
      expect(node.value).to.equal(null);
      expect(node.proofHash).to.equal(null);
      expect(node.version).to.equal(null);
    });
  });

  describe("Initialization with version", () => {
    it("constructor", () => {
      const node2 = new StateNode('version1');
      expect(node2.version).to.equal('version1');
      expect(node2.label).to.equal(null);
      expect(node2.isLeaf).to.equal(true);
      expect(node2.parentSet).to.not.be.null;
      expect(node2.childMap).to.not.be.null;
      assert.deepEqual(node2.getParentNodes(), []);
      expect(node2.numParents()).to.equal(0);
      assert.deepEqual(node2.getChildLabels(), []);
      assert.deepEqual(node2.getChildNodes(), []);
      expect(node2.value).to.equal(null);
      expect(node2.proofHash).to.equal(null);
      expect(node2.treeHeight).to.equal(0);
      expect(node2.treeSize).to.equal(0);
      expect(node2.treeBytes).to.equal(0);
    });
  });

  describe("clone", () => {
    it("leaf node", () => {
      node._setLabel('label');
      node.setValue('value0');
      node.setProofHash('hash');
      node.setVersion('version1');

      const clone = node.clone();
      expect(clone.getVersion()).to.equal(node.getVersion());
      expect(clone.getIsLeaf()).to.equal(true);
      assert.deepEqual(clone.getParentNodes(), []);
      assert.deepEqual(clone.getChildLabels(), []);
      assert.deepEqual(clone.getChildNodes(), []);
      assert.deepEqual(clone.numChildren(), 0);
      expect(clone.getLabel()).to.equal('label');
      expect(clone.getValue()).to.equal('value0');
      expect(clone.getProofHash()).to.equal('hash');
      expect(clone.getTreeHeight()).to.equal(node.getTreeHeight());
      expect(clone.getTreeSize()).to.equal(node.getTreeSize());
      expect(clone.getTreeBytes()).to.equal(node.getTreeBytes());
      assert.deepEqual(clone.toJsObject(GET_OPTIONS_INCLUDE_ALL), node.toJsObject(GET_OPTIONS_INCLUDE_ALL));
      expect(node.equal(clone)).to.equal(true);
    });

    it("internal node", () => {
      stateTree._setLabel('label_root');
      stateTree.setVersion('version1');
      assert.deepEqual(stateTree.getParentNodes(), []);
      assert.deepEqual(child1.getParentNodes(), [stateTree]);
      assert.deepEqual(child2.getParentNodes(), [stateTree]);
      assert.deepEqual(child3.getParentNodes(), [stateTree]);
      assert.deepEqual(child4.getParentNodes(), [stateTree]);
      expect(verifyProofHashForStateTree(stateTree)).to.equal(false);
      updateStateInfoForStateTree(stateTree);
      expect(verifyProofHashForStateTree(stateTree)).to.equal(true);

      const clone = stateTree.clone();
      expect(clone.getVersion()).to.equal(stateTree.getVersion());
      expect(clone.getIsLeaf()).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(child2.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(child3.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(child4.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(clone.getParentNodes(), []);
      assert.deepEqual(clone.getChildLabels(), stateTree.getChildLabels());
      assert.deepEqual(clone.getChildNodes(), stateTree.getChildNodes());
      assert.deepEqual(clone.numChildren(), stateTree.numChildren());
      // Proof hash is verified without updateStateInfoForStateTree() call!
      expect(verifyProofHashForStateTree(clone)).to.equal(true);
      expect(clone.getLabel()).to.equal('label_root');
      expect(clone.getValue()).to.equal(null);
      expect(clone.getTreeHeight()).to.equal(stateTree.getTreeHeight());
      expect(clone.getTreeSize()).to.equal(stateTree.getTreeSize());
      expect(clone.getTreeBytes()).to.equal(stateTree.getTreeBytes());
      assert.deepEqual(clone.toJsObject(GET_OPTIONS_INCLUDE_ALL), stateTree.toJsObject(GET_OPTIONS_INCLUDE_ALL));
      expect(stateTree.equal(clone)).to.equal(true);
    });
  });

  describe("clone with version", () => {
    it("leaf node", () => {
      node.setValue('value0');
      node.setProofHash('hash');
      node.setVersion('version1');

      const clone = node.clone('version2');
      expect(clone.getVersion()).to.equal('version2');
      expect(clone.getIsLeaf()).to.equal(true);
      assert.deepEqual(clone.getParentNodes(), []);
      assert.deepEqual(clone.getChildLabels(), []);
      assert.deepEqual(clone.getChildNodes(), []);
      expect(clone.getValue()).to.equal('value0');
      expect(clone.getProofHash()).to.equal('hash');
      expect(clone.getTreeHeight()).to.equal(node.getTreeHeight());
      expect(clone.getTreeSize()).to.equal(node.getTreeSize());
      expect(clone.getTreeBytes()).to.equal(node.getTreeBytes());
    });

    it("internal node", () => {
      stateTree.setProofHash('hash');
      stateTree.setVersion('version1');
      assert.deepEqual(stateTree.getParentNodes(), []);
      assert.deepEqual(child1.getParentNodes(), [stateTree]);
      assert.deepEqual(child2.getParentNodes(), [stateTree]);
      assert.deepEqual(child3.getParentNodes(), [stateTree]);

      const clone = stateTree.clone('version2');
      expect(clone.getVersion()).to.equal('version2');
      expect(clone.getIsLeaf()).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(child2.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(child3.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(clone.getParentNodes(), []);
      assert.deepEqual(clone.getChildLabels(), stateTree.getChildLabels());
      assert.deepEqual(clone.getChildNodes(), stateTree.getChildNodes());
      expect(clone.getValue()).to.equal(null);
      expect(clone.getProofHash()).to.equal('hash');
      expect(clone.getTreeHeight()).to.equal(stateTree.getTreeHeight());
      expect(clone.getTreeSize()).to.equal(stateTree.getTreeSize());
      expect(clone.getTreeBytes()).to.equal(stateTree.getTreeBytes());
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

      node1.addParent(parent);
      expect(node1.equal(node2)).to.equal(false);
      node2.addParent(parent);
      expect(node1.equal(node2)).to.equal(true);
    });

    it("internal", () => {
      expect(node1.equal(node2)).to.equal(true);

      node1.addParent(parent);
      expect(node1.equal(node2)).to.equal(false);
      node2.addParent(parent);
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

      expect(StateNode.fromJsObject(true, ver1).toJsObject(GET_OPTIONS_INCLUDE_ALL)).to.equal(true);
      expect(StateNode.fromJsObject(false, ver1).toJsObject(GET_OPTIONS_INCLUDE_ALL)).to.equal(false);
      expect(StateNode.fromJsObject(10, ver1).toJsObject(GET_OPTIONS_INCLUDE_ALL)).to.equal(10);
      expect(StateNode.fromJsObject('str', ver1).toJsObject(GET_OPTIONS_INCLUDE_ALL)).to.equal('str');
      expect(StateNode.fromJsObject(null, ver1).toJsObject(GET_OPTIONS_INCLUDE_ALL)).to.equal(null);
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

      // Expect no updates on tree info.
      assert.deepEqual(StateNode.fromJsObject(stateObj, ver1).toJsObject({ includeTreeInfo: true }), {
        ".num_parents": 0,
        ".num_parents:bool": 1,
        ".num_parents:empty_obj": 1,
        ".num_parents:empty_str": 1,
        ".num_parents:null": 1,
        ".num_parents:number": 1,
        ".num_parents:str": 1,
        ".num_parents:undef": 1,
        ".tree_height": 0,
        ".tree_height:bool": 0,
        ".tree_height:empty_obj": 0,
        ".tree_height:empty_str": 0,
        ".tree_height:null": 0,
        ".tree_height:number": 0,
        ".tree_height:str": 0,
        ".tree_height:undef": 0,
        ".tree_size": 0,
        ".tree_size:bool": 0,
        ".tree_size:empty_obj": 0,
        ".tree_size:empty_str": 0,
        ".tree_size:null": 0,
        ".tree_size:number": 0,
        ".tree_size:str": 0,
        ".tree_size:undef": 0,
        ".tree_bytes": 0,
        ".tree_bytes:bool": 0,
        ".tree_bytes:empty_obj": 0,
        ".tree_bytes:empty_str": 0,
        ".tree_bytes:null": 0,
        ".tree_bytes:number": 0,
        ".tree_bytes:str": 0,
        ".tree_bytes:undef": 0,
        bool: false,
        number: 10,
        str: 'str',
        empty_str: '',
        null: null,
        undef: undefined,
        empty_obj: null,
        subobj1: {
          ".num_parents": 1,
          ".num_parents:bool": 1,
          ".num_parents:empty_obj": 1,
          ".num_parents:empty_str": 1,
          ".num_parents:null": 1,
          ".num_parents:number": 1,
          ".num_parents:str": 1,
          ".num_parents:undef": 1,
          ".tree_height": 0,
          ".tree_height:bool": 0,
          ".tree_height:empty_obj": 0,
          ".tree_height:empty_str": 0,
          ".tree_height:null": 0,
          ".tree_height:number": 0,
          ".tree_height:str": 0,
          ".tree_height:undef": 0,
          ".tree_size": 0,
          ".tree_size:bool": 0,
          ".tree_size:empty_obj": 0,
          ".tree_size:empty_str": 0,
          ".tree_size:null": 0,
          ".tree_size:number": 0,
          ".tree_size:str": 0,
          ".tree_size:undef": 0,
          ".tree_bytes": 0,
          ".tree_bytes:bool": 0,
          ".tree_bytes:empty_obj": 0,
          ".tree_bytes:empty_str": 0,
          ".tree_bytes:null": 0,
          ".tree_bytes:number": 0,
          ".tree_bytes:str": 0,
          ".tree_bytes:undef": 0,
          bool: true,
          number: 20,
          str: 'str2',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: null,
        },
        subobj2: {
          ".num_parents": 1,
          ".num_parents:bool": 1,
          ".num_parents:empty_obj": 1,
          ".num_parents:empty_str": 1,
          ".num_parents:null": 1,
          ".num_parents:number": 1,
          ".num_parents:str": 1,
          ".num_parents:undef": 1,
          ".tree_height": 0,
          ".tree_height:bool": 0,
          ".tree_height:empty_obj": 0,
          ".tree_height:empty_str": 0,
          ".tree_height:null": 0,
          ".tree_height:number": 0,
          ".tree_height:str": 0,
          ".tree_height:undef": 0,
          ".tree_size": 0,
          ".tree_size:bool": 0,
          ".tree_size:empty_obj": 0,
          ".tree_size:empty_str": 0,
          ".tree_size:null": 0,
          ".tree_size:number": 0,
          ".tree_size:str": 0,
          ".tree_size:undef": 0,
          ".tree_bytes": 0,
          ".tree_bytes:bool": 0,
          ".tree_bytes:empty_obj": 0,
          ".tree_bytes:empty_str": 0,
          ".tree_bytes:null": 0,
          ".tree_bytes:number": 0,
          ".tree_bytes:str": 0,
          ".tree_bytes:undef": 0,
          bool: true,
          number: -10,
          str: 'str3',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: null,
        }
      });

      // Expect no updates on state proof.
      assert.deepEqual(StateNode.fromJsObject(stateObj, ver1).toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        ".proof_hash:bool": null,
        ".proof_hash:empty_obj": null,
        ".proof_hash:empty_str": null,
        ".proof_hash:null": null,
        ".proof_hash:number": null,
        ".proof_hash:str": null,
        ".proof_hash:undef": null,
        bool: false,
        number: 10,
        str: 'str',
        empty_str: '',
        null: null,
        undef: undefined,
        empty_obj: null,
        subobj1: {
          ".proof_hash": null,
          ".proof_hash:bool": null,
          ".proof_hash:empty_obj": null,
          ".proof_hash:empty_str": null,
          ".proof_hash:null": null,
          ".proof_hash:number": null,
          ".proof_hash:str": null,
          ".proof_hash:undef": null,
          bool: true,
          number: 20,
          str: 'str2',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: null,
        },
        subobj2: {
          ".proof_hash": null,
          ".proof_hash:bool": null,
          ".proof_hash:empty_obj": null,
          ".proof_hash:empty_str": null,
          ".proof_hash:null": null,
          ".proof_hash:number": null,
          ".proof_hash:str": null,
          ".proof_hash:undef": null,
          bool: true,
          number: -10,
          str: 'str3',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: null,
        }
      });

      assert.deepEqual(StateNode.fromJsObject(stateObj, ver1).toJsObject({ includeVersion: true }), {
        ".version": "ver1",
        ".version:bool": "ver1",
        ".version:empty_obj": "ver1",
        ".version:empty_str": "ver1",
        ".version:null": "ver1",
        ".version:number": "ver1",
        ".version:str": "ver1",
        ".version:undef": "ver1",
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

  describe("fromJsObject with version / toJsObject with isShallow", () => {
    it("leaf node", () => {
      const ver = 'test_version';
      expect(StateNode.fromJsObject(true, ver).toJsObject({ isShallow: true })).to.equal(true);
      expect(StateNode.fromJsObject(false, ver).toJsObject({ isShallow: true })).to.equal(false);
      expect(StateNode.fromJsObject(10, ver).toJsObject({ isShallow: true })).to.equal(10);
      expect(StateNode.fromJsObject('str', ver).toJsObject({ isShallow: true })).to.equal('str');
      expect(StateNode.fromJsObject(null, ver).toJsObject({ isShallow: true })).to.equal(null);
    })

    it("internal node", () => {
      const ver = 'test_version';
      assert.deepEqual(StateNode.fromJsObject({ a: 1, b: 2, c: 3 }, ver).toJsObject({ isShallow: true }),
          {
            a: true,
            b: true,
            c: true,
          },
      );
      assert.deepEqual(StateNode.fromJsObject({ a: { aa: 11 }, b: 2 }, ver).toJsObject({ isShallow: true }),
          {
            a: true,
            b: true,
          },
      );
    })

  })

  describe("label", () => {
    it("get / has / set / reset", () => {
      expect(node.hasLabel()).to.equal(false);
      node._setLabel('label');
      expect(node.hasLabel()).to.equal(true);
      expect(node.getLabel()).to.equal('label');
      node._resetLabel();
      expect(node.hasLabel()).to.equal(false);
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
      expect(child._hasParent(parent1)).to.equal(false);
      expect(child._hasParent(parent2)).to.equal(false);
      assert.deepEqual(child.getParentNodes(), []);
      expect(child.numParents()).to.equal(0);

      child.addParent(parent1);
      expect(child._hasParent(parent1)).to.equal(true);
      expect(child._hasParent(parent2)).to.equal(false);
      assert.deepEqual(child.getParentNodes(), [parent1]);
      expect(child.numParents()).to.equal(1);

      child.addParent(parent2);
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

      child1.addParent(parent1);
      child2.addParent(parent2);
      expect(child1._hasParent(parent1)).to.equal(true);
      expect(child1._hasParent(parent2)).to.equal(false);
      expect(child2._hasParent(parent1)).to.equal(false);
      expect(child2._hasParent(parent2)).to.equal(true);
      assert.deepEqual(child1.getParentNodes(), [parent1]);
      assert.deepEqual(child2.getParentNodes(), [parent2]);
      expect(child1.numParents()).to.equal(1);
      expect(child2.numParents()).to.equal(1);

      child1.addParent(parent2);
      child2.addParent(parent1);
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

      child.addParent(parent);
      expect(child._hasParent(parent)).to.equal(true);
      assert.deepEqual(child.getParentNodes(), [parent]);
      expect(child.numParents()).to.equal(1);

      child.addParent(parent);
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

      child.addParent(parent1);
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
      expect(child1.hasLabel()).to.equal(false);
      expect(child2.hasLabel()).to.equal(false);
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
      expect(child1.hasLabel()).to.equal(true);
      expect(child1.getLabel()).to.equal(label1);
      expect(child2.hasLabel()).to.equal(false);
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
      expect(child1.hasLabel()).to.equal(true);
      expect(child1.getLabel()).to.equal(label1);
      expect(child2.hasLabel()).to.equal(true);
      expect(child2.getLabel()).to.equal(label2);
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
      expect(child1.hasLabel()).to.equal(true);
      expect(child2.hasLabel()).to.equal(true);
      expect(child2.getLabel()).to.equal(label2);
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
      expect(child1.hasLabel()).to.equal(true);
      expect(child2.hasLabel()).to.equal(true);
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
      expect(child1.hasLabel()).to.equal(false);
      expect(child2.hasLabel()).to.equal(false);
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
      expect(child1.hasLabel()).to.equal(true);
      expect(child1.getLabel()).to.equal(label1);
      expect(child2.hasLabel()).to.equal(true);
      expect(child2.getLabel()).to.equal(label2);
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
      expect(child1.hasLabel()).to.equal(true);
      expect(child1.getLabel()).to.equal(label1);
      expect(child2.hasLabel()).to.equal(true);
      expect(child2.getLabel()).to.equal(label2);
      expect(parent1.getIsLeaf()).to.equal(false);
      expect(parent2.getIsLeaf()).to.equal(false);

      parent1.deleteChild(label1);
      parent2.deleteChild(label2);
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
      expect(child1.hasLabel()).to.equal(true);
      expect(child1.getLabel()).to.equal(label1);
      expect(child2.hasLabel()).to.equal(true);
      expect(child2.getLabel()).to.equal(label2);
      expect(parent1.getIsLeaf()).to.equal(false);
      expect(parent2.getIsLeaf()).to.equal(false);

      parent1.deleteChild(label2);
      parent2.deleteChild(label1);
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
      expect(child1.hasLabel()).to.equal(true);
      expect(child2.hasLabel()).to.equal(true);
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

  describe("proof hash", () => {
    it("getProofHash / setProofHash / resetProofHash", () => {
      expect(node.getProofHash()).to.equal(null);
      node.setProofHash('hash');
      expect(node.getProofHash()).to.equal('hash');
      node.resetProofHash();
      expect(node.getProofHash()).to.equal(null);
    });
  });

  describe("version", () => {
    it("getVersion / setVersion", () => {
      const version1 = 'version1';
      const version2 = 'version2';
      expect(node.getVersion()).to.equal(null);
      node.setVersion(version1);
      expect(node.getVersion()).to.equal(version1);
      node.setVersion(version2);
      expect(node.getVersion()).to.equal(version2);
    });
  });

  describe("tree height", () => {
    it("getTreeHeight / setTreeHeight", () => {
      expect(node.getTreeHeight()).to.equal(0);
      node.setTreeHeight(10);
      expect(node.getTreeHeight()).to.equal(10);
      node.setTreeHeight(5);
      expect(node.getTreeHeight()).to.equal(5);
    });
  });

  describe("tree size", () => {
    it("getTreeSize / setTreeSize", () => {
      expect(node.getTreeSize()).to.equal(0);
      node.setTreeSize(10);
      expect(node.getTreeSize()).to.equal(10);
      node.setTreeSize(5);
      expect(node.getTreeSize()).to.equal(5);
    });
  });

  describe("tree bytes", () => {
    it("getTreeBytes / setTreeBytes", () => {
      expect(node.getTreeBytes()).to.equal(0);
      node.setTreeBytes(10);
      expect(node.getTreeBytes()).to.equal(10);
      node.setTreeBytes(5);
      expect(node.getTreeBytes()).to.equal(5);
    });
  });

  describe("buildProofHash", () => {
    it("leaf node", () => {
      node.setValue(true);
      expect(node.buildProofHash()).to.equal(CommonUtil.hashString(CommonUtil.toString(true)));
      node.setValue(10);
      expect(node.buildProofHash()).to.equal(CommonUtil.hashString(CommonUtil.toString(10)));
      node.setValue(-200);
      expect(node.buildProofHash()).to.equal(CommonUtil.hashString(CommonUtil.toString(-200)));
      node.setValue('');
      expect(node.buildProofHash()).to.equal(CommonUtil.hashString(CommonUtil.toString('')));
      node.setValue('unittest');
      expect(node.buildProofHash()).to.equal(CommonUtil.hashString(CommonUtil.toString('unittest')));
      node.setValue(null);
      expect(node.buildProofHash()).to.equal(CommonUtil.hashString(CommonUtil.toString(null)));
      node.setValue(undefined);
      expect(node.buildProofHash()).to.equal(CommonUtil.hashString(CommonUtil.toString(undefined)));
    });

    it("internal node", () => {
      child1.setProofHash('proofHash1');
      child2.setProofHash('proofHash2');
      child3.setProofHash('proofHash3');
      child4.setProofHash('proofHash4');
      expect(stateTree.radixTree.verifyProofHashForRadixTree()).to.equal(false);

      // build proof hash without updatedChildLabel
      const proofHash = stateTree.buildProofHash();
      expect(proofHash).to.equal(stateTree.radixTree.getRootProofHash());
      expect(stateTree.radixTree.verifyProofHashForRadixTree()).to.equal(true);

      // set another proof hash value for a child
      child2.setProofHash('another PH');
      expect(stateTree.radixTree.verifyProofHashForRadixTree()).to.equal(false);

      // build proof hash with updatedChildLabel
      const newProofHash = stateTree.buildProofHash(label2);
      expect(newProofHash).not.equal(proofHash);  // Updated
      expect(newProofHash).to.equal(stateTree.radixTree.getRootProofHash());
      expect(stateTree.radixTree.verifyProofHashForRadixTree()).to.equal(true);
    });
  });

  describe("computeTreeHeight", () => {
    it("leaf node", () => {
      node.setValue(true);
      expect(node.computeTreeHeight()).to.equal(0);
      node.setValue(10);
      expect(node.computeTreeHeight()).to.equal(0);
      node.setValue(-200);
      expect(node.computeTreeHeight()).to.equal(0);
      node.setValue('');
      expect(node.computeTreeHeight()).to.equal(0);
      node.setValue('unittest');
      expect(node.computeTreeHeight()).to.equal(0);
      node.setValue(null);
      expect(node.computeTreeHeight()).to.equal(0);
      node.setValue(undefined);
      expect(node.computeTreeHeight()).to.equal(0);
    });

    it("internal node", () => {
      child1.setTreeHeight(0);
      child2.setTreeHeight(1);
      child3.setTreeHeight(2);
      child4.setTreeHeight(3);
      expect(stateTree.computeTreeHeight()).to.equal(4);
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
      child1.setTreeSize(10);
      child2.setTreeSize(20);
      child3.setTreeSize(30);
      child4.setTreeSize(40);
      expect(stateTree.computeTreeSize()).to.equal(101);
    });
  });

  describe("computeTreeBytes", () => {
    it("leaf node", () => {
      const parent = new StateNode();
      parent.setChild('child', node);

      node.setVersion('ver');  // string (3 * 2 = 6 bytes)
      // node.isLeaf : boolean (4 bytses)
      node.setProofHash('hash');  // string (4 * 2 = 8 bytses)
      // node.treeHeight : number (8 bytses)
      // node.treeSize : number (8 bytses)
      // node.treeBytes : number (8 bytes)
      // TOTAL: 42 - 6 = 36 bytes (exclude version)
      expect(node.computeNodeBytes()).to.equal(36);

      node.setValue(true);  // boolean (4 bytes)
      expect(node.computeTreeBytes()).to.equal(40);
      node.setValue(10);  // number (8 bytes)
      expect(node.computeTreeBytes()).to.equal(44);
      node.setValue(-200);  // number (8 bytes)
      expect(node.computeTreeBytes()).to.equal(44);
      node.setValue('');  // string (0 * 2 = 0 bytes)
      expect(node.computeTreeBytes()).to.equal(36);
      node.setValue('str');  // string (3 * 2 = 6 bytes)
      expect(node.computeTreeBytes()).to.equal(42);
      node.setValue(null);  // null (0 bytes)
      expect(node.computeTreeBytes()).to.equal(36);
      node.setValue(undefined);  // undefined (0 bytes)
      expect(node.computeTreeBytes()).to.equal(36);
    });

    it("internal node", () => {
      const parent = new StateNode();
      parent.setChild('child', stateTree);

      stateTree.setVersion('ver');  // string (3 * 2 = 6 bytes)
      // stateTree.isLeaf : boolean (4 bytses)
      // stateTree.value : null (0 bytses)
      stateTree.setProofHash('hash');  // string (4 * 2 = 8 bytses)
      // stateTree.treeHeight : number (8 bytses)
      // stateTree.treeSize : number (8 bytses)
      // stateTree.treeBytes : number (8 bytes)
      // TOTAL: 42 - 6 = 36 bytes (exclude version)
      expect(stateTree.computeNodeBytes()).to.equal(36);

      child1.setTreeBytes(10);
      child2.setTreeBytes(20);
      child3.setTreeBytes(30);
      child4.setTreeBytes(40);
      // 36 + 8(label1) * 2 + 10 + 8(label2) * 2 + 20 + 8(label3) * 2 + 30 + 8(label4) * 2 + 40 = 200
      expect(stateTree.computeTreeBytes()).to.equal(200);
    });
  });

  describe("updateStateInfo / verifyProofHash", () => {
    it("leaf node", () => {
      node.setValue(true);
      expect(node.verifyProofHash()).to.equal(false);
      node.updateStateInfo();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.verifyProofHash()).to.equal(true);
      expect(node.getTreeHeight()).to.equal(node.computeTreeHeight());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());

      node.setValue(10);
      expect(node.verifyProofHash()).to.equal(false);
      node.updateStateInfo();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.verifyProofHash()).to.equal(true);
      expect(node.getTreeHeight()).to.equal(node.computeTreeHeight());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());

      node.setValue(-200);
      expect(node.verifyProofHash()).to.equal(false);
      node.updateStateInfo();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.verifyProofHash()).to.equal(true);
      expect(node.getTreeHeight()).to.equal(node.computeTreeHeight());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());

      node.setValue('');
      expect(node.verifyProofHash()).to.equal(false);
      node.updateStateInfo();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.verifyProofHash()).to.equal(true);
      expect(node.getTreeHeight()).to.equal(node.computeTreeHeight());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());

      node.setValue('str');
      expect(node.verifyProofHash()).to.equal(false);
      node.updateStateInfo();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.verifyProofHash()).to.equal(true);
      expect(node.getTreeHeight()).to.equal(node.computeTreeHeight());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());

      node.setValue(null);
      expect(node.verifyProofHash()).to.equal(false);
      node.updateStateInfo();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.verifyProofHash()).to.equal(true);
      expect(node.getTreeHeight()).to.equal(node.computeTreeHeight());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());

      node.setValue(undefined);
      expect(node.verifyProofHash()).to.equal(false);
      node.updateStateInfo();
      expect(node.getProofHash()).to.equal(node.buildProofHash());
      expect(node.verifyProofHash()).to.equal(true);
      expect(node.getTreeHeight()).to.equal(node.computeTreeHeight());
      expect(node.getTreeSize()).to.equal(node.computeTreeSize());
    });

    it("internal node", () => {
      child1.setProofHash('proofHash1');
      child2.setProofHash('proofHash2');
      child3.setProofHash('proofHash3');
      child4.setProofHash('proofHash4');
      child1.setTreeHeight(1);
      child2.setTreeHeight(2);
      child3.setTreeHeight(3);
      child4.setTreeHeight(4);
      child1.setTreeSize(10);
      child2.setTreeSize(20);
      child3.setTreeSize(30);
      child4.setTreeSize(40);
      expect(stateTree.verifyProofHash()).to.equal(false);

      // update without updatedChildLabel
      stateTree.updateStateInfo();
      const proofHash = stateTree.getProofHash();
      expect(proofHash).to.equal(stateTree.buildProofHash());
      expect(stateTree.verifyProofHash()).to.equal(true);
      expect(stateTree.getTreeHeight()).to.equal(stateTree.computeTreeHeight());
      expect(stateTree.getTreeSize()).to.equal(stateTree.computeTreeSize());
      expect(stateTree.getTreeBytes()).to.equal(stateTree.computeTreeBytes());

      // set another proof hash value for a child
      child2.setProofHash('another PH');
      expect(stateTree.verifyProofHash()).to.equal(false);

      // update with updatedChildLabel
      stateTree.updateStateInfo(label2);
      const newProofHash = stateTree.getProofHash();
      expect(newProofHash).not.equal(proofHash);  // Updated
      expect(newProofHash).to.equal(stateTree.buildProofHash());
      expect(stateTree.verifyProofHash()).to.equal(true);
    });

    it("verifyProofHash with updatedChildLabel", () => {
      child1.setProofHash('proofHash1');
      child2.setProofHash('proofHash2');
      child3.setProofHash('proofHash3');
      child4.setProofHash('proofHash4');
      expect(stateTree.verifyProofHash(label2)).to.equal(false);

      // update with updatedChildLabel
      stateTree.updateStateInfo(label2);
      // verify with updatedChildLabel
      expect(stateTree.verifyProofHash(label2)).to.equal(true);
      // verify without updatedChildLabel
      expect(stateTree.verifyProofHash()).to.equal(false);
    });
  });

  describe("getProofOfState", () => {
    it("leaf node", () => {
      node.setValue(true);  // leaf node
      node.setProofHash('proofHash');
      assert.deepEqual(node.getProofOfState(), {
        ".proof_hash": "proofHash"
      });
    });

    it("internal node", () => {
      child1.setProofHash('proofHash1');
      child2.setProofHash('proofHash2');
      child3.setProofHash('proofHash3');
      child4.setProofHash('proofHash4');
      stateTree.setProofHash('proofHash');

      stateTree.updateStateInfo();
      assert.deepEqual(stateTree.radixTree.toJsObject(true), {
        ".radix_ph": "0xd9251f484361885000e88f2385777e1c4558a08125199a99c6b3296b459628c6",
        "00aaaa": {
          ".label": "0x00aaaa",
          ".proof_hash": "proofHash1",
          ".radix_ph": "0xd8895ab36f227519e479a4bf7cfcbf963deb8e69e8172f395af8db83172bf22c"
        },
        "11bb": {
          "11": {
            ".label": "0x11bb11",
            ".proof_hash": "proofHash4",
            ".radix_ph": "0x741ba4788b06907f8c99c60a6f483f885cc1b4fb27f9e1bed71dfd1d8a213214"
          },
          ".radix_ph": "0x099ad81295e3257147362606afc34b47757dd5c1508d441e248302be8577ed44",
          "00": {
            ".label": "0x11bb00",
            ".proof_hash": "proofHash3",
            ".radix_ph": "0x3dfb52c0d974feb0559c9efafa996fb286717785e98871336e68ffb52d04bdf4"
          },
          "bb": {
            ".label": "0x11bbbb",
            ".proof_hash": "proofHash2",
            ".radix_ph": "0xbbc5610ad726c88350abbe6513ab8f7441cbe8ff09ece86642a827feb53ce184"
          }
        }
      });

      assert.deepEqual(stateTree.getProofOfState(label2, 'childProof2'), {
        ".radix_ph": "0xd9251f484361885000e88f2385777e1c4558a08125199a99c6b3296b459628c6",
        "00aaaa": {
          ".radix_ph": "0xd8895ab36f227519e479a4bf7cfcbf963deb8e69e8172f395af8db83172bf22c"
        },
        "11bb": {
          "11": {
            ".radix_ph": "0x741ba4788b06907f8c99c60a6f483f885cc1b4fb27f9e1bed71dfd1d8a213214"
          },
          ".radix_ph": "0x099ad81295e3257147362606afc34b47757dd5c1508d441e248302be8577ed44",
          "00": {
            ".radix_ph": "0x3dfb52c0d974feb0559c9efafa996fb286717785e98871336e68ffb52d04bdf4"
          },
          "bb": {
            ".label": "0x11bbbb",
            ".proof_hash": "childProof2",
            ".radix_ph": "0xbbc5610ad726c88350abbe6513ab8f7441cbe8ff09ece86642a827feb53ce184"
          }
        }
      });
    });
  });
});
