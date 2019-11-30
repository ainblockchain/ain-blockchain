const BuiltInRuleUtil = require('../db/built-in-rule-util');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("BuiltInRuleUtil", () => {
  const util = new BuiltInRuleUtil;

  describe("isNumber", () => {
    it("when invalid input", () => {
      expect(util.isNumber(null)).to.equal(false);
      expect(util.isNumber(undefined)).to.equal(false);
      expect(util.isNumber(Infinity)).to.equal(false);
      expect(util.isNumber(NaN)).to.equal(false);
      expect(util.isNumber('')).to.equal(false);
      expect(util.isNumber('abc')).to.equal(false);
      expect(util.isNumber({})).to.equal(false);
      expect(util.isNumber({a: 'a'})).to.equal(false);
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

  describe("isString", () => {
    it("when invalid input", () => {
      expect(util.isString(0)).to.equal(false);
      expect(util.isString(10)).to.equal(false);
      expect(util.isString(null)).to.equal(false);
      expect(util.isString(undefined)).to.equal(false);
      expect(util.isString(Infinity)).to.equal(false);
      expect(util.isString(NaN)).to.equal(false);
      expect(util.isString({})).to.equal(false);
      expect(util.isString({a: 'a'})).to.equal(false);
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
      expect(util.isArray({a: 'a'})).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isArray([])).to.equal(true);
      expect(util.isArray([10])).to.equal(true);
    })
  })

  describe("length", () => {
    it("when invalid input", () => {
      expect(util.length(0)).to.equal(0);
      expect(util.length(10)).to.equal(0);
      expect(util.length(null)).to.equal(0);
      expect(util.length(undefined)).to.equal(0);
      expect(util.length(Infinity)).to.equal(0);
      expect(util.length(NaN)).to.equal(0);
      expect(util.length({})).to.equal(0);
      expect(util.length({a: 'a'})).to.equal(0);
    })

    it("when valid input", () => {
      expect(util.length('')).to.equal(0);
      expect(util.length('abc')).to.equal(3);
      expect(util.length('0')).to.equal(1);
      expect(util.length([])).to.equal(0);
      expect(util.length([10])).to.equal(1);
      expect(util.length([10, 'abc'])).to.equal(2);
    })
  })

  describe("isValidAddress", () => {
    it("when non-string input", () => {
      expect(util.isValidAddress(0)).to.equal(false);
      expect(util.isValidAddress(10)).to.equal(false);
      expect(util.isValidAddress(null)).to.equal(false);
      expect(util.isValidAddress(undefined)).to.equal(false);
      expect(util.isValidAddress(Infinity)).to.equal(false);
      expect(util.isValidAddress(NaN)).to.equal(false);
      expect(util.isValidAddress(0xCAcD898dBaEdBD9037aCd25b82417587E972838d)).to.equal(false);
      expect(util.isValidAddress({})).to.equal(false);
      expect(util.isValidAddress({a: 'a'})).to.equal(false);
      expect(util.isValidAddress([])).to.equal(false);
      expect(util.isValidAddress([10])).to.equal(false);
      expect(util.isValidAddress([10, 'abc'])).to.equal(false);
    })

    it("when string input", () => {
      expect(util.isValidAddress('')).to.equal(false);
      expect(util.isValidAddress('abc')).to.equal(false);
      expect(util.isValidAddress('0')).to.equal(false);
      expect(util.isValidAddress('0xcacd898dbaedbd9037acd25b82417587e972838d')).to.equal(true);
      expect(util.isValidAddress('0xCACD898DBAEDBD9037ACD25B82417587E972838D')).to.equal(true);
      expect(util.isValidAddress('0xCAcD898dBaEdBD9037aCd25b82417587E972838d')).to.equal(true);
    })
  })

  describe("isChecksumAddr", () => {
    it("when invalid-address input", () => {
      expect(util.isChecksumAddr(0)).to.equal(false);
      expect(util.isChecksumAddr(10)).to.equal(false);
      expect(util.isChecksumAddr(null)).to.equal(false);
      expect(util.isChecksumAddr(undefined)).to.equal(false);
      expect(util.isChecksumAddr(Infinity)).to.equal(false);
      expect(util.isChecksumAddr(NaN)).to.equal(false);
      expect(util.isChecksumAddr({})).to.equal(false);
      expect(util.isChecksumAddr({a: 'a'})).to.equal(false);
      expect(util.isChecksumAddr('')).to.equal(false);
      expect(util.isChecksumAddr('abc')).to.equal(false);
      expect(util.isChecksumAddr('0')).to.equal(false);
      expect(util.isChecksumAddr([])).to.equal(false);
      expect(util.isChecksumAddr([10])).to.equal(false);
      expect(util.isChecksumAddr([10, 'abc'])).to.equal(false);
    })

    it("when valid-address input", () => {
      expect(util.isChecksumAddr('0xcacd898dbaedbd9037acd25b82417587e972838d')).to.equal(false);
      expect(util.isChecksumAddr('0xCACD898DBAEDBD9037ACD25B82417587E972838D')).to.equal(false);
      expect(util.isChecksumAddr('0xCAcD898dBaEdBD9037aCd25b82417587E972838d')).to.equal(true);
    })
  })
})