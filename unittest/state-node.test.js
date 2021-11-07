const StateNode = require('../db/state-node');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

const CommonUtil = require('../common/common-util');
const RadixNode = require('../db/radix-node');
const RadixTree = require('../db/radix-tree');
const { GET_OPTIONS_INCLUDE_ALL } = require('./test-util');
const {
  updateStateInfoForStateTree,
  verifyStateInfoForStateTree,
} = require('../db/state-util');

describe("state-node", () => {
  let node;

  const label1 = '0x00aaaa';
  const label2 = '0x11bbbb';
  const label3 = '0x11bb00';
  const label4 = '0x11bb11';

  let stateTree;
  let child1;
  let child2;
  let child3;
  let child4;

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

  describe("initialization / reset", () => {
    it("constructor", () => {
      expect(node.version).to.equal(null);
      expect(node.label).to.equal(null);
      expect(node.isLeaf).to.equal(true);
      expect(node.value).to.equal(null);
      expect(node.parentSet.size).to.equal(0);
      expect(node.radixTree.getNumChildStateNodes()).to.equal(0);
      expect(node.radixTree.getVersion()).to.equal(null);
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
      node.setLabel(label);
      node.setValue(value);
      node.addParent(parentNode);
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
      expect(node.radixTree.getNumChildStateNodes()).to.equal(0);
      expect(node.radixTree.getVersion()).to.equal(null);
      expect(node.proofHash).to.equal(null);
      expect(node.treeHeight).to.equal(0);
      expect(node.treeSize).to.equal(0);
      expect(node.treeBytes).to.equal(0);
    });
  });

  describe("initialization with version", () => {
    it("constructor", () => {
      const node2 = new StateNode('version1');
      expect(node2.version).to.equal('version1');
      expect(node2.label).to.equal(null);
      expect(node2.isLeaf).to.equal(true);
      expect(node2.value).to.equal(null);
      expect(node2.parentSet.size).to.equal(0);
      expect(node2.radixTree.getNumChildStateNodes()).to.equal(0);
      expect(node2.radixTree.getVersion()).to.equal('version1');
      expect(node2.proofHash).to.equal(null);
      expect(node2.treeHeight).to.equal(0);
      expect(node2.treeSize).to.equal(0);
      expect(node2.treeBytes).to.equal(0);
    });
  });

  describe("clone", () => {
    it("leaf node", () => {
      node.setLabel('label');
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
    });

    it("internal node", () => {
      stateTree.setLabel('label_root');
      stateTree.setVersion('version1');
      assert.deepEqual(stateTree.getParentNodes(), []);
      assert.deepEqual(child1.getParentNodes(), [stateTree]);
      assert.deepEqual(child2.getParentNodes(), [stateTree]);
      assert.deepEqual(child3.getParentNodes(), [stateTree]);
      assert.deepEqual(child4.getParentNodes(), [stateTree]);
      expect(verifyStateInfoForStateTree(stateTree)).to.equal(false);
      updateStateInfoForStateTree(stateTree);
      expect(verifyStateInfoForStateTree(stateTree)).to.equal(true);

      const clone = stateTree.clone();
      expect(clone.getVersion()).to.equal(stateTree.getVersion());
      expect(clone.radixTree.root.getVersion()).to.equal(null);
      expect(clone.getIsLeaf()).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(child2.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(child3.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(child4.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(clone.getParentNodes(), []);
      assert.deepEqual(clone.getChildLabels(), stateTree.getChildLabels());
      assert.deepEqual(clone.getChildNodes(), stateTree.getChildNodes());
      assert.deepEqual(clone.numChildren(), stateTree.numChildren());
      // State info is verified without updateStateInfoForStateTree() call!
      expect(verifyStateInfoForStateTree(clone)).to.equal(true);
      expect(clone.getLabel()).to.equal('label_root');
      expect(clone.getValue()).to.equal(null);
      expect(clone.getTreeHeight()).to.equal(stateTree.getTreeHeight());
      expect(clone.getTreeSize()).to.equal(stateTree.getTreeSize());
      expect(clone.getTreeBytes()).to.equal(stateTree.getTreeBytes());
      assert.deepEqual(clone.toJsObject(GET_OPTIONS_INCLUDE_ALL), stateTree.toJsObject(GET_OPTIONS_INCLUDE_ALL));
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
      assert.deepEqual(child4.getParentNodes(), [stateTree]);

      const clone = stateTree.clone('version2');
      expect(clone.getVersion()).to.equal('version2');
      expect(clone.radixTree.root.getVersion()).to.equal('version2');
      expect(clone.getIsLeaf()).to.equal(false);
      assert.deepEqual(child1.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(child2.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(child3.getParentNodes(), [stateTree, clone]);
      assert.deepEqual(child4.getParentNodes(), [stateTree, clone]);
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

  describe("fromRadixSnapshot / toRadixSnapshot", () => {
    it("leaf node", () => {
      const ver1 = 'ver1';

      const snapshot1 = StateNode.fromJsObject('str', ver1).toRadixSnapshot();
      expect(snapshot1).to.equal('str');
      expect(StateNode.fromRadixSnapshot(snapshot1).toRadixSnapshot()).to.equal('str');

      const snapshot2 = StateNode.fromJsObject(100, ver1).toRadixSnapshot();
      expect(snapshot2).to.equal(100);
      expect(StateNode.fromRadixSnapshot(snapshot2).toRadixSnapshot()).to.equal(100);
    })

    it("internal node", () => {
      const version = 'ver';
      const stateObj = {
        a: 'str_a',
        b: 200,
        c: {
          ca: 'str_ca',
          cb: 1200,
        },
        d: {
          da: 'str_da',
          db: 2200,
        }
      };
      const stateTree = StateNode.fromJsObject(stateObj, version);
      // set versions of state nodes and radix nodes
      stateTree.setVersion('ver_root');
      stateTree.getChild('a').setVersion('ver_a');
      stateTree.getChild('a').getParentRadixNodes()[0].setVersion('ver_a_radix_p');
      stateTree.getChild('b').setVersion('ver_b');
      stateTree.getChild('b').getParentRadixNodes()[0].setVersion('ver_b_radix_p');
      stateTree.getChild('c').setVersion('ver_c');
      stateTree.getChild('c').getParentRadixNodes()[0].setVersion('ver_c_radix_p');
      stateTree.getChild('c').getChild('ca').setVersion('ver_ca');
      stateTree.getChild('c').getChild('ca').getParentRadixNodes()[0].setVersion('ver_ca_radix_p');
      stateTree.getChild('c').getChild('cb').setVersion('ver_cb');
      stateTree.getChild('c').getChild('cb').getParentRadixNodes()[0].setVersion('ver_cb_radix_p');
      stateTree.getChild('d').setVersion('ver_d');
      stateTree.getChild('d').getParentRadixNodes()[0].setVersion('ver_d_radix_p');
      stateTree.getChild('d').getChild('da').setVersion('ver_da');
      stateTree.getChild('d').getChild('da').getParentRadixNodes()[0].setVersion('ver_da_radix_p');
      stateTree.getChild('d').getChild('db').setVersion('ver_db');
      stateTree.getChild('d').getChild('db').getParentRadixNodes()[0].setVersion('ver_db_radix_p');
      updateStateInfoForStateTree(stateTree);

      // toRadixSnapshot()
      const snapshot = stateTree.toRadixSnapshot();
      assert.deepEqual(snapshot, {
        "#next_serial": 10,
        "#radix:6": {
          "#radix:1": {
            "#serial": 2,
            "#state:a": "str_a",
            "#version": "ver_a_radix_p",
            "#version:a": "ver_a",
          },
          "#radix:2": {
            "#serial": 5,
            "#state:b": 200,
            "#version": "ver_b_radix_p",
            "#version:b": "ver_b",
          },
          "#radix:3": {
            "#serial": 7,
            "#state:c": {
              "#next_serial": 6,
              "#radix:636": {
                "#radix:1": {
                  "#serial": 2,
                  "#state:ca": "str_ca",
                  "#version": "ver_ca_radix_p",
                  "#version:ca": "ver_ca",
                },
                "#radix:2": {
                  "#serial": 5,
                  "#state:cb": 1200,
                  "#version": "ver_cb_radix_p",
                  "#version:cb": "ver_cb",
                },
                "#serial": 3,
                "#version": "ver",
              },
              "#serial": 0,
              "#version": "ver_c",
            },
            "#version": "ver_c_radix_p",
          },
          "#radix:4": {
            "#serial": 9,
            "#state:d": {
              "#next_serial": 6,
              "#radix:646": {
                "#radix:1": {
                  "#serial": 2,
                  "#state:da": "str_da",
                  "#version": "ver_da_radix_p",
                  "#version:da": "ver_da",
                },
                "#radix:2": {
                  "#serial": 5,
                  "#state:db": 2200,
                  "#version": "ver_db_radix_p",
                  "#version:db": "ver_db",
                },
                "#serial": 3,
                "#version": "ver",
              },
              "#serial": 0,
              "#version": "ver_d",
            },
            "#version": "ver_d_radix_p",
          },
          "#serial": 3,
          "#version": "ver",
        },
        "#serial": 0,
        "#version": "ver_root",
      });

      // fromRadixSnapshot()
      const stateTreeRebuilt = StateNode.fromRadixSnapshot(snapshot);
      assert.deepEqual(stateTreeRebuilt.toRadixSnapshot(), {
        "#next_serial": 10,
        "#radix:6": {
          "#radix:1": {
            "#serial": 2,
            "#state:a": "str_a",
            "#version": "ver_a_radix_p",
            "#version:a": "ver_a",
          },
          "#radix:2": {
            "#serial": 5,
            "#state:b": 200,
            "#version": "ver_b_radix_p",
            "#version:b": "ver_b",
          },
          "#radix:3": {
            "#serial": 7,
            "#state:c": {
              "#next_serial": 6,
              "#radix:636": {
                "#radix:1": {
                  "#serial": 2,
                  "#state:ca": "str_ca",
                  "#version": "ver_ca_radix_p",
                  "#version:ca": "ver_ca",
                },
                "#radix:2": {
                  "#serial": 5,
                  "#state:cb": 1200,
                  "#version": "ver_cb_radix_p",
                  "#version:cb": "ver_cb",
                },
                "#serial": 3,
                "#version": "ver",
              },
              "#serial": 0,
              "#version": "ver_c",
            },
            "#version": "ver_c_radix_p",
          },
          "#radix:4": {
            "#serial": 9,
            "#state:d": {
              "#next_serial": 6,
              "#radix:646": {
                "#radix:1": {
                  "#serial": 2,
                  "#state:da": "str_da",
                  "#version": "ver_da_radix_p",
                  "#version:da": "ver_da",
                },
                "#radix:2": {
                  "#serial": 5,
                  "#state:db": 2200,
                  "#version": "ver_db_radix_p",
                  "#version:db": "ver_db",
                },
                "#serial": 3,
                "#version": "ver",
              },
              "#serial": 0,
              "#version": "ver_d",
            },
            "#version": "ver_d_radix_p",
          },
          "#serial": 3,
          "#version": "ver",
        },
        "#serial": 0,
        "#version": "ver_root",
      });
      assert.deepEqual(stateTreeRebuilt.toRadixSnapshot(), snapshot);
      assert.deepEqual(stateTreeRebuilt.getChildLabels(), [
        "a",
        "b",
        "c",
        "d",
      ]);
      expect(stateTreeRebuilt.numChildren()).to.equal(4);
      assert.deepEqual(stateTreeRebuilt.radixTree.toJsObject(true, true, false, false, true, true), {
        "6": {
          "1": {
            "#has_parent_state_node": false,
            "#num_parents": 1,
            "#serial": 2,
            "#state:a": {
              "#version": "ver_a",
            },
            "#version": "ver_a_radix_p",
          },
          "2": {
            "#has_parent_state_node": false,
            "#num_parents": 1,
            "#serial": 5,
            "#state:b": {
              "#version": "ver_b",
            },
            "#version": "ver_b_radix_p",
          },
          "3": {
            "#has_parent_state_node": false,
            "#num_parents": 1,
            "#serial": 7,
            "#state:c": {
              "#version": "ver_c",
            },
            "#version": "ver_c_radix_p",
          },
          "4": {
            "#has_parent_state_node": false,
            "#num_parents": 1,
            "#serial": 9,
            "#state:d": {
              "#version": "ver_d",
            },
            "#version": "ver_d_radix_p",
          },
          "#has_parent_state_node": false,
          "#num_parents": 1,
          "#serial": 3,
          "#version": "ver",
        },
        "#has_parent_state_node": true,
        "#num_parents": 0,
        "#serial": 0,
        "#version": "ver_root",
      });
    })
  })

  describe("toJsObject", () => {
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

  describe("toJsObject with includeVersion / includeTreeInfo / includeProof", () => {
    it("leaf node", () => {
      const ver1 = 'ver1';

      expect(StateNode.fromJsObject('str', ver1).toJsObject(GET_OPTIONS_INCLUDE_ALL)).to.equal('str');
      expect(StateNode.fromJsObject(100, ver1).toJsObject(GET_OPTIONS_INCLUDE_ALL)).to.equal(100);
    })

    it("internal node", () => {
      const ver1 = 'ver1';
      const stateObj = {
        a: 'str_a',
        b: 200,
        c: {
          ca: 'str_ca',
          cb: 1200,
        },
        d: {
          da: 'str_da',
          db: 2200,
        }
      };
      const stateTree = StateNode.fromJsObject(stateObj, ver1);
      updateStateInfoForStateTree(stateTree);

      // includeVersion = true
      assert.deepEqual(stateTree.toJsObject({ includeVersion: true }), {
        "#version": "ver1",
        "#version:a": "ver1",
        "#version:b": "ver1",
        "a": "str_a",
        "b": 200,
        "c": {
          "#version": "ver1",
          "#version:ca": "ver1",
          "#version:cb": "ver1",
          "ca": "str_ca",
          "cb": 1200,
        },
        "d": {
          "#version": "ver1",
          "#version:da": "ver1",
          "#version:db": "ver1",
          "da": "str_da",
          "db": 2200,
        }
      });

      // includeTreeInfo = true
      assert.deepEqual(stateTree.toJsObject({ includeTreeInfo: true }), {
        "#num_parents": 0,
        "#num_parents:a": 1,
        "#num_parents:b": 1,
        "#tree_bytes": 1522,
        "#tree_bytes:a": 170,
        "#tree_bytes:b": 168,
        "#tree_height": 2,
        "#tree_height:a": 0,
        "#tree_height:b": 0,
        "#tree_size": 9,
        "#tree_size:a": 1,
        "#tree_size:b": 1,
        "a": "str_a",
        "b": 200,
        "c": {
          "#num_parents": 1,
          "#num_parents:ca": 1,
          "#num_parents:cb": 1,
          "#tree_bytes": 508,
          "#tree_bytes:ca": 172,
          "#tree_bytes:cb": 168,
          "#tree_height": 1,
          "#tree_height:ca": 0,
          "#tree_height:cb": 0,
          "#tree_size": 3,
          "#tree_size:ca": 1,
          "#tree_size:cb": 1,
          "ca": "str_ca",
          "cb": 1200,
        },
        "d": {
          "#num_parents": 1,
          "#num_parents:da": 1,
          "#num_parents:db": 1,
          "#tree_bytes": 508,
          "#tree_bytes:da": 172,
          "#tree_bytes:db": 168,
          "#tree_height": 1,
          "#tree_height:da": 0,
          "#tree_height:db": 0,
          "#tree_size": 3,
          "#tree_size:da": 1,
          "#tree_size:db": 1,
          "da": "str_da",
          "db": 2200,
        }
      });

      // includeProof = true
      assert.deepEqual(stateTree.toJsObject({ includeProof: true }), {
        "#state_ph": "0xfe4f999d2f9f44b2453ea833fe85ce2129da0417f57451f74e7649a4c32536e3",
        "#state_ph:a": "0xc9040497a73c7fa9cbe01a045e446f5a47dec8e09f46fefd983bd591f637c296",
        "#state_ph:b": "0xd18f7d1798901b66c318da94cc5eb8d954f7b53d7206fe54469b46e88505b524",
        "a": "str_a",
        "b": 200,
        "c": {
          "#state_ph": "0xacc963071682d6b4115f0051c8f6b97682e3a69e7a999a2506c780f3c3745799",
          "#state_ph:ca": "0x1803ea1322e9d14397425d8ed561b57413674e61f24ea1bc6ff9999bf35c8ce0",
          "#state_ph:cb": "0xa9fce7f26e612d7075711f56536bebf1367eab988f73ec32961c24117b7c4c6d",
          "ca": "str_ca",
          "cb": 1200,
        },
        "d": {
          "#state_ph": "0xa24b96cf34fb0720b5c677c75a233d67e67d1d1e8ebbf9789406c9ba422ddfba",
          "#state_ph:da": "0xc3326d413c73a0c17d13dea87e8d0cd2d5c3e9561a269c6699e9c85ba349913f",
          "#state_ph:db": "0x9ec9f212475947ed2c2398cb947da5be9a9c58887bdb8a0ccc856cb7b5ad53cf",
          "da": "str_da",
          "db": 2200,
        }
      });
    })
  })

  describe("toJsObject with isShallow", () => {
    it("leaf node", () => {
      expect(StateNode.fromJsObject('str').toJsObject({ isShallow: true })).to.equal('str');
      expect(StateNode.fromJsObject(100).toJsObject({ isShallow: true })).to.equal(100);
    })

    it("internal node", () => {
      assert.deepEqual(StateNode.fromJsObject({ a: 1, b: 2, c: 3 }).toJsObject({ isShallow: true }), {
        a: 1,
        b: 2,
        c: 3,
      });
      assert.deepEqual(StateNode.fromJsObject({ a: { aa: 11 }, b: 2 }).toJsObject({ isShallow: true }), {
        a: {
          "#state_ph": null
        },
        b: 2,
      });
    })
  })

  describe("fromJsObject", () => {
    const ver1 = 'ver1';
    const stateObj = {
      a: 'str_a',
      b: 200,
      c: {
        ca: 'str_ca',
        cb: 1200,
      },
      d: {
        da: 'str_da',
        db: 2200,
      }
    };
    const stateTree = StateNode.fromJsObject(stateObj, ver1);
    updateStateInfoForStateTree(stateTree);

    it("without options", () => {
      const stateObjWithoutOptions = stateTree.toJsObject();
      const stateTreeParsed = StateNode.fromJsObject(stateObjWithoutOptions);

      // child order
      assert.deepEqual(stateTreeParsed.getChildLabels(), [
        "a",
        "b",
        "c",
        "d",
      ]);
      // compare the objects
      assert.deepEqual(stateTreeParsed.toJsObject(), stateObj);
    })

    it("with options", () => {
      const stateObjWithOptions = stateTree.toJsObject(GET_OPTIONS_INCLUDE_ALL);
      const stateTreeParsed = StateNode.fromJsObject(stateObjWithOptions);

      // child order
      assert.deepEqual(stateTreeParsed.getChildLabels(), [
        "a",
        "b",
        "c",
        "d",
      ]);
      // compare the objects
      assert.deepEqual(stateTreeParsed.toJsObject(), stateObj);
    })
  })

  describe("label", () => {
    it("get / has / set / reset", () => {
      expect(node.hasLabel()).to.equal(false);
      node.setLabel('label');
      expect(node.hasLabel()).to.equal(true);
      expect(node.getLabel()).to.equal('label');
      node.resetLabel();
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

  describe("parentRadixNode", () => {
    it("add / has / delete / getParentRadixNodes / numParentRadixNodes with single node", () => {
      const node = new StateNode();
      node.setValue('value1');
      const parentRadixNode1 = new RadixNode();
      const parentRadixNode2 = new RadixNode();
      expect(node.hasParentRadixNode(parentRadixNode1)).to.equal(false);
      expect(node.hasParentRadixNode(parentRadixNode2)).to.equal(false);
      assert.deepEqual(node.getParentRadixNodes(), []);
      expect(node.numParentRadixNodes()).to.equal(0);

      node.addParentRadixNode(parentRadixNode1);
      expect(node.hasParentRadixNode(parentRadixNode1)).to.equal(true);
      expect(node.hasParentRadixNode(parentRadixNode2)).to.equal(false);
      assert.deepEqual(node.getParentRadixNodes(), [parentRadixNode1]);
      expect(node.numParentRadixNodes()).to.equal(1);

      node.addParentRadixNode(parentRadixNode2);
      expect(node.hasParentRadixNode(parentRadixNode1)).to.equal(true);
      expect(node.hasParentRadixNode(parentRadixNode2)).to.equal(true);
      assert.deepEqual(node.getParentRadixNodes(), [parentRadixNode1, parentRadixNode2]);
      expect(node.numParentRadixNodes()).to.equal(2);

      node.deleteParentRadixNode(parentRadixNode1);
      expect(node.hasParentRadixNode(parentRadixNode1)).to.equal(false);
      expect(node.hasParentRadixNode(parentRadixNode2)).to.equal(true);
      assert.deepEqual(node.getParentRadixNodes(), [parentRadixNode2]);
      expect(node.numParentRadixNodes()).to.equal(1);

      node.deleteParentRadixNode(parentRadixNode2);
      expect(node.hasParentRadixNode(parentRadixNode1)).to.equal(false);
      expect(node.hasParentRadixNode(parentRadixNode2)).to.equal(false);
      assert.deepEqual(node.getParentRadixNodes(), []);
      expect(node.numParentRadixNodes()).to.equal(0);
    });

    it("add / has / delete / getParentRadixNodes / numParentRadixNodes with multiple nodes", () => {
      const node1 = new StateNode();
      const node2 = new StateNode();
      node1.setValue('value1');
      node2.setValue('value2');
      const parentRadixNode1 = new RadixNode();
      const parentRadixNode2 = new RadixNode();
      expect(node1.hasParentRadixNode(parentRadixNode1)).to.equal(false);
      expect(node1.hasParentRadixNode(parentRadixNode2)).to.equal(false);
      expect(node2.hasParentRadixNode(parentRadixNode1)).to.equal(false);
      expect(node2.hasParentRadixNode(parentRadixNode2)).to.equal(false);
      assert.deepEqual(node1.getParentRadixNodes(), []);
      assert.deepEqual(node2.getParentRadixNodes(), []);
      expect(node1.numParentRadixNodes()).to.equal(0);
      expect(node2.numParentRadixNodes()).to.equal(0);

      node1.addParentRadixNode(parentRadixNode1);
      node2.addParentRadixNode(parentRadixNode2);
      expect(node1.hasParentRadixNode(parentRadixNode1)).to.equal(true);
      expect(node1.hasParentRadixNode(parentRadixNode2)).to.equal(false);
      expect(node2.hasParentRadixNode(parentRadixNode1)).to.equal(false);
      expect(node2.hasParentRadixNode(parentRadixNode2)).to.equal(true);
      assert.deepEqual(node1.getParentRadixNodes(), [parentRadixNode1]);
      assert.deepEqual(node2.getParentRadixNodes(), [parentRadixNode2]);
      expect(node1.numParentRadixNodes()).to.equal(1);
      expect(node2.numParentRadixNodes()).to.equal(1);

      node1.addParentRadixNode(parentRadixNode2);
      node2.addParentRadixNode(parentRadixNode1);
      expect(node1.hasParentRadixNode(parentRadixNode1)).to.equal(true);
      expect(node1.hasParentRadixNode(parentRadixNode2)).to.equal(true);
      expect(node2.hasParentRadixNode(parentRadixNode1)).to.equal(true);
      expect(node2.hasParentRadixNode(parentRadixNode2)).to.equal(true);
      assert.deepEqual(node1.getParentRadixNodes(), [parentRadixNode1, parentRadixNode2]);
      assert.deepEqual(node2.getParentRadixNodes(), [parentRadixNode2, parentRadixNode1]);
      expect(node1.numParentRadixNodes()).to.equal(2);
      expect(node2.numParentRadixNodes()).to.equal(2);

      node1.deleteParentRadixNode(parentRadixNode1);
      node2.deleteParentRadixNode(parentRadixNode2);
      expect(node1.hasParentRadixNode(parentRadixNode1)).to.equal(false);
      expect(node1.hasParentRadixNode(parentRadixNode2)).to.equal(true);
      expect(node2.hasParentRadixNode(parentRadixNode1)).to.equal(true);
      expect(node2.hasParentRadixNode(parentRadixNode2)).to.equal(false);
      assert.deepEqual(node1.getParentRadixNodes(), [parentRadixNode2]);
      assert.deepEqual(node2.getParentRadixNodes(), [parentRadixNode1]);
      expect(node1.numParentRadixNodes()).to.equal(1);
      expect(node2.numParentRadixNodes()).to.equal(1);

      node1.deleteParentRadixNode(parentRadixNode2);
      node2.deleteParentRadixNode(parentRadixNode1);
      expect(node1.hasParentRadixNode(parentRadixNode1)).to.equal(false);
      expect(node1.hasParentRadixNode(parentRadixNode2)).to.equal(false);
      expect(node2.hasParentRadixNode(parentRadixNode1)).to.equal(false);
      expect(node2.hasParentRadixNode(parentRadixNode2)).to.equal(false);
      assert.deepEqual(node1.getParentRadixNodes(), []);
      assert.deepEqual(node2.getParentRadixNodes(), []);
      expect(node1.numParentRadixNodes()).to.equal(0);
      expect(node2.numParentRadixNodes()).to.equal(0);
    });

    it("add existing parentRadixNode", () => {
      const node = new StateNode();
      node.setValue('value1');
      const parentRadixNode = new RadixNode();
      expect(node.hasParentRadixNode(parentRadixNode)).to.equal(false);
      assert.deepEqual(node.getParentRadixNodes(), []);
      expect(node.numParentRadixNodes()).to.equal(0);

      node.addParentRadixNode(parentRadixNode);
      expect(node.hasParentRadixNode(parentRadixNode)).to.equal(true);
      assert.deepEqual(node.getParentRadixNodes(), [parentRadixNode]);
      expect(node.numParentRadixNodes()).to.equal(1);

      node.addParentRadixNode(parentRadixNode);
      expect(node.hasParentRadixNode(parentRadixNode)).to.equal(true);
      assert.deepEqual(node.getParentRadixNodes(), [parentRadixNode]);
      expect(node.numParentRadixNodes()).to.equal(1);
    });

    it("delete non-existing parentRadixNode", () => {
      const node = new StateNode();
      node.setValue('value1');
      const parentRadixNode1 = new RadixNode();
      const parentRadixNode2 = new RadixNode();
      expect(node.hasParentRadixNode(parentRadixNode1)).to.equal(false);
      expect(node.hasParentRadixNode(parentRadixNode2)).to.equal(false);
      assert.deepEqual(node.getParentRadixNodes(), []);
      expect(node.numParentRadixNodes()).to.equal(0);

      node.addParentRadixNode(parentRadixNode1);
      expect(node.hasParentRadixNode(parentRadixNode1)).to.equal(true);
      expect(node.hasParentRadixNode(parentRadixNode2)).to.equal(false);
      assert.deepEqual(node.getParentRadixNodes(), [parentRadixNode1]);
      expect(node.numParentRadixNodes()).to.equal(1);

      node.deleteParentRadixNode(parentRadixNode2);
      expect(node.hasParentRadixNode(parentRadixNode1)).to.equal(true);
      expect(node.hasParentRadixNode(parentRadixNode2)).to.equal(false);
      assert.deepEqual(node.getParentRadixNodes(), [parentRadixNode1]);
      expect(node.numParentRadixNodes()).to.equal(1);
    });
  });

  describe("getParentNodes / hasAParent / hasMultipleParents / numParents", () => {
    it("with no parent", () => {
      const node = new StateNode();
      assert.deepEqual(node.getParentNodes(), []);
      expect(node.hasAtLeastOneParent()).to.equal(false);
      expect(node.hasMultipleParents()).to.equal(false);
      expect(node.numParents()).to.equal(0);
    });

    it("with one parent", () => {
      const parent = new StateNode();
      const node = new StateNode();
      parent.setChild('label', node);
      assert.deepEqual(node.getParentNodes(), [parent]);
      expect(node.hasAtLeastOneParent()).to.equal(true);
      expect(node.hasMultipleParents()).to.equal(false);
      expect(node.numParents()).to.equal(1);
    });

    it("with two parents", () => {
      const parent1 = new StateNode();
      const parent2 = new StateNode();
      const node = new StateNode();
      parent1.setChild('label', node);
      parent2.setChild('label', node);
      assert.deepEqual(node.getParentNodes(), [parent1, parent2]);
      expect(node.hasAtLeastOneParent()).to.equal(true);
      expect(node.hasMultipleParents()).to.equal(true);
      expect(node.numParents()).to.equal(2);
    });

    it("with three parents", () => {
      const parent1 = new StateNode();
      const parent2 = new StateNode();
      const parent3 = new StateNode();
      const node = new StateNode();
      parent1.setChild('label', node);
      parent2.setChild('label', node);
      parent3.setChild('label', node);
      assert.deepEqual(node.getParentNodes(), [parent1, parent2, parent3]);
      expect(node.hasAtLeastOneParent()).to.equal(true);
      expect(node.hasMultipleParents()).to.equal(true);
      expect(node.numParents()).to.equal(3);
    });
  });

  describe("child", () => {
    const label1 = 'label1';
    const label2 = 'label2';

    let parent1;
    let parent2;
    let child1;
    let child2;

    beforeEach(() => {
      parent1 = new StateNode();
      parent2 = new StateNode();

      child1 = new StateNode();
      child1.setValue('value1');

      child2 = new StateNode();
      child2.setValue('value2');
    });

    it("get / set / has / delete with single parent", () => {
      const parent = new StateNode();
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
      assert.deepEqual(parent1.getChild(label1), null);
      assert.deepEqual(child1.getParentNodes(), []);
      expect(child1.numParents()).to.equal(0);
      assert.deepEqual(parent1.getChild(label1), null);
      expect(parent1.getIsLeaf()).to.equal(true);

      parent1.setChild(label1, child1);
      assert.deepEqual(parent1.getChild(label1), child1);
      assert.deepEqual(child1.getParentNodes(), [parent1]);
      expect(child1.numParents()).to.equal(1);
      assert.deepEqual(parent1.getChild(label1), child1);
      expect(parent1.getIsLeaf()).to.equal(false);

      parent1.setChild(label1, child1);
      assert.deepEqual(parent1.getChild(label1), child1);
      assert.deepEqual(child1.getParentNodes(), [parent1]);
      expect(child1.numParents()).to.equal(1);
      assert.deepEqual(parent1.getChild(label1), child1);
      expect(parent1.getIsLeaf()).to.equal(false);
    });

    it("overwrite existing child", () => {
      assert.deepEqual(parent1.getChild(label1), null);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(0);
      assert.deepEqual(parent1.getChild(label1), null);
      expect(parent1.getIsLeaf()).to.equal(true);

      parent1.setChild(label1, child1);
      assert.deepEqual(parent1.getChild(label1), child1);
      assert.deepEqual(child1.getParentNodes(), [parent1]);
      assert.deepEqual(child2.getParentNodes(), []);
      expect(child1.numParents()).to.equal(1);
      expect(child2.numParents()).to.equal(0);
      assert.deepEqual(parent1.getChild(label1), child1);
      expect(parent1.getIsLeaf()).to.equal(false);

      parent1.setChild(label1, child2);
      assert.deepEqual(parent1.getChild(label1), child2);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child2.getParentNodes(), [parent1]);
      expect(child1.numParents()).to.equal(0);
      expect(child2.numParents()).to.equal(1);
      assert.deepEqual(parent1.getChild(label1), child2);
      expect(parent1.getIsLeaf()).to.equal(false);
    });

    it("delete non-existing child", () => {
      assert.deepEqual(parent1.getChild(label1), null);
      assert.deepEqual(child1.getParentNodes(), []);
      expect(child1.numParents()).to.equal(0);
      assert.deepEqual(parent1.getChild(label1), null);
      expect(parent1.getIsLeaf()).to.equal(true);

      parent1.deleteChild(label1);
      assert.deepEqual(parent1.getChild(label1), null);
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

  describe("radix tree", () => {
    it("setRadixTree", () => {
      const newRadixTree = new RadixTree();
      node.setRadixTree(newRadixTree);
      assert.deepEqual(node.radixTree, newRadixTree);
      assert.deepEqual(newRadixTree.root.getParentStateNode(), node);
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
      const version1 = 'ver1';
      const version2 = 'ver2';
      expect(node.getVersion()).to.equal(null);
      expect(node.radixTree.getVersion()).to.equal(null);
      node.setVersion(version1);
      expect(node.getVersion()).to.equal(version1);
      expect(node.radixTree.getVersion()).to.equal(version1);
      node.setVersion(version2);
      expect(node.getVersion()).to.equal(version2);
      expect(node.radixTree.getVersion()).to.equal(version2);
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

  describe("buildStateInfo", () => {
    describe("proof hash", () => {
      it("leaf node", () => {
        node.setValue(true);
        expect(node.buildStateInfo().proofHash).to.equal(CommonUtil.hashString(CommonUtil.toString(true)));
        node.setValue(10);
        expect(node.buildStateInfo().proofHash).to.equal(CommonUtil.hashString(CommonUtil.toString(10)));
        node.setValue(-200);
        expect(node.buildStateInfo().proofHash).to.equal(CommonUtil.hashString(CommonUtil.toString(-200)));
        node.setValue('');
        expect(node.buildStateInfo().proofHash).to.equal(CommonUtil.hashString(CommonUtil.toString('')));
        node.setValue('unittest');
        expect(node.buildStateInfo().proofHash).to.equal(CommonUtil.hashString(CommonUtil.toString('unittest')));
        node.setValue(null);
        expect(node.buildStateInfo().proofHash).to.equal(CommonUtil.hashString(CommonUtil.toString(null)));
        node.setValue(undefined);
        expect(node.buildStateInfo().proofHash).to.equal(CommonUtil.hashString(CommonUtil.toString(undefined)));
      });

      it("internal node", () => {
        child1.setProofHash('proofHash1');
        child2.setProofHash('proofHash2');
        child3.setProofHash('proofHash3');
        child4.setProofHash('proofHash4');
        expect(stateTree.radixTree.verifyRadixInfoForRadixTree()).to.equal(false);

        // build state info without updatedChildLabel
        const proofHashBefore = stateTree.buildStateInfo().proofHash;
        expect(proofHashBefore).to.equal(stateTree.radixTree.getRootProofHash());
        expect(stateTree.radixTree.verifyRadixInfoForRadixTree()).to.equal(true);

        // set another proof hash value for a child
        child2.setProofHash('another PH');

        // build state info with updatedChildLabel
        const proofHashAfter = stateTree.buildStateInfo(label2).proofHash;
        expect(proofHashAfter).not.equal(proofHashBefore);  // Updated!!
        expect(proofHashAfter).to.equal(stateTree.radixTree.getRootProofHash());
        expect(stateTree.radixTree.verifyRadixInfoForRadixTree()).to.equal(true);

        // set another proof hash value for a child again
        child2.setProofHash('yet another PH');
        expect(stateTree.radixTree.verifyRadixInfoForRadixTree()).to.equal(false);

        // build state info with updatedChildLabel and shouldRebuildRadixInfo = false
        const radixTreeProofHashBefore = stateTree.radixTree.getRootProofHash();
        const proofHashAfter2 = stateTree.buildStateInfo(label2, false).proofHash;
        expect(proofHashAfter2).equal(radixTreeProofHashBefore);  // Unchanged!!
        expect(proofHashAfter2).to.equal(stateTree.radixTree.getRootProofHash());
        expect(stateTree.radixTree.verifyRadixInfoForRadixTree()).to.equal(false);
      });
    });

    describe("tree height", () => {
      it("leaf node", () => {
        node.setValue(true);
        expect(node.buildStateInfo().treeHeight).to.equal(0);
        node.setValue(10);
        expect(node.buildStateInfo().treeHeight).to.equal(0);
        node.setValue(-200);
        expect(node.buildStateInfo().treeHeight).to.equal(0);
        node.setValue('');
        expect(node.buildStateInfo().treeHeight).to.equal(0);
        node.setValue('unittest');
        expect(node.buildStateInfo().treeHeight).to.equal(0);
        node.setValue(null);
        expect(node.buildStateInfo().treeHeight).to.equal(0);
        node.setValue(undefined);
        expect(node.buildStateInfo().treeHeight).to.equal(0);
      });

      // here
      it("internal node", () => {
        child1.setTreeHeight(0);
        child2.setTreeHeight(1);
        child3.setTreeHeight(2);
        child4.setTreeHeight(3);
        stateTree.radixTree.root.setTreeHeight(100);

        // With updatedChildLabel = null, shouldRebuildRadixInfo = false
        expect(stateTree.buildStateInfo(null, false).treeHeight).to.equal(101);
        // With updatedChildLabel = label1, shouldRebuildRadixInfo = true
        expect(stateTree.buildStateInfo(label1).treeHeight).to.equal(1);
        // With updatedChildLabel = null, shouldRebuildRadixInfo = true
        expect(stateTree.buildStateInfo().treeHeight).to.equal(4);
      });
    });

    describe("tree size", () => {
      it("leaf node", () => {
        node.setValue(true);
        expect(node.buildStateInfo().treeSize).to.equal(1);
        node.setValue(10);
        expect(node.buildStateInfo().treeSize).to.equal(1);
        node.setValue(-200);
        expect(node.buildStateInfo().treeSize).to.equal(1);
        node.setValue('');
        expect(node.buildStateInfo().treeSize).to.equal(1);
        node.setValue('unittest');
        expect(node.buildStateInfo().treeSize).to.equal(1);
        node.setValue(null);
        expect(node.buildStateInfo().treeSize).to.equal(1);
        node.setValue(undefined);
        expect(node.buildStateInfo().treeSize).to.equal(1);
      });

      it("internal node", () => {
        child1.setTreeSize(10);
        child2.setTreeSize(20);
        child3.setTreeSize(30);
        child4.setTreeSize(40);
        stateTree.radixTree.root.setTreeSize(1000);

        // With updatedChildLabel = null, shouldRebuildRadixInfo = false
        expect(stateTree.buildStateInfo(null, false).treeSize).to.equal(1001);
        // With updatedChildLabel = label1, shouldRebuildRadixInfo = true
        expect(stateTree.buildStateInfo(label1).treeSize).to.equal(11);
        // With updatedChildLabel = null, shouldRebuildRadixInfo = true
        expect(stateTree.buildStateInfo().treeSize).to.equal(101);
      });
    });

    describe("tree bytes", () => {
      it("leaf node", () => {
        const parent = new StateNode();
        const label = 'label';
        parent.setChild(label, node);
        expect(node.buildStateInfo().treeBytes).to.equal(160);
        node.setValue(true);  // boolean (4 bytes)
        expect(node.buildStateInfo().treeBytes).to.equal(164);
        node.setValue(10);  // number (8 bytes)
        expect(node.buildStateInfo().treeBytes).to.equal(168);
        node.setValue(-200);  // number (8 bytes)
        expect(node.buildStateInfo().treeBytes).to.equal(168);
        node.setValue('');  // string (0 * 2 = 0 bytes)
        expect(node.buildStateInfo().treeBytes).to.equal(160);
        node.setValue('str');  // string (3 * 2 = 6 bytes)
        expect(node.buildStateInfo().treeBytes).to.equal(166);
        node.setValue(null);  // null (0 bytes)
        expect(node.buildStateInfo().treeBytes).to.equal(160);
        node.setValue(undefined);  // undefined (0 bytes)
        expect(node.buildStateInfo().treeBytes).to.equal(160);
      });

      it("internal node", () => {
        const parent = new StateNode();
        const label = 'label';
        parent.setChild(label, stateTree);

        expect(stateTree.computeNodeBytes()).to.equal(160);

        child1.setTreeBytes(10);
        child2.setTreeBytes(20);
        child3.setTreeBytes(30);
        child4.setTreeBytes(40);
        stateTree.radixTree.root.setTreeBytes(10000);

        // With updatedChildLabel = null, shouldRebuildRadixInfo = false
        // 36 + 10000 = 10036
        expect(stateTree.buildStateInfo(null, false).treeBytes).to.equal(10160);
        // With updatedChildLabel = label1, shouldRebuildRadixInfo = true
        // 8(label1) * 2 + 10 = 62
        expect(stateTree.buildStateInfo(label1).treeBytes).to.equal(186);
        // With updatedChildLabel = null, shouldRebuildRadixInfo = true
        // 8(label1) * 2 + 10 + 8(label2) * 2 + 20 + 8(label3) * 2 + 30 + 8(label4) * 2 + 40 = 164
        expect(stateTree.buildStateInfo().treeBytes).to.equal(324);
      });
    });
  });

  describe("updateStateInfo / verifyStateInfo", () => {
    it("leaf node", () => {
      let treeInfo;

      node.setValue(true);
      expect(node.verifyStateInfo()).to.equal(false);
      node.updateStateInfo();
      expect(node.verifyStateInfo()).to.equal(true);

      node.setValue(10);
      expect(node.verifyStateInfo()).to.equal(false);
      node.updateStateInfo();
      expect(node.verifyStateInfo()).to.equal(true);

      node.setValue(-200);
      expect(node.verifyStateInfo()).to.equal(false);
      node.updateStateInfo();
      expect(node.verifyStateInfo()).to.equal(true);

      node.setValue('');
      expect(node.verifyStateInfo()).to.equal(false);
      node.updateStateInfo();
      expect(node.verifyStateInfo()).to.equal(true);

      node.setValue('str');
      expect(node.verifyStateInfo()).to.equal(false);
      node.updateStateInfo();
      expect(node.verifyStateInfo()).to.equal(true);

      node.setValue(null);
      expect(node.verifyStateInfo()).to.equal(false);
      node.updateStateInfo();
      expect(node.verifyStateInfo()).to.equal(true);

      node.setValue(undefined);
      expect(node.verifyStateInfo()).to.equal(false);
      node.updateStateInfo();
      expect(node.verifyStateInfo()).to.equal(true);
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
      expect(stateTree.verifyStateInfo()).to.equal(false);

      // update without updatedChildLabel
      stateTree.updateStateInfo();
      const proofHash = stateTree.getProofHash();
      expect(stateTree.verifyStateInfo()).to.equal(true);

      // set another proof hash value for a child
      child2.setProofHash('another PH');

      // update with updatedChildLabel
      stateTree.updateStateInfo(label2);
      const newProofHash = stateTree.getProofHash();
      expect(newProofHash).not.equal(proofHash);  // Updated
      expect(stateTree.verifyStateInfo()).to.equal(true);

      // set yet another proof hash value for a child
      child2.setProofHash('yet another PH');

      // update with updatedChildLabel and shouldRebuildRadixInfo = false
      const stateTreeProofHashBefore = stateTree.getProofHash();
      stateTree.updateStateInfo(label2, false);  // shouldRebuildRadixInfo = false
      const newProofHash2 = stateTree.getProofHash();
      expect(newProofHash2).equal(stateTreeProofHashBefore);  // Unchanged
      expect(stateTree.verifyStateInfo()).to.equal(false);
    });

    it("verifyStateInfo with updatedChildLabel", () => {
      child1.setProofHash('proofHash1');
      child2.setProofHash('proofHash2');
      child3.setProofHash('proofHash3');
      child4.setProofHash('proofHash4');

      // update with updatedChildLabel
      stateTree.updateStateInfo(label2);
      // verify with updatedChildLabel
      expect(stateTree.verifyStateInfo(label2)).to.equal(true);
      // verify without updatedChildLabel
      expect(stateTree.verifyStateInfo()).to.equal(false);
    });
  });

  describe("getProofOfStateNode", () => {
    it("leaf node", () => {
      node.setValue(true);  // leaf node
      node.setProofHash('proofHash');
      assert.deepEqual(node.getProofOfStateNode(), {
        "#state_ph": "proofHash"
      });
    });

    it("internal node", () => {
      child1.setProofHash('proofHash1');
      child2.setProofHash('proofHash2');
      child3.setProofHash('proofHash3');
      child4.setProofHash('proofHash4');
      stateTree.setProofHash('proofHash');

      stateTree.updateStateInfo();
      assert.deepEqual(stateTree.radixTree.toJsObject(false, false, true), {
        "#radix_ph": "0xea2df03d09e72671391dc8af7e9bc5e5d3ac9ae6d64cb78df2c27e391f89388e",
        "00aaaa": {
          "#radix_ph": "0xd8895ab36f227519e479a4bf7cfcbf963deb8e69e8172f395af8db83172bf22c",
          "#state:0x00aaaa": {
            "#state_ph": "proofHash1",
          }
        },
        "11bb": {
          "11": {
            "#radix_ph": "0x741ba4788b06907f8c99c60a6f483f885cc1b4fb27f9e1bed71dfd1d8a213214",
            "#state:0x11bb11": {
              "#state_ph": "proofHash4",
            }
          },
          "#radix_ph": "0xbfbfc5f5c2e7b1d694fa822a0017c8d691dd99e003798cfcc068a26505dd6430",
          "00": {
            "#radix_ph": "0x3dfb52c0d974feb0559c9efafa996fb286717785e98871336e68ffb52d04bdf4",
            "#state:0x11bb00": {
              "#state_ph": "proofHash3",
            }
          },
          "bb": {
            "#radix_ph": "0xbbc5610ad726c88350abbe6513ab8f7441cbe8ff09ece86642a827feb53ce184",
            "#state:0x11bbbb": {
              "#state_ph": "proofHash2",
            }
          }
        }
      });

      assert.deepEqual(stateTree.getProofOfStateNode(label2, 'child_proof2'), {
        "#state_ph": "0xea2df03d09e72671391dc8af7e9bc5e5d3ac9ae6d64cb78df2c27e391f89388e",
        "#radix:00aaaa": {
          "#radix_ph": "0xd8895ab36f227519e479a4bf7cfcbf963deb8e69e8172f395af8db83172bf22c"
        },
        "#radix:11bb": {
          "#radix:11": {
            "#radix_ph": "0x741ba4788b06907f8c99c60a6f483f885cc1b4fb27f9e1bed71dfd1d8a213214"
          },
          "#radix_ph": "0xbfbfc5f5c2e7b1d694fa822a0017c8d691dd99e003798cfcc068a26505dd6430",
          "#radix:00": {
            "#radix_ph": "0x3dfb52c0d974feb0559c9efafa996fb286717785e98871336e68ffb52d04bdf4"
          },
          "#radix:bb": {
            "#radix_ph": "0xbbc5610ad726c88350abbe6513ab8f7441cbe8ff09ece86642a827feb53ce184",
            "#state:0x11bbbb": "child_proof2"
          }
        }
      });
    });
  });

  describe("deleteRadixTreeVersion", () => {
    it("delete", () => {
      child1.setProofHash('proofHash1');
      child2.setProofHash('proofHash2');
      child3.setProofHash('proofHash3');
      child4.setProofHash('proofHash4');

      expect(stateTree.deleteRadixTreeVersion()).to.equal(14);
      expect(stateTree.numChildren()).to.equal(0);
      assert.deepEqual(stateTree.getChildLabels(), []);
      assert.deepEqual(stateTree.getChildNodes(), []);
      // Check parents of state nodes
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child1.getParentNodes(), []);
      assert.deepEqual(child1.getParentNodes(), []);
    });
  });
});
