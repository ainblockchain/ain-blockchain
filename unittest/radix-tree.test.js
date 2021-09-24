const RadixTree = require('../db/radix-tree');
const RadixNode = require('../db/radix-node');
const StateNode = require('../db/state-node');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("radix-tree", () => {
  describe("initialization", () => {
    it("construct without version", () => {
      const tree = new RadixTree();
      expect(tree.version).to.equal(null);
      expect(tree.nodeSerial).to.equal(1);
      expect(tree.numTerminalNodes).to.equal(0);
      expect(tree.root.getVersion()).to.equal(null);
      expect(tree.root.getSerial()).to.equal(0);
      expect(tree.root.getParentStateNode()).to.equal(null);
    });

    it("construct with version", () => {
      const version = 'ver';
      const tree = new RadixTree(version);
      expect(tree.version).to.equal(version);
      expect(tree.nodeSerial).to.equal(1);
      expect(tree.numTerminalNodes).to.equal(0);
      expect(tree.root.getVersion()).to.equal(version);
      expect(tree.root.getSerial()).to.equal(0);
      expect(tree.root.getParentStateNode()).to.equal(null);
    });

    it("construct with parent state node", () => {
      const parentStateNode = new StateNode();
      const tree = new RadixTree(null, parentStateNode);
      expect(tree.version).to.equal(null);
      expect(tree.nodeSerial).to.equal(1);
      expect(tree.numTerminalNodes).to.equal(0);
      expect(tree.root.getVersion()).to.equal(null);
      expect(tree.root.getSerial()).to.equal(0);
      expect(tree.root.getParentStateNode()).to.equal(parentStateNode);
    });
  });

  describe("clone", () => {
    it("clone", () => {
      const version = 'ver';
      const version2 = 'ver2';
      const label1 = '0x000aaa';
      const label2 = '0x000bbb';
      const label21 = '0x000bbb111';
      const label22 = '0x000bbb222';

      const parentStateNode = new StateNode(version);
      const stateNode1 = new StateNode(version);
      const stateNode2 = new StateNode(version);
      const stateNode21 = new StateNode(version);
      const stateNode22 = new StateNode(version);

      const tree = new RadixTree(version, parentStateNode);

      stateNode1.setLabel(label1);
      stateNode2.setLabel(label2);
      stateNode21.setLabel(label21);
      stateNode22.setLabel(label22);

      tree.set(label1, stateNode1);
      tree.set(label2, stateNode2);
      tree.set(label21, stateNode21);
      tree.set(label22, stateNode22);

      assert.deepEqual(tree.root.getParentStateNode(), parentStateNode);
      expect(tree.numChildStateNodes()).to.equal(4);
      assert.deepEqual(tree.toJsObject(true), {
        ".radix_version": "ver",
        "000": {
          ".radix_version": "ver",
          "aaa": {
            ".label": "0x000aaa",
            ".radix_version": "ver",
            ".version": "ver"
          },
          "bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".radix_version": "ver",
              ".version": "ver"
            },
            "222": {
              ".label": "0x000bbb222",
              ".radix_version": "ver",
              ".version": "ver"
            },
            ".label": "0x000bbb",
            ".radix_version": "ver",
            ".version": "ver"
          }
        }
      });
      expect(stateNode1.getParentRadixNodes().length).to.equal(1);
      expect(stateNode2.getParentRadixNodes().length).to.equal(1);
      expect(stateNode21.getParentRadixNodes().length).to.equal(1);
      expect(stateNode22.getParentRadixNodes().length).to.equal(1);
      expect(stateNode1.numParents()).to.equal(1);
      expect(stateNode2.numParents()).to.equal(1);
      expect(stateNode21.numParents()).to.equal(1);
      expect(stateNode22.numParents()).to.equal(1);

      const parentStateNode2 = new StateNode(version2);
      const cloned = tree.clone(version2, parentStateNode2);

      assert.deepEqual(cloned.root.getParentStateNode(), parentStateNode2);
      expect(cloned.version).to.equal(version2);
      expect(cloned.nodeSerial).to.equal(tree.nodeSerial);
      expect(cloned.numTerminalNodes).to.equal(4);
      assert.deepEqual(cloned.toJsObject(true), {
        ".radix_version": "ver2",
        "000": {
          ".radix_version": "ver",
          "aaa": {
            ".label": "0x000aaa",
            ".radix_version": "ver",
            ".version": "ver"
          },
          "bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".radix_version": "ver",
              ".version": "ver"
            },
            "222": {
              ".label": "0x000bbb222",
              ".radix_version": "ver",
              ".version": "ver"
            },
            ".label": "0x000bbb",
            ".radix_version": "ver",
            ".version": "ver"
          }
        }
      });
      expect(stateNode1.getParentRadixNodes().length).to.equal(1);
      expect(stateNode2.getParentRadixNodes().length).to.equal(1);
      expect(stateNode21.getParentRadixNodes().length).to.equal(1);
      expect(stateNode22.getParentRadixNodes().length).to.equal(1);
      expect(stateNode1.numParents()).to.equal(2);
      expect(stateNode2.numParents()).to.equal(2);
      expect(stateNode21.numParents()).to.equal(2);
      expect(stateNode22.numParents()).to.equal(2);
    });
  });

  describe("_newRadixNode", () => {
    it("new radix nodes with increasing serials", () => {
      const version = 'ver';
      const parentStateNode = new StateNode();
      const tree = new RadixTree(version, parentStateNode);

      const node1 = tree._newRadixNode();
      expect(node1.getVersion()).to.equal(version);
      expect(node1.getSerial()).to.equal(1);
      expect(node1.getParentStateNode()).to.equal(null);
      expect(tree.nodeSerial).to.equal(2);

      const node2 = tree._newRadixNode();
      expect(node2.getVersion()).to.equal(version);
      expect(node2.getSerial()).to.equal(2);
      expect(node2.getParentStateNode()).to.equal(null);
      expect(tree.nodeSerial).to.equal(3);

      const node3 = tree._newRadixNode();
      expect(node3.getVersion()).to.equal(version);
      expect(node3.getSerial()).to.equal(3);
      expect(node3.getParentStateNode()).to.equal(null);
      expect(tree.nodeSerial).to.equal(4);
    });
  });

  describe("utils", () => {
    it("_toRadixLabel", () => {
      expect(RadixTree._toRadixLabel('0x1234567890abcdef')).to.equal('1234567890abcdef');
      expect(RadixTree._toRadixLabel('aAzZ')).to.equal('61417a5a');
    });

    it("_matchLabelSuffix with empty label suffix", () => {
      const radixLabel = '1234abcd';
      const radixNode = new RadixNode();
      radixNode.setLabelSuffix('');
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 0)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 1)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 2)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 3)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 4)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 5)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 6)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 7)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 8)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, '', 0)).to.equal(true);
    });

    it("_matchLabelSuffix with non-empty label suffix", () => {
      const radixLabel = '1234abcd';
      const radixNode = new RadixNode();
      // a shorter length
      radixNode.setLabelSuffix('ab');
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 3)).to.equal(false);
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 4)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 5)).to.equal(false);

      // the same length
      radixNode.setLabelSuffix('abcd');
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 3)).to.equal(false);
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 4)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 5)).to.equal(false);

      // a longer length
      radixNode.setLabelSuffix('abcd123');
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 3)).to.equal(false);
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 4)).to.equal(false);
      expect(RadixTree._matchLabelSuffix(radixNode, radixLabel, 5)).to.equal(false);
    });

    it("_getCommonPrefix", () => {
      expect(RadixTree._getCommonPrefix('1234567890abcdef', '1234567890abcdef'))
          .to.equal('1234567890abcdef');
      expect(RadixTree._getCommonPrefix('1234567890000000', '1234567890abcdef'))
          .to.equal('1234567890');
      expect(RadixTree._getCommonPrefix('1234567890abcdef', '1234567890000000'))
          .to.equal('1234567890');
      expect(RadixTree._getCommonPrefix('1234567890', '1234567890abcdef'))
          .to.equal('1234567890');
      expect(RadixTree._getCommonPrefix('1234567890abcdef', '1234567890'))
          .to.equal('1234567890');
      expect(RadixTree._getCommonPrefix('1234567890abcdef', '01234567890abcdef'))
          .to.equal('');
    });

    it("_setChildWithLabel with empty label suffix", () => {
      const node = new RadixNode();
      const child = new RadixNode();

      expect(RadixTree._setChildWithLabel(node, '1', child)).to.equal(true);
      assert.deepEqual(node.getChild('1'), child);
      expect(child.getLabelRadix()).to.equal('1');
      expect(child.getLabelSuffix()).to.equal('');
    });

    it("_setChildWithLabel with non-empty label suffix", () => {
      const node = new RadixNode();
      const child = new RadixNode();

      expect(RadixTree._setChildWithLabel(node, '1234567890abcdef', child)).to.equal(true);
      expect(node.hasChild('1')).to.equal(true);
      assert.deepEqual(node.getChild('1'), child);
      expect(child.getLabelRadix()).to.equal('1');
      expect(child.getLabelSuffix()).to.equal('234567890abcdef');
    });
  });

  describe("APIs", () => {
    const version = 'ver';
    let tree;

    beforeEach(() => {
      tree = new RadixTree(version);
    })

    describe("get / has / set / delete", () => {
      let stateNode1;
      let stateNode2;
      let stateNode21;
      let stateNode22;
      let stateNodeInternal;

      beforeEach(() => {
        stateNode1 = new StateNode();
        stateNode2 = new StateNode();
        stateNode21 = new StateNode();
        stateNode22 = new StateNode();
        stateNodeInternal = new StateNode();
      })

      it("without common label prefix - set / delete without label suffices", () => {
        const label1 = '0xa';
        const label2 = '0xb';

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
        });

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "a": {
            ".version": null,
            ".label": "0xa",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });

        // set second node
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "a": {
            ".version": null,
            ".label": "0xa",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          },
          "b": {
            ".version": null,
            ".label": "0xb",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });

        // delete first node
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "b": {
            ".version": null,
            ".label": "0xb",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });

        // delete second node
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
        });
      });

      it("without common label prefix - set / delete with label suffices", () => {
        const label1 = '0xaaa';
        const label2 = '0xbbb';

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
        });

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "aaa": {
            ".version": null,
            ".label": "0xaaa",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });

        // set second node
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "aaa": {
            ".version": null,
            ".label": "0xaaa",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          },
          "bbb": {
            ".version": null,
            ".label": "0xbbb",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });

        // delete first node
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "bbb": {
            ".version": null,
            ".label": "0xbbb",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });

        // delete second node
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
        });
      });

      it("without common label prefix - set with substring label suffix", () => {
        const label1 = '0xaaabbb';
        const label2 = '0xaaa';

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);

        tree.set(label1, stateNode1);
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        // internal node inserted!
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "aaa": {
            ".version": null,
            ".label": "0xaaa",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
            "bbb": {
              ".version": null,
              ".label": "0xaaabbb",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            }
          }
        });
      });

      it("without common label prefix - set with substring label suffix and a sibling having multiple parents", () => {
        const label1 = '0xaaabbb';
        const label2 = '0xaaa';

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);

        tree.set(label1, stateNode1);

        // set another parent
        const version2 = 'ver2';
        const parentAnother = new RadixNode(version2);
        const node = tree._getRadixNodeForReading(label1);
        parentAnother.setChild('a', 'aabbb', node);

        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "aaabbb": {
            ".label": "0xaaabbb",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });

        assert.deepEqual(parentAnother.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
          "aaabbb": {
            ".label": "0xaaabbb",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });

        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        // internal node inserted and sibling cloned!
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "aaa": {
            ".label": "0xaaa",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
            "bbb": {
              ".label": "0xaaabbb",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            }
          }
        });
        // no changes except num_parents!
        assert.deepEqual(parentAnother.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
          "aaabbb": {
            ".label": "0xaaabbb",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });
      });

      it("without common label prefix - set with superstring label suffix", () => {
        const label1 = '0xaaa';
        const label2 = '0xaaabbb';

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);

        tree.set(label1, stateNode1);
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        // branched!!
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "aaa": {
            ".version": null,
            ".label": "0xaaa",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
            "bbb": {
              ".version": null,
              ".label": "0xaaabbb",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            }
          }
        });
      });

      it("without common label prefix - set with exact-matched label suffix", () => {
        const label = '0xaaa';

        stateNode1.setLabel(label);
        stateNode2.setLabel(label + '_');  // tweak in order to distinguish

        tree.set(label, stateNode1);

        expect(tree.has(label)).to.equal(true);
        expect(tree.get(label)).to.equal(stateNode1);

        tree.set(label, stateNode2);

        expect(tree.has(label)).to.equal(true);
        expect(tree.get(label)).to.equal(stateNode2);
        // overwritten!
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "aaa": {
            ".version": null,
            ".label": "0xaaa_",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });
      });

      it("without common label prefix - set with a sibling having multiple parents", () => {
        const label1 = '0xaaa';
        const label2 = '0xbbb';

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);

        tree.set(label1, stateNode1);

        // set another parent
        const version2 = 'ver2';
        const parentAnother = new RadixNode(version2);
        const node = tree._getRadixNodeForReading(label1);
        parentAnother.setChild('a', 'aa', node);

        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "aaa": {
            ".label": "0xaaa",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });

        assert.deepEqual(parentAnother.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
          "aaa": {
            ".label": "0xaaa",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });

        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        // internal node inserted, but no changes on the sibling!
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "aaa": {
            ".label": "0xaaa",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          },
          "bbb": {
            ".label": "0xbbb",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });
        // no changes!
        assert.deepEqual(parentAnother.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
          "aaa": {
            ".label": "0xaaa",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });
      });

      it("without common label prefix - set / delete with children", () => {
        const label2 = '0xbbb';
        const label21 = '0xbbb111';
        const label22 = '0xbbb222';

        stateNode2.setLabel(label2);
        stateNode21.setLabel(label21);
        stateNode22.setLabel(label22);

        // set a node
        tree.set(label2, stateNode2);
        // set children
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "bbb": {
            "111": {
              ".version": null,
              ".label": "0xbbb111",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            },
            "222": {
              ".version": null,
              ".label": "0xbbb222",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            },
            ".version": null,
            ".label": "0xbbb",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });

        // delete a node
        tree.delete(label2);

        expect(tree.has(label2)).to.equal(false);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_ph": null,
          ".radix_version": "ver",
          "bbb": {
            "111": {
              ".label": "0xbbb111",
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0xbbb222",
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".radix_ph": null,
            ".radix_version": "ver",
          }
        });
      });

      it("without common label prefix - delete a node with one child", () => {
        const label2 = '0xbbb';
        const label21 = '0xbbb111';

        stateNode2.setLabel(label2);
        stateNode21.setLabel(label21);

        // set a node
        tree.set(label2, stateNode2);
        // set a child
        tree.set(label21, stateNode21);

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "bbb": {
            "111": {
              ".version": null,
              ".label": "0xbbb111",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            },
            ".version": null,
            ".label": "0xbbb",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });

        // delete the node
        tree.delete(label2);

        expect(tree.has(label2)).to.equal(false);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        // merged!!
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "bbb111": {
            ".version": null,
            ".label": "0xbbb111",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });
      });

      it("without common label prefix - delete a node with no children and one parent having state node", () => {
        const label2 = '0xbbb';
        const label21 = '0xbbb111';
        const label22 = '0xbbb222';

        stateNode2.setLabel(label2);
        stateNode21.setLabel(label21);
        stateNode22.setLabel(label22);

        // set a node
        tree.set(label2, stateNode2);
        // set children
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "bbb": {
            "111": {
              ".label": "0xbbb111",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0xbbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".label": "0xbbb",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });

        // delete the node
        tree.delete(label21);

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(false);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        // not merged!!
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "bbb": {
            "222": {
              ".label": "0xbbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".label": "0xbbb",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });
      });

      it("without common label prefix - delete a node with no children and one parent having no state node", () => {
        const label21 = '0xbbb111';
        const label22 = '0xbbb222';

        stateNode21.setLabel(label21);
        stateNode22.setLabel(label22);

        // set children
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);

        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "bbb": {
            "111": {
              ".label": "0xbbb111",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0xbbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".num_parents": 1,
            ".radix_ph": null,
            ".radix_version": "ver",
          }
        });

        // delete the node
        tree.delete(label21);

        expect(tree.has(label21)).to.equal(false);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        // merged!!
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "bbb222": {
            ".label": "0xbbb222",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });
      });

      it("with common label prefix - set / delete without label suffices", () => {
        const label1 = '0x000a';
        const label2 = '0x000b';

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
        });

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000a": {
            ".version": null,
            ".label": "0x000a",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });

        // set second node
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000": {
            ".radix_version": "ver",
            ".radix_ph": null,
            "a": {
              ".version": null,
              ".label": "0x000a",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            },
            "b": {
              ".version": null,
              ".label": "0x000b",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            }
          }
        });

        // delete first node
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000b": {
            ".version": null,
            ".label": "0x000b",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });

        // delete second node
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
        });
      });

      it("with common label prefix - set / delete with label suffices", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
        });

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000aaa": {
            ".version": null,
            ".label": "0x000aaa",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });

        // set second node
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000": {
            ".radix_version": "ver",
            ".radix_ph": null,
            "aaa": {
              ".version": null,
              ".label": "0x000aaa",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            },
            "bbb": {
              ".version": null,
              ".label": "0x000bbb",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            }
          }
        });

        // delete first node
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000bbb": {
            ".version": null,
            ".label": "0x000bbb",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });

        // delete second node
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
        });
      });

      it("with common label prefix - set / delete with label suffices, with shouldUpdateRadixInfo = true", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
        });

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000aaa": {
            ".version": null,
            ".label": "0x000aaa",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });

        // set second node
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000": {
            ".radix_version": "ver",
            ".radix_ph": null,
            "aaa": {
              ".version": null,
              ".label": "0x000aaa",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            },
            "bbb": {
              ".version": null,
              ".label": "0x000bbb",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            }
          }
        });

        // delete first node
        tree.delete(label1, true);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": "0x16337f10dc7114cb5eba09c616cc2ec112e080404ac3fc1aea63111f8570d6b8",
          "000bbb": {
            ".version": null,
            ".label": "0x000bbb",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });
      });

      it("with common label prefix - set on an internal node", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';
        const labelInternal = '0x000';

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);
        stateNodeInternal.setLabel(labelInternal);

        // add terminal nodes
        tree.set(label1, stateNode1);
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000": {
            ".radix_version": "ver",
            ".radix_ph": null,
            "aaa": {
              ".version": null,
              ".label": "0x000aaa",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            },
            "bbb": {
              ".version": null,
              ".label": "0x000bbb",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            }
          }
        });

        // set on the internal node
        tree.set(labelInternal, stateNodeInternal);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(labelInternal)).to.equal(true);
        expect(tree.get(labelInternal)).to.equal(stateNodeInternal);
        // no branching!
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000": {
            ".version": null,
            ".label": "0x000",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
            "aaa": {
              ".version": null,
              ".label": "0x000aaa",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            },
            "bbb": {
              ".version": null,
              ".label": "0x000bbb",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            }
          }
        });
      });

      it("with common label prefix - set with substring label suffix", () => {
        const label1 = '0x000aaabbb';
        const label2 = '0x000aaa';

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);

        tree.set(label1, stateNode1);
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        // internal node inserted!
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000aaa": {
            ".version": null,
            ".label": "0x000aaa",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
            "bbb": {
              ".version": null,
              ".label": "0x000aaabbb",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            }
          }
        });
      });

      it("with common label prefix - set with substring label suffix and a sibling having multiple parents", () => {
        const label1 = '0x000aaabbb';
        const label2 = '0x000aaa';

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);

        tree.set(label1, stateNode1);

        // set another parent
        const version2 = 'ver2';
        const parentAnother = new RadixNode(version2);
        const node = tree._getRadixNodeForReading(label1);
        parentAnother.setChild('0', '00aaabbb', node);

        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "000aaabbb": {
            ".label": "0x000aaabbb",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });

        assert.deepEqual(parentAnother.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
          "000aaabbb": {
            ".label": "0x000aaabbb",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });

        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        // internal node inserted and sibling cloned!
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "000aaa": {
            ".label": "0x000aaa",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
            "bbb": {
              ".label": "0x000aaabbb",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            }
          }
        });

        // no changes except num_parents!
        assert.deepEqual(parentAnother.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
          "000aaabbb": {
            ".label": "0x000aaabbb",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });
      });

      it("with common label prefix - set with superstring label suffix", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000aaabbb';

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);

        tree.set(label1, stateNode1);
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        // branched!
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000aaa": {
            ".version": null,
            ".label": "0x000aaa",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
            "bbb": {
              ".version": null,
              ".label": "0x000aaabbb",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            }
          }
        });
      });

      it("with common label prefix - set with exact-matched label suffix", () => {
        const label = '0x000aaa';

        stateNode1.setLabel(label);
        stateNode2.setLabel(label + '_');  // tweak in order to distinguish

        tree.set(label, stateNode1);

        expect(tree.has(label)).to.equal(true);
        expect(tree.get(label)).to.equal(stateNode1);

        tree.set(label, stateNode2);

        expect(tree.has(label)).to.equal(true);
        expect(tree.get(label)).to.equal(stateNode2);
        // overwritten!
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000aaa": {
            ".version": null,
            ".label": "0x000aaa_",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });
      });

      it("with common label prefix - set with a sibling having multiple parents", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);

        tree.set(label1, stateNode1);

        // set another parent
        const version2 = 'ver2';
        const parentAnother = new RadixNode(version2);
        const node = tree._getRadixNodeForReading(label1);
        parentAnother.setChild('0', '00aaa', node);

        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "000aaa": {
            ".label": "0x000aaa",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });

        assert.deepEqual(parentAnother.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
          "000aaa": {
            ".label": "0x000aaa",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });

        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        // internal node inserted and sibling cloned!
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "000": {
            ".num_parents": 1,
            ".radix_ph": null,
            ".radix_version": "ver",
            "aaa": {
              ".label": "0x000aaa",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "bbb": {
              ".label": "0x000bbb",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            }
          }
        });

        // no changes except num_parents!
        assert.deepEqual(parentAnother.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
          "000aaa": {
            ".label": "0x000aaa",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });
      });

      it("with common label prefix - set / delete with children", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);
        stateNode21.setLabel(label21);
        stateNode22.setLabel(label22);

        // set first node
        tree.set(label1, stateNode1);
        // set second node
        tree.set(label2, stateNode2);
        // set children
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000": {
            ".radix_version": "ver",
            ".radix_ph": null,
            "aaa": {
              ".version": null,
              ".label": "0x000aaa",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            },
            "bbb": {
              "111": {
                ".version": null,
                ".label": "0x000bbb111",
                ".proof_hash": null,
              ".radix_version": "ver",
                ".radix_ph": null,
              },
              "222": {
                ".version": null,
                ".label": "0x000bbb222",
                ".proof_hash": null,
              ".radix_version": "ver",
                ".radix_ph": null,
              },
              ".version": null,
              ".label": "0x000bbb",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            }
          }
        });

        // delete first node
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000bbb": {
            "111": {
              ".version": null,
              ".label": "0x000bbb111",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            },
            "222": {
              ".version": null,
              ".label": "0x000bbb222",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            },
            ".version": null,
            ".label": "0x000bbb",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });
      });

      it("with common label prefix - delete a node with one child", () => {
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';

        stateNode2.setLabel(label2);
        stateNode21.setLabel(label21);

        // set a node
        tree.set(label2, stateNode2);
        // set a child
        tree.set(label21, stateNode21);

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000bbb": {
            "111": {
              ".version": null,
              ".label": "0x000bbb111",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            },
            ".version": null,
            ".label": "0x000bbb",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });

        // delete the node
        tree.delete(label2);

        expect(tree.has(label2)).to.equal(false);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        // merged!!
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000bbb111": {
            ".version": null,
            ".label": "0x000bbb111",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });
      });

      it("with common label prefix - delete a node with one child having multiple parents", () => {
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';

        stateNode2.setLabel(label2);
        stateNode21.setLabel(label21);

        // set a node
        tree.set(label2, stateNode2);
        // set a child
        tree.set(label21, stateNode21);
        // set another parent
        const version2 = 'ver2';
        const parentAnother = new RadixNode(version2);
        const node = tree._getRadixNodeForReading(label21);
        parentAnother.setChild('1', '11', node);

        // check parents
        expect(node.numParents()).to.equal(2);
        node.hasParent(parentAnother);

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "000bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 2,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".label": "0x000bbb",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });
        assert.deepEqual(parentAnother.toJsObject(true, true, false, true), {
          "111": {
            ".label": "0x000bbb111",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          },
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
        });

        // delete the node
        tree.delete(label2);

        expect(tree.has(label2)).to.equal(false);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        // not merged!!
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "000bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 2,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".num_parents": 1,
            ".radix_ph": null,
            ".radix_version": "ver",
          }
        });
        assert.deepEqual(parentAnother.toJsObject(true, true, false, true), {
          "111": {
            ".label": "0x000bbb111",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          },
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
        });
      });

      it("with common label prefix - delete a node with one child, with shouldUpdateRadixInfo = true", () => {
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';

        stateNode2.setLabel(label2);
        stateNode21.setLabel(label21);

        // set a node
        tree.set(label2, stateNode2);
        // set a child
        tree.set(label21, stateNode21);

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": null,
          "000bbb": {
            "111": {
              ".version": null,
              ".label": "0x000bbb111",
              ".proof_hash": null,
              ".radix_version": "ver",
              ".radix_ph": null,
            },
            ".version": null,
            ".label": "0x000bbb",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });

        // delete the node
        tree.delete(label2, true);  // shouldUpdateRadixInfo = true

        expect(tree.has(label2)).to.equal(false);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        // merged with proof hash updates!!
        assert.deepEqual(tree.toJsObject(true, true), {
          ".radix_version": "ver",
          ".radix_ph": "0xdf6bd65883bce47c743eb28ea70897e69be4d9b0046f21e3a2ee26114fb40bd1",
          "000bbb111": {
            ".version": null,
            ".label": "0x000bbb111",
            ".proof_hash": null,
            ".radix_version": "ver",
            ".radix_ph": null,
          }
        });
      });

      it("with common label prefix - delete a node with no children and one parent having state node", () => {
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

        stateNode2.setLabel(label2);
        stateNode21.setLabel(label21);
        stateNode22.setLabel(label22);

        // set a node
        tree.set(label2, stateNode2);
        // set children
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "000bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".label": "0x000bbb",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });

        // delete the node
        tree.delete(label21);

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(false);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        // not merged!!
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "000bbb": {
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".label": "0x000bbb",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });
      });

      it("with common label prefix - delete a node with no children and one parent having state node, with shouldUpdateRadixInfo = true", () => {
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

        stateNode2.setLabel(label2);
        stateNode21.setLabel(label21);
        stateNode22.setLabel(label22);

        // set a node
        tree.set(label2, stateNode2);
        // set children
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "000bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".label": "0x000bbb",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });

        // delete the node
        tree.delete(label21, true);  // shouldUpdateRadixInfo = true

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(false);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        // not merged with proof hash updates!!
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": "0xca570f9b1ca8572d215027ba2b949003e0c55ff3b5346bec47899fbaf652c8a5",
          ".radix_version": "ver",
          "000bbb": {
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".label": "0x000bbb",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": "0xfca2961686b9d9ee4b618bee6f6c7857c85644cf88e13e93179289fd18985fa8",
            ".radix_version": "ver",
            ".version": null,
          }
        });
      });

      it("with common label prefix - delete a node with no children and one parent having state node and multiple parents, with shouldUpdateRadixInfo = true", () => {
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

        stateNode2.setLabel(label2);
        stateNode21.setLabel(label21);
        stateNode22.setLabel(label22);

        // set a node
        tree.set(label2, stateNode2);
        // set children
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);
        // set another grandparent
        const version2 = 'ver2';
        const child2 = tree._getRadixNodeForReading(label2);
        const radixLabel2 = RadixTree._toRadixLabel(label2);
        const grandParentAnother = new RadixNode(version2);
        grandParentAnother.setChild(radixLabel2.charAt(0), radixLabel2.slice(1), child2);

        // check grandparents
        expect(child2.numParents()).to.equal(2);
        expect(child2.hasParent(grandParentAnother)).to.equal(true);

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "000bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".label": "0x000bbb",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });
        assert.deepEqual(grandParentAnother.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
          "000bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".label": "0x000bbb",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });

        // delete the node
        tree.delete(label21, true);  // shouldUpdateRadixInfo = true

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(false);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        // not merged with proof hash updates!!
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": "0xca570f9b1ca8572d215027ba2b949003e0c55ff3b5346bec47899fbaf652c8a5",
          ".radix_version": "ver",
          "000bbb": {
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 2,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".label": "0x000bbb",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": "0xfca2961686b9d9ee4b618bee6f6c7857c85644cf88e13e93179289fd18985fa8",
            ".radix_version": "ver",
            ".version": null,
          }
        });
        // no changes!!
        assert.deepEqual(grandParentAnother.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
          "000bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 2,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".label": "0x000bbb",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });
      });

      it("with common label prefix - delete a node with no children and one parent having no state node", () => {
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

        stateNode21.setLabel(label21);
        stateNode22.setLabel(label22);

        // set children
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);

        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "000bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".num_parents": 1,
            ".radix_ph": null,
            ".radix_version": "ver",
          }
        });

        // delete the node
        tree.delete(label21);

        expect(tree.has(label21)).to.equal(false);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        // merged!!
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "000bbb222": {
            ".label": "0x000bbb222",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });
      });

      it("with common label prefix - delete a node with no children and one parent having no state node, with shouldUpdateRadixInfo = true", () => {
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

        stateNode21.setLabel(label21);
        stateNode22.setLabel(label22);

        // set children
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);

        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "000bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".num_parents": 1,
            ".radix_ph": null,
            ".radix_version": "ver",
          }
        });

        // delete the node
        tree.delete(label21, true);  // shouldUpdateRadixInfo = true

        expect(tree.has(label21)).to.equal(false);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        // merged with proof hash updates!!
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": "0x2f86edb65f78422d4d2b8706495c0baa89c0cb169326a004a7c35b317f218a18",
          ".radix_version": "ver",
          "000bbb222": {
            ".label": "0x000bbb222",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });
      });

      it("with common label prefix - delete a node with no children and one parent having no state node and multiple parents, with shouldUpdateRadixInfo = true", () => {
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

        stateNode21.setLabel(label21);
        stateNode22.setLabel(label22);

        // set children
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);
        // set another grandparent
        const version2 = 'ver2';
        const child2 = tree._getRadixNodeForReading(label2);
        const radixLabel2 = RadixTree._toRadixLabel(label2);
        const grandParentAnother = new RadixNode(version2);
        grandParentAnother.setChild(radixLabel2.charAt(0), radixLabel2.slice(1), child2);

        // check grandparents
        expect(child2.numParents()).to.equal(2);
        expect(child2.hasParent(grandParentAnother)).to.equal(true);

        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "000bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".num_parents": 2,
            ".radix_ph": null,
            ".radix_version": "ver",
          }
        });
        assert.deepEqual(grandParentAnother.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
          "000bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".num_parents": 2,
            ".radix_ph": null,
            ".radix_version": "ver",
          }
        });

        // delete the node
        tree.delete(label21, true);  // shouldUpdateRadixInfo = true

        expect(tree.has(label21)).to.equal(false);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        // deleted with proof hash updates, but not merged!!
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": "0x76691a736e5b3e4cdf14c2384c766409a39e9447571aad9463298a7f47b68e40",
          ".radix_version": "ver",
          "000bbb": {
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 2,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".num_parents": 1,
            ".radix_ph": "0x8f58f77d96721e72e2cca7f862a896ab1edba47ecba320ebbed6f2064893d995",
            ".radix_version": "ver",
          }
        });
        // no changes!!
        assert.deepEqual(grandParentAnother.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
          "000bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 2,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".num_parents": 1,
            ".radix_ph": null,
            ".radix_version": "ver",
          }
        });
      });

      it("with common label prefix - delete a node with no children and multiple parents, with shouldUpdateRadixInfo = true", () => {
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

        stateNode21.setLabel(label21);
        stateNode22.setLabel(label22);

        // set children
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);
        // set another parent
        const version2 = 'ver2';
        const parentAnother = new RadixNode(version2);
        const node = tree._getRadixNodeForReading(label21);
        parentAnother.setChild('1', '11', node);

        // check parents
        expect(node.numParents()).to.equal(2);
        node.hasParent(parentAnother);

        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver",
          "000bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 2,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".num_parents": 1,
            ".radix_ph": null,
            ".radix_version": "ver",
          }
        });
        assert.deepEqual(parentAnother.toJsObject(true, true, false, true), {
          "111": {
            ".label": "0x000bbb111",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          },
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
        });

        // delete the node
        tree.delete(label21, true);  // shouldUpdateRadixInfo = true

        expect(tree.has(label21)).to.equal(false);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
        // merged with proof hash updates!!
        assert.deepEqual(tree.toJsObject(true, true, false, true), {
          ".num_parents": 0,
          ".radix_ph": "0x2f86edb65f78422d4d2b8706495c0baa89c0cb169326a004a7c35b317f218a18",
          ".radix_version": "ver",
          "000bbb222": {
            ".label": "0x000bbb222",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        });
        // no changes!!
        assert.deepEqual(parentAnother.toJsObject(true, true, false, true), {
          "111": {
            ".label": "0x000bbb111",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          },
          ".num_parents": 0,
          ".radix_ph": null,
          ".radix_version": "ver2",
        });
      });
    });

    describe("child state nodes", () => {
      const version = 'ver';
      const version2 = 'ver2';
      const label1 = '0x000aaa';
      const label2 = '0x000bbb';
      const label21 = '0x000bbb111';
      const label22 = '0x000bbb222';
      const label23 = '0x000bbb333';

      let stateNode1;
      let stateNode2;
      let stateNode21;
      let stateNode22;

      let tree;
      let cloned;

      beforeEach(() => {
        stateNode1 = new StateNode(version);
        stateNode2 = new StateNode(version);
        stateNode21 = new StateNode(version);
        stateNode22 = new StateNode(version);

        tree = new RadixTree(version);

        stateNode1.setLabel(label1);
        stateNode2.setLabel(label2);
        stateNode21.setLabel(label21);
        stateNode22.setLabel(label22);

        tree.set(label22, stateNode22);
        tree.set(label21, stateNode21);
        tree.set(label1, stateNode1);
        tree.set(label2, stateNode2);

        cloned = tree.clone(version2);
      });

      it("getChildStateLabels / getChildStateNodes", () => {
        // Insertion order is kept
        assert.deepEqual(tree.getChildStateLabels(), [ label22, label21, label1, label2 ]);
        assert.deepEqual(
            tree.getChildStateNodes(), [ stateNode22, stateNode21, stateNode1, stateNode2 ]);
      });

      it("getChildStateLabels / getChildStateNodes with cloned tree", () => {
        // Insertion order is kept.
        assert.deepEqual(cloned.getChildStateLabels(), [ label22, label21, label1, label2 ]);
        assert.deepEqual(
            cloned.getChildStateNodes(), [ stateNode22, stateNode21, stateNode1, stateNode2 ]);

        const newStateNode21 = new StateNode(version2);
        newStateNode21.setLabel(label21);
        cloned.set(label21, newStateNode21);

        const newStateNode23 = new StateNode(version2);
        newStateNode23.setLabel(label23);
        cloned.set(label23, newStateNode23);

        // The order does NOT change.
        assert.deepEqual(
            cloned.getChildStateLabels(), [ label22, label21, label1, label2, label23 ]);
        assert.deepEqual(
            cloned.getChildStateNodes(),
            [ stateNode22, newStateNode21, stateNode1, stateNode2, newStateNode23 ]);
      });
    });

    describe("radix info", () => {
      it("get / has / set / update / verify", () => {
        const label1 = '0x000aaa';
        const stateNode1 = new StateNode();
        stateNode1.setProofHash('stateNodePH1');

        const label11 = '0x000aaa111';
        const stateNode11 = new StateNode();
        stateNode11.setProofHash('stateNodePH11');

        const label12 = '0x000aaa212';
        const stateNode12 = new StateNode();
        stateNode12.setProofHash('stateNodePH12');

        const label21 = '0x000bbb121';
        const stateNode21 = new StateNode();
        stateNode21.setProofHash('stateNodePH21');

        const label22 = '0x000bbb222';
        const stateNode22 = new StateNode();
        stateNode22.setProofHash('stateNodePH22');

        const label3 = '0x111ccc';
        const stateNode3 = new StateNode();
        stateNode3.setProofHash('stateNodePH3');

        tree.set(label1, stateNode1);
        tree.set(label11, stateNode11);
        tree.set(label12, stateNode12);
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);
        tree.set(label3, stateNode3);

        assert.deepEqual(tree.toJsObject(false, true), {
          ".radix_ph": null,
          "000": {
            ".radix_ph": null,
            "aaa": {
              "111": {
                ".label": null,
                ".proof_hash": "stateNodePH11",
                ".radix_ph": null
              },
              "212": {
                ".label": null,
                ".proof_hash": "stateNodePH12",
                ".radix_ph": null
              },
              ".label": null,
              ".proof_hash": "stateNodePH1",
              ".radix_ph": null
            },
            "bbb": {
              "121": {
                ".label": null,
                ".proof_hash": "stateNodePH21",
                ".radix_ph": null
              },
              "222": {
                ".label": null,
                ".proof_hash": "stateNodePH22",
                ".radix_ph": null
              },
              ".radix_ph": null
            }
          },
          "111ccc": {
            ".label": null,
            ".proof_hash": "stateNodePH3",
            ".radix_ph": null
          }
        });

        // initial status
        expect(tree.getRootProofHash()).to.equal(null);
        expect(tree.verifyRadixInfoForRadixTree()).to.equal(false);

        // set
        expect(tree.updateRadixInfoForRadixTree()).to.equal(9);
        expect(tree.getRootProofHash()).to.equal(
            '0x3dac16e69a2dfa5ae4a448cda25da5542949b905d2bf8a07c389d77019c56c01');
        expect(tree.verifyRadixInfoForRadixTree()).to.equal(true);

        // change of a state node's proof hash
        stateNode21.setProofHash('another PH');
        expect(tree.verifyRadixInfoForRadixTree()).to.equal(false);

        // update
        expect(tree.updateRadixInfoForAllRootPaths(label21)).to.equal(4);
        expect(tree.getRootProofHash()).to.equal(
            '0x8070aef5df264e5ecea35dd84822e69f7bf65102a06f5765d62bd76265cadff5');
        expect(tree.verifyRadixInfoForRadixTree()).to.equal(true);
      });

      it("getProofOfState", () => {
        const label1 = '0x000aaa';
        const stateNode1 = new StateNode();
        stateNode1.setLabel(label1);
        stateNode1.setProofHash('stateNodePH1');

        const label11 = '0x000aaa111';
        const stateNode11 = new StateNode();
        stateNode11.setLabel(label11);
        stateNode11.setProofHash('stateNodePH11');

        const label12 = '0x000aaa212';
        const stateNode12 = new StateNode();
        stateNode12.setLabel(label12);
        stateNode12.setProofHash('stateNodePH12');

        const label2 = '0x000bbb';  // without state node

        const label21 = '0x000bbb121';
        const stateNode21 = new StateNode();
        stateNode21.setLabel(label21);
        stateNode21.setProofHash('stateNodePH21');

        const label22 = '0x000bbb222';
        const stateNode22 = new StateNode();
        stateNode22.setLabel(label22);
        stateNode22.setProofHash('stateNodePH22');

        tree.set(label1, stateNode1);
        tree.set(label11, stateNode11);
        tree.set(label12, stateNode12);
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);

        expect(tree.updateRadixInfoForRadixTree()).to.equal(8);
        assert.deepEqual(tree.toJsObject(false, true), {
          ".radix_ph": "0x05fc6d77a0a0885714b0bfcf6c00d9349f54da13eb0e87ea90fc4d4e450f307a",
          "000": {
            ".radix_ph": "0x051bf0bbc34bc40d44d4abafe0822f209ca8d9b0cf6dc0c8ef1fcff0021d7520",
            "aaa": {
              "111": {
                ".label": "0x000aaa111",
                ".proof_hash": "stateNodePH11",
                ".radix_ph": "0xac8e0ca829cea8d80a79260078fb8e1b38a05b6d087c72a1c92f63849a47b96b"
              },
              "212": {
                ".label": "0x000aaa212",
                ".proof_hash": "stateNodePH12",
                ".radix_ph": "0x7fc53637a6ff6b7efa8cf7c9ba95552ed7479262ad8c07a61b4d2b1e8002d360"
              },
              ".label": "0x000aaa",
              ".proof_hash": "stateNodePH1",
              ".radix_ph": "0xb08357cc732df1732db4dd2ec5a12e1d9d7ab8198ef2c40f92ee8d6a6c2755d0"
            },
            "bbb": {
              "121": {
                ".label": "0x000bbb121",
                ".proof_hash": "stateNodePH21",
                ".radix_ph": "0xa8c806fde336879bd0cb320c809ad8a1f6e1e526711ed239eb216f83e4fb19d7"
              },
              "222": {
                ".label": "0x000bbb222",
                ".proof_hash": "stateNodePH22",
                ".radix_ph": "0x0dd8afcb4c2839ff30e6872c7268f9ed687fd53c52ce78f0330de82d5b33a0a2"
              },
              ".radix_ph": "0x78d50ec884283d1759dc14ae88aa3e832199ff650b450da3b45cd507c2cd8474"
            }
          }
        });

        // on an internal radix node
        assert.deepEqual(tree.getProofOfState(label1, 'state_proof1'), {
          ".radix_ph": "0x05fc6d77a0a0885714b0bfcf6c00d9349f54da13eb0e87ea90fc4d4e450f307a",
          "000": {
            ".radix_ph": "0x051bf0bbc34bc40d44d4abafe0822f209ca8d9b0cf6dc0c8ef1fcff0021d7520",
            "aaa": {
              ".label": "0x000aaa",
              ".proof_hash": "state_proof1",
              ".radix_ph": "0xb08357cc732df1732db4dd2ec5a12e1d9d7ab8198ef2c40f92ee8d6a6c2755d0"
            },
            "bbb": {
              ".radix_ph": "0x78d50ec884283d1759dc14ae88aa3e832199ff650b450da3b45cd507c2cd8474"
            }
          }
        });

        // on a terminal radix node
        assert.deepEqual(tree.getProofOfState(label22, 'state_proof22'), {
          ".radix_ph": "0x05fc6d77a0a0885714b0bfcf6c00d9349f54da13eb0e87ea90fc4d4e450f307a",
          "000": {
            ".radix_ph": "0x051bf0bbc34bc40d44d4abafe0822f209ca8d9b0cf6dc0c8ef1fcff0021d7520",
            "aaa": {
              ".radix_ph": "0xb08357cc732df1732db4dd2ec5a12e1d9d7ab8198ef2c40f92ee8d6a6c2755d0"
            },
            "bbb": {
              "121": {
                ".radix_ph": "0xa8c806fde336879bd0cb320c809ad8a1f6e1e526711ed239eb216f83e4fb19d7"
              },
              "222": {
                ".label": "0x000bbb222",
                ".proof_hash": "state_proof22",
                ".radix_ph": "0x0dd8afcb4c2839ff30e6872c7268f9ed687fd53c52ce78f0330de82d5b33a0a2"
              },
              ".radix_ph": "0x78d50ec884283d1759dc14ae88aa3e832199ff650b450da3b45cd507c2cd8474"
            }
          }
        });

        // on an internal radix node without state node
        assert.deepEqual(tree.getProofOfState(label2, 'state_proof2'), null);

        // on a non-existing radix node
        assert.deepEqual(tree.getProofOfState('non_existing_label', 'state_proof'), null);
      });
    });

    it("deleteRadixTreeVersion", () => {
      const versionAnother = 'ver_another';
      const versionYetAnother = 'ver_yet_another';

      const label1 = '0x000aaa';
      const label2 = '0x000bbb';
      const label21 = '0x000bbb111';
      const label22 = '0x000bbb222';

      const stateNode1 = new StateNode();
      const stateNode2 = new StateNode();
      const stateNode21 = new StateNode();
      const stateNode22 = new StateNode();
      const stateNodeAnother1 = new StateNode();

      // set state nodes
      tree.set(label1, stateNode1);
      tree.set(label2, stateNode2);
      tree.set(label21, stateNode21);
      tree.set(label22, stateNode22);

      stateNode1.setLabel(label1);
      stateNode2.setLabel(label2);
      stateNode21.setLabel(label21);
      stateNode22.setLabel(label22);

      const treeAnother = tree.clone(versionAnother, null);
      treeAnother.set(label1, stateNodeAnother1);
      stateNodeAnother1.setLabel(label1);

      // Let's make stateNodeAnother1 has 2 parent radix nodes.
      const childYetAnother1 = new RadixNode();
      childYetAnother1.setVersion(versionYetAnother);
      childYetAnother1.setChildStateNode(stateNodeAnother1);

      assert.deepEqual(tree.toJsObject(true, true, false, true), {
        ".num_parents": 0,
        ".radix_ph": null,
        ".radix_version": "ver",
        "000": {
          ".num_parents": 1,
          ".radix_ph": null,
          ".radix_version": "ver",
          "aaa": {
            ".label": "0x000aaa",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          },
          "bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".label": "0x000bbb",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        }
      });
      assert.deepEqual(treeAnother.toJsObject(true, true, false, true), {
        ".num_parents": 0,
        ".radix_ph": null,
        ".radix_version": "ver_another",
        "000": {
          ".num_parents": 1,
          ".radix_ph": null,
          ".radix_version": "ver_another",
          "aaa": {
            ".label": "0x000aaa",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver_another",
            ".version": null,
          },
          "bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".label": "0x000bbb",
            ".num_parents": 2,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        }
      });

      // Check numParentRadixNodes()
      expect(stateNode1.numParentRadixNodes()).to.equal(1);
      expect(stateNode2.numParentRadixNodes()).to.equal(1);
      expect(stateNode21.numParentRadixNodes()).to.equal(1);
      expect(stateNode22.numParentRadixNodes()).to.equal(1);
      expect(stateNodeAnother1.numParentRadixNodes()).to.equal(2);

      expect(treeAnother.deleteRadixTreeVersion()).to.equal(3);  // including internal nodes

      // no changes!!
      assert.deepEqual(tree.toJsObject(true, true, false, true), {
        ".num_parents": 0,
        ".radix_ph": null,
        ".radix_version": "ver",
        "000": {
          ".num_parents": 1,
          ".radix_ph": null,
          ".radix_version": "ver",
          "aaa": {
            ".label": "0x000aaa",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          },
          "bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            "222": {
              ".label": "0x000bbb222",
              ".num_parents": 1,
              ".proof_hash": null,
              ".radix_ph": null,
              ".radix_version": "ver",
              ".version": null,
            },
            ".label": "0x000bbb",
            ".num_parents": 1,
            ".proof_hash": null,
            ".radix_ph": null,
            ".radix_version": "ver",
            ".version": null,
          }
        }
      });
      // deleted!!
      assert.deepEqual(treeAnother.toJsObject(true, true, false, true), {
        ".num_parents": 0,
        ".radix_ph": null,
        ".radix_version": null,
      });

      // Check numParentRadixNodes()
      expect(stateNode1.numParentRadixNodes()).to.equal(1);
      expect(stateNode2.numParentRadixNodes()).to.equal(1);
      expect(stateNode21.numParentRadixNodes()).to.equal(1);
      expect(stateNode22.numParentRadixNodes()).to.equal(1);
      expect(stateNodeAnother1.numParentRadixNodes()).to.equal(1);  // decreased!!
    });
  });
});
