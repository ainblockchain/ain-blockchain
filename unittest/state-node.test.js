const StateNode = require('../db/state-node');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

const {
  NUM_CHILDREN_TO_ENABLE_RADIX_TREE,
  NUM_CHILDREN_TO_DISABLE_RADIX_TREE,
} = require('../common/constants');
const CommonUtil = require('../common/common-util');
const { GET_OPTIONS_INCLUDE_ALL } = require('./test-util');
const {
  updateStateInfoForStateTree,
  verifyProofHashForStateTree,
} = require('../db/state-util');

describe("state-node", () => {
  let node;

  const label1 = '0x00aaaa';
  const label2 = '0x11bbbb';
  const label3 = '0x11bb00';
  const label4 = '0x11bb11';

  let stateTreeEnabled;
  let child1Enabled;
  let child2Enabled;
  let child3Enabled;
  let child4Enabled;

  let stateTreeDisabled;
  let child1Disabled;
  let child2Disabled;
  let child3Disabled;
  let child4Disabled;

  beforeEach(() => {
    node = new StateNode();

    child1Enabled = new StateNode();
    child2Enabled = new StateNode();
    child3Enabled = new StateNode();
    child4Enabled = new StateNode();
    child1Enabled.setValue('value1');
    child2Enabled.setValue('value2');
    child3Enabled.setValue('value3');
    child4Enabled.setValue('value4');

    stateTreeEnabled = new StateNode();
    stateTreeEnabled.setRadixTreeEnabled(true);  // radeixTreeEnabled = true
    stateTreeEnabled.setChild(label1, child1Enabled);
    stateTreeEnabled.setChild(label2, child2Enabled);
    stateTreeEnabled.setChild(label3, child3Enabled);
    stateTreeEnabled.setChild(label4, child4Enabled);

    child1Disabled = new StateNode();
    child2Disabled = new StateNode();
    child3Disabled = new StateNode();
    child4Disabled = new StateNode();
    child1Disabled.setValue('value1');
    child2Disabled.setValue('value2');
    child3Disabled.setValue('value3');
    child4Disabled.setValue('value4');

    stateTreeDisabled = new StateNode();
    stateTreeDisabled.setRadixTreeEnabled(false);  // radeixTreeEnabled = false
    stateTreeDisabled.setChild(label1, child1Disabled);
    stateTreeDisabled.setChild(label2, child2Disabled);
    stateTreeDisabled.setChild(label3, child3Disabled);
    stateTreeDisabled.setChild(label4, child4Disabled);
  })

  describe("Initialization / reset", () => {
    it("constructor", () => {
      expect(node.version).to.equal(null);
      expect(node.label).to.equal(null);
      expect(node.isLeaf).to.equal(true);
      expect(node.value).to.equal(null);
      expect(node.parentSet.size).to.equal(0);
      expect(node.radixTreeEnabled).to.equal(false);
      expect(node.radixTree.size()).to.equal(0);
      expect(node.childMap.size).to.equal(0);
      expect(node.proofHash).to.equal(null);
      expect(node.treeHeight).to.equal(0);
      expect(node.treeSize).to.equal(0);
      expect(node.treeBytes).to.equal(0);
    });

    it("reset", () => {
      const version = 'ver';
      const label = 'label';
      const value = 'val';
      const parentNode = new StateNode();
      const childLabel = 'childLabel';
      const childNode = new StateNode();
      const proofHash = 'PH';
      const treeHeight = 1;
      const treeSize = 10;
      const treeBytes = 100;

      node.setVersion(version);
      node._setLabel(label);
      node.setValue(value);
      node.addParent(parentNode);
      node.setRadixTreeEnabled(true);
      node.setChild(childLabel, childNode);
      node.setProofHash(proofHash);
      node.setTreeHeight(treeHeight);
      node.setTreeSize(treeSize);
      node.setTreeBytes(treeBytes);

      node.reset();
      expect(node.version).to.equal(null);
      expect(node.label).to.equal(null);
      expect(node.isLeaf).to.equal(true);
      expect(node.value).to.equal(null);
      expect(node.parentSet.size).to.equal(0);
      expect(node.radixTreeEnabled).to.equal(false);
      expect(node.radixTree.size()).to.equal(0);
      expect(node.childMap.size).to.equal(0);
      expect(node.proofHash).to.equal(null);
      expect(node.treeHeight).to.equal(0);
      expect(node.treeSize).to.equal(0);
      expect(node.treeBytes).to.equal(0);
    });
  });

  describe("Initialization with version", () => {
    it("constructor", () => {
      const node2 = new StateNode('version1');
      expect(node2.version).to.equal('version1');
      expect(node2.label).to.equal(null);
      expect(node2.isLeaf).to.equal(true);
      expect(node2.value).to.equal(null);
      expect(node2.parentSet.size).to.equal(0);
      expect(node2.radixTreeEnabled).to.equal(false);
      expect(node2.radixTree.size()).to.equal(0);
      expect(node2.childMap.size).to.equal(0);
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

    it("internal node when radixTreeEnabled = true", () => {
      stateTreeEnabled._setLabel('label_root');
      stateTreeEnabled.setVersion('version1');
      assert.deepEqual(stateTreeEnabled.getParentNodes(), []);
      assert.deepEqual(child1Enabled.getParentNodes(), [stateTreeEnabled]);
      assert.deepEqual(child2Enabled.getParentNodes(), [stateTreeEnabled]);
      assert.deepEqual(child3Enabled.getParentNodes(), [stateTreeEnabled]);
      assert.deepEqual(child4Enabled.getParentNodes(), [stateTreeEnabled]);
      expect(verifyProofHashForStateTree(stateTreeEnabled)).to.equal(false);
      updateStateInfoForStateTree(stateTreeEnabled);
      expect(verifyProofHashForStateTree(stateTreeEnabled)).to.equal(true);

      const clone = stateTreeEnabled.clone();
      expect(clone.getVersion()).to.equal(stateTreeEnabled.getVersion());
      expect(clone.getIsLeaf()).to.equal(false);
      assert.deepEqual(child1Enabled.getParentNodes(), [stateTreeEnabled, clone]);
      assert.deepEqual(child2Enabled.getParentNodes(), [stateTreeEnabled, clone]);
      assert.deepEqual(child3Enabled.getParentNodes(), [stateTreeEnabled, clone]);
      assert.deepEqual(child4Enabled.getParentNodes(), [stateTreeEnabled, clone]);
      assert.deepEqual(clone.getParentNodes(), []);
      assert.deepEqual(clone.getChildLabels(), stateTreeEnabled.getChildLabels());
      assert.deepEqual(clone.getChildNodes(), stateTreeEnabled.getChildNodes());
      assert.deepEqual(clone.numChildren(), stateTreeEnabled.numChildren());
      // Proof hash is verified without updateStateInfoForStateTree() call!
      expect(verifyProofHashForStateTree(clone)).to.equal(true);
      expect(clone.getLabel()).to.equal('label_root');
      expect(clone.getValue()).to.equal(null);
      expect(clone.getTreeHeight()).to.equal(stateTreeEnabled.getTreeHeight());
      expect(clone.getTreeSize()).to.equal(stateTreeEnabled.getTreeSize());
      expect(clone.getTreeBytes()).to.equal(stateTreeEnabled.getTreeBytes());
      assert.deepEqual(clone.toJsObject(GET_OPTIONS_INCLUDE_ALL), stateTreeEnabled.toJsObject(GET_OPTIONS_INCLUDE_ALL));
      expect(stateTreeEnabled.equal(clone)).to.equal(true);
    });

    it("internal node when radixTreeEnabled = false", () => {
      stateTreeDisabled._setLabel('label_root');
      stateTreeDisabled.setVersion('version1');
      assert.deepEqual(stateTreeDisabled.getParentNodes(), []);
      assert.deepEqual(child1Disabled.getParentNodes(), [stateTreeDisabled]);
      assert.deepEqual(child2Disabled.getParentNodes(), [stateTreeDisabled]);
      assert.deepEqual(child3Disabled.getParentNodes(), [stateTreeDisabled]);
      assert.deepEqual(child4Disabled.getParentNodes(), [stateTreeDisabled]);
      expect(verifyProofHashForStateTree(stateTreeDisabled)).to.equal(false);
      updateStateInfoForStateTree(stateTreeDisabled);
      expect(verifyProofHashForStateTree(stateTreeDisabled)).to.equal(true);

      const clone = stateTreeDisabled.clone();
      expect(clone.getVersion()).to.equal(stateTreeDisabled.getVersion());
      expect(clone.getIsLeaf()).to.equal(false);
      assert.deepEqual(child1Disabled.getParentNodes(), [stateTreeDisabled, clone]);
      assert.deepEqual(child2Disabled.getParentNodes(), [stateTreeDisabled, clone]);
      assert.deepEqual(child3Disabled.getParentNodes(), [stateTreeDisabled, clone]);
      assert.deepEqual(child4Disabled.getParentNodes(), [stateTreeDisabled, clone]);
      assert.deepEqual(clone.getParentNodes(), []);
      assert.deepEqual(clone.getChildLabels(), stateTreeDisabled.getChildLabels());
      assert.deepEqual(clone.getChildNodes(), stateTreeDisabled.getChildNodes());
      assert.deepEqual(clone.numChildren(), stateTreeDisabled.numChildren());
      // Proof hash is verified without updateStateInfoForStateTree() call!
      expect(verifyProofHashForStateTree(clone)).to.equal(true);
      expect(clone.getLabel()).to.equal('label_root');
      expect(clone.getValue()).to.equal(null);
      expect(clone.getTreeHeight()).to.equal(stateTreeDisabled.getTreeHeight());
      expect(clone.getTreeSize()).to.equal(stateTreeDisabled.getTreeSize());
      expect(clone.getTreeBytes()).to.equal(stateTreeDisabled.getTreeBytes());
      assert.deepEqual(clone.toJsObject(GET_OPTIONS_INCLUDE_ALL), stateTreeDisabled.toJsObject(GET_OPTIONS_INCLUDE_ALL));
      expect(stateTreeDisabled.equal(clone)).to.equal(true);
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

    it("internal node when radixTreeEnabled = true", () => {
      stateTreeEnabled.setProofHash('hash');
      stateTreeEnabled.setVersion('version1');
      assert.deepEqual(stateTreeEnabled.getParentNodes(), []);
      assert.deepEqual(child1Enabled.getParentNodes(), [stateTreeEnabled]);
      assert.deepEqual(child2Enabled.getParentNodes(), [stateTreeEnabled]);
      assert.deepEqual(child3Enabled.getParentNodes(), [stateTreeEnabled]);

      const clone = stateTreeEnabled.clone('version2');
      expect(clone.getVersion()).to.equal('version2');
      expect(clone.getIsLeaf()).to.equal(false);
      assert.deepEqual(child1Enabled.getParentNodes(), [stateTreeEnabled, clone]);
      assert.deepEqual(child2Enabled.getParentNodes(), [stateTreeEnabled, clone]);
      assert.deepEqual(child3Enabled.getParentNodes(), [stateTreeEnabled, clone]);
      assert.deepEqual(clone.getParentNodes(), []);
      assert.deepEqual(clone.getChildLabels(), stateTreeEnabled.getChildLabels());
      assert.deepEqual(clone.getChildNodes(), stateTreeEnabled.getChildNodes());
      expect(clone.getValue()).to.equal(null);
      expect(clone.getProofHash()).to.equal('hash');
      expect(clone.getTreeHeight()).to.equal(stateTreeEnabled.getTreeHeight());
      expect(clone.getTreeSize()).to.equal(stateTreeEnabled.getTreeSize());
      expect(clone.getTreeBytes()).to.equal(stateTreeEnabled.getTreeBytes());
    });

    it("internal node when radixTreeEnabled = false", () => {
      stateTreeDisabled.setProofHash('hash');
      stateTreeDisabled.setVersion('version1');
      assert.deepEqual(stateTreeDisabled.getParentNodes(), []);
      assert.deepEqual(child1Disabled.getParentNodes(), [stateTreeDisabled]);
      assert.deepEqual(child2Disabled.getParentNodes(), [stateTreeDisabled]);
      assert.deepEqual(child3Disabled.getParentNodes(), [stateTreeDisabled]);

      const clone = stateTreeDisabled.clone('version2');
      expect(clone.getVersion()).to.equal('version2');
      expect(clone.getIsLeaf()).to.equal(false);
      assert.deepEqual(child1Disabled.getParentNodes(), [stateTreeDisabled, clone]);
      assert.deepEqual(child2Disabled.getParentNodes(), [stateTreeDisabled, clone]);
      assert.deepEqual(child3Disabled.getParentNodes(), [stateTreeDisabled, clone]);
      assert.deepEqual(clone.getParentNodes(), []);
      assert.deepEqual(clone.getChildLabels(), stateTreeDisabled.getChildLabels());
      assert.deepEqual(clone.getChildNodes(), stateTreeDisabled.getChildNodes());
      expect(clone.getValue()).to.equal(null);
      expect(clone.getProofHash()).to.equal('hash');
      expect(clone.getTreeHeight()).to.equal(stateTreeDisabled.getTreeHeight());
      expect(clone.getTreeSize()).to.equal(stateTreeDisabled.getTreeSize());
      expect(clone.getTreeBytes()).to.equal(stateTreeDisabled.getTreeBytes());
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

      node1.setRadixTreeEnabled(false);
      node2.setRadixTreeEnabled(true);
      expect(node1.equal(node2)).to.equal(false);
      node1.setRadixTreeEnabled(true);
      node2.setRadixTreeEnabled(true);
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
      expect(StateNode.fromJsObject('').toJsObject()).to.equal('');
      expect(StateNode.fromJsObject(null).toJsObject()).to.equal(null);
      expect(StateNode.fromJsObject(undefined).toJsObject()).to.equal(undefined);
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

      expect(StateNode.fromJsObject('str', ver1).toJsObject(GET_OPTIONS_INCLUDE_ALL)).to.equal('str');
    })

    it("internal node", () => {
      const ver1 = 'ver1';

      const stateObj = {
        str: 'str',
        subobj1: {
          str: 'str1',
        },
        subobj2: {
          str: 'str2',
        }
      };

      // includeVersion = true
      assert.deepEqual(StateNode.fromJsObject(stateObj, ver1).toJsObject({ includeVersion: true }), {
        ".version": "ver1",
        ".version:str": "ver1",
        "str": "str",
        "subobj1": {
          ".version": "ver1",
          ".version:str": "ver1",
          "str": "str1"
        },
        "subobj2": {
          ".version": "ver1",
          ".version:str": "ver1",
          "str": "str2"
        }
      });

      // includeTreeInfo = true
      assert.deepEqual(StateNode.fromJsObject(stateObj, ver1).toJsObject({ includeTreeInfo: true }), {
        ".num_parents": 0,
        ".num_parents:str": 1,
        ".tree_bytes": 0,
        ".tree_bytes:str": 0,
        ".tree_height": 0,
        ".tree_height:str": 0,
        ".tree_size": 0,
        ".tree_size:str": 0,
        "str": "str",
        "subobj1": {
          ".num_parents": 1,
          ".num_parents:str": 1,
          ".tree_bytes": 0,
          ".tree_bytes:str": 0,
          ".tree_height": 0,
          ".tree_height:str": 0,
          ".tree_size": 0,
          ".tree_size:str": 0,
          "str": "str1"
        },
        "subobj2": {
          ".num_parents": 1,
          ".num_parents:str": 1,
          ".tree_bytes": 0,
          ".tree_bytes:str": 0,
          ".tree_height": 0,
          ".tree_height:str": 0,
          ".tree_size": 0,
          ".tree_size:str": 0,
          "str": "str2"
        }
      });

      // includeProof = true
      assert.deepEqual(StateNode.fromJsObject(stateObj, ver1).toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        ".proof_hash:str": null,
        "str": "str",
        "subobj1": {
          ".proof_hash": null,
          ".proof_hash:str": null,
          "str": "str1"
        },
        "subobj2": {
          ".proof_hash": null,
          ".proof_hash:str": null,
          "str": "str2"
        }
      });
    })
  })

  describe("fromJsObject with radixTreeEnabled / toJsObject", () => {
    it("leaf node", () => {
      expect(StateNode.fromJsObject('str', null, true).toJsObject(GET_OPTIONS_INCLUDE_ALL)).to.equal('str');
    })

    it("internal node", () => {
      const stateObj = {
        str: 'str',
        subobj1: {
          str: 'str1',
        },
        subobj2: {
          str: 'str2',
        }
      };

      const rootEnabled = StateNode.fromJsObject(stateObj, null, true);
      expect(rootEnabled.getRadixTreeEnabled()).to.equal(true);
      expect(rootEnabled.getChild('subobj1').getRadixTreeEnabled()).to.equal(true);
      expect(rootEnabled.getChild('subobj1').getChild('str').getRadixTreeEnabled()).to.equal(true);
      expect(rootEnabled.getChild('subobj2').getRadixTreeEnabled()).to.equal(true);
      expect(rootEnabled.getChild('subobj2').getChild('str').getRadixTreeEnabled()).to.equal(true);

      const rootDisabled = StateNode.fromJsObject(stateObj, null, false);
      expect(rootDisabled.getRadixTreeEnabled()).to.equal(false);
      expect(rootDisabled.getChild('subobj1').getRadixTreeEnabled()).to.equal(false);
      expect(rootDisabled.getChild('subobj1').getChild('str').getRadixTreeEnabled()).to.equal(false);
      expect(rootDisabled.getChild('subobj2').getRadixTreeEnabled()).to.equal(false);
      expect(rootDisabled.getChild('subobj2').getChild('str').getRadixTreeEnabled()).to.equal(false);
    })
  })

  describe("fromJsObject / toJsObject with isShallow", () => {
    it("leaf node", () => {
      expect(StateNode.fromJsObject('str').toJsObject({ isShallow: true })).to.equal('str');
    })

    it("internal node", () => {
      assert.deepEqual(StateNode.fromJsObject({ a: 1, b: 2, c: 3 }).toJsObject({ isShallow: true }),
          {
            a: true,
            b: true,
            c: true,
          },
      );
      assert.deepEqual(StateNode.fromJsObject({ a: { aa: 11 }, b: 2 }).toJsObject({ isShallow: true }),
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

      child.deleteParent(parent1);
      expect(child._hasParent(parent1)).to.equal(false);
      expect(child._hasParent(parent2)).to.equal(true);
      assert.deepEqual(child.getParentNodes(), [parent2]);
      expect(child.numParents()).to.equal(1);

      child.deleteParent(parent2);
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

      child1.deleteParent(parent1);
      child2.deleteParent(parent2);
      expect(child1._hasParent(parent1)).to.equal(false);
      expect(child1._hasParent(parent2)).to.equal(true);
      expect(child2._hasParent(parent1)).to.equal(true);
      expect(child2._hasParent(parent2)).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), [parent2]);
      assert.deepEqual(child2.getParentNodes(), [parent1]);
      expect(child1.numParents()).to.equal(1);
      expect(child2.numParents()).to.equal(1);

      child1.deleteParent(parent2);
      child2.deleteParent(parent1);
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

      child.deleteParent(parent2);
      expect(child._hasParent(parent1)).to.equal(true);
      expect(child._hasParent(parent2)).to.equal(false);
      assert.deepEqual(child.getParentNodes(), [parent1]);
      expect(child.numParents()).to.equal(1);
    });
  });

  describe("radixTreeEnabled", () => {
    it("get / set", () => {
      node.setRadixTreeEnabled(true);
      expect(node.getRadixTreeEnabled()).to.equal(true);
      node.setRadixTreeEnabled(false);
      expect(node.getRadixTreeEnabled()).to.equal(false);
    });
  });

  describe("child when radixTreeEnabled = true", () => {
    const label1 = 'label1';
    const label2 = 'label2';

    let parent1;
    let parent2;
    let child1;
    let child2;

    beforeEach(() => {
      parent1 = new StateNode();
      parent1.setRadixTreeEnabled(true);  // radixTreeEnabled = true

      parent2 = new StateNode();
      parent2.setRadixTreeEnabled(true);  // radixTreeEnabled = true

      child1 = new StateNode();
      child1.setValue('value1');

      child2 = new StateNode();
      child2.setValue('value2');
    });

    it("get / set / has / delete with single parent", () => {
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

    it("delete with shouldUpdateStateInfo = true", () => {
      // Set children
      parent1.setChild(label1, child1);
      parent1.setChild(label2, child2);

      expect(parent1.getProofHash()).to.equal(null);
      parent1.deleteChild(label1, true);  // shouldUpdateStateInfo = true
      expect(parent1.getProofHash()).to.not.equal(null);  // not null!!
    });

    it("get / set / has / delete with multiple parents", () => {
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
      expect(parent1.hasChild(label1)).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), []);
      expect(child1.numParents()).to.equal(0);
      assert.deepEqual(parent1.getChild(label1), null);
      expect(parent1.getIsLeaf()).to.equal(true);

      parent1.setChild(label1, child1);
      expect(parent1.hasChild(label1)).to.equal(true);
      assert.deepEqual(child1.getParentNodes(), [parent1]);
      expect(child1.numParents()).to.equal(1);
      assert.deepEqual(parent1.getChild(label1), child1);
      expect(parent1.getIsLeaf()).to.equal(false);

      parent1.setChild(label1, child1);
      expect(parent1.hasChild(label1)).to.equal(true);
      assert.deepEqual(child1.getParentNodes(), [parent1]);
      expect(child1.numParents()).to.equal(1);
      assert.deepEqual(parent1.getChild(label1), child1);
      expect(parent1.getIsLeaf()).to.equal(false);
    });

    it("override existing child", () => {
      expect(parent1.hasChild(label1)).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(0);
      assert.deepEqual(parent1.getChild(label1), null);
      expect(parent1.getIsLeaf()).to.equal(true);

      parent1.setChild(label1, child1);
      expect(parent1.hasChild(label1)).to.equal(true);
      assert.deepEqual(child1.getParentNodes(), [parent1]);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.numParents()).to.equal(1);
      expect(child2.numParents()).to.equal(0);
      assert.deepEqual(parent1.getChild(label1), child1);
      expect(parent1.getIsLeaf()).to.equal(false);

      parent1.setChild(label1, child2);
      expect(parent1.hasChild(label1)).to.equal(true);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), [parent1]);
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(1);
      assert.deepEqual(parent1.getChild(label1), child2);
      expect(parent1.getIsLeaf()).to.equal(false);
    });

    it("delete non-existing child", () => {
      expect(parent1.hasChild(label1)).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), []);
      expect(child1.numParents()).to.equal(0);
      assert.deepEqual(parent1.getChild(label1), null);
      expect(parent1.getIsLeaf()).to.equal(true);

      parent1.deleteChild(label1);
      expect(parent1.hasChild(label1)).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), []);
      expect(child1.numParents()).to.equal(0);
      assert.deepEqual(parent1.getChild(label1), null);
      expect(parent1.getIsLeaf()).to.equal(true);
    });

    it("getChildLabels / getChildNodes / numChildren / isLeaf", () => {
      assert.deepEqual(parent1.getChildLabels(), []);
      assert.deepEqual(parent1.getChildNodes(), []);
      expect(parent1.numChildren()).to.equal(0);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(parent1.getIsLeaf()).to.equal(true);

      parent1.setChild(label1, child1);
      assert.deepEqual(parent1.getChildLabels(), ['label1']);
      assert.deepEqual(parent1.getChildNodes(), [child1]);
      expect(parent1.numChildren()).to.equal(1);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(parent1.getIsLeaf()).to.equal(false);

      parent1.setChild(label2, child2);
      assert.deepEqual(parent1.getChildLabels(), ['label1', 'label2']);
      assert.deepEqual(parent1.getChildNodes(), [child1, child2]);
      expect(parent1.numChildren()).to.equal(2);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(parent1.getIsLeaf()).to.equal(false);

      parent1.deleteChild(label2);
      assert.deepEqual(parent1.getChildLabels(), ['label1']);
      assert.deepEqual(parent1.getChildNodes(), [child1]);
      expect(parent1.numChildren()).to.equal(1);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(parent1.getIsLeaf()).to.equal(false);

      parent1.deleteChild(label1);
      assert.deepEqual(parent1.getChildLabels(), []);
      assert.deepEqual(parent1.getChildNodes(), []);
      expect(parent1.numChildren()).to.equal(0);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(parent1.getIsLeaf()).to.equal(true);
    });
  });

  describe("child when radixTreeEnabled = false", () => {
    const label1 = 'label1';
    const label2 = 'label2';

    let parent1;
    let parent2;
    let child1;
    let child2;

    beforeEach(() => {
      parent1 = new StateNode();
      parent1.setRadixTreeEnabled(false);  // radixTreeEnabled = false

      parent2 = new StateNode();
      parent2.setRadixTreeEnabled(false);  // radixTreeEnabled = false

      child1 = new StateNode();
      child1.setValue('value1');

      child2 = new StateNode();
      child2.setValue('value2');
    });

    it("get / set / has / delete with single parent", () => {
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

    it("delete with shouldUpdateStateInfo = true", () => {
      // Set children
      parent1.setChild(label1, child1);
      parent1.setChild(label2, child2);

      expect(parent1.getProofHash()).to.equal(null);
      parent1.deleteChild(label1, true);  // shouldUpdateStateInfo = true
      expect(parent1.getProofHash()).to.not.equal(null);  // not null!!
    });

    it("get / set / has / delete with multiple parents", () => {
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
      expect(parent1.hasChild(label1)).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), []);
      expect(child1.numParents()).to.equal(0);
      assert.deepEqual(parent1.getChild(label1), null);
      expect(parent1.getIsLeaf()).to.equal(true);

      parent1.setChild(label1, child1);
      expect(parent1.hasChild(label1)).to.equal(true);
      assert.deepEqual(child1.getParentNodes(), [parent1]);
      expect(child1.numParents()).to.equal(1);
      assert.deepEqual(parent1.getChild(label1), child1);
      expect(parent1.getIsLeaf()).to.equal(false);

      parent1.setChild(label1, child1);
      expect(parent1.hasChild(label1)).to.equal(true);
      assert.deepEqual(child1.getParentNodes(), [parent1]);
      expect(child1.numParents()).to.equal(1);
      assert.deepEqual(parent1.getChild(label1), child1);
      expect(parent1.getIsLeaf()).to.equal(false);
    });

    it("override existing child", () => {
      expect(parent1.hasChild(label1)).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(0);
      assert.deepEqual(parent1.getChild(label1), null);
      expect(parent1.getIsLeaf()).to.equal(true);

      parent1.setChild(label1, child1);
      expect(parent1.hasChild(label1)).to.equal(true);
      assert.deepEqual(child1.getParentNodes(), [parent1]);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.numParents()).to.equal(1);
      expect(child2.numParents()).to.equal(0);
      assert.deepEqual(parent1.getChild(label1), child1);
      expect(parent1.getIsLeaf()).to.equal(false);

      parent1.setChild(label1, child2);
      expect(parent1.hasChild(label1)).to.equal(true);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), [parent1]);
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(1);
      assert.deepEqual(parent1.getChild(label1), child2);
      expect(parent1.getIsLeaf()).to.equal(false);
    });

    it("delete non-existing child", () => {
      expect(parent1.hasChild(label1)).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), []);
      expect(child1.numParents()).to.equal(0);
      assert.deepEqual(parent1.getChild(label1), null);
      expect(parent1.getIsLeaf()).to.equal(true);

      parent1.deleteChild(label1);
      expect(parent1.hasChild(label1)).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), []);
      expect(child1.numParents()).to.equal(0);
      assert.deepEqual(parent1.getChild(label1), null);
      expect(parent1.getIsLeaf()).to.equal(true);
    });

    it("getChildLabels / getChildNodes / numChildren / isLeaf", () => {
      assert.deepEqual(parent1.getChildLabels(), []);
      assert.deepEqual(parent1.getChildNodes(), []);
      expect(parent1.numChildren()).to.equal(0);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(parent1.getIsLeaf()).to.equal(true);

      parent1.setChild(label1, child1);
      assert.deepEqual(parent1.getChildLabels(), ['label1']);
      assert.deepEqual(parent1.getChildNodes(), [child1]);
      expect(parent1.numChildren()).to.equal(1);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(parent1.getIsLeaf()).to.equal(false);

      parent1.setChild(label2, child2);
      assert.deepEqual(parent1.getChildLabels(), ['label1', 'label2']);
      assert.deepEqual(parent1.getChildNodes(), [child1, child2]);
      expect(parent1.numChildren()).to.equal(2);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(parent1.getIsLeaf()).to.equal(false);

      parent1.deleteChild(label2);
      assert.deepEqual(parent1.getChildLabels(), ['label1']);
      assert.deepEqual(parent1.getChildNodes(), [child1]);
      expect(parent1.numChildren()).to.equal(1);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(parent1.getIsLeaf()).to.equal(false);

      parent1.deleteChild(label1);
      assert.deepEqual(parent1.getChildLabels(), []);
      assert.deepEqual(parent1.getChildNodes(), []);
      expect(parent1.numChildren()).to.equal(0);
      expect(child1.getIsLeaf()).to.equal(true);
      expect(child2.getIsLeaf()).to.equal(true);
      expect(parent1.getIsLeaf()).to.equal(true);
    });
  });

  describe("dynamic radix tree", () => {
    let stateNodeEnabled;
    let stateNodeDisabled;

    beforeEach(() => {
      stateNodeEnabled = new StateNode();
      stateNodeEnabled.setRadixTreeEnabled(true);  // radixTreeEnabled = true

      stateNodeDisabled = new StateNode();
      stateNodeDisabled.setRadixTreeEnabled(false);  // radixTreeEnabled = false
    });

    it("setChild() to call enableRadixTree()", () => {
      for (let i = 1; i <= NUM_CHILDREN_TO_ENABLE_RADIX_TREE - 1; i++) {
        const childLabel = `label_${i}`;
        stateNodeDisabled.setChild(childLabel, new StateNode())
      }

      expect(stateNodeDisabled.getRadixTreeEnabled()).to.equal(false);
      const childLabel = `label_${NUM_CHILDREN_TO_ENABLE_RADIX_TREE}`;
      stateNodeDisabled.setChild(childLabel, new StateNode());
      expect(stateNodeDisabled.getRadixTreeEnabled()).to.equal(true);
      expect(stateNodeDisabled.numChildren()).to.equal(NUM_CHILDREN_TO_ENABLE_RADIX_TREE);
    });

    it("deleteChild() to call disableRadixTree()", () => {
      for (let i = 1; i <= NUM_CHILDREN_TO_DISABLE_RADIX_TREE + 1; i++) {
        const childLabel = `label_${i}`;
        stateNodeEnabled.setChild(childLabel, new StateNode())
      }

      expect(stateNodeEnabled.getRadixTreeEnabled()).to.equal(true);
      const childLabel = `label_${NUM_CHILDREN_TO_DISABLE_RADIX_TREE + 1}`;
      stateNodeEnabled.deleteChild(childLabel);
      expect(stateNodeEnabled.getRadixTreeEnabled()).to.equal(false);
      expect(stateNodeEnabled.numChildren()).to.equal(NUM_CHILDREN_TO_DISABLE_RADIX_TREE);
    });
  });

  describe("proof hash", () => {
    it("getProofHash / setProofHash", () => {
      expect(node.getProofHash()).to.equal(null);
      node.setProofHash('hash');
      expect(node.getProofHash()).to.equal('hash');
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
      expect(node._buildProofHash()).to.equal(CommonUtil.hashString(CommonUtil.toString(true)));
      node.setValue(10);
      expect(node._buildProofHash()).to.equal(CommonUtil.hashString(CommonUtil.toString(10)));
      node.setValue(-200);
      expect(node._buildProofHash()).to.equal(CommonUtil.hashString(CommonUtil.toString(-200)));
      node.setValue('');
      expect(node._buildProofHash()).to.equal(CommonUtil.hashString(CommonUtil.toString('')));
      node.setValue('unittest');
      expect(node._buildProofHash()).to.equal(CommonUtil.hashString(CommonUtil.toString('unittest')));
      node.setValue(null);
      expect(node._buildProofHash()).to.equal(CommonUtil.hashString(CommonUtil.toString(null)));
      node.setValue(undefined);
      expect(node._buildProofHash()).to.equal(CommonUtil.hashString(CommonUtil.toString(undefined)));
    });

    it("internal node when radixTreeEnabled = true", () => {
      child1Enabled.setProofHash('proofHash1');
      child2Enabled.setProofHash('proofHash2');
      child3Enabled.setProofHash('proofHash3');
      child4Enabled.setProofHash('proofHash4');
      expect(stateTreeEnabled.radixTree.verifyProofHashForRadixTree()).to.equal(false);

      // build proof hash without updatedChildLabel
      const proofHashBefore = stateTreeEnabled._buildProofHash();
      expect(proofHashBefore).to.equal(stateTreeEnabled.radixTree.getRootProofHash());
      expect(stateTreeEnabled.radixTree.verifyProofHashForRadixTree()).to.equal(true);

      // set another proof hash value for a child
      child2Enabled.setProofHash('another PH');

      // build proof hash with updatedChildLabel
      const proofHashAfter = stateTreeEnabled._buildProofHash(label2);
      expect(proofHashAfter).not.equal(proofHashBefore);  // Updated!!
      expect(proofHashAfter).to.equal(stateTreeEnabled.radixTree.getRootProofHash());
      expect(stateTreeEnabled.radixTree.verifyProofHashForRadixTree()).to.equal(true);

      // set another proof hash value for a child again
      child2Enabled.setProofHash('yet another PH');
      expect(stateTreeEnabled.radixTree.verifyProofHashForRadixTree()).to.equal(false);

      // build proof hash with updatedChildLabel and shouldRebuildRadixInfo = false
      const radixTreeProofHashBefore = stateTreeEnabled.radixTree.getRootProofHash();
      const proofHashAfter2 = stateTreeEnabled._buildProofHash(label2, false);
      expect(proofHashAfter2).equal(radixTreeProofHashBefore);  // Unchanged!!
      expect(proofHashAfter2).to.equal(stateTreeEnabled.radixTree.getRootProofHash());
      expect(stateTreeEnabled.radixTree.verifyProofHashForRadixTree()).to.equal(false);
    });

    it("internal node when radixTreeEnabled = false", () => {
      child1Disabled.setProofHash('proofHash1');
      child2Disabled.setProofHash('proofHash2');
      child3Disabled.setProofHash('proofHash3');
      child4Disabled.setProofHash('proofHash4');
      expect(stateTreeDisabled.radixTree.verifyProofHashForRadixTree()).to.equal(false);

      // build proof hash without updatedChildLabel
      const proofHashBefore = stateTreeDisabled._buildProofHash();
      // set another proof hash value for a child
      child2Disabled.setProofHash('another PH');

      // build proof hash with updatedChildLabel
      const proofHashAfter = stateTreeDisabled._buildProofHash(label2);
      expect(proofHashAfter).not.equal(proofHashBefore);  // Updated!!
    });
  });

  describe("_buildTreeInfo", () => {
    describe("tree height", () => {
      it("leaf node", () => {
        node.setValue(true);
        expect(node._buildTreeInfo().treeHeight).to.equal(0);
        node.setValue(10);
        expect(node._buildTreeInfo().treeHeight).to.equal(0);
        node.setValue(-200);
        expect(node._buildTreeInfo().treeHeight).to.equal(0);
        node.setValue('');
        expect(node._buildTreeInfo().treeHeight).to.equal(0);
        node.setValue('unittest');
        expect(node._buildTreeInfo().treeHeight).to.equal(0);
        node.setValue(null);
        expect(node._buildTreeInfo().treeHeight).to.equal(0);
        node.setValue(undefined);
        expect(node._buildTreeInfo().treeHeight).to.equal(0);
      });

      // here
      it("internal node when radixTreeEnabled = true", () => {
        child1Enabled.setTreeHeight(0);
        child2Enabled.setTreeHeight(1);
        child3Enabled.setTreeHeight(2);
        child4Enabled.setTreeHeight(3);
        stateTreeEnabled.radixTree.root.setTreeHeight(100);

        expect(stateTreeEnabled._buildTreeInfo().treeHeight).to.equal(101);
        // With updatedChildLabel = label1, shouldRebuildRadixInfo = true
        expect(stateTreeEnabled._buildTreeInfo(label1, true).treeHeight).to.equal(1);
        // With updatedChildLabel = null, shouldRebuildRadixInfo = true
        expect(stateTreeEnabled._buildTreeInfo(null, true).treeHeight).to.equal(4);
      });

      it("internal node when radixTreeEnabled = false", () => {
        child1Disabled.setTreeHeight(0);
        child2Disabled.setTreeHeight(1);
        child3Disabled.setTreeHeight(2);
        child4Disabled.setTreeHeight(3);

        expect(stateTreeDisabled._buildTreeInfo().treeHeight).to.equal(4);
      });
    });

    describe("tree size", () => {
      it("leaf node", () => {
        node.setValue(true);
        expect(node._buildTreeInfo().treeSize).to.equal(1);
        node.setValue(10);
        expect(node._buildTreeInfo().treeSize).to.equal(1);
        node.setValue(-200);
        expect(node._buildTreeInfo().treeSize).to.equal(1);
        node.setValue('');
        expect(node._buildTreeInfo().treeSize).to.equal(1);
        node.setValue('unittest');
        expect(node._buildTreeInfo().treeSize).to.equal(1);
        node.setValue(null);
        expect(node._buildTreeInfo().treeSize).to.equal(1);
        node.setValue(undefined);
        expect(node._buildTreeInfo().treeSize).to.equal(1);
      });

      it("internal node when radixTreeEnabled = true", () => {
        child1Enabled.setTreeSize(10);
        child2Enabled.setTreeSize(20);
        child3Enabled.setTreeSize(30);
        child4Enabled.setTreeSize(40);
        stateTreeEnabled.radixTree.root.setTreeSize(1000);

        expect(stateTreeEnabled._buildTreeInfo().treeSize).to.equal(1001);
        // With updatedChildLabel = label1, shouldRebuildRadixInfo = true
        expect(stateTreeEnabled._buildTreeInfo(label1, true).treeSize).to.equal(11);
        // With updatedChildLabel = null, shouldRebuildRadixInfo = true
        expect(stateTreeEnabled._buildTreeInfo(null, true).treeSize).to.equal(101);
      });

      it("internal node when radixTreeEnabled = false", () => {
        child1Disabled.setTreeSize(10);
        child2Disabled.setTreeSize(20);
        child3Disabled.setTreeSize(30);
        child4Disabled.setTreeSize(40);

        expect(stateTreeDisabled._buildTreeInfo().treeSize).to.equal(101);
      });
    });

    describe("tree bytes", () => {
      it("leaf node", () => {
        const parent = new StateNode();
        const label = 'label';
        parent.setChild(label, node);

        node.setVersion('ver');  // string (3 * 2 = 6 bytes)
        // node.isLeaf : boolean (4 bytses)
        node.setProofHash('hash');  // string (4 * 2 = 8 bytses)
        // node.treeHeight : number (8 bytses)
        // node.treeSize : number (8 bytses)
        // node.treeBytes : number (8 bytes)
        // TOTAL: 42 - 6 = 36 bytes (exclude version)
        expect(node._buildTreeInfo().treeBytes).to.equal(36);

        node.setValue(true);  // boolean (4 bytes)
        expect(node._buildTreeInfo().treeBytes).to.equal(40);
        node.setValue(10);  // number (8 bytes)
        expect(node._buildTreeInfo().treeBytes).to.equal(44);
        node.setValue(-200);  // number (8 bytes)
        expect(node._buildTreeInfo().treeBytes).to.equal(44);
        node.setValue('');  // string (0 * 2 = 0 bytes)
        expect(node._buildTreeInfo().treeBytes).to.equal(36);
        node.setValue('str');  // string (3 * 2 = 6 bytes)
        expect(node._buildTreeInfo().treeBytes).to.equal(42);
        node.setValue(null);  // null (0 bytes)
        expect(node._buildTreeInfo().treeBytes).to.equal(36);
        node.setValue(undefined);  // undefined (0 bytes)
        expect(node._buildTreeInfo().treeBytes).to.equal(36);
      });

      it("internal node when radixTreeEnabled = true", () => {
        const parent = new StateNode();
        const label = 'label';
        parent.setChild(label, stateTreeEnabled);

        stateTreeEnabled.setVersion('ver');  // string (3 * 2 = 6 bytes)
        // stateTreeEnabled.isLeaf : boolean (4 bytses)
        // stateTreeEnabled.value : null (0 bytses)
        stateTreeEnabled.setProofHash('hash');  // string (4 * 2 = 8 bytses)
        // stateTreeEnabled.treeHeight : number (8 bytses)
        // stateTreeEnabled.treeSize : number (8 bytses)
        // stateTreeEnabled.treeBytes : number (8 bytes)
        // TOTAL: 42 - 6 = 36 bytes (exclude version)
        expect(stateTreeEnabled.computeNodeBytes()).to.equal(36);

        child1Enabled.setTreeBytes(10);
        child2Enabled.setTreeBytes(20);
        child3Enabled.setTreeBytes(30);
        child4Enabled.setTreeBytes(40);
        stateTreeEnabled.radixTree.root.setTreeBytes(10000);

        // 36 + 100 = 136
        expect(stateTreeEnabled._buildTreeInfo().treeBytes).to.equal(10036);
        // With updatedChildLabel = label1, shouldRebuildRadixInfo = true
        // 36 + 8(label1) * 2 + 10 = 62
        expect(stateTreeEnabled._buildTreeInfo(label1, true).treeBytes).to.equal(62);
        // With updatedChildLabel = null, shouldRebuildRadixInfo = true
        // 36 + 8(label1) * 2 + 10 + 8(label2) * 2 + 20 + 8(label3) * 2 + 30 + 8(label4) * 2 + 40 = 200
        expect(stateTreeEnabled._buildTreeInfo(null, true).treeBytes).to.equal(200);
      });

      it("internal node when radixTreeEnabled = false", () => {
        const parent = new StateNode();
        const label = 'label';
        parent.setChild(label, stateTreeDisabled);

        stateTreeDisabled.setVersion('ver');  // string (3 * 2 = 6 bytes)
        // stateTreeDisabled.isLeaf : boolean (4 bytses)
        // stateTreeDisabled.value : null (0 bytses)
        stateTreeDisabled.setProofHash('hash');  // string (4 * 2 = 8 bytses)
        // stateTreeDisabled.treeHeight : number (8 bytses)
        // stateTreeDisabled.treeSize : number (8 bytses)
        // stateTreeDisabled.treeBytes : number (8 bytes)
        // TOTAL: 42 - 6 = 36 bytes (exclude version)
        expect(stateTreeDisabled.computeNodeBytes()).to.equal(36);

        child1Disabled.setTreeBytes(10);
        child2Disabled.setTreeBytes(20);
        child3Disabled.setTreeBytes(30);
        child4Disabled.setTreeBytes(40);

        // 36 + 8(label1) * 2 + 10 + 8(label2) * 2 + 20 + 8(label3) * 2 + 30 + 8(label4) * 2 + 40 = 200
        expect(stateTreeDisabled._buildTreeInfo().treeBytes).to.equal(200);
      });
    });
  });

  describe("updateStateInfo / verifyProofHash", () => {
    it("leaf node", () => {
      let treeInfo;

      node.setValue(true);
      expect(node.verifyProofHash()).to.equal(false);
      node.updateStateInfo();
      expect(node.getProofHash()).to.equal(node._buildProofHash());
      expect(node.verifyProofHash()).to.equal(true);
      treeInfo = node._buildTreeInfo();
      expect(node.getTreeHeight()).to.equal(treeInfo.treeHeight);
      expect(node.getTreeSize()).to.equal(treeInfo.treeSize);
      expect(node.getTreeBytes()).to.equal(treeInfo.treeBytes);

      node.setValue(10);
      expect(node.verifyProofHash()).to.equal(false);
      node.updateStateInfo();
      expect(node.getProofHash()).to.equal(node._buildProofHash());
      expect(node.verifyProofHash()).to.equal(true);
      treeInfo = node._buildTreeInfo();
      expect(node.getTreeHeight()).to.equal(treeInfo.treeHeight);
      expect(node.getTreeSize()).to.equal(treeInfo.treeSize);
      expect(node.getTreeBytes()).to.equal(treeInfo.treeBytes);

      node.setValue(-200);
      expect(node.verifyProofHash()).to.equal(false);
      node.updateStateInfo();
      expect(node.getProofHash()).to.equal(node._buildProofHash());
      expect(node.verifyProofHash()).to.equal(true);
      treeInfo = node._buildTreeInfo();
      expect(node.getTreeHeight()).to.equal(treeInfo.treeHeight);
      expect(node.getTreeSize()).to.equal(treeInfo.treeSize);
      expect(node.getTreeBytes()).to.equal(treeInfo.treeBytes);

      node.setValue('');
      expect(node.verifyProofHash()).to.equal(false);
      node.updateStateInfo();
      expect(node.getProofHash()).to.equal(node._buildProofHash());
      expect(node.verifyProofHash()).to.equal(true);
      treeInfo = node._buildTreeInfo();
      expect(node.getTreeHeight()).to.equal(treeInfo.treeHeight);
      expect(node.getTreeSize()).to.equal(treeInfo.treeSize);
      expect(node.getTreeBytes()).to.equal(treeInfo.treeBytes);

      node.setValue('str');
      expect(node.verifyProofHash()).to.equal(false);
      node.updateStateInfo();
      expect(node.getProofHash()).to.equal(node._buildProofHash());
      expect(node.verifyProofHash()).to.equal(true);
      treeInfo = node._buildTreeInfo();
      expect(node.getTreeHeight()).to.equal(treeInfo.treeHeight);
      expect(node.getTreeSize()).to.equal(treeInfo.treeSize);
      expect(node.getTreeBytes()).to.equal(treeInfo.treeBytes);

      node.setValue(null);
      expect(node.verifyProofHash()).to.equal(false);
      node.updateStateInfo();
      expect(node.getProofHash()).to.equal(node._buildProofHash());
      expect(node.verifyProofHash()).to.equal(true);
      treeInfo = node._buildTreeInfo();
      expect(node.getTreeHeight()).to.equal(treeInfo.treeHeight);
      expect(node.getTreeSize()).to.equal(treeInfo.treeSize);
      expect(node.getTreeBytes()).to.equal(treeInfo.treeBytes);

      node.setValue(undefined);
      expect(node.verifyProofHash()).to.equal(false);
      node.updateStateInfo();
      expect(node.getProofHash()).to.equal(node._buildProofHash());
      expect(node.verifyProofHash()).to.equal(true);
      treeInfo = node._buildTreeInfo();
      expect(node.getTreeHeight()).to.equal(treeInfo.treeHeight);
      expect(node.getTreeSize()).to.equal(treeInfo.treeSize);
      expect(node.getTreeBytes()).to.equal(treeInfo.treeBytes);
    });

    it("internal node when radixTreeEnabled = true", () => {
      child1Enabled.setProofHash('proofHash1');
      child2Enabled.setProofHash('proofHash2');
      child3Enabled.setProofHash('proofHash3');
      child4Enabled.setProofHash('proofHash4');
      child1Enabled.setTreeHeight(1);
      child2Enabled.setTreeHeight(2);
      child3Enabled.setTreeHeight(3);
      child4Enabled.setTreeHeight(4);
      child1Enabled.setTreeSize(10);
      child2Enabled.setTreeSize(20);
      child3Enabled.setTreeSize(30);
      child4Enabled.setTreeSize(40);
      expect(stateTreeEnabled.verifyProofHash()).to.equal(false);

      // update without updatedChildLabel
      stateTreeEnabled.updateStateInfo();
      const proofHash = stateTreeEnabled.getProofHash();
      expect(proofHash).to.equal(stateTreeEnabled._buildProofHash());
      expect(stateTreeEnabled.verifyProofHash()).to.equal(true);
      const treeInfo = stateTreeEnabled._buildTreeInfo();
      expect(stateTreeEnabled.getTreeHeight()).to.equal(treeInfo.treeHeight);
      expect(stateTreeEnabled.getTreeSize()).to.equal(treeInfo.treeSize);
      expect(stateTreeEnabled.getTreeBytes()).to.equal(treeInfo.treeBytes);

      // set another proof hash value for a child
      child2Enabled.setProofHash('another PH');

      // update with updatedChildLabel
      stateTreeEnabled.updateStateInfo(label2);
      const newProofHash = stateTreeEnabled.getProofHash();
      expect(newProofHash).not.equal(proofHash);  // Updated
      expect(newProofHash).to.equal(stateTreeEnabled._buildProofHash());
      expect(stateTreeEnabled.verifyProofHash()).to.equal(true);

      // set yet another proof hash value for a child
      child2Enabled.setProofHash('yet another PH');

      // update with updatedChildLabel and shouldRebuildRadixInfo = false
      const stateTreeProofHashBefore = stateTreeEnabled.getProofHash();
      stateTreeEnabled.updateStateInfo(label2, false);  // shouldRebuildRadixInfo = false
      const newProofHash2 = stateTreeEnabled.getProofHash();
      expect(newProofHash2).equal(stateTreeProofHashBefore);  // Unchanged
      expect(stateTreeEnabled.verifyProofHash()).to.equal(false);
    });

    it("internal node when radixTreeEnabled = false", () => {
      child1Disabled.setProofHash('proofHash1');
      child2Disabled.setProofHash('proofHash2');
      child3Disabled.setProofHash('proofHash3');
      child4Disabled.setProofHash('proofHash4');
      child1Disabled.setTreeHeight(1);
      child2Disabled.setTreeHeight(2);
      child3Disabled.setTreeHeight(3);
      child4Disabled.setTreeHeight(4);
      child1Disabled.setTreeSize(10);
      child2Disabled.setTreeSize(20);
      child3Disabled.setTreeSize(30);
      child4Disabled.setTreeSize(40);
      expect(stateTreeDisabled.verifyProofHash()).to.equal(false);

      // update without updatedChildLabel
      stateTreeDisabled.updateStateInfo();
      const proofHash = stateTreeDisabled.getProofHash();
      expect(proofHash).to.equal(stateTreeDisabled._buildProofHash());
      expect(stateTreeDisabled.verifyProofHash()).to.equal(true);
      const treeInfo = stateTreeDisabled._buildTreeInfo();
      expect(stateTreeDisabled.getTreeHeight()).to.equal(treeInfo.treeHeight);
      expect(stateTreeDisabled.getTreeSize()).to.equal(treeInfo.treeSize);
      expect(stateTreeDisabled.getTreeBytes()).to.equal(treeInfo.treeBytes);

      // set another proof hash value for a child
      child2Disabled.setProofHash('another PH');

      // update with updatedChildLabel
      stateTreeDisabled.updateStateInfo(label2);
      const newProofHash = stateTreeDisabled.getProofHash();
      expect(newProofHash).not.equal(proofHash);  // Updated
      expect(newProofHash).to.equal(stateTreeDisabled._buildProofHash());
      expect(stateTreeDisabled.verifyProofHash()).to.equal(true);
    });

    it("verifyProofHash with updatedChildLabel when radixTreeEnabled = true", () => {
      child1Enabled.setProofHash('proofHash1');
      child2Enabled.setProofHash('proofHash2');
      child3Enabled.setProofHash('proofHash3');
      child4Enabled.setProofHash('proofHash4');
      expect(stateTreeEnabled.verifyProofHash(label2)).to.equal(false);

      // update with updatedChildLabel
      stateTreeEnabled.updateStateInfo(label2);
      // verify with updatedChildLabel
      expect(stateTreeEnabled.verifyProofHash(label2)).to.equal(true);
      // verify without updatedChildLabel
      expect(stateTreeEnabled.verifyProofHash()).to.equal(false);
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

    it("internal node when radixTreeEnabled = true", () => {
      child1Enabled.setProofHash('proofHash1');
      child2Enabled.setProofHash('proofHash2');
      child3Enabled.setProofHash('proofHash3');
      child4Enabled.setProofHash('proofHash4');
      stateTreeEnabled.setProofHash('proofHash');

      stateTreeEnabled.updateStateInfo();
      assert.deepEqual(stateTreeEnabled.radixTree.toJsObject(true), {
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

      assert.deepEqual(stateTreeEnabled.getProofOfState(label2, 'childProof2'), {
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

    it("internal node when radixTreeEnabled = false", () => {
      child1Disabled.setProofHash('proofHash1');
      child2Disabled.setProofHash('proofHash2');
      child3Disabled.setProofHash('proofHash3');
      child4Disabled.setProofHash('proofHash4');
      stateTreeDisabled.setProofHash('proofHash');

      stateTreeDisabled.updateStateInfo();

      assert.deepEqual(stateTreeDisabled.getProofOfState(label2, 'childProof2'), {
        ".proof_hash": "0x18108eb737682f4c8d38a10d707501e0ee3b831f3371ff79bfd4c543e5d2b1fe",
        "0x00aaaa": {
          ".proof_hash": "proofHash1"
        },
        "0x11bb00": {
          ".proof_hash": "proofHash3"
        },
        "0x11bb11": {
          ".proof_hash": "proofHash4"
        },
        "0x11bbbb": "childProof2"
      });
    });
  });

  describe("deleteRadixTree", () => {
    it("delete with deleteParent = true when radixTreeEnabled = true", () => {
      child1Enabled.setProofHash('proofHash1');
      child2Enabled.setProofHash('proofHash2');
      child3Enabled.setProofHash('proofHash3');
      child4Enabled.setProofHash('proofHash4');

      // delete with deleteParent = true
      expect(stateTreeEnabled.deleteRadixTree()).to.equal(6);
      // Check parents of state nodes
      assert.deepEqual(child1Enabled.getParentNodes(), []);
      assert.deepEqual(child1Enabled.getParentNodes(), []);
      assert.deepEqual(child1Enabled.getParentNodes(), []);
      assert.deepEqual(child1Enabled.getParentNodes(), []);
    });

    it("delete with deleteParent = false when radixTreeEnabled = true", () => {
      child1Enabled.setProofHash('proofHash1');
      child2Enabled.setProofHash('proofHash2');
      child3Enabled.setProofHash('proofHash3');
      child4Enabled.setProofHash('proofHash4');

      // delete with deleteParent = false
      expect(stateTreeEnabled.deleteRadixTree(false)).to.equal(6);
      // Check parents of state nodes
      assert.deepEqual(child1Enabled.getParentNodes(), [stateTreeEnabled]);
      assert.deepEqual(child1Enabled.getParentNodes(), [stateTreeEnabled]);
      assert.deepEqual(child1Enabled.getParentNodes(), [stateTreeEnabled]);
      assert.deepEqual(child1Enabled.getParentNodes(), [stateTreeEnabled]);
    });
  });

  describe("enableRadixTree / disableRadixTree", () => {
    it("enable", () => {
      child1Disabled.setProofHash('proofHash1');
      child2Disabled.setProofHash('proofHash2');
      child3Disabled.setProofHash('proofHash3');
      child4Disabled.setProofHash('proofHash4');

      const childLabelsBefore = stateTreeDisabled.getChildLabels();
      const childNodesBefore = stateTreeDisabled.getChildNodes();

      // enable
      stateTreeDisabled.enableRadixTree();
      assert.deepEqual(stateTreeDisabled.getChildLabels(), childLabelsBefore);
      assert.deepEqual(stateTreeDisabled.getChildNodes(), childNodesBefore);
      expect(stateTreeDisabled.radixTree.size()).to.equal(4);
      expect(stateTreeDisabled.childMap.size).to.equal(0);
      expect(stateTreeDisabled.getRadixTreeEnabled()).to.equal(true);
      // Check parents of state nodes
      assert.deepEqual(child1Disabled.getParentNodes(), [stateTreeDisabled]);
      assert.deepEqual(child1Disabled.getParentNodes(), [stateTreeDisabled]);
      assert.deepEqual(child1Disabled.getParentNodes(), [stateTreeDisabled]);
      assert.deepEqual(child1Disabled.getParentNodes(), [stateTreeDisabled]);
    });

    it("disable", () => {
      child1Enabled.setProofHash('proofHash1');
      child2Enabled.setProofHash('proofHash2');
      child3Enabled.setProofHash('proofHash3');
      child4Enabled.setProofHash('proofHash4');

      const childLabelsBefore = stateTreeEnabled.getChildLabels();
      const childNodesBefore = stateTreeEnabled.getChildNodes();

      // disable
      stateTreeEnabled.disableRadixTree();
      assert.deepEqual(stateTreeEnabled.getChildLabels(), childLabelsBefore);
      assert.deepEqual(stateTreeEnabled.getChildNodes(), childNodesBefore);
      expect(stateTreeEnabled.radixTree.size()).to.equal(0);
      expect(stateTreeEnabled.childMap.size).to.equal(4);
      expect(stateTreeEnabled.getRadixTreeEnabled()).to.equal(false);
      // Check parents of state nodes
      assert.deepEqual(child1Enabled.getParentNodes(), [stateTreeEnabled]);
      assert.deepEqual(child1Enabled.getParentNodes(), [stateTreeEnabled]);
      assert.deepEqual(child1Enabled.getParentNodes(), [stateTreeEnabled]);
      assert.deepEqual(child1Enabled.getParentNodes(), [stateTreeEnabled]);
    });
  });
});
