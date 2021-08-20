const RadixTree = require('../db/radix-tree');
const RadixNode = require('../db/radix-node');
const StateNode = require('../db/state-node');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("radix-tree", () => {
  describe("Static utils", () => {
    it("_toHexLabel", () => {
      expect(RadixTree._toHexLabel('0x1234567890abcdef')).to.equal('1234567890abcdef');
      expect(RadixTree._toHexLabel('aAzZ')).to.equal('61417a5a');
    });

    it("_matchLabelSuffix with empty label suffix", () => {
      const hexLabel = '1234567890abcdef';
      const radixNode = new RadixNode();
      radixNode.setLabelSuffix('');
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 0)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 9)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 10)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 11)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, '', 0)).to.equal(true);
    });

    it("_matchLabelSuffix with non-empty label suffix", () => {
      const hexLabel = '1234567890abcdef';
      const radixNode = new RadixNode();
      // a shorter length
      radixNode.setLabelSuffix('abc');
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 9)).to.equal(false);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 10)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 11)).to.equal(false);

      // the same length
      radixNode.setLabelSuffix('abcdef');
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 9)).to.equal(false);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 10)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 11)).to.equal(false);

      // a longer length
      radixNode.setLabelSuffix('abcdef123');
      expect(RadixTree._matchLabelSuffix(radixNode, hexLabel, 10)).to.equal(false);
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
  });

  describe("Tree APIs", () => {
    let tree;

    beforeEach(() => {
      tree = new RadixTree();
    })

    describe("_setInTree / _deleteFromTree / _hasInTree / _getFromTree", () => {
      const stateNode1 = new StateNode();
      const stateNode2 = new StateNode();
      const stateNode21 = new StateNode();
      const stateNode22 = new StateNode();

      it("set with invalid state node", () => {
        const invalidStateNode = new RadixNode();
        const label = '0x000aaa';

        expect(tree._setInTree(label, invalidStateNode)).to.equal(false);
        expect(tree._setInTree(label, '')).to.equal(false);
        expect(tree._setInTree(label, true)).to.equal(false);
        expect(tree._setInTree(label, null)).to.equal(false);
        expect(tree._setInTree(label, undefined)).to.equal(false);
      });

      it("set / delete without common label prefix", () => {
        const label1 = '0xa';
        const label2 = '0xb';

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(), {});

        // set first node
        tree._setInTree(label1, stateNode1);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(), {
          "a:": {
            "->": true
          },
        });

        // set second node
        tree._setInTree(label2, stateNode2);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(), {
          "a:": {
            "->": true
          },
          "b:": {
            "->": true
          }
        });

        // delete first node
        tree._deleteFromTree(label1);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(), {
          "b:": {
            "->": true
          }
        });

        // delete second node
        tree._deleteFromTree(label2);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(), {});
      });

      it("set / delete with common label prefix", () => {
        const label1 = '0x000a';
        const label2 = '0x000b';

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(), {});

        // set first node
        tree._setInTree(label1, stateNode1);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(), {
          "0:00a": {
            "->": true
          }
        });

        // set second node
        tree._setInTree(label2, stateNode2);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(), {
          "0:00": {
            "->": false,
            "a:": {
              "->": true
            },
            "b:": {
              "->": true
            }
          }
        });

        // delete first node
        tree._deleteFromTree(label1);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(), {
          "0:00b": {
            "->": true
          }
        });

        // delete second node
        tree._deleteFromTree(label2);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(), {});
      });

      it("set / delete with non-empty label suffices", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(), {});

        // set first node
        tree._setInTree(label1, stateNode1);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(), {
          "0:00aaa": {
            "->": true
          }
        });

        // set second node
        tree._setInTree(label2, stateNode2);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(stateNode1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(), {
          "0:00": {
            "->": false,
            "a:aa": {
              "->": true
            },
            "b:bb": {
              "->": true
            }
          }
        });

        // delete first node
        tree._deleteFromTree(label1);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        assert.deepEqual(tree.toJsObject(), {
          "0:00bbb": {
            "->": true
          }
        });

        // delete second node
        tree._deleteFromTree(label2);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
        assert.deepEqual(tree.toJsObject(), {});
      });

      it("set / delete with children", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

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
        assert.deepEqual(tree.toJsObject(), {
          "0:00": {
            "->": false,
            "a:aa": {
              "->": true
            },
            "b:bb": {
              "->": true,
              "1:11": {
                "->": true
              },
              "2:22": {
                "->": true
              }
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
        assert.deepEqual(tree.toJsObject(), {
          "0:00bbb": {
            "->": true,
            "1:11": {
              "->": true
            },
            "2:22": {
              "->": true
            }
          }
        });
      });

      it("set / delete with only one child", () => {
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';

        // set a node
        tree._setInTree(label2, stateNode2);
        // set a child
        tree._setInTree(label21, stateNode21);

        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(stateNode2);
        expect(tree._hasInTree(label21)).to.equal(true);
        expect(tree._getFromTree(label21)).to.equal(stateNode21);
        assert.deepEqual(tree.toJsObject(), {
          "0:00bbb": {
            "->": true,
            "1:11": {
              "->": true
            }
          }
        });

        // delete the node
        tree._deleteFromTree(label2);

        expect(tree._hasInTree(label2)).to.equal(false);
        expect(tree._hasInTree(label21)).to.equal(true);
        expect(tree._getFromTree(label21)).to.equal(stateNode21);
        assert.deepEqual(tree.toJsObject(), {
          "0:00bbb111": {
            "->": true
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
        assert.deepEqual(tree.toJsObject(), {});

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), [label1]);
        assert.deepEqual(tree.stateNodes(), [stateNode1]);
        assert.deepEqual(tree.size(), 1);
        assert.deepEqual(tree.toJsObject(), {
          "a:": {
            "->": true
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
        assert.deepEqual(tree.toJsObject(), {
          "a:": {
            "->": true
          },
          "b:": {
            "->": true
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
        assert.deepEqual(tree.toJsObject(), {
          "b:": {
            "->": true
          }
        });

        // delete second node
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);
        assert.deepEqual(tree.toJsObject(), {});
      });

      it("set / delete with common label prefix", () => {
        const label1 = '0x000a';
        const label2 = '0x000b';

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);
        assert.deepEqual(tree.toJsObject(), {});

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), [label1]);
        assert.deepEqual(tree.stateNodes(), [stateNode1]);
        assert.deepEqual(tree.size(), 1);
        assert.deepEqual(tree.toJsObject(), {
          "0:00a": {
            "->": true
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
        assert.deepEqual(tree.toJsObject(), {
          "0:00": {
            "->": false,
            "a:": {
              "->": true
            },
            "b:": {
              "->": true
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
        assert.deepEqual(tree.toJsObject(), {
          "0:00b": {
            "->": true
          }
        });

        // delete second node
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);
        assert.deepEqual(tree.toJsObject(), {});
      });

      it("set / delete with non-empty label suffices", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);
        assert.deepEqual(tree.toJsObject(), {});

        // set first node
        tree.set(label1, stateNode1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(stateNode1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), [label1]);
        assert.deepEqual(tree.stateNodes(), [stateNode1]);
        assert.deepEqual(tree.size(), 1);
        assert.deepEqual(tree.toJsObject(), {
          "0:00aaa": {
            "->": true
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
        assert.deepEqual(tree.toJsObject(), {
          "0:00": {
            "->": false,
            "a:aa": {
              "->": true
            },
            "b:bb": {
              "->": true
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
        assert.deepEqual(tree.toJsObject(), {
          "0:00bbb": {
            "->": true
          }
        });

        // delete second node
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);
        assert.deepEqual(tree.toJsObject(), {});
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
        assert.deepEqual(tree.toJsObject(), {
          "0:00": {
            "->": false,
            "a:aa": {
              "->": true,
            },
            "b:bb": {
              "->": true,
              "1:11": {
                "->": true
              },
              "2:22": {
                "->": true
              }
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
        assert.deepEqual(tree.toJsObject(), {
          "0:00bbb": {
            "->": true,
            "1:11": {
              "->": true
            },
            "2:22": {
              "->": true
            }
          }
        });
      });

      it("set / delete with only one child", () => {
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
        assert.deepEqual(tree.toJsObject(), {
          "0:00bbb": {
            "->": true,
            "1:11": {
              "->": true
            }
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
        assert.deepEqual(tree.toJsObject(), {
          "0:00bbb111": {
            "->": true
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

        assert.deepEqual(tree.toJsObject(), {
          "0:00": {
            "->": false,
            "a:aa": {
              "->": true,
              "1:11": {
                "->": true
              },
              "2:12": {
                "->": true
              }
            },
            "b:bb": {
              "->": false,
              "1:21": {
                "->": true
              },
              "2:22": {
                "->": true
              }
            }
          },
          "1:11ccc": {
            "->": true
          }
        });

        // initial status
        expect(tree.hasRootProofHash()).to.equal(false);
        expect(tree.getRootProofHash()).to.equal(null);
        expect(tree.verifyProofHashForRadixTree()).to.equal(false);

        // set
        expect(tree.setProofHashForRadixTree()).to.equal(9);
        expect(tree.hasRootProofHash()).to.equal(true);
        expect(tree.getRootProofHash()).to.equal(
            '0xbc310c6c1b9d339951756d3c0f90bb25e70be0c0a261e04564917ce6c57016d5');
        expect(tree.verifyProofHashForRadixTree()).to.equal(true);

        // change of a state node's proof hash
        stateNode21.setProofHash('another PH');
        expect(tree.verifyProofHashForRadixTree()).to.equal(false);

        // update
        expect(tree.updateProofHashForRootPath(label21)).to.equal(4);
        expect(tree.getRootProofHash()).to.equal(
            '0x20520d0c668099565300affd3c4b288fb59dc37b9fbf31702e99a37b564d12d5');
        expect(tree.verifyProofHashForRadixTree()).to.equal(true);
      });
    });
  });
});
