const {
  isValidStateObject,
  convertToStateTree,
  convertFromStateTree,
  deleteStateTree,
  makeCopyOfStateTree,
} = require('../db/state-util');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("state-util", () => {
  describe("isValidStateObject", () => {
    it("when invalid input", () => {
      expect(isValidStateObject(undefined)).to.equal(false);
      expect(isValidStateObject({})).to.equal(false);
      expect(isValidStateObject([])).to.equal(false);
      expect(isValidStateObject([1, 2, 3])).to.equal(false);
      expect(isValidStateObject(['a', 'b', 'c'])).to.equal(false);
      expect(isValidStateObject({
        undef: undefined 
      })).to.equal(false);
      expect(isValidStateObject({
        empty_obj: {}
      })).to.equal(false);
      expect(isValidStateObject({
        array: []
      })).to.equal(false);
      expect(isValidStateObject({
        array: [1, 2, 3]
      })).to.equal(false);
      expect(isValidStateObject({
        array: ['a', 'b', 'c']
      })).to.equal(false);
    })

    it("when valid input", () => {
      expect(isValidStateObject(10)).to.equal(true);
      expect(isValidStateObject("str")).to.equal(true);
      expect(isValidStateObject(null)).to.equal(true);
      expect(isValidStateObject({
        bool: false,
        number: 10,
        str: 'str',
        empty_str: '',
        null: null,
        subobj1: {
          bool: true,
          number: 20,
          str: 'str2',
          empty_str: '',
          null: null,
        },
        subobj2: {
          bool: true,
          number: -10,
          str: 'str3',
          empty_str: '',
          null: null,
        }
      })).to.equal(true);
      expect(isValidStateObject({
        "owners": {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true
              }
            }
          }
        },
        "rules": {
          ".write": true
        }
      })).to.equal(true);
    })
  })

  describe("convertToStateTree / convertFromStateTree", () => {
    it("when valid input", () => {
      expect(convertFromStateTree(convertToStateTree(true))).to.equal(true);
      expect(convertFromStateTree(convertToStateTree(false))).to.equal(false);
      expect(convertFromStateTree(convertToStateTree(10))).to.equal(10);
      expect(convertFromStateTree(convertToStateTree('str'))).to.equal('str');
      expect(convertFromStateTree(convertToStateTree(null))).to.equal(null);
      const stateObj = {
        bool: false,
        number: 10,
        str: 'str',
        empty_str: '',
        null: null,
        undef: undefined,
        empty_obj: {},
        subobj1: {
          bool: true,
          number: 20,
          str: 'str2',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: {},
        },
        subobj2: {
          bool: true,
          number: -10,
          str: 'str3',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: {},
        }
      };
      assert.deepEqual(convertFromStateTree(convertToStateTree(stateObj)), {
        bool: false,
        number: 10,
        str: 'str',
        empty_str: '',
        null: null,
        undef: undefined,
        empty_obj: null,
        subobj1: {
          bool: true,
          number: 20,
          str: 'str2',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: null,
        },
        subobj2: {
          bool: true,
          number: -10,
          str: 'str3',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: null,
        }
      });
    })
  })

  describe("makeCopyOfStateTree", () => {
    it("when valid input", () => {
      const stateObj = {
        bool: false,
        number: 10,
        str: 'str',
        empty_str: '',
        null: null,
        undef: undefined,
        empty_obj: {},
        subobj1: {
          bool: true,
          number: 20,
          str: 'str2',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: {},
        },
        subobj2: {
          bool: true,
          number: -10,
          str: 'str3',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: {},
        }
      };
      const root = convertToStateTree(stateObj);
      const copy = makeCopyOfStateTree(root);
      deleteStateTree(root);
      assert.deepEqual(convertFromStateTree(copy), {
        bool: false,
        number: 10,
        str: 'str',
        empty_str: '',
        null: null,
        undef: undefined,
        empty_obj: null,
        subobj1: {
          bool: true,
          number: 20,
          str: 'str2',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: null,
        },
        subobj2: {
          bool: true,
          number: -10,
          str: 'str3',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: null,
        }
      });
    })
  })
})