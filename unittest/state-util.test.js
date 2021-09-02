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

    let child1 = null;
    let child2 = null;
    let stateTree = null;

    beforeEach(() => {
      child1 = new StateNode(ver1);
      child2 = new StateNode(ver2);
      child1.setValue('value1');
      child2.setValue('value2');
      stateTree = new StateNode(ver3);
      stateTree.setChild('label1', child1);
      stateTree.setChild('label2', child2);
      updateStateInfoForStateTree(stateTree);
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

    it("internal node", () => {
      const numNodes = deleteStateTree(stateTree);
      expect(numNodes).to.equal(3);
      // State tree is deleted.
      assert.deepEqual(stateTree.toJsObject(GET_OPTIONS_INCLUDE_ALL), null);
      // And child nodes are deleted as well.
      expect(child1.getValue()).to.equal(null);
      expect(child1.getProofHash()).to.equal(null);
      expect(child1.numParents()).to.equal(0);
      expect(child2.getValue()).to.equal(null);
      expect(child2.getProofHash()).to.equal(null);
      expect(child2.numParents()).to.equal(0);
    })
  })

  describe("deleteStateTreeVersion", () => {
    const ver1 = 'ver1';
    const ver2 = 'ver2';
    const ver3 = 'ver3';

    let child1 = null;
    let child2 = null;
    let node = null;

    const parent = new StateNode(ver1);
    const nodeLabel = 'node_label';

    beforeEach(() => {
      child1 = new StateNode(ver1);
      child2 = new StateNode(ver2);
      child1.setValue('value1');
      child2.setValue('value2');
      node = new StateNode(ver3);
      node.setChild('label1', child1);
      node.setChild('label2', child2);
      updateStateInfoForStateTree(node);
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

    it("internal node with a different version", () => {
      const numNodes = deleteStateTreeVersion(node);
      expect(numNodes).to.equal(3);
      // State tree is deleted.
      assert.deepEqual(node.toJsObject(GET_OPTIONS_INCLUDE_ALL), null);
      // And child nodes are deleted as well.
      expect(child1.getValue()).to.equal(null);
      expect(child1.getProofHash()).to.equal(null);
      expect(child1.getVersion()).to.equal(ver1);
      expect(child1.numParents()).to.equal(0);
      expect(child2.getValue()).to.equal(null);
      expect(child2.getProofHash()).to.equal(null);
      expect(child2.getVersion()).to.equal(ver2);
      expect(child2.numParents()).to.equal(0);
    })

    it("internal node with the same version", () => {
      // Set versions of the state tree.
      setStateTreeVersion(node, ver3);

      const numNodes = deleteStateTreeVersion(node);
      expect(numNodes).to.equal(3);
      // State tree is deleted.
      assert.deepEqual(node.toJsObject(GET_OPTIONS_INCLUDE_ALL), null);
      // And child nodes are deleted as well.
      expect(child1.getValue()).to.equal(null);
      expect(child1.getProofHash()).to.equal(null);
      expect(child1.getVersion()).to.equal(ver3);
      expect(child1.numParents()).to.equal(0);
      expect(child2.getValue()).to.equal(null);
      expect(child2.getProofHash()).to.equal(null);
      expect(child2.getVersion()).to.equal(ver3);
      expect(child2.numParents()).to.equal(0);
    })

    it("internal node with the same version but with non-zero numParents() value", () => {
      // Increase the numParents() value of the root node.
      parent.setChild(nodeLabel, node);

      const numNodes = deleteStateTreeVersion(node);
      expect(numNodes).to.equal(0);
      // State tree is not deleted.
      assert.deepEqual(node.toJsObject(GET_OPTIONS_INCLUDE_ALL), {
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

    it("internal node with the same version but with sub-node of different versions", () => {
      const numNodes = deleteStateTreeVersion(node);
      expect(numNodes).to.equal(3);
      // Root node is deleted.
      assert.deepEqual(node.toJsObject(GET_OPTIONS_INCLUDE_ALL), null);
      // And child nodes are deleted as well.
      expect(child1.getValue()).to.equal(null);
      expect(child1.getProofHash()).to.equal(null);
      expect(child1.getVersion()).to.equal(ver1);
      expect(child1.numParents()).to.equal(0);
      expect(child2.getValue()).to.equal(null);
      expect(child2.getProofHash()).to.equal(null);
      expect(child2.getVersion()).to.equal(ver2);
      expect(child2.numParents()).to.equal(0);
    })

    it("internal node with the same version but with sub-nodes of > 1 numParents() values", () => {
      // Set versions of the state tree.
      setStateTreeVersion(node, ver3);
      node2 = new StateNode('ver99');
      node2.setChild('label1', child1);
      node2.setChild('label2', child2);
      expect(child1.numParents()).to.equal(2);
      expect(child2.numParents()).to.equal(2);

      const numNodes = deleteStateTreeVersion(node);
      expect(numNodes).to.equal(1);
      // State tree is deleted.
      assert.deepEqual(node.toJsObject(GET_OPTIONS_INCLUDE_ALL), null);
      // But child nodes are not deleted.
      expect(child1.getValue()).to.equal('value1');
      expect(child1.getProofHash()).to.not.equal(null);
      expect(child1.getVersion()).to.equal(ver3);
      expect(child1.numParents()).to.equal(1);
      expect(child2.getValue()).to.equal('value2');
      expect(child2.getProofHash()).to.not.equal(null);
      expect(child2.getVersion()).to.equal(ver3);
      expect(child2.numParents()).to.equal(1);
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

  describe("empty nodes removal", () => {
    const label1 = '0x0001';
    const label11 = '0x0011';
    const label111 = '0x0111';
    const label1111 = '0x1111';
    const label12 = '0x0012';
    const label121 = '0x0121';
    let stateTree;
    let child1;
    let child11;
    let child111;
    let child1111;
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

    beforeEach(() => {
      stateTree = StateNode.fromJsObject(jsObject);
      child1 = stateTree.getChild(label1);
      child11 = child1.getChild(label11);
      child111 = child11.getChild(label111);
      child1111 = child111.getChild(label1111);
    });

    it("updateStateInfoForAllRootPaths on empty node with a single root path", () => {
      assert.deepEqual(stateTree.toJsObject(), {
        "0x0001": {
          "0x0011": {
            "0x0111": {
              "0x1111": null
            }
          },
          "0x0012": {
            "0x0121": "V0121"
          }
        }
      });
      const numAffectedNodes = updateStateInfoForAllRootPaths(child111, label1111);
      expect(numAffectedNodes).to.equal(4);
      assert.deepEqual(stateTree.toJsObject(), {
        "0x0001": {
          "0x0012": {
            "0x0121": "V0121"
          }
        }
      });
    });

    it("updateStateInfoForAllRootPaths on empty node with multiple root paths from empty node", () => {
      const child111Clone = child111.clone();
      const child11Clone = new StateNode();
      child11Clone.setChild(label111, child111Clone);
      const child1Clone = new StateNode();
      child1Clone.setChild(label11, child11Clone);
      const stateTreeClone = new StateNode();
      stateTreeClone.setChild(label1, child1Clone);
      const child3 = new StateNode();
      child3.setValue('V0003');
      const label3 = '0x003';
      stateTreeClone.setChild(label3, child3);

      assert.deepEqual(stateTree.toJsObject(), {
        "0x0001": {
          "0x0011": {
            "0x0111": {
              "0x1111": null
            }
          },
          "0x0012": {
            "0x0121": "V0121"
          }
        }
      });
      assert.deepEqual(stateTreeClone.toJsObject(), {
        "0x0001": {
          "0x0011": {
            "0x0111": {
              "0x1111": null
            }
          }
        },
        "0x003": "V0003"
      });
      assert.deepEqual(child1111.getParentNodes(), [child111, child111Clone]);
      const numAffectedNodes = updateStateInfoForAllRootPaths(child111, label1111);
      expect(numAffectedNodes).to.equal(4);
      assert.deepEqual(stateTree.toJsObject(), {
        "0x0001": {
          "0x0012": {
            "0x0121": "V0121"
          }
        }
      });
      assert.deepEqual(stateTreeClone.toJsObject(), {
        "0x0001": {
          "0x0011": {
            "0x0111": {
              "0x1111": null
            }
          }
        },
        "0x003": "V0003"
      });
    });


    it("updateStateInfoForAllRootPaths on empty node with multiple root paths from parent node", () => {
      const child11Clone = child11.clone()
      const child1Clone = new StateNode();
      child1Clone.setChild(label11, child11Clone);
      const stateTreeClone = new StateNode();
      stateTreeClone.setChild(label1, child1Clone);
      const child3 = new StateNode();
      child3.setValue('V0003');
      const label3 = '0x003';
      stateTreeClone.setChild(label3, child3);

      assert.deepEqual(stateTree.toJsObject(), {
        "0x0001": {
          "0x0011": {
            "0x0111": {
              "0x1111": null
            }
          },
          "0x0012": {
            "0x0121": "V0121"
          }
        }
      });
      assert.deepEqual(stateTreeClone.toJsObject(), {
        "0x0001": {
          "0x0011": {
            "0x0111": {
              "0x1111": null
            }
          }
        },
        "0x003": "V0003"
      });
      assert.deepEqual(child111.getParentNodes(), [child11, child11Clone]);
      const numAffectedNodes = updateStateInfoForAllRootPaths(child111, label1111);
      expect(numAffectedNodes).to.equal(7);
      assert.deepEqual(stateTree.toJsObject(), {
        "0x0001": {
          "0x0012": {
            "0x0121": "V0121"
          }
        }
      });
      assert.deepEqual(stateTreeClone.toJsObject(), {
        "0x003": "V0003"
      });
    });

    it("updateStateInfoAllRootPaths on non-empty node", () => {
      assert.deepEqual(stateTree.toJsObject(), {
        "0x0001": {
          "0x0011": {
            "0x0111": {
              "0x1111": null
            }
          },
          "0x0012": {
            "0x0121": "V0121"
          }
        }
      });
      const numAffectedNodes =
          updateStateInfoForAllRootPaths(child11, label111, false);
      expect(numAffectedNodes).to.equal(3);
      assert.deepEqual(stateTree.toJsObject(), {
        "0x0001": {
          "0x0011": {
            "0x0111": {
              "0x1111": null
            }
          },
          "0x0012": {
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
    let stateTree;
    let child1;
    let child11;
    let child111;
    let child1111;
    let child1112;
    let child2;
    let child21;
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

    beforeEach(() => {
      stateTree = StateNode.fromJsObject(jsObject);
      child1 = stateTree.getChild(label1);
      child11 = child1.getChild(label11);
      child111 = child11.getChild(label111);
      child1111 = child111.getChild(label1111);
      child1112 = child111.getChild(label1112);
      child2 = stateTree.getChild(label2);
      child21 = child2.getChild(label21);
    });

    it("updateStateInfoForStateTree", () => {
      const numAffectedNodes = updateStateInfoForStateTree(child1);
      expect(numAffectedNodes).to.equal(5);
      // Checks proof hashes.
      expect(child1111.verifyProofHash()).to.equal(true);
      expect(child1112.verifyProofHash()).to.equal(true);
      expect(child111.verifyProofHash()).to.equal(true);
      expect(child11.verifyProofHash()).to.equal(true);
      expect(child1.verifyProofHash()).to.equal(true);
      expect(child21.verifyProofHash()).to.equal(false);
      expect(child2.verifyProofHash()).to.equal(false);
      expect(stateTree.verifyProofHash()).to.equal(false);
      // Checks tree heights.
      expect(child1111.getTreeHeight()).to.equal(0);
      expect(child1112.getTreeHeight()).to.equal(0);
      expect(child111.getTreeHeight()).to.equal(1);
      expect(child11.getTreeHeight()).to.equal(2);
      expect(child1.getTreeHeight()).to.equal(3);
      expect(child21.getTreeHeight()).to.equal(0);
      expect(child2.getTreeHeight()).to.equal(0);
      expect(stateTree.getTreeHeight()).to.equal(0);
      // Checks tree sizes.
      expect(child1111.getTreeSize()).to.equal(1);
      expect(child1112.getTreeSize()).to.equal(1);
      expect(child111.getTreeSize()).to.equal(3);
      expect(child11.getTreeSize()).to.equal(4);
      expect(child1.getTreeSize()).to.equal(5);
      expect(child21.getTreeSize()).to.equal(0);
      expect(child2.getTreeSize()).to.equal(0);
      expect(stateTree.getTreeSize()).to.equal(0);
      // Checks tree bytes.
      expect(child1111.getTreeBytes()).to.not.equal(0);  // non-zero value
      expect(child1112.getTreeBytes()).to.not.equal(0); // non-zero value
      expect(child111.getTreeBytes()).to.not.equal(0); // non-zero value
      expect(child11.getTreeBytes()).to.not.equal(0); // non-zero value
      expect(child1.getTreeBytes()).to.not.equal(0); // non-zero value
      expect(child21.getTreeBytes()).to.equal(0);
      expect(child2.getTreeBytes()).to.equal(0);
      expect(stateTree.getTreeBytes()).to.equal(0);
    });

    it("updateStateInfoForAllRootPaths with a single root path", () => {
      const numAffectedNodes = updateStateInfoForAllRootPaths(child111, label1112);
      expect(numAffectedNodes).to.equal(4);
      // Checks proof hashes.
      expect(child1111.verifyProofHash()).to.equal(false);
      expect(child1112.verifyProofHash()).to.equal(false);
      expect(child111.verifyProofHash(label1112)).to.equal(true);  // verified
      expect(child11.verifyProofHash()).to.equal(true);  // verified
      expect(child21.verifyProofHash()).to.equal(false);
      expect(child2.verifyProofHash()).to.equal(false);
      expect(child1.verifyProofHash()).to.equal(true);  // verified
      expect(stateTree.verifyProofHash(label1)).to.equal(true);  // verified

      // Checks tree heights.
      expect(child1111.getTreeHeight()).to.equal(0);
      expect(child1112.getTreeHeight()).to.equal(0);
      expect(child111.getTreeHeight()).to.equal(child111.computeTreeHeight());
      expect(child11.getTreeHeight()).to.equal(child11.computeTreeHeight());
      expect(child1.getTreeHeight()).to.equal(child1.computeTreeHeight());
      expect(child21.getTreeHeight()).to.equal(0);
      expect(child2.getTreeHeight()).to.equal(0);
      expect(stateTree.getTreeHeight()).to.equal(stateTree.computeTreeHeight());

      // Checks tree sizes.
      expect(child1111.getTreeSize()).to.equal(0);
      expect(child1112.getTreeSize()).to.equal(0);
      expect(child111.getTreeSize()).to.equal(child111.computeTreeSize());
      expect(child11.getTreeSize()).to.equal(child11.computeTreeSize());
      expect(child1.getTreeSize()).to.equal(child1.computeTreeSize());
      expect(child21.getTreeSize()).to.equal(0);
      expect(child2.getTreeSize()).to.equal(0);
      expect(stateTree.getTreeSize()).to.equal(stateTree.computeTreeSize());

      // Checks tree bytes.
      expect(child1111.getTreeBytes()).to.equal(0);
      expect(child1112.getTreeBytes()).to.equal(0);
      expect(child111.getTreeBytes()).to.equal(child111.computeTreeBytes());
      expect(child11.getTreeBytes()).to.equal(child11.computeTreeBytes());
      expect(child1.getTreeBytes()).to.equal(child1.computeTreeBytes());
      expect(child21.getTreeBytes()).to.equal(0);
      expect(child2.getTreeBytes()).to.equal(0);
      expect(stateTree.getTreeBytes()).to.equal(stateTree.computeTreeBytes());
    });

    it("updateStateInfoForAllRootPaths with multiple root paths", () => {
      const stateTreeClone = stateTree.clone();
      const child1Clone = child1.clone();
      const child11Clone = child11.clone();
      const child111Clone = child111.clone();
      const child2Clone = child2.clone();

      const numAffectedNodes = updateStateInfoForAllRootPaths(child111, label1112);
      expect(numAffectedNodes).to.equal(7);

      // Checks proof hashes.
      expect(child1111.verifyProofHash()).to.equal(false);
      expect(child1112.verifyProofHash()).to.equal(false);  // not verified!!
      expect(child111.verifyProofHash(label1112)).to.equal(true);  // verified
      expect(child111Clone.verifyProofHash(label1112)).to.equal(false);  // not verified!!
      expect(child11.verifyProofHash()).to.equal(true);  // verified
      expect(child11Clone.verifyProofHash()).to.equal(true);  // verified
      expect(child11Clone.getProofHash()).to.equal(child11.getProofHash());
      expect(child1.verifyProofHash()).to.equal(true);  // verified
      expect(child1Clone.verifyProofHash()).to.equal(true);  // verified
      expect(child1Clone.getProofHash()).to.equal(child1.getProofHash());
      expect(child21.verifyProofHash()).to.equal(false);
      expect(child2.verifyProofHash()).to.equal(false);
      expect(child2Clone.verifyProofHash()).to.equal(false);
      expect(stateTree.verifyProofHash(label1)).to.equal(true);  // verified
      expect(stateTreeClone.verifyProofHash(label1)).to.equal(true);  // verified
      expect(stateTreeClone.getProofHash()).to.equal(stateTree.getProofHash());
    });

    it("verifyProofHashForStateTree ", () => {
      updateStateInfoForStateTree(stateTree);
      expect(verifyProofHashForStateTree(stateTree)).to.equal(true);
      child111.setProofHash('new ph');
      expect(verifyProofHashForStateTree(stateTree)).to.equal(false);
    });

    it("getProofOfState", () => {
      updateStateInfoForStateTree(stateTree);
      assert.deepEqual(getProofOfStatePath(stateTree, [label1, label11]), {
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
  });
})