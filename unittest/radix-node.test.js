const RadixNode = require('../db/radix-node');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

const StateNode = require('../db/state-node');

describe("radix-node", () => {
  let node;

  beforeEach(() => {
    node = new RadixNode();
  })

  describe("Initialization", () => {
    it("constructor", () => {
      expect(node.stateNode).to.equal(null);
      expect(node.labelRadix).to.equal('');
      expect(node.labelSuffix).to.equal('');
      expect(node.parent).to.equal(null);
      expect(node.radixChildMap.size).to.equal(0);
    });
  });

  describe("stateNode", () => {
    it("get / set / has / reset", () => {
      const stateNode = new StateNode();
      expect(node.getStateNode()).to.equal(null);
      expect(node.hasStateNode()).to.equal(false);
      node.setStateNode(stateNode);
      expect(node.getStateNode()).to.equal(stateNode);
      expect(node.hasStateNode()).to.equal(true);
      node.resetStateNode();
      expect(node.getStateNode()).to.equal(null);
      expect(node.hasStateNode()).to.equal(false);
    });
  });

  describe("labelRadix", () => {
    it("get / set / has / reset", () => {
      const labelRadix = '0';
      expect(node.getLabelRadix()).to.equal('');
      expect(node.hasLabelRadix()).to.equal(false);
      node.setLabelRadix(labelRadix);
      expect(node.getLabelRadix()).to.equal(labelRadix);
      expect(node.hasLabelRadix()).to.equal(true);
      node.resetLabelRadix();
      expect(node.getLabelRadix()).to.equal('');
      expect(node.hasLabelRadix()).to.equal(false);
    });
  });

  describe("labelSuffix", () => {
    it("get / set / has / reset", () => {
      const labelSuffix = 'ffff';
      expect(node.getLabelSuffix()).to.equal('');
      expect(node.hasLabelSuffix()).to.equal(false);
      node.setLabelSuffix(labelSuffix);
      expect(node.getLabelSuffix()).to.equal(labelSuffix);
      expect(node.hasLabelSuffix()).to.equal(true);
      node.resetLabelSuffix();
      expect(node.getLabelSuffix()).to.equal('');
      expect(node.hasLabelSuffix()).to.equal(false);
    });
  });

  describe("parent", () => {
    it("get / set / has / reset", () => {
      const parent = new RadixNode();
      expect(node.getParent()).to.equal(null);
      expect(node.hasParent()).to.equal(false);
      node.setParent(parent);
      expect(node.getParent()).to.equal(parent);
      expect(node.hasParent()).to.equal(true);
      node.resetParent();
      expect(node.getParent()).to.equal(null);
      expect(node.hasParent()).to.equal(false);
    });
  });

  describe("child", () => {
    it("get / set / has / delete with a child", () => {
      const labelRadix = '0';
      const labelSuffix = 'ffff';
      const child = new RadixNode();

      expect(node.hasStateNode()).to.equal(false);
      expect(node.hasLabelRadix()).to.equal(false);
      expect(node.hasLabelSuffix()).to.equal(false);
      expect(node.hasParent()).to.equal(false);
      expect(node.hasChild()).to.equal(false);
      expect(node.getChild(labelRadix)).to.equal(null);
      assert.deepEqual(node.getChildLabelRadices(), []);
      assert.deepEqual(node.getChildNodes(), []);
      expect(node.numChildren()).to.equal(0);

      expect(child.hasStateNode()).to.equal(false);
      expect(child.hasLabelRadix()).to.equal(false);
      expect(child.hasLabelSuffix()).to.equal(false);
      expect(child.hasParent()).to.equal(false);
      expect(child.hasChild()).to.equal(false);
      assert.deepEqual(child.getChildLabelRadices(), []);
      assert.deepEqual(child.getChildNodes(), []);
      expect(child.numChildren()).to.equal(0);

      // setChild()
      node.setChild(labelRadix, labelSuffix, child);

      expect(node.hasStateNode()).to.equal(false);
      expect(node.hasLabelRadix()).to.equal(false);
      expect(node.hasLabelSuffix()).to.equal(false);
      expect(node.hasParent()).to.equal(false);
      expect(node.hasChild()).to.equal(true);
      expect(node.getChild(labelRadix)).to.equal(child);
      assert.deepEqual(node.getChildLabelRadices(), [labelRadix]);
      assert.deepEqual(node.getChildNodes(), [child]);
      expect(node.numChildren()).to.equal(1);

      expect(child.hasStateNode()).to.equal(false);
      expect(child.hasLabelRadix()).to.equal(true);
      expect(child.getLabelRadix()).to.equal(labelRadix);
      expect(child.hasLabelSuffix()).to.equal(true);
      expect(child.getLabelSuffix()).to.equal(labelSuffix);
      expect(child.hasParent()).to.equal(true);
      expect(child.getParent()).to.equal(node);
      expect(child.hasChild()).to.equal(false);
      assert.deepEqual(child.getChildLabelRadices(), []);
      assert.deepEqual(child.getChildNodes(), []);
      expect(child.numChildren()).to.equal(0);

      // deleteChild()
      node.deleteChild(labelRadix);

      expect(node.hasStateNode()).to.equal(false);
      expect(node.hasLabelRadix()).to.equal(false);
      expect(node.hasLabelSuffix()).to.equal(false);
      expect(node.hasParent()).to.equal(false);
      expect(node.hasChild()).to.equal(false);
      expect(node.getChild(labelRadix)).to.equal(null);
      assert.deepEqual(node.getChildLabelRadices(), []);
      assert.deepEqual(node.getChildNodes(), []);
      expect(node.numChildren()).to.equal(0);

      expect(child.hasStateNode()).to.equal(false);
      expect(child.hasLabelRadix()).to.equal(false);
      expect(child.hasLabelSuffix()).to.equal(false);
      expect(child.hasParent()).to.equal(false);
      expect(child.hasChild()).to.equal(false);
      assert.deepEqual(child.getChildLabelRadices(), []);
      assert.deepEqual(child.getChildNodes(), []);
      expect(child.numChildren()).to.equal(0);
    });

    it("get / set / has / delete with children", () => {
      const labelRadix1 = '0';
      const labelSuffix1 = '0000';
      const child1 = new RadixNode();

      const labelRadix2 = '1';
      const labelSuffix2 = '1111';
      const child2 = new RadixNode();

      // setChild() with child1
      node.setChild(labelRadix1, labelSuffix1, child1);
      expect(node.hasStateNode()).to.equal(false);
      expect(node.hasLabelRadix()).to.equal(false);
      expect(node.hasLabelSuffix()).to.equal(false);
      expect(node.hasParent()).to.equal(false);
      expect(node.hasChild()).to.equal(true);
      expect(node.getChild(labelRadix1)).to.equal(child1);
      expect(node.getChild(labelRadix2)).to.equal(null);
      assert.deepEqual(node.getChildLabelRadices(), [labelRadix1]);
      assert.deepEqual(node.getChildNodes(), [child1]);
      expect(node.numChildren()).to.equal(1);

      expect(child1.hasStateNode()).to.equal(false);
      expect(child1.hasLabelRadix()).to.equal(true);
      expect(child1.getLabelRadix()).to.equal(labelRadix1);
      expect(child1.hasLabelSuffix()).to.equal(true);
      expect(child1.getLabelSuffix()).to.equal(labelSuffix1);
      expect(child1.hasParent()).to.equal(true);
      expect(child1.getParent()).to.equal(node);
      expect(child1.hasChild()).to.equal(false);
      assert.deepEqual(child1.getChildLabelRadices(), []);
      assert.deepEqual(child1.getChildNodes(), []);
      expect(child1.numChildren()).to.equal(0);

      // setChild() with child2
      node.setChild(labelRadix2, labelSuffix2, child2);

      expect(node.hasStateNode()).to.equal(false);
      expect(node.hasLabelRadix()).to.equal(false);
      expect(node.hasLabelSuffix()).to.equal(false);
      expect(node.hasParent()).to.equal(false);
      expect(node.hasChild()).to.equal(true);
      expect(node.getChild(labelRadix1)).to.equal(child1);
      expect(node.getChild(labelRadix2)).to.equal(child2);
      assert.deepEqual(node.getChildLabelRadices(), [labelRadix1, labelRadix2]);
      assert.deepEqual(node.getChildNodes(), [child1, child2]);
      expect(node.numChildren()).to.equal(2);

      expect(child1.hasStateNode()).to.equal(false);
      expect(child1.hasLabelRadix()).to.equal(true);
      expect(child1.getLabelRadix()).to.equal(labelRadix1);
      expect(child1.hasLabelSuffix()).to.equal(true);
      expect(child1.getLabelSuffix()).to.equal(labelSuffix1);
      expect(child1.hasParent()).to.equal(true);
      expect(child1.getParent()).to.equal(node);
      expect(child1.hasChild()).to.equal(false);
      assert.deepEqual(child1.getChildLabelRadices(), []);
      assert.deepEqual(child1.getChildNodes(), []);
      expect(child1.numChildren()).to.equal(0);

      expect(child2.hasStateNode()).to.equal(false);
      expect(child2.hasLabelRadix()).to.equal(true);
      expect(child1.getLabelRadix()).to.equal(labelRadix1);
      expect(child2.hasLabelSuffix()).to.equal(true);
      expect(child1.getLabelSuffix()).to.equal(labelSuffix1);
      expect(child2.hasParent()).to.equal(true);
      expect(child2.getParent()).to.equal(node);
      expect(child2.hasChild()).to.equal(false);
      assert.deepEqual(child2.getChildLabelRadices(), []);
      assert.deepEqual(child2.getChildNodes(), []);
      expect(child2.numChildren()).to.equal(0);

      // deleteChild() with child1
      node.deleteChild(labelRadix1);

      expect(node.hasStateNode()).to.equal(false);
      expect(node.hasLabelRadix()).to.equal(false);
      expect(node.hasLabelSuffix()).to.equal(false);
      expect(node.hasParent()).to.equal(false);
      expect(node.getChild(labelRadix1)).to.equal(null);
      expect(node.getChild(labelRadix2)).to.equal(child2);
      expect(node.hasChild()).to.equal(true);
      assert.deepEqual(node.getChildLabelRadices(), [labelRadix2]);
      assert.deepEqual(node.getChildNodes(), [child2]);
      expect(node.numChildren()).to.equal(1);

      expect(child1.hasStateNode()).to.equal(false);
      expect(child1.hasLabelRadix()).to.equal(false);
      expect(child1.hasLabelSuffix()).to.equal(false);
      expect(child1.hasParent()).to.equal(false);
      expect(child1.hasChild()).to.equal(false);
      assert.deepEqual(child1.getChildLabelRadices(), []);
      assert.deepEqual(child1.getChildNodes(), []);
      expect(child1.numChildren()).to.equal(0);

      expect(child2.hasStateNode()).to.equal(false);
      expect(child2.hasLabelRadix()).to.equal(true);
      expect(child2.getLabelRadix()).to.equal(labelRadix2);
      expect(child2.hasLabelSuffix()).to.equal(true);
      expect(child2.getLabelSuffix()).to.equal(labelSuffix2);
      expect(child2.hasParent()).to.equal(true);
      expect(child2.getParent()).to.equal(node);
      expect(child2.hasChild()).to.equal(false);
      assert.deepEqual(child2.getChildLabelRadices(), []);
      assert.deepEqual(child2.getChildNodes(), []);
      expect(child2.numChildren()).to.equal(0);
    });
  });
});
