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
  })

  describe("Initialization / reset", () => {
    it("constructor", () => {
      expect(node.version).to.equal(null);
      expect(node.stateNode).to.equal(null);
      expect(node.labelRadix).to.equal('');
      expect(node.labelSuffix).to.equal('');
      expect(node.parentSet.size).to.equal(0);
      expect(node.radixChildMap.size).to.equal(0);
      expect(node.proofHash).to.equal(null);
      expect(node.treeHeight).to.equal(0);
      expect(node.treeSize).to.equal(0);
      expect(node.treeBytes).to.equal(0);
    });

    it("reset", () => {
      const stateNode = new StateNode();
      const version = 'ver';
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
      node.setStateNode(stateNode);
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
      expect(node.stateNode).to.equal(null);
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

  describe("stateNode", () => {
    it("get / set / has / reset", () => {
      const stateNode = new StateNode();
      expect(node.getStateNode()).to.equal(null);
      expect(node.hasStateNode()).to.equal(false);
      expect(node.setStateNode(stateNode)).to.equal(true);
      expect(node.getStateNode()).to.equal(stateNode);
      expect(node.hasStateNode()).to.equal(true);
      node.resetStateNode();
      expect(node.getStateNode()).to.equal(null);
      expect(node.hasStateNode()).to.equal(false);
    });

    it("set with invalid state node", () => {
      const invalidStateNode = new RadixNode();
      expect(node.setStateNode(invalidStateNode)).to.equal(false);
      expect(node.setStateNode('')).to.equal(false);
      expect(node.setStateNode(true)).to.equal(false);
      expect(node.setStateNode(null)).to.equal(false);
      expect(node.setStateNode(undefined)).to.equal(false);
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
      expect(node.hasParent()).to.equal(false);
      expect(node.hasParent(parent1)).to.equal(false);
      expect(node.hasParent(parent2)).to.equal(false);
      node.addParent(parent1);
      expect(node.numParents()).to.equal(1);
      assert.deepEqual(node.getParentNodes(), [parent1]);
      expect(node.hasParent()).to.equal(true);
      expect(node.hasParent(parent1)).to.equal(true);
      expect(node.hasParent(parent2)).to.equal(false);
      node.addParent(parent2);
      expect(node.numParents()).to.equal(2);
      assert.deepEqual(node.getParentNodes(), [parent1, parent2]);
      expect(node.hasParent()).to.equal(true);
      expect(node.hasParent(parent1)).to.equal(true);
      expect(node.hasParent(parent2)).to.equal(true);
      node.deleteParent(parent1);
      expect(node.numParents()).to.equal(1);
      assert.deepEqual(node.getParentNodes(), [parent2]);
      expect(node.hasParent()).to.equal(true);
      expect(node.hasParent(parent1)).to.equal(false);
      expect(node.hasParent(parent2)).to.equal(true);
      node.deleteParent(parent2);
      expect(node.numParents()).to.equal(0);
      assert.deepEqual(node.getParentNodes(), []);
      expect(node.hasParent()).to.equal(false);
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

      expect(node.hasChild()).to.equal(false);
      expect(node.hasChild(labelRadix1)).to.equal(false);
      expect(node.hasChild(labelRadix2)).to.equal(false);
      expect(node.getChild(labelRadix1)).to.equal(null);
      expect(node.getChild(labelRadix2)).to.equal(null);
      expect(node.numChildren()).to.equal(0);
      assert.deepEqual(node.getChildLabelRadices(), []);
      assert.deepEqual(node.getChildNodes(), []);

      expect(child1.hasParent()).to.equal(false);
      expect(child1.numParents()).to.equal(0);
      expect(child1.getLabelRadix()).to.equal('');
      expect(child1.getLabelSuffix()).to.equal('');

      expect(child2.hasParent()).to.equal(false);
      expect(child2.numParents()).to.equal(0);
      expect(child2.getLabelRadix()).to.equal('');
      expect(child2.getLabelSuffix()).to.equal('');

      // setChild() with child1
      node.setChild(labelRadix1, labelSuffix1, child1);
      expect(node.hasChild()).to.equal(true);
      expect(node.hasChild(labelRadix1)).to.equal(true);
      expect(node.hasChild(labelRadix2)).to.equal(false);
      expect(node.getChild(labelRadix1)).to.equal(child1);
      expect(node.getChild(labelRadix2)).to.equal(null);
      expect(node.numChildren()).to.equal(1);
      assert.deepEqual(node.getChildLabelRadices(), [labelRadix1]);
      assert.deepEqual(node.getChildNodes(), [child1]);

      expect(child1.hasParent()).to.equal(true);
      expect(child1.hasParent(node)).to.equal(true);
      expect(child1.numParents()).to.equal(1);
      expect(child1.getLabelRadix()).to.equal(labelRadix1);
      expect(child1.getLabelSuffix()).to.equal(labelSuffix1);

      expect(child2.hasParent()).to.equal(false);
      expect(child2.numParents()).to.equal(0);
      expect(child2.getLabelRadix()).to.equal('');
      expect(child2.getLabelSuffix()).to.equal('');

      // setChild() with child2
      node.setChild(labelRadix2, labelSuffix2, child2);
      expect(node.hasChild()).to.equal(true);
      expect(node.hasChild(labelRadix1)).to.equal(true);
      expect(node.hasChild(labelRadix2)).to.equal(true);
      expect(node.getChild(labelRadix1)).to.equal(child1);
      expect(node.getChild(labelRadix2)).to.equal(child2);
      expect(node.numChildren()).to.equal(2);
      assert.deepEqual(node.getChildLabelRadices(), [labelRadix1, labelRadix2]);
      assert.deepEqual(node.getChildNodes(), [child1, child2]);

      expect(child1.hasParent()).to.equal(true);
      expect(child1.hasParent(node)).to.equal(true);
      expect(child1.numParents()).to.equal(1);
      expect(child1.getLabelRadix()).to.equal(labelRadix1);
      expect(child1.getLabelSuffix()).to.equal(labelSuffix1);

      expect(child2.hasParent()).to.equal(true);
      expect(child2.hasParent(node)).to.equal(true);
      expect(child2.numParents()).to.equal(1);
      expect(child2.getLabelRadix()).to.equal(labelRadix2);
      expect(child2.getLabelSuffix()).to.equal(labelSuffix2);

      // deleteChild() with child1
      node.deleteChild(labelRadix1);

      expect(node.hasChild()).to.equal(true);
      expect(node.hasChild(labelRadix1)).to.equal(false);
      expect(node.hasChild(labelRadix2)).to.equal(true);
      expect(node.getChild(labelRadix1)).to.equal(null);
      expect(node.getChild(labelRadix2)).to.equal(child2);
      expect(node.numChildren()).to.equal(1);
      assert.deepEqual(node.getChildLabelRadices(), [labelRadix2]);
      assert.deepEqual(node.getChildNodes(), [child2]);

      expect(child1.hasParent()).to.equal(false);
      expect(child1.numParents()).to.equal(0);
      expect(child1.getLabelRadix()).to.equal('');
      expect(child1.getLabelSuffix()).to.equal('');

      expect(child2.hasParent()).to.equal(true);
      expect(child2.hasParent(node)).to.equal(true);
      expect(child2.numParents()).to.equal(1);
      expect(child2.getLabelRadix()).to.equal(labelRadix2);
      expect(child2.getLabelSuffix()).to.equal(labelSuffix2);

      // deleteChild() with child2
      node.deleteChild(labelRadix2);

      expect(node.hasChild()).to.equal(false);
      expect(node.hasChild(labelRadix1)).to.equal(false);
      expect(node.hasChild(labelRadix2)).to.equal(false);
      expect(node.getChild(labelRadix1)).to.equal(null);
      expect(node.getChild(labelRadix2)).to.equal(null);
      expect(node.numChildren()).to.equal(0);
      assert.deepEqual(node.getChildLabelRadices(), []);
      assert.deepEqual(node.getChildNodes(), []);

      expect(child1.hasParent()).to.equal(false);
      expect(child1.numParents()).to.equal(0);
      expect(child1.getLabelRadix()).to.equal('');
      expect(child1.getLabelSuffix()).to.equal('');

      expect(child2.hasParent()).to.equal(false);
      expect(child2.numParents()).to.equal(0);
      expect(child2.getLabelRadix()).to.equal('');
      expect(child2.getLabelSuffix()).to.equal('');
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
      node.setStateNode(stateNode);

      stateNode1 = new StateNode();
      stateNode1.setProofHash(stateNodePH1);
      child1.setStateNode(stateNode1);

      stateNode11 = new StateNode();
      stateNode11.setProofHash(stateNodePH11);
      child11.setStateNode(stateNode11);

      stateNode12 = new StateNode();
      stateNode12.setProofHash(stateNodePH12);
      child12.setStateNode(stateNode12);

      stateNode21 = new StateNode();
      stateNode21.setProofHash(stateNodePH21);
      child21.setStateNode(stateNode21);

      stateNode22 = new StateNode();
      stateNode22.setProofHash(stateNodePH22);
      child22.setStateNode(stateNode22);
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

      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);

      assert.deepEqual(node.toJsObject(false, true), {
        "1001": {
          ".label": null,
          ".proof_hash": "stateNodePH1",
          ".radix_ph": "childPH1"
        },
        "2002": {
          ".radix_ph": "childPH2"
        },
        ".label": null,
        ".proof_hash": "stateNodePH",
        ".radix_ph": null
      });

      // With stateNode
      node.setStateNode(stateNode);
      const treeInfo = node.buildRadixInfo();
      const preimage1 = `${stateNodePH}${HASH_DELIMITER}${HASH_DELIMITER}` +
          `${labelRadix1}${labelSuffix1}${HASH_DELIMITER}${childPH1}` +
          `${HASH_DELIMITER}${labelRadix2}${labelSuffix2}${HASH_DELIMITER}${childPH2}`;
      const proofHash1 = CommonUtil.hashString(preimage1);
      expect(treeInfo.proofHash).to.equal(proofHash1)

      expect(treeInfo.treeHeight).to.equal(Math.max(stateNodeTH, childTH1, childTH2));
      expect(treeInfo.treeSize).to.equal(stateNodeTS + childTS1 + childTS2);
      expect(treeInfo.treeBytes).to.equal(stateNodeTB + childTB1 + childTB2);

      // Without stateNode
      node.resetStateNode();
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

      node.setStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);

      assert.deepEqual(node.toJsObject(false, true), {
        "1001": {
          ".label": null,
          ".proof_hash": "stateNodePH1",
          ".radix_ph": "childPH1"
        },
        "2002": {
          ".radix_ph": "childPH2"
        },
        ".label": null,
        ".proof_hash": "stateNodePH",
        ".radix_ph": null
      });

      // Check radix info
      node.resetProofHash();
      expect(node.verifyRadixInfo()).to.equal(false);
      node.updateRadixInfo();
      expect(node.verifyRadixInfo()).to.equal(true);
    });

    it("updateRadixInfoForRadixTree", () => {
      node.setStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);
      child1.setChild(labelRadix11, labelSuffix11, child11);
      child1.setChild(labelRadix12, labelSuffix12, child12);
      child2.setChild(labelRadix21, labelSuffix21, child21);
      child2.setChild(labelRadix22, labelSuffix22, child22);

      assert.deepEqual(node.toJsObject(false, true), {
        "1001": {
          "1011": {
            ".label": null,
            ".proof_hash": "stateNodePH11",
            ".radix_ph": null
          },
          "2012": {
            ".label": null,
            ".proof_hash": "stateNodePH12",
            ".radix_ph": null
          },
          ".label": null,
          ".proof_hash": "stateNodePH1",
          ".radix_ph": null
        },
        "2002": {
          "1021": {
            ".label": null,
            ".proof_hash": "stateNodePH21",
            ".radix_ph": null
          },
          "2022": {
            ".label": null,
            ".proof_hash": "stateNodePH22",
            ".radix_ph": null
          },
          ".radix_ph": null
        },
        ".label": null,
        ".proof_hash": "stateNodePH",
        ".radix_ph": null
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
      node.setStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);
      child1.setChild(labelRadix11, labelSuffix11, child11);
      child1.setChild(labelRadix12, labelSuffix12, child12);
      child2.setChild(labelRadix21, labelSuffix21, child21);
      child2.setChild(labelRadix22, labelSuffix22, child22);

      assert.deepEqual(node.toJsObject(false, true), {
        "1001": {
          "1011": {
            ".label": null,
            ".proof_hash": "stateNodePH11",
            ".radix_ph": null
          },
          "2012": {
            ".label": null,
            ".proof_hash": "stateNodePH12",
            ".radix_ph": null
          },
          ".label": null,
          ".proof_hash": "stateNodePH1",
          ".radix_ph": null
        },
        "2002": {
          "1021": {
            ".label": null,
            ".proof_hash": "stateNodePH21",
            ".radix_ph": null
          },
          "2022": {
            ".label": null,
            ".proof_hash": "stateNodePH22",
            ".radix_ph": null
          },
          ".radix_ph": null
        },
        ".label": null,
        ".proof_hash": "stateNodePH",
        ".radix_ph": null
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
      node.setStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);
      child1.setChild(labelRadix11, labelSuffix11, child11);
      child1.setChild(labelRadix12, labelSuffix12, child12);
      child2.setChild(labelRadix21, labelSuffix21, child21);
      child2.setChild(labelRadix22, labelSuffix22, child22);

      assert.deepEqual(node.toJsObject(false, true), {
        "1001": {
          "1011": {
            ".label": null,
            ".proof_hash": "stateNodePH11",
            ".radix_ph": null
          },
          "2012": {
            ".label": null,
            ".proof_hash": "stateNodePH12",
            ".radix_ph": null
          },
          ".label": null,
          ".proof_hash": "stateNodePH1",
          ".radix_ph": null
        },
        "2002": {
          "1021": {
            ".label": null,
            ".proof_hash": "stateNodePH21",
            ".radix_ph": null
          },
          "2022": {
            ".label": null,
            ".proof_hash": "stateNodePH22",
            ".radix_ph": null
          },
          ".radix_ph": null
        },
        ".label": null,
        ".proof_hash": "stateNodePH",
        ".radix_ph": null
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

      node.setStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);
      child1.setChild(labelRadix11, labelSuffix11, child11);
      child1.setChild(labelRadix12, labelSuffix12, child12);
      child2.setChild(labelRadix21, labelSuffix21, child21);
      child2.setChild(labelRadix22, labelSuffix22, child22);

      expect(node.updateRadixInfoForRadixTree()).to.equal(7);

      assert.deepEqual(node.toJsObject(false, true), {
        "1001": {
          "1011": {
            ".label": "stateLabel11",
            ".proof_hash": "stateNodePH11",
            ".radix_ph": "0xac8e0ca829cea8d80a79260078fb8e1b38a05b6d087c72a1c92f63849a47b96b"
          },
          "2012": {
            ".label": "stateLabel12",
            ".proof_hash": "stateNodePH12",
            ".radix_ph": "0x7fc53637a6ff6b7efa8cf7c9ba95552ed7479262ad8c07a61b4d2b1e8002d360"
          },
          ".label": "stateLabel1",
          ".proof_hash": "stateNodePH1",
          ".radix_ph": "0xd56eaf71ba15b95bf26276fe9ce88a4977a71271405c88aeb4f4efd5e34a8399"
        },
        "2002": {
          "1021": {
            ".label": "stateLabel21",
            ".proof_hash": "stateNodePH21",
            ".radix_ph": "0xa8c806fde336879bd0cb320c809ad8a1f6e1e526711ed239eb216f83e4fb19d7"
          },
          "2022": {
            ".label": "stateLabel22",
            ".proof_hash": "stateNodePH22",
            ".radix_ph": "0x0dd8afcb4c2839ff30e6872c7268f9ed687fd53c52ce78f0330de82d5b33a0a2"
          },
          ".radix_ph": "0x763902e3186ec54e6a4bc3a2c01f57f60628d95a27a380a3ec2cea9e68c3928c"
        },
        ".label": "stateLabel",
        ".proof_hash": "stateNodePH",
        ".radix_ph": "0x3142cb3647c2861969c8df0a524336460d6c708c80bec5519bcf1437964ff9e0"
      });

      const label11 = labelRadix11 + labelSuffix11;
      const label21 = labelRadix21 + labelSuffix21;

      // on a node with state node value with child label and child proof
      assert.deepEqual(child1.getProofOfRadixNode(label11, 'childProof11', null), {
        "1011": "childProof11",
        "2012": {
          ".radix_ph": "0x7fc53637a6ff6b7efa8cf7c9ba95552ed7479262ad8c07a61b4d2b1e8002d360"
        },
        ".label": "stateLabel1",
        ".proof_hash": "stateNodePH1",
        ".radix_ph": "0xd56eaf71ba15b95bf26276fe9ce88a4977a71271405c88aeb4f4efd5e34a8399"
      });

      // on a node without state node value with child label and child proof
      assert.deepEqual(child2.getProofOfRadixNode(label21, 'childProof21', null), {
        "1021": "childProof21",
        "2022": {
          ".radix_ph": "0x0dd8afcb4c2839ff30e6872c7268f9ed687fd53c52ce78f0330de82d5b33a0a2"
        },
        ".radix_ph": "0x763902e3186ec54e6a4bc3a2c01f57f60628d95a27a380a3ec2cea9e68c3928c"
      });

      // on a node with state node value with state label/proof
      assert.deepEqual(child1.getProofOfRadixNode(null, null, 'stateProof1'), {
        ".label": "stateLabel1",
        ".proof_hash": "stateProof1",
        ".radix_ph": "0xd56eaf71ba15b95bf26276fe9ce88a4977a71271405c88aeb4f4efd5e34a8399"
      });

      // on a node without state node value with state label/proof
      assert.deepEqual(child2.getProofOfRadixNode(null, null, 'stateProof2'), {
        ".radix_ph": "0x763902e3186ec54e6a4bc3a2c01f57f60628d95a27a380a3ec2cea9e68c3928c"
      });
    });
  });

  describe("utils", () => {
    const version = 'ver';

    let stateNode;
    let stateNode1;
    let stateNode2;
    let stateNode21;
    let stateNode22;
    let child1;
    let child2;
    let child21;
    let child22;

    beforeEach(() => {
      stateNode = new StateNode();
      stateNode.setVersion('stateNodeVer');
      stateNode.setProofHash('stateNodePH');
      stateNode.setTreeHeight(1);
      stateNode.setTreeSize(10);
      stateNode.setTreeBytes(100);

      stateNode1 = new StateNode();
      stateNode1.setVersion('stateNodeVer1');
      stateNode1.setProofHash('stateNodePH1');
      stateNode1.setTreeHeight(2);
      stateNode1.setTreeSize(20);
      stateNode1.setTreeBytes(200);

      stateNode2 = new StateNode();
      stateNode2.setVersion('stateNodeVer2');
      stateNode2.setProofHash('stateNodePH2');
      stateNode2.setTreeHeight(3);
      stateNode2.setTreeSize(30);
      stateNode2.setTreeBytes(300);

      stateNode21 = new StateNode();
      stateNode21.setVersion('stateNodeVer21');
      stateNode21.setProofHash('stateNodePH21');
      stateNode21.setTreeHeight(4);
      stateNode21.setTreeSize(40);
      stateNode21.setTreeBytes(400);

      stateNode22 = new StateNode();
      stateNode22.setVersion('stateNodeVer22');
      stateNode22.setProofHash('stateNodePH22');
      stateNode22.setTreeHeight(5);
      stateNode22.setTreeSize(50);
      stateNode22.setTreeBytes(500);

      node.setVersion(version);
      child1 = new RadixNode();
      child1.setVersion(version);
      child1.setStateNode(stateNode1);

      child2 = new RadixNode();
      child2.setVersion(version);
      child2.setStateNode(stateNode2);

      child21 = new RadixNode();
      child21.setVersion(version);
      child21.setStateNode(stateNode21);

      child22 = new RadixNode();
      child22.setVersion(version);
      child22.setStateNode(stateNode22);

      node.setChild('1', '001', child1);
      node.setChild('2', '002', child2);
      child2.setChild('1', '021', child21);
      child2.setChild('2', '022', child22);

      stateNode1.setLabel('1001');
      stateNode2.setLabel('2002');
      stateNode21.setLabel('1021');
      stateNode22.setLabel('2022');

      node.updateRadixInfoForRadixTree();
    });

    it("copyFrom", () => {
      const newParentStateNode = new StateNode();
      const terminalNodeMap = new Map();
      const newNode = new RadixNode();
      newNode.copyFrom(node, newParentStateNode, terminalNodeMap);
      assert.deepEqual(newNode.toJsObject(false, true, true), {
        "1001": {
          ".label": "1001",
          ".proof_hash": "stateNodePH1",
          ".radix_ph": "0xc6b77f2d527751603d41b89bb7bac0d2a51dfdb3636b37f6d0792676bbe48795",
          ".tree_bytes": 208,
          ".tree_height": 2,
          ".tree_size": 20
        },
        "2002": {
          "1021": {
            ".label": "1021",
            ".proof_hash": "stateNodePH21",
            ".radix_ph": "0xa8c806fde336879bd0cb320c809ad8a1f6e1e526711ed239eb216f83e4fb19d7",
            ".tree_bytes": 408,
            ".tree_height": 4,
            ".tree_size": 40
          },
          "2022": {
            ".label": "2022",
            ".proof_hash": "stateNodePH22",
            ".radix_ph": "0x0dd8afcb4c2839ff30e6872c7268f9ed687fd53c52ce78f0330de82d5b33a0a2",
            ".tree_bytes": 508,
            ".tree_height": 5,
            ".tree_size": 50
          },
          ".label": "2002",
          ".proof_hash": "stateNodePH2",
          ".radix_ph": "0x5587f3fd7b1217631c9e4d531dbd3084eb902913bdbf5d096d4b8eb16585af7a",
          ".tree_bytes": 1224,
          ".tree_height": 5,
          ".tree_size": 120
        },
        ".radix_ph": "0x22962a7f8fabb4acd8e48d79a9cb5556a99aa796e78da3a6864b58466ae3d772",
        ".tree_bytes": 1432,
        ".tree_height": 5,
        ".tree_size": 140
      });
      assert.deepEqual(newNode.toJsObject(false, true, true), node.toJsObject(false, true, true));
      // Check terminalNodeMap
      expect(terminalNodeMap.size).to.equal(4);
      expect(terminalNodeMap.has('1001')).to.equal(true);
      expect(terminalNodeMap.has('2002')).to.equal(true);
      expect(terminalNodeMap.has('1021')).to.equal(true);
      expect(terminalNodeMap.has('2022')).to.equal(true);
      // Check parents of state nodes
      assert.deepEqual(stateNode1.getParentNodes(), [newParentStateNode]);
      assert.deepEqual(stateNode2.getParentNodes(), [newParentStateNode]);
      assert.deepEqual(stateNode21.getParentNodes(), [newParentStateNode]);
      assert.deepEqual(stateNode22.getParentNodes(), [newParentStateNode]);
    });

    it("deleteRadixTree without parentStateNodeToDelete", () => {
      const parentStateNode = new StateNode();
      stateNode1.addParent(parentStateNode);
      stateNode2.addParent(parentStateNode);
      stateNode21.addParent(parentStateNode);
      stateNode22.addParent(parentStateNode);
      const parentRadixNode = new RadixNode();
      node.addParent(parentRadixNode);

      // parentStateNodeToDelete = null
      expect(node.deleteRadixTree()).to.equal(5);
      // Check parents of state nodes
      assert.deepEqual(stateNode1.getParentNodes(), [parentStateNode]);
      assert.deepEqual(stateNode2.getParentNodes(), [parentStateNode]);
      assert.deepEqual(stateNode21.getParentNodes(), [parentStateNode]);
      assert.deepEqual(stateNode22.getParentNodes(), [parentStateNode]);
      // Check radix nodes
      expect(node.hasStateNode()).to.equal(false);
      expect(child1.hasStateNode()).to.equal(false);
      expect(child2.hasStateNode()).to.equal(false);
      expect(child21.hasStateNode()).to.equal(false);
      expect(child22.hasStateNode()).to.equal(false);
      // Checks numChildren of radix node
      expect(node.numChildren()).to.equal(0);
      expect(child1.numChildren()).to.equal(0);
      expect(child2.numChildren()).to.equal(0);
      expect(child21.numChildren()).to.equal(0);
      expect(child22.numChildren()).to.equal(0);
      // Checks hasParent of radix node
      expect(node.hasParent()).to.equal(false);
      expect(child1.hasParent()).to.equal(false);
      expect(child2.hasParent()).to.equal(false);
      expect(child21.hasParent()).to.equal(false);
      expect(child22.hasParent()).to.equal(false);
    });

    it("deleteRadixTree with parentStateNodeToDelete", () => {
      const parentStateNode = new StateNode();
      stateNode1.addParent(parentStateNode);
      stateNode2.addParent(parentStateNode);
      stateNode21.addParent(parentStateNode);
      stateNode22.addParent(parentStateNode);

      // parentStateNodeToDelete !== null
      expect(node.deleteRadixTree(parentStateNode)).to.equal(5);
      // Check parents of state nodes
      assert.deepEqual(stateNode1.getParentNodes(), []);
      assert.deepEqual(stateNode2.getParentNodes(), []);
      assert.deepEqual(stateNode21.getParentNodes(), []);
      assert.deepEqual(stateNode22.getParentNodes(), []);
    });

    it("toJsObject", () => {
      assert.deepEqual(node.toJsObject(), {
        "1001": {
          ".label": "1001",
          ".proof_hash": "stateNodePH1"
        },
        "2002": {
          "1021": {
            ".label": "1021",
            ".proof_hash": "stateNodePH21"
          },
          "2022": {
            ".label": "2022",
            ".proof_hash": "stateNodePH22"
          },
          ".label": "2002",
          ".proof_hash": "stateNodePH2"
        }
      });
      assert.deepEqual(node.toJsObject(true, true, true), {
        "1001": {
          ".label": "1001",
          ".proof_hash": "stateNodePH1",
          ".radix_ph": "0xc6b77f2d527751603d41b89bb7bac0d2a51dfdb3636b37f6d0792676bbe48795",
          ".radix_version": "ver",
          ".tree_bytes": 208,
          ".tree_height": 2,
          ".tree_size": 20,
          ".version": "stateNodeVer1"
        },
        "2002": {
          "1021": {
            ".label": "1021",
            ".proof_hash": "stateNodePH21",
            ".radix_ph": "0xa8c806fde336879bd0cb320c809ad8a1f6e1e526711ed239eb216f83e4fb19d7",
            ".radix_version": "ver",
            ".tree_bytes": 408,
            ".tree_height": 4,
            ".tree_size": 40,
            ".version": "stateNodeVer21"
          },
          "2022": {
            ".label": "2022",
            ".proof_hash": "stateNodePH22",
            ".radix_ph": "0x0dd8afcb4c2839ff30e6872c7268f9ed687fd53c52ce78f0330de82d5b33a0a2",
            ".radix_version": "ver",
            ".tree_bytes": 508,
            ".tree_height": 5,
            ".tree_size": 50,
            ".version": "stateNodeVer22"
          },
          ".label": "2002",
          ".proof_hash": "stateNodePH2",
          ".radix_ph": "0x5587f3fd7b1217631c9e4d531dbd3084eb902913bdbf5d096d4b8eb16585af7a",
          ".radix_version": "ver",
          ".tree_bytes": 1224,
          ".tree_height": 5,
          ".tree_size": 120,
          ".version": "stateNodeVer2"
        },
        ".radix_ph": "0x22962a7f8fabb4acd8e48d79a9cb5556a99aa796e78da3a6864b58466ae3d772",
        ".radix_version": "ver",
        ".tree_bytes": 1432,
        ".tree_height": 5,
        ".tree_size": 140
      });
    });
  });
});
