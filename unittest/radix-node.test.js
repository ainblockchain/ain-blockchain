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

  describe("Initialization", () => {
    it("constructor", () => {
      expect(node.stateNode).to.equal(null);
      expect(node.labelRadix).to.equal('');
      expect(node.labelSuffix).to.equal('');
      expect(node.parent).to.equal(null);
      expect(node.radixChildMap.size).to.equal(0);
      expect(node.proofHash).to.equal(null);
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

    it("get / set / has / delete with a child with valid labels", () => {
      const labelRadix = '0';
      const labelSuffix = 'ffff';
      const child = new RadixNode();

      expect(node.hasStateNode()).to.equal(false);
      expect(node.getLabelRadix()).to.equal('');
      expect(node.getLabelSuffix()).to.equal('');
      expect(node.hasParent()).to.equal(false);
      expect(node.hasChild()).to.equal(false);
      expect(node.getChild(labelRadix)).to.equal(null);
      assert.deepEqual(node.getChildLabelRadices(), []);
      assert.deepEqual(node.getChildNodes(), []);
      expect(node.numChildren()).to.equal(0);

      expect(child.hasStateNode()).to.equal(false);
      expect(child.getLabelRadix()).to.equal('');
      expect(child.getLabelSuffix()).to.equal('');
      expect(child.hasParent()).to.equal(false);
      expect(child.hasChild()).to.equal(false);
      assert.deepEqual(child.getChildLabelRadices(), []);
      assert.deepEqual(child.getChildNodes(), []);
      expect(child.numChildren()).to.equal(0);

      // setChild()
      node.setChild(labelRadix, labelSuffix, child);

      expect(node.hasStateNode()).to.equal(false);
      expect(node.getLabelRadix()).to.equal('');
      expect(node.getLabelSuffix()).to.equal('');
      expect(node.hasParent()).to.equal(false);
      expect(node.hasChild()).to.equal(true);
      expect(node.getChild(labelRadix)).to.equal(child);
      assert.deepEqual(node.getChildLabelRadices(), [labelRadix]);
      assert.deepEqual(node.getChildNodes(), [child]);
      expect(node.numChildren()).to.equal(1);

      expect(child.hasStateNode()).to.equal(false);
      expect(child.getLabelRadix()).to.equal(labelRadix);
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
      expect(node.getLabelRadix()).to.equal('');
      expect(node.getLabelSuffix()).to.equal('');
      expect(node.hasParent()).to.equal(false);
      expect(node.hasChild()).to.equal(false);
      expect(node.getChild(labelRadix)).to.equal(null);
      assert.deepEqual(node.getChildLabelRadices(), []);
      assert.deepEqual(node.getChildNodes(), []);
      expect(node.numChildren()).to.equal(0);

      expect(child.hasStateNode()).to.equal(false);
      expect(child.getLabelRadix()).to.equal('');
      expect(child.getLabelSuffix()).to.equal('');
      expect(child.hasParent()).to.equal(false);
      expect(child.hasChild()).to.equal(false);
      assert.deepEqual(child.getChildLabelRadices(), []);
      assert.deepEqual(child.getChildNodes(), []);
      expect(child.numChildren()).to.equal(0);
    });

    it("get / set / has / delete with children with valid labels", () => {
      const labelRadix1 = '0';
      const labelSuffix1 = '0000';
      const child1 = new RadixNode();

      const labelRadix2 = '1';
      const labelSuffix2 = '1111';
      const child2 = new RadixNode();

      // setChild() with child1
      node.setChild(labelRadix1, labelSuffix1, child1);
      expect(node.hasStateNode()).to.equal(false);
      expect(node.getLabelRadix()).to.equal('');
      expect(node.getLabelSuffix()).to.equal('');
      expect(node.hasParent()).to.equal(false);
      expect(node.hasChild()).to.equal(true);
      expect(node.getChild(labelRadix1)).to.equal(child1);
      expect(node.getChild(labelRadix2)).to.equal(null);
      assert.deepEqual(node.getChildLabelRadices(), [labelRadix1]);
      assert.deepEqual(node.getChildNodes(), [child1]);
      expect(node.numChildren()).to.equal(1);

      expect(child1.hasStateNode()).to.equal(false);
      expect(child1.getLabelRadix()).to.equal(labelRadix1);
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
      expect(node.getLabelRadix()).to.equal('');
      expect(node.getLabelSuffix()).to.equal('');
      expect(node.hasParent()).to.equal(false);
      expect(node.hasChild()).to.equal(true);
      expect(node.getChild(labelRadix1)).to.equal(child1);
      expect(node.getChild(labelRadix2)).to.equal(child2);
      assert.deepEqual(node.getChildLabelRadices(), [labelRadix1, labelRadix2]);
      assert.deepEqual(node.getChildNodes(), [child1, child2]);
      expect(node.numChildren()).to.equal(2);

      expect(child1.hasStateNode()).to.equal(false);
      expect(child1.getLabelRadix()).to.equal(labelRadix1);
      expect(child1.getLabelSuffix()).to.equal(labelSuffix1);
      expect(child1.hasParent()).to.equal(true);
      expect(child1.getParent()).to.equal(node);
      expect(child1.hasChild()).to.equal(false);
      assert.deepEqual(child1.getChildLabelRadices(), []);
      assert.deepEqual(child1.getChildNodes(), []);
      expect(child1.numChildren()).to.equal(0);

      expect(child2.hasStateNode()).to.equal(false);
      expect(child1.getLabelRadix()).to.equal(labelRadix1);
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
      expect(node.getLabelRadix()).to.equal('');
      expect(node.getLabelSuffix()).to.equal('');
      expect(node.hasParent()).to.equal(false);
      expect(node.getChild(labelRadix1)).to.equal(null);
      expect(node.getChild(labelRadix2)).to.equal(child2);
      expect(node.hasChild()).to.equal(true);
      assert.deepEqual(node.getChildLabelRadices(), [labelRadix2]);
      assert.deepEqual(node.getChildNodes(), [child2]);
      expect(node.numChildren()).to.equal(1);

      expect(child1.hasStateNode()).to.equal(false);
      expect(child1.getLabelRadix()).to.equal('');
      expect(child1.getLabelSuffix()).to.equal('');
      expect(child1.hasParent()).to.equal(false);
      expect(child1.hasChild()).to.equal(false);
      assert.deepEqual(child1.getChildLabelRadices(), []);
      assert.deepEqual(child1.getChildNodes(), []);
      expect(child1.numChildren()).to.equal(0);

      expect(child2.hasStateNode()).to.equal(false);
      expect(child2.getLabelRadix()).to.equal(labelRadix2);
      expect(child2.getLabelSuffix()).to.equal(labelSuffix2);
      expect(child2.hasParent()).to.equal(true);
      expect(child2.getParent()).to.equal(node);
      expect(child2.hasChild()).to.equal(false);
      assert.deepEqual(child2.getChildLabelRadices(), []);
      assert.deepEqual(child2.getChildNodes(), []);
      expect(child2.numChildren()).to.equal(0);
    });
  });

  describe("proofHash", () => {
    const labelRadix1 = '1';
    const labelSuffix1 = '100';
    let child1;

    const labelRadix2 = '2';
    const labelSuffix2 = '200';
    let child2;

    const labelRadix11 = '1';
    const labelSuffix11 = '110';
    let child11;

    const labelRadix12 = '2';
    const labelSuffix12 = '120';
    let child12;

    const labelRadix21 = '1';
    const labelSuffix21 = '210';
    let child21;

    const labelRadix22 = '2';
    const labelSuffix22 = '220';
    let child22;

    let stateNode;
    const stateNodePH = 'stateNodePH';

    let stateNode1;
    const stateNodePH1 = 'stateNodePH1';

    let stateNode2;
    const stateNodePH2 = 'stateNodePH2';

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

    it("get / set / has / reset", () => {
      const proofHash = 'proofHash';

      expect(node.getProofHash()).to.equal(null);
      node.setProofHash(proofHash);
      expect(node.getProofHash()).to.equal(proofHash);
      node.resetProofHash();
      expect(node.getProofHash()).to.equal(null);
    });

    it("build", () => {
      const childPH1 = 'childPH1';
      const childPH2 = 'childPH2';

      child1.setProofHash(childPH1);
      child2.setProofHash(childPH2);

      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);

      assert.deepEqual(node.toJsObject(true), {
        "1100": {
          ".label": null,
          ".proof_hash": "stateNodePH1",
          ".radix_ph": "childPH1"
        },
        "2200": {
          ".radix_ph": "childPH2"
        },
        ".label": null,
        ".proof_hash": "stateNodePH",
        ".radix_ph": null
      });

      // With stateNode
      node.setStateNode(stateNode);
      const preimage2 = `${stateNodePH}${HASH_DELIMITER}${HASH_DELIMITER}` +
          `${labelRadix1}${labelSuffix1}${HASH_DELIMITER}${childPH1}` +
          `${HASH_DELIMITER}${labelRadix2}${labelSuffix2}${HASH_DELIMITER}${childPH2}`;
      const proofHash2 = CommonUtil.hashString(preimage2);
      expect(node._buildProofHash()).to.equal(proofHash2)

      // Without stateNode
      node.resetStateNode();
      const preimage1 = `${HASH_DELIMITER}${HASH_DELIMITER}` +
          `${labelRadix1}${labelSuffix1}${HASH_DELIMITER}${childPH1}` +
          `${HASH_DELIMITER}${labelRadix2}${labelSuffix2}${HASH_DELIMITER}${childPH2}`;
      const proofHash1 = CommonUtil.hashString(preimage1);
      expect(node._buildProofHash()).to.equal(proofHash1)
    });

    it("update / verify", () => {
      const childPH1 = 'childPH1';
      const childPH2 = 'childPH2';

      child1.setProofHash(childPH1);
      child2.setProofHash(childPH2);

      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);

      assert.deepEqual(node.toJsObject(true), {
        "1100": {
          ".label": null,
          ".proof_hash": "stateNodePH1",
          ".radix_ph": "childPH1"
        },
        "2200": {
          ".radix_ph": "childPH2"
        },
        ".label": null,
        ".proof_hash": "stateNodePH",
        ".radix_ph": null
      });

      node.resetProofHash();
      expect(node.verifyProofHash()).to.equal(false);
      node.updateProofHash();
      expect(node.verifyProofHash()).to.equal(true);
      expect(node.getProofHash()).to.equal(node._buildProofHash());
    });

    it("updateProofHashForRadixSubtree", () => {
      node.setStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);
      child1.setChild(labelRadix11, labelSuffix11, child11);
      child1.setChild(labelRadix12, labelSuffix12, child12);
      child2.setChild(labelRadix21, labelSuffix21, child21);
      child2.setChild(labelRadix22, labelSuffix22, child22);

      assert.deepEqual(node.toJsObject(true), {
        "1100": {
          "1110": {
            ".label": null,
            ".proof_hash": "stateNodePH11",
            ".radix_ph": null
          },
          "2120": {
            ".label": null,
            ".proof_hash": "stateNodePH12",
            ".radix_ph": null
          },
          ".label": null,
          ".proof_hash": "stateNodePH1",
          ".radix_ph": null
        },
        "2200": {
          "1210": {
            ".label": null,
            ".proof_hash": "stateNodePH21",
            ".radix_ph": null
          },
          "2220": {
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
      expect(node.verifyProofHash()).to.equal(false);
      expect(child1.verifyProofHash()).to.equal(false);
      expect(child2.verifyProofHash()).to.equal(false);
      expect(child11.verifyProofHash()).to.equal(false);
      expect(child12.verifyProofHash()).to.equal(false);
      expect(child21.verifyProofHash()).to.equal(false);
      expect(child22.verifyProofHash()).to.equal(false);

      // set
      expect(node.updateProofHashForRadixSubtree()).to.equal(7);
      expect(node.verifyProofHash()).to.equal(true);
      expect(child1.verifyProofHash()).to.equal(true);
      expect(child2.verifyProofHash()).to.equal(true);
      expect(child11.verifyProofHash()).to.equal(true);
      expect(child12.verifyProofHash()).to.equal(true);
      expect(child21.verifyProofHash()).to.equal(true);
      expect(child22.verifyProofHash()).to.equal(true);

      // change of a state node's proof hash
      stateNode12.setProofHash('another PH');
      expect(node.verifyProofHash()).to.equal(true);
      expect(child1.verifyProofHash()).to.equal(true);
      expect(child2.verifyProofHash()).to.equal(true);
      expect(child11.verifyProofHash()).to.equal(true);
      expect(child12.verifyProofHash()).to.equal(false);
      expect(child21.verifyProofHash()).to.equal(true);
      expect(child22.verifyProofHash()).to.equal(true);
    });

    it("updateProofHashForRadixPath", () => {
      node.setStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);
      child1.setChild(labelRadix11, labelSuffix11, child11);
      child1.setChild(labelRadix12, labelSuffix12, child12);
      child2.setChild(labelRadix21, labelSuffix21, child21);
      child2.setChild(labelRadix22, labelSuffix22, child22);

      assert.deepEqual(node.toJsObject(true), {
        "1100": {
          "1110": {
            ".label": null,
            ".proof_hash": "stateNodePH11",
            ".radix_ph": null
          },
          "2120": {
            ".label": null,
            ".proof_hash": "stateNodePH12",
            ".radix_ph": null
          },
          ".label": null,
          ".proof_hash": "stateNodePH1",
          ".radix_ph": null
        },
        "2200": {
          "1210": {
            ".label": null,
            ".proof_hash": "stateNodePH21",
            ".radix_ph": null
          },
          "2220": {
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
      expect(node.verifyProofHash()).to.equal(false);
      expect(child1.verifyProofHash()).to.equal(false);
      expect(child2.verifyProofHash()).to.equal(false);
      expect(child11.verifyProofHash()).to.equal(false);
      expect(child12.verifyProofHash()).to.equal(false);
      expect(child21.verifyProofHash()).to.equal(false);
      expect(child22.verifyProofHash()).to.equal(false);

      // update
      expect(child21.updateProofHashForRadixPath()).to.equal(3);
      expect(node.verifyProofHash()).to.equal(true);
      expect(child1.verifyProofHash()).to.equal(false);
      expect(child2.verifyProofHash()).to.equal(true);
      expect(child11.verifyProofHash()).to.equal(false);
      expect(child12.verifyProofHash()).to.equal(false);
      expect(child21.verifyProofHash()).to.equal(true);
      expect(child22.verifyProofHash()).to.equal(false);
    });

    it("verifyProofHashForRadixSubtree", () => {
      node.setStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);
      child1.setChild(labelRadix11, labelSuffix11, child11);
      child1.setChild(labelRadix12, labelSuffix12, child12);
      child2.setChild(labelRadix21, labelSuffix21, child21);
      child2.setChild(labelRadix22, labelSuffix22, child22);

      assert.deepEqual(node.toJsObject(true), {
        "1100": {
          "1110": {
            ".label": null,
            ".proof_hash": "stateNodePH11",
            ".radix_ph": null
          },
          "2120": {
            ".label": null,
            ".proof_hash": "stateNodePH12",
            ".radix_ph": null
          },
          ".label": null,
          ".proof_hash": "stateNodePH1",
          ".radix_ph": null
        },
        "2200": {
          "1210": {
            ".label": null,
            ".proof_hash": "stateNodePH21",
            ".radix_ph": null
          },
          "2220": {
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
      expect(node.verifyProofHashForRadixSubtree()).to.equal(false);

      // set
      expect(node.updateProofHashForRadixSubtree()).to.equal(7);
      expect(node.verifyProofHashForRadixSubtree()).to.equal(true);

      // change of a state node's proof hash
      stateNode21.setProofHash('another PH');
      expect(node.verifyProofHashForRadixSubtree()).to.equal(false);

      // update
      expect(child21.updateProofHashForRadixPath()).to.equal(3);
      expect(node.verifyProofHashForRadixSubtree()).to.equal(true);
    });

    it("getProofOfRadixNode", () => {
      node.setStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);
      child1.setChild(labelRadix11, labelSuffix11, child11);
      child1.setChild(labelRadix12, labelSuffix12, child12);
      child2.setChild(labelRadix21, labelSuffix21, child21);
      child2.setChild(labelRadix22, labelSuffix22, child22);

      expect(node.updateProofHashForRadixSubtree()).to.equal(7);

      assert.deepEqual(node.toJsObject(true), {
        "1100": {
          "1110": {
            ".label": null,
            ".proof_hash": "stateNodePH11",
            ".radix_ph": "0xac8e0ca829cea8d80a79260078fb8e1b38a05b6d087c72a1c92f63849a47b96b"
          },
          "2120": {
            ".label": null,
            ".proof_hash": "stateNodePH12",
            ".radix_ph": "0x7fc53637a6ff6b7efa8cf7c9ba95552ed7479262ad8c07a61b4d2b1e8002d360"
          },
          ".label": null,
          ".proof_hash": "stateNodePH1",
          ".radix_ph": "0x58b89a07baf039f5a5420aeafed213b7abe18c3f1537e9626628719f56ab5434"
        },
        "2200": {
          "1210": {
            ".label": null,
            ".proof_hash": "stateNodePH21",
            ".radix_ph": "0xa8c806fde336879bd0cb320c809ad8a1f6e1e526711ed239eb216f83e4fb19d7"
          },
          "2220": {
            ".label": null,
            ".proof_hash": "stateNodePH22",
            ".radix_ph": "0x0dd8afcb4c2839ff30e6872c7268f9ed687fd53c52ce78f0330de82d5b33a0a2"
          },
          ".radix_ph": "0xb822c6a20a4128f025019f9f03cb802f86998f48073118b132fd40fbd1620fed"
        },
        ".label": null,
        ".proof_hash": "stateNodePH",
        ".radix_ph": "0xf29196bc2c6609216445dc878baf97143463a00c9e03c6af0ba6d38a2817b3b3"
      });

      const label11 = labelRadix11 + labelSuffix11;
      const label21 = labelRadix21 + labelSuffix21;

      // on a node with state node value with child label and child proof
      assert.deepEqual(child1.getProofOfRadixNode(label11, 'childProof1'), {
        "1110": "childProof1",
        "2120": {
          ".radix_ph": "0x7fc53637a6ff6b7efa8cf7c9ba95552ed7479262ad8c07a61b4d2b1e8002d360"
        },
        ".label": null,
        ".proof_hash": "stateNodePH1",
        ".radix_ph": "0x58b89a07baf039f5a5420aeafed213b7abe18c3f1537e9626628719f56ab5434"
      });

      // on a node without state node value with child label and child proof
      assert.deepEqual(child2.getProofOfRadixNode(label21, 'childProof2'), {
        "1210": "childProof2",
        "2220": {
          ".radix_ph": "0x0dd8afcb4c2839ff30e6872c7268f9ed687fd53c52ce78f0330de82d5b33a0a2"
        },
        ".radix_ph": "0xb822c6a20a4128f025019f9f03cb802f86998f48073118b132fd40fbd1620fed"
      });

      // on a node with state node value with state label/proof
      assert.deepEqual(child1.getProofOfRadixNode(null, null, 'stateLabel1', 'stateProof1'), {
        ".label": "stateLabel1",
        ".proof_hash": "stateProof1",
        ".radix_ph": "0x58b89a07baf039f5a5420aeafed213b7abe18c3f1537e9626628719f56ab5434"
      });

      // on a node without state node value with state label/proof
      assert.deepEqual(child2.getProofOfRadixNode(null, null, 'stateLabel1', 'stateProof2'), {
        ".radix_ph": "0xb822c6a20a4128f025019f9f03cb802f86998f48073118b132fd40fbd1620fed"
      });
    });
  });

  describe("utils", () => {
    let stateNode1;
    let stateNode2;
    let stateNode21;
    let stateNode22;
    let child1;
    let child2;
    let child21;
    let child22;

    beforeEach(() => {
      stateNode1 = new StateNode();
      stateNode1.setProofHash('stateNodePH1');
      stateNode2 = new StateNode();
      stateNode2.setProofHash('stateNodePH2');
      stateNode21 = new StateNode();
      stateNode21.setProofHash('stateNodePH21');
      stateNode22 = new StateNode();
      stateNode22.setProofHash('stateNodePH22');

      child1 = new RadixNode();
      child1.setProofHash('childPH1');
      child1.setStateNode(stateNode1);

      child2 = new RadixNode();
      child2.setProofHash('childPH2');
      child2.setStateNode(stateNode2);

      child21 = new RadixNode();
      child21.setProofHash('childPH21');
      child21.setStateNode(stateNode21);

      child22 = new RadixNode();
      child22.setProofHash('childPH22');
      child22.setStateNode(stateNode22);

      node.setChild('0', '001', child1);
      node.setChild('1', '002', child2);
      child2.setChild('2', '021', child21);
      child2.setChild('3', '022', child22);
    });

    it("copyFrom", () => {
      const newNode = new RadixNode();
      newNode.copyFrom(node);
      assert.deepEqual(newNode.toJsObject(), {
        "1002": {
          "2021": {
            ".label": null,
            ".proof_hash": "stateNodePH21"
          },
          "3022": {
            ".label": null,
            ".proof_hash": "stateNodePH22"
          },
          ".label": null,
          ".proof_hash": "stateNodePH2"
        },
        "0001": {
          ".label": null,
          ".proof_hash": "stateNodePH1"
        }
      });
    });

    it("toJsObject", () => {
      assert.deepEqual(node.toJsObject(), {
        "1002": {
          "2021": {
            ".label": null,
            ".proof_hash": "stateNodePH21"
          },
          "3022": {
            ".label": null,
            ".proof_hash": "stateNodePH22"
          },
          ".label": null,
          ".proof_hash": "stateNodePH2"
        },
        "0001": {
          ".label": null,
          ".proof_hash": "stateNodePH1"
        }
      });
      assert.deepEqual(node.toJsObject(true, true), {
        "1002": {
          "2021": {
            ".label": null,
            ".proof_hash": "stateNodePH21",
            ".radix_ph": "childPH21"
          },
          "3022": {
            ".label": null,
            ".proof_hash": "stateNodePH22",
            ".radix_ph": "childPH22"
          },
          ".label": null,
          ".proof_hash": "stateNodePH2",
          ".radix_ph": "childPH2"
        },
        ".radix_ph": null,
        "0001": {
          ".label": null,
          ".proof_hash": "stateNodePH1",
          ".radix_ph": "childPH1"
        }
      });
    });
  });
});
