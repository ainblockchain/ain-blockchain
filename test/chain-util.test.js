const ChainUtil = require('../chain-util');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("ChainUtil", () => {
  describe("numberOfZero", () => {
    it("when non-numeric input", () => {
      expect(ChainUtil.numberOrZero(null)).to.equal(0);
      expect(ChainUtil.numberOrZero(undefined)).to.equal(0);
      expect(ChainUtil.numberOrZero(Infinity)).to.equal(0);
      expect(ChainUtil.numberOrZero(NaN)).to.equal(0);
      expect(ChainUtil.numberOrZero(true)).to.equal(0);
      expect(ChainUtil.numberOrZero(false)).to.equal(0);
      expect(ChainUtil.numberOrZero('')).to.equal(0);
      expect(ChainUtil.numberOrZero('abc')).to.equal(0);
      expect(ChainUtil.numberOrZero({})).to.equal(0);
      expect(ChainUtil.numberOrZero({a: 'A'})).to.equal(0);
      expect(ChainUtil.numberOrZero([])).to.equal(0);
      expect(ChainUtil.numberOrZero([10])).to.equal(0);
    })

    it("when numeric input", () => {
      expect(ChainUtil.numberOrZero(0)).to.equal(0);
      expect(ChainUtil.numberOrZero(10)).to.equal(10);
      expect(ChainUtil.numberOrZero(-1)).to.equal(-1);
      expect(ChainUtil.numberOrZero(15.5)).to.equal(15.5);
    })
  })

  describe("parsePath", () => {
    it("when abnormal input", () => {
      assert.deepEqual(ChainUtil.parsePath('//a/b/c'), ['a', 'b', 'c']);
      assert.deepEqual(ChainUtil.parsePath('/a//b/c'), ['a', 'b', 'c']);
      assert.deepEqual(ChainUtil.parsePath('/a/b/c//'), ['a', 'b', 'c']);
    })

    it("when normal input", () => {
      assert.deepEqual(ChainUtil.parsePath('/a/b/c'), ['a', 'b', 'c']);
      assert.deepEqual(ChainUtil.parsePath('a/b/c'), ['a', 'b', 'c']);
      assert.deepEqual(ChainUtil.parsePath('a/b/c/'), ['a', 'b', 'c']);
    })
  })

  describe("formatPath", () => {
    it("when abnormal input", () => {
      assert.deepEqual(ChainUtil.formatPath([null]), '/null');
      assert.deepEqual(ChainUtil.formatPath([undefined]), '/undefined');
      assert.deepEqual(ChainUtil.formatPath([Infinity]), '/null');
      assert.deepEqual(ChainUtil.formatPath([NaN]), '/null');
      assert.deepEqual(ChainUtil.formatPath([true]), '/true');
      assert.deepEqual(ChainUtil.formatPath([false]), '/false');
      assert.deepEqual(ChainUtil.formatPath([0]), '/0');
      assert.deepEqual(ChainUtil.formatPath(['']), '/');
      assert.deepEqual(ChainUtil.formatPath(['', '', '']), '///');
      assert.deepEqual(ChainUtil.formatPath([{}]), '/{}');
      assert.deepEqual(ChainUtil.formatPath([{a: 'A'}]), '/{"a":"A"}');
      assert.deepEqual(ChainUtil.formatPath([[]]), '/[]');
      assert.deepEqual(ChainUtil.formatPath([['a']]), '/["a"]');
    })

    it("when normal input", () => {
      assert.deepEqual(ChainUtil.formatPath(['a', 'b', 'c']), '/a/b/c');
    })
  })
})