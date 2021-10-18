const RadixNode = require('../db/radix-node');
const CommonUtil = require('../common/common-util');
const StateNode = require('../db/state-node');
const {
  HASH_DELIMITER,
} = require('../common/constants');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("radix-node", () => {
  let node;

  beforeEach(() => {
    node = new RadixNode();
  });

  describe("initialization / reset", () => {
    it("construct without version", () => {
      expect(node.version).to.equal(null);
      expect(node.parentStateNode).to.equal(null);
      expect(node.childStateNode).to.equal(null);
      expect(node.labelRadix).to.equal('');
      expect(node.labelSuffix).to.equal('');
      expect(node.parentSet.size).to.equal(0);
      expect(node.radixChildMap.size).to.equal(0);
      expect(node.proofHash).to.equal(null);
      expect(node.treeHeight).to.equal(0);
      expect(node.treeSize).to.equal(0);
      expect(node.treeBytes).to.equal(0);
    });

    it("construct with version", () => {
      const version = 'ver';
      const node2 = new RadixNode(version);
      expect(node2.version).to.equal(version);
      expect(node2.parentStateNode).to.equal(null);
    });

    it("construct with serial", () => {
      const serial = 10;
      const node2 = new RadixNode(null, serial);
      expect(node2.version).to.equal(null);
      expect(node2.serial).to.equal(serial);
      expect(node2.parentStateNode).to.equal(null);
    });

    it("construct with parent state node", () => {
      const parentStateNode = new StateNode();
      const node2 = new RadixNode(null, null, parentStateNode);
      expect(node2.version).to.equal(null);
      expect(node2.parentStateNode).to.equal(parentStateNode);
    });

    it("reset", () => {
      const version = 'ver';
      const parentStateNode = new StateNode();
      const childStateNode = new StateNode();
      const labelRadix = '0';
      const labelSuffix = '0000';
      const parent = new RadixNode();
      const childLabelRadix = '1';
      const childLabelSuffix = '1111';
      const child = new RadixNode();
      const proofHash = 'proofHash';
      const treeHeight = 1;
      const treeSize = 10;
      const treeBytes = 100;

      node.setVersion(version);
      node.setParentStateNode(parentStateNode);
      node.setChildStateNode(childStateNode);
      node.setLabelRadix(labelRadix);
      node.setLabelSuffix(labelSuffix);
      node.addParent(parent);
      node.setChild(childLabelRadix, childLabelSuffix, child);
      node.setProofHash(proofHash);
      node.setTreeHeight(treeHeight);
      node.setTreeSize(treeSize);
      node.setTreeBytes(treeBytes);

      node.reset();
      expect(node.version).to.equal(null);
      expect(node.parentStateNode).to.equal(null);
      expect(node.childStateNode).to.equal(null);
      expect(node.labelRadix).to.equal('');
      expect(node.labelSuffix).to.equal('');
      expect(node.parentSet.size).to.equal(0);
      expect(node.radixChildMap.size).to.equal(0);
      expect(node.proofHash).to.equal(null);
      expect(node.treeHeight).to.equal(0);
      expect(node.treeSize).to.equal(0);
      expect(node.treeBytes).to.equal(0);
    });
  });

  describe("clone", () => {
    const version = 'ver';
    const serial = 200;
    const labelRadix = '0';
    const labelSuffix = '0000';
    const childLabelRadix1 = '1';
    const childLabelSuffix1 = '1111';
    const childLabelRadix2 = '2';
    const childLabelSuffix2 = '2222';
    const proofHash = 'proofHash';
    const treeHeight = 1;
    const treeSize = 10;
    const treeBytes = 100;

    let parentStateNode;
    let childStateNode;
    let parent;
    let child1;
    let child2;

    beforeEach(() => {
      parentStateNode = new StateNode();
      childStateNode = new StateNode();
      parent = new RadixNode();
      child1 = new RadixNode();
      child2 = new RadixNode();

      node.setVersion(version);
      node.setSerial(serial);
      node.setParentStateNode(parentStateNode);
      node.setChildStateNode(childStateNode);
      node.setLabelRadix(labelRadix);
      node.setLabelSuffix(labelSuffix);
      node.addParent(parent);
      node.setChild(childLabelRadix1, childLabelSuffix1, child1);
      node.setChild(childLabelRadix2, childLabelSuffix2, child2);
      node.setProofHash(proofHash);
      node.setTreeHeight(treeHeight);
      node.setTreeSize(treeSize);
      node.setTreeBytes(treeBytes);
    });

    it("clone without version", () => {
      const cloned = node.clone();
      expect(cloned.getVersion()).to.equal(null);
      expect(cloned.getSerial()).to.equal(serial);
      expect(cloned.getParentStateNode()).to.equal(null);
      expect(cloned.getChildStateNode()).to.equal(childStateNode);
      expect(cloned.getLabelRadix()).to.equal(labelRadix);
      expect(cloned.getLabelSuffix()).to.equal(labelSuffix);
      expect(cloned.numParents()).to.equal(0);
      assert.deepEqual(cloned.getParentNodes(), []);
      expect(cloned.numChildren()).to.equal(2);
      assert.deepEqual(cloned.getChildNodes(), [child1, child2]);
      expect(cloned.getProofHash()).to.equal(proofHash);
      expect(cloned.getTreeHeight()).to.equal(treeHeight);
      expect(cloned.getTreeSize()).to.equal(treeSize);
      expect(cloned.getTreeBytes()).to.equal(treeBytes);
    });

    it("clone with version", () => {
      const version2 = 'ver2';
      const cloned = node.clone(version2);
      expect(cloned.getVersion()).to.equal(version2);
      expect(cloned.getSerial()).to.equal(serial);
      expect(cloned.getParentStateNode()).to.equal(null);
    });

    it("clone with parent state node", () => {
      const parentStateNode2 = new StateNode();
      const cloned = node.clone(null, parentStateNode2);
      expect(cloned.getVersion()).to.equal(null);
      expect(cloned.getSerial()).to.equal(serial);
      expect(cloned.getParentStateNode()).to.equal(parentStateNode2);
    });
  });

  describe("version", () => {
    it("get / set / reset", () => {
      const version = 'ver';
      expect(node.getVersion()).to.equal(null);
      node.setVersion(version);
      expect(node.getVersion()).to.equal(version);
      node.resetVersion();
      expect(node.getVersion()).to.equal(null);
    });
  });

  describe("serial", () => {
    it("get / set / reset", () => {
      const serial = 20;
      expect(node.getSerial()).to.equal(null);
      node.setSerial(serial);
      expect(node.getSerial()).to.equal(serial);
      node.resetSerial();
      expect(node.getSerial()).to.equal(null);
    });
  });

  describe("parentStateNode", () => {
    it("get / set / has / reset", () => {
      const parentStateNode = new StateNode();
      expect(node.getParentStateNode()).to.equal(null);
      expect(node.hasParentStateNode()).to.equal(false);
      node.setParentStateNode(parentStateNode);
      expect(node.getParentStateNode()).to.equal(parentStateNode);
      expect(node.hasParentStateNode()).to.equal(true);
      node.resetParentStateNode();
      expect(node.getParentStateNode()).to.equal(null);
      expect(node.hasParentStateNode()).to.equal(false);
    });
  });

  describe("childStateNode", () => {
    it("get / set / has / reset", () => {
      const childStateNode = new StateNode();
      expect(node.getChildStateNode()).to.equal(null);
      expect(node.hasChildStateNode()).to.equal(false);
      node.setChildStateNode(childStateNode);
      expect(node.getChildStateNode()).to.equal(childStateNode);
      expect(node.hasChildStateNode()).to.equal(true);
      node.resetChildStateNode();
      expect(node.getChildStateNode()).to.equal(null);
      expect(node.hasChildStateNode()).to.equal(false);
    });
  });

  describe("labelRadix", () => {
    it("get / set / has / reset", () => {
      const labelRadix = '0';
      expect(node.getLabelRadix()).to.equal('');
      node.setLabelRadix(labelRadix);
      expect(node.getLabelRadix()).to.equal(labelRadix);
      node.resetLabelRadix();
      expect(node.getLabelRadix()).to.equal('');
    });
  });

  describe("labelSuffix", () => {
    it("get / set / has / reset", () => {
      const labelSuffix = 'ffff';
      expect(node.getLabelSuffix()).to.equal('');
      expect(node.getLabelSuffix()).to.equal('');
      node.setLabelSuffix(labelSuffix);
      expect(node.getLabelSuffix()).to.equal(labelSuffix);
      node.resetLabelSuffix();
      expect(node.getLabelSuffix()).to.equal('');
    });
  });

  describe("label", () => {
    it("get", () => {
      const labelRadix = '0';
      const labelSuffix = 'ffff';
      expect(node.getLabel()).to.equal('');
      node.setLabelRadix(labelRadix);
      expect(node.getLabel()).to.equal(labelRadix);
      node.setLabelSuffix(labelSuffix);
      expect(node.getLabel()).to.equal(labelRadix + labelSuffix);
      node.resetLabelSuffix();
      expect(node.getLabel()).to.equal(labelRadix);
      node.resetLabelRadix();
      expect(node.getLabel()).to.equal('');
    });
  });

  describe("parent", () => {
    it("get / add / has / delete", () => {
      const parent1 = new RadixNode();
      const parent2 = new RadixNode();
      expect(node.numParents()).to.equal(0);
      assert.deepEqual(node.getParentNodes(), []);
      expect(node.numParents()).to.equal(0);
      expect(node.hasParent(parent1)).to.equal(false);
      expect(node.hasParent(parent2)).to.equal(false);
      node.addParent(parent1);
      expect(node.numParents()).to.equal(1);
      assert.deepEqual(node.getParentNodes(), [parent1]);
      expect(node.numParents()).to.equal(1);
      expect(node.hasParent(parent1)).to.equal(true);
      expect(node.hasParent(parent2)).to.equal(false);
      node.addParent(parent2);
      expect(node.numParents()).to.equal(2);
      assert.deepEqual(node.getParentNodes(), [parent1, parent2]);
      expect(node.numParents()).to.equal(2);
      expect(node.hasParent(parent1)).to.equal(true);
      expect(node.hasParent(parent2)).to.equal(true);
      node.deleteParent(parent1);
      expect(node.numParents()).to.equal(1);
      assert.deepEqual(node.getParentNodes(), [parent2]);
      expect(node.numParents()).to.equal(1);
      expect(node.hasParent(parent1)).to.equal(false);
      expect(node.hasParent(parent2)).to.equal(true);
      node.deleteParent(parent2);
      expect(node.numParents()).to.equal(0);
      assert.deepEqual(node.getParentNodes(), []);
      expect(node.numParents()).to.equal(0);
      expect(node.hasParent(parent1)).to.equal(false);
      expect(node.hasParent(parent2)).to.equal(false);
    });
  });

  describe("child", () => {
    it("set / delete with a child with invalid labels", () => {
      const labelRadix = '0';
      const labelSuffix = 'ffff';
      const child = new RadixNode();

      // setChild() with invalid label radix
      expect(node.setChild(undefined, labelSuffix, child)).to.equal(false);
      expect(node.setChild(null, labelSuffix, child)).to.equal(false);
      expect(node.setChild(true, labelSuffix, child)).to.equal(false);
      expect(node.setChild(1, labelSuffix, child)).to.equal(false);
      expect(node.setChild('', labelSuffix, child)).to.equal(false);
      expect(node.setChild('00', labelSuffix, child)).to.equal(false);

      // setChild() with invalid label suffix
      expect(node.setChild(labelRadix, undefined, child)).to.equal(false);
      expect(node.setChild(labelRadix, null, child)).to.equal(false);
      expect(node.setChild(labelRadix, true, child)).to.equal(false);
      expect(node.setChild(labelRadix, 1, child)).to.equal(false);

      // deleteChild() with invalid label radix
      expect(node.deleteChild(undefined)).to.equal(false);
      expect(node.deleteChild(null)).to.equal(false);
      expect(node.deleteChild(true)).to.equal(false);
      expect(node.deleteChild(1)).to.equal(false);
    });

    it("get / set / has / delete with valid labels", () => {
      const labelRadix1 = '0';
      const labelSuffix1 = '0000';
      const child1 = new RadixNode();

      const labelRadix2 = '1';
      const labelSuffix2 = '1111';
      const child2 = new RadixNode();

      expect(node.hasChild(labelRadix1)).to.equal(false);
      expect(node.hasChild(labelRadix2)).to.equal(false);
      expect(node.getChild(labelRadix1)).to.equal(null);
      expect(node.getChild(labelRadix2)).to.equal(null);
      expect(node.numChildren()).to.equal(0);
      assert.deepEqual(node.getChildLabelRadices(), []);
      assert.deepEqual(node.getChildNodes(), []);

      expect(child1.numParents()).to.equal(0);
      expect(child1.getLabelRadix()).to.equal('');
      expect(child1.getLabelSuffix()).to.equal('');

      expect(child2.numParents()).to.equal(0);
      expect(child2.getLabelRadix()).to.equal('');
      expect(child2.getLabelSuffix()).to.equal('');

      // setChild() with child1
      node.setChild(labelRadix1, labelSuffix1, child1);
      expect(node.hasChild(labelRadix1)).to.equal(true);
      expect(node.hasChild(labelRadix2)).to.equal(false);
      expect(node.getChild(labelRadix1)).to.equal(child1);
      expect(node.getChild(labelRadix2)).to.equal(null);
      expect(node.numChildren()).to.equal(1);
      assert.deepEqual(node.getChildLabelRadices(), [labelRadix1]);
      assert.deepEqual(node.getChildNodes(), [child1]);

      expect(child1.hasParent(node)).to.equal(true);
      expect(child1.numParents()).to.equal(1);
      expect(child1.getLabelRadix()).to.equal(labelRadix1);
      expect(child1.getLabelSuffix()).to.equal(labelSuffix1);

      expect(child2.numParents()).to.equal(0);
      expect(child2.getLabelRadix()).to.equal('');
      expect(child2.getLabelSuffix()).to.equal('');

      // setChild() with child2
      node.setChild(labelRadix2, labelSuffix2, child2);
      expect(node.hasChild(labelRadix1)).to.equal(true);
      expect(node.hasChild(labelRadix2)).to.equal(true);
      expect(node.getChild(labelRadix1)).to.equal(child1);
      expect(node.getChild(labelRadix2)).to.equal(child2);
      expect(node.numChildren()).to.equal(2);
      assert.deepEqual(node.getChildLabelRadices(), [labelRadix1, labelRadix2]);
      assert.deepEqual(node.getChildNodes(), [child1, child2]);

      expect(child1.hasParent(node)).to.equal(true);
      expect(child1.numParents()).to.equal(1);
      expect(child1.getLabelRadix()).to.equal(labelRadix1);
      expect(child1.getLabelSuffix()).to.equal(labelSuffix1);

      expect(child2.hasParent(node)).to.equal(true);
      expect(child2.numParents()).to.equal(1);
      expect(child2.getLabelRadix()).to.equal(labelRadix2);
      expect(child2.getLabelSuffix()).to.equal(labelSuffix2);

      // deleteChild() with child1
      node.deleteChild(labelRadix1);

      expect(node.hasChild(labelRadix1)).to.equal(false);
      expect(node.hasChild(labelRadix2)).to.equal(true);
      expect(node.getChild(labelRadix1)).to.equal(null);
      expect(node.getChild(labelRadix2)).to.equal(child2);
      expect(node.numChildren()).to.equal(1);
      assert.deepEqual(node.getChildLabelRadices(), [labelRadix2]);
      assert.deepEqual(node.getChildNodes(), [child2]);

      expect(child1.numParents()).to.equal(0);
      expect(child1.getLabelRadix()).to.equal(labelRadix1);
      expect(child1.getLabelSuffix()).to.equal(labelSuffix1);

      expect(child2.hasParent(node)).to.equal(true);
      expect(child2.numParents()).to.equal(1);
      expect(child2.getLabelRadix()).to.equal(labelRadix2);
      expect(child2.getLabelSuffix()).to.equal(labelSuffix2);

      // deleteChild() with child2
      node.deleteChild(labelRadix2);

      expect(node.hasChild(labelRadix1)).to.equal(false);
      expect(node.hasChild(labelRadix2)).to.equal(false);
      expect(node.getChild(labelRadix1)).to.equal(null);
      expect(node.getChild(labelRadix2)).to.equal(null);
      expect(node.numChildren()).to.equal(0);
      assert.deepEqual(node.getChildLabelRadices(), []);
      assert.deepEqual(node.getChildNodes(), []);

      expect(child1.numParents()).to.equal(0);
      expect(child1.getLabelRadix()).to.equal(labelRadix1);
      expect(child1.getLabelSuffix()).to.equal(labelSuffix1);

      expect(child2.numParents()).to.equal(0);
      expect(child2.getLabelRadix()).to.equal(labelRadix2);
      expect(child2.getLabelSuffix()).to.equal(labelSuffix2);
    });

    it("getChildLabelRadices / getChildNodes", () => {
      const labelRadix1 = '0';
      const labelSuffix1 = '0000';
      const child1 = new RadixNode();

      const labelRadix2 = '1';
      const labelSuffix2 = '1111';
      const child2 = new RadixNode();

      const labelRadix3 = '2';
      const labelSuffix3 = '2222';
      const child3 = new RadixNode();

      // setChild() with child3 first!
      node.setChild(labelRadix3, labelSuffix3, child3);
      // setChild() with child2 first!
      node.setChild(labelRadix2, labelSuffix2, child2);
      // setChild() with child1
      node.setChild(labelRadix1, labelSuffix1, child1);
      // sorted by label radix
      assert.deepEqual(node.getChildLabelRadices(), [labelRadix1, labelRadix2, labelRadix3]);
      // sorted by label radix
      assert.deepEqual(node.getChildNodes(), [child1, child2, child3]);
    });

    it("set existing child", () => {
      const labelRadix = '0';
      const labelSuffix = '0000';
      const child1 = new RadixNode();
      const child2 = new RadixNode();

      expect(node.hasChild(labelRadix)).to.equal(false);
      expect(node.getChild(labelRadix)).to.equal(null);
      expect(node.numChildren()).to.equal(0);

      expect(child1.numParents()).to.equal(0);

      expect(child2.numParents()).to.equal(0);

      // setChild() with child1
      node.setChild(labelRadix, labelSuffix, child1);
      expect(node.hasChild(labelRadix)).to.equal(true);
      expect(node.getChild(labelRadix)).to.equal(child1);
      expect(node.numChildren()).to.equal(1);

      expect(child1.numParents()).to.equal(1);

      // setChild() with child1
      node.setChild(labelRadix, labelSuffix, child1);
      expect(node.hasChild(labelRadix)).to.equal(true);
      expect(node.getChild(labelRadix)).to.equal(child1);
      expect(node.numChildren()).to.equal(1);

      expect(child1.numParents()).to.equal(1);
    });

    it("overwrite existing child", () => {
      const labelRadix = '0';
      const labelSuffix = '0000';
      const child1 = new RadixNode();
      const child2 = new RadixNode();

      expect(node.hasChild(labelRadix)).to.equal(false);
      expect(node.getChild(labelRadix)).to.equal(null);
      expect(node.numChildren()).to.equal(0);

      expect(child1.numParents()).to.equal(0);

      expect(child2.numParents()).to.equal(0);

      // setChild() with child1
      node.setChild(labelRadix, labelSuffix, child1);
      expect(node.hasChild(labelRadix)).to.equal(true);
      expect(node.getChild(labelRadix)).to.equal(child1);
      expect(node.numChildren()).to.equal(1);

      expect(child1.numParents()).to.equal(1);

      expect(child2.numParents()).to.equal(0);

      // setChild() with child2
      node.setChild(labelRadix, labelSuffix, child2);
      expect(node.hasChild(labelRadix)).to.equal(true);
      expect(node.getChild(labelRadix)).to.equal(child2);
      expect(node.numChildren()).to.equal(1);

      expect(child1.numParents()).to.equal(0);

      expect(child2.numParents()).to.equal(1);
    });
  });

  describe("state info", () => {
    const labelRadix1 = '1';
    const labelSuffix1 = '001';
    let child1;

    const labelRadix2 = '2';
    const labelSuffix2 = '002';
    let child2;

    const labelRadix11 = '1';
    const labelSuffix11 = '011';
    let child11;

    const labelRadix12 = '2';
    const labelSuffix12 = '012';
    let child12;

    const labelRadix21 = '1';
    const labelSuffix21 = '021';
    let child21;

    const labelRadix22 = '2';
    const labelSuffix22 = '022';
    let child22;

    let stateNode;
    const stateNodePH = 'stateNodePH';

    let stateNode1;
    const stateNodePH1 = 'stateNodePH1';

    let stateNode11;
    const stateNodePH11 = 'stateNodePH11';

    let stateNode12;
    const stateNodePH12 = 'stateNodePH12';

    let stateNode21;
    const stateNodePH21 = 'stateNodePH21';

    let stateNode22;
    const stateNodePH22 = 'stateNodePH22';

    beforeEach(() => {
      child1 = new RadixNode();
      child2 = new RadixNode();
      child11 = new RadixNode();
      child12 = new RadixNode();
      child21 = new RadixNode();
      child22 = new RadixNode();

      stateNode = new StateNode();
      stateNode.setProofHash(stateNodePH);
      node.setChildStateNode(stateNode);

      stateNode1 = new StateNode();
      stateNode1.setProofHash(stateNodePH1);
      child1.setChildStateNode(stateNode1);

      stateNode11 = new StateNode();
      stateNode11.setProofHash(stateNodePH11);
      child11.setChildStateNode(stateNode11);

      stateNode12 = new StateNode();
      stateNode12.setProofHash(stateNodePH12);
      child12.setChildStateNode(stateNode12);

      stateNode21 = new StateNode();
      stateNode21.setProofHash(stateNodePH21);
      child21.setChildStateNode(stateNode21);

      stateNode22 = new StateNode();
      stateNode22.setProofHash(stateNodePH22);
      child22.setChildStateNode(stateNode22);
    })

    it("get / set / reset proof hash", () => {
      const proofHash = 'proofHash';

      expect(node.getProofHash()).to.equal(null);
      node.setProofHash(proofHash);
      expect(node.getProofHash()).to.equal(proofHash);
      node.resetProofHash();
      expect(node.getProofHash()).to.equal(null);
    });

    it("get / set tree height", () => {
      const treeHeight = 10;

      expect(node.getTreeHeight()).to.equal(0);
      node.setTreeHeight(treeHeight);
      expect(node.getTreeHeight()).to.equal(treeHeight);
      node.resetTreeHeight();
      expect(node.getTreeHeight()).to.equal(0);
    });

    it("get / set tree size", () => {
      const treeSize = 100;

      expect(node.getTreeSize()).to.equal(0);
      node.setTreeSize(treeSize);
      expect(node.getTreeSize()).to.equal(treeSize);
      node.resetTreeSize();
      expect(node.getTreeSize()).to.equal(0);
    });

    it("get / set tree bytes", () => {
      const treeBytes = 1000;

      expect(node.getTreeBytes()).to.equal(0);
      node.setTreeBytes(treeBytes);
      expect(node.getTreeBytes()).to.equal(treeBytes);
      node.resetTreeBytes();
      expect(node.getTreeBytes()).to.equal(0);
    });

    it("buildRadixInfo", () => {
      const childPH1 = 'childPH1';
      const childPH2 = 'childPH2';

      const stateNodeTH = 12;
      const childTH1 = 10;
      const childTH2 = 11;

      const stateNodeTS = 120;
      const childTS1 = 100;
      const childTS2 = 110;

      const stateNodeTB = 3200;
      const childTB1 = 1000;
      const childTB2 = 2100;

      child1.setProofHash(childPH1);
      child2.setProofHash(childPH2);

      stateNode.setTreeHeight(stateNodeTH);
      child1.setTreeHeight(childTH1);
      child2.setTreeHeight(childTH2);

      stateNode.setTreeSize(stateNodeTS);
      child1.setTreeSize(childTS1);
      child2.setTreeSize(childTS2);

      stateNode.setTreeBytes(stateNodeTB);
      child1.setTreeBytes(childTB1);
      child2.setTreeBytes(childTB2);

      stateNode.setLabel('stateLabel');
      stateNode1.setLabel('stateLabel1');

      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);

      assert.deepEqual(node.toJsObject(false, false, true, true), {
        "1001": {
          "#radix_ph": "childPH1",
          "#tree_bytes": 1000,
          "#tree_height": 10,
          "#tree_size": 100,
          "stateLabel1": {
            "#state_ph": "stateNodePH1",
          }
        },
        "2002": {
          "#radix_ph": "childPH2",
          "#tree_bytes": 2100,
          "#tree_height": 11,
          "#tree_size": 110,
        },
        "#radix_ph": null,
        "#tree_bytes": 0,
        "#tree_height": 0,
        "#tree_size": 0,
        "stateLabel": {
          "#state_ph": "stateNodePH",
        }
      });

      // With stateNode
      node.setChildStateNode(stateNode);
      const treeInfo = node.buildRadixInfo();
      const preimage1 = `${stateNodePH}${HASH_DELIMITER}${HASH_DELIMITER}` +
          `${labelRadix1}${labelSuffix1}${HASH_DELIMITER}${childPH1}` +
          `${HASH_DELIMITER}${labelRadix2}${labelSuffix2}${HASH_DELIMITER}${childPH2}`;
      const proofHash1 = CommonUtil.hashString(preimage1);
      expect(treeInfo.proofHash).to.equal(proofHash1)

      expect(treeInfo.treeHeight).to.equal(Math.max(stateNodeTH, childTH1, childTH2));
      expect(treeInfo.treeSize).to.equal(stateNodeTS + childTS1 + childTS2);
      // 10('stateLabel') * 2 = 20
      expect(treeInfo.treeBytes).to.equal(stateNodeTB + childTB1 + childTB2 + 20);

      // Without stateNode
      node.resetChildStateNode();
      const treeInfo2 = node.buildRadixInfo();
      const preimage2 = `${HASH_DELIMITER}${HASH_DELIMITER}` +
          `${labelRadix1}${labelSuffix1}${HASH_DELIMITER}${childPH1}` +
          `${HASH_DELIMITER}${labelRadix2}${labelSuffix2}${HASH_DELIMITER}${childPH2}`;
      const proofHash2 = CommonUtil.hashString(preimage2);
      expect(treeInfo2.proofHash).to.equal(proofHash2)
    });

    it("updateRadixInfo / verifyRadixInfo", () => {
      const childPH1 = 'childPH1';
      const childPH2 = 'childPH2';

      const stateNodeTH = 12;
      const childTH1 = 10;
      const childTH2 = 11;

      const stateNodeTS = 120;
      const childTS1 = 100;
      const childTS2 = 110;

      const stateNodeTB = 3200;
      const childTB1 = 1000;
      const childTB2 = 2100;

      child1.setProofHash(childPH1);
      child2.setProofHash(childPH2);

      stateNode.setTreeHeight(stateNodeTH);
      child1.setTreeHeight(childTH1);
      child2.setTreeHeight(childTH2);

      stateNode.setTreeSize(stateNodeTS);
      child1.setTreeSize(childTS1);
      child2.setTreeSize(childTS2);

      stateNode.setTreeBytes(stateNodeTB);
      child1.setTreeBytes(childTB1);
      child2.setTreeBytes(childTB2);

      stateNode.setLabel('stateLabel');
      stateNode1.setLabel('stateLabel1');

      node.setChildStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);

      assert.deepEqual(node.toJsObject(false, false, true), {
        "1001": {
          "#radix_ph": "childPH1",
          "stateLabel1": {
            "#state_ph": "stateNodePH1",
          }
        },
        "2002": {
          "#radix_ph": "childPH2",
        },
        "#radix_ph": null,
        "stateLabel": {
          "#state_ph": "stateNodePH",
        }
      });

      // Check radix info
      node.resetProofHash();
      expect(node.verifyRadixInfo()).to.equal(false);
      node.updateRadixInfo();
      expect(node.verifyRadixInfo()).to.equal(true);
    });

    it("updateRadixInfoForRadixTree", () => {
      stateNode.setLabel('stateLabel');
      stateNode1.setLabel('stateLabel1');
      stateNode11.setLabel('stateLabel11');
      stateNode12.setLabel('stateLabel12');
      stateNode21.setLabel('stateLabel21');
      stateNode22.setLabel('stateLabel22');

      node.setChildStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);
      child1.setChild(labelRadix11, labelSuffix11, child11);
      child1.setChild(labelRadix12, labelSuffix12, child12);
      child2.setChild(labelRadix21, labelSuffix21, child21);
      child2.setChild(labelRadix22, labelSuffix22, child22);

      assert.deepEqual(node.toJsObject(false, false, true), {
        "1001": {
          "1011": {
            "#radix_ph": null,
            "stateLabel11": {
              "#state_ph": "stateNodePH11",
            }
          },
          "2012": {
            "#radix_ph": null,
            "stateLabel12": {
              "#state_ph": "stateNodePH12",
            }
          },
          "#radix_ph": null,
          "stateLabel1": {
            "#state_ph": "stateNodePH1",
          }
        },
        "2002": {
          "1021": {
            "#radix_ph": null,
            "stateLabel21": {
              "#state_ph": "stateNodePH21",
            }
          },
          "2022": {
            "#radix_ph": null,
            "stateLabel22": {
              "#state_ph": "stateNodePH22",
            }
          },
          "#radix_ph": null,
        },
        "#radix_ph": null,
        "stateLabel": {
          "#state_ph": "stateNodePH",
        }
      });

      // initial status
      expect(node.verifyRadixInfo()).to.equal(false);
      expect(child1.verifyRadixInfo()).to.equal(false);
      expect(child2.verifyRadixInfo()).to.equal(false);
      expect(child11.verifyRadixInfo()).to.equal(false);
      expect(child12.verifyRadixInfo()).to.equal(false);
      expect(child21.verifyRadixInfo()).to.equal(false);
      expect(child22.verifyRadixInfo()).to.equal(false);

      // set
      expect(node.updateRadixInfoForRadixTree()).to.equal(7);
      expect(node.verifyRadixInfo()).to.equal(true);
      expect(child1.verifyRadixInfo()).to.equal(true);
      expect(child2.verifyRadixInfo()).to.equal(true);
      expect(child11.verifyRadixInfo()).to.equal(true);
      expect(child12.verifyRadixInfo()).to.equal(true);
      expect(child21.verifyRadixInfo()).to.equal(true);
      expect(child22.verifyRadixInfo()).to.equal(true);

      // change of a state node's proof hash
      stateNode12.setProofHash('another PH');
      expect(node.verifyRadixInfo()).to.equal(true);
      expect(child1.verifyRadixInfo()).to.equal(true);
      expect(child2.verifyRadixInfo()).to.equal(true);
      expect(child11.verifyRadixInfo()).to.equal(true);
      expect(child12.verifyRadixInfo()).to.equal(false);
      expect(child21.verifyRadixInfo()).to.equal(true);
      expect(child22.verifyRadixInfo()).to.equal(true);
    });

    it("updateRadixInfoForAllRootPath", () => {
      stateNode.setLabel('stateLabel');
      stateNode1.setLabel('stateLabel1');
      stateNode11.setLabel('stateLabel11');
      stateNode12.setLabel('stateLabel12');
      stateNode21.setLabel('stateLabel21');
      stateNode22.setLabel('stateLabel22');

      node.setChildStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);
      child1.setChild(labelRadix11, labelSuffix11, child11);
      child1.setChild(labelRadix12, labelSuffix12, child12);
      child2.setChild(labelRadix21, labelSuffix21, child21);
      child2.setChild(labelRadix22, labelSuffix22, child22);

      assert.deepEqual(node.toJsObject(false, false, true), {
        "1001": {
          "1011": {
            "#radix_ph": null,
            "stateLabel11": {
              "#state_ph": "stateNodePH11",
            }
          },
          "2012": {
            "#radix_ph": null,
            "stateLabel12": {
              "#state_ph": "stateNodePH12",
            }
          },
          "#radix_ph": null,
          "stateLabel1": {
            "#state_ph": "stateNodePH1",
          }
        },
        "2002": {
          "1021": {
            "#radix_ph": null,
            "stateLabel21": {
              "#state_ph": "stateNodePH21",
            }
          },
          "2022": {
            "#radix_ph": null,
            "stateLabel22": {
              "#state_ph": "stateNodePH22",
            }
          },
          "#radix_ph": null,
        },
        "#radix_ph": null,
        "stateLabel": {
          "#state_ph": "stateNodePH",
        }
      });

      // initial status
      expect(node.verifyRadixInfo()).to.equal(false);
      expect(child1.verifyRadixInfo()).to.equal(false);
      expect(child2.verifyRadixInfo()).to.equal(false);
      expect(child11.verifyRadixInfo()).to.equal(false);
      expect(child12.verifyRadixInfo()).to.equal(false);
      expect(child21.verifyRadixInfo()).to.equal(false);
      expect(child22.verifyRadixInfo()).to.equal(false);

      // update
      expect(child21.updateRadixInfoForAllRootPaths()).to.equal(3);
      expect(node.verifyRadixInfo()).to.equal(true);
      expect(child1.verifyRadixInfo()).to.equal(false);
      expect(child2.verifyRadixInfo()).to.equal(true);
      expect(child11.verifyRadixInfo()).to.equal(false);
      expect(child12.verifyRadixInfo()).to.equal(false);
      expect(child21.verifyRadixInfo()).to.equal(true);
      expect(child22.verifyRadixInfo()).to.equal(false);
    });

    it("verifyRadixInfoForRadixTree", () => {
      stateNode.setLabel('stateLabel');
      stateNode1.setLabel('stateLabel1');
      stateNode11.setLabel('stateLabel11');
      stateNode12.setLabel('stateLabel12');
      stateNode21.setLabel('stateLabel21');
      stateNode22.setLabel('stateLabel22');

      node.setChildStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);
      child1.setChild(labelRadix11, labelSuffix11, child11);
      child1.setChild(labelRadix12, labelSuffix12, child12);
      child2.setChild(labelRadix21, labelSuffix21, child21);
      child2.setChild(labelRadix22, labelSuffix22, child22);

      assert.deepEqual(node.toJsObject(false, false, true), {
        "1001": {
          "1011": {
            "#radix_ph": null,
            "stateLabel11": {
              "#state_ph": "stateNodePH11",
            }
          },
          "2012": {
            "#radix_ph": null,
            "stateLabel12": {
              "#state_ph": "stateNodePH12",
            }
          },
          "#radix_ph": null,
          "stateLabel1": {
            "#state_ph": "stateNodePH1",
          }
        },
        "2002": {
          "1021": {
            "#radix_ph": null,
            "stateLabel21": {
              "#state_ph": "stateNodePH21",
            }
          },
          "2022": {
            "#radix_ph": null,
            "stateLabel22": {
              "#state_ph": "stateNodePH22",
            }
          },
          "#radix_ph": null,
        },
        "#radix_ph": null,
        "stateLabel": {
          "#state_ph": "stateNodePH",
        }
      });

      // initial status
      expect(node.verifyRadixInfoForRadixTree()).to.equal(false);

      // set
      expect(node.updateRadixInfoForRadixTree()).to.equal(7);
      expect(node.verifyRadixInfoForRadixTree()).to.equal(true);

      // change of a state node's proof hash
      stateNode21.setProofHash('another PH');
      expect(node.verifyRadixInfoForRadixTree()).to.equal(false);

      // update
      expect(child21.updateRadixInfoForAllRootPaths()).to.equal(3);
      expect(node.verifyRadixInfoForRadixTree()).to.equal(true);
    });

    it("getProofOfRadixNode", () => {
      stateNode.setLabel('stateLabel');
      stateNode1.setLabel('stateLabel1');
      stateNode11.setLabel('stateLabel11');
      stateNode12.setLabel('stateLabel12');
      stateNode21.setLabel('stateLabel21');
      stateNode22.setLabel('stateLabel22');

      node.setChildStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);
      child1.setChild(labelRadix11, labelSuffix11, child11);
      child1.setChild(labelRadix12, labelSuffix12, child12);
      child2.setChild(labelRadix21, labelSuffix21, child21);
      child2.setChild(labelRadix22, labelSuffix22, child22);

      expect(node.updateRadixInfoForRadixTree()).to.equal(7);

      assert.deepEqual(node.toJsObject(false, false, true), {
        "1001": {
          "1011": {
            "#radix_ph": "0xac8e0ca829cea8d80a79260078fb8e1b38a05b6d087c72a1c92f63849a47b96b",
            "stateLabel11": {
              "#state_ph": "stateNodePH11",
            },
          },
          "2012": {
            "#radix_ph": "0x7fc53637a6ff6b7efa8cf7c9ba95552ed7479262ad8c07a61b4d2b1e8002d360",
            "stateLabel12": {
              "#state_ph": "stateNodePH12",
            },
          },
          "#radix_ph": "0xd56eaf71ba15b95bf26276fe9ce88a4977a71271405c88aeb4f4efd5e34a8399",
          "stateLabel1": {
            "#state_ph": "stateNodePH1",
          }
        },
        "2002": {
          "1021": {
            "#radix_ph": "0xa8c806fde336879bd0cb320c809ad8a1f6e1e526711ed239eb216f83e4fb19d7",
            "stateLabel21": {
              "#state_ph": "stateNodePH21",
            }
          },
          "2022": {
            "#radix_ph": "0x0dd8afcb4c2839ff30e6872c7268f9ed687fd53c52ce78f0330de82d5b33a0a2",
            "stateLabel22": {
              "#state_ph": "stateNodePH22",
            }
          },
          "#radix_ph": "0x763902e3186ec54e6a4bc3a2c01f57f60628d95a27a380a3ec2cea9e68c3928c",
        },
        "#radix_ph": "0x3142cb3647c2861969c8df0a524336460d6c708c80bec5519bcf1437964ff9e0",
        "stateLabel": {
          "#state_ph": "stateNodePH"
        }
      });

      const label11 = labelRadix11 + labelSuffix11;
      const label21 = labelRadix21 + labelSuffix21;

      // on a node with state node value with child label/proof with isRootRadixNode = false
      assert.deepEqual(child1.getProofOfRadixNode(label11, 'childProof11', null), {
        "#radix_ph": "0xd56eaf71ba15b95bf26276fe9ce88a4977a71271405c88aeb4f4efd5e34a8399",
        "1011": "childProof11",
        "2012": {
          "#radix_ph": "0x7fc53637a6ff6b7efa8cf7c9ba95552ed7479262ad8c07a61b4d2b1e8002d360",
        },
        "stateLabel1": {
          "#state_ph": "stateNodePH1",
        }
      });

      // on a node without state node value with child label/proof with isRootRadixNode = false
      assert.deepEqual(child2.getProofOfRadixNode(label21, 'childProof21', null), {
        "#radix_ph": "0x763902e3186ec54e6a4bc3a2c01f57f60628d95a27a380a3ec2cea9e68c3928c",
        "1021": "childProof21",
        "2022": {
          "#radix_ph": "0x0dd8afcb4c2839ff30e6872c7268f9ed687fd53c52ce78f0330de82d5b33a0a2",
        },
      });

      // on a node with state node value with state proof with isRootRadixNode = false
      assert.deepEqual(child1.getProofOfRadixNode(null, null, 'stateProof1'), {
        "#radix_ph": "0xd56eaf71ba15b95bf26276fe9ce88a4977a71271405c88aeb4f4efd5e34a8399",
        "stateLabel1": "stateProof1",
      });

      // on a node without state node value with state proof with isRootRadixNode = false
      assert.deepEqual(child2.getProofOfRadixNode(null, null, 'stateProof2'), {
        "#radix_ph": "0x763902e3186ec54e6a4bc3a2c01f57f60628d95a27a380a3ec2cea9e68c3928c"
      });

      // on a node with state node value with child label/proof with isRootRadixNode = true
      assert.deepEqual(child1.getProofOfRadixNode(label11, 'childProof11', null, true), {
        "#state_ph": "0xd56eaf71ba15b95bf26276fe9ce88a4977a71271405c88aeb4f4efd5e34a8399",
        "1011": "childProof11",
        "2012": {
          "#radix_ph": "0x7fc53637a6ff6b7efa8cf7c9ba95552ed7479262ad8c07a61b4d2b1e8002d360",
        },
        "stateLabel1": {
          "#state_ph": "stateNodePH1",
        }
      });

      // on a node without state node value with child label/proof with isRootRadixNode = true
      assert.deepEqual(child2.getProofOfRadixNode(label21, 'childProof21', null, true), {
        "#state_ph": "0x763902e3186ec54e6a4bc3a2c01f57f60628d95a27a380a3ec2cea9e68c3928c",
        "1021": "childProof21",
        "2022": {
          "#radix_ph": "0x0dd8afcb4c2839ff30e6872c7268f9ed687fd53c52ce78f0330de82d5b33a0a2",
        },
      });

      // on a node with state node value with state proof with isRootRadixNode = true
      assert.deepEqual(child1.getProofOfRadixNode(null, null, 'stateProof1', true), {
        "#state_ph": "0xd56eaf71ba15b95bf26276fe9ce88a4977a71271405c88aeb4f4efd5e34a8399",
        "stateLabel1": "stateProof1",
      });

      // on a node without state node value with state proof with isRootRadixNode = true
      assert.deepEqual(child2.getProofOfRadixNode(null, null, 'stateProof2', true), {
        "#state_ph": "0x763902e3186ec54e6a4bc3a2c01f57f60628d95a27a380a3ec2cea9e68c3928c"
      });
    });
  });

  describe("utils", () => {
    const version = 'ver';
    const version1 = 'ver1';
    const version21 = 'ver21';
    const version22 = 'ver22';

    let parentStateNode1;
    let parentStateNode21;
    let parentStateNode22;
    let childStateNode1;
    let childStateNode2;
    let childStateNode21;
    let childStateNode22;

    let parent1;
    let parent2;
    let parent21;
    let parent22;
    let child1;
    let child2;
    let child21;
    let child22;

    beforeEach(() => {
      parentStateNode1 = new StateNode();
      parentStateNode1.setVersion('parentStateNodeVer1');
      parentStateNode21 = new StateNode();
      parentStateNode21.setVersion('parentStateNodeVer21');
      parentStateNode22 = new StateNode();
      parentStateNode22.setVersion('parentStateNodeVer22');

      stateNode = new StateNode();
      stateNode.setVersion('stateNodeVer');
      stateNode.setProofHash('stateNodePH');
      stateNode.setTreeHeight(1);
      stateNode.setTreeSize(10);
      stateNode.setTreeBytes(100);

      childStateNode1 = new StateNode();
      childStateNode1.setVersion('childStateNodeVer1');
      childStateNode1.setProofHash('childStateNodePH1');
      childStateNode1.setTreeHeight(2);
      childStateNode1.setTreeSize(20);
      childStateNode1.setTreeBytes(200);

      childStateNode2 = new StateNode();
      childStateNode2.setVersion('childStateNodeVer2');
      childStateNode2.setProofHash('childStateNodePH2');
      childStateNode2.setTreeHeight(3);
      childStateNode2.setTreeSize(30);
      childStateNode2.setTreeBytes(300);

      childStateNode21 = new StateNode();
      childStateNode21.setVersion('childStateNodeVer21');
      childStateNode21.setProofHash('childStateNodePH21');
      childStateNode21.setTreeHeight(4);
      childStateNode21.setTreeSize(40);
      childStateNode21.setTreeBytes(400);

      childStateNode22 = new StateNode();
      childStateNode22.setVersion('childStateNodeVer22');
      childStateNode22.setProofHash('childStateNodePH22');
      childStateNode22.setTreeHeight(5);
      childStateNode22.setTreeSize(50);
      childStateNode22.setTreeBytes(500);

      parent1 = new RadixNode(version1, null, parentStateNode1 );
      parent2 = new RadixNode(version21);
      parent21 = new RadixNode(version21, null, parentStateNode21);
      parent22 = new RadixNode(version22, null, parentStateNode22);

      node.setVersion(version);
      node.setSerial(0);
      node.setChildStateNode(stateNode);

      child1 = new RadixNode(version, 3);
      child1.setChildStateNode(childStateNode1);

      child2 = new RadixNode(version, 4);
      child2.setChildStateNode(childStateNode2);

      child21 = new RadixNode(version, 2);
      child21.setChildStateNode(childStateNode21);

      child22 = new RadixNode(version, 1);
      child22.setChildStateNode(childStateNode22);

      parent1.setChild('0', '000', node);
      parent2.setChild('0', '000', node);
      parent21.setChild('1', '021', parent2);
      parent22.setChild('2', '022', parent2);

      node.setChild('1', '001', child1);
      node.setChild('2', '002', child2);
      child2.setChild('1', '021', child21);
      child2.setChild('2', '022', child22);

      stateNode.setLabel('0000');
      childStateNode1.setLabel('1001');
      childStateNode2.setLabel('2002');
      childStateNode21.setLabel('1021');
      childStateNode22.setLabel('2022');

      node.updateRadixInfoForRadixTree();
      node.updateRadixInfoForAllRootPaths();
    });

    it("getParentStateNodeList", () => {
      const parentStateNodes = node.getParentStateNodeList();
      expect(parentStateNodes.length).to.equal(3);
      assert.deepEqual(
          parentStateNodes, [parentStateNode1, parentStateNode21, parentStateNode22]);
    });

    describe("hasMultipleParentStateNodes", () => {
      it("with multiple parent state nodes", () => {
        expect(node._getNumMultipleParentStateNodes(0)).to.equal(2);
        expect(node.hasMultipleParentStateNodes()).to.equal(true);
      });

      it("with single parent state node", () => {
        expect(parent1._getNumMultipleParentStateNodes(0)).to.equal(1);
        expect(parent1.hasMultipleParentStateNodes()).to.equal(false);
      });
    });

    it("getChildStateNodeList", () => {
      const stateNodes = node.getChildStateNodeList();
      expect(stateNodes.length).to.equal(5)
      assert.deepEqual(
          stateNodes, [
            {
              serial: 0,
              stateNode: stateNode,
            },
            {
              serial: 3,
              stateNode: childStateNode1,
            },
            {
              serial: 4,
              stateNode: childStateNode2,
            },
            {
              serial: 2,
              stateNode: childStateNode21,
            },
            {
              serial: 1,
              stateNode: childStateNode22,
            },
          ]);
    });

    it("deleteRadixTreeVersion", () => {
      const versionAnother = 'ver_another';
      const versionYetAnother = 'ver_yet_another';

      const stateNodeAnother = new StateNode();
      stateNodeAnother.setLabel('0000');
      const childStateNodeAnother1 = new StateNode();
      childStateNodeAnother1.setLabel('1001');

      const childAnother1 = new RadixNode();
      childAnother1.setVersion(versionAnother);
      childAnother1.setChildStateNode(childStateNodeAnother1);

      const nodeAnother = node.clone(versionAnother, null);
      nodeAnother.setVersion(versionAnother);
      nodeAnother.setChildStateNode(stateNodeAnother);

      nodeAnother.setChild('1', '001', childAnother1);

      // Let's make childStateNodeAnother1 has 2 parent radix nodes.
      const childYetAnother1 = new RadixNode();
      childYetAnother1.setVersion(versionYetAnother);
      childYetAnother1.setChildStateNode(childStateNodeAnother1);

      assert.deepEqual(node.toJsObject(true, false, true, false, true), {
        "1001": {
          "1001": {
            "#state_ph": "childStateNodePH1",
            "#version": "childStateNodeVer1",
          },
          "#num_parents": 1,
          "#radix_ph": "0x250696f53c50acdc0d4b7222f854da562ffaa0b30bfda384bb4d5c92be12ce69",
          "#version": "ver",
        },
        "2002": {
          "1021": {
            "1021": {
              "#state_ph": "childStateNodePH21",
              "#version": "childStateNodeVer21",
            },
            "#num_parents": 1,
            "#radix_ph": "0x68971271b6018c8827230bb696d7d2661ebb286f95851e72da889e1af6b22721",
            "#version": "ver",
          },
          "2002": {
            "#state_ph": "childStateNodePH2",
            "#version": "childStateNodeVer2",
          },
          "2022": {
            "2022": {
              "#state_ph": "childStateNodePH22",
              "#version": "childStateNodeVer22",
            },
            "#num_parents": 1,
            "#radix_ph": "0xba9d1dcddd02911d1d260f8acd4e3857174d98a57e6b3c7e0577c8a07056b057",
            "#version": "ver",
          },
          "#num_parents": 2,
          "#radix_ph": "0xa324889bbe8fe5189103966387ec9521bcae57046727f77496fe19e7d0b333ab",
          "#version": "ver",
        },
        "#num_parents": 2,
        "#radix_ph": "0xeeea0db0b065dd84b326e2852d48d3f8738b2bb220f9dd7e4f2db756915da13e",
        "#version": "ver",
        "0000": {
          "#state_ph": "stateNodePH",
          "#version": "stateNodeVer",
        }
      });
      assert.deepEqual(nodeAnother.toJsObject(true, false, true, false, true), {
        "1001": {
          "1001": {
            "#state_ph": null,
            "#version": null,
          },
          "#num_parents": 1,
          "#radix_ph": null,
          "#version": "ver_another",
        },
        "2002": {
          "1021": {
            "1021": {
              "#state_ph": "childStateNodePH21",
              "#version": "childStateNodeVer21",
            },
            "#num_parents": 1,
            "#radix_ph": "0x68971271b6018c8827230bb696d7d2661ebb286f95851e72da889e1af6b22721",
            "#version": "ver",
          },
          "2002": {
            "#state_ph": "childStateNodePH2",
            "#version": "childStateNodeVer2",
          },
          "2022": {
            "2022": {
              "#state_ph": "childStateNodePH22",
              "#version": "childStateNodeVer22",
            },
            "#num_parents": 1,
            "#radix_ph": "0xba9d1dcddd02911d1d260f8acd4e3857174d98a57e6b3c7e0577c8a07056b057",
            "#version": "ver",
          },
          "#num_parents": 2,
          "#radix_ph": "0xa324889bbe8fe5189103966387ec9521bcae57046727f77496fe19e7d0b333ab",
          "#version": "ver",
        },
        "#num_parents": 0,
        "#radix_ph": "0xeeea0db0b065dd84b326e2852d48d3f8738b2bb220f9dd7e4f2db756915da13e",
        "#version": "ver_another",
        "0000": {
          "#state_ph": null,
          "#version": null,
        }
      });

      // Check numParentRadixNodes()
      expect(stateNode.numParentRadixNodes()).to.equal(1);
      expect(childStateNode1.numParentRadixNodes()).to.equal(1);
      expect(childStateNode2.numParentRadixNodes()).to.equal(1);
      expect(childStateNode21.numParentRadixNodes()).to.equal(1);
      expect(childStateNode22.numParentRadixNodes()).to.equal(1);
      expect(stateNodeAnother.numParentRadixNodes()).to.equal(1);
      expect(childStateNodeAnother1.numParentRadixNodes()).to.equal(2);

      expect(nodeAnother.deleteRadixTreeVersion()).to.equal(4);
      expect(stateNodeAnother.numParentRadixNodes()).to.equal(0);
      assert.deepEqual(stateNodeAnother.getParentRadixNodes(), []);

      // no changes!!
      assert.deepEqual(node.toJsObject(true, false, true, false, true), {
        "1001": {
          "1001": {
            "#state_ph": "childStateNodePH1",
            "#version": "childStateNodeVer1",
          },
          "#num_parents": 1,
          "#radix_ph": "0x250696f53c50acdc0d4b7222f854da562ffaa0b30bfda384bb4d5c92be12ce69",
          "#version": "ver",
        },
        "2002": {
          "1021": {
            "1021": {
              "#state_ph": "childStateNodePH21",
              "#version": "childStateNodeVer21",
            },
            "#num_parents": 1,
            "#radix_ph": "0x68971271b6018c8827230bb696d7d2661ebb286f95851e72da889e1af6b22721",
            "#version": "ver",
          },
          "2002": {
            "#state_ph": "childStateNodePH2",
            "#version": "childStateNodeVer2",
          },
          "2022": {
            "2022": {
              "#state_ph": "childStateNodePH22",
              "#version": "childStateNodeVer22",
            },
            "#num_parents": 1,
            "#radix_ph": "0xba9d1dcddd02911d1d260f8acd4e3857174d98a57e6b3c7e0577c8a07056b057",
            "#version": "ver",
          },
          "#num_parents": 1,
          "#radix_ph": "0xa324889bbe8fe5189103966387ec9521bcae57046727f77496fe19e7d0b333ab",
          "#version": "ver",
        },
        "#num_parents": 2,
        "#radix_ph": "0xeeea0db0b065dd84b326e2852d48d3f8738b2bb220f9dd7e4f2db756915da13e",
        "#version": "ver",
        "0000": {
          "#state_ph": "stateNodePH",
          "#version": "stateNodeVer",
        }
      });
      // deleted!!
      assert.deepEqual(nodeAnother.toJsObject(true, false, true, false, true), {
        "#num_parents": 0,
        "#radix_ph": null,
        "#version": null,
      });

      // Check numParentRadixNodes()
      expect(stateNode.numParentRadixNodes()).to.equal(1);
      expect(childStateNode1.numParentRadixNodes()).to.equal(1);
      expect(childStateNode2.numParentRadixNodes()).to.equal(1);
      expect(childStateNode21.numParentRadixNodes()).to.equal(1);
      expect(childStateNode22.numParentRadixNodes()).to.equal(1);
      expect(stateNodeAnother.numParentRadixNodes()).to.equal(0);  // decreased!!
      expect(childStateNodeAnother1.numParentRadixNodes()).to.equal(1);  // decreased!!
    });

    it("toJsObject", () => {
      assert.deepEqual(node.toJsObject(), {
        "1001": {
          "1001": {}
        },
        "2002": {
          "1021": {
            "1021": {}
          },
          "2002": {},
          "2022": {
            "2022": {}
          },
        },
        "0000": {}
      });
      assert.deepEqual(node.toJsObject(true, true, true, true, true), {
        "1001": {
          "1001": {
            "#state_ph": "childStateNodePH1",
            "#version": "childStateNodeVer1",
          },
          "#num_parents": 1,
          "#radix_ph": "0x250696f53c50acdc0d4b7222f854da562ffaa0b30bfda384bb4d5c92be12ce69",
          "#serial": 3,
          "#tree_bytes": 208,
          "#tree_height": 2,
          "#tree_size": 20,
          "#version": "ver",
        },
        "2002": {
          "1021": {
            "1021": {
              "#state_ph": "childStateNodePH21",
              "#version": "childStateNodeVer21",
            },
            "#num_parents": 1,
            "#radix_ph": "0x68971271b6018c8827230bb696d7d2661ebb286f95851e72da889e1af6b22721",
            "#serial": 2,
            "#tree_bytes": 408,
            "#tree_height": 4,
            "#tree_size": 40,
            "#version": "ver",
          },
          "2002": {
            "#state_ph": "childStateNodePH2",
            "#version": "childStateNodeVer2",
          },
          "2022": {
            "2022": {
              "#state_ph": "childStateNodePH22",
              "#version": "childStateNodeVer22",
            },
            "#num_parents": 1,
            "#radix_ph": "0xba9d1dcddd02911d1d260f8acd4e3857174d98a57e6b3c7e0577c8a07056b057",
            "#serial": 1,
            "#tree_bytes": 508,
            "#tree_height": 5,
            "#tree_size": 50,
            "#version": "ver",
          },
          "#num_parents": 1,
          "#radix_ph": "0xa324889bbe8fe5189103966387ec9521bcae57046727f77496fe19e7d0b333ab",
          "#serial": 4,
          "#tree_bytes": 1224,
          "#tree_height": 5,
          "#tree_size": 120,
          "#version": "ver",
        },
        "#num_parents": 2,
        "#radix_ph": "0xeeea0db0b065dd84b326e2852d48d3f8738b2bb220f9dd7e4f2db756915da13e",
        "#serial": 0,
        "#tree_bytes": 1540,
        "#tree_height": 5,
        "#tree_size": 150,
        "#version": "ver",
        "0000": {
          "#state_ph": "stateNodePH",
          "#version": "stateNodeVer",
        }
      });
    });
  });
});
