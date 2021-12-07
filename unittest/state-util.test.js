const _ = require('lodash');
const {
  hasEnabledShardConfig,
  isWritablePathWithSharding,
  hasReservedChar,
  hasAllowedPattern,
  isValidServiceName,
  isValidStateLabel,
  isValidPathForStates,
  isValidJsObjectForStates,
  isValidWriteRule,
  isValidStateRule,
  isValidRuleConfig,
  isValidRuleTree,
  isValidFunctionConfig,
  isValidFunctionTree,
  isValidOwnerConfig,
  isValidOwnerTree,
  applyRuleChange,
  applyFunctionChange,
  applyOwnerChange,
  renameStateTreeVersion,
  deleteStateTreeVersion,
  updateStateInfoForAllRootPaths,
  updateStateInfoForStateTree,
  verifyStateInfoForStateTree,
  verifyProofHashForStateTree,
  getStateProofFromStateRoot,
  getProofHashFromStateRoot,
  verifyStateProof,
} = require('../db/state-util');
const { BlockchainParams } = require('../common/constants');
const { GET_OPTIONS_INCLUDE_ALL } = require('./test-util');
const StateNode = require('../db/state-node');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const stateLabelLengthLimit = BlockchainParams.resource.state_label_length_limit;
const variableLabelPrefix = BlockchainParams.genesis.variable_label_prefix;
const hashDelimiter = BlockchainParams.genesis.hash_delimiter;
const stateInfoPrefix = BlockchainParams.genesis.state_info_prefix;

describe("state-util", () => {

  describe("hasEnabledShardConfig", () => {
    it("when input without matched shard config returning false", () => {
      expect(hasEnabledShardConfig(StateNode.fromStateSnapshot(null, hashDelimiter, null, stateInfoPrefix))).to.equal(false);
      expect(hasEnabledShardConfig(StateNode.fromStateSnapshot({}, hashDelimiter, null, stateInfoPrefix))).to.equal(false);
      expect(hasEnabledShardConfig(StateNode.fromStateSnapshot({
        subtree: {
          path: "some value"
        },
        str: "string value"
      }, hashDelimiter))).to.equal(false);
      expect(hasEnabledShardConfig(StateNode.fromStateSnapshot({
        subtree: {
          path: "some value",
          ".shard": {
            sharding_enabled: true
          }
        },
        str: "string value"
      }, hashDelimiter, null, stateInfoPrefix))).to.equal(false);
    })

    it("when input with matched shard config returning false", () => {
      expect(hasEnabledShardConfig(StateNode.fromStateSnapshot({
        subtree: {
          path: "some value",
        },
        str: "string value",
        ".shard": {
          sharding_enabled: false
        }
      }, hashDelimiter, null, stateInfoPrefix
      ))).to.equal(false);
    })

    it("when input with shard config returning true", () => {
      expect(hasEnabledShardConfig(StateNode.fromStateSnapshot({
        subtree: {
          path: "some value",
        },
        str: "string value",
        ".shard": {
          sharding_enabled: true
        }
      }, hashDelimiter, null, stateInfoPrefix
      ))).to.equal(true);
    })
  })

  describe("isWritablePathWithSharding", () => {
    it("when non-writable path with shard config", () => {
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path'],
          StateNode.fromStateSnapshot({
            some: {
              path: {
                ".shard": {
                  sharding_enabled: true
                }
              }
            }
          }, hashDelimiter, null, stateInfoPrefix)), {isValid: false, invalidPath: '/some/path'});
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path'],
          StateNode.fromStateSnapshot({
            some: {
              other_path: true,
              ".shard": {
                sharding_enabled: true
              }
            }
          }, hashDelimiter, null, stateInfoPrefix)), {isValid: false, invalidPath: '/some'});
    })

    it("when writable path without shard config", () => {
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path'],
          StateNode.fromStateSnapshot({
            some: {
              path: true
            }
          }, hashDelimiter, null, stateInfoPrefix)), {isValid: true, invalidPath: ''});
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path'],
          StateNode.fromStateSnapshot({
            some: {
              other_path: true
            }
          }, hashDelimiter, null, stateInfoPrefix)), {isValid: true, invalidPath: ''});
    })

    it("when writable path with shard config", () => {
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path'],
          StateNode.fromStateSnapshot({
            some: {
              path: {
                ".shard": {
                  sharding_enabled: false
                }
              }
            }
          }, hashDelimiter, null, stateInfoPrefix)), {isValid: true, invalidPath: ''});
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path'],
          StateNode.fromStateSnapshot({
            some: {
              other_path: true,
              ".shard": {
                sharding_enabled: false
              }
            }
          }, hashDelimiter, null, stateInfoPrefix)), {isValid: true, invalidPath: ''});
    })

    it("when writable path through shard config", () => {
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path', '.shard', 'sharding_enabled'],
          StateNode.fromStateSnapshot({
            some: {
              path: {
                ".shard": {
                  sharding_enabled: true
                }
              }
            }
          }, hashDelimiter, null, stateInfoPrefix)), {isValid: true, invalidPath: ''});
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path', '.shard', 'proof_hash_map'],
          StateNode.fromStateSnapshot({
            some: {
              path: {
                ".shard": {
                  sharding_enabled: true
                }
              }
            }
          }, hashDelimiter, null, stateInfoPrefix)), {isValid: true, invalidPath: ''});
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
      expect(isValidStateLabel(null, stateLabelLengthLimit)).to.equal(false);
      expect(isValidStateLabel(undefined, stateLabelLengthLimit)).to.equal(false);
      expect(isValidStateLabel(true, stateLabelLengthLimit)).to.equal(false);
      expect(isValidStateLabel(false, stateLabelLengthLimit)).to.equal(false);
      expect(isValidStateLabel(0, stateLabelLengthLimit)).to.equal(false);
      expect(isValidStateLabel([], stateLabelLengthLimit)).to.equal(false);
      expect(isValidStateLabel({}, stateLabelLengthLimit)).to.equal(false);
    })

    it("when string input returning false", () => {
      expect(isValidStateLabel('', stateLabelLengthLimit)).to.equal(false);
      expect(isValidStateLabel('.', stateLabelLengthLimit)).to.equal(false);
      expect(isValidStateLabel('$', stateLabelLengthLimit)).to.equal(false);
      expect(isValidStateLabel('/', stateLabelLengthLimit)).to.equal(false);
      expect(isValidStateLabel("'", stateLabelLengthLimit)).to.equal(false);
      expect(isValidStateLabel('"', stateLabelLengthLimit)).to.equal(false);
      expect(isValidStateLabel('`', stateLabelLengthLimit)).to.equal(false);
    })

    it("when string input returning true", () => {
      expect(isValidStateLabel('a', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('0', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('.a', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('$a', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('*', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('~', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('!', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('@', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('%', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('^', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('&', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('-', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('_', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('=', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('+', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('|', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel(';', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel(',', stateLabelLengthLimit)).to.equal(true);
      expect(isValidStateLabel('?', stateLabelLengthLimit)).to.equal(true);
    })

    it("when long string input", () => {
      const labelLong = 'a'.repeat(stateLabelLengthLimit);
      expect(isValidStateLabel(labelLong, stateLabelLengthLimit)).to.equal(true);
      const labelTooLong = 'a'.repeat(stateLabelLengthLimit + 1);
      expect(isValidStateLabel(labelTooLong, stateLabelLengthLimit)).to.equal(false);
    })
  })

  describe("isValidPathForStates", () => {
    it("when invalid input", () => {
      assert.deepEqual(isValidPathForStates([null], stateLabelLengthLimit), {isValid: false, invalidPath: '/null'});
      assert.deepEqual(
          isValidPathForStates([undefined], stateLabelLengthLimit), {isValid: false, invalidPath: '/undefined'});
      assert.deepEqual(isValidPathForStates([Infinity], stateLabelLengthLimit), {isValid: false, invalidPath: '/null'});
      assert.deepEqual(isValidPathForStates([NaN], stateLabelLengthLimit), {isValid: false, invalidPath: '/null'});
      assert.deepEqual(isValidPathForStates([true], stateLabelLengthLimit), {isValid: false, invalidPath: '/true'});
      assert.deepEqual(isValidPathForStates([false], stateLabelLengthLimit), {isValid: false, invalidPath: '/false'});
      assert.deepEqual(isValidPathForStates([0], stateLabelLengthLimit), {isValid: false, invalidPath: '/0'});
      assert.deepEqual(isValidPathForStates([''], stateLabelLengthLimit), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidPathForStates(['', '', ''], stateLabelLengthLimit), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidPathForStates([{}], stateLabelLengthLimit), {isValid: false, invalidPath: '/{}'});
      assert.deepEqual(
          isValidPathForStates([{a: 'A'}], stateLabelLengthLimit), {isValid: false, invalidPath: '/{"a":"A"}'});
      assert.deepEqual(isValidPathForStates([[]], stateLabelLengthLimit), {isValid: false, invalidPath: '/[]'});
      assert.deepEqual(isValidPathForStates([['a']], stateLabelLengthLimit), {isValid: false, invalidPath: '/["a"]'});
      assert.deepEqual(isValidPathForStates(['a', '/'], stateLabelLengthLimit), {isValid: false, invalidPath: '/a//'});
      assert.deepEqual(isValidPathForStates(['a', '.'], stateLabelLengthLimit), {isValid: false, invalidPath: '/a/.'});
      assert.deepEqual(isValidPathForStates(['a', '$'], stateLabelLengthLimit), {isValid: false, invalidPath: '/a/$'});
      assert.deepEqual(isValidPathForStates(['a', '*b'], stateLabelLengthLimit), {isValid: false, invalidPath: '/a/*b'});
      assert.deepEqual(isValidPathForStates(['a', 'b*'], stateLabelLengthLimit), {isValid: false, invalidPath: '/a/b*'});
      assert.deepEqual(isValidPathForStates(['a', '#'], stateLabelLengthLimit), {isValid: false, invalidPath: '/a/#'});
      assert.deepEqual(isValidPathForStates(['a', '{'], stateLabelLengthLimit), {isValid: false, invalidPath: '/a/{'});
      assert.deepEqual(isValidPathForStates(['a', '}'], stateLabelLengthLimit), {isValid: false, invalidPath: '/a/}'});
      assert.deepEqual(isValidPathForStates(['a', '['], stateLabelLengthLimit), {isValid: false, invalidPath: '/a/['});
      assert.deepEqual(isValidPathForStates(['a', ']'], stateLabelLengthLimit), {isValid: false, invalidPath: '/a/]'});
      assert.deepEqual(
          isValidPathForStates(['a', '\x00'], stateLabelLengthLimit), {isValid: false, invalidPath: '/a/\x00'});
      assert.deepEqual(
          isValidPathForStates(['a', '\x1F'], stateLabelLengthLimit), {isValid: false, invalidPath: '/a/\x1F'});
      assert.deepEqual(
          isValidPathForStates(['a', '\x7F'], stateLabelLengthLimit), {isValid: false, invalidPath: '/a/\x7F'});
    })

    it("when valid input", () => {
      assert.deepEqual(isValidPathForStates(['a', 'b', 'c'], stateLabelLengthLimit), {isValid: true, invalidPath: ''});
      assert.deepEqual(
          isValidPathForStates(['0', 'true', 'false'], stateLabelLengthLimit), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidPathForStates(['a', '.b'], stateLabelLengthLimit), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidPathForStates(['a', '$b'], stateLabelLengthLimit), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidPathForStates(['a', '*'], stateLabelLengthLimit), {isValid: true, invalidPath: ''});
    })

    it("when input with long labels", () => {
      const labelLong = 'a'.repeat(stateLabelLengthLimit);
      const labelTooLong = 'a'.repeat(stateLabelLengthLimit + 1);
      assert.deepEqual(
          isValidPathForStates([labelLong, labelLong], stateLabelLengthLimit), {isValid: true, invalidPath: ''});
      assert.deepEqual(
          isValidPathForStates([labelTooLong, labelLong], stateLabelLengthLimit),
          {isValid: false, invalidPath: `/${labelTooLong}`});
      assert.deepEqual(
          isValidPathForStates([labelLong, labelTooLong], stateLabelLengthLimit),
          {isValid: false, invalidPath: `/${labelLong}/${labelTooLong}`});
    })
  })

  describe("isValidJsObjectForStates", () => {
    it("when invalid input", () => {
      assert.deepEqual(isValidJsObjectForStates(undefined, stateLabelLengthLimit), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidJsObjectForStates({}, stateLabelLengthLimit), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidJsObjectForStates([], stateLabelLengthLimit), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidJsObjectForStates([1, 2, 3], stateLabelLengthLimit), {isValid: false, invalidPath: '/'});
      assert.deepEqual(
          isValidJsObjectForStates(['a', 'b', 'c'], stateLabelLengthLimit), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidJsObjectForStates({
        undef: undefined
      }, stateLabelLengthLimit), {isValid: false, invalidPath: '/undef'});
      assert.deepEqual(
        isValidJsObjectForStates({
        empty_obj: {}
      }, stateLabelLengthLimit), {isValid: false, invalidPath: '/empty_obj'});
      assert.deepEqual(
        isValidJsObjectForStates({
        array: []
      }, stateLabelLengthLimit), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(
        isValidJsObjectForStates({
        array: [1, 2, 3]
      }, stateLabelLengthLimit), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(
        isValidJsObjectForStates({
        array: ['a', 'b', 'c']
      }, stateLabelLengthLimit), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(
        isValidJsObjectForStates({
          'a': {
            '.': 'x'
          }
      }, stateLabelLengthLimit), {isValid: false, invalidPath: '/a/.'});
      assert.deepEqual(
        isValidJsObjectForStates({
          'a': {
            '$': 'x'
          }
      }, stateLabelLengthLimit), {isValid: false, invalidPath: '/a/$'});
      assert.deepEqual(
        isValidJsObjectForStates({
          'a': {
            '*b': 'x'
          }
      }, stateLabelLengthLimit), {isValid: false, invalidPath: '/a/*b'});
      assert.deepEqual(
        isValidJsObjectForStates({
          'a': {
            'b*': 'x'
          }
      }, stateLabelLengthLimit), {isValid: false, invalidPath: '/a/b*'});
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
      }, stateLabelLengthLimit), {isValid: false, invalidPath: '/internal1/internal2b/internal3b/undef'});
    })

    it("when valid input", () => {
      // leaf nodes
      assert.deepEqual(isValidJsObjectForStates(10, stateLabelLengthLimit), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidJsObjectForStates("str", stateLabelLengthLimit), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidJsObjectForStates(null, stateLabelLengthLimit), {isValid: true, invalidPath: ''});

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
      }, stateLabelLengthLimit), {isValid: true, invalidPath: ''});
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
      }, stateLabelLengthLimit), {isValid: true, invalidPath: ''});
      assert.deepEqual(
        isValidJsObjectForStates({
          'a': {
            '.b': 'x'
          }
      }, stateLabelLengthLimit), {isValid: true, invalidPath: ''});
      assert.deepEqual(
        isValidJsObjectForStates({
          'a': {
            '$b': 'x'
          }
      }, stateLabelLengthLimit), {isValid: true, invalidPath: ''});
      assert.deepEqual(
        isValidJsObjectForStates({
          'a': {
            '*': 'x'
          }
      }, stateLabelLengthLimit), {isValid: true, invalidPath: ''});
    })

    it("when input with long labels", () => {
      const textLong = 'a'.repeat(stateLabelLengthLimit);
      const textTooLong = 'a'.repeat(stateLabelLengthLimit + 1);
      assert.deepEqual(
        isValidJsObjectForStates({
          [textLong]: {
            [textLong]: textTooLong
          }
      }, stateLabelLengthLimit), {isValid: true, invalidPath: ''});
      assert.deepEqual(
        isValidJsObjectForStates({
          [textTooLong]: {
            [textLong]: textTooLong
          }
      }, stateLabelLengthLimit), {isValid: false, invalidPath: `/${textTooLong}`});
      assert.deepEqual(
        isValidJsObjectForStates({
          [textLong]: {
            [textTooLong]: textTooLong
          }
      }, stateLabelLengthLimit), {isValid: false, invalidPath: `/${textLong}/${textTooLong}`});
    })
  })

  describe("isValidWriteRule", () => {
    it('when invalid input', () => {
      expect(isValidWriteRule([], undefined, variableLabelPrefix)).to.equal(false);
      expect(isValidWriteRule([], {}, variableLabelPrefix)).to.equal(false);
      expect(isValidWriteRule([], [], variableLabelPrefix)).to.equal(false);
      expect(isValidWriteRule([], [1, 2, 3], variableLabelPrefix)).to.equal(false);
      expect(isValidWriteRule([], 0, variableLabelPrefix)).to.equal(false);
      expect(isValidWriteRule([], 1, variableLabelPrefix)).to.equal(false);
      expect(isValidStateRule([], { "invalid_top_level_token": true }, variableLabelPrefix)).to.equal(false);
      expect(isValidWriteRule([], 'process.exit(0)', variableLabelPrefix)).to.equal(false);
      // assignment
      expect(isValidWriteRule([], "newData = 'some code'", variableLabelPrefix)).to.equal(false);
      // assignment & invoke
      expect(isValidWriteRule([], "newData = 'some code'; newData();", variableLabelPrefix)).to.equal(false);
    })

    it('when valid input', () => {
      expect(isValidWriteRule([], null, variableLabelPrefix)).to.equal(true);
      expect(isValidWriteRule([], true, variableLabelPrefix)).to.equal(true);
      expect(isValidWriteRule([], false, variableLabelPrefix)).to.equal(true);
      // with whitelisted id tokens
      expect(isValidWriteRule([], "data", variableLabelPrefix)).to.equal(true);
      expect(isValidWriteRule([], "newData", variableLabelPrefix)).to.equal(true);
      expect(isValidWriteRule([], "currentTime", variableLabelPrefix)).to.equal(true);
      expect(isValidWriteRule([], "lastBlockNumber", variableLabelPrefix)).to.equal(true);
      expect(isValidWriteRule([], "auth.fid == '_stake'", variableLabelPrefix)).to.equal(true);
      expect(isValidWriteRule([], "auth.fid === '_stake'", variableLabelPrefix)).to.equal(true);
      expect(isValidWriteRule([], "auth.addr === 'some addr'", variableLabelPrefix)).to.equal(true);
      expect(isValidWriteRule([], "newData.proposer === auth.addr", variableLabelPrefix)).to.equal(true);
      expect(isValidWriteRule([], "getValue('some path')", variableLabelPrefix)).to.equal(true);
      expect(isValidWriteRule([], "Number('some string')", variableLabelPrefix)).to.equal(true);
      // with RuleUtil class properties
      expect(isValidWriteRule([], "util.isBool('some expr')", variableLabelPrefix)).to.equal(true);
      expect(isValidWriteRule([], "util.isServAcntName('some name')", variableLabelPrefix)).to.equal(true);
      // with varilable labels
      expect(isValidWriteRule(
          ['transfer', '$from', '$to', '$key', 'value'],
          "!getValue('transfer/' + $from + '/' + $to + '/' + $key)", variableLabelPrefix)).to.equal(true);
      // mixed
      expect(isValidWriteRule(
          ['transfer', '$from', '$to', '$key', 'value'],
          "(auth.addr === $from || auth.fid === '_stake') && !getValue('transfer/' + $from + '/' + $to + '/' + $key) && util.isServAcntName($from)", variableLabelPrefix))
          .to.equal(true);
    })
  })

  describe("isValidStateRule", () => {
    it('when invalid input', () => {
      expect(isValidStateRule(undefined)).to.equal(false);
      expect(isValidStateRule({})).to.equal(false);
      expect(isValidStateRule([])).to.equal(false);
      expect(isValidStateRule([1, 2, 3])).to.equal(false);
      expect(isValidStateRule(0)).to.equal(false);
      expect(isValidStateRule(true)).to.equal(false);
      expect(isValidStateRule(false)).to.equal(false);
      expect(isValidStateRule({ "invalid_field": true })).to.equal(false);
      expect(isValidStateRule({
        "max_children": '123'
      })).to.equal(false);
      expect(isValidStateRule({
        "max_children": -1
      })).to.equal(false);
      expect(isValidStateRule({
        "max_children": 0
      })).to.equal(false);
      expect(isValidStateRule({
        "gc_max_siblings": ''
      })).to.equal(false);
      expect(isValidStateRule({
        "gc_max_siblings": -1
      })).to.equal(false);
      expect(isValidStateRule({
        "gc_max_siblings": 0
      })).to.equal(false);
      expect(isValidStateRule({
        "max_children": 10,
        "gc_max_siblings": -1
      })).to.equal(false);
    })

    it('when valid input', () => {
      expect(isValidStateRule({
        "max_children": 10
      })).to.equal(true);
      expect(isValidStateRule({
        "gc_max_siblings": 1
      })).to.equal(true);
      expect(isValidStateRule({
        "max_children": 10,
        "gc_max_siblings": 2
      })).to.equal(true);
    })
  })

  describe("isValidRuleConfig", () => {
    it("when invalid input", () => {
      assert.deepEqual(isValidRuleConfig([], null, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([], undefined, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([], {}, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([], [], variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([], [1, 2, 3], variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(
          isValidRuleConfig([], ['a', 'b', 'c'], variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([], {
        undef: undefined 
      }, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([], {
        empty_obj: {}
      }, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([], {
        array: []
      }, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([], {
        array: [1, 2, 3]
      }, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([], {
        array: ['a', 'b', 'c']
      }, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([], {
        'a': {
          '.': 'x'
        }
      }, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([], {
        'a': {
          '$': 'x'
        }
      }, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([], {
        'a': {
          '*b': 'x'
        }
      }, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([], {
        'a': {
          'b*': 'x'
        }
      }, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleConfig([], {
        "state": {
          "max_children": 123,
          "invalid_field": true
        }
      }, variableLabelPrefix), {isValid: false, invalidPath: '/'});
    })

    it("when valid input", () => {
      assert.deepEqual(isValidRuleConfig([], { "write": true }, variableLabelPrefix), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidRuleConfig([], { "write": false }, variableLabelPrefix), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidRuleConfig([], { "write": "auth.addr === 'abcd'" }, variableLabelPrefix), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidRuleConfig(['transfer', '$from', '$to', '$key', 'value'], {
        "write": "(auth.addr === $from || auth.fid === '_stake' || auth.fid === '_unstake' || auth.fid === '_pay' || auth.fid === '_claim' || auth.fid === '_hold' || auth.fid === '_release' || auth.fid === '_collectFee' || auth.fid === '_distributeFee') && !getValue('transfer/' + $from + '/' + $to + '/' + $key) && (util.isServAcntName($from) || util.isCksumAddr($from)) && (util.isServAcntName($to) || util.isCksumAddr($to)) && $from !== $to && util.isNumber(newData) && getValue(util.getBalancePath($from)) >= newData"
      }, variableLabelPrefix), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidRuleConfig([], {
        "state": {
          "max_children": 1
        }
      }, variableLabelPrefix), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidRuleConfig([], {
        "state": {
          "gc_max_siblings": 1
        }
      }, variableLabelPrefix), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidRuleConfig([], {
        "write": "auth.addr === 'abcd'",
        "state": {
          "max_children": 1,
          "gc_max_siblings": 1
        }
      }, variableLabelPrefix), {isValid: true, invalidPath: ''});
    })
  })

  describe("isValidRuleTree", () => {
    it("when invalid input", () => {
      assert.deepEqual(isValidRuleTree([], undefined, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleTree([], {}, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleTree([], [], variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleTree([], [1, 2, 3], variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(
          isValidRuleTree([], ['a', 'b', 'c'], variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidRuleTree([], {
        undef: undefined 
      }, variableLabelPrefix), {isValid: false, invalidPath: '/undef'});
      assert.deepEqual(isValidRuleTree([], {
        empty_obj: {}
      }, variableLabelPrefix), {isValid: false, invalidPath: '/empty_obj'});
      assert.deepEqual(isValidRuleTree([], {
        array: []
      }, variableLabelPrefix), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidRuleTree([], {
        array: [1, 2, 3]
      }, variableLabelPrefix), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidRuleTree([], {
        array: ['a', 'b', 'c']
      }, variableLabelPrefix), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidRuleTree([], {
        some_key: {}
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_key'});
      assert.deepEqual(isValidRuleTree([], {
        some_key: null
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_key'});
      assert.deepEqual(isValidRuleTree([], {
        some_key: undefined
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_key'});
    })

    it("when invalid input with invalid rule config", () => {
      assert.deepEqual(isValidRuleTree([], {
        some_path: {
          '.rule': {
            'write': {}
          }
        }
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_path/.rule/write'});
      assert.deepEqual(isValidRuleTree([], {
        some_path: {
          '.rule': {
            'write': undefined
          }
        }
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_path/.rule'});
    })

    it("when valid input", () => {
      assert.deepEqual(isValidRuleTree([], null, variableLabelPrefix), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidRuleTree([], {
        '.rule': {
          'write': true 
        }
      }, variableLabelPrefix), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidRuleTree([], {
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
      }, variableLabelPrefix), {isValid: true, invalidPath: ''});
      // with variable label
      assert.deepEqual(isValidRuleTree(['$var_label1'], {
        ['$var_label2']: {
          '.rule': {
            'write': "$var_label1 === 'name1' && $var_label2 === 'name2'"
          }
        }
      }, variableLabelPrefix), {isValid: true, invalidPath: ''});
    })
  })

  describe("isValidFunctionConfig", () => {
    it("when invalid input", () => {
      assert.deepEqual(isValidFunctionConfig([], null), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionConfig([], undefined), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionConfig([], {}), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionConfig([], []), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionConfig([], [1, 2, 3]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(
          isValidFunctionConfig([], ['a', 'b', 'c']), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionConfig([], {
        undef: undefined 
      }), {isValid: false, invalidPath: '/undef'});
      assert.deepEqual(isValidFunctionConfig([], {
        empty_obj: {}
      }), {isValid: false, invalidPath: '/empty_obj'});
      assert.deepEqual(isValidFunctionConfig([], {
        array: []
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidFunctionConfig([], {
        array: [1, 2, 3]
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidFunctionConfig([], {
        array: ['a', 'b', 'c']
      }), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidFunctionConfig([], {
        'a': {
          '.': 'x'
        }
      }), {isValid: false, invalidPath: '/a'});
      assert.deepEqual(isValidFunctionConfig([], {
        'a': {
          '$': 'x'
        }
      }), {isValid: false, invalidPath: '/a'});
      assert.deepEqual(isValidFunctionConfig([], {
        'a': {
          '*b': 'x'
        }
      }), {isValid: false, invalidPath: '/a'});
      assert.deepEqual(isValidFunctionConfig([], {
        'a': {
          'b*': 'x'
        }
      }), {isValid: false, invalidPath: '/a'});
    })

    it("when invalid input with deeper path", () => {
      assert.deepEqual(isValidFunctionConfig([], {
        a_fid: {}
      }), {isValid: false, invalidPath: '/a_fid'});
      assert.deepEqual(isValidFunctionConfig([], {
        a_fid: 'some string'
      }), {isValid: false, invalidPath: '/a_fid'});
    })

    it("when invalid input with NATIVE type", () => {
      assert.deepEqual(isValidFunctionConfig([], {
        "_transfer": {
          // Missing function_type
          "function_id": "_transfer"
        }
      }), {isValid: false, invalidPath: '/_transfer'});
      assert.deepEqual(isValidFunctionConfig([], {
        "_transfer": {
          "function_type": "NATIVE",
          // Missing function_id
        }
      }), {isValid: false, invalidPath: '/_transfer'});
      assert.deepEqual(isValidFunctionConfig([], {
        "_transfer": {
          "function_type": "NATIVE",
          "function_id": "_transfer",
          "unknown_property": "some value"  // Unknown property
        }
      }), {isValid: false, invalidPath: '/_transfer'});
      assert.deepEqual(isValidFunctionConfig([], {
        "_transfer": {
          "function_type": "unknown type",  // Unknown function_type
          "function_id": "_transfer"
        }
      }), {isValid: false, invalidPath: '/_transfer'});
      assert.deepEqual(isValidFunctionConfig([], {
        "_transfer": {
          "function_type": "NATIVE",
          "function_id": "some other fid"  // Wrong function_id
        }
      }), {isValid: false, invalidPath: '/_transfer/function_id'});
    })

    it("when invalid input with REST type", () => {
      assert.deepEqual(isValidFunctionConfig([], {
        "0x11111": {
          // Missing function_type
          "function_id": "0x11111",
          "function_url": "https://events.ainetwork.ai/trigger",
        }
      }), {isValid: false, invalidPath: '/0x11111'});
      assert.deepEqual(isValidFunctionConfig([], {
        "0x11111": {
          "function_type": "REST",
          // Missing function_id
          "function_url": "https://events.ainetwork.ai/trigger",
        }
      }), {isValid: false, invalidPath: '/0x11111'});
      assert.deepEqual(isValidFunctionConfig([], {
        "0x11111": {
          "function_type": "REST",
          "function_id": "0x11111",
          // Missing function_url
        }
      }), {isValid: false, invalidPath: '/0x11111'});
      assert.deepEqual(isValidFunctionConfig([], {
        "0x11111": {
          "function_type": "REST",
          "function_id": "0x11111",
          "function_url": "https://events.ainetwork.ai/trigger",
          "unknown_property": "some value"  // Unknown property
        }
      }), {isValid: false, invalidPath: '/0x11111'});
      assert.deepEqual(isValidFunctionConfig([], {
        "0x11111": {
          "function_type": "REST",
          "function_id": "some other fid",  // Wrong function_id
          "function_url": "https://events.ainetwork.ai/trigger",
        }
      }), {isValid: false, invalidPath: '/0x11111/function_id'});
      assert.deepEqual(isValidFunctionConfig([], {
        "0x11111": {
          "function_type": "REST",
          "function_id": "0x11111",
          "function_url": "some non-url value",  // Invalid url
        }
      }), {isValid: false, invalidPath: '/0x11111'});
    })

    it("when valid input", () => {
      assert.deepEqual(isValidFunctionConfig([], {
        "_transfer": {
          "function_type": "NATIVE",
          "function_id": "_transfer",
        },
        "0x11111": {
          "function_type": "REST",
          "function_id": "0x11111",
          "function_url": "https://events.ainetwork.ai/trigger",
        },
        "fid_to_delete": null  // To be deleted
      }), {isValid: true, invalidPath: ''});
    })
  })

  describe("isValidFunctionTree", () => {
    it("when invalid input", () => {
      assert.deepEqual(isValidFunctionTree([], undefined, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionTree([], {}, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionTree([], [], variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionTree([], [1, 2, 3], variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(
          isValidFunctionTree([], ['a', 'b', 'c'], variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidFunctionTree([], {
        undef: undefined 
      }, variableLabelPrefix), {isValid: false, invalidPath: '/undef'});
      assert.deepEqual(isValidFunctionTree([], {
        empty_obj: {}
      }, variableLabelPrefix), {isValid: false, invalidPath: '/empty_obj'});
      assert.deepEqual(isValidFunctionTree([], {
        array: []
      }, variableLabelPrefix), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidFunctionTree([], {
        array: [1, 2, 3]
      }, variableLabelPrefix), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidFunctionTree([], {
        array: ['a', 'b', 'c']
      }, variableLabelPrefix), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidFunctionTree([], {
        some_key: {}
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_key'});
      assert.deepEqual(isValidFunctionTree([], {
        some_key: null
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_key'});
      assert.deepEqual(isValidFunctionTree([], {
        some_key: undefined
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_key'});
    })

    it("when invalid input with invalid owner config", () => {
      assert.deepEqual(isValidFunctionTree([], {
        some_path: {
          '.function': {
          }
        }
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_path/.function'});
      assert.deepEqual(isValidFunctionTree([], {
        some_path: {
          '.function': null 
        }
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_path/.function'});
      assert.deepEqual(isValidFunctionTree([], {
        some_path: {
          '.function': undefined
        }
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_path/.function'});
    })

    it("when valid input", () => {
      assert.deepEqual(isValidFunctionTree([], null, variableLabelPrefix), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidFunctionTree([], {
        '.function': {
          "_transfer": {
            "function_type": "NATIVE",
            "function_id": "_transfer",
          },
          "0x11111": {
            "function_type": "REST",
            "function_id": "0x11111",
            "function_url": "https://events.ainetwork.ai/trigger",
          }
        }
      }, variableLabelPrefix), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidFunctionTree([], {
        some_path1: {
          '.function': {
            "_transfer": {
              "function_type": "NATIVE",
              "function_id": "_transfer",
            },
            "0x11111": {
              "function_type": "REST",
              "function_id": "0x11111",
              "function_url": "https://events.ainetwork.ai/trigger",
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
              "function_url": "https://events.ainetwork.ai/trigger",
            }
          }
        }
      }, variableLabelPrefix), {isValid: true, invalidPath: ''});
    })
  })

  describe("isValidOwnerConfig", () => {
    it("when invalid input", () => {
      assert.deepEqual(isValidOwnerConfig([], null), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([], undefined), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([], {}), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([], []), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([], [1, 2, 3]), {isValid: false, invalidPath: '/'});
      assert.deepEqual(
          isValidOwnerConfig([], ['a', 'b', 'c']), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([], {
        undef: undefined 
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([], {
        empty_obj: {}
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([], {
        array: []
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([], {
        array: [1, 2, 3]
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([], {
        array: ['a', 'b', 'c']
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([], {
        'a': {
          '.': 'x'
        }
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([], {
        'a': {
          '$': 'x'
        }
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([], {
        'a': {
          '*b': 'x'
        }
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([], {
        'a': {
          'b*': 'x'
        }
      }), {isValid: false, invalidPath: '/'});
    })

    it("when invalid input with deeper path", () => {
      assert.deepEqual(isValidOwnerConfig([], {
        some_key: {}
      }), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerConfig([], {
        'owners': null
      }), {isValid: false, invalidPath: '/owners'});
      assert.deepEqual(isValidOwnerConfig([], {
        'owners': {}
      }), {isValid: false, invalidPath: '/owners'});
    })

    it("when invalid input with invalid owner (address or fid)", () => {
      assert.deepEqual(isValidOwnerConfig([], {
        'owners': {
          '0x0': {  // Invalid address
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            "write_rule": true,
          }
        }
      }), {isValid: false, invalidPath: '/owners/0x0'});
      assert.deepEqual(isValidOwnerConfig([], {
        'owners': {
          '0x09a0d53fdf1c36a131938eb379b98910e55eefe1': {  // Non-checksum address
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            "write_rule": true,
          }
        }
      }), {isValid: false, invalidPath: '/owners/0x09a0d53fdf1c36a131938eb379b98910e55eefe1'});
      assert.deepEqual(isValidOwnerConfig([], {
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
      assert.deepEqual(isValidOwnerConfig([], {
        'owners': {
          '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1': {
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            // Missing write_rule
          },
        }
      }), {isValid: false, invalidPath: '/owners/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1'});
      assert.deepEqual(isValidOwnerConfig([], {
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
      assert.deepEqual(isValidOwnerConfig([], {
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
      assert.deepEqual(isValidOwnerConfig([], {
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
      assert.deepEqual(isValidOwnerTree([], undefined, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerTree([], {}, variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerTree([], [], variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerTree([], [1, 2, 3], variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(
          isValidOwnerTree([], ['a', 'b', 'c'], variableLabelPrefix), {isValid: false, invalidPath: '/'});
      assert.deepEqual(isValidOwnerTree([], {
        undef: undefined 
      }, variableLabelPrefix), {isValid: false, invalidPath: '/undef'});
      assert.deepEqual(isValidOwnerTree([], {
        empty_obj: {}
      }, variableLabelPrefix), {isValid: false, invalidPath: '/empty_obj'});
      assert.deepEqual(isValidOwnerTree([], {
        array: []
      }, variableLabelPrefix), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidOwnerTree([], {
        array: [1, 2, 3]
      }, variableLabelPrefix), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidOwnerTree([], {
        array: ['a', 'b', 'c']
      }, variableLabelPrefix), {isValid: false, invalidPath: '/array'});
      assert.deepEqual(isValidOwnerTree([], {
        some_key: {}
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_key'});
      assert.deepEqual(isValidOwnerTree([], {
        some_key: null
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_key'});
      assert.deepEqual(isValidOwnerTree([], {
        some_key: undefined
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_key'});
    })

    it("when invalid input with invalid owner config", () => {
      assert.deepEqual(isValidOwnerTree([], {
        some_path: {
          '.owner': {
          }
        }
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_path/.owner'});
      assert.deepEqual(isValidOwnerTree([], {
        some_path: {
          '.owner': null 
        }
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_path/.owner'});
      assert.deepEqual(isValidOwnerTree([], {
        some_path: {
          '.owner': undefined
        }
      }, variableLabelPrefix), {isValid: false, invalidPath: '/some_path/.owner'});
    })

    it("when valid input", () => {
      assert.deepEqual(isValidOwnerTree([], null, variableLabelPrefix), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidOwnerTree([], {
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
      }, variableLabelPrefix), {isValid: true, invalidPath: ''});
      assert.deepEqual(isValidOwnerTree([], {
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
      }, variableLabelPrefix), {isValid: true, invalidPath: ''});
    })
  })

  describe("applyRuleChange()", () => {
    const curRule = {
      ".rule": {
        "write": "auth.addr === 'abcd'",
        "state": {
          "max_children": 10,
          "ordering": "FIFO"
        }
      },
      "deeper": {
        ".rule": {  // deeper rule
          "write": true,
          "state": {
            "max_children": 10,
            "ordering": "FIFO"
          }
        }
      }
    };

    it("add / delete / modify non-existing rule", () => {
      assert.deepEqual(applyRuleChange(null, curRule), curRule); // the same as the given rule change.
    });

    it("delete / modify existing rule", () => {
      assert.deepEqual(applyRuleChange(curRule, {
        ".rule": {
          "write": null,  // delete
          "state": {  // modify
            "max_children": 100,
            "ordering": "FIFO"
          }
        }
      }), {
        ".rule": {
          // write: deleted
          "state": {  // modified
            "max_children": 100,
            "ordering": "FIFO"
          }
        }
        // deeper rule deleted
      });

      assert.deepEqual(applyRuleChange({
        ".rule": {
          "write": true
        }
      }, {
        ".rule": {
          "state": { // add
            "max_children": 10,
            "ordering": "FIFO"
          }
        }
      }), {
        ".rule": {
          "write": true,
          "state": { // added
            "max_children": 10,
            "ordering": "FIFO"
          }
        }
      });
    });

    it("replace existing rule with deeper rule", () => {
      assert.deepEqual(applyRuleChange(curRule, {
        ".rule": {
          "write": "auth.addr === 'efgh'", // modify
          "state": null // delete
        },
        "deeper": {
          ".rule": { // deeper function
            "write": false
          }
        }
      }), {
        ".rule": {
          "write": "auth.addr === 'efgh'", // modified
          "state": null // deleted
        },
        "deeper": {
          ".rule": { // replaced
            "write": false
          }
        }
      });
    });

    it("with null rule change", () => {
      assert.deepEqual(applyRuleChange(curRule, null), null);
    });
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

  describe("renameStateTreeVersion", () => {
    it("leaf node w/ no version match", () => {
      const ver1 = 'ver1';
      const ver2 = 'ver2';

      const stateNode = StateNode.fromStateSnapshot(true, hashDelimiter, ver1, stateInfoPrefix);

      const numRenamed = renameStateTreeVersion(stateNode, 'other version', ver2);
      expect(numRenamed).to.equal(0);
      expect(stateNode.getVersion()).to.equal(ver1);
    })

    it("leaf node w/ version match", () => {
      const ver1 = 'ver1';
      const ver2 = 'ver2';

      const stateNode = StateNode.fromStateSnapshot(true, hashDelimiter, ver1, stateInfoPrefix);

      const numRenamed = renameStateTreeVersion(stateNode, ver1, ver2);
      expect(numRenamed).to.equal(1);
      expect(stateNode.getVersion()).to.equal(ver2);
    })

    it("internal node", () => {
      const ver1 = 'ver1';
      const ver2 = 'ver2';
      const ver3 = 'ver3';

      const grandChild11 = new StateNode(hashDelimiter, ver1);
      const grandChild12 = new StateNode(hashDelimiter, ver2);
      const grandChild21 = new StateNode(hashDelimiter, ver2);
      const grandChild22 = new StateNode(hashDelimiter, ver1);
      grandChild11.setValue('value11');
      grandChild12.setValue('value12');
      grandChild21.setValue('value21');
      grandChild22.setValue('value22');
      const child1 = new StateNode(hashDelimiter, ver2);
      child1.setChild('label11', grandChild11);
      child1.setChild('label12', grandChild12);
      const child2 = new StateNode(hashDelimiter, ver2);
      child2.setChild('label21', grandChild21);
      child2.setChild('label22', grandChild22);
      const stateTree = new StateNode(hashDelimiter, ver3);
      stateTree.setChild('label1', child1);
      stateTree.setChild('label2', child2);
      assert.deepEqual(stateTree.toStateSnapshot(GET_OPTIONS_INCLUDE_ALL), {
        "#num_parents": 0,
        "#state_ph": null,
        "#tree_bytes": 0,
        "#tree_height": 0,
        "#tree_size": 0,
        "#version": "ver3",
        "label1": {
          "#num_parents": 1,
          "#num_parents:label11": 1,
          "#num_parents:label12": 1,
          "#state_ph": null,
          "#state_ph:label11": null,
          "#state_ph:label12": null,
          "#tree_bytes": 0,
          "#tree_bytes:label11": 0,
          "#tree_bytes:label12": 0,
          "#tree_height": 0,
          "#tree_height:label11": 0,
          "#tree_height:label12": 0,
          "#tree_size": 0,
          "#tree_size:label11": 0,
          "#tree_size:label12": 0,
          "#version": "ver2",
          "#version:label11": "ver1",
          "#version:label12": "ver2",
          "label11": "value11",
          "label12": "value12",
        },
        "label2": {
          "#num_parents": 1,
          "#num_parents:label21": 1,
          "#num_parents:label22": 1,
          "#state_ph": null,
          "#state_ph:label21": null,
          "#state_ph:label22": null,
          "#tree_bytes": 0,
          "#tree_bytes:label21": 0,
          "#tree_bytes:label22": 0,
          "#tree_height": 0,
          "#tree_height:label21": 0,
          "#tree_height:label22": 0,
          "#tree_size": 0,
          "#tree_size:label21": 0,
          "#tree_size:label22": 0,
          "#version": "ver2",
          "#version:label21": "ver2",
          "#version:label22": "ver1",
          "label21": "value21",
          "label22": "value22",
        }
      });

      const numNodes = renameStateTreeVersion(stateTree, ver2, ver3);
      expect(numNodes).to.equal(4);
      assert.deepEqual(stateTree.toStateSnapshot(GET_OPTIONS_INCLUDE_ALL), {
        "#num_parents": 0,
        "#state_ph": null,
        "#tree_bytes": 0,
        "#tree_height": 0,
        "#tree_size": 0,
        "#version": "ver3",
        "label1": {
          "#num_parents": 1,
          "#num_parents:label11": 1,
          "#num_parents:label12": 1,
          "#state_ph": null,
          "#state_ph:label11": null,
          "#state_ph:label12": null,
          "#tree_bytes": 0,
          "#tree_bytes:label11": 0,
          "#tree_bytes:label12": 0,
          "#tree_height": 0,
          "#tree_height:label11": 0,
          "#tree_height:label12": 0,
          "#tree_size": 0,
          "#tree_size:label11": 0,
          "#tree_size:label12": 0,
          "#version": "ver3",
          "#version:label11": "ver1",
          "#version:label12": "ver3",
          "label11": "value11",
          "label12": "value12",
        },
        "label2": {
          "#num_parents": 1,
          "#num_parents:label21": 1,
          "#num_parents:label22": 1,
          "#state_ph": null,
          "#state_ph:label21": null,
          "#state_ph:label22": null,
          "#tree_bytes": 0,
          "#tree_bytes:label21": 0,
          "#tree_bytes:label22": 0,
          "#tree_height": 0,
          "#tree_height:label21": 0,
          "#tree_height:label22": 0,
          "#tree_size": 0,
          "#tree_size:label21": 0,
          "#tree_size:label22": 0,
          "#version": "ver3",
          "#version:label21": "ver3",
          "#version:label22": "ver1",
          "label21": "value21",
          "label22": "value22",
        }
      });
    })
  })

  describe("deleteStateTreeVersion", () => {
    const ver1 = 'ver1';
    const ver2 = 'ver2';
    const ver3 = 'ver3';
    const nodeLabel = 'node_label';

    let child1;
    let child2;
    let stateTree;

    let parent;

    beforeEach(() => {
      child1 = new StateNode(hashDelimiter, ver1);
      child2 = new StateNode(hashDelimiter, ver2);
      child1.setValue('value1');
      child2.setValue('value2');
      stateTree = new StateNode(hashDelimiter, ver3);
      stateTree.setChild('label1', child1);
      stateTree.setChild('label2', child2);
      updateStateInfoForStateTree(stateTree);

      parent = new StateNode(hashDelimiter, ver1);
    })

    it("leaf node", () => {
      // Delete a leaf node without version.
      const stateNode1 = StateNode.fromStateSnapshot(true, hashDelimiter, null, stateInfoPrefix);
      updateStateInfoForStateTree(stateNode1);
      expect(deleteStateTreeVersion(stateNode1)).to.equal(2);
      expect(stateNode1.getVersion()).to.equal(null);
      expect(stateNode1.numParents()).to.equal(0);
      expect(stateNode1.numChildren()).to.equal(0);

      // Delete a leaf node with a different version.
      const stateNode2 = StateNode.fromStateSnapshot(true, hashDelimiter, 'ver2', stateInfoPrefix);
      updateStateInfoForStateTree(stateNode2);
      expect(deleteStateTreeVersion(stateNode2)).to.equal(2);
      expect(stateNode2.getVersion()).to.equal(null);
      expect(stateNode2.numParents()).to.equal(0);
      expect(stateNode2.numChildren()).to.equal(0);

      // Delete a leaf node with the same version.
      const stateNode3 = StateNode.fromStateSnapshot(true, hashDelimiter, ver1, stateInfoPrefix);
      updateStateInfoForStateTree(stateNode3);
      expect(deleteStateTreeVersion(stateNode3)).to.equal(2);
      expect(stateNode3.getVersion()).to.equal(null);
      expect(stateNode3.numParents()).to.equal(0);
      expect(stateNode3.numChildren()).to.equal(0);

      // Delete a leaf node with the same version but with non-zero numParents() value.
      const stateNode4 = StateNode.fromStateSnapshot(true, hashDelimiter, ver1, stateInfoPrefix);
      parent.setChild(nodeLabel, stateNode4);
      updateStateInfoForStateTree(stateNode4);
      expect(deleteStateTreeVersion(stateNode4)).to.equal(0);
      expect(stateNode4.getVersion()).to.equal(ver1);
      expect(stateNode4.numParents()).to.equal(1);
      expect(stateNode4.numChildren()).to.equal(0);
    })

    it("internal node", () => {
      expect(deleteStateTreeVersion(stateTree)).to.equal(9);
      // Root node is deleted.
      expect(stateTree.numParents()).to.equal(0);
      expect(stateTree.numChildren()).to.equal(0);
      // And child nodes are deleted as well.
      expect(child1.getVersion()).to.equal(null);
      expect(child1.numParents()).to.equal(0);
      expect(child1.numChildren()).to.equal(0);
      expect(child2.getVersion()).to.equal(null);
      expect(child2.numParents()).to.equal(0);
      expect(child2.numChildren()).to.equal(0);
    })

    it("internal node with non-zero numParents() value", () => {
      // Increase the numParents() value of the root node.
      parent.setChild(nodeLabel, stateTree);

      expect(deleteStateTreeVersion(stateTree)).to.equal(0);
      // State tree is not deleted.
      assert.deepEqual(stateTree.toStateSnapshot(GET_OPTIONS_INCLUDE_ALL), {
        "#num_parents": 1,
        "#num_parents:label1": 1,
        "#num_parents:label2": 1,
        "#state_ph": "0x4ef3be0ba4fd9c5bc7994d3ed87ec958e11f97f1c974fba94037711e058328d6",
        "#state_ph:label1": "0xb41f4a6e100333ddd8e8dcc01ca1fed23662d9faaec359ed255d21a900cecd08",
        "#state_ph:label2": "0x7597bdc763c23c44e90f26c63d7eac963cc0d0aa8a0a3268e7f5691c5361d942",
        "#tree_bytes": 528,
        "#tree_bytes:label1": 172,
        "#tree_bytes:label2": 172,
        "#tree_height": 1,
        "#tree_height:label1": 0,
        "#tree_height:label2": 0,
        "#tree_size": 3,
        "#tree_size:label1": 1,
        "#tree_size:label2": 1,
        "#version": "ver3",
        "#version:label1": "ver1",
        "#version:label2": "ver2",
        "label1": "value1",
        "label2": "value2",
      });
    })

    it("internal node with sub-nodes of > 1 numParents() values", () => {
      stateTree2 = new StateNode('ver99');
      stateTree2.setChild('label1', child1);
      stateTree2.setChild('label2', child2);
      expect(child1.numParents()).to.equal(2);
      expect(child2.numParents()).to.equal(2);

      expect(deleteStateTreeVersion(stateTree)).to.equal(5);
      // Root node is deleted.
      expect(stateTree.numParents()).to.equal(0);
      expect(stateTree.numChildren()).to.equal(0);
      // But child nodes are not deleted.
      expect(child1.getVersion()).to.equal(ver1);
      expect(child1.numParents()).to.equal(1);
      expect(child1.numChildren()).to.equal(0);
      expect(child2.getVersion()).to.equal(ver2);
      expect(child2.numParents()).to.equal(1);
      expect(child2.numChildren()).to.equal(0);
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
          [label121]: 'value0121'
        }
      }
    };

    let stateTree;
    let child1;
    let child11;
    let child111;
    let child1111;

    beforeEach(() => {
      stateTree = StateNode.fromStateSnapshot(jsObject, hashDelimiter, null, stateInfoPrefix);
      child1 = stateTree.getChild(label1);
      child11 = child1.getChild(label11);
      child111 = child11.getChild(label111);
      child1111 = child111.getChild(label1111);
    });

    it("updateStateInfoForAllRootPaths on empty node with a single root path", () => {
      assert.deepEqual(stateTree.toStateSnapshot({ includeProof: true }), {
        "#state_ph": null,
        "0x0001": {
          "#state_ph": null,
          "0x0011": {
            "#state_ph": null,
            "0x0111": {
              "#state_ph": null,
              "#state_ph:0x1111": null,
              "0x1111": null,
            }
          },
          "0x0012": {
            "#state_ph": null,
            "#state_ph:0x0121": null,
            "0x0121": "value0121",
          }
        }
      });
      expect(updateStateInfoForAllRootPaths(child111, label1111)).to.equal(4);
      assert.deepEqual(stateTree.toStateSnapshot({ includeProof: true }), {
        "#state_ph": "0x69350f4b5f666b90fd2d459dee2c5ae513f35be924ad765d601ce9c15f81f283",
        "0x0001": {
          "#state_ph": "0x79df089f535b03c34313f67ec207781875db7a7425230a78b2f71dd827a592fc",
          "0x0012": {
            "#state_ph": null,
            "#state_ph:0x0121": null,
            "0x0121": "value0121",
          }
        }
      });
    });

    it("updateStateInfoForAllRootPaths on empty node with multiple root paths from empty node", () => {
      const child111Clone = child111.clone();
      const child11Clone = new StateNode(hashDelimiter);
      child11Clone.setChild(label111, child111Clone);
      const child1Clone = new StateNode(hashDelimiter);
      child1Clone.setChild(label11, child11Clone);
      const stateTreeClone = new StateNode(hashDelimiter);
      stateTreeClone.setChild(label1, child1Clone);
      const child3 = new StateNode(hashDelimiter);
      child3.setValue('value0003');
      const label3 = '0x003';
      stateTreeClone.setChild(label3, child3);

      assert.deepEqual(stateTree.toStateSnapshot({ includeProof: true }), {
        "#state_ph": null,
        "0x0001": {
          "#state_ph": null,
          "0x0011": {
            "#state_ph": null,
            "0x0111": {
              "#state_ph": null,
              "#state_ph:0x1111": null,
              "0x1111": null,
            }
          },
          "0x0012": {
            "#state_ph": null,
            "#state_ph:0x0121": null,
            "0x0121": "value0121",
          }
        }
      });
      assert.deepEqual(stateTreeClone.toStateSnapshot({ includeProof: true }), {
        "#state_ph": null,
        "#state_ph:0x003": null,
        "0x0001": {
          "#state_ph": null,
          "0x0011": {
            "#state_ph": null,
            "0x0111": {
              "#state_ph": null,
              "#state_ph:0x1111": null,
              "0x1111": null,
            }
          }
        },
        "0x003": "value0003",
      });
      assert.deepEqual(child1111.getParentNodes(), [child111, child111Clone]);
      expect(updateStateInfoForAllRootPaths(child111, label1111)).to.equal(4);
      assert.deepEqual(stateTree.toStateSnapshot({ includeProof: true }), {
        "#state_ph": "0x69350f4b5f666b90fd2d459dee2c5ae513f35be924ad765d601ce9c15f81f283",
        "0x0001": {
          "#state_ph": "0x79df089f535b03c34313f67ec207781875db7a7425230a78b2f71dd827a592fc",
          "0x0012": {
            "#state_ph": null,
            "#state_ph:0x0121": null,
            "0x0121": "value0121",
          }
        }
      });
      assert.deepEqual(stateTreeClone.toStateSnapshot({ includeProof: true }), {
        "#state_ph": null,
        "#state_ph:0x003": null,
        "0x0001": {
          "#state_ph": null,
          "0x0011": {
            "#state_ph": null,
            "0x0111": {
              "#state_ph": null,
              "#state_ph:0x1111": null,
              "0x1111": null,
            }
          }
        },
        "0x003": "value0003",
      });
    });

    it("updateStateInfoForAllRootPaths on empty node with multiple root paths from parent node", () => {
      const child11Clone = child11.clone()
      const child1Clone = new StateNode(hashDelimiter);
      child1Clone.setChild(label11, child11Clone);
      const stateTreeClone = new StateNode(hashDelimiter);
      stateTreeClone.setChild(label1, child1Clone);
      const child3 = new StateNode(hashDelimiter);
      child3.setValue('value0003');
      const label3 = '0x003';
      stateTreeClone.setChild(label3, child3);

      assert.deepEqual(stateTree.toStateSnapshot({ includeProof: true }), {
        "#state_ph": null,
        "0x0001": {
          "#state_ph": null,
          "0x0011": {
            "#state_ph": null,
            "0x0111": {
              "#state_ph": null,
              "#state_ph:0x1111": null,
              "0x1111": null,
            }
          },
          "0x0012": {
            "#state_ph": null,
            "#state_ph:0x0121": null,
            "0x0121": "value0121",
          }
        }
      });
      assert.deepEqual(stateTreeClone.toStateSnapshot({ includeProof: true }), {
        "#state_ph": null,
        "#state_ph:0x003": null,
        "0x0001": {
          "#state_ph": null,
          "0x0011": {
            "#state_ph": null,
            "0x0111": {
              "#state_ph": null,
              "#state_ph:0x1111": null,
              "0x1111": null,
            }
          }
        },
        "0x003": "value0003",
      });
      assert.deepEqual(child111.getParentNodes(), [child11, child11Clone]);
      expect(updateStateInfoForAllRootPaths(child111, label1111)).to.equal(7);
      assert.deepEqual(stateTree.toStateSnapshot({ includeProof: true }), {
        "#state_ph": "0x69350f4b5f666b90fd2d459dee2c5ae513f35be924ad765d601ce9c15f81f283",
        "0x0001": {
          "#state_ph": "0x79df089f535b03c34313f67ec207781875db7a7425230a78b2f71dd827a592fc",
          "0x0012": {
            "#state_ph": null,
            "#state_ph:0x0121": null,
            "0x0121": "value0121",
          }
        }
      });
      assert.deepEqual(stateTreeClone.toStateSnapshot({ includeProof: true }), {
        "#state_ph": "0x4982c00e8daae6d0ca0cb3b0cc6bcec88b97183a7f7f8decfcd013eb402b6f32",
        "#state_ph:0x003": null,
        "0x003": "value0003",
      });
    });

    it("updateStateInfoAllRootPaths on non-empty node", () => {
      assert.deepEqual(stateTree.toStateSnapshot({ includeProof: true }), {
        "#state_ph": null,
        "0x0001": {
          "#state_ph": null,
          "0x0011": {
            "#state_ph": null,
            "0x0111": {
              "#state_ph": null,
              "#state_ph:0x1111": null,
              "0x1111": null,
            }
          },
          "0x0012": {
            "#state_ph": null,
            "#state_ph:0x0121": null,
            "0x0121": "value0121",
          }
        }
      });
      expect(updateStateInfoForAllRootPaths(child11, label111, false)).to.equal(3);
      assert.deepEqual(stateTree.toStateSnapshot({ includeProof: true }), {
        "#state_ph": "0xf8de149cbb6e6ec6eed202d0c1c2927f955bd693dde8725aff64ecd694302be2",
        "0x0001": {
          "#state_ph": "0xbeec2ad3bd5285e375bb66f49ccef377af065bb674a3d5c43937d0c66656a61b",
          "0x0011": {
            "#state_ph": "0x07f1a0cf4f86e7b2459a2cc76a65df77b0f0de3da941168588bf59bd8bf7c970",
            "0x0111": {
              "#state_ph": null,
              "#state_ph:0x1111": null,
              "0x1111": null,
            }
          },
          "0x0012": {
            "#state_ph": null,
            "#state_ph:0x0121": null,
            "0x0121": "value0121",
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
            [label1111]: 'value1111',
            [label1112]: 'value1112'
          }
        }
      },
      [label2]: {
        [label21]: 'value0021'
      }
    };

    let stateTree;
    let child1;
    let child11;
    let child111;
    let child1111;
    let child1112;
    let child2;
    let child21;

    beforeEach(() => {
      stateTree = StateNode.fromStateSnapshot(jsObject, hashDelimiter, null, stateInfoPrefix);
      child1 = stateTree.getChild(label1);
      child11 = child1.getChild(label11);
      child111 = child11.getChild(label111);
      child1111 = child111.getChild(label1111);
      child1112 = child111.getChild(label1112);
      child2 = stateTree.getChild(label2);
      child21 = child2.getChild(label21);
    });

    it("updateStateInfoForStateTree", () => {
      expect(updateStateInfoForStateTree(child1)).to.equal(5);

      // Check state info.
      expect(child1111.verifyStateInfo()).to.equal(true);
      expect(child1111.getTreeHeight()).to.equal(0);
      expect(child1111.getTreeSize()).to.equal(1);
      expect(child1111.getTreeBytes()).to.not.equal(0);  // not zero

      expect(child1112.verifyStateInfo()).to.equal(true);
      expect(child1112.getTreeHeight()).to.equal(0);
      expect(child1112.getTreeSize()).to.equal(1);
      expect(child1112.getTreeBytes()).to.not.equal(0); // not zero

      expect(child111.verifyStateInfo()).to.equal(true);
      expect(child111.getTreeHeight()).to.equal(1);
      expect(child111.getTreeSize()).to.equal(3);
      expect(child111.getTreeBytes()).to.not.equal(0); // not zero

      expect(child11.verifyStateInfo()).to.equal(true);
      expect(child11.getTreeHeight()).to.equal(2);
      expect(child11.getTreeSize()).to.equal(4);
      expect(child11.getTreeBytes()).to.not.equal(0); // not zero

      expect(child1.verifyStateInfo()).to.equal(true);
      expect(child1.getTreeHeight()).to.equal(3);
      expect(child1.getTreeSize()).to.equal(5);
      expect(child1.getTreeBytes()).to.not.equal(0); // not zero

      expect(child21.verifyStateInfo()).to.equal(false);
      expect(child21.getTreeHeight()).to.equal(0);
      expect(child21.getTreeSize()).to.equal(0);
      expect(child21.getTreeBytes()).to.equal(0);

      expect(child2.verifyStateInfo()).to.equal(false);
      expect(child2.getTreeHeight()).to.equal(0);
      expect(child2.getTreeSize()).to.equal(0);
      expect(child2.getTreeBytes()).to.equal(0);

      expect(stateTree.verifyStateInfo()).to.equal(false);
      expect(stateTree.getTreeHeight()).to.equal(0);
      expect(stateTree.getTreeSize()).to.equal(0);
      expect(stateTree.getTreeBytes()).to.equal(0);
    });

    it("updateStateInfoForAllRootPaths with a single root path", () => {
      expect(updateStateInfoForAllRootPaths(child111, label1112)).to.equal(4);

      // Check state info.
      expect(child1111.verifyStateInfo()).to.equal(false);
      expect(child1111.getTreeHeight()).to.equal(0);
      expect(child1111.getTreeSize()).to.equal(0);
      expect(child1111.getTreeBytes()).to.equal(0);

      expect(child1112.verifyStateInfo()).to.equal(false);
      expect(child1112.getTreeHeight()).to.equal(0);
      expect(child1112.getTreeSize()).to.equal(0);
      expect(child1112.getTreeBytes()).to.equal(0);

      expect(child111.verifyStateInfo(label1112)).to.equal(true);  // verified
      expect(child111.verifyStateInfo()).to.equal(false);

      expect(child11.verifyStateInfo(label111)).to.equal(true);  // verified
      expect(child11.verifyStateInfo()).to.equal(true);  // verified

      expect(child1.verifyStateInfo(label11)).to.equal(true);  // verified
      expect(child1.verifyStateInfo()).to.equal(true);  // verified

      expect(child21.verifyStateInfo()).to.equal(false);
      expect(child21.getTreeHeight()).to.equal(0);
      expect(child21.getTreeSize()).to.equal(0);
      expect(child21.getTreeBytes()).to.equal(0);

      expect(child2.verifyStateInfo()).to.equal(false);
      expect(child2.getTreeHeight()).to.equal(0);
      expect(child2.getTreeSize()).to.equal(0);
      expect(child2.getTreeBytes()).to.equal(0);

      expect(stateTree.verifyStateInfo(label1)).to.equal(true);  // verified
      expect(stateTree.verifyStateInfo()).to.equal(false);
    });

    it("updateStateInfoForAllRootPaths with multiple root paths", () => {
      const stateTreeClone = stateTree.clone();
      const child1Clone = child1.clone();
      const child11Clone = child11.clone();
      const child111Clone = child111.clone();
      const child2Clone = child2.clone();

      expect(updateStateInfoForAllRootPaths(child111, label1112)).to.equal(7);

      // Check state info.
      expect(child1111.verifyStateInfo()).to.equal(false);
      expect(child1112.verifyStateInfo()).to.equal(false);  // not verified!!
      expect(child111.verifyStateInfo(label1112)).to.equal(true);  // verified
      expect(child111Clone.verifyStateInfo(label1112)).to.equal(false);  // not verified!!

      expect(child11.verifyStateInfo()).to.equal(true);  // verified
      expect(child11Clone.verifyStateInfo()).to.equal(true);  // verified
      expect(child11Clone.getProofHash()).to.equal(child11.getProofHash());

      expect(child1.verifyStateInfo()).to.equal(true);  // verified
      expect(child1Clone.verifyStateInfo()).to.equal(true);  // verified
      expect(child1Clone.getProofHash()).to.equal(child1.getProofHash());

      expect(child21.verifyStateInfo()).to.equal(false);
      expect(child2.verifyStateInfo()).to.equal(false);
      expect(child2Clone.verifyStateInfo()).to.equal(false);

      expect(stateTree.verifyStateInfo(label1)).to.equal(true);  // verified
      expect(stateTreeClone.verifyStateInfo(label1)).to.equal(true);  // verified
      expect(stateTreeClone.getProofHash()).to.equal(stateTree.getProofHash());
    });

    it("verifyStateInfoForStateTree", () => {
      updateStateInfoForStateTree(stateTree);
      expect(verifyStateInfoForStateTree(stateTree)).to.equal(true);
      child111.setProofHash('new ph');
      expect(verifyStateInfoForStateTree(stateTree)).to.equal(false);
    });

    describe("verifyProofHashForStateTree", () => {
      beforeEach(() => {
        updateStateInfoForStateTree(stateTree);
      });

      it("verified with leaf state node", () => {
        assert.deepEqual(verifyProofHashForStateTree(child1112), {
          "isVerified": true,
          "mismatchedPath": null,
          "mismatchedProofHash": null,
          "mismatchedProofHashComputed": null,
        });
      });

      it("verified with state tree", () => {
        assert.deepEqual(verifyProofHashForStateTree(stateTree), {
          "isVerified": true,
          "mismatchedPath": null,
          "mismatchedProofHash": null,
          "mismatchedProofHashComputed": null,
        });
      });

      it("not verified with mismatched leaf state proof hash", () => {
        child1112.setProofHash('some other value');
        assert.deepEqual(verifyProofHashForStateTree(stateTree), {
          "isVerified": false,
          "mismatchedPath": "/#radix:000/#radix:1/#state:0x0001/#radix:0011/#state:0x0011/#radix:0111/#state:0x0111/#radix:111/#radix:2/#state:0x1112",
          "mismatchedProofHash": "some other value",
          "mismatchedProofHashComputed": "0xfd91d194696561044fc4ae343fc30608cb0ffc3eabd30944087a9fe6a3eef760",
        });
      });

      it("not verified with mismatched internal state proof hash", () => {
        child111.setProofHash('some other value');
        assert.deepEqual(verifyProofHashForStateTree(stateTree), {
          "isVerified": false,
          "mismatchedPath": "/#radix:000/#radix:1/#state:0x0001/#radix:0011/#state:0x0011/#radix:0111/#state:0x0111",
          "mismatchedProofHash": "some other value",
          "mismatchedProofHashComputed": "0xb38b2cf86835718aa59d1e4a6d2cc294761ca2fdcd02e0302a70221a035bfe38",
        });
      });

      it("not verified with mismatched terminal radix proof hash", () => {
        child1112.getParentRadixNodes()[0].setProofHash('some other value');
        assert.deepEqual(verifyProofHashForStateTree(stateTree), {
          "isVerified": false,
          "mismatchedPath": "/#radix:000/#radix:1/#state:0x0001/#radix:0011/#state:0x0011/#radix:0111/#state:0x0111/#radix:111/#radix:2",
          "mismatchedProofHash": "some other value",
          "mismatchedProofHashComputed": "0xf2291b8c0c36fc9a29cb39d023fdebc08bebdd6cf119602ef5890000b6125a6b",
        });
      });

      it("not verified with mismatched internal radix proof hash", () => {
        child1.getParentRadixNodes()[0].getParentNodes()[0].setProofHash('some other value');
        assert.deepEqual(verifyProofHashForStateTree(stateTree), {
          "isVerified": false,
          "mismatchedPath": "/#radix:000",
          "mismatchedProofHash": "some other value",
          "mismatchedProofHashComputed": "0xb2c39ec5b2789b84b403930a9eee3307f71eaec029ea8fdb27917bca56fa9a60",
        });
      });

      it("not verified with mismatched root proof hash of radix tree", () => {
        child111.radixTree.root.setProofHash('some other value');
        assert.deepEqual(verifyProofHashForStateTree(stateTree), {
          "isVerified": false,
          "mismatchedPath": "/#radix:000/#radix:1/#state:0x0001/#radix:0011/#state:0x0011/#radix:0111/#state:0x0111",
          "mismatchedProofHash": "0xb38b2cf86835718aa59d1e4a6d2cc294761ca2fdcd02e0302a70221a035bfe38",
          "mismatchedProofHashComputed": "some other value",
        });
      });
    });

    describe("getStateProofFromStateRoot", () => {
      it("general case", () => {
        updateStateInfoForStateTree(stateTree);
        assert.deepEqual(getStateProofFromStateRoot(stateTree, [label1, label11]), {
          "#state_ph": "0x75900d9758128b84206553291e8300633989fdb6ea8c809d0a6e332f80600407",
          "#radix:000": {
            "#radix:1": {
              "#radix_ph": "0x261afdef504f3e2e4cc79afa89465097c6cea5670650a6def113a58c161775e3",
              "#state:0x0001": {
                "#radix:0011": {
                  "#radix_ph": "0x52a4acf001d21563169d3bb6a847333c248882351d56e1c5057a3544f26342e1",
                  "#state:0x0011": {
                    "#state_ph": "0xf98d4c522afdb4db066766ec7e14b9a864845b723287b2cf8c328b599c027dfb"
                  }
                },
                "#state_ph": "0xffed7eb102370c2b47273b64f69e9454c0d3f0650b229ae5dd8a554e6c02f116"
              }
            },
            "#radix:2": {
              "#radix_ph": "0x201d6a312774b74827e1ae95e37b98558ee25170d1e40f6def42c22ed161dab5"
            },
            "#radix_ph": "0xb2c39ec5b2789b84b403930a9eee3307f71eaec029ea8fdb27917bca56fa9a60"
          }
        });
      });

      it("with conflicted labels between radix node and state node without prefix", () => {
        const stateTree2 = StateNode.fromStateSnapshot({
          "3": {
            "3-1": "value3-1"
          },
          "30": {
            "30-1": "value30-1"
          },
          "31": {
            "31-1": "value31-1"
          },
        }, hashDelimiter, null, stateInfoPrefix);
        updateStateInfoForStateTree(stateTree2);
        assert.deepEqual(getStateProofFromStateRoot(stateTree2, ['31', '31-1']), {
          "#state_ph": "0x8c2734c83cbcdc673190a8d164892c1489f908b3f80d6068257753a39de16181",
          "#radix:33": {
            "#radix:3": {
              "#radix:0": {
                "#radix_ph": "0xda7fde2ca07a62397245f255309752fb69ef011c03e48be00e16e9b89edb992e"
              },
              "#radix:1": {
                "#radix_ph": "0xc2171aa7a68514ee8d10163f01936e6b057f0dd9d1c09965987455c423cc0083",
                "#state:31": {
                  "#radix:33312d31": {
                    "#radix_ph": "0xcbb7f3f7590245dcd747fea8d019b093a366dc055722488bfa6e88b4e85ba5f5",
                    "#state:31-1": {
                      "#state_ph": "0xb5db965c4f86627bf107f798f5946ce1eb24cb5a86c16a78e34e3b224262e1d5"
                    }
                  },
                  "#state_ph": "0x444d17cf54ec9db68a38c29f8d3fd9fc4ca33162bbe118980eb84264f1e5cb50"
                }
              },
              "#radix_ph": "0x19502261f0280695c3ad696c08068ffbed1f76c075e7a985351e1fd3359e7cc3"
            },
            "#radix_ph": "0xa79f73e0527ebdeb2df5c7501723d99a23b3afb9c0cf1d15d6e04d0c842ff8d4",
            "#state:3": {
              "#state_ph": "0x4d8ff5217be0d6876e37d4509e05929aeb8ecc65d06a7a3b0a863d9694b51a3a"
            }
          }
        });
        const proof = getStateProofFromStateRoot(stateTree2, ['31', '31-1']);
        assert.deepEqual(verifyStateProof(hashDelimiter, proof), {
          "curProofHash": "0x8c2734c83cbcdc673190a8d164892c1489f908b3f80d6068257753a39de16181",
          "isVerified": true,
          "mismatchedPath": null,
          "mismatchedProofHash": null,
          "mismatchedProofHashComputed": null,
        });
      });
    });

    it("getProofHashFromStateRoot", () => {
      updateStateInfoForStateTree(stateTree);
      expect(getProofHashFromStateRoot(stateTree, [label1, label11])).to.equal(
        "0xf98d4c522afdb4db066766ec7e14b9a864845b723287b2cf8c328b599c027dfb"
      );
    });

    describe("verifyStateProof", () => {
      const proof = {
        "#state_ph": "0x75900d9758128b84206553291e8300633989fdb6ea8c809d0a6e332f80600407",
        "#radix:000": {
          "#radix:1": {
            "#radix_ph": "0x261afdef504f3e2e4cc79afa89465097c6cea5670650a6def113a58c161775e3",
            "#state:0x0001": {
              "#state_ph": "0xffed7eb102370c2b47273b64f69e9454c0d3f0650b229ae5dd8a554e6c02f116",
              "#radix:0011": {
                "#radix_ph": "0x52a4acf001d21563169d3bb6a847333c248882351d56e1c5057a3544f26342e1",
                "#state:0x0011": {
                  "#state_ph": "0xf98d4c522afdb4db066766ec7e14b9a864845b723287b2cf8c328b599c027dfb"
                }
              }
            }
          },
          "#radix:2": {
            "#radix_ph": "0x201d6a312774b74827e1ae95e37b98558ee25170d1e40f6def42c22ed161dab5"
          },
          "#radix_ph": "0xb2c39ec5b2789b84b403930a9eee3307f71eaec029ea8fdb27917bca56fa9a60"
        }
      };

      it("verified", () => {
        assert.deepEqual(verifyStateProof(hashDelimiter, proof), {
          "curProofHash": "0x75900d9758128b84206553291e8300633989fdb6ea8c809d0a6e332f80600407",
          "isVerified": true,
          "mismatchedPath": null,
          "mismatchedProofHash": null,
          "mismatchedProofHashComputed": null,
        });
      });

      it("not verified with radix proof hash manipulated", () => {
        const proofManipulated1 = JSON.parse(JSON.stringify(proof));
        _.set(proofManipulated1, '#radix:000.#radix:1.#radix_ph', 'some other value');
        assert.deepEqual(verifyStateProof(hashDelimiter, proofManipulated1), {
          "curProofHash": "0x75900d9758128b84206553291e8300633989fdb6ea8c809d0a6e332f80600407",
          "isVerified": false,
          "mismatchedPath": "/#radix:000/#radix:1",
          "mismatchedProofHash": "some other value",
          "mismatchedProofHashComputed": "0x261afdef504f3e2e4cc79afa89465097c6cea5670650a6def113a58c161775e3",
        });
      });


      it("not verified with internal state proof hash manipulated", () => {
        const proofManipulated2 = JSON.parse(JSON.stringify(proof));
        _.set(proofManipulated2, '#radix:000.#radix:1.#state:0x0001.#state_ph', 'some other value');
        assert.deepEqual(verifyStateProof(hashDelimiter, proofManipulated2), {
          "curProofHash": "0x75900d9758128b84206553291e8300633989fdb6ea8c809d0a6e332f80600407",
          "isVerified": false,
          "mismatchedPath": "/#radix:000/#radix:1/#state:0x0001",
          "mismatchedProofHash": "some other value",
          "mismatchedProofHashComputed": "0xffed7eb102370c2b47273b64f69e9454c0d3f0650b229ae5dd8a554e6c02f116",
        });
      });

      it("not verified with terminal state proof hash manipulated", () => {
        const proofManipulated3 = JSON.parse(JSON.stringify(proof));
        _.set(proofManipulated3, '#radix:000.#radix:1.#state:0x0001.#radix:0011.#state:0x0011.#state_ph', 'some other value');
        assert.deepEqual(verifyStateProof(hashDelimiter, proofManipulated3), {
          "curProofHash": "0x75900d9758128b84206553291e8300633989fdb6ea8c809d0a6e332f80600407",
          "isVerified": false,
          "mismatchedPath": "/#radix:000/#radix:1/#state:0x0001/#radix:0011",
          "mismatchedProofHash": "0x52a4acf001d21563169d3bb6a847333c248882351d56e1c5057a3544f26342e1",
          "mismatchedProofHashComputed": "0x7798ecb6063003183a0370ec083260912b756f52054fa3d0ca8e5a88db4a40a8",
        });
      });

      it("not verified with label changed: '2' -> '3'", () => {
        const proofManipulated4 = JSON.parse(JSON.stringify(proof));
        const temp = _.get(proofManipulated4, '#radix:000.#radix:2');
        _.unset(proofManipulated4, '#radix:000.#radix:2');
        _.set(proofManipulated4, '#radix:000.#radix:3', temp);
        assert.deepEqual(verifyStateProof(hashDelimiter, proofManipulated4), {
          "curProofHash": "0x75900d9758128b84206553291e8300633989fdb6ea8c809d0a6e332f80600407",
          "isVerified": false,
          "mismatchedPath": "/#radix:000",
          "mismatchedProofHash": "0xb2c39ec5b2789b84b403930a9eee3307f71eaec029ea8fdb27917bca56fa9a60",
          "mismatchedProofHashComputed": "0x0c479cea57cfd0b5d2f6b0e91f30d802002deda19a26cc44581b56b1be882b6c",
        });
      });
    });
  });
})