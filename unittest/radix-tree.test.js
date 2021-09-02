const RadixTree = require('../db/radix-tree');
const RadixNode = require('../db/radix-node');
const StateNode = require('../db/state-node');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("radix-tree", () => {
  describe("Utils", () => {
    it("_toHexLabel", () => {
      const tree = new RadixTree();
      expect(tree._toHexLabel('0x1234567890abcdef')).to.equal('1234567890abcdef');
      expect(tree._toHexLabel('aAzZ')).to.equal('61417a5a');
    });

    it("_matchLabelSuffix with empty label suffix", () => {
      const hexLabel = '1234abcd';
      const radixNode = new RadixNode();
      radixNode.setLabelSuffix('');
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 0)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 1)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 2)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 3)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 4)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 5)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 6)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 7)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 8)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, '', 0)).to.equal(true);
    });

    it("_matchLabelSuffix with non-empty label suffix", () => {
      const hexLabel = '1234abcd';
      const radixNode = new RadixNode();
      // a shorter length
      radixNode.setLabelSuffix('ab');
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 3)).to.equal(false);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 4)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 5)).to.equal(false);

      // the same length
      radixNode.setLabelSuffix('abcd');
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 3)).to.equal(false);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 4)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 5)).to.equal(false);

      // a longer length
      radixNode.setLabelSuffix('abcd123');
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 3)).to.equal(false);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 4)).to.equal(false);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 5)).to.equal(false);
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
  });

  describe("Map APIs", () => {
    let tree;

    beforeEach(() => {
      tree = new RadixTree();
    })

    describe("_setInMap / _deleteFromMap / _hasInMap / _getFromMap / labels / stateNodes / size", () => {
      const stateNode1 = new StateNode();
      const stateNode2 = new StateNode();

      it("with non-empty label suffices", () => {
        const label1 = '0x000111aaa';
        const label2 = '0x000111bbb';

        expect(tree._getFromMap(label1)).to.equal(null);
        expect(tree._getFromMap(label2)).to.equal(null);
        expect(tree._hasInMap(label1)).to.equal(false);
        expect(tree._hasInMap(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);

        // set first node
        tree._setInMap(label1, stateNode1);

        expect(tree._getFromMap(label1)).to.equal(stateNode1);
        expect(tree._getFromMap(label2)).to.equal(null);
        expect(tree._hasInMap(label1)).to.equal(true);
        expect(tree._hasInMap(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), [label1]);
        assert.deepEqual(tree.stateNodes(), [stateNode1]);
        assert.deepEqual(tree.size(), 1);

        // set second node
        tree._setInMap(label2, stateNode2);

        expect(tree._getFromMap(label1)).to.equal(stateNode1);
        expect(tree._getFromMap(label2)).to.equal(stateNode2);
        expect(tree._hasInMap(label1)).to.equal(true);
        expect(tree._hasInMap(label2)).to.equal(true);
        assert.deepEqual(tree.labels(), [label1, label2]);
        assert.deepEqual(tree.stateNodes(), [stateNode1, stateNode2]);
        assert.deepEqual(tree.size(), 2);

        // delete first node
        tree._deleteFromMap(label1);

        expect(tree._getFromMap(label1)).to.equal(null);
        expect(tree._getFromMap(label2)).to.equal(stateNode2);
        expect(tree._hasInMap(label1)).to.equal(false);
        expect(tree._hasInMap(label2)).to.equal(true);
        assert.deepEqual(tree.labels(), [label2]);
        assert.deepEqual(tree.stateNodes(), [stateNode2]);
        assert.deepEqual(tree.size(), 1);

        // delete second node
        tree._deleteFromMap(label2);

        expect(tree._getFromMap(label1)).to.equal(null);
        expect(tree._getFromMap(label2)).to.equal(null);
        expect(tree._hasInMap(label1)).to.equal(false);
        expect(tree._hasInMap(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);
      });
    });

    describe("_copyMapFrom", () => {
      const stateNode1 = new StateNode();
      const stateNode2 = new StateNode();

      it("copy with non-empty label suffices", () => {
        const label1 = '0x000111aaa';
        const label2 = '0x000111bbb';

        // set state nodes
        tree._setInMap(label1, stateNode1);
        tree._setInMap(label2, stateNode2);

        const newTree = new RadixTree();
        newTree._copyMapFrom(tree);
        assert.deepEqual(newTree.labels(), [label1, label2]);
        assert.deepEqual(newTree.stateNodes(), [stateNode1, stateNode2]);
        assert.deepEqual(newTree.size(), 2);
      });
    });
  });

  describe("Tree APIs", () => {
    let tree;

    beforeEach(() => {
      tree = new RadixTree();
    })

    describe("_setInTree / _deleteFromTree / _hasInTree / _getFromTree", () => {
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

      it("set with invalid state node", () => {
        const invalidStateNode = new RadixNode();
        const label = '0x000aaa';

        expect(tree._setInTree(label, invalidStateNode)).to.equal(false);
        expect(tree._setInTree(label, '')).to.equal(false);
        expect(tree._setInTree(label, true)).to.equal(false);
        expect(tree._setInTree(label, null)).to.equal(false);
        expect(tree._setInTree(label, undefined)).to.equal(false);
      });

      it("set / delete without common label prefix - without label suffices", () => {
        const label1 = '0xa';
        const label2 = '0xb';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });

        // set first node
        tree._setInTree(label1, stateNode1);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "a": {
            ".label": "0xa",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // set second node
        tree._setInTree(label2, stateNode2);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "a": {
            ".label": "0xa",
            ".proof_hash": null,
            ".radix_ph": null
          },
          "b": {
            ".label": "0xb",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete first node
        tree._deleteFromTree(label1);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "b": {
            ".label": "0xb",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete second node
        tree._deleteFromTree(label2);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });
      });

      it("set / delete without common label prefix - with label suffices", () => {
        const label1 = '0xaaa';
        const label2 = '0xbbb';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });

        // set first node
        tree._setInTree(label1, stateNode1);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "aaa": {
            ".label": "0xaaa",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // set second node
        tree._setInTree(label2, stateNode2);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "aaa": {
            ".label": "0xaaa",
            ".proof_hash": null,
            ".radix_ph": null
          },
          "bbb": {
            ".label": "0xbbb",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete first node
        tree._deleteFromTree(label1);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "bbb": {
            ".label": "0xbbb",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete second node
        tree._deleteFromTree(label2);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });
      });

      it("set / delete without common label prefix - set with substring label suffix", () => {
        const label1 = '0xaabb';
        const label2 = '0xaa';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);

        tree._setInTree(label1, stateNode1);
        tree._setInTree(label2, stateNode2);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "aa": {
            ".label": "0xaa",
            ".proof_hash": null,
            ".radix_ph": null,
            "bb": {
              ".label": "0xaabb",
              ".proof_hash": null,
              ".radix_ph": null
            }
          }
        });
      });

      it("set / delete without common label prefix - set with superstring label suffix", () => {
        const label1 = '0xaa';
        const label2 = '0xaabb';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);

        tree._setInTree(label1, stateNode1);
        tree._setInTree(label2, stateNode2);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "aa": {
            ".label": "0xaa",
            ".proof_hash": null,
            ".radix_ph": null,
            "bb": {
              ".label": "0xaabb",
              ".proof_hash": null,
              ".radix_ph": null
            }
          }
        });
      });

      it("set / delete without common label prefix - set with exact-matched label suffix", () => {
        const label = '0xaa';

        stateNode1._setLabel(label);
        stateNode2._setLabel(label + '_');  // tweak in order to distinguish

        tree._setInTree(label, stateNode1);
        tree._setInTree(label, stateNode2);

        expect(tree._hasInTree(label)).to.equal(true);
        expect(tree._getFromTree(label)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "aa": {
            ".label": "0xaa_",
            ".proof_hash": null,
            ".radix_ph": null,
          }
        });
      });

      it("set / delete without common label prefix - set / delete with children", () => {
        const label1 = '0xaaa';
        const label2 = '0xbbb';
        const label21 = '0xbbb111';
        const label22 = '0xbbb222';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);
        stateNode21._setLabel(label21);
        stateNode22._setLabel(label22);

        // set first node
        tree._setInTree(label1, stateNode1);
        // set second node
        tree._setInTree(label2, stateNode2);
        // set children
        tree._setInTree(label21, stateNode21);
        tree._setInTree(label22, stateNode22);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        expect(tree._hasInTree(label21)).to.equal(true);
        expect(tree._getFromTree(label21)).to.equal(stateNode21);
        expect(tree._hasInTree(label22)).to.equal(true);
        expect(tree._getFromTree(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "aaa": {
            ".label": "0xaaa",
            ".proof_hash": null,
            ".radix_ph": null
          },
          "bbb": {
            "111": {
              ".label": "0xbbb111",
              ".proof_hash": null,
              ".radix_ph": null
            },
            "222": {
              ".label": "0xbbb222",
              ".proof_hash": null,
              ".radix_ph": null
            },
            ".label": "0xbbb",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete first node
        tree._deleteFromTree(label1);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        expect(tree._hasInTree(label21)).to.equal(true);
        expect(tree._getFromTree(label21)).to.equal(stateNode21);
        expect(tree._hasInTree(label22)).to.equal(true);
        expect(tree._getFromTree(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "bbb": {
            "111": {
              ".label": "0xbbb111",
              ".proof_hash": null,
              ".radix_ph": null
            },
            "222": {
              ".label": "0xbbb222",
              ".proof_hash": null,
              ".radix_ph": null
            },
            ".label": "0xbbb",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });
      });

      it("set / delete without common label prefix - delete with only one child", () => {
        const label2 = '0xbbb';
        const label21 = '0xbbb111';

        stateNode2._setLabel(label2);
        stateNode21._setLabel(label21);

        // set a node
        tree._setInTree(label2, stateNode2);
        // set a child
        tree._setInTree(label21, stateNode21);

        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        expect(tree._hasInTree(label21)).to.equal(true);
        expect(tree._getFromTree(label21)).to.equal(stateNode21);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "bbb": {
            "111": {
              ".label": "0xbbb111",
              ".proof_hash": null,
              ".radix_ph": null
            },
            ".label": "0xbbb",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete the node
        tree._deleteFromTree(label2);

        expect(tree._hasInTree(label2)).to.equal(false);
        expect(tree._hasInTree(label21)).to.equal(true);
        expect(tree._getFromTree(label21)).to.equal(stateNode21);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "bbb111": {
            ".label": "0xbbb111",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });
      });

      it("set / delete with common label prefix - without label suffices", () => {
        const label1 = '0x000a';
        const label2 = '0x000b';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });

        // set first node
        tree._setInTree(label1, stateNode1);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000a": {
            ".label": "0x000a",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // set second node
        tree._setInTree(label2, stateNode2);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000": {
            ".radix_ph": null,
            "a": {
              ".label": "0x000a",
              ".proof_hash": null,
              ".radix_ph": null
            },
            "b": {
              ".label": "0x000b",
              ".proof_hash": null,
              ".radix_ph": null
            }
          }
        });

        // delete first node
        tree._deleteFromTree(label1);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000b": {
            ".label": "0x000b",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete second node
        tree._deleteFromTree(label2);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });
      });

      it("set / delete with common label prefix - with label suffices", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });

        // set first node
        tree._setInTree(label1, stateNode1);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000aaa": {
            ".label": "0x000aaa",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // set second node
        tree._setInTree(label2, stateNode2);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000": {
            ".radix_ph": null,
            "aaa": {
              ".label": "0x000aaa",
              ".proof_hash": null,
              ".radix_ph": null
            },
            "bbb": {
              ".label": "0x000bbb",
              ".proof_hash": null,
              ".radix_ph": null
            }
          }
        });

        // delete first node
        tree._deleteFromTree(label1);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000bbb": {
            ".label": "0x000bbb",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete second node
        tree._deleteFromTree(label2);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });
      });

      it("set / delete with common label prefix - set on an internal node", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';
        const labelInternal = '0x000';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);
        stateNodeInternal._setLabel(labelInternal);

        // add terminal nodes
        tree._setInTree(label1, stateNode1);
        tree._setInTree(label2, stateNode2);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000": {
            ".radix_ph": null,
            "aaa": {
              ".label": "0x000aaa",
              ".proof_hash": null,
              ".radix_ph": null
            },
            "bbb": {
              ".label": "0x000bbb",
              ".proof_hash": null,
              ".radix_ph": null
            }
          }
        });

        // set on the internal node
        tree._setInTree(labelInternal, stateNodeInternal);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        expect(tree._hasInTree(labelInternal)).to.equal(true);
        expect(tree._getFromTree(labelInternal)).to.equal(stateNodeInternal);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000": {
            ".label": "0x000",
            ".proof_hash": null,
            ".radix_ph": null,
            "aaa": {
              ".label": "0x000aaa",
              ".proof_hash": null,
              ".radix_ph": null
            },
            "bbb": {
              ".label": "0x000bbb",
              ".proof_hash": null,
              ".radix_ph": null
            }
          }
        });
      });

      it("set / delete with common label prefix - set with substring label suffix", () => {
        const label1 = '0x000aabb';
        const label2 = '0x000aa';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);

        tree._setInTree(label1, stateNode1);
        tree._setInTree(label2, stateNode2);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000aa": {
            ".label": "0x000aa",
            ".proof_hash": null,
            ".radix_ph": null,
            "bb": {
              ".label": "0x000aabb",
              ".proof_hash": null,
              ".radix_ph": null
            }
          }
        });
      });

      it("set / delete with common label prefix - set with superstring label suffix", () => {
        const label1 = '0x000aa';
        const label2 = '0x000aabb';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);

        tree._setInTree(label1, stateNode1);
        tree._setInTree(label2, stateNode2);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000aa": {
            ".label": "0x000aa",
            ".proof_hash": null,
            ".radix_ph": null,
            "bb": {
              ".label": "0x000aabb",
              ".proof_hash": null,
              ".radix_ph": null
            }
          }
        });
      });

      it("set / delete with common label prefix - set with exact-matched label suffix", () => {
        const label = '0x000aa';

        stateNode1._setLabel(label);
        stateNode2._setLabel(label + '_');  // tweak in order to distinguish

        tree._setInTree(label, stateNode1);
        tree._setInTree(label, stateNode2);

        expect(tree._hasInTree(label)).to.equal(true);
        expect(tree._getFromTree(label)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000aa": {
            ".label": "0x000aa_",
            ".proof_hash": null,
            ".radix_ph": null,
          }
        });
      });

      it("set / delete with common label prefix - set / delete with children", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);
        stateNode21._setLabel(label21);
        stateNode22._setLabel(label22);

        // set first node
        tree._setInTree(label1, stateNode1);
        // set second node
        tree._setInTree(label2, stateNode2);
        // set children
        tree._setInTree(label21, stateNode21);
        tree._setInTree(label22, stateNode22);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        expect(tree._hasInTree(label21)).to.equal(true);
        expect(tree._getFromTree(label21)).to.equal(stateNode21);
        expect(tree._hasInTree(label22)).to.equal(true);
        expect(tree._getFromTree(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000": {
            ".radix_ph": null,
            "aaa": {
              ".label": "0x000aaa",
              ".proof_hash": null,
              ".radix_ph": null
            },
            "bbb": {
              "111": {
                ".label": "0x000bbb111",
                ".proof_hash": null,
                ".radix_ph": null
              },
              "222": {
                ".label": "0x000bbb222",
                ".proof_hash": null,
                ".radix_ph": null
              },
              ".label": "0x000bbb",
              ".proof_hash": null,
              ".radix_ph": null
            }
          }
        });

        // delete first node
        tree._deleteFromTree(label1);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        expect(tree._hasInTree(label21)).to.equal(true);
        expect(tree._getFromTree(label21)).to.equal(stateNode21);
        expect(tree._hasInTree(label22)).to.equal(true);
        expect(tree._getFromTree(label22)).to.equal(stateNode22);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".proof_hash": null,
              ".radix_ph": null
            },
            "222": {
              ".label": "0x000bbb222",
              ".proof_hash": null,
              ".radix_ph": null
            },
            ".label": "0x000bbb",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });
      });

      it("set / delete with common label prefix - delete with only one child", () => {
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';

        stateNode2._setLabel(label2);
        stateNode21._setLabel(label21);

        // set a node
        tree._setInTree(label2, stateNode2);
        // set a child
        tree._setInTree(label21, stateNode21);

        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        expect(tree._hasInTree(label21)).to.equal(true);
        expect(tree._getFromTree(label21)).to.equal(stateNode21);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000bbb": {
            "111": {
              ".label": "0x000bbb111",
              ".proof_hash": null,
              ".radix_ph": null
            },
            ".label": "0x000bbb",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete the node
        tree._deleteFromTree(label2);

        expect(tree._hasInTree(label2)).to.equal(false);
        expect(tree._hasInTree(label21)).to.equal(true);
        expect(tree._getFromTree(label21)).to.equal(stateNode21);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000bbb111": {
            ".label": "0x000bbb111",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });
      });
    });

    describe("_copyTreeFrom", () => {
      const stateNode1 = new StateNode();
      const stateNode2 = new StateNode();
      const stateNode21 = new StateNode();
      const stateNode22 = new StateNode();

      it("copy with children", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);
        stateNode21._setLabel(label21);
        stateNode22._setLabel(label22);

        // set state nodes
        tree._setInTree(label1, stateNode1);
        tree._setInTree(label2, stateNode2);
        tree._setInTree(label21, stateNode21);
        tree._setInTree(label22, stateNode22);

        const newTree = new RadixTree();
        newTree._copyTreeFrom(tree);
        expect(newTree._hasInTree(label1)).to.equal(true);
        expect(newTree._getFromTree(label1)).to.equal(stateNode1);
        expect(newTree._hasInTree(label2)).to.equal(true);
        expect(newTree._getFromTree(label2)).to.equal(stateNode2);
        expect(newTree._hasInTree(label21)).to.equal(true);
        expect(newTree._getFromTree(label21)).to.equal(stateNode21);
        expect(newTree._hasInTree(label22)).to.equal(true);
        expect(newTree._getFromTree(label22)).to.equal(stateNode22);
        assert.deepEqual(newTree.toJsObject(true), {
          ".radix_ph": null,
          "000": {
            ".radix_ph": null,
            "aaa": {
              ".label": "0x000aaa",
              ".proof_hash": null,
              ".radix_ph": null
            },
            "bbb": {
              "111": {
                ".label": "0x000bbb111",
                ".proof_hash": null,
                ".radix_ph": null
              },
              "222": {
                ".label": "0x000bbb222",
                ".proof_hash": null,
                ".radix_ph": null
              },
              ".label": "0x000bbb",
              ".proof_hash": null,
              ".radix_ph": null
            }
          }
        });
      });
    });
  });

  describe("Common APIs", () => {
    let tree;

    beforeEach(() => {
      tree = new RadixTree();
    })

    describe("set / deletep / has / get / labels / stateNodes / size", () => {
      const stateNode1 = new StateNode();
      const stateNode2 = new StateNode();
      const stateNode21 = new StateNode();
      const stateNode22 = new StateNode();
      const stateNodeInternal = new StateNode();

      it("set with invalid state node", () => {
        const invalidStateNode = new RadixNode();
        const label = '0x000aaa';

        expect(tree.set(label, invalidStateNode)).to.equal(false);
        expect(tree.set(label, '')).to.equal(false);
        expect(tree.set(label, true)).to.equal(false);
        expect(tree.set(label, null)).to.equal(false);
        expect(tree.set(label, undefined)).to.equal(false);
      });

      it("set / delete without common label prefix", () => {
        const label1 = '0xa';
        const label2 = '0xb';

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), [label1]);
        assert.deepEqual(tree.stateNodes(), [stateNode1]);
        assert.deepEqual(tree.size(), 1);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "a": {
            ".label": null,
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // set second node
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.labels(), [label1, label2]);
        assert.deepEqual(tree.stateNodes(), [stateNode1, stateNode2]);
        assert.deepEqual(tree.size(), 2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "a": {
            ".label": null,
            ".proof_hash": null,
            ".radix_ph": null
          },
          "b": {
            ".label": null,
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete first node
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.labels(), [label2]);
        assert.deepEqual(tree.stateNodes(), [stateNode2]);
        assert.deepEqual(tree.size(), 1);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "b": {
            ".label": null,
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete second node
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });
      });

      it("set / delete with common label prefix", () => {
        const label1 = '0x000a';
        const label2 = '0x000b';

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), [label1]);
        assert.deepEqual(tree.stateNodes(), [stateNode1]);
        assert.deepEqual(tree.size(), 1);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000a": {
            ".label": null,
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // set second node
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.labels(), [label1, label2]);
        assert.deepEqual(tree.stateNodes(), [stateNode1, stateNode2]);
        assert.deepEqual(tree.size(), 2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000": {
            ".radix_ph": null,
            "a": {
              ".label": null,
              ".proof_hash": null,
              ".radix_ph": null
            },
            "b": {
              ".label": null,
              ".proof_hash": null,
              ".radix_ph": null
            }
          }
        });

        // delete first node
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.labels(), [label2]);
        assert.deepEqual(tree.stateNodes(), [stateNode2]);
        assert.deepEqual(tree.size(), 1);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000b": {
            ".label": null,
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete second node
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });
      });

      it("set on an internal node", () => {
        const label1 = '0x000a';
        const label2 = '0x000b';
        const labelInternal = '0x000';

        // add terminal nodes
        tree.set(label1, stateNode1);
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.labels(), [label1, label2]);
        assert.deepEqual(tree.stateNodes(), [stateNode1, stateNode2]);
        assert.deepEqual(tree.size(), 2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000": {
            ".radix_ph": null,
            "a": {
              ".label": null,
              ".proof_hash": null,
              ".radix_ph": null
            },
            "b": {
              ".label": null,
              ".proof_hash": null,
              ".radix_ph": null
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
        assert.deepEqual(tree.labels(), [label1, label2, labelInternal]);
        assert.deepEqual(tree.stateNodes(), [stateNode1, stateNode2, stateNodeInternal]);
        assert.deepEqual(tree.size(), 3);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000": {
            ".label": null,
            ".proof_hash": null,
            ".radix_ph": null,
            "a": {
              ".label": null,
              ".proof_hash": null,
              ".radix_ph": null
            },
            "b": {
              ".label": null,
              ".proof_hash": null,
              ".radix_ph": null
            }
          }
        });
      });

      it("set / delete with non-empty label suffices", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), [label1]);
        assert.deepEqual(tree.stateNodes(), [stateNode1]);
        assert.deepEqual(tree.size(), 1);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000aaa": {
            ".label": null,
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // set second node
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.labels(), [label1, label2]);
        assert.deepEqual(tree.stateNodes(), [stateNode1, stateNode2]);
        assert.deepEqual(tree.size(), 2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000": {
            ".radix_ph": null,
            "aaa": {
              ".label": null,
              ".proof_hash": null,
              ".radix_ph": null
            },
            "bbb": {
              ".label": null,
              ".proof_hash": null,
              ".radix_ph": null
            }
          }
        });

        // delete first node
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.labels(), [label2]);
        assert.deepEqual(tree.stateNodes(), [stateNode2]);
        assert.deepEqual(tree.size(), 1);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000bbb": {
            ".label": null,
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete second node
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });
      });

      it("set / delete with children", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

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
        assert.deepEqual(tree.labels(), [label1, label2, label21, label22]);
        assert.deepEqual(tree.stateNodes(), [stateNode1, stateNode2, stateNode21, stateNode22]);
        assert.deepEqual(tree.size(), 4);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000": {
            ".radix_ph": null,
            "aaa": {
              ".label": null,
              ".proof_hash": null,
              ".radix_ph": null
            },
            "bbb": {
              "111": {
                ".label": null,
                ".proof_hash": null,
                ".radix_ph": null
              },
              "222": {
                ".label": null,
                ".proof_hash": null,
                ".radix_ph": null
              },
              ".label": null,
              ".proof_hash": null,
              ".radix_ph": null
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
        assert.deepEqual(tree.labels(), [label2, label21, label22]);
        assert.deepEqual(tree.stateNodes(), [stateNode2, stateNode21, stateNode22]);
        assert.deepEqual(tree.size(), 3);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000bbb": {
            "111": {
              ".label": null,
              ".proof_hash": null,
              ".radix_ph": null
            },
            "222": {
              ".label": null,
              ".proof_hash": null,
              ".radix_ph": null
            },
            ".label": null,
            ".proof_hash": null,
            ".radix_ph": null
          }
        });
      });

      it("delete with only one child", () => {
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';

        // set a node
        tree.set(label2, stateNode2);
        // set a child
        tree.set(label21, stateNode21);

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        assert.deepEqual(tree.labels(), [label2, label21]);
        assert.deepEqual(tree.stateNodes(), [stateNode2, stateNode21]);
        assert.deepEqual(tree.size(), 2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000bbb": {
            "111": {
              ".label": null,
              ".proof_hash": null,
              ".radix_ph": null
            },
            ".label": null,
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete the node
        tree.delete(label2);

        expect(tree.has(label2)).to.equal(false);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        assert.deepEqual(tree.labels(), [label21]);
        assert.deepEqual(tree.stateNodes(), [stateNode21]);
        assert.deepEqual(tree.size(), 1);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000bbb111": {
            ".label": null,
            ".proof_hash": null,
            ".radix_ph": null
          }
        });
      });

      it("get / has / set / update / verify proof hash", () => {
        const label1 = '0x000aaa';
        const stateNode1 = new StateNode();
        const stateNodePH1 = 'childStateNodePH1';
        stateNode1.setProofHash(stateNodePH1);

        const label11 = '0x000aaa111';
        const stateNodePH11 = 'childStateNodePH11';
        const stateNode11 = new StateNode();
        stateNode11.setProofHash(stateNodePH11);

        const label12 = '0x000aaa212';
        const stateNodePH12 = 'childStateNodePH12';
        const stateNode12 = new StateNode();
        stateNode12.setProofHash(stateNodePH12);

        const label21 = '0x000bbb121';
        const stateNodePH21 = 'childStateNodePH21';
        const stateNode21 = new StateNode();
        stateNode21.setProofHash(stateNodePH21);

        const label22 = '0x000bbb222';
        const stateNodePH22 = 'childStateNodePH22';
        const stateNode22 = new StateNode();
        stateNode22.setProofHash(stateNodePH22);

        const label3 = '0x111ccc';
        const stateNode3 = new StateNode();
        const stateNodePH3 = 'childStateNodePH3';
        stateNode3.setProofHash(stateNodePH3);

        tree.set(label1, stateNode1);
        tree.set(label11, stateNode11);
        tree.set(label12, stateNode12);
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);
        tree.set(label3, stateNode3);

        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000": {
            ".radix_ph": null,
            "aaa": {
              "111": {
                ".label": null,
                ".proof_hash": "childStateNodePH11",
                ".radix_ph": null
              },
              "212": {
                ".label": null,
                ".proof_hash": "childStateNodePH12",
                ".radix_ph": null
              },
              ".label": null,
              ".proof_hash": "childStateNodePH1",
              ".radix_ph": null
            },
            "bbb": {
              "121": {
                ".label": null,
                ".proof_hash": "childStateNodePH21",
                ".radix_ph": null
              },
              "222": {
                ".label": null,
                ".proof_hash": "childStateNodePH22",
                ".radix_ph": null
              },
              ".radix_ph": null
            }
          },
          "111ccc": {
            ".label": null,
            ".proof_hash": "childStateNodePH3",
            ".radix_ph": null
          }
        });

        // initial status
        expect(tree.getRootProofHash()).to.equal(null);
        expect(tree.verifyProofHashForRadixTree()).to.equal(false);

        // set
        expect(tree.updateProofHashForRadixTree()).to.equal(9);
        expect(tree.getRootProofHash()).to.equal(
            '0xbc310c6c1b9d339951756d3c0f90bb25e70be0c0a261e04564917ce6c57016d5');
        expect(tree.verifyProofHashForRadixTree()).to.equal(true);

        // change of a state node's proof hash
        stateNode21.setProofHash('another PH');
        expect(tree.verifyProofHashForRadixTree()).to.equal(false);

        // update
        expect(tree.updateProofHashForRadixPath(label21)).to.equal(4);
        expect(tree.getRootProofHash()).to.equal(
            '0x20520d0c668099565300affd3c4b288fb59dc37b9fbf31702e99a37b564d12d5');
        expect(tree.verifyProofHashForRadixTree()).to.equal(true);
      });

      it("getProofOfState", () => {
        const label1 = '0x000aaa';
        const stateNode1 = new StateNode();
        const stateNodePH1 = 'childStateNodePH1';
        stateNode1.setProofHash(stateNodePH1);

        const label11 = '0x000aaa111';
        const stateNodePH11 = 'childStateNodePH11';
        const stateNode11 = new StateNode();
        stateNode11.setProofHash(stateNodePH11);

        const label12 = '0x000aaa212';
        const stateNodePH12 = 'childStateNodePH12';
        const stateNode12 = new StateNode();
        stateNode12.setProofHash(stateNodePH12);

        const label21 = '0x000bbb121';
        const stateNodePH21 = 'childStateNodePH21';
        const stateNode21 = new StateNode();
        stateNode21.setProofHash(stateNodePH21);

        const label22 = '0x000bbb222';
        const stateNodePH22 = 'childStateNodePH22';
        const stateNode22 = new StateNode();
        stateNode22.setProofHash(stateNodePH22);

        tree.set(label1, stateNode1);
        tree.set(label11, stateNode11);
        tree.set(label12, stateNode12);
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);

        expect(tree.updateProofHashForRadixTree()).to.equal(8);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": "0x890e6c975c63529362955c359c0b7552bf1f88c4945f12a18458f8acafb17b25",
          "000": {
            ".radix_ph": "0x7de885f5d5ecdd9e059584874ae468ba9d1ecdebb3c320fa02e6a2ac58413386",
            "aaa": {
              "111": {
                ".label": null,
                ".proof_hash": "childStateNodePH11",
                ".radix_ph": "0x9fb9b2e6c1dc7fed76964029cb13fb1cdc115dc0a9cef54fe052533ab992a58c"
              },
              "212": {
                ".label": null,
                ".proof_hash": "childStateNodePH12",
                ".radix_ph": "0xbde6ad92fee46f223375703e8376c3c8d75989d3b9867520442e63e0836ff596"
              },
              ".label": null,
              ".proof_hash": "childStateNodePH1",
              ".radix_ph": "0x47f652dd768456603c8bb25c5ab7157d43e3edafc51837038f42a6026bf6bb44"
            },
            "bbb": {
              "121": {
                ".label": null,
                ".proof_hash": "childStateNodePH21",
                ".radix_ph": "0x68971271b6018c8827230bb696d7d2661ebb286f95851e72da889e1af6b22721"
              },
              "222": {
                ".label": null,
                ".proof_hash": "childStateNodePH22",
                ".radix_ph": "0xba9d1dcddd02911d1d260f8acd4e3857174d98a57e6b3c7e0577c8a07056b057"
              },
              ".radix_ph": "0x35286cd28c53fbe623eed76d4c09246645451b92cdded41ce9952436dc4656c3"
            }
          }
        });

        // on an internal radix node
        assert.deepEqual(tree.getProofOfState(label1, 'state_proof1'), {
          ".radix_ph": "0x890e6c975c63529362955c359c0b7552bf1f88c4945f12a18458f8acafb17b25",
          "000": {
            ".radix_ph": "0x7de885f5d5ecdd9e059584874ae468ba9d1ecdebb3c320fa02e6a2ac58413386",
            "aaa": {
              ".label": "0x000aaa",
              ".proof_hash": "state_proof1",
              ".radix_ph": "0x47f652dd768456603c8bb25c5ab7157d43e3edafc51837038f42a6026bf6bb44"
            },
            "bbb": {
              ".radix_ph": "0x35286cd28c53fbe623eed76d4c09246645451b92cdded41ce9952436dc4656c3"
            }
          }
        });

        // on a terminal radix node
        assert.deepEqual(tree.getProofOfState(label22, 'state_proof22'), {
          ".radix_ph": "0x890e6c975c63529362955c359c0b7552bf1f88c4945f12a18458f8acafb17b25",
          "000": {
            ".radix_ph": "0x7de885f5d5ecdd9e059584874ae468ba9d1ecdebb3c320fa02e6a2ac58413386",
            "aaa": {
              ".radix_ph": "0x47f652dd768456603c8bb25c5ab7157d43e3edafc51837038f42a6026bf6bb44"
            },
            "bbb": {
              ".radix_ph": "0x35286cd28c53fbe623eed76d4c09246645451b92cdded41ce9952436dc4656c3",
              "121": {
                ".radix_ph": "0x68971271b6018c8827230bb696d7d2661ebb286f95851e72da889e1af6b22721"
              },
              "222": {
                ".label": "0x000bbb222",
                ".proof_hash": "state_proof22",
                ".radix_ph": "0xba9d1dcddd02911d1d260f8acd4e3857174d98a57e6b3c7e0577c8a07056b057"
              }
            }
          }
        });
      });
    });

    describe("copyFrom", () => {
      const stateNode1 = new StateNode();
      const stateNode2 = new StateNode();
      const stateNode21 = new StateNode();
      const stateNode22 = new StateNode();

      it("copy with children", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

        // set state nodes
        tree.set(label1, stateNode1);
        tree.set(label2, stateNode2);
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);

        const newTree = new RadixTree();
        newTree.copyFrom(tree);

        expect(newTree.has(label1)).to.equal(true);
        expect(newTree.get(label1)).to.equal(stateNode1);
        expect(newTree.has(label2)).to.equal(true);
        expect(newTree.get(label2)).to.equal(stateNode2);
        expect(newTree.has(label21)).to.equal(true);
        expect(newTree.get(label21)).to.equal(stateNode21);
        expect(newTree.has(label22)).to.equal(true);
        expect(newTree.get(label22)).to.equal(stateNode22);
        assert.deepEqual(newTree.labels(), [label1, label2, label21, label22]);
        assert.deepEqual(newTree.stateNodes(), [stateNode1, stateNode2, stateNode21, stateNode22]);
        assert.deepEqual(newTree.size(), 4);
        assert.deepEqual(newTree.toJsObject(true), {
          ".radix_ph": null,
          "000": {
            ".radix_ph": null,
            "aaa": {
              ".label": null,
              ".proof_hash": null,
              ".radix_ph": null
            },
            "bbb": {
              "111": {
                ".label": null,
                ".proof_hash": null,
                ".radix_ph": null
              },
              "222": {
                ".label": null,
                ".proof_hash": null,
                ".radix_ph": null
              },
              ".label": null,
              ".proof_hash": null,
              ".radix_ph": null
            }
          }
        });
      });
    });
  });
});
