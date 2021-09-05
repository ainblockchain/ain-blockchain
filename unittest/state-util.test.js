const {
  hasEnabledShardConfig,
  isWritablePathWithSharding,
  hasReservedChar,
  hasAllowedPattern,
  isValidServiceName,
  isValidStateLabel,
  isValidPathForStates,
  isValidJsObjectForStates,
  isValidRuleConfig,
  isValidRuleTree,
  isValidFunctionConfig,
  isValidFunctionTree,
  isValidOwnerConfig,
  isValidOwnerTree,
  applyFunctionChange,
  applyOwnerChange,
  setStateTreeVersion,
  renameStateTreeVersion,
  deleteStateTree,
  deleteStateTreeVersion,
  makeCopyOfStateTree,
  equalStateTrees,
  updateStateInfoForAllRootPaths,
  updateStateInfoForStateTree,
  verifyProofHashForStateTree,
  getProofOfStatePath,
} = require('../db/state-util');
const { STATE_LABEL_LENGTH_LIMIT } = require('../common/constants');
const { GET_OPTIONS_INCLUDE_ALL } = require('./test-util');
const StateNode = require('../db/state-node');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("state-util", () => {
  describe("hasEnabledShardConfig", () => {
    it("when input without matched shard config returning false", () => {
      expect(hasEnabledShardConfig(StateNode.fromJsObject(null))).to.equal(false);
      expect(hasEnabledShardConfig(StateNode.fromJsObject({}))).to.equal(false);
      expect(hasEnabledShardConfig(StateNode.fromJsObject({
        subtree: {
          path: "some value"
        },
        str: "string value"
      }
      ))).to.equal(false);
      expect(hasEnabledShardConfig(StateNode.fromJsObject({
        subtree: {
          path: "some value",
          ".shard": {
            sharding_enabled: true
          }
        },
        str: "string value"
      }
      ))).to.equal(false);
    })

    it("when input with matched shard config returning false", () => {
      expect(hasEnabledShardConfig(StateNode.fromJsObject({
        subtree: {
          path: "some value",
        },
        str: "string value",
        ".shard": {
          sharding_enabled: false
        }
      }
      ))).to.equal(false);
    })

    it("when input with shard config returning true", () => {
      expect(hasEnabledShardConfig(StateNode.fromJsObject({
        subtree: {
          path: "some value",
        },
        str: "string value",
        ".shard": {
          sharding_enabled: true
        }
      }
      ))).to.equal(true);
    })
  })

  describe("isWritablePathWithSharding", () => {
    it("when non-writable path with shard config", () => {
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path'],
          StateNode.fromJsObject({
            some: {
              path: {
                ".shard": {
                  sharding_enabled: true
                }
              }
            }
          })), {isValid: false, invalidPath: '/some/path'});
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path'],
          StateNode.fromJsObject({
            some: {
              other_path: true,
              ".shard": {
                sharding_enabled: true
              }
            }
          })), {isValid: false, invalidPath: '/some'});
    })

    it("when writable path without shard config", () => {
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path'],
          StateNode.fromJsObject({
            some: {
              path: true
            }
          })), {isValid: true, invalidPath: ''});
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path'],
          StateNode.fromJsObject({
            some: {
              other_path: true
            }
          })), {isValid: true, invalidPath: ''});
    })
    it("when writable path with shard config", () => {
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path'],
          StateNode.fromJsObject({
            some: {
              path: {
                ".shard": {
                  sharding_enabled: false
                }
              }
            }
          })), {isValid: true, invalidPath: ''});
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path'],
          StateNode.fromJsObject({
            some: {
              other_path: true,
              ".shard": {
                sharding_enabled: false
              }
            }
          })), {isValid: true, invalidPath: ''});
    })
    it("when writable path through shard config", () => {
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path', '.shard', 'sharding_enabled'],
          StateNode.fromJsObject({
            some: {
              path: {
                ".shard": {
                  sharding_enabled: true
                }
              }
            }
          })), {isValid: true, invalidPath: ''});
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path', '.shard', 'proof_hash_map'],
          StateNode.fromJsObject({
            some: {
              path: {
                ".shard": {
                  sharding_enabled: true
                }
              }
            }
          })), {isValid: true, invalidPath: ''});
    })
  })

  describe("hasReservedChar", () => {
    it("when non-string input", () => {
      expect(hasReservedChar(null)).to.equal(false);
      expect(hasReservedChar(undefined)).to.equal(false);
      expect(hasReservedChar(true)).to.equal(false);
      expect(hasReservedChar(false)).to.equal(false);
      expect(hasReservedChar(0)).to.equal(false);
      expect(hasReservedChar([])).to.equal(false);
      expect(hasReservedChar({})).to.equal(false);
    })

    it("when string input returning false", () => {
      expect(hasReservedChar('')).to.equal(false);
      expect(hasReservedChar('abc')).to.equal(false);
      expect(hasReservedChar('ABC')).to.equal(false);
      expect(hasReservedChar('0')).to.equal(false);
      expect(hasReservedChar('true')).to.equal(false);
      expect(hasReservedChar('\u2000\u2E00')).to.equal(false);
    })

    it("when string input returning true", () => {
      expect(hasReservedChar('/')).to.equal(true);
      expect(hasReservedChar('/abc')).to.equal(true);
      expect(hasReservedChar('a/bc')).to.equal(true);
      expect(hasReservedChar('abc/')).to.equal(true);
      expect(hasReservedChar('.')).to.equal(true);
      expect(hasReservedChar('$')).to.equal(true);
      expect(hasReservedChar('*')).to.equal(true);
      expect(hasReservedChar('#')).to.equal(true);
      expect(hasReservedChar('{')).to.equal(true);
      expect(hasReservedChar('}')).to.equal(true);
      expect(hasReservedChar('[')).to.equal(true);
      expect(hasReservedChar(']')).to.equal(true);
      expect(hasReservedChar('<')).to.equal(true);
      expect(hasReservedChar('>')).to.equal(true);
      expect(hasReservedChar("'")).to.equal(true);
      expect(hasReservedChar('"')).to.equal(true);
      expect(hasReservedChar('`')).to.equal(true);
      expect(hasReservedChar(' ')).to.equal(true);
      expect(hasReservedChar('\u2000/\u2E00')).to.equal(true);
      expect(hasReservedChar('\x00')).to.equal(true);
      expect(hasReservedChar('\x01')).to.equal(true);
      expect(hasReservedChar('\x02')).to.equal(true);
      expect(hasReservedChar('\x03')).to.equal(true);
      expect(hasReservedChar('\x04')).to.equal(true);
      expect(hasReservedChar('\x05')).to.equal(true);
      expect(hasReservedChar('\x06')).to.equal(true);
      expect(hasReservedChar('\x07')).to.equal(true);
      expect(hasReservedChar('\x08')).to.equal(true);
      expect(hasReservedChar('\x09')).to.equal(true);
      expect(hasReservedChar('\x0A')).to.equal(true);
      expect(hasReservedChar('\x0B')).to.equal(true);
      expect(hasReservedChar('\x0C')).to.equal(true);
      expect(hasReservedChar('\x0D')).to.equal(true);
      expect(hasReservedChar('\x0E')).to.equal(true);
      expect(hasReservedChar('\x0F')).to.equal(true);
      expect(hasReservedChar('\x10')).to.equal(true);
      expect(hasReservedChar('\x11')).to.equal(true);
      expect(hasReservedChar('\x12')).to.equal(true);
      expect(hasReservedChar('\x13')).to.equal(true);
      expect(hasReservedChar('\x14')).to.equal(true);
      expect(hasReservedChar('\x15')).to.equal(true);
      expect(hasReservedChar('\x16')).to.equal(true);
      expect(hasReservedChar('\x17')).to.equal(true);
      expect(hasReservedChar('\x18')).to.equal(true);
      expect(hasReservedChar('\x19')).to.equal(true);
      expect(hasReservedChar('\x1A')).to.equal(true);
      expect(hasReservedChar('\x1B')).to.equal(true);
      expect(hasReservedChar('\x1C')).to.equal(true);
      expect(hasReservedChar('\x1D')).to.equal(true);
      expect(hasReservedChar('\x1E')).to.equal(true);
      expect(hasReservedChar('\x1F')).to.equal(true);
      expect(hasReservedChar('\x7F')).to.equal(true);
    })
  })

  describe("hasAllowedPattern", () => {
    it("when non-string input", () => {
      expect(hasAllowedPattern(null)).to.equal(false);
      expect(hasAllowedPattern(undefined)).to.equal(false);
      expect(hasAllowedPattern(true)).to.equal(false);
      expect(hasAllowedPattern(false)).to.equal(false);
      expect(hasAllowedPattern(0)).to.equal(false);
      expect(hasAllowedPattern([])).to.equal(false);
      expect(hasAllowedPattern({})).to.equal(false);
    })

    it("when string input returning false", () => {
      expect(hasAllowedPattern('/')).to.equal(false);
      expect(hasAllowedPattern('/abc')).to.equal(false);
      expect(hasAllowedPattern('a/bc')).to.equal(false);
      expect(hasAllowedPattern('abc/')).to.equal(false);
      expect(hasAllowedPattern('.')).to.equal(false);
      expect(hasAllowedPattern('./')).to.equal(false);
      expect(hasAllowedPattern('a.')).to.equal(false);
      expect(hasAllowedPattern('a.b')).to.equal(false);
      expect(hasAllowedPattern('..')).to.equal(false);
      expect(hasAllowedPattern('.$')).to.equal(false);
      expect(hasAllowedPattern('$.')).to.equal(false);
      expect(hasAllowedPattern('$')).to.equal(false);
      expect(hasAllowedPattern('$/')).to.equal(false);
      expect(hasAllowedPattern('a$')).to.equal(false);
      expect(hasAllowedPattern('a$b')).to.equal(false);
      expect(hasAllowedPattern('$$')).to.equal(false);
      expect(hasAllowedPattern('*a')).to.equal(false);
      expect(hasAllowedPattern('a*')).to.equal(false);
      expect(hasAllowedPattern('#')).to.equal(false);
      expect(hasAllowedPattern('{')).to.equal(false);
      expect(hasAllowedPattern('}')).to.equal(false);
      expect(hasAllowedPattern('[')).to.equal(false);
      expect(hasAllowedPattern(']')).to.equal(false);
      expect(hasAllowedPattern('<')).to.equal(false);
      expect(hasAllowedPattern('>')).to.equal(false);
      expect(hasAllowedPattern("'")).to.equal(false);
      expect(hasAllowedPattern('"')).to.equal(false);
      expect(hasAllowedPattern('`')).to.equal(false);
      expect(hasAllowedPattern(' ')).to.equal(false);
    })

    it("when string input returning true", () => {
      expect(hasAllowedPattern('.a')).to.equal(true);
      expect(hasAllowedPattern('$a')).to.equal(true);
      expect(hasAllowedPattern('*')).to.equal(true);
    })
  })

  describe("isValidServiceName", () => {
    it("when non-string input", () => {
      expect(isValidServiceName(null)).to.equal(false);
      expect(isValidServiceName(undefined)).to.equal(false);
      expect(isValidServiceName(true)).to.equal(false);
      expect(isValidServiceName(false)).to.equal(false);
      expect(isValidServiceName(0)).to.equal(false);
      expect(isValidServiceName([])).to.equal(false);
      expect(isValidServiceName({})).to.equal(false);
    })

    it("when string input returning false", () => {
      expect(isValidServiceName('')).to.equal(false);
      expect(isValidServiceName('.')).to.equal(false);
      expect(isValidServiceName('.a')).to.equal(false);
      expect(isValidServiceName('$')).to.equal(false);
      expect(isValidServiceName('$a')).to.equal(false);
      expect(isValidServiceName('*')).to.equal(false);
      expect(isValidServiceName('~')).to.equal(false);
      expect(isValidServiceName('!')).to.equal(false);
      expect(isValidServiceName('@')).to.equal(false);
      expect(isValidServiceName('%')).to.equal(false);
      expect(isValidServiceName('^')).to.equal(false);
      expect(isValidServiceName('&')).to.equal(false);
      expect(isValidServiceName('-')).to.equal(false);
      expect(isValidServiceName('=')).to.equal(false);
      expect(isValidServiceName('+')).to.equal(false);
      expect(isValidServiceName('|')).to.equal(false);
      expect(isValidServiceName(';')).to.equal(false);
      expect(isValidServiceName(',')).to.equal(false);
      expect(isValidServiceName('?')).to.equal(false);
      expect(isValidServiceName('/')).to.equal(false);
      expect(isValidServiceName("'")).to.equal(false);
      expect(isValidServiceName('"')).to.equal(false);
      expect(isValidServiceName('`')).to.equal(false);
      expect(isValidServiceName('\x00')).to.equal(false);
      expect(isValidServiceName('\x7F')).to.equal(false);
    })

    it("when string input without alphabetic prefix returning false", () => {
      expect(isValidServiceName('0')).to.equal(false);
      expect(isValidServiceName('0a')).to.equal(false);
      expect(isValidServiceName('0a0')).to.equal(false);
      expect(isValidServiceName('0_')).to.equal(false);
      expect(isValidServiceName('0_0')).to.equal(false);
    })

    it("when string input returning true", () => {
      expect(isValidServiceName('a')).to.equal(true);
      expect(isValidServiceName('aa')).to.equal(true);
      expect(isValidServiceName('a_')).to.equal(true);
      expect(isValidServiceName('a0')).to.equal(true);
      expect(isValidServiceName('a0a')).to.equal(true);
      expect(isValidServiceName('_')).to.equal(true);
      expect(isValidServiceName('_0')).to.equal(true);
      expect(isValidServiceName('_0_')).to.equal(true);
      expect(isValidServiceName('consensus')).to.equal(true);
      expect(isValidServiceName('afan')).to.equal(true);
      expect(isValidServiceName('collaborative_ai')).to.equal(true);
      expect(isValidServiceName('_a_dapp')).to.equal(true);
    })
  })

  describe("isValidStateLabel", () => {
    it("when non-string input", () => {
      expect(isValidStateLabel(null)).to.equal(false);
      expect(isValidStateLabel(undefined)).to.equal(false);
      expect(isValidStateLabel(true)).to.equal(false);
      expect(isValidStateLabel(false)).to.equal(false);
      expect(isValidStateLabel(0)).to.equal(false);
      expect(isValidStateLabel([])).to.equal(false);
      expect(isValidStateLabel({})).to.equal(false);
    })

    it("when string input returning false", () => {
      expect(isValidStateLabel('')).to.equal(false);
      expect(isValidStateLabel('.')).to.equal(false);
      expect(isValidStateLabel('$')).to.equal(false);
      expect(isValidStateLabel('/')).to.equal(false);
      expect(isValidStateLabel("'")).to.equal(false);
      expect(isValidStateLabel('"')).to.equal(false);
      expect(isValidStateLabel('`')).to.equal(false);
    })

    it("when string input returning true", () => {
      expect(isValidStateLabel('a')).to.equal(true);
      expect(isValidStateLabel('0')).to.equal(true);
      expect(isValidStateLabel('.a')).to.equal(true);
      expect(isValidStateLabel('$a')).to.equal(true);
      expect(isValidStateLabel('*')).to.equal(true);
      expect(isValidStateLabel('~')).to.equal(true);
      expect(isValidStateLabel('!')).to.equal(true);
      expect(isValidStateLabel('@')).to.equal(true);
      expect(isValidStateLabel('%')).to.equal(true);
      expect(isValidStateLabel('^')).to.equal(true);
      expect(isValidStateLabel('&')).to.equal(true);
      expect(isValidStateLabel('-')).to.equal(true);
      expect(isValidStateLabel('_')).to.equal(true);
      expect(isValidStateLabel('=')).to.equal(true);
      expect(isValidStateLabel('+')).to.equal(true);
      expect(isValidStateLabel('|')).to.equal(true);
      expect(isValidStateLabel(';')).to.equal(true);
      expect(isValidStateLabel(',')).to.equal(true);
      expect(isValidStateLabel('?')).to.equal(true);
    })

    it("when long string input", () => {
      const labelLong = 'a'.repeat(STATE_LABEL_LENGTH_LIMIT);
      expect(isValidStateLabel(labelLong)).to.equal(true);
      const labelTooLong = 'a'.repeat(STATE_LABEL_LENGTH_LIMIT + 1);
      expect(isValidStateLabel(labelTooLong)).to.equal(false);
    })
  })

  describe("isValidPathForStates", () => {
    it("when invalid input", () => {
      assert.deepEqual(isValidPathForStates([null]), {isValid: false, invalidPath: '/null'});
      assert.deepEqual(
          isValidPathForStates([undefined]), {isValid: false, invalidPath: '/undefined'});
      assert.deepEqual(isValidPathForStates([Infinity]), {isValid: false, invalidPath: '/null'});
      assert.deepEqual(isValidPathForStates([NaN]), {isValid: false, invalidPath: '/null'});
      assert.deepEqual(isValidPathForStates([true]), {isValid: false, invalidPath: '/true'});
      assert.deepEqual(isValidPathForStates([false]), {isValid: false, invalidPath: '/false'});
      assert.deepEqual(isValidPathForStates([0]), {isValid: false, invalidPath: '/0'});
      assert.deepEqual(isValidPathForStates(['']), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidPathForStates(['', '', '']), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidPathForStates([{}]), {isValid: false, invalidPath: '/{}'});
      assert.deepEqual(
          isValidPathForStates([{a: 'A'}]), {isValid: false, invalidPath: '/{"a":"A"}'});
      assert.deepEqual(isValidPathForStates([[]]), {isValid: false, invalidPath: '/[]'});
      assert.deepEqual(isValidPathForStates([['a']]), {isValid: false, invalidPath: '/["a"]'});
      assert.deepEqual(isValidPathForStates(['a', '/']), {isValid: false, invalidPath: '/a//'});
      assert.deepEqual(isValidPathForStates(['a', '.']), {isValid: false, invalidPath: '/a/.'});
      assert.deepEqual(isValidPathForStates(['a', '$']), {isValid: false, invalidPath: '/a/$'});
      assert.deepEqual(isValidPathForStates(['a', '*b']), {isValid: false, invalidPath: '/a/*b'});
      assert.deepEqual(isValidPathForStates(['a', 'b*']), {isValid: false, invalidPath: '/a/b*'});
      assert.deepEqual(isValidPathForStates(['a', '#']), {isValid: false, invalidPath: '/a/#'});
      assert.deepEqual(isValidPathForStates(['a', '{']), {isValid: false, invalidPath: '/a/{'});
      assert.deepEqual(isValidPathForStates(['a', '}']), {isValid: false, invalidPath: '/a/}'});
      assert.deepEqual(isValidPathForStates(['a', '[']), {isValid: false, invalidPath: '/a/['});
      assert.deepEqual(isValidPathForStates(['a', ']']), {isValid: false, invalidPath: '/a/]'});
      assert.deepEqual(
          isValidPathForStates(['a', '\x00']), {isValid: false, invalidPath: '/a/\x00'});
      assert.deepEqual(
          isValidPathForStates(['a', '\x1F']), {isValid: false, invalidPath: '/a/\x1F'});
      assert.deepEqual(
          isValidPathForStates(['a', '\x7F']), {isValid: false, invalidPath: '/a/\x7F'});
    })

    it("when valid input", () => {
      assert.deepEqual(isValidPathForStates(['a', 'b', 'c']), {isValid: true, invalidPath: ''});
      assert.deepEqual(
          isValidPathForStates(['0', 'true', 'false']), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidPathForStates(['a', '.b']), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidPathForStates(['a', '$b']), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidPathForStates(['a', '*']), {isValid: true, invalidPath: ''});
    })

    it("when input with long labels", () => {
      const labelLong = 'a'.repeat(STATE_LABEL_LENGTH_LIMIT);
      const labelTooLong = 'a'.repeat(STATE_LABEL_LENGTH_LIMIT + 1);
      assert.deepEqual(
          isValidPathForStates([labelLong, labelLong]), {isValid: true, invalidPath: ''});
      assert.deepEqual(
          isValidPathForStates([labelTooLong, labelLong]),
          {isValid: false, invalidPath: `/${labelTooLong}`});
      assert.deepEqual(
          isValidPathForStates([labelLong, labelTooLong]),
          {isValid: false, invalidPath: `/${labelLong}/${labelTooLong}`});
    })
  })

  describe("isValidJsObjectForStates", () => {
    it("when invalid input", () => {
      assert.deepEqual(isValidJsObjectForStates(undefined), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidJsObjectForStates({}), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidJsObjectForStates([]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidJsObjectForStates([1, 2, 3]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(
          isValidJsObjectForStates(['a', 'b', 'c']), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidJsObjectForStates({
        undef: undefined 
      }), {isValid: false, invalidPath: '/undef'});
      assert.deepEqual(
        isValidJsObjectForStates({
        empty_obj: {}
      }), {isValid: false, invalidPath: '/empty_obj'});
      assert.deepEqual(
        isValidJsObjectForStates({
        array: []
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(
        isValidJsObjectForStates({
        array: [1, 2, 3]
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(
        isValidJsObjectForStates({
        array: ['a', 'b', 'c']
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(
        isValidJsObjectForStates({
          'a': {
            '.': 'x'
          }
      }), {isValid: false, invalidPath: '/a/.'});
      assert.deepEqual(
        isValidJsObjectForStates({
          'a': {
            '$': 'x'
          }
      }), {isValid: false, invalidPath: '/a/$'});
      assert.deepEqual(
        isValidJsObjectForStates({
          'a': {
            '*b': 'x'
          }
      }), {isValid: false, invalidPath: '/a/*b'});
      assert.deepEqual(
        isValidJsObjectForStates({
          'a': {
            'b*': 'x'
          }
      }), {isValid: false, invalidPath: '/a/b*'});
    })

    it("when invalid input with deeper path", () => {
      assert.deepEqual(isValidJsObjectForStates({
        internal1: {
          internal2a: {
            internal3a: {
              str: 'str'
            }
          },
          internal2b: {
            internal3b: {
              undef: undefined 
            }
          },
          internal2c: {
            internal3c: {
              empty_obj: {}
            }
          },
          internal2d: {
            internal3d: {
              array: []
            }
          },
        }
      }), {isValid: false, invalidPath: '/internal1/internal2b/internal3b/undef'});
    })

    it("when valid input", () => {
      // leaf nodes
      assert.deepEqual(isValidJsObjectForStates(10), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidJsObjectForStates("str"), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidJsObjectForStates(null), {isValid: true, invalidPath: ''});

      // internal node
      assert.deepEqual(isValidJsObjectForStates({
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
      }), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidJsObjectForStates({
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
          ".rule": {
            "write": true
          }
        }
      }), {isValid: true, invalidPath: ''});
      assert.deepEqual(
        isValidJsObjectForStates({
          'a': {
            '.b': 'x'
          }
      }), {isValid: true, invalidPath: ''});
      assert.deepEqual(
        isValidJsObjectForStates({
          'a': {
            '$b': 'x'
          }
      }), {isValid: true, invalidPath: ''});
      assert.deepEqual(
        isValidJsObjectForStates({
          'a': {
            '*': 'x'
          }
      }), {isValid: true, invalidPath: ''});
    })

    it("when input with long labels", () => {
      const textLong = 'a'.repeat(STATE_LABEL_LENGTH_LIMIT);
      const textTooLong = 'a'.repeat(STATE_LABEL_LENGTH_LIMIT + 1);
      assert.deepEqual(
        isValidJsObjectForStates({
          [textLong]: {
            [textLong]: textTooLong
          }
      }), {isValid: true, invalidPath: ''});
      assert.deepEqual(
        isValidJsObjectForStates({
          [textTooLong]: {
            [textLong]: textTooLong
          }
      }), {isValid: false, invalidPath: `/${textTooLong}`});
      assert.deepEqual(
        isValidJsObjectForStates({
          [textLong]: {
            [textTooLong]: textTooLong
          }
      }), {isValid: false, invalidPath: `/${textLong}/${textTooLong}`});
    })
  })

  describe("isValidRuleConfig", () => {
    it("when invalid input", () => {
      assert.deepEqual(isValidRuleConfig(null), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig(undefined), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig({}), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([1, 2, 3]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(
          isValidRuleConfig(['a', 'b', 'c']), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig({
        undef: undefined 
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig({
        empty_obj: {}
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig({
        array: []
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig({
        array: [1, 2, 3]
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig({
        array: ['a', 'b', 'c']
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig({
        'a': {
          '.': 'x'
        }
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig({
        'a': {
          '$': 'x'
        }
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig({
        'a': {
          '*b': 'x'
        }
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig({
        'a': {
          'b*': 'x'
        }
      }), {isValid: false, invalidPath: '/'});
    })

    it("when valid input", () => {
      assert.deepEqual(isValidRuleConfig({ "write": true }), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidRuleConfig({ "write": false }), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidRuleConfig({ "write": "auth.addr === 'abcd'" }), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidRuleConfig({
        "write": "(auth.addr === $from || auth.fid === '_stake' || auth.fid === '_unstake' || auth.fid === '_pay' || auth.fid === '_claim' || auth.fid === '_hold' || auth.fid === '_release' || auth.fid === '_collectFee' || auth.fid === '_distributeFee') && !getValue('transfer/' + $from + '/' + $to + '/' + $key) && (util.isServAcntName($from) || util.isCksumAddr($from)) && (util.isServAcntName($to) || util.isCksumAddr($to)) && $from !== $to && util.isNumber(newData) && getValue(util.getBalancePath($from)) >= newData"
      }), {isValid: true, invalidPath: ''});
    })
  })

  describe("isValidRuleTree", () => {
    it("when invalid input", () => {
      assert.deepEqual(isValidRuleTree(undefined), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleTree({}), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleTree([]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleTree([1, 2, 3]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(
          isValidRuleTree(['a', 'b', 'c']), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleTree({
        undef: undefined 
      }), {isValid: false, invalidPath: '/undef'});
      assert.deepEqual(isValidRuleTree({
        empty_obj: {}
      }), {isValid: false, invalidPath: '/empty_obj'});
      assert.deepEqual(isValidRuleTree({
        array: []
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidRuleTree({
        array: [1, 2, 3]
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidRuleTree({
        array: ['a', 'b', 'c']
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidRuleTree({
        some_key: {}
      }), {isValid: false, invalidPath: '/some_key'});
      assert.deepEqual(isValidRuleTree({
        some_key: null
      }), {isValid: false, invalidPath: '/some_key'});
      assert.deepEqual(isValidRuleTree({
        some_key: undefined
      }), {isValid: false, invalidPath: '/some_key'});
    })

    it("when invalid input with invalid owner config", () => {
      assert.deepEqual(isValidRuleTree({
        some_path: {
          '.rule': {
            'write': {}
          }
        }
      }), {isValid: false, invalidPath: '/some_path/.rule/write'});
      assert.deepEqual(isValidRuleTree({
        some_path: {
          '.rule': {
            'write': null 
          }
        }
      }), {isValid: false, invalidPath: '/some_path/.rule/write'});
      assert.deepEqual(isValidRuleTree({
        some_path: {
          '.rule': {
            'write': undefined
          }
        }
      }), {isValid: false, invalidPath: '/some_path/.rule/write'});
    })

    it("when valid input", () => {
      assert.deepEqual(isValidRuleTree(null), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidRuleTree({
        '.rule': {
          'write': true 
        }
      }), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidRuleTree({
        some_path1: {
          '.rule': {
            'write': true
          }
        },
        some_path2: {
          '.rule': {
            'write': "auth.addr === 'abcd'"
          }
        }
      }), {isValid: true, invalidPath: ''});
    })
  })

  describe("isValidFunctionConfig", () => {
    it("when invalid input", () => {
      assert.deepEqual(isValidFunctionConfig(null), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionConfig(undefined), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionConfig({}), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionConfig([]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionConfig([1, 2, 3]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(
          isValidFunctionConfig(['a', 'b', 'c']), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionConfig({
        undef: undefined 
      }), {isValid: false, invalidPath: '/undef'});
      assert.deepEqual(isValidFunctionConfig({
        empty_obj: {}
      }), {isValid: false, invalidPath: '/empty_obj'});
      assert.deepEqual(isValidFunctionConfig({
        array: []
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidFunctionConfig({
        array: [1, 2, 3]
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidFunctionConfig({
        array: ['a', 'b', 'c']
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidFunctionConfig({
        'a': {
          '.': 'x'
        }
      }), {isValid: false, invalidPath: '/a'});
      assert.deepEqual(isValidFunctionConfig({
        'a': {
          '$': 'x'
        }
      }), {isValid: false, invalidPath: '/a'});
      assert.deepEqual(isValidFunctionConfig({
        'a': {
          '*b': 'x'
        }
      }), {isValid: false, invalidPath: '/a'});
      assert.deepEqual(isValidFunctionConfig({
        'a': {
          'b*': 'x'
        }
      }), {isValid: false, invalidPath: '/a'});
    })

    it("when invalid input with deeper path", () => {
      assert.deepEqual(isValidFunctionConfig({
        a_fid: {}
      }), {isValid: false, invalidPath: '/a_fid'});
      assert.deepEqual(isValidFunctionConfig({
        a_fid: 'some string'
      }), {isValid: false, invalidPath: '/a_fid'});
    })

    it("when invalid input with NATIVE type", () => {
      assert.deepEqual(isValidFunctionConfig({
        "_transfer": {
          // Missing function_type
          "function_id": "_transfer"
        }
      }), {isValid: false, invalidPath: '/_transfer'});
      assert.deepEqual(isValidFunctionConfig({
        "_transfer": {
          "function_type": "NATIVE",
          // Missing function_id
        }
      }), {isValid: false, invalidPath: '/_transfer'});
      assert.deepEqual(isValidFunctionConfig({
        "_transfer": {
          "function_type": "NATIVE",
          "function_id": "_transfer",
          "unknown_property": "some value"  // Unknown property
        }
      }), {isValid: false, invalidPath: '/_transfer'});
      assert.deepEqual(isValidFunctionConfig({
        "_transfer": {
          "function_type": "unknown type",  // Unknown function_type
          "function_id": "_transfer"
        }
      }), {isValid: false, invalidPath: '/_transfer'});
      assert.deepEqual(isValidFunctionConfig({
        "_transfer": {
          "function_type": "NATIVE",
          "function_id": "some other fid"  // Wrong function_id
        }
      }), {isValid: false, invalidPath: '/_transfer/function_id'});
    })

    it("when invalid input with REST type", () => {
      assert.deepEqual(isValidFunctionConfig({
        "0x11111": {
          // Missing function_type
          "function_id": "0x11111",
          "event_listener": "https://events.ainetwork.ai/trigger",
          "service_name": "https://ainetwork.ai",
        }
      }), {isValid: false, invalidPath: '/0x11111'});
      assert.deepEqual(isValidFunctionConfig({
        "0x11111": {
          "function_type": "REST",
          // Missing function_id
          "event_listener": "https://events.ainetwork.ai/trigger",
          "service_name": "https://ainetwork.ai",
        }
      }), {isValid: false, invalidPath: '/0x11111'});
      assert.deepEqual(isValidFunctionConfig({
        "0x11111": {
          "function_type": "REST",
          "function_id": "0x11111",
          // Missing event_listener
          "service_name": "https://ainetwork.ai",
        }
      }), {isValid: false, invalidPath: '/0x11111'});
      assert.deepEqual(isValidFunctionConfig({
        "0x11111": {
          "function_type": "REST",
          "function_id": "0x11111",
          "event_listener": "https://events.ainetwork.ai/trigger",
          // Missing service_name
        }
      }), {isValid: false, invalidPath: '/0x11111'});
      assert.deepEqual(isValidFunctionConfig({
        "0x11111": {
          "function_type": "REST",
          "function_id": "0x11111",
          "event_listener": "https://events.ainetwork.ai/trigger",
          "service_name": "https://ainetwork.ai",
          "unknown_property": "some value"  // Unknown property
        }
      }), {isValid: false, invalidPath: '/0x11111'});
      assert.deepEqual(isValidFunctionConfig({
        "0x11111": {
          "function_type": "REST",
          "function_id": "some other fid",  // Wrong function_id
          "event_listener": "https://events.ainetwork.ai/trigger",
          "service_name": "https://ainetwork.ai",
        }
      }), {isValid: false, invalidPath: '/0x11111/function_id'});
      assert.deepEqual(isValidFunctionConfig({
        "0x11111": {
          "function_type": "REST",
          "function_id": "0x11111",
          "event_listener": "some non-url value",  // Invalid url
          "service_name": "https://ainetwork.ai",
        }
      }), {isValid: false, invalidPath: '/0x11111'});
    })

    it("when valid input", () => {
      assert.deepEqual(isValidFunctionConfig({
        "_transfer": {
          "function_type": "NATIVE",
          "function_id": "_transfer",
        },
        "0x11111": {
          "function_type": "REST",
          "function_id": "0x11111",
          "event_listener": "https://events.ainetwork.ai/trigger",
          "service_name": "https://ainetwork.ai",
        },
        "fid_to_delete": null  // To be deleted
      }), {isValid: true, invalidPath: ''});
    })
  })

  describe("isValidFunctionTree", () => {
    it("when invalid input", () => {
      assert.deepEqual(isValidFunctionTree(undefined), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionTree({}), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionTree([]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionTree([1, 2, 3]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(
          isValidFunctionTree(['a', 'b', 'c']), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionTree({
        undef: undefined 
      }), {isValid: false, invalidPath: '/undef'});
      assert.deepEqual(isValidFunctionTree({
        empty_obj: {}
      }), {isValid: false, invalidPath: '/empty_obj'});
      assert.deepEqual(isValidFunctionTree({
        array: []
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidFunctionTree({
        array: [1, 2, 3]
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidFunctionTree({
        array: ['a', 'b', 'c']
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidFunctionTree({
        some_key: {}
      }), {isValid: false, invalidPath: '/some_key'});
      assert.deepEqual(isValidFunctionTree({
        some_key: null
      }), {isValid: false, invalidPath: '/some_key'});
      assert.deepEqual(isValidFunctionTree({
        some_key: undefined
      }), {isValid: false, invalidPath: '/some_key'});
    })

    it("when invalid input with invalid owner config", () => {
      assert.deepEqual(isValidFunctionTree({
        some_path: {
          '.function': {
          }
        }
      }), {isValid: false, invalidPath: '/some_path/.function'});
      assert.deepEqual(isValidFunctionTree({
        some_path: {
          '.function': null 
        }
      }), {isValid: false, invalidPath: '/some_path/.function'});
      assert.deepEqual(isValidFunctionTree({
        some_path: {
          '.function': undefined
        }
      }), {isValid: false, invalidPath: '/some_path/.function'});
    })

    it("when valid input", () => {
      assert.deepEqual(isValidFunctionTree(null), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidFunctionTree({
        '.function': {
          "_transfer": {
            "function_type": "NATIVE",
            "function_id": "_transfer",
          },
          "0x11111": {
            "function_type": "REST",
            "function_id": "0x11111",
            "event_listener": "https://events.ainetwork.ai/trigger",
            "service_name": "https://ainetwork.ai",
          }
        }
      }), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidFunctionTree({
        some_path1: {
          '.function': {
            "_transfer": {
              "function_type": "NATIVE",
              "function_id": "_transfer",
            },
            "0x11111": {
              "function_type": "REST",
              "function_id": "0x11111",
              "event_listener": "https://events.ainetwork.ai/trigger",
              "service_name": "https://ainetwork.ai",
            }
          }
        },
        some_path2: {
          '.function': {
            "_transfer": {
              "function_type": "NATIVE",
              "function_id": "_transfer",
            },
            "0x11111": {
              "function_type": "REST",
              "function_id": "0x11111",
              "event_listener": "https://events.ainetwork.ai/trigger",
              "service_name": "https://ainetwork.ai",
            }
          }
        }
      }), {isValid: true, invalidPath: ''});
    })
  })

  describe("isValidOwnerConfig", () => {
    it("when invalid input", () => {
      assert.deepEqual(isValidOwnerConfig(null), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig(undefined), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig({}), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([1, 2, 3]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(
          isValidOwnerConfig(['a', 'b', 'c']), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig({
        undef: undefined 
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig({
        empty_obj: {}
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig({
        array: []
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig({
        array: [1, 2, 3]
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig({
        array: ['a', 'b', 'c']
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig({
        'a': {
          '.': 'x'
        }
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig({
        'a': {
          '$': 'x'
        }
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig({
        'a': {
          '*b': 'x'
        }
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig({
        'a': {
          'b*': 'x'
        }
      }), {isValid: false, invalidPath: '/'});
    })

    it("when invalid input with deeper path", () => {
      assert.deepEqual(isValidOwnerConfig({
        some_key: {}
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig({
        'owners': null
      }), {isValid: false, invalidPath: '/owners'});
      assert.deepEqual(isValidOwnerConfig({
        'owners': {}
      }), {isValid: false, invalidPath: '/owners'});
    })

    it("when invalid input with invalid owner (address or fid)", () => {
      assert.deepEqual(isValidOwnerConfig({
        'owners': {
          '0x0': {  // Invalid address
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            "write_rule": true,
          }
        }
      }), {isValid: false, invalidPath: '/owners/0x0'});
      assert.deepEqual(isValidOwnerConfig({
        'owners': {
          '0x09a0d53fdf1c36a131938eb379b98910e55eefe1': {  // Non-checksum address
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            "write_rule": true,
          }
        }
      }), {isValid: false, invalidPath: '/owners/0x09a0d53fdf1c36a131938eb379b98910e55eefe1'});
      assert.deepEqual(isValidOwnerConfig({
        'owners': {
          'fid:_invalidFid': {  // Invalid fid
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            "write_rule": true,
          }
        }
      }), {isValid: false, invalidPath: '/owners/fid:_invalidFid'});
    })

    it("when invalid input with invalid owner permissions", () => {
      assert.deepEqual(isValidOwnerConfig({
        'owners': {
          '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1': {
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            // Missing write_rule
          },
        }
      }), {isValid: false, invalidPath: '/owners/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1'});
      assert.deepEqual(isValidOwnerConfig({
        'owners': {
          '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1': {
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            "write_rule": true,
            "do_something_else": true,  // Unknown permission
          },
        }
      }), {isValid: false, invalidPath: '/owners/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1'});
      assert.deepEqual(isValidOwnerConfig({
        'owners': {
          '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1': {
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            "write_rule": 'true',  // Non-boolean value
          },
        }
      }), {isValid: false, invalidPath: '/owners/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1'});
    })

    it("when valid input", () => {
      assert.deepEqual(isValidOwnerConfig({
        'owners': {
          '*': {
            "branch_owner": true,
            "write_function": false,
            "write_owner": false,
            "write_rule": false,
          },
          '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1': {
            "branch_owner": false,
            "write_function": true,
            "write_owner": true,
            "write_rule": true,
          },
          'fid:_createApp': {
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            "write_rule": true,
          },
        }
      }), {isValid: true, invalidPath: ''});
    })
  })

  describe("isValidOwnerTree", () => {
    it("when invalid input", () => {
      assert.deepEqual(isValidOwnerTree(undefined), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerTree({}), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerTree([]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerTree([1, 2, 3]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(
          isValidOwnerTree(['a', 'b', 'c']), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerTree({
        undef: undefined 
      }), {isValid: false, invalidPath: '/undef'});
      assert.deepEqual(isValidOwnerTree({
        empty_obj: {}
      }), {isValid: false, invalidPath: '/empty_obj'});
      assert.deepEqual(isValidOwnerTree({
        array: []
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidOwnerTree({
        array: [1, 2, 3]
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidOwnerTree({
        array: ['a', 'b', 'c']
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidOwnerTree({
        some_key: {}
      }), {isValid: false, invalidPath: '/some_key'});
      assert.deepEqual(isValidOwnerTree({
        some_key: null
      }), {isValid: false, invalidPath: '/some_key'});
      assert.deepEqual(isValidOwnerTree({
        some_key: undefined
      }), {isValid: false, invalidPath: '/some_key'});
    })

    it("when invalid input with invalid owner config", () => {
      assert.deepEqual(isValidOwnerTree({
        some_path: {
          '.owner': {
          }
        }
      }), {isValid: false, invalidPath: '/some_path/.owner'});
      assert.deepEqual(isValidOwnerTree({
        some_path: {
          '.owner': null 
        }
      }), {isValid: false, invalidPath: '/some_path/.owner'});
      assert.deepEqual(isValidOwnerTree({
        some_path: {
          '.owner': undefined
        }
      }), {isValid: false, invalidPath: '/some_path/.owner'});
    })

    it("when valid input", () => {
      assert.deepEqual(isValidOwnerTree(null), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidOwnerTree({
        '.owner': {
          'owners': {
            '*': {
              "branch_owner": true,
              "write_function": false,
              "write_owner": false,
              "write_rule": false,
            },
            '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1': {
              "branch_owner": true,
              "write_function": false,
              "write_owner": false,
              "write_rule": false,
            },
            'fid:_createApp': {
              "branch_owner": true,
              "write_function": false,
              "write_owner": false,
              "write_rule": false,
            },
            '0x08Aed7AF9354435c38d52143EE50ac839D20696b': null
          }
        }
      }), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidOwnerTree({
        some_path1: {
          '.owner': {
            'owners': {
              '*': {
                "branch_owner": true,
                "write_function": false,
                "write_owner": false,
                "write_rule": false,
              },
              '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1': {
                "branch_owner": true,
                "write_function": false,
                "write_owner": false,
                "write_rule": false,
              },
              'fid:_createApp': {
                "branch_owner": true,
                "write_function": false,
                "write_owner": false,
                "write_rule": false,
              },
              '0x08Aed7AF9354435c38d52143EE50ac839D20696b': null
            }
          }
        },
        some_path2: {
          '.owner': {
            'owners': {
              '*': {
                "branch_owner": true,
                "write_function": false,
                "write_owner": false,
                "write_rule": false,
              },
              '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1': {
                "branch_owner": true,
                "write_function": false,
                "write_owner": false,
                "write_rule": false,
              },
              'fid:_createApp': {
                "branch_owner": true,
                "write_function": false,
                "write_owner": false,
                "write_rule": false,
              },
              '0x08Aed7AF9354435c38d52143EE50ac839D20696b': null
            }
          }
        }
      }), {isValid: true, invalidPath: ''});
    })
  })

  describe("applyFunctionChange()", () => {
    const curFunction = {
      ".function": {
        "0x111": {
          "function_type": "REST",
          "function_id": "0x111"
        },
        "0x222": {
          "function_type": "REST",
          "function_id": "0x222"
        },
        "0x333": {
          "function_type": "REST",
          "function_id": "0x333"
        }
      },
      "deeper": {
        ".function": {  // deeper function
          "0x999": {
            "function_type": "REST",
            "function_id": "0x999"
          }
        }
      }
    };

    it("add / delete / modify non-existing function", () => {
      assert.deepEqual(applyFunctionChange(null, {
        ".function": {  // function
          "0x111": null,
          "0x222": {
            "function_type": "REST",
            "function_id": "0x222"
          },
        },
        "deeper": {
          ".function": {  // deeper function
            "0x888": {
              "function_type": "REST",
              "function_id": "0x888"
            }
          }
        }
      }), {  // the same as the given function change.
        ".function": {
          "0x111": null,
          "0x222": {
            "function_type": "REST",
            "function_id": "0x222"
          },
        },
        "deeper": {
          ".function": {
            "0x888": {
              "function_type": "REST",
              "function_id": "0x888"
            }
          }
        }
      });
    });

    it("add / delete / modify existing function", () => {
      assert.deepEqual(applyFunctionChange(curFunction, {
        ".function": {
          "0x111": null,  // delete
          "0x222": {  // modify
            "function_type": "REST",
            "function_id": "0x222",
            "service_name": "https://ainetwork.ai",
          },
          "0x444": {  // add
            "function_type": "REST",
            "function_id": "0x444"
          }
        }
      }), {
        ".function": {
          "0x222": {  // modified
            "function_type": "REST",
            "function_id": "0x222",
            "service_name": "https://ainetwork.ai",
          },
          "0x333": {  // untouched
            "function_type": "REST",
            "function_id": "0x333"
          },
          "0x444": {  // added
            "function_type": "REST",
            "function_id": "0x444"
          }
        },
        "deeper": {
          ".function": {  // deeper function
            "0x999": {
              "function_type": "REST",
              "function_id": "0x999"
            }
          }
        }
      });
    });

    it("replace existing function with deeper function", () => {
      assert.deepEqual(applyFunctionChange(curFunction, {
        ".function": {
          "0x222": {  // modify
            "function_type": "REST",
            "function_id": "0x222",
            "service_name": "https://ainetwork.ai",
          },
          "0x444": {  // add
            "function_type": "REST",
            "function_id": "0x444"
          }
        },
        "deeper": {
          ".function": {  // deeper function
            "0x888": {
              "function_type": "REST",
              "function_id": "0x888"
            }
          }
        }
      }), {
        ".function": {  // replaced
          "0x222": {
            "function_type": "REST",
            "function_id": "0x222",
            "service_name": "https://ainetwork.ai",
          },
          "0x444": {
            "function_type": "REST",
            "function_id": "0x444"
          }
        },
        "deeper": {  // replaced
          ".function": {
            "0x888": {
              "function_type": "REST",
              "function_id": "0x888"
            }
          }
        }
      });
    });

    it("with null function change", () => {
      assert.deepEqual(applyFunctionChange(curFunction, null), null);
    });
  });

  describe("applyOwnerChange()", () => {
    const curOwner = {
      ".owner": {
        "owners": {
          "*": {
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            "write_rule": true,
          },
          "aaaa": {
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            "write_rule": true,
          },
          "bbbb": {
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            "write_rule": true,
          }
        }
      },
      "deeper": {
        ".owner": {  // deeper owner
          "owners": {
            "*": {
              "branch_owner": true,
              "write_function": true,
              "write_owner": true,
              "write_rule": true,
            },
          }
        }
      }
    };

    it("add / delete / modify non-existing owner", () => {
      assert.deepEqual(applyOwnerChange(null, {
        ".owner": {  // owner
          "owners": {
            "*": {
              "branch_owner": true,
              "write_function": true,
              "write_owner": true,
              "write_rule": true,
            },
          }
        },
        "deeper": {
          ".owner": {  // deeper owner
            "owners": {
              "*": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true,
              },
            }
          }
        }
      }), {  // the same as the given owner change.
        ".owner": {  // owner
          "owners": {
            "*": {
              "branch_owner": true,
              "write_function": true,
              "write_owner": true,
              "write_rule": true,
            },
          }
        },
        "deeper": {
          ".owner": {  // deeper owner
            "owners": {
              "*": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true,
              },
            }
          }
        }
      });
    });

    it("add / delete / modify existing owner", () => {
      assert.deepEqual(applyOwnerChange(curOwner, {
        ".owner": {
          "owners": {
            "*": {  // modify
              "branch_owner": true,
              "write_function": false,
              "write_owner": false,
              "write_rule": false,
            },
            "aaaa": null,  // delete
            "cccc": {  // add
              "branch_owner": true,
              "write_function": true,
              "write_owner": true,
              "write_rule": true,
            }
          }
        }
      }), {
        ".owner": {
          "owners": {
            "*": {  // modified
              "branch_owner": true,
              "write_function": false,
              "write_owner": false,
              "write_rule": false,
            },
            "bbbb": {  // untouched
              "branch_owner": true,
              "write_function": true,
              "write_owner": true,
              "write_rule": true,
            },
            "cccc": {  // added
              "branch_owner": true,
              "write_function": true,
              "write_owner": true,
              "write_rule": true,
            }
          }
        },
        "deeper": {
          ".owner": {  // deeper owner
            "owners": {
              "*": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true,
              },
            }
          }
        }
      });
    });

    it("replace existing owner with deeper owner", () => {
      assert.deepEqual(applyOwnerChange(curOwner, {
        ".owner": {
          "owners": {
            "*": {  // modify
              "branch_owner": true,
              "write_function": false,
              "write_owner": false,
              "write_rule": false,
            },
            "cccc": {  // add
              "branch_owner": true,
              "write_function": true,
              "write_owner": true,
              "write_rule": true,
            }
          }
        },
        "deeper": {
          ".owner": {  // deeper owner
            "owners": {
              "CCCC": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true,
              }
            }
          }
        }
      }), {
        ".owner": {  // replaced
          "owners": {
            "*": {  // modify
              "branch_owner": true,
              "write_function": false,
              "write_owner": false,
              "write_rule": false,
            },
            "cccc": {  // add
              "branch_owner": true,
              "write_function": true,
              "write_owner": true,
              "write_rule": true,
            }
          }
        },
        "deeper": {  // replaced
          ".owner": {
            "owners": {
              "CCCC": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true,
              }
            }
          }
        }
      });
    });

    it("with null owner change", () => {
      assert.deepEqual(applyOwnerChange(curOwner, null), null);
    });
  });

  describe("setStateTreeVersion", () => {
    it("leaf node", () => {
      const ver1 = 'ver1';

      const stateNode = StateNode.fromJsObject(true);
      const numNodes = setStateTreeVersion(stateNode, ver1);
      expect(numNodes).to.equal(1);
      expect(stateNode.getVersion()).to.equal(ver1);
    })

    it("internal node", () => {
      const ver1 = 'ver1';

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
      const stateTree = StateNode.fromJsObject(stateObj);
      const numNodes = setStateTreeVersion(stateTree, ver1);
      expect(numNodes).to.equal(24);
      assert.deepEqual(stateTree.toJsObject(GET_OPTIONS_INCLUDE_ALL), {
        ".version": "ver1",
        ".version:bool": "ver1",
        ".version:empty_obj": "ver1",
        ".version:empty_str": "ver1",
        ".version:null": "ver1",
        ".version:number": "ver1",
        ".version:str": "ver1",
        ".version:undef": "ver1",
        ".num_parents": 0,
        ".num_parents:bool": 1,
        ".num_parents:empty_obj": 1,
        ".num_parents:empty_str": 1,
        ".num_parents:null": 1,
        ".num_parents:number": 1,
        ".num_parents:str": 1,
        ".num_parents:undef": 1,
        ".proof_hash": null,
        ".proof_hash:bool": null,
        ".proof_hash:empty_obj": null,
        ".proof_hash:empty_str": null,
        ".proof_hash:null": null,
        ".proof_hash:number": null,
        ".proof_hash:str": null,
        ".proof_hash:undef": null,
        ".tree_height": 0,
        ".tree_height:bool": 0,
        ".tree_height:empty_obj": 0,
        ".tree_height:empty_str": 0,
        ".tree_height:null": 0,
        ".tree_height:number": 0,
        ".tree_height:str": 0,
        ".tree_height:undef": 0,
        ".tree_size": 0,
        ".tree_size:bool": 0,
        ".tree_size:empty_obj": 0,
        ".tree_size:empty_str": 0,
        ".tree_size:null": 0,
        ".tree_size:number": 0,
        ".tree_size:str": 0,
        ".tree_size:undef": 0,
        ".tree_bytes": 0,
        ".tree_bytes:bool": 0,
        ".tree_bytes:empty_obj": 0,
        ".tree_bytes:empty_str": 0,
        ".tree_bytes:null": 0,
        ".tree_bytes:number": 0,
        ".tree_bytes:str": 0,
        ".tree_bytes:undef": 0,
        bool: false,
        number: 10,
        str: 'str',
        empty_str: '',
        null: null,
        undef: undefined,
        empty_obj: null,
        subobj1: {
          ".version": "ver1",
          ".version:bool": "ver1",
          ".version:empty_obj": "ver1",
          ".version:empty_str": "ver1",
          ".version:null": "ver1",
          ".version:number": "ver1",
          ".version:str": "ver1",
          ".version:undef": "ver1",
          ".num_parents": 1,
          ".num_parents:bool": 1,
          ".num_parents:empty_obj": 1,
          ".num_parents:empty_str": 1,
          ".num_parents:null": 1,
          ".num_parents:number": 1,
          ".num_parents:str": 1,
          ".num_parents:undef": 1,
          ".proof_hash": null,
          ".proof_hash:bool": null,
          ".proof_hash:empty_obj": null,
          ".proof_hash:empty_str": null,
          ".proof_hash:null": null,
          ".proof_hash:number": null,
          ".proof_hash:str": null,
          ".proof_hash:undef": null,
          ".tree_height": 0,
          ".tree_height:bool": 0,
          ".tree_height:empty_obj": 0,
          ".tree_height:empty_str": 0,
          ".tree_height:null": 0,
          ".tree_height:number": 0,
          ".tree_height:str": 0,
          ".tree_height:undef": 0,
          ".tree_size": 0,
          ".tree_size:bool": 0,
          ".tree_size:empty_obj": 0,
          ".tree_size:empty_str": 0,
          ".tree_size:null": 0,
          ".tree_size:number": 0,
          ".tree_size:str": 0,
          ".tree_size:undef": 0,
          ".tree_bytes": 0,
          ".tree_bytes:bool": 0,
          ".tree_bytes:empty_obj": 0,
          ".tree_bytes:empty_str": 0,
          ".tree_bytes:null": 0,
          ".tree_bytes:number": 0,
          ".tree_bytes:str": 0,
          ".tree_bytes:undef": 0,
          bool: true,
          number: 20,
          str: 'str2',
          empty_str: '',
          null: null,
          undef: undefined,
          empty_obj: null,
        },
        subobj2: {
          ".version": "ver1",
          ".version:bool": "ver1",
          ".version:empty_obj": "ver1",
          ".version:empty_str": "ver1",
          ".version:null": "ver1",
          ".version:number": "ver1",
          ".version:str": "ver1",
          ".version:undef": "ver1",
          ".num_parents": 1,
          ".num_parents:bool": 1,
          ".num_parents:empty_obj": 1,
          ".num_parents:empty_str": 1,
          ".num_parents:null": 1,
          ".num_parents:number": 1,
          ".num_parents:str": 1,
          ".num_parents:undef": 1,
          ".proof_hash": null,
          ".proof_hash:bool": null,
          ".proof_hash:empty_obj": null,
          ".proof_hash:empty_str": null,
          ".proof_hash:null": null,
          ".proof_hash:number": null,
          ".proof_hash:str": null,
          ".proof_hash:undef": null,
          ".tree_height": 0,
          ".tree_height:bool": 0,
          ".tree_height:empty_obj": 0,
          ".tree_height:empty_str": 0,
          ".tree_height:null": 0,
          ".tree_height:number": 0,
          ".tree_height:str": 0,
          ".tree_height:undef": 0,
          ".tree_size": 0,
          ".tree_size:bool": 0,
          ".tree_size:empty_obj": 0,
          ".tree_size:empty_str": 0,
          ".tree_size:null": 0,
          ".tree_size:number": 0,
          ".tree_size:str": 0,
          ".tree_size:undef": 0,
          ".tree_bytes": 0,
          ".tree_bytes:bool": 0,
          ".tree_bytes:empty_obj": 0,
          ".tree_bytes:empty_str": 0,
          ".tree_bytes:null": 0,
          ".tree_bytes:number": 0,
          ".tree_bytes:str": 0,
          ".tree_bytes:undef": 0,
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

  describe("renameStateTreeVersion", () => {
    it("leaf node w/ no version match", () => {
      const ver1 = 'ver1';
      const ver2 = 'ver2';

      const stateNode = StateNode.fromJsObject(true, ver1);

      const numRenamed = renameStateTreeVersion(stateNode, 'other version', ver2);
      expect(numRenamed).to.equal(0);
      expect(stateNode.getVersion()).to.equal(ver1);
    })

    it("leaf node w/ version match", () => {
      const ver1 = 'ver1';
      const ver2 = 'ver2';

      const stateNode = StateNode.fromJsObject(true, ver1,);

      const numRenamed = renameStateTreeVersion(stateNode, ver1, ver2);
      expect(numRenamed).to.equal(1);
      expect(stateNode.getVersion()).to.equal(ver2);
    })

    it("internal node", () => {
      const ver1 = 'ver1';
      const ver2 = 'ver2';
      const ver3 = 'ver3';

      const grandChild11 = new StateNode(ver1);
      const grandChild12 = new StateNode(ver2);
      const grandChild21 = new StateNode(ver2);
      const grandChild22 = new StateNode(ver1);
      grandChild11.setValue('value11');
      grandChild12.setValue('value12');
      grandChild21.setValue('value21');
      grandChild22.setValue('value22');
      const child1 = new StateNode(ver2);
      child1.setChild('label11', grandChild11);
      child1.setChild('label12', grandChild12);
      const child2 = new StateNode(ver2);
      child2.setChild('label21', grandChild21);
      child2.setChild('label22', grandChild22);
      const stateTree = new StateNode(ver3);
      stateTree.setChild('label1', child1);
      stateTree.setChild('label2', child2);
      assert.deepEqual(stateTree.toJsObject(GET_OPTIONS_INCLUDE_ALL), {
        ".num_parents": 0,
        ".proof_hash": null,
        ".tree_height": 0,
        ".tree_size": 0,
        ".tree_bytes": 0,
        ".version": "ver3",
        "label1": {
          ".num_parents": 1,
          ".num_parents:label11": 1,
          ".num_parents:label12": 1,
          ".proof_hash": null,
          ".proof_hash:label11": null,
          ".proof_hash:label12": null,
          ".tree_height": 0,
          ".tree_height:label11": 0,
          ".tree_height:label12": 0,
          ".tree_size": 0,
          ".tree_size:label11": 0,
          ".tree_size:label12": 0,
          ".tree_bytes": 0,
          ".tree_bytes:label11": 0,
          ".tree_bytes:label12": 0,
          ".version": "ver2",
          ".version:label11": "ver1",
          ".version:label12": "ver2",
          "label11": "value11",
          "label12": "value12",
        },
        "label2": {
          ".num_parents": 1,
          ".num_parents:label21": 1,
          ".num_parents:label22": 1,
          ".proof_hash": null,
          ".proof_hash:label21": null,
          ".proof_hash:label22": null,
          ".tree_height": 0,
          ".tree_height:label21": 0,
          ".tree_height:label22": 0,
          ".tree_size": 0,
          ".tree_size:label21": 0,
          ".tree_size:label22": 0,
          ".tree_bytes": 0,
          ".tree_bytes:label21": 0,
          ".tree_bytes:label22": 0,
          ".version": "ver2",
          ".version:label21": "ver2",
          ".version:label22": "ver1",
          "label21": "value21",
          "label22": "value22",
        }
      });

      const numNodes = renameStateTreeVersion(stateTree, ver2, ver3);
      expect(numNodes).to.equal(4);
      assert.deepEqual(stateTree.toJsObject(GET_OPTIONS_INCLUDE_ALL), {
        ".num_parents": 0,
        ".proof_hash": null,
        ".tree_height": 0,
        ".tree_size": 0,
        ".tree_bytes": 0,
        ".version": "ver3",
        "label1": {
          ".num_parents": 1,
          ".num_parents:label11": 1,
          ".num_parents:label12": 1,
          ".proof_hash": null,
          ".proof_hash:label11": null,
          ".proof_hash:label12": null,
          ".tree_height": 0,
          ".tree_height:label11": 0,
          ".tree_height:label12": 0,
          ".tree_size": 0,
          ".tree_size:label11": 0,
          ".tree_size:label12": 0,
          ".tree_bytes": 0,
          ".tree_bytes:label11": 0,
          ".tree_bytes:label12": 0,
          ".version": "ver3",  // renamed
          ".version:label11": "ver1",
          ".version:label12": "ver3",  // renamed
          "label11": "value11",
          "label12": "value12",
        },
        "label2": {
          ".num_parents": 1,
          ".num_parents:label21": 1,
          ".num_parents:label22": 1,
          ".proof_hash": null,
          ".proof_hash:label21": null,
          ".proof_hash:label22": null,
          ".tree_height": 0,
          ".tree_height:label21": 0,
          ".tree_height:label22": 0,
          ".tree_size": 0,
          ".tree_size:label21": 0,
          ".tree_size:label22": 0,
          ".tree_bytes": 0,
          ".tree_bytes:label21": 0,
          ".tree_bytes:label22": 0,
          ".version": "ver3",  // renamed
          ".version:label21": "ver3",  // renamed
          ".version:label22": "ver1",
          "label21": "value21",
          "label22": "value22",
        }
      });
    })
  })

  describe("deleteStateTree", () => {
    const ver1 = 'ver1';
    const ver2 = 'ver2';
    const ver3 = 'ver3';

    let child1Enabled;
    let child2Enabled;
    let stateTreeEnabled;

    let child1Disabled;
    let child2Disabled;
    let stateTreeDisabled;

    beforeEach(() => {
      child1Enabled = new StateNode(ver1);
      child1Enabled.setValue('value1');
      child2Enabled = new StateNode(ver2);
      child2Enabled.setValue('value2');
      stateTreeEnabled = new StateNode(ver3);
      stateTreeEnabled.setRadixTreeEnabled(true);
      stateTreeEnabled.setChild('label1', child1Enabled);
      stateTreeEnabled.setChild('label2', child2Enabled);
      updateStateInfoForStateTree(stateTreeEnabled);

      child1Disabled = new StateNode(ver1);
      child1Disabled.setValue('value1');
      child2Disabled = new StateNode(ver2);
      child2Disabled.setValue('value2');
      stateTreeDisabled = new StateNode(ver3);
      stateTreeDisabled.setRadixTreeEnabled(true);
      stateTreeDisabled.setChild('label1', child1Disabled);
      stateTreeDisabled.setChild('label2', child2Disabled);
      updateStateInfoForStateTree(stateTreeDisabled);
    })

    it("leaf node", () => {
      const ver1 = 'ver1';

      // Delete a leaf node without version.
      const stateNode1 = StateNode.fromJsObject(true);
      updateStateInfoForStateTree(stateNode1);
      const numNodes1 = deleteStateTree(stateNode1);
      expect(numNodes1).to.equal(1);
      expect(stateNode1.numChildren()).to.equal(0);
      expect(stateNode1.getValue()).to.equal(null);
      expect(stateNode1.getProofHash()).to.equal(null);
      expect(stateNode1.numParents()).to.equal(0);

      // Delete a leaf node with version.
      const stateNode2 = StateNode.fromJsObject(true, ver1);
      updateStateInfoForStateTree(stateNode2);
      const numNodes2 = deleteStateTree(stateNode2);
      expect(numNodes2).to.equal(1);
      expect(stateNode2.numChildren()).to.equal(0);
      expect(stateNode2.getValue()).to.equal(null);
      expect(stateNode2.getProofHash()).to.equal(null);
      expect(stateNode2.numParents()).to.equal(0);
    })

    it("internal node when radixTreeEnabled = true", () => {
      const numNodes = deleteStateTree(stateTreeEnabled);
      expect(numNodes).to.equal(3);
      // State tree is deleted.
      assert.deepEqual(stateTreeEnabled.toJsObject(GET_OPTIONS_INCLUDE_ALL), null);
      // And child nodes are deleted as well.
      expect(child1Enabled.getValue()).to.equal(null);
      expect(child1Enabled.getProofHash()).to.equal(null);
      expect(child1Enabled.numParents()).to.equal(0);
      expect(child2Enabled.getValue()).to.equal(null);
      expect(child2Enabled.getProofHash()).to.equal(null);
      expect(child2Enabled.numParents()).to.equal(0);
    })

    it("internal node when radixTreeEnabled = false", () => {
      const numNodes = deleteStateTree(stateTreeDisabled);
      expect(numNodes).to.equal(3);
      // State tree is deleted.
      assert.deepEqual(stateTreeDisabled.toJsObject(GET_OPTIONS_INCLUDE_ALL), null);
      // And child nodes are deleted as well.
      expect(child1Disabled.getValue()).to.equal(null);
      expect(child1Disabled.getProofHash()).to.equal(null);
      expect(child1Disabled.numParents()).to.equal(0);
      expect(child2Disabled.getValue()).to.equal(null);
      expect(child2Disabled.getProofHash()).to.equal(null);
      expect(child2Disabled.numParents()).to.equal(0);
    })
  })

  describe("deleteStateTreeVersion", () => {
    const ver1 = 'ver1';
    const ver2 = 'ver2';
    const ver3 = 'ver3';
    const nodeLabel = 'node_label';

    let child1Enabled;
    let child2Enabled;
    let stateTreeEnabled;

    let child1Disabled;
    let child2Disabled;
    let stateTreeDisabled;

    let parent;

    beforeEach(() => {
      child1Enabled = new StateNode(ver1);
      child2Enabled = new StateNode(ver2);
      child1Enabled.setValue('value1');
      child2Enabled.setValue('value2');
      stateTreeEnabled = new StateNode(ver3);
      stateTreeEnabled.setRadixTreeEnabled(true);  // radixTreeEnabled = true
      stateTreeEnabled.setChild('label1', child1Enabled);
      stateTreeEnabled.setChild('label2', child2Enabled);
      updateStateInfoForStateTree(stateTreeEnabled);

      child1Disabled = new StateNode(ver1);
      child2Disabled = new StateNode(ver2);
      child1Disabled.setValue('value1');
      child2Disabled.setValue('value2');
      stateTreeDisabled = new StateNode(ver3);
      stateTreeDisabled.setRadixTreeEnabled(false);  // radixTreeEnabled = false
      stateTreeDisabled.setChild('label1', child1Disabled);
      stateTreeDisabled.setChild('label2', child2Disabled);
      updateStateInfoForStateTree(stateTreeDisabled);

      parent = new StateNode(ver1);
    })

    it("leaf node", () => {
      // Delete a leaf node without version.
      const stateNode1 = StateNode.fromJsObject(true);
      updateStateInfoForStateTree(stateNode1);
      const numNodes1 = deleteStateTreeVersion(stateNode1);
      expect(numNodes1).to.equal(1);
      expect(stateNode1.getValue()).to.equal(null);
      expect(stateNode1.getProofHash()).to.equal(null);
      expect(stateNode1.numParents()).to.equal(0);

      // Delete a leaf node with a different version.
      const stateNode2 = StateNode.fromJsObject(true, 'ver2');
      updateStateInfoForStateTree(stateNode2);
      const numNodes2 = deleteStateTreeVersion(stateNode2);
      expect(numNodes2).to.equal(1);
      expect(stateNode2.getValue()).to.equal(null);
      expect(stateNode2.getProofHash()).to.equal(null);
      expect(stateNode2.numParents()).to.equal(0);

      // Delete a leaf node with the same version.
      const stateNode3 = StateNode.fromJsObject(true, ver1);
      updateStateInfoForStateTree(stateNode3);
      const numNodes3 = deleteStateTreeVersion(stateNode3);
      expect(numNodes3).to.equal(1);
      expect(stateNode3.getValue()).to.equal(null);
      expect(stateNode3.getProofHash()).to.equal(null);
      expect(stateNode3.numParents()).to.equal(0);

      // Delete a leaf node with the same version but with non-zero numParents() value.
      const stateNode4 = StateNode.fromJsObject(true, ver1);
      parent.setChild(nodeLabel, stateNode4);
      updateStateInfoForStateTree(stateNode4);
      const numNodes4 = deleteStateTreeVersion(stateNode4);
      expect(numNodes4).to.equal(0);
      expect(stateNode4.getValue()).to.equal(true);
      expect(stateNode4.getProofHash()).to.not.equal(null);
      expect(stateNode4.numParents()).to.equal(1);
    })

    it("internal node with a different version when radixTreeEnabled = true", () => {
      const numNodes = deleteStateTreeVersion(stateTreeEnabled);
      expect(numNodes).to.equal(3);
      // State tree is deleted.
      assert.deepEqual(stateTreeEnabled.toJsObject(GET_OPTIONS_INCLUDE_ALL), null);
      // And child nodes are deleted as well.
      expect(child1Enabled.getValue()).to.equal(null);
      expect(child1Enabled.getProofHash()).to.equal(null);
      expect(child1Enabled.getVersion()).to.equal(null);
      expect(child1Enabled.numParents()).to.equal(0);
      expect(child2Enabled.getValue()).to.equal(null);
      expect(child2Enabled.getProofHash()).to.equal(null);
      expect(child2Enabled.getVersion()).to.equal(null);
      expect(child2Enabled.numParents()).to.equal(0);
    })

    it("internal node with a different version when radixTreeEnabled = false", () => {
      const numNodes = deleteStateTreeVersion(stateTreeDisabled);
      expect(numNodes).to.equal(3);
      // State tree is deleted.
      assert.deepEqual(stateTreeDisabled.toJsObject(GET_OPTIONS_INCLUDE_ALL), null);
      // And child nodes are deleted as well.
      expect(child1Disabled.getValue()).to.equal(null);
      expect(child1Disabled.getProofHash()).to.equal(null);
      expect(child1Disabled.getVersion()).to.equal(null);
      expect(child1Disabled.numParents()).to.equal(0);
      expect(child2Disabled.getValue()).to.equal(null);
      expect(child2Disabled.getProofHash()).to.equal(null);
      expect(child2Disabled.getVersion()).to.equal(null);
      expect(child2Disabled.numParents()).to.equal(0);
    })

    it("internal node with the same version when radixTreeEnabled = true", () => {
      // Set versions of the state tree.
      setStateTreeVersion(stateTreeEnabled, ver3);

      const numNodes = deleteStateTreeVersion(stateTreeEnabled);
      expect(numNodes).to.equal(3);
      // State tree is deleted.
      assert.deepEqual(stateTreeEnabled.toJsObject(GET_OPTIONS_INCLUDE_ALL), null);
      // And child nodes are deleted as well.
      expect(child1Enabled.getValue()).to.equal(null);
      expect(child1Enabled.getProofHash()).to.equal(null);
      expect(child1Enabled.getVersion()).to.equal(null);
      expect(child1Enabled.numParents()).to.equal(0);
      expect(child2Enabled.getValue()).to.equal(null);
      expect(child2Enabled.getProofHash()).to.equal(null);
      expect(child2Enabled.getVersion()).to.equal(null);
      expect(child2Enabled.numParents()).to.equal(0);
    })

    it("internal node with the same version when radixTreeEnabled = false", () => {
      // Set versions of the state tree.
      setStateTreeVersion(stateTreeDisabled, ver3);

      const numNodes = deleteStateTreeVersion(stateTreeDisabled);
      expect(numNodes).to.equal(3);
      // State tree is deleted.
      assert.deepEqual(stateTreeDisabled.toJsObject(GET_OPTIONS_INCLUDE_ALL), null);
      // And child nodes are deleted as well.
      expect(child1Disabled.getValue()).to.equal(null);
      expect(child1Disabled.getProofHash()).to.equal(null);
      expect(child1Disabled.getVersion()).to.equal(null);
      expect(child1Disabled.numParents()).to.equal(0);
      expect(child2Disabled.getValue()).to.equal(null);
      expect(child2Disabled.getProofHash()).to.equal(null);
      expect(child2Disabled.getVersion()).to.equal(null);
      expect(child2Disabled.numParents()).to.equal(0);
    })

    it("internal node with the same version but with non-zero numParents() value when radixTreeEnabled = true", () => {
      // Increase the numParents() value of the root node.
      parent.setChild(nodeLabel, stateTreeEnabled);

      const numNodes = deleteStateTreeVersion(stateTreeEnabled);
      expect(numNodes).to.equal(0);
      // State tree is not deleted.
      assert.deepEqual(stateTreeEnabled.toJsObject(GET_OPTIONS_INCLUDE_ALL), {
        ".version": "ver3",
        ".version:label1": "ver1",
        ".version:label2": "ver2",
        ".num_parents": 1,
        ".num_parents:label1": 1,
        ".num_parents:label2": 1,
        ".proof_hash": "0x4ef3be0ba4fd9c5bc7994d3ed87ec958e11f97f1c974fba94037711e058328d6",
        ".proof_hash:label1": "0xb41f4a6e100333ddd8e8dcc01ca1fed23662d9faaec359ed255d21a900cecd08",
        ".proof_hash:label2": "0x7597bdc763c23c44e90f26c63d7eac963cc0d0aa8a0a3268e7f5691c5361d942",
        ".tree_height": 1,
        ".tree_height:label1": 0,
        ".tree_height:label2": 0,
        ".tree_size": 3,
        ".tree_size:label1": 1,
        ".tree_size:label2": 1,
        ".tree_bytes": 528,
        ".tree_bytes:label1": 172,
        ".tree_bytes:label2": 172,
        label1: "value1",
        label2: "value2"
      });
    })

    it("internal node with the same version but with non-zero numParents() value when radixTreeEnabled = false", () => {
      // Increase the numParents() value of the root node.
      parent.setChild(nodeLabel, stateTreeDisabled);

      const numNodes = deleteStateTreeVersion(stateTreeDisabled);
      expect(numNodes).to.equal(0);
      // State tree is not deleted.
      assert.deepEqual(stateTreeDisabled.toJsObject(GET_OPTIONS_INCLUDE_ALL), {
        ".version": "ver3",
        ".version:label1": "ver1",
        ".version:label2": "ver2",
        ".num_parents": 1,
        ".num_parents:label1": 1,
        ".num_parents:label2": 1,
        ".proof_hash": "0xa540d9d1906f4579604302acdee0b4c9742f537eb5f8397fb9a43ed458dad439",
        ".proof_hash:label1": "0xb41f4a6e100333ddd8e8dcc01ca1fed23662d9faaec359ed255d21a900cecd08",
        ".proof_hash:label2": "0x7597bdc763c23c44e90f26c63d7eac963cc0d0aa8a0a3268e7f5691c5361d942",
        ".tree_height": 1,
        ".tree_height:label1": 0,
        ".tree_height:label2": 0,
        ".tree_size": 3,
        ".tree_size:label1": 1,
        ".tree_size:label2": 1,
        ".tree_bytes": 528,
        ".tree_bytes:label1": 172,
        ".tree_bytes:label2": 172,
        label1: "value1",
        label2: "value2"
      });
    })

    it("internal node with the same version but with sub-node of different versions when radixTreeEnabled = true", () => {
      const numNodes = deleteStateTreeVersion(stateTreeEnabled);
      expect(numNodes).to.equal(3);
      // Root node is deleted.
      assert.deepEqual(stateTreeEnabled.toJsObject(GET_OPTIONS_INCLUDE_ALL), null);
      // And child nodes are deleted as well.
      expect(child1Enabled.getValue()).to.equal(null);
      expect(child1Enabled.getProofHash()).to.equal(null);
      expect(child1Enabled.getVersion()).to.equal(null);
      expect(child1Enabled.numParents()).to.equal(0);
      expect(child2Enabled.getValue()).to.equal(null);
      expect(child2Enabled.getProofHash()).to.equal(null);
      expect(child2Enabled.getVersion()).to.equal(null);
      expect(child2Enabled.numParents()).to.equal(0);
    })

    it("internal node with the same version but with sub-node of different versions when radixTreeEnabled = false", () => {
      const numNodes = deleteStateTreeVersion(stateTreeDisabled);
      expect(numNodes).to.equal(3);
      // Root node is deleted.
      assert.deepEqual(stateTreeDisabled.toJsObject(GET_OPTIONS_INCLUDE_ALL), null);
      // And child nodes are deleted as well.
      expect(child1Disabled.getValue()).to.equal(null);
      expect(child1Disabled.getProofHash()).to.equal(null);
      expect(child1Disabled.getVersion()).to.equal(null);
      expect(child1Disabled.numParents()).to.equal(0);
      expect(child2Disabled.getValue()).to.equal(null);
      expect(child2Disabled.getProofHash()).to.equal(null);
      expect(child2Disabled.getVersion()).to.equal(null);
      expect(child2Disabled.numParents()).to.equal(0);
    })

    it("internal node with the same version but with sub-nodes of > 1 numParents() values when radixTreeEnabled = true", () => {
      // Set versions of the state tree.
      setStateTreeVersion(stateTreeEnabled, ver3);
      stateTree2 = new StateNode('ver99');
      stateTree2.setChild('label1', child1Enabled);
      stateTree2.setChild('label2', child2Enabled);
      expect(child1Enabled.numParents()).to.equal(2);
      expect(child2Enabled.numParents()).to.equal(2);

      const numNodes = deleteStateTreeVersion(stateTreeEnabled);
      expect(numNodes).to.equal(1);
      // State tree is deleted.
      assert.deepEqual(stateTreeEnabled.toJsObject(GET_OPTIONS_INCLUDE_ALL), null);
      // But child nodes are not deleted.
      expect(child1Enabled.getValue()).to.equal('value1');
      expect(child1Enabled.getProofHash()).to.not.equal(null);
      expect(child1Enabled.getVersion()).to.equal(ver3);
      expect(child1Enabled.numParents()).to.equal(1);
      expect(child2Enabled.getValue()).to.equal('value2');
      expect(child2Enabled.getProofHash()).to.not.equal(null);
      expect(child2Enabled.getVersion()).to.equal(ver3);
      expect(child2Enabled.numParents()).to.equal(1);
    })

    it("internal node with the same version but with sub-nodes of > 1 numParents() values when radixTreeEnabled = false", () => {
      // Set versions of the state tree.
      setStateTreeVersion(stateTreeDisabled, ver3);
      stateTree2 = new StateNode('ver99');
      stateTree2.setChild('label1', child1Disabled);
      stateTree2.setChild('label2', child2Disabled);
      expect(child1Disabled.numParents()).to.equal(2);
      expect(child2Disabled.numParents()).to.equal(2);

      const numNodes = deleteStateTreeVersion(stateTreeDisabled);
      expect(numNodes).to.equal(1);
      // State tree is deleted.
      assert.deepEqual(stateTreeDisabled.toJsObject(GET_OPTIONS_INCLUDE_ALL), null);
      // But child nodes are not deleted.
      expect(child1Disabled.getValue()).to.equal('value1');
      expect(child1Disabled.getProofHash()).to.not.equal(null);
      expect(child1Disabled.getVersion()).to.equal(ver3);
      expect(child1Disabled.numParents()).to.equal(1);
      expect(child2Disabled.getValue()).to.equal('value2');
      expect(child2Disabled.getProofHash()).to.not.equal(null);
      expect(child2Disabled.getVersion()).to.equal(ver3);
      expect(child2Disabled.numParents()).to.equal(1);
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
      const root = StateNode.fromJsObject(stateObj);
      const convertedObj = root.toJsObject();
      const copy = makeCopyOfStateTree(root);
      expect(equalStateTrees(copy, root)).to.equal(true);
      deleteStateTree(root);
      assert.deepEqual(copy.toJsObject(), convertedObj);
    })
  })

  describe("equalStateTrees", () => {
    it("equal state trees", () => {
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
      const root1 = StateNode.fromJsObject(stateObj);
      const root2 = StateNode.fromJsObject(stateObj);
      expect(equalStateTrees(root1, root2)).to.equal(true);
    })

    it("state trees with grandchildren in different orders", () => {
      const stateObj1 = {
        label1: 'value1',
        label2: 'value2',
        label3: 'value3',
        subobj1: {
          label1: 'value1',
          label2: 'value2',
          label3: 'value3',
        },
        subobj2: {
          label1: 'value1',
          label2: 'value2',
          label3: 'value3',
        }
      };
      const stateObj2 = {
        label1: 'value1',
        label2: 'value2',
        label3: 'value3',
        subobj1: {
          // different order
          label3: 'value3',
          label2: 'value2',
          label1: 'value1',
        },
        subobj2: {
          // different order
          label3: 'value3',
          label2: 'value2',
          label1: 'value1',
        }
      };
      const root1 = StateNode.fromJsObject(stateObj1);
      const root2 = StateNode.fromJsObject(stateObj2);
      expect(equalStateTrees(root1, root2)).to.equal(false);
    })

    it("state trees with a grandchild of a different label", () => {
      const stateObj1 = {
        label1: 'value1',
        label2: 'value2',
        label3: 'value3',
        subobj1: {
          label1: 'value1',
          label2: 'value2',
          label3: 'value3',
        },
        subobj2: {
          label1: 'value1',
          label2: 'value2',
          label3: 'value3',
        }
      };
      const stateObj2 = {
        label1: 'value1',
        label2: 'value2',
        label3: 'value3',
        subobj1: {
          label1: 'value1',
          label2: 'value2',
          label4: 'value3',  // different label
        },
        subobj2: {
          label1: 'value1',
          label2: 'value2',
          label3: 'value3',
        }
      };
      const root1 = StateNode.fromJsObject(stateObj1);
      const root2 = StateNode.fromJsObject(stateObj2);
      expect(equalStateTrees(root1, root2)).to.equal(false);
    })

    it("state trees with an extra grandchild", () => {
      const stateObj1 = {
        label1: 'value1',
        label2: 'value2',
        label3: 'value3',
        subobj1: {
          label1: 'value1',
          label2: 'value2',
          label3: 'value3',
        },
        subobj2: {
          label1: 'value1',
          label2: 'value2',
          label3: 'value3',
        }
      };
      const stateObj2 = {
        label1: 'value1',
        label2: 'value2',
        label3: 'value3',
        subobj1: {
          label1: 'value1',
          label2: 'value2',
          label3: 'value3',
          label4: 'value4',  // extra node
        },
        subobj2: {
          label1: 'value1',
          label2: 'value2',
          label3: 'value3',
        }
      };
      const root1 = StateNode.fromJsObject(stateObj1);
      const root2 = StateNode.fromJsObject(stateObj2);
      expect(equalStateTrees(root1, root2)).to.equal(false);
    })
  })

  describe("empty nodes removal by updateStateInfoAllRootPaths", () => {
    const label1 = '0x0001';
    const label11 = '0x0011';
    const label111 = '0x0111';
    const label1111 = '0x1111';
    const label12 = '0x0012';
    const label121 = '0x0121';
    const jsObject = {
      [label1]: {
        [label11]: {
          [label111]: {
            [label1111]: null,
          }
        },
        [label12]: {
          [label121]: 'V0121'
        }
      }
    };

    let stateTreeEnabled;
    let child1Enabled;
    let child11Enabled;
    let child111Enabled;
    let child1111Enabled;


    let stateTreeDisabled;
    let child1Disabled;
    let child11Disabled;
    let child111Disabled;
    let child1111Disabled;

    beforeEach(() => {
      stateTreeEnabled = StateNode.fromJsObject(jsObject, null, true);  // radixTreeEnabled = true
      child1Enabled = stateTreeEnabled.getChild(label1);
      child11Enabled = child1Enabled.getChild(label11);
      child111Enabled = child11Enabled.getChild(label111);
      child1111Enabled = child111Enabled.getChild(label1111);

      stateTreeDisabled = StateNode.fromJsObject(jsObject, null, false);  // radixTreeEnabled = false
      child1Disabled = stateTreeDisabled.getChild(label1);
      child11Disabled = child1Disabled.getChild(label11);
      child111Disabled = child11Disabled.getChild(label111);
      child1111Disabled = child111Disabled.getChild(label1111);
    });

    it("updateStateInfoForAllRootPaths on empty node with a single root path when radixTreeEnabled = true", () => {
      assert.deepEqual(stateTreeEnabled.toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        "0x0001": {
          ".proof_hash": null,
          "0x0011": {
            ".proof_hash": null,
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          },
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
      const numAffectedNodes = updateStateInfoForAllRootPaths(child111Enabled, label1111);
      expect(numAffectedNodes).to.equal(4);
      assert.deepEqual(stateTreeEnabled.toJsObject({ includeProof: true }), {
        ".proof_hash": "0x69350f4b5f666b90fd2d459dee2c5ae513f35be924ad765d601ce9c15f81f283",
        "0x0001": {
          ".proof_hash": "0x79df089f535b03c34313f67ec207781875db7a7425230a78b2f71dd827a592fc",
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
    });

    it("updateStateInfoForAllRootPaths on empty node with a single root path when radixTreeEnabled = false", () => {
      assert.deepEqual(stateTreeDisabled.toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        "0x0001": {
          ".proof_hash": null,
          "0x0011": {
            ".proof_hash": null,
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          },
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
      const numAffectedNodes = updateStateInfoForAllRootPaths(child111Disabled, label1111);
      expect(numAffectedNodes).to.equal(4);
      assert.deepEqual(stateTreeDisabled.toJsObject({ includeProof: true }), {
        ".proof_hash": "0x779e9ed5ad62a4286ee886697de51a48878f36c7b163abee2d99baca1f89e931",
        "0x0001": {
          ".proof_hash": "0x58ed1dfe4e4c18b14179e134b73fc01221c154187bf6ab1c99236ebe4af514a0",
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
    });

    it("updateStateInfoForAllRootPaths on empty node with multiple root paths from empty node when radixTreeEnabled = true", () => {
      const child111CloneEnabled = child111Enabled.clone();
      const child11CloneEnabled = new StateNode();
      child11CloneEnabled.setRadixTreeEnabled(true);
      child11CloneEnabled.setChild(label111, child111CloneEnabled);
      const child1CloneEnabled = new StateNode();
      child1CloneEnabled.setRadixTreeEnabled(true);
      child1CloneEnabled.setChild(label11, child11CloneEnabled);
      const stateTreeCloneEnabled = new StateNode();
      stateTreeCloneEnabled.setRadixTreeEnabled(true);
      stateTreeCloneEnabled.setChild(label1, child1CloneEnabled);
      const child3Enabled = new StateNode();
      child3Enabled.setRadixTreeEnabled(true);
      child3Enabled.setValue('V0003');
      const label3 = '0x003';
      stateTreeCloneEnabled.setChild(label3, child3Enabled);

      assert.deepEqual(stateTreeEnabled.toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        "0x0001": {
          ".proof_hash": null,
          "0x0011": {
            ".proof_hash": null,
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          },
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
      assert.deepEqual(stateTreeCloneEnabled.toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        ".proof_hash:0x003": null,
        "0x0001": {
          ".proof_hash": null,
          "0x0011": {
            ".proof_hash": null,
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          }
        },
        "0x003": "V0003"
      });
      assert.deepEqual(child1111Enabled.getParentNodes(), [child111Enabled, child111CloneEnabled]);
      const numAffectedNodes = updateStateInfoForAllRootPaths(child111Enabled, label1111);
      expect(numAffectedNodes).to.equal(4);
      assert.deepEqual(stateTreeEnabled.toJsObject({ includeProof: true }), {
        ".proof_hash": "0x69350f4b5f666b90fd2d459dee2c5ae513f35be924ad765d601ce9c15f81f283",
        "0x0001": {
          ".proof_hash": "0x79df089f535b03c34313f67ec207781875db7a7425230a78b2f71dd827a592fc",
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
      assert.deepEqual(stateTreeCloneEnabled.toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        ".proof_hash:0x003": null,
        "0x0001": {
          ".proof_hash": null,
          "0x0011": {
            ".proof_hash": null,
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          }
        },
        "0x003": "V0003"
      });
    });

    it("updateStateInfoForAllRootPaths on empty node with multiple root paths from empty node when radixTreeEnabled = false", () => {
      const child111CloneDisabled = child111Disabled.clone();
      const child11CloneDisabled = new StateNode();
      child11CloneDisabled.setRadixTreeEnabled(false);
      child11CloneDisabled.setChild(label111, child111CloneDisabled);
      const child1CloneDisabled = new StateNode();
      child1CloneDisabled.setRadixTreeEnabled(false);
      child1CloneDisabled.setChild(label11, child11CloneDisabled);
      const stateTreeCloneDisabled = new StateNode();
      stateTreeCloneDisabled.setRadixTreeEnabled(false);
      stateTreeCloneDisabled.setChild(label1, child1CloneDisabled);
      const child3Disabled = new StateNode();
      child3Disabled.setRadixTreeEnabled(false);
      child3Disabled.setValue('V0003');
      const label3 = '0x003';
      stateTreeCloneDisabled.setChild(label3, child3Disabled);

      assert.deepEqual(stateTreeDisabled.toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        "0x0001": {
          ".proof_hash": null,
          "0x0011": {
            ".proof_hash": null,
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          },
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
      assert.deepEqual(stateTreeCloneDisabled.toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        ".proof_hash:0x003": null,
        "0x0001": {
          ".proof_hash": null,
          "0x0011": {
            ".proof_hash": null,
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          }
        },
        "0x003": "V0003"
      });
      assert.deepEqual(child1111Disabled.getParentNodes(), [child111Disabled, child111CloneDisabled]);
      const numAffectedNodes = updateStateInfoForAllRootPaths(child111Disabled, label1111);
      expect(numAffectedNodes).to.equal(4);
      assert.deepEqual(stateTreeDisabled.toJsObject({ includeProof: true }), {
        ".proof_hash": "0x779e9ed5ad62a4286ee886697de51a48878f36c7b163abee2d99baca1f89e931",
        "0x0001": {
          ".proof_hash": "0x58ed1dfe4e4c18b14179e134b73fc01221c154187bf6ab1c99236ebe4af514a0",
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
      assert.deepEqual(stateTreeCloneDisabled.toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        ".proof_hash:0x003": null,
        "0x0001": {
          ".proof_hash": null,
          "0x0011": {
            ".proof_hash": null,
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          }
        },
        "0x003": "V0003"
      });
    });

    it("updateStateInfoForAllRootPaths on empty node with multiple root paths from parent node when radixTreeEnabled = true", () => {
      const child11CloneEnabled = child11Enabled.clone()
      const child1CloneEnabled = new StateNode();
      child1CloneEnabled.setRadixTreeEnabled(true);
      child1CloneEnabled.setChild(label11, child11CloneEnabled);
      const stateTreeCloneEnabled = new StateNode();
      stateTreeCloneEnabled.setRadixTreeEnabled(true);
      stateTreeCloneEnabled.setChild(label1, child1CloneEnabled);
      const child3Enabled = new StateNode();
      child3Enabled.setRadixTreeEnabled(true);
      child3Enabled.setValue('V0003');
      const label3 = '0x003';
      stateTreeCloneEnabled.setChild(label3, child3Enabled);

      assert.deepEqual(stateTreeEnabled.toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        "0x0001": {
          ".proof_hash": null,
          "0x0011": {
            ".proof_hash": null,
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          },
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
      assert.deepEqual(stateTreeCloneEnabled.toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        ".proof_hash:0x003": null,
        "0x0001": {
          ".proof_hash": null,
          "0x0011": {
            ".proof_hash": null,
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          }
        },
        "0x003": "V0003"
      });
      assert.deepEqual(child111Enabled.getParentNodes(), [child11Enabled, child11CloneEnabled]);
      const numAffectedNodes = updateStateInfoForAllRootPaths(child111Enabled, label1111);
      expect(numAffectedNodes).to.equal(7);
      assert.deepEqual(stateTreeEnabled.toJsObject({ includeProof: true }), {
        ".proof_hash": "0x69350f4b5f666b90fd2d459dee2c5ae513f35be924ad765d601ce9c15f81f283",
        "0x0001": {
          ".proof_hash": "0x79df089f535b03c34313f67ec207781875db7a7425230a78b2f71dd827a592fc",
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
      assert.deepEqual(stateTreeCloneEnabled.toJsObject({ includeProof: true }), {
        ".proof_hash": "0x4982c00e8daae6d0ca0cb3b0cc6bcec88b97183a7f7f8decfcd013eb402b6f32",
        ".proof_hash:0x003": null,
        "0x003": "V0003"
      });
    });

    it("updateStateInfoForAllRootPaths on empty node with multiple root paths from parent node when radixTreeEnabled = false", () => {
      const child11CloneDisabled = child11Disabled.clone()
      const child1CloneDisabled = new StateNode();
      child1CloneDisabled.setRadixTreeEnabled(true);
      child1CloneDisabled.setChild(label11, child11CloneDisabled);
      const stateTreeCloneDisabled = new StateNode();
      stateTreeCloneDisabled.setRadixTreeEnabled(true);
      stateTreeCloneDisabled.setChild(label1, child1CloneDisabled);
      const child3Disabled = new StateNode();
      child3Disabled.setRadixTreeEnabled(true);
      child3Disabled.setValue('V0003');
      const label3 = '0x003';
      stateTreeCloneDisabled.setChild(label3, child3Disabled);

      assert.deepEqual(stateTreeDisabled.toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        "0x0001": {
          ".proof_hash": null,
          "0x0011": {
            ".proof_hash": null,
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          },
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
      assert.deepEqual(stateTreeCloneDisabled.toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        ".proof_hash:0x003": null,
        "0x0001": {
          ".proof_hash": null,
          "0x0011": {
            ".proof_hash": null,
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          }
        },
        "0x003": "V0003"
      });
      assert.deepEqual(child111Disabled.getParentNodes(), [child11Disabled, child11CloneDisabled]);
      const numAffectedNodes = updateStateInfoForAllRootPaths(child111Disabled, label1111);
      expect(numAffectedNodes).to.equal(7);
      assert.deepEqual(stateTreeDisabled.toJsObject({ includeProof: true }), {
        ".proof_hash": "0x779e9ed5ad62a4286ee886697de51a48878f36c7b163abee2d99baca1f89e931",
        "0x0001": {
          ".proof_hash": "0x58ed1dfe4e4c18b14179e134b73fc01221c154187bf6ab1c99236ebe4af514a0",
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
      assert.deepEqual(stateTreeCloneDisabled.toJsObject({ includeProof: true }), {
        ".proof_hash": "0x4982c00e8daae6d0ca0cb3b0cc6bcec88b97183a7f7f8decfcd013eb402b6f32",
        ".proof_hash:0x003": null,
        "0x003": "V0003"
      });
    });

    it("updateStateInfoAllRootPaths on non-empty node when radixTreeEnabled = true", () => {
      assert.deepEqual(stateTreeEnabled.toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        "0x0001": {
          ".proof_hash": null,
          "0x0011": {
            ".proof_hash": null,
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          },
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
      const numAffectedNodes =
          updateStateInfoForAllRootPaths(child11Enabled, label111, false);
      expect(numAffectedNodes).to.equal(3);
      assert.deepEqual(stateTreeEnabled.toJsObject({ includeProof: true }), {
        ".proof_hash": "0xf8de149cbb6e6ec6eed202d0c1c2927f955bd693dde8725aff64ecd694302be2",
        "0x0001": {
          ".proof_hash": "0xbeec2ad3bd5285e375bb66f49ccef377af065bb674a3d5c43937d0c66656a61b",
          "0x0011": {
            ".proof_hash": "0x07f1a0cf4f86e7b2459a2cc76a65df77b0f0de3da941168588bf59bd8bf7c970",
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          },
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
    });

    it("updateStateInfoAllRootPaths on non-empty node when radixTreeEnabled = false", () => {
      assert.deepEqual(stateTreeDisabled.toJsObject({ includeProof: true }), {
        ".proof_hash": null,
        "0x0001": {
          ".proof_hash": null,
          "0x0011": {
            ".proof_hash": null,
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          },
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
      const numAffectedNodes =
          updateStateInfoForAllRootPaths(child11Disabled, label111, false);
      expect(numAffectedNodes).to.equal(3);
      assert.deepEqual(stateTreeDisabled.toJsObject({ includeProof: true }), {
        ".proof_hash": "0xab0f61360db4d25cc498f314ae5deddd75490eb68cbc48c31574e80d8b2fd95d",
        "0x0001": {
          ".proof_hash": "0x7e616ba05dd7f7971325898085dce5b473a17a1d390530d85a5257a9ec459fd2",
          "0x0011": {
            ".proof_hash": "0x019ba3616e09c5714a902f3aee0deb04f40ace082ae104792726945307e8a947",
            "0x0111": {
              ".proof_hash": null,
              ".proof_hash:0x1111": null,
              "0x1111": null
            }
          },
          "0x0012": {
            ".proof_hash": null,
            ".proof_hash:0x0121": null,
            "0x0121": "V0121"
          }
        }
      });
    });
  });

  describe("state info updates", () => {
    const label1 = '0x0001';
    const label11 = '0x0011';
    const label111 = '0x0111';
    const label1111 = '0x1111';
    const label1112 = '0x1112';
    const label2 = '0x0002';
    const label21 = '0x0021';
    const jsObject = {
      [label1]: {
        [label11]: {
          [label111]: {
            [label1111]: 'V1111',
            [label1112]: 'V1112'
          }
        }
      },
      [label2]: {
        [label21]: 'V0021'
      }
    };

    let stateTreeEnabled;
    let child1Enabled;
    let child11Enabled;
    let child111Enabled;
    let child1111Enabled;
    let child1112Enabled;
    let child2Enabled;
    let child21Enabled;

    let stateTreeDisabled;
    let child1Disabled;
    let child11Disabled;
    let child111Disabled;
    let child1111Disabled;
    let child1112Disabled;
    let child2Disabled;
    let child21Disabled;

    beforeEach(() => {
      stateTreeEnabled = StateNode.fromJsObject(jsObject, null, true);  // radixTreeEnabled = true
      child1Enabled = stateTreeEnabled.getChild(label1);
      child11Enabled = child1Enabled.getChild(label11);
      child111Enabled = child11Enabled.getChild(label111);
      child1111Enabled = child111Enabled.getChild(label1111);
      child1112Enabled = child111Enabled.getChild(label1112);
      child2Enabled = stateTreeEnabled.getChild(label2);
      child21Enabled = child2Enabled.getChild(label21);

      stateTreeDisabled = StateNode.fromJsObject(jsObject, null, false);  // radixTreeEnabled = false
      child1Disabled = stateTreeDisabled.getChild(label1);
      child11Disabled = child1Disabled.getChild(label11);
      child111Disabled = child11Disabled.getChild(label111);
      child1111Disabled = child111Disabled.getChild(label1111);
      child1112Disabled = child111Disabled.getChild(label1112);
      child2Disabled = stateTreeDisabled.getChild(label2);
      child21Disabled = child2Disabled.getChild(label21);
    });

    it("updateStateInfoForStateTree when radixTreeEnabled = true", () => {
      const numAffectedNodes = updateStateInfoForStateTree(child1Enabled);
      expect(numAffectedNodes).to.equal(5);
      // Checks proof hashes.
      expect(child1111Enabled.verifyProofHash()).to.equal(true);
      expect(child1112Enabled.verifyProofHash()).to.equal(true);
      expect(child111Enabled.verifyProofHash()).to.equal(true);
      expect(child11Enabled.verifyProofHash()).to.equal(true);
      expect(child1Enabled.verifyProofHash()).to.equal(true);
      expect(child21Enabled.verifyProofHash()).to.equal(false);
      expect(child2Enabled.verifyProofHash()).to.equal(false);
      expect(stateTreeEnabled.verifyProofHash()).to.equal(false);
      // Checks tree heights.
      expect(child1111Enabled.getTreeHeight()).to.equal(0);
      expect(child1112Enabled.getTreeHeight()).to.equal(0);
      expect(child111Enabled.getTreeHeight()).to.equal(1);
      expect(child11Enabled.getTreeHeight()).to.equal(2);
      expect(child1Enabled.getTreeHeight()).to.equal(3);
      expect(child21Enabled.getTreeHeight()).to.equal(0);
      expect(child2Enabled.getTreeHeight()).to.equal(0);
      expect(stateTreeEnabled.getTreeHeight()).to.equal(0);
      // Checks tree sizes.
      expect(child1111Enabled.getTreeSize()).to.equal(1);
      expect(child1112Enabled.getTreeSize()).to.equal(1);
      expect(child111Enabled.getTreeSize()).to.equal(3);
      expect(child11Enabled.getTreeSize()).to.equal(4);
      expect(child1Enabled.getTreeSize()).to.equal(5);
      expect(child21Enabled.getTreeSize()).to.equal(0);
      expect(child2Enabled.getTreeSize()).to.equal(0);
      expect(stateTreeEnabled.getTreeSize()).to.equal(0);
      // Checks tree bytes.
      expect(child1111Enabled.getTreeBytes()).to.not.equal(0);  // non-zero value
      expect(child1112Enabled.getTreeBytes()).to.not.equal(0); // non-zero value
      expect(child111Enabled.getTreeBytes()).to.not.equal(0); // non-zero value
      expect(child11Enabled.getTreeBytes()).to.not.equal(0); // non-zero value
      expect(child1Enabled.getTreeBytes()).to.not.equal(0); // non-zero value
      expect(child21Enabled.getTreeBytes()).to.equal(0);
      expect(child2Enabled.getTreeBytes()).to.equal(0);
      expect(stateTreeEnabled.getTreeBytes()).to.equal(0);
    });

    it("updateStateInfoForStateTree when radixTreeEnabled = false", () => {
      const numAffectedNodes = updateStateInfoForStateTree(child1Disabled);
      expect(numAffectedNodes).to.equal(5);
      // Checks proof hashes.
      expect(child1111Disabled.verifyProofHash()).to.equal(true);
      expect(child1112Disabled.verifyProofHash()).to.equal(true);
      expect(child111Disabled.verifyProofHash()).to.equal(true);
      expect(child11Disabled.verifyProofHash()).to.equal(true);
      expect(child1Disabled.verifyProofHash()).to.equal(true);
      expect(child21Disabled.verifyProofHash()).to.equal(false);
      expect(child2Disabled.verifyProofHash()).to.equal(false);
      expect(stateTreeDisabled.verifyProofHash()).to.equal(false);
      // Checks tree heights.
      expect(child1111Disabled.getTreeHeight()).to.equal(0);
      expect(child1112Disabled.getTreeHeight()).to.equal(0);
      expect(child111Disabled.getTreeHeight()).to.equal(1);
      expect(child11Disabled.getTreeHeight()).to.equal(2);
      expect(child1Disabled.getTreeHeight()).to.equal(3);
      expect(child21Disabled.getTreeHeight()).to.equal(0);
      expect(child2Disabled.getTreeHeight()).to.equal(0);
      expect(stateTreeDisabled.getTreeHeight()).to.equal(0);
      // Checks tree sizes.
      expect(child1111Disabled.getTreeSize()).to.equal(1);
      expect(child1112Disabled.getTreeSize()).to.equal(1);
      expect(child111Disabled.getTreeSize()).to.equal(3);
      expect(child11Disabled.getTreeSize()).to.equal(4);
      expect(child1Disabled.getTreeSize()).to.equal(5);
      expect(child21Disabled.getTreeSize()).to.equal(0);
      expect(child2Disabled.getTreeSize()).to.equal(0);
      expect(stateTreeDisabled.getTreeSize()).to.equal(0);
      // Checks tree bytes.
      expect(child1111Disabled.getTreeBytes()).to.not.equal(0);  // non-zero value
      expect(child1112Disabled.getTreeBytes()).to.not.equal(0); // non-zero value
      expect(child111Disabled.getTreeBytes()).to.not.equal(0); // non-zero value
      expect(child11Disabled.getTreeBytes()).to.not.equal(0); // non-zero value
      expect(child1Disabled.getTreeBytes()).to.not.equal(0); // non-zero value
      expect(child21Disabled.getTreeBytes()).to.equal(0);
      expect(child2Disabled.getTreeBytes()).to.equal(0);
      expect(stateTreeDisabled.getTreeBytes()).to.equal(0);
    });

    it("updateStateInfoForAllRootPaths with a single root path when radixTreeEnabled = true", () => {
      const numAffectedNodes = updateStateInfoForAllRootPaths(child111Enabled, label1112);
      expect(numAffectedNodes).to.equal(4);
      // Checks proof hashes.
      expect(child1111Enabled.verifyProofHash()).to.equal(false);
      expect(child1112Enabled.verifyProofHash()).to.equal(false);
      expect(child111Enabled.verifyProofHash(label1112)).to.equal(true);  // verified
      expect(child11Enabled.verifyProofHash()).to.equal(true);  // verified
      expect(child21Enabled.verifyProofHash()).to.equal(false);
      expect(child2Enabled.verifyProofHash()).to.equal(false);
      expect(child1Enabled.verifyProofHash()).to.equal(true);  // verified
      expect(stateTreeEnabled.verifyProofHash(label1)).to.equal(true);  // verified

      // Checks tree info.
      expect(child1111Enabled.getTreeHeight()).to.equal(0);
      expect(child1111Enabled.getTreeSize()).to.equal(0);
      expect(child1111Enabled.getTreeBytes()).to.equal(0);

      expect(child1112Enabled.getTreeHeight()).to.equal(0);
      expect(child1112Enabled.getTreeSize()).to.equal(0);
      expect(child1112Enabled.getTreeBytes()).to.equal(0);

      const treeInfoChild111 = child111Enabled._buildTreeInfo();
      expect(child111Enabled.getTreeHeight()).to.equal(treeInfoChild111.treeHeight);
      expect(child111Enabled.getTreeSize()).to.equal(treeInfoChild111.treeSize);
      expect(child111Enabled.getTreeBytes()).to.equal(treeInfoChild111.treeBytes);

      const treeInfoChild11 = child11Enabled._buildTreeInfo();
      expect(child11Enabled.getTreeHeight()).to.equal(treeInfoChild11.treeHeight);
      expect(child11Enabled.getTreeSize()).to.equal(treeInfoChild11.treeSize);
      expect(child11Enabled.getTreeBytes()).to.equal(treeInfoChild11.treeBytes);

      const treeInfoChild1 = child1Enabled._buildTreeInfo();
      expect(child1Enabled.getTreeHeight()).to.equal(treeInfoChild1.treeHeight);
      expect(child1Enabled.getTreeSize()).to.equal(treeInfoChild1.treeSize);
      expect(child1Enabled.getTreeBytes()).to.equal(treeInfoChild1.treeBytes);

      expect(child21Enabled.getTreeHeight()).to.equal(0);
      expect(child21Enabled.getTreeSize()).to.equal(0);
      expect(child21Enabled.getTreeBytes()).to.equal(0);

      expect(child2Enabled.getTreeHeight()).to.equal(0);
      expect(child2Enabled.getTreeSize()).to.equal(0);
      expect(child2Enabled.getTreeBytes()).to.equal(0);

      const treeInfoStateTree = stateTreeEnabled._buildTreeInfo();
      expect(stateTreeEnabled.getTreeHeight()).to.equal(treeInfoStateTree.treeHeight);
      expect(stateTreeEnabled.getTreeSize()).to.equal(treeInfoStateTree.treeSize);
      expect(stateTreeEnabled.getTreeBytes()).to.equal(treeInfoStateTree.treeBytes);
    });

    it("updateStateInfoForAllRootPaths with a single root path when radixTreeEnabled = false", () => {
      const numAffectedNodes = updateStateInfoForAllRootPaths(child111Disabled, label1112);
      expect(numAffectedNodes).to.equal(4);
      // Checks proof hashes.
      expect(child1111Disabled.verifyProofHash()).to.equal(false);
      expect(child1112Disabled.verifyProofHash()).to.equal(false);
      expect(child111Disabled.verifyProofHash(label1112)).to.equal(true);  // verified
      expect(child11Disabled.verifyProofHash()).to.equal(true);  // verified
      expect(child21Disabled.verifyProofHash()).to.equal(false);
      expect(child2Disabled.verifyProofHash()).to.equal(false);
      expect(child1Disabled.verifyProofHash()).to.equal(true);  // verified
      expect(stateTreeDisabled.verifyProofHash(label1)).to.equal(true);  // verified

      // Checks tree info.
      expect(child1111Disabled.getTreeHeight()).to.equal(0);
      expect(child1111Disabled.getTreeSize()).to.equal(0);
      expect(child1111Disabled.getTreeBytes()).to.equal(0);

      expect(child1112Disabled.getTreeHeight()).to.equal(0);
      expect(child1112Disabled.getTreeSize()).to.equal(0);
      expect(child1112Disabled.getTreeBytes()).to.equal(0);

      const treeInfoChild111 = child111Disabled._buildTreeInfo();
      expect(child111Disabled.getTreeHeight()).to.equal(treeInfoChild111.treeHeight);
      expect(child111Disabled.getTreeSize()).to.equal(treeInfoChild111.treeSize);
      expect(child111Disabled.getTreeBytes()).to.equal(treeInfoChild111.treeBytes);

      const treeInfoChild11 = child11Disabled._buildTreeInfo();
      expect(child11Disabled.getTreeHeight()).to.equal(treeInfoChild11.treeHeight);
      expect(child11Disabled.getTreeSize()).to.equal(treeInfoChild11.treeSize);
      expect(child11Disabled.getTreeBytes()).to.equal(treeInfoChild11.treeBytes);

      const treeInfoChild1 = child1Disabled._buildTreeInfo();
      expect(child1Disabled.getTreeHeight()).to.equal(treeInfoChild1.treeHeight);
      expect(child1Disabled.getTreeSize()).to.equal(treeInfoChild1.treeSize);
      expect(child1Disabled.getTreeBytes()).to.equal(treeInfoChild1.treeBytes);

      expect(child21Disabled.getTreeHeight()).to.equal(0);
      expect(child21Disabled.getTreeSize()).to.equal(0);
      expect(child21Disabled.getTreeBytes()).to.equal(0);

      expect(child2Disabled.getTreeHeight()).to.equal(0);
      expect(child2Disabled.getTreeSize()).to.equal(0);
      expect(child2Disabled.getTreeBytes()).to.equal(0);

      const treeInfoStateTree = stateTreeDisabled._buildTreeInfo();
      expect(stateTreeDisabled.getTreeHeight()).to.equal(treeInfoStateTree.treeHeight);
      expect(stateTreeDisabled.getTreeSize()).to.equal(treeInfoStateTree.treeSize);
      expect(stateTreeDisabled.getTreeBytes()).to.equal(treeInfoStateTree.treeBytes);
    });

    it("updateStateInfoForAllRootPaths with multiple root paths when radixTreeEnabled = true", () => {
      const stateTreeClone = stateTreeEnabled.clone();
      const child1Clone = child1Enabled.clone();
      const child11Clone = child11Enabled.clone();
      const child111Clone = child111Enabled.clone();
      const child2Clone = child2Enabled.clone();

      expect(updateStateInfoForAllRootPaths(child111Enabled, label1112)).to.equal(7);

      // Checks proof hashes.
      expect(child1111Enabled.verifyProofHash()).to.equal(false);
      expect(child1112Enabled.verifyProofHash()).to.equal(false);  // not verified!!
      expect(child111Enabled.verifyProofHash(label1112)).to.equal(true);  // verified
      expect(child111Clone.verifyProofHash(label1112)).to.equal(false);  // not verified!!
      expect(child11Enabled.verifyProofHash()).to.equal(true);  // verified
      expect(child11Clone.verifyProofHash()).to.equal(true);  // verified
      expect(child11Clone.getProofHash()).to.equal(child11Enabled.getProofHash());
      expect(child1Enabled.verifyProofHash()).to.equal(true);  // verified
      expect(child1Clone.verifyProofHash()).to.equal(true);  // verified
      expect(child1Clone.getProofHash()).to.equal(child1Enabled.getProofHash());
      expect(child21Enabled.verifyProofHash()).to.equal(false);
      expect(child2Enabled.verifyProofHash()).to.equal(false);
      expect(child2Clone.verifyProofHash()).to.equal(false);
      expect(stateTreeEnabled.verifyProofHash(label1)).to.equal(true);  // verified
      expect(stateTreeClone.verifyProofHash(label1)).to.equal(true);  // verified
      expect(stateTreeClone.getProofHash()).to.equal(stateTreeEnabled.getProofHash());
    });

    it("updateStateInfoForAllRootPaths with multiple root paths when radixTreeEnabled = false", () => {
      const stateTreeClone = stateTreeDisabled.clone();
      const child1Clone = child1Disabled.clone();
      const child11Clone = child11Disabled.clone();
      const child111Clone = child111Disabled.clone();
      const child2Clone = child2Disabled.clone();

      expect(updateStateInfoForAllRootPaths(child111Disabled, label1112)).to.equal(7);

      // Checks proof hashes.
      expect(child1111Disabled.verifyProofHash()).to.equal(false);
      expect(child1112Disabled.verifyProofHash()).to.equal(false);  // not verified!!
      expect(child111Disabled.verifyProofHash(label1112)).to.equal(true);  // verified
      expect(child111Clone.verifyProofHash(label1112)).to.equal(false);  // not verified!!
      expect(child11Disabled.verifyProofHash()).to.equal(true);  // verified
      expect(child11Clone.verifyProofHash()).to.equal(true);  // verified
      expect(child11Clone.getProofHash()).to.equal(child11Disabled.getProofHash());
      expect(child1Disabled.verifyProofHash()).to.equal(true);  // verified
      expect(child1Clone.verifyProofHash()).to.equal(true);  // verified
      expect(child1Clone.getProofHash()).to.equal(child1Disabled.getProofHash());
      expect(child21Disabled.verifyProofHash()).to.equal(false);
      expect(child2Disabled.verifyProofHash()).to.equal(false);
      expect(child2Clone.verifyProofHash()).to.equal(false);
      expect(stateTreeDisabled.verifyProofHash(label1)).to.equal(true);  // verified
      expect(stateTreeClone.verifyProofHash(label1)).to.equal(true);  // verified
      expect(stateTreeClone.getProofHash()).to.equal(stateTreeDisabled.getProofHash());
    });

    it("verifyProofHashForStateTree when radixTreeEnabled = true", () => {
      updateStateInfoForStateTree(stateTreeEnabled);
      expect(verifyProofHashForStateTree(stateTreeEnabled)).to.equal(true);
      child111Enabled.setProofHash('new ph');
      expect(verifyProofHashForStateTree(stateTreeEnabled)).to.equal(false);
    });

    it("verifyProofHashForStateTree when radixTreeEnabled = false", () => {
      updateStateInfoForStateTree(stateTreeDisabled);
      expect(verifyProofHashForStateTree(stateTreeDisabled)).to.equal(true);
      child111Disabled.setProofHash('new ph');
      expect(verifyProofHashForStateTree(stateTreeDisabled)).to.equal(false);
    });

    it("getProofOfState when radixTreeEnabled = true", () => {
      updateStateInfoForStateTree(stateTreeEnabled);
      assert.deepEqual(getProofOfStatePath(stateTreeEnabled, [label1, label11]), {
        ".radix_ph": "0xeef6cf891adc1b4755cb54085116c08d7ced1afe8eee3bdaac2259d935b2befe",
        "000": {
          "1": {
            ".label": "0x0001",
            ".proof_hash": {
              ".radix_ph": "0x7ba5e5356546d605d7b44d9fce969e41520b81b5df436cb57a9209e1fefab25b",
              "0011": {
                ".label": "0x0011",
                ".proof_hash": {
                  ".proof_hash": "0x567383e2ed5a49d908498eda42457ce1ed07c3b6672b75c3e0be5d0da8de4b9d"
                },
                ".radix_ph": "0x9361b41ef0b1b88c2ea20a7aeb471f3c84af681b6a747a0c09a47794189e1c51"
              }
            },
            ".radix_ph": "0xdfa952d88be9321937e4ce6918c03312c40725472ee08d6d61a3b1f277e2f38b"
          },
          "2": {
            ".radix_ph": "0xa64fc83d2b5a4193e285cf17f9f2ad02898730a74441c995409d3d9be3b63dc6"
          },
          ".radix_ph": "0x0f1fdb35bd8e9ec757d12c8a3dafdcd83437aa392b1fcd22d1b0c0ee273aed31"
        }
      });
    });

    it("getProofOfState when radixTreeEnabled = false", () => {
      updateStateInfoForStateTree(stateTreeDisabled);
      assert.deepEqual(getProofOfStatePath(stateTreeDisabled, [label1, label11]), {
        ".proof_hash": "0xb2eee68c1dca492047f80706ee3996a082d911b932f8ae050c60ee6aa29e0c77",
        "0x0001": {
          ".proof_hash": "0x59ab9f2ec1fce38b035680beaeac5cfd06a5b2143054e6ca4689dccdb726d352",
          "0x0011": {
            ".proof_hash": "0x53b69d12b2eb57a9f0d79d63a4fd17124d7e85148ce21eeeacad687039092911"
          }
        },
        "0x0002": {
          ".proof_hash": "0x6e575c10e7e36e959b719f513ac8b12ff468d0d0e0a5f98ebae2c66aad4bcedf"
        }
      });
    });
  });
})