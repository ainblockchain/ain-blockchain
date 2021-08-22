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
    it("get / set / has / delete with a child", () => {
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

      stateNode2 = new StateNode();
      stateNode2.setProofHash(stateNodePH2);
      child2.setStateNode(stateNode2);

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
        "proof_hash": null,
        "->": true,
        "-> proof_hash": "stateNodePH",
        "1:100": {
          "proof_hash": "childPH1",
          "-> proof_hash": "stateNodePH1",
          "->": true
        },
        "2:200": {
          "proof_hash": "childPH2",
          "-> proof_hash": "stateNodePH2",
          "->": true
        }
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
        "proof_hash": null,
        "->": true,
        "-> proof_hash": "stateNodePH",
        "1:100": {
          "proof_hash": "childPH1",
          "-> proof_hash": "stateNodePH1",
          "->": true
        },
        "2:200": {
          "proof_hash": "childPH2",
          "-> proof_hash": "stateNodePH2",
          "->": true
        }
      });

      node.resetProofHash();
      expect(node.verifyProofHash()).to.equal(false);
      node.updateProofHash();
      expect(node.verifyProofHash()).to.equal(true);
      expect(node.getProofHash()).to.equal(node._buildProofHash());
    });

    it("setProofHashForRadixTree", () => {
      node.setStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);
      child1.setChild(labelRadix11, labelSuffix11, child11);
      child1.setChild(labelRadix12, labelSuffix12, child12);
      child2.setChild(labelRadix21, labelSuffix21, child21);
      child2.setChild(labelRadix22, labelSuffix22, child22);

      assert.deepEqual(node.toJsObject(true), {
        "proof_hash": null,
        "->": true,
        "-> proof_hash": "stateNodePH",
        "1:100": {
          "proof_hash": null,
          "-> proof_hash": "stateNodePH1",
          "->": true,
          "1:110": {
            "proof_hash": null,
            "-> proof_hash": "stateNodePH11",
            "->": true
          },
          "2:120": {
            "proof_hash": null,
            "-> proof_hash": "stateNodePH12",
            "->": true
          }
        },
        "2:200": {
          "proof_hash": null,
          "-> proof_hash": "stateNodePH2",
          "->": true,
          "1:210": {
            "proof_hash": null,
            "-> proof_hash": "stateNodePH21",
            "->": true
          },
          "2:220": {
            "proof_hash": null,
            "-> proof_hash": "stateNodePH22",
            "->": true
          }
        }
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
      expect(node.setProofHashForRadixTree()).to.equal(7);
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

    it("updateProofHashForRootPath", () => {
      node.setStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);
      child1.setChild(labelRadix11, labelSuffix11, child11);
      child1.setChild(labelRadix12, labelSuffix12, child12);
      child2.setChild(labelRadix21, labelSuffix21, child21);
      child2.setChild(labelRadix22, labelSuffix22, child22);

      assert.deepEqual(node.toJsObject(true), {
        "proof_hash": null,
        "->": true,
        "-> proof_hash": "stateNodePH",
        "1:100": {
          "proof_hash": null,
          "-> proof_hash": "stateNodePH1",
          "->": true,
          "1:110": {
            "proof_hash": null,
            "-> proof_hash": "stateNodePH11",
            "->": true,
          },
          "2:120": {
            "proof_hash": null,
            "-> proof_hash": "stateNodePH12",
            "->": true
          }
        },
        "2:200": {
          "proof_hash": null,
          "-> proof_hash": "stateNodePH2",
          "->": true,
          "1:210": {
            "proof_hash": null,
            "-> proof_hash": "stateNodePH21",
            "->": true
          },
          "2:220": {
            "proof_hash": null,
            "-> proof_hash": "stateNodePH22",
            "->": true
          }
        }
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
      expect(child21.updateProofHashForRootPath()).to.equal(3);
      expect(node.verifyProofHash()).to.equal(true);
      expect(child1.verifyProofHash()).to.equal(false);
      expect(child2.verifyProofHash()).to.equal(true);
      expect(child11.verifyProofHash()).to.equal(false);
      expect(child12.verifyProofHash()).to.equal(false);
      expect(child21.verifyProofHash()).to.equal(true);
      expect(child22.verifyProofHash()).to.equal(false);
    });

    it("verifyProofHashForRadixTree", () => {
      node.setStateNode(stateNode);
      node.setChild(labelRadix1, labelSuffix1, child1);
      node.setChild(labelRadix2, labelSuffix2, child2);
      child1.setChild(labelRadix11, labelSuffix11, child11);
      child1.setChild(labelRadix12, labelSuffix12, child12);
      child2.setChild(labelRadix21, labelSuffix21, child21);
      child2.setChild(labelRadix22, labelSuffix22, child22);

      assert.deepEqual(node.toJsObject(true), {
        "proof_hash": null,
        "->": true,
        "-> proof_hash": "stateNodePH",
        "1:100": {
          "proof_hash": null,
          "-> proof_hash": "stateNodePH1",
          "->": true,
          "1:110": {
            "proof_hash": null,
            "-> proof_hash": "stateNodePH11",
            "->": true
          },
          "2:120": {
            "proof_hash": null,
            "-> proof_hash": "stateNodePH12",
            "->": true
          },
        },
        "2:200": {
          "proof_hash": null,
          "-> proof_hash": "stateNodePH2",
          "->": true,
          "1:210": {
            "proof_hash": null,
            "-> proof_hash": "stateNodePH21",
            "->": true
          },
          "2:220": {
            "proof_hash": null,
            "-> proof_hash": "stateNodePH22",
            "->": true
          }
        }
      });

      // initial status
      expect(node.verifyProofHashForRadixTree()).to.equal(false);

      // set
      expect(node.setProofHashForRadixTree()).to.equal(7);
      expect(node.verifyProofHashForRadixTree()).to.equal(true);

      // change of a state node's proof hash
      stateNode21.setProofHash('another PH');
      expect(node.verifyProofHashForRadixTree()).to.equal(false);

      // update
      expect(child21.updateProofHashForRootPath()).to.equal(3);
      expect(node.verifyProofHashForRadixTree()).to.equal(true);
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
        "->": false,
        "0:001": {
          "->": true
        },
        "1:002": {
          "->": true,
          "2:021": {
            "->": true
          },
          "3:022": {
            "->": true
          }
        }
      });
    });

    it("toJsObject", () => {
      assert.deepEqual(node.toJsObject(), {
        "->": false,
        "0:001": {
          "->": true
        },
        "1:002": {
          "->": true,
          "2:021": {
            "->": true
          },
          "3:022": {
            "->": true
          }
        }
      });
      assert.deepEqual(node.toJsObject(true, true), {
        "proof_hash": null,
        "->": null,
        "-> proof_hash": null,
        "0:001": {
          "proof_hash": "childPH1",
          "-> proof_hash": "stateNodePH1",
          "->": null
        },
        "1:002": {
          "proof_hash": "childPH2",
          "-> proof_hash": "stateNodePH2",
          "->": null,
          "2:021": {
            "proof_hash": "childPH21",
            "->": null,
            "-> proof_hash": "stateNodePH21"
          },
          "3:022": {
            "proof_hash": "childPH22",
            "->": null,
            "-> proof_hash": "stateNodePH22"
          }
        }
      });
    });
  });
});
