const { convertIpv6ToIpv4 } = require('../../common/network-util');
const _ = require('lodash');
const chai = require('chai');
const expect = chai.expect;

describe("network-util", () => {
  describe("convertIpv6ToIpv4", () => {
    it("when non-string input", () => {
      expect(convertIpv6ToIpv4(null)).to.equal('');
      expect(convertIpv6ToIpv4(undefined)).to.equal('');
      expect(convertIpv6ToIpv4(true)).to.equal('');
      expect(convertIpv6ToIpv4(false)).to.equal('');
      expect(convertIpv6ToIpv4(0)).to.equal('');
      expect(convertIpv6ToIpv4([])).to.equal('');
      expect(convertIpv6ToIpv4({})).to.equal('');
    })

    it("when string input not replaced", () => {
      expect(convertIpv6ToIpv4('')).to.equal('');
      expect(convertIpv6ToIpv4('abc')).to.equal('abc');
      expect(convertIpv6ToIpv4('0')).to.equal('0');
      expect(convertIpv6ToIpv4('\u2000\u2E00')).to.equal('\u2000\u2E00');
      expect(convertIpv6ToIpv4('192.0.2.146')).to.equal('192.0.2.146');
    })

    it("when string input replaced", () => {
      expect(convertIpv6ToIpv4('::ffff:192.0.2.146')).to.equal('192.0.2.146');
    })
  })
})