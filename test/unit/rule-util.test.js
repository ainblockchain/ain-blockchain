const RuleUtil = require('../../db/rule-util');
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

  describe("isIntegerString", () => {
    it("when invalid input", () => {
      expect(util.isIntegerString(true)).to.equal(false);
      expect(util.isIntegerString(false)).to.equal(false);
      expect(util.isIntegerString(null)).to.equal(false);
      expect(util.isIntegerString(undefined)).to.equal(false);
      expect(util.isIntegerString(Infinity)).to.equal(false);
      expect(util.isIntegerString(NaN)).to.equal(false);
      expect(util.isIntegerString('')).to.equal(false);
      expect(util.isIntegerString('abc')).to.equal(false);
      expect(util.isIntegerString({})).to.equal(false);
      expect(util.isIntegerString({a: 'A'})).to.equal(false);
      expect(util.isIntegerString([])).to.equal(false);
      expect(util.isIntegerString([10])).to.equal(false);
      expect(util.isIntegerString(0)).to.equal(false);
      expect(util.isIntegerString(10)).to.equal(false);
      expect(util.isIntegerString(-1)).to.equal(false);
      expect(util.isIntegerString(15.5)).to.equal(false);
      expect(util.isIntegerString('15.5')).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isIntegerString('0')).to.equal(true);
      expect(util.isIntegerString('10')).to.equal(true);
      expect(util.isIntegerString('-1')).to.equal(true);
    })
  })

  describe("isFloatString", () => {
    it("when invalid input", () => {
      expect(util.isFloatString(true)).to.equal(false);
      expect(util.isFloatString(false)).to.equal(false);
      expect(util.isFloatString(null)).to.equal(false);
      expect(util.isFloatString(undefined)).to.equal(false);
      expect(util.isFloatString(Infinity)).to.equal(false);
      expect(util.isFloatString(NaN)).to.equal(false);
      expect(util.isFloatString('')).to.equal(false);
      expect(util.isFloatString('abc')).to.equal(false);
      expect(util.isFloatString({})).to.equal(false);
      expect(util.isFloatString({a: 'A'})).to.equal(false);
      expect(util.isFloatString([])).to.equal(false);
      expect(util.isFloatString([10])).to.equal(false);
      expect(util.isFloatString(0)).to.equal(false);
      expect(util.isFloatString(10)).to.equal(false);
      expect(util.isFloatString(-1)).to.equal(false);
      expect(util.isFloatString(15.5)).to.equal(false);
      expect(util.isFloatString('0')).to.equal(false);
      expect(util.isFloatString('-1.')).to.equal(false);
      expect(util.isFloatString('.234')).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isFloatString('1.1')).to.equal(true);
      expect(util.isFloatString('0.3')).to.equal(true);
      expect(util.isFloatString('-1.34')).to.equal(true);
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

  describe("isValidUrl", () => {
    it("when invalid input", () => {
      expect(util.isValidUrl(true)).to.equal(false);
      expect(util.isValidUrl(false)).to.equal(false);
      expect(util.isValidUrl(0)).to.equal(false);
      expect(util.isValidUrl(10)).to.equal(false);
      expect(util.isValidUrl(null)).to.equal(false);
      expect(util.isValidUrl(undefined)).to.equal(false);
      expect(util.isValidUrl(Infinity)).to.equal(false);
      expect(util.isValidUrl(NaN)).to.equal(false);
      expect(util.isValidUrl('')).to.equal(false);
      expect(util.isValidUrl('abc')).to.equal(false);
      expect(util.isValidUrl('0')).to.equal(false);
      expect(util.isValidUrl([10])).to.equal(false);
      expect(util.isValidUrl({a: 'A'})).to.equal(false);
      expect(util.isValidUrl('0x')).to.equal(false);
      expect(util.isValidUrl('0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8')).to.equal(false);
      expect(util.isValidUrl('ainetwork.ai')).to.equal(false);
      expect(util.isValidUrl('https://*.ainetwork.ai')).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isValidUrl('http://ainetwork.ai')).to.equal(true);
      expect(util.isValidUrl('https://ainetwork.ai')).to.equal(true);
      expect(util.isValidUrl('https://ainetwork.ai/some/api')).to.equal(true);
    })
  })

  describe("isValidPrivateUrl", () => {
    it("when invalid input", () => {
      expect(util.isValidPrivateUrl(true)).to.equal(false);
      expect(util.isValidPrivateUrl(false)).to.equal(false);
      expect(util.isValidPrivateUrl(0)).to.equal(false);
      expect(util.isValidPrivateUrl(10)).to.equal(false);
      expect(util.isValidPrivateUrl(null)).to.equal(false);
      expect(util.isValidPrivateUrl(undefined)).to.equal(false);
      expect(util.isValidPrivateUrl(Infinity)).to.equal(false);
      expect(util.isValidPrivateUrl(NaN)).to.equal(false);
      expect(util.isValidPrivateUrl('')).to.equal(false);
      expect(util.isValidPrivateUrl('abc')).to.equal(false);
      expect(util.isValidPrivateUrl('0')).to.equal(false);
      expect(util.isValidPrivateUrl([10])).to.equal(false);
      expect(util.isValidPrivateUrl({a: 'A'})).to.equal(false);
      expect(util.isValidPrivateUrl('0x')).to.equal(false);
      expect(util.isValidPrivateUrl('0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8')).to.equal(false);
      expect(util.isValidPrivateUrl('ainetwork.ai')).to.equal(false);
      expect(util.isValidPrivateUrl('https://*.ainetwork.ai')).to.equal(false);
      expect(util.isValidPrivateUrl('http://172.16.0.36:8080/json-rpc')).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isValidPrivateUrl('172.16.0.36')).to.equal(true);
      expect(util.isValidPrivateUrl('http://172.16.0.36')).to.equal(true);
      expect(util.isValidPrivateUrl('https://172.16.0.36')).to.equal(true);
      expect(util.isValidPrivateUrl('http://172.16.0.36:8080')).to.equal(true);
      expect(util.isValidPrivateUrl('https://172.16.0.36:9000')).to.equal(true);
    })
  })

  describe("isValidIpV4", () => {
    it("when invalid input", () => {
      util.isValid
      expect(util.isValidIpV4(true)).to.equal(false);
      expect(util.isValidIpV4(false)).to.equal(false);
      expect(util.isValidIpV4(0)).to.equal(false);
      expect(util.isValidIpV4(10)).to.equal(false);
      expect(util.isValidIpV4(null)).to.equal(false);
      expect(util.isValidIpV4(undefined)).to.equal(false);
      expect(util.isValidIpV4(Infinity)).to.equal(false);
      expect(util.isValidIpV4(NaN)).to.equal(false);
      expect(util.isValidIpV4('')).to.equal(false);
      expect(util.isValidIpV4('abc')).to.equal(false);
      expect(util.isValidIpV4('0')).to.equal(false);
      expect(util.isValidIpV4([10])).to.equal(false);
      expect(util.isValidIpV4({a: 'A'})).to.equal(false);
      expect(util.isValidIpV4('0x')).to.equal(false);
      expect(util.isValidIpV4('0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8')).to.equal(false);
      expect(util.isValidIpV4('ainetwork.ai')).to.equal(false);
      expect(util.isValidIpV4('https://*.ainetwork.ai')).to.equal(false);
      expect(util.isValidIpV4('http://172.16.0.36:8080/json-rpc')).to.equal(false);
      expect(util.isValidIpV4('http://172.16.0.36')).to.equal(false);
      expect(util.isValidIpV4('https://172.16.0.36')).to.equal(false);
      expect(util.isValidIpV4('http://172.16.0.36:8080')).to.equal(false);
      expect(util.isValidIpV4('https://172.16.0.36:9000')).to.equal(false);
      expect(util.isValidIpV4('::ffff:172.20.10.2')).to.equal(false);
      expect(util.isValidIpV4('172.')).to.equal(false);
      expect(util.isValidIpV4('172.16.')).to.equal(false);
      expect(util.isValidIpV4('172.16.0.')).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isValidIpV4('0.0.0.0')).to.equal(true);
      expect(util.isValidIpV4('172.16.0.36')).to.equal(true);
      expect(util.isValidIpV4('255.255.255.255')).to.equal(true);
    })
  })

  describe("isValidIpV6", () => {
    it("when invalid input", () => {
      expect(util.isValidIpV6(true)).to.equal(false);
      expect(util.isValidIpV6(false)).to.equal(false);
      expect(util.isValidIpV6(0)).to.equal(false);
      expect(util.isValidIpV6(10)).to.equal(false);
      expect(util.isValidIpV6(null)).to.equal(false);
      expect(util.isValidIpV6(undefined)).to.equal(false);
      expect(util.isValidIpV6(Infinity)).to.equal(false);
      expect(util.isValidIpV6(NaN)).to.equal(false);
      expect(util.isValidIpV6('')).to.equal(false);
      expect(util.isValidIpV6('abc')).to.equal(false);
      expect(util.isValidIpV6('0')).to.equal(false);
      expect(util.isValidIpV6([10])).to.equal(false);
      expect(util.isValidIpV6({a: 'A'})).to.equal(false);
      expect(util.isValidIpV6('0x')).to.equal(false);
      expect(util.isValidIpV6('0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8')).to.equal(false);
      expect(util.isValidIpV6('ainetwork.ai')).to.equal(false);
      expect(util.isValidIpV6('https://*.ainetwork.ai')).to.equal(false);
      expect(util.isValidIpV6('http://172.16.0.36:8080/json-rpc')).to.equal(false);
      expect(util.isValidIpV6('172.16.0.36')).to.equal(false);
      expect(util.isValidIpV6('http://172.16.0.36')).to.equal(false);
      expect(util.isValidIpV6('https://172.16.0.36')).to.equal(false);
      expect(util.isValidIpV6('http://172.16.0.36:8080')).to.equal(false);
      expect(util.isValidIpV6('https://172.16.0.36:9000')).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isValidIpV6('::ffff:172.20.10.2')).to.equal(true);
      expect(util.isValidIpV6('1:2:3:4:5:6:7:8')).to.equal(true);
      expect(util.isValidIpV6('1::4:5:6:7:8')).to.equal(true);
      expect(util.isValidIpV6('::2:3:4:5:6:7:8')).to.equal(true);
      expect(util.isValidIpV6('::255.255.255.255')).to.equal(true);
    })
  })

  describe("isValidUrlWhitelistItem", () => {
    it("when invalid input", () => {
      expect(util.isValidUrlWhitelistItem(true)).to.equal(false);
      expect(util.isValidUrlWhitelistItem(false)).to.equal(false);
      expect(util.isValidUrlWhitelistItem(0)).to.equal(false);
      expect(util.isValidUrlWhitelistItem(10)).to.equal(false);
      expect(util.isValidUrlWhitelistItem(null)).to.equal(false);
      expect(util.isValidUrlWhitelistItem(undefined)).to.equal(false);
      expect(util.isValidUrlWhitelistItem(Infinity)).to.equal(false);
      expect(util.isValidUrlWhitelistItem(NaN)).to.equal(false);
      expect(util.isValidUrlWhitelistItem('')).to.equal(false);
      expect(util.isValidUrlWhitelistItem('abc')).to.equal(false);
      expect(util.isValidUrlWhitelistItem('0')).to.equal(false);
      expect(util.isValidUrlWhitelistItem([10])).to.equal(false);
      expect(util.isValidUrlWhitelistItem({a: 'A'})).to.equal(false);
      expect(util.isValidUrlWhitelistItem('0x')).to.equal(false);
      expect(util.isValidUrlWhitelistItem('0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8')).to.equal(false);
      expect(util.isValidUrlWhitelistItem('ainetwork.ai')).to.equal(false);
    })

    it("when valid input", () => {
      expect(util.isValidUrlWhitelistItem('http://ainetwork.ai')).to.equal(true);
      expect(util.isValidUrlWhitelistItem('https://ainetwork.ai')).to.equal(true);
      expect(util.isValidUrlWhitelistItem('https://ainetwork.ai/some/api')).to.equal(true);
      expect(util.isValidUrlWhitelistItem('https://*.ainetwork.ai')).to.equal(true);
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

    it("when valid-address but invalid service name input with blockNumber = 0", () => {
      expect(util.isServAcntName(
          'staking|Consensus|0x09A0d53FDf1c36A131938eb379b98910e55EEfe1', 0)).to.equal(true);
      expect(util.isServAcntName(
          'staking|Consensus|0x09A0d53FDf1c36A131938eb379b98910e55EEfe1|0', 0)).to.equal(true);
    })

    it("when valid-address but invalid service name input with blockNumber = 2", () => {
      expect(util.isServAcntName(
          'staking|Consensus|0x09A0d53FDf1c36A131938eb379b98910e55EEfe1', 2)).to.equal(false);
      expect(util.isServAcntName(
          'staking|Consensus|0x09A0d53FDf1c36A131938eb379b98910e55EEfe1|0', 2)).to.equal(false);
    })
  })

  describe('countDecimals', () => {
    it('returns zero', () => {
      expect(util.countDecimals(0)).to.equal(0);  // '0'
      expect(util.countDecimals(1)).to.equal(0);  // '1'
      expect(util.countDecimals(10)).to.equal(0);  // '10'
      expect(util.countDecimals(100)).to.equal(0);  // '100'
      expect(util.countDecimals(1000)).to.equal(0);  // '1000'
      expect(util.countDecimals(10000)).to.equal(0);  // '10000'
      expect(util.countDecimals(100000)).to.equal(0);  // '100000'
      expect(util.countDecimals(1000000)).to.equal(0);  // '1000000'
      expect(util.countDecimals(10000000)).to.equal(0);  // '10000000'
      expect(util.countDecimals(100000000)).to.equal(0);  // '100000000'
      expect(util.countDecimals(1000000000)).to.equal(0);  // '1000000000'
      expect(util.countDecimals(1234567890)).to.equal(0);  // '1234567890'
      expect(util.countDecimals(-1)).to.equal(0);  // '-1'
      expect(util.countDecimals(-1000000000)).to.equal(0);  // '-1000000000'
      expect(util.countDecimals(11)).to.equal(0);  // '11'
      expect(util.countDecimals(101)).to.equal(0);  // '101'
      expect(util.countDecimals(1001)).to.equal(0);  // '1001'
      expect(util.countDecimals(10001)).to.equal(0);  // '10001'
      expect(util.countDecimals(100001)).to.equal(0);  // '100001'
      expect(util.countDecimals(1000001)).to.equal(0);  // '1000001'
      expect(util.countDecimals(10000001)).to.equal(0);  // '10000001'
      expect(util.countDecimals(100000001)).to.equal(0);  // '100000001'
      expect(util.countDecimals(1000000001)).to.equal(0);  // '1000000001'
      expect(util.countDecimals(-11)).to.equal(0);  // '-11'
      expect(util.countDecimals(-1000000001)).to.equal(0);  // '-1000000001'
    });

    it('returns positive', () => {
      expect(util.countDecimals(0.1)).to.equal(1);  // '0.1'
      expect(util.countDecimals(0.01)).to.equal(2);  // '0.01'
      expect(util.countDecimals(0.001)).to.equal(3);  // '0.001'
      expect(util.countDecimals(0.0001)).to.equal(4);  // '0.0001'
      expect(util.countDecimals(0.00001)).to.equal(5);  // '0.00001'
      expect(util.countDecimals(0.000001)).to.equal(6);  // '0.000001'
      expect(util.countDecimals(0.0000001)).to.equal(7);  // '1e-7'
      expect(util.countDecimals(0.00000001)).to.equal(8);  // '1e-8'
      expect(util.countDecimals(0.000000001)).to.equal(9);  // '1e-9'
      expect(util.countDecimals(0.0000000001)).to.equal(10);  // '1e-10'
      expect(util.countDecimals(-0.1)).to.equal(1);  // '-0.1'
      expect(util.countDecimals(-0.0000000001)).to.equal(10);  // '-1e-10'
      expect(util.countDecimals(1.2)).to.equal(1);  // '1.2'
      expect(util.countDecimals(0.12)).to.equal(2);  // '0.12'
      expect(util.countDecimals(0.012)).to.equal(3);  // '0.012'
      expect(util.countDecimals(0.0012)).to.equal(4);  // '0.0012'
      expect(util.countDecimals(0.00012)).to.equal(5);  // '0.00012'
      expect(util.countDecimals(0.000012)).to.equal(6);  // '0.000012'
      expect(util.countDecimals(0.0000012)).to.equal(7);  // '0.0000012'
      expect(util.countDecimals(0.00000012)).to.equal(8);  // '1.2e-7'
      expect(util.countDecimals(0.000000012)).to.equal(9);  // '1.2e-8'
      expect(util.countDecimals(0.0000000012)).to.equal(10);  // '1.2e-9'
      expect(util.countDecimals(-1.2)).to.equal(1);  // '-1.2'
      expect(util.countDecimals(-0.0000000012)).to.equal(10);  // '-1.2e-9'
      expect(util.countDecimals(1.03)).to.equal(2);  // '1.03'
      expect(util.countDecimals(1.003)).to.equal(3);  // '1.003'
      expect(util.countDecimals(1.0003)).to.equal(4);  // '1.0003'
      expect(util.countDecimals(1.00003)).to.equal(5);  // '1.00003'
      expect(util.countDecimals(1.000003)).to.equal(6);  // '1.000003'
      expect(util.countDecimals(1.0000003)).to.equal(7);  // '1.0000003'
      expect(util.countDecimals(1.00000003)).to.equal(8);  // '1.00000003'
      expect(util.countDecimals(1.000000003)).to.equal(9);  // '1.000000003'
      expect(util.countDecimals(1.0000000003)).to.equal(10);  // '1.0000000003'
      expect(util.countDecimals(-1.03)).to.equal(2);  // '-1.03'
      expect(util.countDecimals(-1.0000000003)).to.equal(10);  // '-1.0000000003'
    });
  });

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

  describe("validateManageAppAdminConfig", () => {
    it("returns false", () => {
      expect(util.validateManageAppAdminConfig(0)).to.equal(false);
      expect(util.validateManageAppAdminConfig(10)).to.equal(false);
      expect(util.validateManageAppAdminConfig(-1)).to.equal(false);
      expect(util.validateManageAppAdminConfig(15.5)).to.equal(false);
      expect(util.validateManageAppAdminConfig(null)).to.equal(false);
      expect(util.validateManageAppAdminConfig(undefined)).to.equal(false);
      expect(util.validateManageAppAdminConfig(Infinity)).to.equal(false);
      expect(util.validateManageAppAdminConfig(NaN)).to.equal(false);
      expect(util.validateManageAppAdminConfig('')).to.equal(false);
      expect(util.validateManageAppAdminConfig('abc')).to.equal(false);
      expect(util.validateManageAppAdminConfig('false')).to.equal(false);
      expect(util.validateManageAppAdminConfig({})).to.equal(false);
      expect(util.validateManageAppAdminConfig({a: 'A'})).to.equal(false);
      expect(util.validateManageAppAdminConfig([])).to.equal(false);
      expect(util.validateManageAppAdminConfig([10])).to.equal(false);
      expect(util.validateManageAppAdminConfig(false)).to.equal(false);
      expect(util.validateManageAppAdminConfig({'0xCAcD898dBaEdBD9037aCd25b82417587E972838d': 1})).to.equal(false);
      expect(util.validateManageAppAdminConfig({'0xcacd898dbaedbd9037acd25b82417587e972838d': true})).to.equal(false);
    })

    it("returns true", () => {
      expect(util.validateManageAppAdminConfig({'0xCAcD898dBaEdBD9037aCd25b82417587E972838d': true})).to.equal(true);
      expect(util.validateManageAppAdminConfig({'0xCAcD898dBaEdBD9037aCd25b82417587E972838d': false})).to.equal(true);
      expect(util.validateManageAppAdminConfig({
        '0xCAcD898dBaEdBD9037aCd25b82417587E972838d': true,
        '0x00ADEc28B6a845a085e03591bE7550dd68673C1C': false
      })).to.equal(true);
    })
  })

  describe("validateManageAppBillingConfig", () => {
    it("returns false", () => {
      expect(util.validateManageAppBillingConfig(0)).to.equal(false);
      expect(util.validateManageAppBillingConfig(10)).to.equal(false);
      expect(util.validateManageAppBillingConfig(-1)).to.equal(false);
      expect(util.validateManageAppBillingConfig(15.5)).to.equal(false);
      expect(util.validateManageAppBillingConfig(null)).to.equal(false);
      expect(util.validateManageAppBillingConfig(undefined)).to.equal(false);
      expect(util.validateManageAppBillingConfig(Infinity)).to.equal(false);
      expect(util.validateManageAppBillingConfig(NaN)).to.equal(false);
      expect(util.validateManageAppBillingConfig('')).to.equal(false);
      expect(util.validateManageAppBillingConfig('abc')).to.equal(false);
      expect(util.validateManageAppBillingConfig('false')).to.equal(false);
      expect(util.validateManageAppBillingConfig({})).to.equal(false);
      expect(util.validateManageAppBillingConfig({a: 'A'})).to.equal(false);
      expect(util.validateManageAppBillingConfig([])).to.equal(false);
      expect(util.validateManageAppBillingConfig([10])).to.equal(false);
      expect(util.validateManageAppBillingConfig(false)).to.equal(false);
      expect(util.validateManageAppBillingConfig({'0xCAcD898dBaEdBD9037aCd25b82417587E972838d': 1})).to.equal(false);
      expect(util.validateManageAppBillingConfig({
        account1: {
          users: {
            '0xcacd898dbaedbd9037acd25b82417587e972838d': true
          }
        }
      })).to.equal(false);
      expect(util.validateManageAppBillingConfig({
        account1: {
          users: {
            '0xCAcD898dBaEdBD9037aCd25b82417587E972838d': 0
          }
        }
      })).to.equal(false);
      expect(util.validateManageAppBillingConfig({
        account1: {
          users: {
            '0xCAcD898dBaEdBD9037aCd25b82417587E972838d': '123'
          }
        }
      })).to.equal(false);
      expect(util.validateManageAppBillingConfig({
        account1: {
          users: {
            '0xCAcD898dBaEdBD9037aCd25b82417587E972838d': null
          }
        }
      })).to.equal(false);
      expect(util.validateManageAppBillingConfig({
        account1: {
          not_users: {
            '0xCAcD898dBaEdBD9037aCd25b82417587E972838d': true
          }
        }
      })).to.equal(false);
    })

    it("returns true", () => {
      expect(util.validateManageAppBillingConfig({
        account1: {
          users: {
            '0xCAcD898dBaEdBD9037aCd25b82417587E972838d': true
          }
        }
      })).to.equal(true);
      expect(util.validateManageAppBillingConfig({
        account1: {
          users: {
            '0xCAcD898dBaEdBD9037aCd25b82417587E972838d': true,
            '0x00ADEc28B6a845a085e03591bE7550dd68673C1C': false
          }
        }
      })).to.equal(true);
      expect(util.validateManageAppBillingConfig({
        account1: {
          users: {
            '0xCAcD898dBaEdBD9037aCd25b82417587E972838d': true
          }
        },
        account2: {
          users: {
            '0x00ADEc28B6a845a085e03591bE7550dd68673C1C': false
          }
        }
      })).to.equal(true);
    })
  })

  describe("validateManageAppIsPublicConfig", () => {
    it("returns false", () => {
      expect(util.validateManageAppIsPublicConfig(0)).to.equal(false);
      expect(util.validateManageAppIsPublicConfig(10)).to.equal(false);
      expect(util.validateManageAppIsPublicConfig(-1)).to.equal(false);
      expect(util.validateManageAppIsPublicConfig(15.5)).to.equal(false);
      expect(util.validateManageAppIsPublicConfig(undefined)).to.equal(false);
      expect(util.validateManageAppIsPublicConfig(Infinity)).to.equal(false);
      expect(util.validateManageAppIsPublicConfig(NaN)).to.equal(false);
      expect(util.validateManageAppIsPublicConfig('')).to.equal(false);
      expect(util.validateManageAppIsPublicConfig('abc')).to.equal(false);
      expect(util.validateManageAppIsPublicConfig('false')).to.equal(false);
      expect(util.validateManageAppIsPublicConfig({})).to.equal(false);
      expect(util.validateManageAppIsPublicConfig({a: 'A'})).to.equal(false);
      expect(util.validateManageAppIsPublicConfig([])).to.equal(false);
      expect(util.validateManageAppIsPublicConfig([10])).to.equal(false);
    })

    it("returns true", () => {
      expect(util.validateManageAppIsPublicConfig(true)).to.equal(true);
      expect(util.validateManageAppIsPublicConfig(false)).to.equal(true);
      expect(util.validateManageAppIsPublicConfig(null)).to.equal(true);
    })
  })

  describe("validateManageAppServiceConfig", () => {
    it("returns false", () => {
      expect(util.validateManageAppServiceConfig(0)).to.equal(false);
      expect(util.validateManageAppServiceConfig(10)).to.equal(false);
      expect(util.validateManageAppServiceConfig(-1)).to.equal(false);
      expect(util.validateManageAppServiceConfig(15.5)).to.equal(false);
      expect(util.validateManageAppServiceConfig(null)).to.equal(false);
      expect(util.validateManageAppServiceConfig(undefined)).to.equal(false);
      expect(util.validateManageAppServiceConfig(Infinity)).to.equal(false);
      expect(util.validateManageAppServiceConfig(NaN)).to.equal(false);
      expect(util.validateManageAppServiceConfig('')).to.equal(false);
      expect(util.validateManageAppServiceConfig('abc')).to.equal(false);
      expect(util.validateManageAppServiceConfig('false')).to.equal(false);
      expect(util.validateManageAppServiceConfig({})).to.equal(false);
      expect(util.validateManageAppServiceConfig({a: 'A'})).to.equal(false);
      expect(util.validateManageAppServiceConfig([])).to.equal(false);
      expect(util.validateManageAppServiceConfig([10])).to.equal(false);
      expect(util.validateManageAppServiceConfig(false)).to.equal(false);
      expect(util.validateManageAppServiceConfig({
        staking: {
          lockup_duration: -1
        }
      })).to.equal(false);
      expect(util.validateManageAppServiceConfig({
        staking: {
          lockup_duration: 1.1
        }
      })).to.equal(false);
      expect(util.validateManageAppServiceConfig({
        staking: {
          lockup_duration: '100'
        }
      })).to.equal(false);
      expect(util.validateManageAppServiceConfig({
        staking: {
          not_lockup_duration: 10
        }
      })).to.equal(false);
      expect(util.validateManageAppServiceConfig({
        not_staking: {
          lockup_duration: 100
        }
      })).to.equal(false);
      expect(util.validateManageAppServiceConfig({
        staking: {
          lockup_duration: 100
        },
        not_staking: {
          something: '123'
        }
      })).to.equal(false);
    })

    it("returns true", () => {
      expect(util.validateManageAppServiceConfig({
        staking: {
          lockup_duration: 100
        }
      })).to.equal(true);
      expect(util.validateManageAppServiceConfig({
        staking: {
          lockup_duration: 0
        }
      })).to.equal(true);
    })
  })

  describe("checkValuePathLen", () => {
    it("returns false", () => {
      expect(util.checkValuePathLen(0, 0)).to.equal(false);
      expect(util.checkValuePathLen(10, 0)).to.equal(false);
      expect(util.checkValuePathLen(-1, 0)).to.equal(false);
      expect(util.checkValuePathLen(15.5, 0)).to.equal(false);
      expect(util.checkValuePathLen(null, 0)).to.equal(false);
      expect(util.checkValuePathLen(undefined, 0)).to.equal(false);
      expect(util.checkValuePathLen(Infinity, 0)).to.equal(false);
      expect(util.checkValuePathLen(NaN, 0)).to.equal(false);
      expect(util.checkValuePathLen('', 0)).to.equal(false);
      expect(util.checkValuePathLen('abc', 0)).to.equal(false);
      expect(util.checkValuePathLen('false', 0)).to.equal(false);
      expect(util.checkValuePathLen({}, 0)).to.equal(false);
      expect(util.checkValuePathLen({a: 'A'}, 1)).to.equal(false);
      expect(util.checkValuePathLen(['1', '2', '3'], 2)).to.equal(false);
      expect(util.checkValuePathLen(['1', '2', '3'], -1)).to.equal(false);
    })

    it("returns true", () => {
      expect(util.checkValuePathLen([], 0)).to.equal(true);
      expect(util.checkValuePathLen(['1', '2', '3'], 3)).to.equal(true);
    })
  })
})
