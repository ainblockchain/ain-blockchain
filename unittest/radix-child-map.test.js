const RadixChildMap = require('../db/radix-child-map');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("radix-child-map", () => {
  describe("Static utils", () => {
    it("_labelRadixToIndex", () => {
      // valid input
      expect(RadixChildMap._labelRadixToIndex('0')).to.equal(0);
      expect(RadixChildMap._labelRadixToIndex('1')).to.equal(1);
      expect(RadixChildMap._labelRadixToIndex('2')).to.equal(2);
      expect(RadixChildMap._labelRadixToIndex('3')).to.equal(3);
      expect(RadixChildMap._labelRadixToIndex('4')).to.equal(4);
      expect(RadixChildMap._labelRadixToIndex('5')).to.equal(5);
      expect(RadixChildMap._labelRadixToIndex('6')).to.equal(6);
      expect(RadixChildMap._labelRadixToIndex('7')).to.equal(7);
      expect(RadixChildMap._labelRadixToIndex('8')).to.equal(8);
      expect(RadixChildMap._labelRadixToIndex('9')).to.equal(9);
      expect(RadixChildMap._labelRadixToIndex('a')).to.equal(10);
      expect(RadixChildMap._labelRadixToIndex('b')).to.equal(11);
      expect(RadixChildMap._labelRadixToIndex('c')).to.equal(12);
      expect(RadixChildMap._labelRadixToIndex('d')).to.equal(13);
      expect(RadixChildMap._labelRadixToIndex('e')).to.equal(14);
      expect(RadixChildMap._labelRadixToIndex('f')).to.equal(15);

      // invalid input
      expect(RadixChildMap._labelRadixToIndex('')).to.equal(-1);
      expect(RadixChildMap._labelRadixToIndex(' ')).to.equal(-1);
      expect(RadixChildMap._labelRadixToIndex('A')).to.equal(-1);
      expect(RadixChildMap._labelRadixToIndex('B')).to.equal(-1);
      expect(RadixChildMap._labelRadixToIndex('C')).to.equal(-1);
      expect(RadixChildMap._labelRadixToIndex('D')).to.equal(-1);
      expect(RadixChildMap._labelRadixToIndex('E')).to.equal(-1);
      expect(RadixChildMap._labelRadixToIndex('F')).to.equal(-1);
    });

    it("_indexToLabelRadix", () => {
      // valid input
      expect(RadixChildMap._indexToLabelRadix(0)).to.equal('0');
      expect(RadixChildMap._indexToLabelRadix(1)).to.equal('1');
      expect(RadixChildMap._indexToLabelRadix(2)).to.equal('2');
      expect(RadixChildMap._indexToLabelRadix(3)).to.equal('3');
      expect(RadixChildMap._indexToLabelRadix(4)).to.equal('4');
      expect(RadixChildMap._indexToLabelRadix(5)).to.equal('5');
      expect(RadixChildMap._indexToLabelRadix(6)).to.equal('6');
      expect(RadixChildMap._indexToLabelRadix(7)).to.equal('7');
      expect(RadixChildMap._indexToLabelRadix(8)).to.equal('8');
      expect(RadixChildMap._indexToLabelRadix(9)).to.equal('9');
      expect(RadixChildMap._indexToLabelRadix(10)).to.equal('a');
      expect(RadixChildMap._indexToLabelRadix(11)).to.equal('b');
      expect(RadixChildMap._indexToLabelRadix(12)).to.equal('c');
      expect(RadixChildMap._indexToLabelRadix(13)).to.equal('d');
      expect(RadixChildMap._indexToLabelRadix(14)).to.equal('e');
      expect(RadixChildMap._indexToLabelRadix(15)).to.equal('f');

      // invalid input
      expect(RadixChildMap._indexToLabelRadix(-1)).to.equal('');
      expect(RadixChildMap._indexToLabelRadix(16)).to.equal('');
      expect(RadixChildMap._indexToLabelRadix(17)).to.equal('');
      expect(RadixChildMap._indexToLabelRadix(100)).to.equal('');
      expect(RadixChildMap._indexToLabelRadix(0.1)).to.equal('');
      expect(RadixChildMap._indexToLabelRadix(Infinity)).to.equal('');
    });
  });

  describe("APIs", () => {
    let map;

    beforeEach(() => {
      map = new RadixChildMap();
    })

    describe("Initialization", () => {
      it("constructor", () => {
        expect(map.size).to.equal(0);
        expect(map.childArray.length).to.equal(16);
        map.childArray.forEach((elem) => {
          expect(elem).to.equal(null);
        })
      });
    });

    describe("get / set / has / delete / keys / values / size", () => {
      it("simple operations with valid label radix", () => {
        const labelRadix1 = '0';
        const labelRadix2 = '1';
        const child1 = { value: 'child1' };
        const child2 = { value: 'child2' };

        expect(map.has(labelRadix1)).to.equal(false);
        expect(map.get(labelRadix1)).to.equal(null);
        expect(map.has(labelRadix2)).to.equal(false);
        expect(map.get(labelRadix2)).to.equal(null);
        expect(map.size).to.equal(0);
        assert.deepEqual(map.keys(), []);
        assert.deepEqual(map.values(), []);

        expect(map.set(labelRadix1, child1)).to.equal(true);
        expect(map.has(labelRadix1)).to.equal(true);
        expect(map.get(labelRadix1)).to.equal(child1);
        expect(map.has(labelRadix2)).to.equal(false);
        expect(map.get(labelRadix2)).to.equal(null);
        expect(map.size).to.equal(1);
        assert.deepEqual(map.keys(), [labelRadix1]);
        assert.deepEqual(map.values(), [child1]);

        expect(map.set(labelRadix2, child2)).to.equal(true);
        expect(map.has(labelRadix1)).to.equal(true);
        expect(map.get(labelRadix1)).to.equal(child1);
        expect(map.has(labelRadix2)).to.equal(true);
        expect(map.get(labelRadix2)).to.equal(child2);
        expect(map.size).to.equal(2);
        assert.deepEqual(map.keys(), [labelRadix1, labelRadix2]);
        assert.deepEqual(map.values(), [child1, child2]);

        expect(map.delete(labelRadix1)).to.equal(true);
        expect(map.has(labelRadix1)).to.equal(false);
        expect(map.get(labelRadix1)).to.equal(null);
        expect(map.has(labelRadix2)).to.equal(true);
        expect(map.get(labelRadix2)).to.equal(child2);
        expect(map.size).to.equal(1);
        assert.deepEqual(map.keys(), [labelRadix2]);
        assert.deepEqual(map.values(), [child2]);

        expect(map.delete(labelRadix2)).to.equal(true);
        expect(map.has(labelRadix1)).to.equal(false);
        expect(map.get(labelRadix1)).to.equal(null);
        expect(map.has(labelRadix2)).to.equal(false);
        expect(map.get(labelRadix2)).to.equal(null);
        expect(map.size).to.equal(0);
        assert.deepEqual(map.keys(), []);
        assert.deepEqual(map.values(), []);
      });

      it("simple operations with invalid label radix", () => {
        const child1 = { value: 'child1' };

        expect(map.has(undefined)).to.equal(false);
        expect(map.has(null)).to.equal(false);
        expect(map.has(false)).to.equal(false);
        expect(map.has(0)).to.equal(false);
        expect(map.has('A')).to.equal(false);

        expect(map.get(undefined)).to.equal(null);
        expect(map.get(null)).to.equal(null);
        expect(map.get(false)).to.equal(null);
        expect(map.get(0)).to.equal(null);
        expect(map.get('A')).to.equal(null);

        expect(map.set(undefined, child1)).to.equal(false);
        expect(map.set(null, child1)).to.equal(false);
        expect(map.set(false, child1)).to.equal(false);
        expect(map.set(0, child1)).to.equal(false);
        expect(map.set('A', child1)).to.equal(false);

        expect(map.delete(undefined)).to.equal(false);
        expect(map.delete(null)).to.equal(false);
        expect(map.delete(false)).to.equal(false);
        expect(map.delete(0)).to.equal(false);
        expect(map.delete('A')).to.equal(false);
      });

      it("overwrite", () => {
        const labelRadix = '0';
        const child1 = { value: 'child1' };
        const child2 = { value: 'child2' };

        expect(map.has(labelRadix)).to.equal(false);
        expect(map.get(labelRadix)).to.equal(null);
        expect(map.size).to.equal(0);
        assert.deepEqual(map.keys(), []);
        assert.deepEqual(map.values(), []);

        expect(map.set(labelRadix, child1)).to.equal(true);
        expect(map.has(labelRadix)).to.equal(true);
        expect(map.get(labelRadix)).to.equal(child1);
        expect(map.size).to.equal(1);
        assert.deepEqual(map.keys(), [labelRadix]);
        assert.deepEqual(map.values(), [child1]);

        expect(map.set(labelRadix, child2)).to.equal(true);
        expect(map.has(labelRadix)).to.equal(true);
        expect(map.get(labelRadix)).to.equal(child2);
        expect(map.size).to.equal(1);
        assert.deepEqual(map.keys(), [labelRadix]);
        assert.deepEqual(map.values(), [child2]);
      });
    });
  });
});
