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
    });
  });
});
