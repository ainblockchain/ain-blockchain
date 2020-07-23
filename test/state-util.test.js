const {
  isValidStateObject,
  convertToStateTree,
  convertFromStateTree
} = require('../db/state-util');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("state-util", () => {
  describe("isValidStateObject", () => {
    it("when invalid input", () => {
      expect(isValidStateObject(undefined)).to.equal(false);
      expect(isValidStateObject([])).to.equal(false);
      expect(isValidStateObject([1, 2, 3])).to.equal(false);
      expect(isValidStateObject(['a', 'b', 'c'])).to.equal(false);
      expect(isValidStateObject({
        str: "str",
        number: 10,
        null: null,
        undef: undefined 
      })).to.equal(false);
      expect(isValidStateObject({
        str: "str",
        number: 10,
        null: null,
        array: []
      })).to.equal(false);
    })

    it("when valid input", () => {
      expect(isValidStateObject(10)).to.equal(true);
      expect(isValidStateObject("str")).to.equal(true);
      expect(isValidStateObject(null)).to.equal(true);
      expect(isValidStateObject({})).to.equal(true);
      expect(isValidStateObject({
        str: "str",
        number: 10,
        null: null,
        subobj1: {
          str: "str2",
          number: 20,
          null: null,
        },
        subobj2: {
          str: "str3",
          number: -10,
          null: null,
        }
      })).to.equal(true);
    })
  })

  describe("convert", () => {
    it("when valid input", () => {
      const stateObj = {
        str: "str",
        number: 10,
        null: null,
        subobj1: {
          str: "str2",
          number: 20,
          null: null,
        },
        subobj2: {
          str: "str3",
          number: -10,
          null: null,
        }
      };
      assert.deepEqual(convertFromStateTree(convertToStateTree(stateObj)), stateObj);
    })
  })
})