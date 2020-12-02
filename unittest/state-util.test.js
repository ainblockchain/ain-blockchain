const {
  hasEnabledShardConfig,
  isWritablePathWithSharding,
  hasReservedChar,
  hasAllowedPattern,
  isValidStateLabel,
  isValidPathForStates,
  isValidJsObjectForStates,
  jsObjectToStateTree,
  stateTreeToJsObject,
  stateTreeVersionsToJsObject,
  setStateTreeVersion,
  deleteStateTree,
  deleteStateTreeVersion,
  makeCopyOfStateTree,
  buildProofHashOfStateNode,
  setProofHashForStateTree,
  updateProofHashForPath,
} = require('../db/state-util');
const StateNode = require('../db/state-node');
const { HASH_DELIMITER } = require('../constants');
const ChainUtil = require('../chain-util');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("state-util", () => {
  describe("hasEnabledShardConfig", () => {
    it("when input without matched shard config returning false", () => {
      expect(hasEnabledShardConfig(jsObjectToStateTree(null))).to.equal(false);
      expect(hasEnabledShardConfig(jsObjectToStateTree({}))).to.equal(false);
      expect(hasEnabledShardConfig(jsObjectToStateTree({
        subtree: {
          path: "some value"
        },
        str: "string value"
      }
      ))).to.equal(false);
      expect(hasEnabledShardConfig(jsObjectToStateTree({
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
      expect(hasEnabledShardConfig(jsObjectToStateTree({
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
      expect(hasEnabledShardConfig(jsObjectToStateTree({
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
          jsObjectToStateTree({
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
          jsObjectToStateTree({
            some: {
              other_path: true,
              ".shard": {
                sharding_enabled: true
              }
            }
          })), {isValid: false, invalidPath: '/some'});
    })

    it("when writable path w/o shard config", () => {
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path'],
          jsObjectToStateTree({
            some: {
              path: true
            }
          })), {isValid: true, invalidPath: ''});
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path'],
          jsObjectToStateTree({
            some: {
              other_path: true
            }
          })), {isValid: true, invalidPath: ''});
    })
    it("when writable path with shard config", () => {
      assert.deepEqual(isWritablePathWithSharding(
          ['some', 'path'],
          jsObjectToStateTree({
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
          jsObjectToStateTree({
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
          jsObjectToStateTree({
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
          jsObjectToStateTree({
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
      expect(hasReservedChar('\u2000/\u2E00')).to.equal(true);
      expect(hasReservedChar('.')).to.equal(true);
      expect(hasReservedChar('*')).to.equal(true);
      expect(hasReservedChar('$')).to.equal(true);
      expect(hasReservedChar('#')).to.equal(true);
      expect(hasReservedChar('{')).to.equal(true);
      expect(hasReservedChar('}')).to.equal(true);
      expect(hasReservedChar('[')).to.equal(true);
      expect(hasReservedChar(']')).to.equal(true);
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
      expect(hasAllowedPattern('.')).to.equal(false);
      expect(hasAllowedPattern('$')).to.equal(false);
      expect(hasAllowedPattern('./')).to.equal(false);
      expect(hasAllowedPattern('$/')).to.equal(false);
      expect(hasAllowedPattern('a.')).to.equal(false);
      expect(hasAllowedPattern('a$')).to.equal(false);
      expect(hasAllowedPattern('a.b')).to.equal(false);
      expect(hasAllowedPattern('a$b')).to.equal(false);
      expect(hasAllowedPattern('..')).to.equal(false);
      expect(hasAllowedPattern('$$')).to.equal(false);
      expect(hasAllowedPattern('.$')).to.equal(false);
      expect(hasAllowedPattern('$.')).to.equal(false);
      expect(hasAllowedPattern('*a')).to.equal(false);
      expect(hasAllowedPattern('a*')).to.equal(false);
    })

    it("when string input returning true", () => {
      expect(hasAllowedPattern('.a')).to.equal(true);
      expect(hasAllowedPattern('$a')).to.equal(true);
      expect(hasAllowedPattern('*')).to.equal(true);
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
    })

    it("when string input returning true", () => {
      expect(isValidStateLabel('a')).to.equal(true);
      expect(isValidStateLabel('.a')).to.equal(true);
      expect(isValidStateLabel('$a')).to.equal(true);
      expect(isValidStateLabel('*')).to.equal(true);
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
          ".write": true
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
  })

  describe("jsObjectToStateTree / stateTreeToJsObject", () => {
    it("leaf node", () => {
      expect(stateTreeToJsObject(jsObjectToStateTree(true))).to.equal(true);
      expect(stateTreeToJsObject(jsObjectToStateTree(false))).to.equal(false);
      expect(stateTreeToJsObject(jsObjectToStateTree(10))).to.equal(10);
      expect(stateTreeToJsObject(jsObjectToStateTree('str'))).to.equal('str');
      expect(stateTreeToJsObject(jsObjectToStateTree(null))).to.equal(null);
    })

    it("internal node", () => {
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
      assert.deepEqual(stateTreeToJsObject(jsObjectToStateTree(stateObj)), {
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

  describe("jsObjectToStateTree with version / stateTreeVersionsToJsObject", () => {
    it("leaf node", () => {
      const ver1 = 'ver1';

      expect(stateTreeVersionsToJsObject(jsObjectToStateTree(true, ver1))).to.equal(true);
      expect(stateTreeVersionsToJsObject(jsObjectToStateTree(false, ver1))).to.equal(false);
      expect(stateTreeVersionsToJsObject(jsObjectToStateTree(10, ver1))).to.equal(10);
      expect(stateTreeVersionsToJsObject(jsObjectToStateTree('str', ver1))).to.equal('str');
      expect(stateTreeVersionsToJsObject(jsObjectToStateTree(null, ver1))).to.equal(null);
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
      assert.deepEqual(stateTreeVersionsToJsObject(jsObjectToStateTree(stateObj, ver1)), {
        ".version": "ver1",
        bool: false,
        number: 10,
        str: 'str',
        empty_str: '',
        null: null,
        undef: undefined,
        empty_obj: null,
        subobj1: {
          ".version": "ver1",
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

  describe("setStateTreeVersion", () => {
    it("leaf node", () => {
      const ver1 = 'ver1';

      const stateNode = jsObjectToStateTree(true);
      setStateTreeVersion(stateNode, ver1);
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
      const stateTree = jsObjectToStateTree(stateObj);
      setStateTreeVersion(stateTree, ver1);
      assert.deepEqual(stateTreeVersionsToJsObject(stateTree), {
        ".version": "ver1",
        bool: false,
        number: 10,
        str: 'str',
        empty_str: '',
        null: null,
        undef: undefined,
        empty_obj: null,
        subobj1: {
          ".version": "ver1",
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
    })

    it("leaf node", () => {
      const ver1 = 'ver1';

      const stateNode1 = jsObjectToStateTree(true);
      deleteStateTree(stateNode1, ver1);
      expect(stateNode1.getVersion()).to.equal(null);
      expect(stateNode1.getValue()).to.equal(null);

      const stateNode2 = jsObjectToStateTree(true, ver1);
      deleteStateTree(stateNode2, ver1);
      expect(stateNode2.getVersion()).to.equal(null);
      expect(stateNode2.getValue()).to.equal(null);
    })

    it("internal node", () => {
      deleteStateTree(stateTree);
      // State tree is deleted.
      assert.deepEqual(stateTreeVersionsToJsObject(stateTree), null);
      // And child nodes are deleted as well.
      expect(child1.getValue()).to.equal(null);
      expect(child1.getVersion()).to.equal(null);
      expect(child2.getValue()).to.equal(null);
      expect(child2.getVersion()).to.equal(null);
    })
  })

  describe("deleteStateTreeVersion", () => {
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
    })

    it("leaf node", () => {
      const ver1 = 'ver1';

      const stateNode1 = jsObjectToStateTree(true);
      deleteStateTreeVersion(stateNode1, ver1);
      expect(stateNode1.getVersion()).to.equal(null);
      expect(stateNode1.getValue()).to.equal(true);

      const stateNode2 = jsObjectToStateTree(true, ver1);
      deleteStateTreeVersion(stateNode2, ver1);
      expect(stateNode2.getVersion()).to.equal(null);
      expect(stateNode2.getValue()).to.equal(null);
    })

    it("internal node", () => {
      deleteStateTreeVersion(stateTree, 'ver4');
      // State tree is not deleted.
      assert.deepEqual(stateTreeVersionsToJsObject(stateTree), {
        ".version": "ver3",
        label1: "value1",
        label2: "value2"
      });

      setStateTreeVersion(stateTree, ver3);
      deleteStateTreeVersion(stateTree, ver3);
      // State tree is deleted.
      assert.deepEqual(stateTreeVersionsToJsObject(stateTree), null);
      // And child nodes are deleted as well.
      expect(child1.getValue()).to.equal(null);
      expect(child1.getVersion()).to.equal(null);
      expect(child2.getValue()).to.equal(null);
      expect(child2.getVersion()).to.equal(null);
    })

    it("internal node with different versions", () => {
      deleteStateTreeVersion(stateTree, ver1);
      assert.deepEqual(stateTreeVersionsToJsObject(stateTree), {
        ".version": "ver3",
        label1: "value1",
        label2: "value2"
      });

      deleteStateTreeVersion(stateTree, ver3);
      // Root node is deleted.
      assert.deepEqual(stateTreeVersionsToJsObject(stateTree), null);
      // But child nodes are not deleted.
      expect(child1.getValue()).to.equal('value1');
      expect(child1.getVersion()).to.equal(ver1);
      expect(child2.getValue()).to.equal('value2');
      expect(child2.getVersion()).to.equal(ver2);
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
      const root = jsObjectToStateTree(stateObj);
      const copy = makeCopyOfStateTree(root);
      deleteStateTree(root);
      assert.deepEqual(stateTreeToJsObject(copy), {
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

describe("state-util: a part of state Proof", () => {
  describe("buildProofHashOfStateNode", () => {
    it("tests a leaf node case", () => {
      expect(buildProofHashOfStateNode(jsObjectToStateTree(true)))
        .to.equal(ChainUtil.hashString(ChainUtil.toString(true)));
      expect(buildProofHashOfStateNode(jsObjectToStateTree(10)))
        .to.equal(ChainUtil.hashString(ChainUtil.toString(10)));
      expect(buildProofHashOfStateNode(jsObjectToStateTree(-200)))
        .to.equal(ChainUtil.hashString(ChainUtil.toString(-200)));
      expect(buildProofHashOfStateNode(jsObjectToStateTree('')))
        .to.equal(ChainUtil.hashString(ChainUtil.toString('')));
      expect(buildProofHashOfStateNode(jsObjectToStateTree('unittest')))
        .to.equal(ChainUtil.hashString(ChainUtil.toString('unittest')));
      expect(buildProofHashOfStateNode(jsObjectToStateTree(null)))
        .to.equal(ChainUtil.hashString(ChainUtil.toString(null)));
      expect(buildProofHashOfStateNode(jsObjectToStateTree(undefined)))
        .to.equal(ChainUtil.hashString(ChainUtil.toString(undefined)));
    });

    it("tests a NON-leaf node case", () => {
      const jsObject = {
        level0: {
          child1: 'value1',
          child2: 'value2',
          child3: 'value3'
        }
      };
      const level0Node = jsObjectToStateTree(jsObject).getChild('level0');
      const childLabels = level0Node.getChildLabels();
      const child1Node = level0Node.getChild(childLabels[0]);
      const child2Node = level0Node.getChild(childLabels[1]);
      const child3Node = level0Node.getChild(childLabels[2]);
      child1Node.setProofHash('proofHash1');
      child2Node.setProofHash('proofHash2');
      child3Node.setProofHash('proofHash3');
      const preimage = `${childLabels[0]}${HASH_DELIMITER}`
          + `${child1Node.getProofHash()}${HASH_DELIMITER}`
          + `${childLabels[1]}${HASH_DELIMITER}`
          + `${child2Node.getProofHash()}${HASH_DELIMITER}`
          + `${childLabels[2]}${HASH_DELIMITER}`
          + `${child3Node.getProofHash()}`;
      expect(buildProofHashOfStateNode(level0Node))
        .to.equal(ChainUtil.hashString(ChainUtil.toString(preimage)));
    });
  });

  describe("setProofHashForStateTree", () => {
    it("generates a proof hash along with the given stateTree", () => {
      const jsObject = {
        level0: {
          level1: {
            foo: 'bar',
            baz: 'caz'
          }
        },
        another_route: {
          test: 10
        }
      };
      const stateTree = jsObjectToStateTree(jsObject);
      const level0Node = stateTree.getChild('level0');
      const level1Node = level0Node.getChild('level1');
      const fooNode = level1Node.getChild('foo');
      const bazNode = level1Node.getChild('baz');
      setProofHashForStateTree(level0Node);
      expect(level0Node.getProofHash()).to.equal(buildProofHashOfStateNode(level0Node));
      expect(level1Node.getProofHash()).to.equal(buildProofHashOfStateNode(level1Node));
      expect(fooNode.getProofHash()).to.equal(buildProofHashOfStateNode(fooNode));
      expect(bazNode.getProofHash()).to.equal(buildProofHashOfStateNode(bazNode));
      expect(stateTree.getChild('another_route').getChild('test').getProofHash()).to.equal(null);
      expect(stateTree.getChild('another_route').getProofHash()).to.equal(null);
      expect(stateTree.getProofHash()).to.equal(null);
    });
  });

  describe("updateProofHashForPath", () => {
    it("updates proof hashes to the root", () => {
      const jsObject = {
        level0: {
          level1: {
            level2: {
              foo: 'bar',
              baz: 'caz'
            }
          },
          another_route: {
            test: -1000
          }
        }
      };
      const stateTree = jsObjectToStateTree(jsObject);
      const level0Node = stateTree.getChild('level0');
      const level1Node = level0Node.getChild('level1');
      const level2Node = level1Node.getChild('level2');
      const anotherNode = level0Node.getChild('another_route');
      updateProofHashForPath(['level0', 'level1'], stateTree);
      expect(level2Node.getChild('foo').getProofHash()).to.equal(null);
      expect(level2Node.getChild('baz').getProofHash()).to.equal(null);
      expect(level2Node.getProofHash()).to.equal(null);
      expect(anotherNode.getProofHash()).to.equal(null);
      expect(anotherNode.getChild('test').getProofHash()).to.equal(null);
      expect(level1Node.getProofHash()).to.equal(buildProofHashOfStateNode(level1Node));
      expect(level0Node.getProofHash()).to.equal(buildProofHashOfStateNode(level0Node));
      expect(stateTree.getProofHash()).to.equal(buildProofHashOfStateNode(stateTree));
    });
  });

  describe("makeCopyOfStateTree and deleteStateTree", () => {
    it("copy with proof", () => {
      const jsObject = {
        level0: {
          level1: {
            level2: {
              foo: 'bar',
              baz: 'caz'
            }
          },
          another_route: {
            test: -1000
          }
        }
      };
      const stateTree = jsObjectToStateTree(jsObject);
      setProofHashForStateTree(stateTree);
      const copyTree = makeCopyOfStateTree(stateTree);
      expect(copyTree.getProofHash()).to.equal(stateTree.getProofHash());
    });

    it("delete with proof", () => {
      const jsObject = {
        level0: {
          level1: {
            level2: {
              foo: 'bar',
              baz: 'caz'
            }
          },
          another_route: {
            test: -1000
          }
        }
      };
      const stateTree = jsObjectToStateTree(jsObject);
      setProofHashForStateTree(stateTree);
      deleteStateTree(stateTree);
      expect(stateTree.getProofHash()).to.equal(null);
    });
  });
});