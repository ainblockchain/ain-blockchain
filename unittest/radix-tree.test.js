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
    let tree;

    beforeEach(() => {
      tree = new RadixTree();
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

      it("set with invalid state node", () => {
        const invalidStateNode = new RadixNode();
        const label = '0x000aaa';

        expect(tree.set(label, invalidStateNode)).to.equal(false);
        expect(tree.set(label, '')).to.equal(false);
        expect(tree.set(label, true)).to.equal(false);
        expect(tree.set(label, null)).to.equal(false);
        expect(tree.set(label, undefined)).to.equal(false);
      });

      it("set / delete without common label prefix - without label suffices", () => {
        const label1 = '0xa';
        const label2 = '0xb';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "a": {
            ".label": "0xa",
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
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "b": {
            ".label": "0xb",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete second node
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });
      });

      it("set / delete without common label prefix - with label suffices", () => {
        const label1 = '0xaaa';
        const label2 = '0xbbb';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "aaa": {
            ".label": "0xaaa",
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
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "bbb": {
            ".label": "0xbbb",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete second node
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });
      });

      it("set / delete without common label prefix - set with substring label suffix", () => {
        const label1 = '0xaabb';
        const label2 = '0xaa';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);

        tree.set(label1, stateNode1);
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
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

        tree.set(label1, stateNode1);
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
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

        tree.set(label, stateNode1);
        tree.set(label, stateNode2);

        expect(tree.has(label)).to.equal(true);
        expect(tree.get(label)).to.equal(stateNode2);
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
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
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
        tree.set(label2, stateNode2);
        // set a child
        tree.set(label21, stateNode21);

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
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
        tree.delete(label2);

        expect(tree.has(label2)).to.equal(false);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
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

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000a": {
            ".label": "0x000a",
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
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000b": {
            ".label": "0x000b",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete second node
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });
      });

      it("set / delete with common label prefix - with label suffices", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000aaa": {
            ".label": "0x000aaa",
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
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000bbb": {
            ".label": "0x000bbb",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });

        // delete second node
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });
      });

      it("delete with updateProofHash = true - with common label prefix, with label suffices", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';

        stateNode1._setLabel(label1);
        stateNode2._setLabel(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null
        });

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000aaa": {
            ".label": "0x000aaa",
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
        tree.delete(label1, true);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": "0x16337f10dc7114cb5eba09c616cc2ec112e080404ac3fc1aea63111f8570d6b8",
          "000bbb": {
            ".label": "0x000bbb",
            ".proof_hash": null,
            ".radix_ph": null
          }
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
        tree.set(label1, stateNode1);
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
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
        tree.set(labelInternal, stateNodeInternal);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(labelInternal)).to.equal(true);
        expect(tree.get(labelInternal)).to.equal(stateNodeInternal);
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

        tree.set(label1, stateNode1);
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
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

        tree.set(label1, stateNode1);
        tree.set(label2, stateNode2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
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

        tree.set(label, stateNode1);
        tree.set(label, stateNode2);

        expect(tree.has(label)).to.equal(true);
        expect(tree.get(label)).to.equal(stateNode2);
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
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(stateNode22);
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
        tree.set(label2, stateNode2);
        // set a child
        tree.set(label21, stateNode21);

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
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
        tree.delete(label2);

        expect(tree.has(label2)).to.equal(false);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": null,
          "000bbb111": {
            ".label": "0x000bbb111",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });
      });

      it("delete with updateProofHash = true - with common label prefix, delete with only one child", () => {
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';

        stateNode2._setLabel(label2);
        stateNode21._setLabel(label21);

        // set a node
        tree.set(label2, stateNode2);
        // set a child
        tree.set(label21, stateNode21);

        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(stateNode2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
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
        tree.delete(label2, true);

        expect(tree.has(label2)).to.equal(false);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(stateNode21);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": "0xdf6bd65883bce47c743eb28ea70897e69be4d9b0046f21e3a2ee26114fb40bd1",
          "000bbb111": {
            ".label": "0x000bbb111",
            ".proof_hash": null,
            ".radix_ph": null
          }
        });
      });
    });

    describe("proof hash", () => {
      it("get / has / set / update / verify proof hash", () => {
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

        assert.deepEqual(tree.toJsObject(true), {
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
        expect(tree.verifyProofHashForRadixTree()).to.equal(false);

        // set
        expect(tree.updateProofHashForRadixTree()).to.equal(9);
        expect(tree.getRootProofHash()).to.equal(
            '0x3dac16e69a2dfa5ae4a448cda25da5542949b905d2bf8a07c389d77019c56c01');
        expect(tree.verifyProofHashForRadixTree()).to.equal(true);

        // change of a state node's proof hash
        stateNode21.setProofHash('another PH');
        expect(tree.verifyProofHashForRadixTree()).to.equal(false);

        // update
        expect(tree.updateProofHashForRadixPath(label21)).to.equal(4);
        expect(tree.getRootProofHash()).to.equal(
            '0x8070aef5df264e5ecea35dd84822e69f7bf65102a06f5765d62bd76265cadff5');
        expect(tree.verifyProofHashForRadixTree()).to.equal(true);
      });

      it("getProofOfState", () => {
        const label1 = '0x000aaa';
        const stateNode1 = new StateNode();
        const stateNodePH1 = 'stateNodePH1';
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

        tree.set(label1, stateNode1);
        tree.set(label11, stateNode11);
        tree.set(label12, stateNode12);
        tree.set(label21, stateNode21);
        tree.set(label22, stateNode22);

        expect(tree.updateProofHashForRadixTree()).to.equal(8);
        assert.deepEqual(tree.toJsObject(true), {
          ".radix_ph": "0x05fc6d77a0a0885714b0bfcf6c00d9349f54da13eb0e87ea90fc4d4e450f307a",
          "000": {
            ".radix_ph": "0x051bf0bbc34bc40d44d4abafe0822f209ca8d9b0cf6dc0c8ef1fcff0021d7520",
            "aaa": {
              "111": {
                ".label": null,
                ".proof_hash": "stateNodePH11",
                ".radix_ph": "0xac8e0ca829cea8d80a79260078fb8e1b38a05b6d087c72a1c92f63849a47b96b"
              },
              "212": {
                ".label": null,
                ".proof_hash": "stateNodePH12",
                ".radix_ph": "0x7fc53637a6ff6b7efa8cf7c9ba95552ed7479262ad8c07a61b4d2b1e8002d360"
              },
              ".label": null,
              ".proof_hash": "stateNodePH1",
              ".radix_ph": "0xb08357cc732df1732db4dd2ec5a12e1d9d7ab8198ef2c40f92ee8d6a6c2755d0"
            },
            "bbb": {
              "121": {
                ".label": null,
                ".proof_hash": "stateNodePH21",
                ".radix_ph": "0xa8c806fde336879bd0cb320c809ad8a1f6e1e526711ed239eb216f83e4fb19d7"
              },
              "222": {
                ".label": null,
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
      });
    });

    describe("copyFrom", () => {
      const stateNode1 = new StateNode();
      stateNode1.setProofHash('stateNodePH1');
      const stateNode2 = new StateNode();
      stateNode2.setProofHash('stateNodePH2');
      const stateNode21 = new StateNode();
      stateNode21.setProofHash('stateNodePH21');
      const stateNode22 = new StateNode();
      stateNode22.setProofHash('stateNodePH22');

      it("copy with children", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

        // set state nodes
        tree.set(label1, stateNode1);
        stateNode1._setLabel(label1);
        tree.set(label2, stateNode2);
        stateNode2._setLabel(label2);
        tree.set(label21, stateNode21);
        stateNode21._setLabel(label21);
        tree.set(label22, stateNode22);
        stateNode22._setLabel(label22);

        expect(tree.updateProofHashForRadixTree()).to.equal(6);

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
          ".radix_ph": "0x6fb64a2130ffc6c39c3c90e2e623594e7818647f93caf25d5c741ffdb6998c5f",
          "000": {
            ".radix_ph": "0x13f3860a6d7505b383ef8f966bd5e0bcaa546298616a850c7dfaf20311fc271b",
            "aaa": {
              ".label": "0x000aaa",
              ".proof_hash": "stateNodePH1",
              ".radix_ph": "0xc6b77f2d527751603d41b89bb7bac0d2a51dfdb3636b37f6d0792676bbe48795"
            },
            "bbb": {
              "111": {
                ".label": "0x000bbb111",
                ".proof_hash": "stateNodePH21",
                ".radix_ph": "0xa8c806fde336879bd0cb320c809ad8a1f6e1e526711ed239eb216f83e4fb19d7"
              },
              "222": {
                ".label": "0x000bbb222",
                ".proof_hash": "stateNodePH22",
                ".radix_ph": "0x0dd8afcb4c2839ff30e6872c7268f9ed687fd53c52ce78f0330de82d5b33a0a2"
              },
              ".label": "0x000bbb",
              ".proof_hash": "stateNodePH2",
              ".radix_ph": "0xc247352aedb1ef374ff55c219d525d882d158e32c134de5eade6e24c51d3b680"
            }
          }
        });
        assert.deepEqual(newTree.toJsObject(true), tree.toJsObject(true));
      });
    });
  });
});
