const {
  hasEnabledShardConfig,
  isWritablePathWithSharding,
  hasReservedChar,
  hasAllowedPattern,
  isValidStateLabel,
  isValidPathForStates,
  isValidJsObjectForStates,
  setStateTreeVersion,
  renameStateTreeVersion,
  deleteStateTree,
  deleteStateTreeVersion,
  makeCopyOfStateTree,
  equalStateTrees,
  setProofHashForStateTree,
  updateProofHashForAllRootPaths,
} = require('../db/state-util');
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

    it("when writable path w/o shard config", () => {
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
      assert.deepEqual(stateTree.toJsObject(true), {
        ".version": "ver1",
        ".version:bool": "ver1",
        ".version:empty_obj": "ver1",
        ".version:empty_str": "ver1",
        ".version:null": "ver1",
        ".version:number": "ver1",
        ".version:str": "ver1",
        ".version:undef": "ver1",
        ".numParents": 0,
        ".numParents:bool": 1,
        ".numParents:empty_obj": 1,
        ".numParents:empty_str": 1,
        ".numParents:null": 1,
        ".numParents:number": 1,
        ".numParents:str": 1,
        ".numParents:undef": 1,
        ".proofHash": null,
        ".proofHash:bool": null,
        ".proofHash:empty_obj": null,
        ".proofHash:empty_str": null,
        ".proofHash:null": null,
        ".proofHash:number": null,
        ".proofHash:str": null,
        ".proofHash:undef": null,
        ".treeSize": 1,
        ".treeSize:bool": 1,
        ".treeSize:empty_obj": 1,
        ".treeSize:empty_str": 1,
        ".treeSize:null": 1,
        ".treeSize:number": 1,
        ".treeSize:str": 1,
        ".treeSize:undef": 1,
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
          ".numParents": 1,
          ".numParents:bool": 1,
          ".numParents:empty_obj": 1,
          ".numParents:empty_str": 1,
          ".numParents:null": 1,
          ".numParents:number": 1,
          ".numParents:str": 1,
          ".numParents:undef": 1,
          ".proofHash": null,
          ".proofHash:bool": null,
          ".proofHash:empty_obj": null,
          ".proofHash:empty_str": null,
          ".proofHash:null": null,
          ".proofHash:number": null,
          ".proofHash:str": null,
          ".proofHash:undef": null,
          ".treeSize": 1,
          ".treeSize:bool": 1,
          ".treeSize:empty_obj": 1,
          ".treeSize:empty_str": 1,
          ".treeSize:null": 1,
          ".treeSize:number": 1,
          ".treeSize:str": 1,
          ".treeSize:undef": 1,
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
          ".numParents": 1,
          ".numParents:bool": 1,
          ".numParents:empty_obj": 1,
          ".numParents:empty_str": 1,
          ".numParents:null": 1,
          ".numParents:number": 1,
          ".numParents:str": 1,
          ".numParents:undef": 1,
          ".proofHash": null,
          ".proofHash:bool": null,
          ".proofHash:empty_obj": null,
          ".proofHash:empty_str": null,
          ".proofHash:null": null,
          ".proofHash:number": null,
          ".proofHash:str": null,
          ".proofHash:undef": null,
          ".treeSize": 1,
          ".treeSize:bool": 1,
          ".treeSize:empty_obj": 1,
          ".treeSize:empty_str": 1,
          ".treeSize:null": 1,
          ".treeSize:number": 1,
          ".treeSize:str": 1,
          ".treeSize:undef": 1,
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
      assert.deepEqual(stateTree.toJsObject(true), {
        ".numParents": 0,
        ".proofHash": null,
        ".treeSize": 1,
        ".version": "ver3",
        "label1": {
          ".numParents": 1,
          ".numParents:label11": 1,
          ".numParents:label12": 1,
          ".proofHash": null,
          ".proofHash:label11": null,
          ".proofHash:label12": null,
          ".treeSize": 1,
          ".treeSize:label11": 1,
          ".treeSize:label12": 1,
          ".version": "ver2",
          ".version:label11": "ver1",
          ".version:label12": "ver2",
          "label11": "value11",
          "label12": "value12",
        },
        "label2": {
          ".numParents": 1,
          ".numParents:label21": 1,
          ".numParents:label22": 1,
          ".proofHash": null,
          ".proofHash:label21": null,
          ".proofHash:label22": null,
          ".treeSize": 1,
          ".treeSize:label21": 1,
          ".treeSize:label22": 1,
          ".version": "ver2",
          ".version:label21": "ver2",
          ".version:label22": "ver1",
          "label21": "value21",
          "label22": "value22",
        }
      });

      const numNodes = renameStateTreeVersion(stateTree, ver2, ver3);
      expect(numNodes).to.equal(4);
      assert.deepEqual(stateTree.toJsObject(true), {
        ".numParents": 0,
        ".proofHash": null,
        ".treeSize": 1,
        ".version": "ver3",
        "label1": {
          ".numParents": 1,
          ".numParents:label11": 1,
          ".numParents:label12": 1,
          ".proofHash": null,
          ".proofHash:label11": null,
          ".proofHash:label12": null,
          ".treeSize": 1,
          ".treeSize:label11": 1,
          ".treeSize:label12": 1,
          ".version": "ver3",  // renamed
          ".version:label11": "ver1",
          ".version:label12": "ver3",  // renamed
          "label11": "value11",
          "label12": "value12",
        },
        "label2": {
          ".numParents": 1,
          ".numParents:label21": 1,
          ".numParents:label22": 1,
          ".proofHash": null,
          ".proofHash:label21": null,
          ".proofHash:label22": null,
          ".treeSize": 1,
          ".treeSize:label21": 1,
          ".treeSize:label22": 1,
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
      setProofHashForStateTree(stateTree);
    })

    it("leaf node", () => {
      const ver1 = 'ver1';

      // Delete a leaf node without version.
      const stateNode1 = StateNode.fromJsObject(true);
      setProofHashForStateTree(stateNode1);
      const numNodes1 = deleteStateTree(stateNode1);
      expect(numNodes1).to.equal(1);
      expect(stateNode1.numChildren()).to.equal(0);
      expect(stateNode1.getValue()).to.equal(null);
      expect(stateNode1.getProofHash()).to.equal(null);
      expect(stateNode1.numParents()).to.equal(0);

      // Delete a leaf node with version.
      const stateNode2 = StateNode.fromJsObject(true, ver1);
      setProofHashForStateTree(stateNode2);
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
      assert.deepEqual(stateTree.toJsObject(true), null);
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
      setProofHashForStateTree(node);
    })

    it("leaf node", () => {
      // Delete a leaf node without version.
      const stateNode1 = StateNode.fromJsObject(true);
      setProofHashForStateTree(stateNode1);
      const numNodes1 = deleteStateTreeVersion(stateNode1, ver1);
      expect(numNodes1).to.equal(0);
      expect(stateNode1.getValue()).to.equal(true);
      expect(stateNode1.getProofHash()).to.not.equal(null);
      expect(stateNode1.numParents()).to.equal(0);

      // Delete a leaf node with a different version.
      const stateNode2 = StateNode.fromJsObject(true, 'ver2');
      setProofHashForStateTree(stateNode2);
      const numNodes2 = deleteStateTreeVersion(stateNode2, ver1);
      expect(numNodes2).to.equal(0);
      expect(stateNode2.getValue()).to.equal(true);
      expect(stateNode2.getProofHash()).to.not.equal(null);
      expect(stateNode2.numParents()).to.equal(0);

      // Delete a leaf node with the same version.
      const stateNode3 = StateNode.fromJsObject(true, ver1);
      setProofHashForStateTree(stateNode3);
      const numNodes3 = deleteStateTreeVersion(stateNode3, ver1);
      expect(numNodes3).to.equal(1);
      expect(stateNode3.getValue()).to.equal(null);
      expect(stateNode3.getProofHash()).to.equal(null);
      expect(stateNode3.numParents()).to.equal(0);

      // Delete a leaf node with the same version but with non-zero numParents() value.
      const stateNode4 = StateNode.fromJsObject(true, ver1);
      parent.setChild(nodeLabel, stateNode4);
      setProofHashForStateTree(stateNode4);
      const numNodes4 = deleteStateTreeVersion(stateNode4, ver1);
      expect(numNodes4).to.equal(0);
      expect(stateNode4.getValue()).to.equal(true);
      expect(stateNode4.getProofHash()).to.not.equal(null);
      expect(stateNode4.numParents()).to.equal(1);
    })

    it("internal node with a different version", () => {
      const numNodes = deleteStateTreeVersion(node, 'ver4');
      expect(numNodes).to.equal(0);
      // State tree is not deleted.
      assert.deepEqual(node.toJsObject(true), {
        ".version": "ver3",
        ".version:label1": "ver1",
        ".version:label2": "ver2",
        ".numParents": 0,
        ".numParents:label1": 1,
        ".numParents:label2": 1,
        ".proofHash": "0xa540d9d1906f4579604302acdee0b4c9742f537eb5f8397fb9a43ed458dad439",
        ".proofHash:label1": "0xb41f4a6e100333ddd8e8dcc01ca1fed23662d9faaec359ed255d21a900cecd08",
        ".proofHash:label2": "0x7597bdc763c23c44e90f26c63d7eac963cc0d0aa8a0a3268e7f5691c5361d942",
        ".treeSize": 3,
        ".treeSize:label1": 1,
        ".treeSize:label2": 1,
        label1: "value1",
        label2: "value2"
      });
    })

    it("internal node with the same version", () => {
      // Set versions of the state tree.
      setStateTreeVersion(node, ver3);

      const numNodes = deleteStateTreeVersion(node, ver3);
      expect(numNodes).to.equal(3);
      // State tree is deleted.
      assert.deepEqual(node.toJsObject(true), null);
      // And child nodes are deleted as well.
      expect(child1.getValue()).to.equal(null);
      expect(child1.getProofHash()).to.equal(null);
      expect(child1.getVersion()).to.equal(ver3);
      expect(child1.numParents()).to.equal(0);
      expect(child2.getValue()).to.equal(null);
      expect(child2.getProofHash()).to.equal(null);
      expect(child1.getVersion()).to.equal(ver3);
      expect(child2.numParents()).to.equal(0);
    })

    it("internal node with the same version but with non-zero numParents() value", () => {
      // Increase the numParents() value of the root node.
      parent.setChild(nodeLabel, node);

      const numNodes = deleteStateTreeVersion(node, ver3);
      expect(numNodes).to.equal(0);
      // State tree is not deleted.
      assert.deepEqual(node.toJsObject(true), {
        ".version": "ver3",
        ".version:label1": "ver1",
        ".version:label2": "ver2",
        ".numParents": 1,
        ".numParents:label1": 1,
        ".numParents:label2": 1,
        ".proofHash": "0xa540d9d1906f4579604302acdee0b4c9742f537eb5f8397fb9a43ed458dad439",
        ".proofHash:label1": "0xb41f4a6e100333ddd8e8dcc01ca1fed23662d9faaec359ed255d21a900cecd08",
        ".proofHash:label2": "0x7597bdc763c23c44e90f26c63d7eac963cc0d0aa8a0a3268e7f5691c5361d942",
        ".treeSize": 3,
        ".treeSize:label1": 1,
        ".treeSize:label2": 1,
        label1: "value1",
        label2: "value2"
      });
    })

    it("internal node with the same version but with sub-node of different versions", () => {
      const numNodes = deleteStateTreeVersion(node, ver3);
      expect(numNodes).to.equal(1);
      // Root node is deleted.
      assert.deepEqual(node.toJsObject(true), null);
      // But child nodes are not deleted.
      expect(child1.getValue()).to.equal('value1');
      expect(child1.getProofHash()).to.not.equal(null);
      expect(child1.getVersion()).to.equal(ver1);
      expect(child1.numParents()).to.equal(0);
      expect(child2.getValue()).to.equal('value2');
      expect(child2.getProofHash()).to.not.equal(null);
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

      const numNodes = deleteStateTreeVersion(node, ver3);
      expect(numNodes).to.equal(1);
      // State tree is deleted.
      assert.deepEqual(node.toJsObject(true), null);
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
      const stateTree = StateNode.fromJsObject(jsObject);
      const level0Node = stateTree.getChild('level0');
      const level1Node = level0Node.getChild('level1');
      const fooNode = level1Node.getChild('foo');
      const bazNode = level1Node.getChild('baz');
      const anotherNode = stateTree.getChild('another_route');
      const testNode = anotherNode.getChild('test');
      setProofHashForStateTree(level0Node);
      // Checks proof hashes.
      expect(level0Node.getProofHash()).to.equal(level0Node.buildProofHash());
      expect(level1Node.getProofHash()).to.equal(level1Node.buildProofHash());
      expect(fooNode.getProofHash()).to.equal(fooNode.buildProofHash());
      expect(bazNode.getProofHash()).to.equal(bazNode.buildProofHash());
      expect(stateTree.getChild('another_route').getChild('test').getProofHash()).to.equal(null);
      expect(stateTree.getChild('another_route').getProofHash()).to.equal(null);
      expect(stateTree.getProofHash()).to.equal(null);
      // Checks tree sizes.
      expect(fooNode.getTreeSize()).to.equal(1);
      expect(bazNode.getTreeSize()).to.equal(1);
      expect(level1Node.getTreeSize()).to.equal(3);
      expect(level0Node.getTreeSize()).to.equal(4);
      expect(anotherNode.getTreeSize()).to.equal(1);
      expect(testNode.getTreeSize()).to.equal(1);
    });
  });

  describe("updateProofHashForAllRootPaths", () => {
    it("updates proof hashes for a single path to a root", () => {
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
      const rootNode = StateNode.fromJsObject(jsObject);
      const level0Node = rootNode.getChild('level0');
      const level1Node = level0Node.getChild('level1');
      const level2Node = level1Node.getChild('level2');
      const anotherNode = level0Node.getChild('another_route');

      const numAffectedNodes = updateProofHashForAllRootPaths(['level0', 'level1'], rootNode);
      expect(numAffectedNodes).to.equal(3);

      // Checks proof hashes.
      expect(level2Node.getChild('foo').getProofHash()).to.equal(null);
      expect(level2Node.getChild('baz').getProofHash()).to.equal(null);
      expect(level2Node.getProofHash()).to.equal(null);
      expect(anotherNode.getChild('test').getProofHash()).to.equal(null);
      expect(anotherNode.getProofHash()).to.equal(null);
      expect(level1Node.getProofHash()).to.equal(level1Node.buildProofHash());
      expect(level0Node.getProofHash()).to.equal(level0Node.buildProofHash());
      expect(rootNode.getProofHash()).to.equal(rootNode.buildProofHash());

      // Checks tree sizes.
      expect(level1Node.getTreeSize()).to.equal(2);
      expect(level0Node.getTreeSize()).to.equal(4);
      expect(rootNode.getTreeSize()).to.equal(5);
    });

    it("updates proof hashes for multiple paths to all the roots", () => {
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
      const rootNode = StateNode.fromJsObject(jsObject);
      const level0Node = rootNode.getChild('level0');
      const level1Node = level0Node.getChild('level1');
      const level2Node = level1Node.getChild('level2');
      const anotherNode = level0Node.getChild('another_route');
      const rootClone = rootNode.clone();
      const level0Clone = level0Node.clone();
      const level1Clone = level1Node.clone();
      const level2Clone = level2Node.clone();
      const anotherClone = anotherNode.clone();

      const numAffectedNodes = updateProofHashForAllRootPaths(['level0', 'level1'], rootNode);
      expect(numAffectedNodes).to.equal(5);

      // Checks proof hashes.
      expect(level2Node.getChild('foo').getProofHash()).to.equal(null);
      expect(level2Node.getChild('baz').getProofHash()).to.equal(null);
      expect(level2Node.getProofHash()).to.equal(null);
      expect(level2Clone.getProofHash()).to.equal(null);

      expect(anotherNode.getChild('test').getProofHash()).to.equal(null);
      expect(anotherNode.getProofHash()).to.equal(null);
      expect(anotherClone.getProofHash()).to.equal(null);

      expect(level1Node.getProofHash()).to.equal(level1Node.buildProofHash());
      expect(level1Clone.getProofHash()).to.equal(null);

      expect(level0Node.getProofHash()).to.equal(level0Node.buildProofHash());
      expect(level0Clone.getProofHash()).to.equal(level0Clone.buildProofHash());
      expect(level0Clone.getProofHash()).to.equal(level0Node.getProofHash());

      expect(rootNode.getProofHash()).to.equal(rootNode.buildProofHash());
      expect(rootClone.getProofHash()).to.equal(rootClone.buildProofHash());
      expect(rootClone.getProofHash()).to.equal(rootNode.getProofHash());
    });
  });
})