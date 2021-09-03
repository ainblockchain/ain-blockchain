const RuleUtil = require('../db/rule-util');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("RuleUtil", () => {
  const util = new RuleUtil;

  describe("isBool", () => {
    it("when invalid input", () => {
      expect(util.isBool(0)).to.equal(false);
      expect(util.isBool(10)).to.equal(false);
      expect(util.isBool(-1)).to.equal(false);
      expect(util.isBool(15.5)).to.equal(false);
      expect(util.isBool(null)).to.equal(false);
      expect(util.isBool(undefined)).to.equal(false);
      expect(util.isBool(Infinity)).to.equal(false);
      expect(util.isBool(NaN)).to.equal(false);
      expect(util.isBool('')).to.equal(false);
      expect(util.isBool('abc')).to.equal(false);
      expect(util.isBool({})).to.equal(false);
      expect(util.isBool({a: 'A'})).to.equal(false);
      expect(util.isBool([])).to.equal(false);
      expect(util.isBool([10])).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isBool(true)).to.equal(true);
      expect(util.isBool(false)).to.equal(true);
    })
  })

  describe("isNumber", () => {
    it("when invalid input", () => {
      expect(util.isNumber(true)).to.equal(false);
      expect(util.isNumber(false)).to.equal(false);
      expect(util.isNumber(null)).to.equal(false);
      expect(util.isNumber(undefined)).to.equal(false);
      expect(util.isNumber(Infinity)).to.equal(false);
      expect(util.isNumber(NaN)).to.equal(false);
      expect(util.isNumber('')).to.equal(false);
      expect(util.isNumber('abc')).to.equal(false);
      expect(util.isNumber({})).to.equal(false);
      expect(util.isNumber({a: 'A'})).to.equal(false);
      expect(util.isNumber([])).to.equal(false);
      expect(util.isNumber([10])).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isNumber(0)).to.equal(true);
      expect(util.isNumber(10)).to.equal(true);
      expect(util.isNumber(-1)).to.equal(true);
      expect(util.isNumber(15.5)).to.equal(true);
    })
  })

  describe("isInteger", () => {
    it("when invalid input", () => {
      expect(util.isInteger(true)).to.equal(false);
      expect(util.isInteger(false)).to.equal(false);
      expect(util.isInteger(null)).to.equal(false);
      expect(util.isInteger(undefined)).to.equal(false);
      expect(util.isInteger(Infinity)).to.equal(false);
      expect(util.isInteger(NaN)).to.equal(false);
      expect(util.isInteger('')).to.equal(false);
      expect(util.isInteger('abc')).to.equal(false);
      expect(util.isInteger({})).to.equal(false);
      expect(util.isInteger({a: 'A'})).to.equal(false);
      expect(util.isInteger([])).to.equal(false);
      expect(util.isInteger([10])).to.equal(false);
      expect(util.isInteger(15.5)).to.equal(false);
      expect(util.isInteger(-15.5)).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isInteger(0)).to.equal(true);
      expect(util.isInteger(10)).to.equal(true);
      expect(util.isInteger(-1)).to.equal(true);
    })
  })

  describe("isString", () => {
    it("when invalid input", () => {
      expect(util.isString(true)).to.equal(false);
      expect(util.isString(false)).to.equal(false);
      expect(util.isString(0)).to.equal(false);
      expect(util.isString(10)).to.equal(false);
      expect(util.isString(null)).to.equal(false);
      expect(util.isString(undefined)).to.equal(false);
      expect(util.isString(Infinity)).to.equal(false);
      expect(util.isString(NaN)).to.equal(false);
      expect(util.isString({})).to.equal(false);
      expect(util.isString({a: 'A'})).to.equal(false);
      expect(util.isString([])).to.equal(false);
      expect(util.isString([10])).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isString('')).to.equal(true);
      expect(util.isString('abc')).to.equal(true);
      expect(util.isString('0')).to.equal(true);
    })
  })

  describe("isArray", () => {
    it("when invalid input", () => {
      expect(util.isArray(true)).to.equal(false);
      expect(util.isArray(false)).to.equal(false);
      expect(util.isArray(0)).to.equal(false);
      expect(util.isArray(10)).to.equal(false);
      expect(util.isArray(null)).to.equal(false);
      expect(util.isArray(undefined)).to.equal(false);
      expect(util.isArray(Infinity)).to.equal(false);
      expect(util.isArray(NaN)).to.equal(false);
      expect(util.isArray('')).to.equal(false);
      expect(util.isArray('abc')).to.equal(false);
      expect(util.isArray('0')).to.equal(false);
      expect(util.isArray({})).to.equal(false);
      expect(util.isArray({a: 'A'})).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isArray([])).to.equal(true);
      expect(util.isArray([10])).to.equal(true);
    })
  })

  describe("isDict", () => {
    it("when invalid input", () => {
      expect(util.isDict(true)).to.equal(false);
      expect(util.isDict(false)).to.equal(false);
      expect(util.isDict(0)).to.equal(false);
      expect(util.isDict(10)).to.equal(false);
      expect(util.isDict(null)).to.equal(false);
      expect(util.isDict(undefined)).to.equal(false);
      expect(util.isDict(Infinity)).to.equal(false);
      expect(util.isDict(NaN)).to.equal(false);
      expect(util.isDict('')).to.equal(false);
      expect(util.isDict('abc')).to.equal(false);
      expect(util.isDict('0')).to.equal(false);
      expect(util.isDict([])).to.equal(false);
      expect(util.isDict([10])).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isDict({})).to.equal(true);
      expect(util.isDict({a: 'A'})).to.equal(true);
    })
  })

  describe("isEmpty", () => {
    it("when invalid input", () => {
      expect(util.isEmpty(true)).to.equal(false);
      expect(util.isEmpty(false)).to.equal(false);
      expect(util.isEmpty(0)).to.equal(false);
      expect(util.isEmpty(10)).to.equal(false);
      expect(util.isEmpty(Infinity)).to.equal(false);
      expect(util.isEmpty(NaN)).to.equal(false);
      expect(util.isEmpty('')).to.equal(false);
      expect(util.isEmpty('abc')).to.equal(false);
      expect(util.isEmpty('0')).to.equal(false);
      expect(util.isEmpty([10])).to.equal(false);
      expect(util.isEmpty({a: 'A'})).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isEmpty(null)).to.equal(true);
      expect(util.isEmpty(undefined)).to.equal(true);
      expect(util.isEmpty([])).to.equal(true);
      expect(util.isEmpty({})).to.equal(true);
    })
  })

  describe("isHexString", () => {
    it("when invalid input", () => {
      expect(util.isHexString(true)).to.equal(false);
      expect(util.isHexString(false)).to.equal(false);
      expect(util.isHexString(0)).to.equal(false);
      expect(util.isHexString(10)).to.equal(false);
      expect(util.isHexString(null)).to.equal(false);
      expect(util.isHexString(undefined)).to.equal(false);
      expect(util.isHexString(Infinity)).to.equal(false);
      expect(util.isHexString(NaN)).to.equal(false);
      expect(util.isHexString('')).to.equal(false);
      expect(util.isHexString('abc')).to.equal(false);
      expect(util.isHexString('0')).to.equal(false);
      expect(util.isHexString([10])).to.equal(false);
      expect(util.isHexString({a: 'A'})).to.equal(false);
      expect(util.isHexString('0x6af1ec8d4fx')).to.equal(false);
      expect(util.isHexString('0x6AF1EC8D4FX')).to.equal(false);
      expect(util.isHexString('0xx6af1ec8d4f')).to.equal(false);
      expect(util.isHexString('0xx6AF1EC8D4F')).to.equal(false);
      expect(util.isHexString('00x6af1ec8d4f')).to.equal(false);
      expect(util.isHexString('00x6AF1EC8D4F')).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isHexString('0x')).to.equal(true);
      expect(util.isHexString('0x6af1ec8d4f')).to.equal(true);
      expect(util.isHexString('0x6AF1EC8D4F')).to.equal(true);
    })
  })

  describe("isValidHash", () => {
    it("when invalid input", () => {
      expect(util.isValidHash(true)).to.equal(false);
      expect(util.isValidHash(false)).to.equal(false);
      expect(util.isValidHash(0)).to.equal(false);
      expect(util.isValidHash(10)).to.equal(false);
      expect(util.isValidHash(null)).to.equal(false);
      expect(util.isValidHash(undefined)).to.equal(false);
      expect(util.isValidHash(Infinity)).to.equal(false);
      expect(util.isValidHash(NaN)).to.equal(false);
      expect(util.isValidHash('')).to.equal(false);
      expect(util.isValidHash('abc')).to.equal(false);
      expect(util.isValidHash('0')).to.equal(false);
      expect(util.isValidHash([10])).to.equal(false);
      expect(util.isValidHash({a: 'A'})).to.equal(false);
      expect(util.isValidHash('0x')).to.equal(false);
      expect(util.isValidHash('0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8')).to.equal(false); // 63 chars
      expect(util.isValidHash('0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8cc')).to.equal(false); // 65 chars
    })

    it("when valid input", () => {
      expect(util.isValidHash('0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8c')).to.equal(true);
      expect(util.isValidHash('0x89a1b02058f0d0b7c93957d0ff290cf44cef419d1275afcb430f6e9536e4afb5')).to.equal(true);
    })
  })

  describe("keys", () => {
    it("when invalid input", () => {
      assert.deepEqual(util.keys(true), []);
      assert.deepEqual(util.keys(false), []);
      assert.deepEqual(util.keys(0), []);
      assert.deepEqual(util.keys(10), []);
      assert.deepEqual(util.keys(null), []);
      assert.deepEqual(util.keys(undefined), []);
      assert.deepEqual(util.keys(Infinity), []);
      assert.deepEqual(util.keys(NaN), []);
      assert.deepEqual(util.keys(''), []);
      assert.deepEqual(util.keys('abc'), []);
      assert.deepEqual(util.keys('0'), []);
      assert.deepEqual(util.keys([]), []);
      assert.deepEqual(util.keys([10]), []);
      assert.deepEqual(util.keys([10, 'abc']), []);
    })

    it("when valid input", () => {
      assert.deepEqual(util.keys({}), []);
      assert.deepEqual(util.keys({a: 'A'}), ['a']);
      assert.deepEqual(util.keys({a: 'A', b: 10}), ['a', 'b']);
    })
  })

  describe("length", () => {
    it("when invalid input", () => {
      expect(util.length(true)).to.equal(0);
      expect(util.length(false)).to.equal(0);
      expect(util.length(0)).to.equal(0);
      expect(util.length(10)).to.equal(0);
      expect(util.length(null)).to.equal(0);
      expect(util.length(undefined)).to.equal(0);
      expect(util.length(Infinity)).to.equal(0);
      expect(util.length(NaN)).to.equal(0);
    })

    it("when valid input", () => {
      expect(util.length('')).to.equal(0);
      expect(util.length('abc')).to.equal(3);
      expect(util.length('0')).to.equal(1);
      expect(util.length([])).to.equal(0);
      expect(util.length([10])).to.equal(1);
      expect(util.length([10, 'abc'])).to.equal(2);
      expect(util.length({})).to.equal(0);
      expect(util.length({a: 'A'})).to.equal(1);
      expect(util.length({a: 'A', b: 10})).to.equal(2);
    })
  })

  describe("includes", () => {
    it("returns false with invalid input", () => {
      expect(util.includes(true, 'a')).to.equal(false);
      expect(util.includes(false, 'a')).to.equal(false);
      expect(util.includes(0, 'a')).to.equal(false);
      expect(util.includes(10, 'a')).to.equal(false);
      expect(util.includes(null, 'a')).to.equal(false);
      expect(util.includes(undefined, 'a')).to.equal(false);
      expect(util.includes(Infinity, 'a')).to.equal(false);
      expect(util.includes(NaN, 'a')).to.equal(false);
      expect(util.includes('', 'a')).to.equal(false);
      expect(util.includes('abc', 'a')).to.equal(false);
      expect(util.includes('0', 'a')).to.equal(false);
      expect(util.includes([], 'a')).to.equal(false);
      expect(util.includes([10], 'a')).to.equal(false);
      expect(util.includes({a: 'A'}, 'a')).to.equal(false);
    })

    it("returns false with valid input", () => {
      expect(util.includes([], 'a')).to.equal(false);
      expect(util.includes(
          [true, false, 0, 10, null, undefined, Infinity, NaN, '', 'aa', 'b'],
          'a')).to.equal(false);
    })

    it("returns true with valid input", () => {
      expect(util.includes(
          [true, false, 0, 10, null, undefined, Infinity, NaN, '', 'aa', 'a'],
          false)).to.equal(true);
      expect(util.includes(
          [true, false, 0, 10, null, undefined, Infinity, NaN, '', 'aa', 'a'],
          0)).to.equal(true);
      expect(util.includes(
          [true, false, 0, 10, null, undefined, Infinity, NaN, '', 'aa', 'a'],
          null)).to.equal(true);
      expect(util.includes(
          [true, false, 0, 10, null, undefined, Infinity, NaN, '', 'aa', 'a'],
          undefined)).to.equal(true);
      expect(util.includes(
          [true, false, 0, 10, null, undefined, Infinity, NaN, '', 'aa', 'a'],
          Infinity)).to.equal(true);
      expect(util.includes(
          [true, false, 0, 10, null, undefined, Infinity, NaN, '', 'aa', 'a'],
          NaN)).to.equal(true);
      expect(util.includes(
          [true, false, 0, 10, null, undefined, Infinity, NaN, '', 'aa', 'a'],
          '')).to.equal(true);
      expect(util.includes(
          [true, false, 0, 10, null, undefined, Infinity, NaN, '', 'aa', 'a'],
          'a')).to.equal(true);
    })
  })

  describe("isValAddr", () => {
    it("when non-string input", () => {
      expect(util.isValAddr(true)).to.equal(false);
      expect(util.isValAddr(false)).to.equal(false);
      expect(util.isValAddr(0)).to.equal(false);
      expect(util.isValAddr(10)).to.equal(false);
      expect(util.isValAddr(null)).to.equal(false);
      expect(util.isValAddr(undefined)).to.equal(false);
      expect(util.isValAddr(Infinity)).to.equal(false);
      expect(util.isValAddr(NaN)).to.equal(false);
      expect(util.isValAddr(0xCAcD898dBaEdBD9037aCd25b82417587E972838d)).to.equal(false);
      expect(util.isValAddr({})).to.equal(false);
      expect(util.isValAddr({a: 'A'})).to.equal(false);
      expect(util.isValAddr([])).to.equal(false);
      expect(util.isValAddr([10])).to.equal(false);
      expect(util.isValAddr([10, 'abc'])).to.equal(false);
    })

    it("when string input", () => {
      expect(util.isValAddr('')).to.equal(false);
      expect(util.isValAddr('abc')).to.equal(false);
      expect(util.isValAddr('0')).to.equal(false);
      expect(util.isValAddr('0xcacd898dbaedbd9037acd25b82417587e972838d')).to.equal(true);
      expect(util.isValAddr('0xCACD898DBAEDBD9037ACD25B82417587E972838D')).to.equal(true);
      expect(util.isValAddr('0xCAcD898dBaEdBD9037aCd25b82417587E972838d')).to.equal(true);
    })
  })

  describe("isCksumAddr", () => {
    it("when invalid-address input", () => {
      expect(util.isCksumAddr(0)).to.equal(false);
      expect(util.isCksumAddr(10)).to.equal(false);
      expect(util.isCksumAddr(null)).to.equal(false);
      expect(util.isCksumAddr(undefined)).to.equal(false);
      expect(util.isCksumAddr(Infinity)).to.equal(false);
      expect(util.isCksumAddr(NaN)).to.equal(false);
      expect(util.isCksumAddr({})).to.equal(false);
      expect(util.isCksumAddr({a: 'a'})).to.equal(false);
      expect(util.isCksumAddr('')).to.equal(false);
      expect(util.isCksumAddr('abc')).to.equal(false);
      expect(util.isCksumAddr('0')).to.equal(false);
      expect(util.isCksumAddr([])).to.equal(false);
      expect(util.isCksumAddr([10])).to.equal(false);
      expect(util.isCksumAddr([10, 'abc'])).to.equal(false);
    })

    it("when valid-address input", () => {
      expect(util.isCksumAddr('0xcacd898dbaedbd9037acd25b82417587e972838d')).to.equal(false);
      expect(util.isCksumAddr('0xCACD898DBAEDBD9037ACD25B82417587E972838D')).to.equal(false);
      expect(util.isCksumAddr('0xCAcD898dBaEdBD9037aCd25b82417587E972838d')).to.equal(true);
    })
  })

  describe("isServAcntName", () => {
    it("when invalid-address input", () => {
      expect(util.isServAcntName(0)).to.equal(false);
      expect(util.isServAcntName(10)).to.equal(false);
      expect(util.isServAcntName(null)).to.equal(false);
      expect(util.isServAcntName(undefined)).to.equal(false);
      expect(util.isServAcntName(Infinity)).to.equal(false);
      expect(util.isServAcntName(NaN)).to.equal(false);
      expect(util.isServAcntName({})).to.equal(false);
      expect(util.isServAcntName({a: 'a'})).to.equal(false);
      expect(util.isServAcntName('')).to.equal(false);
      expect(util.isServAcntName('abc')).to.equal(false);
      expect(util.isServAcntName('0')).to.equal(false);
      expect(util.isServAcntName([])).to.equal(false);
      expect(util.isServAcntName([10])).to.equal(false);
      expect(util.isServAcntName([10, 'abc'])).to.equal(false);
      expect(util.isServAcntName('staking')).to.equal(false);
      expect(util.isServAcntName('staking|consensus')).to.equal(false);
      expect(util.isServAcntName(
          'invalid_service_type|consensus|0x09A0d53FDf1c36A131938eb379b98910e55EEfe1|0'))
          .to.equal(false);  // invalid service account service type
      expect(util.isServAcntName(
          'staking|0invalid_service_name|0x09A0d53FDf1c36A131938eb379b98910e55EEfe1|0'))
          .to.equal(false);  // invalid service account service name
    })

    it("when valid-address input", () => {
      expect(util.isServAcntName(
          'staking|consensus|0x09A0d53FDf1c36A131938eb379b98910e55EEfe1')).to.equal(true);
      expect(util.isServAcntName(
          'staking|consensus|0x09A0d53FDf1c36A131938eb379b98910e55EEfe1|0')).to.equal(true);
    })
  })

  describe("toBool", () => {
    it("returns false", () => {
      expect(util.toBool(0)).to.equal(false);
      expect(util.toBool(10)).to.equal(false);
      expect(util.toBool(-1)).to.equal(false);
      expect(util.toBool(15.5)).to.equal(false);
      expect(util.toBool(null)).to.equal(false);
      expect(util.toBool(undefined)).to.equal(false);
      expect(util.toBool(Infinity)).to.equal(false);
      expect(util.toBool(NaN)).to.equal(false);
      expect(util.toBool('')).to.equal(false);
      expect(util.toBool('abc')).to.equal(false);
      expect(util.toBool('false')).to.equal(false);
      expect(util.toBool({})).to.equal(false);
      expect(util.toBool({a: 'A'})).to.equal(false);
      expect(util.toBool([])).to.equal(false);
      expect(util.toBool([10])).to.equal(false);
      expect(util.toBool(false)).to.equal(false);
    })

    it("returns true", () => {
      expect(util.toBool(true)).to.equal(true);
      expect(util.toBool('true')).to.equal(true);
    })
  })
})