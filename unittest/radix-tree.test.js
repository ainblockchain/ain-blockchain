const RadixTree = require('../db/radix-tree');
const RadixNode = require('../db/radix-node');
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
      const node = new RadixNode();
      node.setLabelSuffix('');
      expect(RadixTree._matchLabelSuffix(node, hexLabel, 0)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(node, hexLabel, 9)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(node, hexLabel, 10)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(node, hexLabel, 11)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(node, '', 0)).to.equal(true);
    });

    it("_matchLabelSuffix with non-empty label suffix", () => {
      const hexLabel = '1234567890abcdef';
      const node = new RadixNode();
      // a shorter length
      node.setLabelSuffix('abc');
      expect(RadixTree._matchLabelSuffix(node, hexLabel, 9)).to.equal(false);
      expect(RadixTree._matchLabelSuffix(node, hexLabel, 10)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(node, hexLabel, 11)).to.equal(false);

      // the same length
      node.setLabelSuffix('abcdef');
      expect(RadixTree._matchLabelSuffix(node, hexLabel, 9)).to.equal(false);
      expect(RadixTree._matchLabelSuffix(node, hexLabel, 10)).to.equal(true);
      expect(RadixTree._matchLabelSuffix(node, hexLabel, 11)).to.equal(false);

      // a longer length
      node.setLabelSuffix('abcdef123');
      expect(RadixTree._matchLabelSuffix(node, hexLabel, 10)).to.equal(false);
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
      const child1 = new RadixNode();
      const child2 = new RadixNode();

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

        // set first child
        tree._setInMap(label1, child1);

        expect(tree._getFromMap(label1)).to.equal(child1);
        expect(tree._getFromMap(label2)).to.equal(null);
        expect(tree._hasInMap(label1)).to.equal(true);
        expect(tree._hasInMap(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), [label1]);
        assert.deepEqual(tree.stateNodes(), [child1]);
        assert.deepEqual(tree.size(), 1);

        // set second child
        tree._setInMap(label2, child2);

        expect(tree._getFromMap(label1)).to.equal(child1);
        expect(tree._getFromMap(label2)).to.equal(child2);
        expect(tree._hasInMap(label1)).to.equal(true);
        expect(tree._hasInMap(label2)).to.equal(true);
        assert.deepEqual(tree.labels(), [label1, label2]);
        assert.deepEqual(tree.stateNodes(), [child1, child2]);
        assert.deepEqual(tree.size(), 2);

        // delete first child
        tree._deleteFromMap(label1);

        expect(tree._getFromMap(label1)).to.equal(null);
        expect(tree._getFromMap(label2)).to.equal(child2);
        expect(tree._hasInMap(label1)).to.equal(false);
        expect(tree._hasInMap(label2)).to.equal(true);
        assert.deepEqual(tree.labels(), [label2]);
        assert.deepEqual(tree.stateNodes(), [child2]);
        assert.deepEqual(tree.size(), 1);

        // delete second child
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
      const child1 = new RadixNode();
      const child2 = new RadixNode();
      const child21 = new RadixNode();
      const child22 = new RadixNode();

      it("set / delete without common label prefix", () => {
        const label1 = '0xa';
        const label2 = '0xb';

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);

        // set first child
        tree._setInTree(label1, child1);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(child1);
        expect(tree._hasInTree(label2)).to.equal(false);

        // set second child
        tree._setInTree(label2, child2);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(child1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(child2);

        // delete first child
        tree._deleteFromTree(label1);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(child2);

        // delete second child
        tree._deleteFromTree(label2);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
      });

      it("set / delete with common label prefix", () => {
        const label1 = '0x000a';
        const label2 = '0x000b';

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);

        // set first child
        tree._setInTree(label1, child1);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(child1);
        expect(tree._hasInTree(label2)).to.equal(false);

        // set second child
        tree._setInTree(label2, child2);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(child1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(child2);

        // delete first child
        tree._deleteFromTree(label1);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(child2);

        // delete second child
        tree._deleteFromTree(label2);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
      });

      it("set / delete with non-empty label suffices", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);

        // set first child
        tree._setInTree(label1, child1);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(child1);
        expect(tree._hasInTree(label2)).to.equal(false);

        // set second child
        tree._setInTree(label2, child2);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(child1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(child2);

        // delete first child
        tree._deleteFromTree(label1);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(child2);

        // delete second child
        tree._deleteFromTree(label2);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(false);
      });

      it("set / delete with grand children", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

        // set first child
        tree._setInTree(label1, child1);
        // set second child
        tree._setInTree(label2, child2);
        // set grand children
        tree._setInTree(label21, child21);
        tree._setInTree(label22, child22);

        expect(tree._hasInTree(label1)).to.equal(true);
        expect(tree._getFromTree(label1)).to.equal(child1);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(child2);
        expect(tree._hasInTree(label21)).to.equal(true);
        expect(tree._getFromTree(label21)).to.equal(child21);
        expect(tree._hasInTree(label22)).to.equal(true);
        expect(tree._getFromTree(label22)).to.equal(child22);

        // delete first child
        tree._deleteFromTree(label1);

        expect(tree._hasInTree(label1)).to.equal(false);
        expect(tree._hasInTree(label2)).to.equal(true);
        expect(tree._getFromTree(label2)).to.equal(child2);
        expect(tree._hasInTree(label21)).to.equal(true);
        expect(tree._getFromTree(label21)).to.equal(child21);
        expect(tree._hasInTree(label22)).to.equal(true);
        expect(tree._getFromTree(label22)).to.equal(child22);
      });
    });
  });

  describe("Common APIs", () => {
    let tree;

    beforeEach(() => {
      tree = new RadixTree();
    })

    describe("set / deletep / has / get / labels / stateNodes / size", () => {
      const child1 = new RadixNode();
      const child2 = new RadixNode();
      const child21 = new RadixNode();
      const child22 = new RadixNode();

      it("set / delete without common label prefix", () => {
        const label1 = '0xa';
        const label2 = '0xb';

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);

        // set first child
        tree.set(label1, child1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(child1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), [label1]);
        assert.deepEqual(tree.stateNodes(), [child1]);
        assert.deepEqual(tree.size(), 1);

        // set second child
        tree.set(label2, child2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(child1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(child2);
        assert.deepEqual(tree.labels(), [label1, label2]);
        assert.deepEqual(tree.stateNodes(), [child1, child2]);
        assert.deepEqual(tree.size(), 2);

        // delete first child
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(child2);
        assert.deepEqual(tree.labels(), [label2]);
        assert.deepEqual(tree.stateNodes(), [child2]);
        assert.deepEqual(tree.size(), 1);

        // delete second child
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);
      });

      it("set / delete with common label prefix", () => {
        const label1 = '0x000a';
        const label2 = '0x000b';

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);

        // set first child
        tree.set(label1, child1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(child1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), [label1]);
        assert.deepEqual(tree.stateNodes(), [child1]);
        assert.deepEqual(tree.size(), 1);

        // set second child
        tree.set(label2, child2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(child1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(child2);
        assert.deepEqual(tree.labels(), [label1, label2]);
        assert.deepEqual(tree.stateNodes(), [child1, child2]);
        assert.deepEqual(tree.size(), 2);

        // delete first child
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(child2);
        assert.deepEqual(tree.labels(), [label2]);
        assert.deepEqual(tree.stateNodes(), [child2]);
        assert.deepEqual(tree.size(), 1);

        // delete second child
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);
      });

      it("set / delete with non-empty label suffices", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);

        // set first child
        tree.set(label1, child1);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(child1);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), [label1]);
        assert.deepEqual(tree.stateNodes(), [child1]);
        assert.deepEqual(tree.size(), 1);

        // set second child
        tree.set(label2, child2);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(child1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(child2);
        assert.deepEqual(tree.labels(), [label1, label2]);
        assert.deepEqual(tree.stateNodes(), [child1, child2]);
        assert.deepEqual(tree.size(), 2);

        // delete first child
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(child2);
        assert.deepEqual(tree.labels(), [label2]);
        assert.deepEqual(tree.stateNodes(), [child2]);
        assert.deepEqual(tree.size(), 1);

        // delete second child
        tree.delete(label2);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(false);
        assert.deepEqual(tree.labels(), []);
        assert.deepEqual(tree.stateNodes(), []);
        assert.deepEqual(tree.size(), 0);
      });

      it("set / delete with grand children", () => {
        const label1 = '0x000aaa';
        const label2 = '0x000bbb';
        const label21 = '0x000bbb111';
        const label22 = '0x000bbb222';

        // set first child
        tree.set(label1, child1);
        // set second child
        tree.set(label2, child2);
        // set grand children
        tree.set(label21, child21);
        tree.set(label22, child22);

        expect(tree.has(label1)).to.equal(true);
        expect(tree.get(label1)).to.equal(child1);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(child2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(child21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(child22);
        assert.deepEqual(tree.labels(), [label1, label2, label21, label22]);
        assert.deepEqual(tree.stateNodes(), [child1, child2, child21, child22]);
        assert.deepEqual(tree.size(), 4);

        // delete first child
        tree.delete(label1);

        expect(tree.has(label1)).to.equal(false);
        expect(tree.has(label2)).to.equal(true);
        expect(tree.get(label2)).to.equal(child2);
        expect(tree.has(label21)).to.equal(true);
        expect(tree.get(label21)).to.equal(child21);
        expect(tree.has(label22)).to.equal(true);
        expect(tree.get(label22)).to.equal(child22);
        assert.deepEqual(tree.labels(), [label2, label21, label22]);
        assert.deepEqual(tree.stateNodes(), [child2, child21, child22]);
        assert.deepEqual(tree.size(), 3);
      });
    });
  });
});
