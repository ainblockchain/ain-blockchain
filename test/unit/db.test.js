const BlockchainNode = require('../../node')
const rimraf = require('rimraf');
const _ = require("lodash");
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const ainUtil = require('@ainblockchain/ain-util');
const {
  NodeConfigs,
  StateInfoProperties,
  StateVersions,
  BlockchainParams,
} = require('../../common/constants')
const {
  verifyStateProof,
} = require('../../db/state-util');
const Transaction = require('../../tx-pool/transaction');
const CommonUtil = require('../../common/common-util');
const {
  setNodeForTesting,
  eraseEvalResMatched,
} = require('../test-util');
const hashDelimiter = BlockchainParams.genesis.hash_delimiter;

describe("DB initialization", () => {
  let node;

  beforeEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node, 0, true);
  })

  afterEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);
  });

  describe("Sharding path", () => {
    it("getShardingPath", () => {
      expect(node.db.getShardingPath()).to.equal(BlockchainParams.sharding.sharding_path);
    })

    it("isRootBlockchain", () => {
      expect(node.db.isRootBlockchain).to.equal(BlockchainParams.sharding.sharding_protocol === 'NONE');
    })
  })

  describe("Token", () => {
    it("loading token properly on initialization", () => {
      assert.deepEqual(node.db.getValue(`/blockchain_params/token`), BlockchainParams.token);
    })
  })

  describe("Balances", () => {
    it("loading balances properly on initialization", () => {
      const expected = BlockchainParams.token.total_supply - 5 * 11000000 - 5 * 1000000;
      const dbPath = `/accounts/${BlockchainParams.genesis.genesis_addr}/balance`;
      expect(node.db.getValue(dbPath)).to.equal(expected);
    })
  })

  describe("Sharding", () => {
    it("loading sharding properly on initialization", () => {
      assert.deepEqual(node.db.getValue(`/blockchain_params/sharding`), BlockchainParams.sharding);
    })
  })

  describe("Whitelist", () => {
    it("loading whitelist properly on initialization", () => {
      assert.deepEqual(node.db.getValue(`/consensus/proposer_whitelist`), BlockchainParams.consensus.genesis_proposer_whitelist);
    })
  })

  describe("Functions", () => {
    it("loading functions properly on initialization", () => {
      expect(node.db.getFunction('/')).to.not.equal(null);
    })
  })

  describe("Rules", () => {
    it("loading rules properly on initialization", () => {
      expect(node.db.getRule('/')).to.not.equal(null);
    })
  })

  describe("Owners", () => {
    it("loading owners properly on initialization", () => {
      expect(node.db.getOwner('/')).to.not.equal(null);
    })
  })
})

describe("DB operations", () => {
  let node, dbValues, dbFuncs, dbRules, dbOwners;

  beforeEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node);

    dbValues = {
      "ai": {
        "comcom": 123,
        "foo": "bar",
        "baz": "qux"
      },
      "increment": {
        "value": 20,
      },
      "decrement": {
        "value": 20,
      },
      "nested": {
        "far": {
          "down": 456
        }
      },
      "shards": {
        "enabled_shard": {
          ".shard": {
            "sharding_enabled": true
          },
          "path": 10,
        },
        "disabled_shard": {
          ".shard": {
            "sharding_enabled": false
          },
          "path": 10,
        }
      }
    };
    node.db.setValuesForTesting("/apps/test", dbValues);

    dbFuncs = {
      "some": {
        "$var_path": {
          ".function": {
            "fid_var": {
              "function_type": "REST",
              "function_id": "fid_var",
              "function_url": "https://events.ainetwork.ai/trigger",
            },
          }
        },
        "path": {
          ".function": {
            "fid": {
              "function_type": "REST",
              "function_id": "fid",
              "function_url": "https://events.ainetwork.ai/trigger",
            },
          },
          "deeper": {
            "path": {
              ".function": {
                "fid_deeper": {
                  "function_type": "REST",
                  "function_id": "fid_deeper",
                  "function_url": "https://events.ainetwork.ai/trigger",
                }
              }
            }
          }
        },
      }
    };
    node.db.setFunctionsForTesting("/apps/test/test_function", dbFuncs);

    const dbFuncsForPartialSet = {
      "some": {
        "upper": {
          "path": {
            ".function": {
              "fid": {
                "function_type": "REST",
                "function_id": "fid",
                "function_url": "https://events.ainetwork.ai/trigger",
              },
            }
          }
        }
      }
    };
    // Set on the 'test_owner' path:
    node.db.setFunctionsForTesting("/apps/test/test_owner", dbFuncsForPartialSet);

    dbRules = {
      "some": {
        "$var_path": {
          ".rule": {
            "write": "auth.addr !== 'abcd'"
          }
        },
        "path": {
          ".rule": {
            "write": "auth.addr === 'abcd'",
          }
        },
        "upper": {
          "path": {
            ".rule": {
              "write": "auth.addr === 'abcd'",
            },
            "deeper": {
              "path": {
                ".rule": {
                  "write": "auth.addr === 'ijkl'"
                }
              }
            }
          }
        }
      }
    };
    node.db.setRulesForTesting("/apps/test/test_rule", dbRules);

    const dbRulesForPartialSet = {
      "some": {
        "upper": {
          "path": {
            ".rule": {
              "write": "auth.addr === 'abcd'",
            }
          }
        }
      }
    };
    // Set on the 'test_owner' path:
    node.db.setRulesForTesting("/apps/test/test_owner", dbRulesForPartialSet);

    dbOwners = {
      "some": {
        "path": {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": false,
                "write_function": false,
                "write_owner": false,
                "write_rule": false,
              },
              "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true,
              }
            }
          }
        },
        "upper": {
          "path": {
            ".owner": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": false,
                  "write_owner": false,
                  "write_rule": false,
                },
                "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true,
                }
              }
            },
            "deeper": {
              "path": {
                ".owner": {
                  "owners": {
                    "*": {
                      "branch_owner": false,
                      "write_function": false,
                      "write_owner": false,
                      "write_rule": false,
                    },
                    "0x08Aed7AF9354435c38d52143EE50ac839D20696b": {
                      "branch_owner": true,
                      "write_function": true,
                      "write_owner": true,
                      "write_rule": true,
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    node.db.setOwnersForTesting("/apps/test/test_owner", dbOwners);
  });

  afterEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);
  });

  describe("Value operations", () => {
    describe("getValue:", () => {
      it("getValue to retrieve high value near top of database", () => {
        assert.deepEqual(node.db.getValue("/apps/test"), dbValues)
      })

      it("getValue to retrieve high value near top of database with is_final", () => {
        const backupFinalVersion = node.db.stateManager.getFinalVersion();
        node.db.stateManager.finalizeVersion(StateVersions.EMPTY);
        assert.deepEqual(node.db.getValue("/apps/test", { isFinal: true }), null)
        node.db.stateManager.finalizeVersion(backupFinalVersion);
      })

      it('getValue to retrieve value near top of database with is_shallow', () => {
        assert.deepEqual(node.db.getValue('/apps/test', { isShallow: true }), {
          'ai': {
            "#state_ph": "0x4c6895fec04b40d425d1542b7cfb2f78b0e8cd2dc4d35d0106100f1ecc168cec"
          },
          'increment': {
            "#state_ph": "0x11d1aa4946a3e44e3d467d4da85617d56aecd2559fdd6d9e5dd8fb6b5ded71b8"
          },
          'decrement': {
            "#state_ph": "0x11d1aa4946a3e44e3d467d4da85617d56aecd2559fdd6d9e5dd8fb6b5ded71b8"
          },
          'nested': {
            "#state_ph": "0x8763e301c728729e38c1f5500a2af7163783bdf0948a7baf7bc87b35f33b347f"
          },
          'shards': {
            "#state_ph": "0xbe0fbf9fec28b21de391ebb202517a420f47ee199aece85153e8fb4d9453f223"
          },
        })
      });

      it('getValue to retrieve value with include_tree_info', () => {
        assert.deepEqual(node.db.getValue('/apps/test', { includeTreeInfo: true }), {
          "#num_parents": 1,
          "#tree_bytes": 3708,
          "#tree_height": 4,
          "#tree_size": 21,
          "ai": {
            "#num_parents": 1,
            "#num_parents:baz": 1,
            "#num_parents:comcom": 1,
            "#num_parents:foo": 1,
            "#tree_bytes": 684,
            "#tree_bytes:baz": 166,
            "#tree_bytes:comcom": 168,
            "#tree_bytes:foo": 166,
            "#tree_height": 1,
            "#tree_height:baz": 0,
            "#tree_height:comcom": 0,
            "#tree_height:foo": 0,
            "#tree_size": 4,
            "#tree_size:baz": 1,
            "#tree_size:comcom": 1,
            "#tree_size:foo": 1,
            "baz": "qux",
            "comcom": 123,
            "foo": "bar",
          },
          "decrement": {
            "#num_parents": 1,
            "#num_parents:value": 1,
            "#tree_bytes": 338,
            "#tree_bytes:value": 168,
            "#tree_height": 1,
            "#tree_height:value": 0,
            "#tree_size": 2,
            "#tree_size:value": 1,
            "value": 20,
          },
          "increment": {
            "#num_parents": 1,
            "#num_parents:value": 1,
            "#tree_bytes": 338,
            "#tree_bytes:value": 168,
            "#tree_height": 1,
            "#tree_height:value": 0,
            "#tree_size": 2,
            "#tree_size:value": 1,
            "value": 20,
          },
          "nested": {
            "#num_parents": 1,
            "#tree_bytes": 502,
            "#tree_height": 2,
            "#tree_size": 3,
            "far": {
              "#num_parents": 1,
              "#num_parents:down": 1,
              "#tree_bytes": 336,
              "#tree_bytes:down": 168,
              "#tree_height": 1,
              "#tree_height:down": 0,
              "#tree_size": 2,
              "#tree_size:down": 1,
              "down": 456,
            }
          },
          "shards": {
            "#num_parents": 1,
            "#tree_bytes": 1622,
            "#tree_height": 3,
            "#tree_size": 9,
            "disabled_shard": {
              "#num_parents": 1,
              "#num_parents:path": 1,
              "#tree_bytes": 704,
              "#tree_bytes:path": 168,
              "#tree_height": 2,
              "#tree_height:path": 0,
              "#tree_size": 4,
              "#tree_size:path": 1,
              ".shard": {
                "#num_parents": 1,
                "#num_parents:sharding_enabled": 1,
                "#tree_bytes": 356,
                "#tree_bytes:sharding_enabled": 164,
                "#tree_height": 1,
                "#tree_height:sharding_enabled": 0,
                "#tree_size": 2,
                "#tree_size:sharding_enabled": 1,
                "sharding_enabled": false,
              },
              "path": 10,
            },
            "enabled_shard": {
              "#num_parents": 1,
              "#num_parents:path": 1,
              "#tree_bytes": 704,
              "#tree_bytes:path": 168,
              "#tree_height": 2,
              "#tree_height:path": 0,
              "#tree_size": 4,
              "#tree_size:path": 1,
              ".shard": {
                "#num_parents": 1,
                "#num_parents:sharding_enabled": 1,
                "#tree_bytes": 356,
                "#tree_bytes:sharding_enabled": 164,
                "#tree_height": 1,
                "#tree_height:sharding_enabled": 0,
                "#tree_size": 2,
                "#tree_size:sharding_enabled": 1,
                "sharding_enabled": true,
              },
              "path": 10
            }
          }
        })
      });

      it('getValue to retrieve value with include_proof', () => {
        assert.deepEqual(node.db.getValue('/apps/test', { includeProof: true }), {
          "#state_ph": "0x147ecaf6c56166b504cce1cbe690bc1d14c8e2f68c7937416eac32aaf97ecf2c",
          "ai": {
            "#state_ph": "0x4c6895fec04b40d425d1542b7cfb2f78b0e8cd2dc4d35d0106100f1ecc168cec",
            "#state_ph:baz": "0x74e6d7e9818333ef5d6f4eb74dc0ee64537c9e142e4fe55e583476a62b539edf",
            "#state_ph:comcom": "0x90840252cdaacaf90d95c14f9d366f633fd53abf7a2c359f7abfb7f651b532b5",
            "#state_ph:foo": "0xea86f62ccb8ed9240afb6c9090be001ef7859bf40e0782f2b8d3579b3d8310a4",
            "baz": "qux",
            "comcom": 123,
            "foo": "bar",
          },
          "decrement": {
            "#state_ph": "0x11d1aa4946a3e44e3d467d4da85617d56aecd2559fdd6d9e5dd8fb6b5ded71b8",
            "#state_ph:value": "0xc3c28ad8a683cb7f3d8cf05420651e08e14564e18a1805fe33720cd9d7d2deb2",
            "value": 20,
          },
          "increment": {
            "#state_ph": "0x11d1aa4946a3e44e3d467d4da85617d56aecd2559fdd6d9e5dd8fb6b5ded71b8",
            "#state_ph:value": "0xc3c28ad8a683cb7f3d8cf05420651e08e14564e18a1805fe33720cd9d7d2deb2",
            "value": 20,
          },
          "nested": {
            "#state_ph": "0x8763e301c728729e38c1f5500a2af7163783bdf0948a7baf7bc87b35f33b347f",
            "far": {
              "#state_ph": "0xc8b9114b37d8ece398eb8dde73b00bf5037f6b11d97eff11b5212b5f30f32417",
              "#state_ph:down": "0x4611868537ffbffa17f70f8ddb7cf5aacc6b4d1b32817315f631a2c7d6b6481d",
              "down": 456,
            }
          },
          "shards": {
            "#state_ph": "0xbe0fbf9fec28b21de391ebb202517a420f47ee199aece85153e8fb4d9453f223",
            "disabled_shard": {
              "#state_ph": "0xc0d5ac161046ecbf67ae597b3e1d96e53e78d71c0193234f78f2514dbf952161",
              "#state_ph:path": "0xd024945cba75febe35837d24c977a187a6339888d99d505c1be63251fec52279",
              ".shard": {
                "#state_ph": "0x1908ddba2acbc0181cdc29b035c7ce371d3ed38f39b39cad3eb7e0704ccaa57b",
                "#state_ph:sharding_enabled": "0x055600b34c3a8a69ea5dfc2cd2f92336933be237c8b265089f3114b38b4a540a",
                "sharding_enabled": false,
              },
              "path": 10
            },
            "enabled_shard": {
              "#state_ph": "0x4b754c4a1a1f99d1ad9bc4a1edbeb7e2ceec6828313b52f8b880ee1cded3e4d3",
              "#state_ph:path": "0xd024945cba75febe35837d24c977a187a6339888d99d505c1be63251fec52279",
              ".shard": {
                "#state_ph": "0xc308394fc297eb293cbef148c58665e9208a96e3664e86695db9d29c273dae96",
                "#state_ph:sharding_enabled": "0x1eafc1e61d5b7b28f90a34330bf62265eeb466e012aa7318098003f37e4c61cc",
                "sharding_enabled": true,
              },
              "path": 10
            }
          }
        });
      });

      it('getValue to retrieve value with include_version', () => {
        assert.deepEqual(node.db.getValue('/apps/test', { includeVersion: true }), {
          "#version": "NODE:0",
          "ai": {
            "#version": "NODE:0",
            "#version:baz": "NODE:0",
            "#version:comcom": "NODE:0",
            "#version:foo": "NODE:0",
            "baz": "qux",
            "comcom": 123,
            "foo": "bar",
          },
          "decrement": {
            "#version": "NODE:0",
            "#version:value": "NODE:0",
            "value": 20,
          },
          "increment": {
            "#version": "NODE:0",
            "#version:value": "NODE:0",
            "value": 20,
          },
          "nested": {
            "#version": "NODE:0",
            "far": {
              "#version": "NODE:0",
              "#version:down": "NODE:0",
              "down": 456,
            }
          },
          "shards": {
            "#version": "NODE:0",
            "disabled_shard": {
              "#version": "NODE:0",
              "#version:path": "NODE:0",
              ".shard": {
                "#version": "NODE:0",
                "#version:sharding_enabled": "NODE:0",
                "sharding_enabled": false,
              },
              "path": 10,
            },
            "enabled_shard": {
              "#version": "NODE:0",
              "#version:path": "NODE:0",
              ".shard": {
                "#version": "NODE:0",
                "#version:sharding_enabled": "NODE:0",
                "sharding_enabled": true,
              },
              "path": 10,
            }
          }
        });
      });

      it("getValue to retrieve shallow nested value", () => {
        assert.deepEqual(node.db.getValue("/apps/test/ai/comcom"), dbValues["ai"]["comcom"])
      })

      it("getValue to retrieve deeply nested value", () => {
        assert.deepEqual(node.db.getValue("/apps/test/nested/far/down"), dbValues["nested"]["far"]["down"])
      })

      it("getValue to fail with value not present", () => {
        expect(node.db.getValue("/apps/test/nested/far/down/to/nowhere")).to.equal(null)
      })

      it("getValue to fail with value not present with is_shallow", () => {
        expect(node.db.getValue("/apps/test/nested/far/down/to/nowhere", true, false)).to.equal(null)
      })
    })

    describe("setValue:", () => {
      it("setValue to overwrite nested value", () => {
        const newValue = {"new": 12345}
        expect(node.db.setValue("/apps/test/nested/far/down", newValue).code).to.equal(0)
        assert.deepEqual(node.db.getValue("/apps/test/nested/far/down"), newValue)
      })

      it("setValue to create new path in database", () => {
        const newValue = 12345
        expect(node.db.setValue("/apps/test/new/unchartered/nested/path", newValue).code).to.equal(0)
        expect(node.db.getValue("/apps/test/new/unchartered/nested/path")).to.equal(newValue)
      })

      it("setValue to write invalid object", () => {
        assert.deepEqual(node.db.setValue("/apps/test/unchartered/nested/path2", {array: []}), {
          "code": 10101,
          "error_message": "Invalid object for states: /array",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getValue("/apps/test/unchartered/nested/path2")).to.equal(null)

        assert.deepEqual(node.db.setValue("/apps/test/unchartered/nested/path2", {'.': 'x'}), {
          "code": 10101,
          "error_message": "Invalid object for states: /.",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getValue("/apps/test/unchartered/nested/path2")).to.equal(null)

        assert.deepEqual(node.db.setValue("/apps/test/unchartered/nested/path2", {'$': 'x'}), {
          "code": 10101,
          "error_message": "Invalid object for states: /$",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getValue("/apps/test/unchartered/nested/path2")).to.equal(null)

        assert.deepEqual(node.db.setValue("/apps/test/unchartered/nested/path2", {'*a': 'x'}), {
          "code": 10101,
          "error_message": "Invalid object for states: /*a",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getValue("/apps/test/unchartered/nested/path2")).to.equal(null)

        assert.deepEqual(node.db.setValue("/apps/test/unchartered/nested/path2", {'a*': 'x'}), {
          "code": 10101,
          "error_message": "Invalid object for states: /a*",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getValue("/apps/test/unchartered/nested/path2")).to.equal(null)
      })

      it("setValue to write with invalid path", () => {
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/.", 12345), {
          "code": 10102,
          "error_message": "Invalid value path: /apps/test/new/unchartered/nested/.",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/$", 12345), {
          "code": 10102,
          "error_message": "Invalid value path: /apps/test/new/unchartered/nested/$",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/a*", 12345), {
          "code": 10102,
          "error_message": "Invalid value path: /apps/test/new/unchartered/nested/a*",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/*a", 12345), {
          "code": 10102,
          "error_message": "Invalid value path: /apps/test/new/unchartered/nested/*a",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/#", 12345), {
          "code": 10102,
          "error_message": "Invalid value path: /apps/test/new/unchartered/nested/#",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/{", 12345), {
          "code": 10102,
          "error_message": "Invalid value path: /apps/test/new/unchartered/nested/{",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/}", 12345), {
          "code": 10102,
          "error_message": "Invalid value path: /apps/test/new/unchartered/nested/}",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/[", 12345), {
          "code": 10102,
          "error_message": "Invalid value path: /apps/test/new/unchartered/nested/[",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/]", 12345), {
          "code": 10102,
          "error_message": "Invalid value path: /apps/test/new/unchartered/nested/]",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/\x00", 12345), {
          "code": 10102,
          "error_message": "Invalid value path: /apps/test/new/unchartered/nested/\x00",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/\x1F", 12345), {
          "code": 10102,
          "error_message": "Invalid value path: /apps/test/new/unchartered/nested/\x1F",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/\x7F", 12345), {
          "code": 10102,
          "error_message": "Invalid value path: /apps/test/new/unchartered/nested/\x7F",
          "bandwidth_gas_amount": 1
        });
      })

      // For details, see test case 'evalRule to evaluate a rule with subtree rules'.
      it("setValue to write with subtree rules", () => {
        assert.deepEqual(node.db.setValue("/apps/test/test_rule/some/upper/path", 'some value'), {
          "bandwidth_gas_amount": 1,
          "code": 12101,
          "error_message": "Non-empty (1) subtree rules for value path '/apps/test/test_rule/some/upper/path'': [\"/deeper/path\"]",
        });
      })

      it("setValue to write with non-writable path with sharding", () => {
        assert.deepEqual(node.db.setValue("/apps/test/shards/enabled_shard", 20), {
          "code": 10103,
          "error_message": "Non-writable path with shard config: /values/apps/test/shards/enabled_shard",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/shards/enabled_shard/path", 20), {
          "code": 10103,
          "error_message": "Non-writable path with shard config: /values/apps/test/shards/enabled_shard",
          "bandwidth_gas_amount": 1
        });
      })

      it("setValue to write with writable path with sharding", () => {
        expect(node.db.setValue("/apps/test/shards/disabled_shard", 20).code).to.equal(0);
        expect(node.db.getValue("/apps/test/shards/disabled_shard")).to.equal(20)
        expect(node.db.setValue("/apps/test/shards/disabled_shard/path", 20).code).to.equal(0);
        expect(node.db.getValue("/apps/test/shards/disabled_shard/path")).to.equal(20)
      })

      it("setValue to write more than gc_max_siblings in state rule config", () => {
        // Set state rule
        expect(node.db.setRule("/apps/test/test_rule/some/path/more/than/max/$sibling", {
          ".rule": {
            "state": {
              "gc_max_siblings": 1
            }
          }
        }).code).to.equal(0);
        assert.deepEqual(node.db.getRule("/apps/test/test_rule/some/path/more/than/max/$sibling"), {
          ".rule": {
            "state": {
              "gc_max_siblings": 1
            }
          }
        });
        // Set 1st child
        expect(node.db.setValue("/apps/test/test_rule/some/path/more/than/max/child1", 1, { addr: 'abcd' },
            null, { extra: { executed_at: 1234567890000 }}).code).to.equal(0);
        assert.deepEqual(node.db.getValue("/apps/test/test_rule/some/path/more/than/max"), { "child1": 1 });
        // Set 2nd child
        expect(node.db.setValue("/apps/test/test_rule/some/path/more/than/max/child2", 2, { addr: 'abcd' },
            null, { extra: { executed_at: 1234567890000 }}).code).to.equal(0);
        // 1st child removed
        assert.deepEqual(node.db.getValue("/apps/test/test_rule/some/path/more/than/max"), { "child2": 2 });
      })

      it("setValue to write value with more than max_children keys", () => {
        expect(node.db.setRule("/apps/test/test_rule/some/path/more/than/max", {
          ".rule": {
            "state": {
              "max_children": 1
            }
          }
        }).code).to.equal(0);
        assert.deepEqual(node.db.setValue("/apps/test/test_rule/some/path/more/than/max", {
            child1: 1,
            child2: 2
          }, { addr: 'abcd' },
          null, { extra: { executed_at: 1234567890000 }}), {
          "code": 12104,
          "error_message": "State rule evaluated false: [{\"max_children\":1}] at '/apps/test/test_rule/some/path/more/than/max' for value path '/apps/test/test_rule/some/path/more/than/max' with newValue '{\"child1\":1,\"child2\":2}'",
          "bandwidth_gas_amount": 1
        });
      })
    })

    describe("incValue:", () => {
      it("incValue to increase value successfully", () => {
        expect(node.db.incValue("/apps/test/increment/value", 10).code).to.equal(0)
        expect(node.db.getValue("/apps/test/increment/value")).to.equal(30)
      })

      it("incValue to return error code and leaving value unchanged if delta is not numerical", () => {
        expect(node.db.incValue("/apps/test/increment/value", '10').code).to.equal(10201)
        expect(node.db.getValue("/apps/test/increment/value")).to.equal(20)
      })

      it("incValue to return error code and leaving value unchanged if path is not numerical", () => {
        expect(node.db.incValue("/apps/test/ai/foo", 10).code).to.equal(10201)
        expect(node.db.getValue("/apps/test/ai/foo")).to.equal("bar")
      })

      it("incValue to create and increase given path from 0 if not currently in database", () => {
        node.db.incValue("/apps/test/completely/new/path/test", 100);
        expect(node.db.getValue("/apps/test/completely/new/path/test")).to.equal(100)
      })

      it("incValue to return error code with non-writable path with sharding", () => {
        assert.deepEqual(node.db.incValue("/apps/test/shards/enabled_shard/path", 5), {
          "code": 10103,
          "error_message": "Non-writable path with shard config: /values/apps/test/shards/enabled_shard",
          "bandwidth_gas_amount": 1
        });
      })

      it("incValue to increase with writable path with sharding", () => {
        expect(node.db.incValue("/apps/test/shards/disabled_shard/path", 5).code).to.equal(0);
        expect(node.db.getValue("/apps/test/shards/disabled_shard/path")).to.equal(15)
      })
    })

    describe("decValue:", () => {
      it("decValue to decrease value successfully", () => {
        expect(node.db.decValue("/apps/test/decrement/value", 10).code).to.equal(0)
        expect(node.db.getValue("/apps/test/decrement/value")).to.equal(10)
      })

      it("decValue to return error code and leaving value unchanged if delta is not numerical", () => {
        expect(node.db.decValue("/apps/test/decrement/value", '10').code).to.equal(10301)
        expect(node.db.getValue("/apps/test/decrement/value")).to.equal(20)
      })

      it("decValue to return error code and leaving value unchanged if path is not numerical", () => {
        expect(node.db.decValue("/apps/test/ai/foo", 10).code).to.equal(10301)
        expect(node.db.getValue("/apps/test/ai/foo")).to.equal("bar")
      })

      it("decValue to create and decrease given path from 0 if not currently in database", () => {
        node.db.decValue("/apps/test/completely/new/path/test", 100);
        expect(node.db.getValue("/apps/test/completely/new/path/test")).to.equal(-100)
      })

      it("decValue to return error code with non-writable path with sharding", () => {
        assert.deepEqual(node.db.decValue("/apps/test/shards/enabled_shard/path", 5), {
          "code": 10103,
          "error_message": "Non-writable path with shard config: /values/apps/test/shards/enabled_shard",
          "bandwidth_gas_amount": 1
        });
      })

      it("decValue to decrease with writable path with sharding", () => {
        expect(node.db.decValue("/apps/test/shards/disabled_shard/path", 5).code).to.equal(0);
        expect(node.db.getValue("/apps/test/shards/disabled_shard/path")).to.equal(5)
      })
    })
  });

  describe("Function operations", () => {
    describe("getFunction:", () => {
      it("getFunction to retrieve non-existing function config", () => {
        expect(node.db.getFunction("/apps/test/test_function/other/function/path")).to.equal(null);
        expect(node.db.getFunction("/apps/test/test_function/some/other_path")).to.equal(null);
      })

      it("getFunction to retrieve existing function config", () => {
        assert.deepEqual(node.db.getFunction("/apps/test/test_function/some/path"), {
          ".function": {
            "fid": {
              "function_url": "https://events.ainetwork.ai/trigger",
              "function_id": "fid",
              "function_type": "REST",
            }
          },
          "deeper": {
            "path": {
              ".function": {
                "fid_deeper": {
                  "function_url": "https://events.ainetwork.ai/trigger",
                  "function_id": "fid_deeper",
                  "function_type": "REST",
                }
              }
            }
          }
        });
      })

      it("getFunction to retrieve existing function config with is_shallow", () => {
        assert.deepEqual(node.db.getFunction('/apps/test/test_function', { isShallow: true }), {
          some: {
            "#state_ph": "0x637e4fb9edc3f569e3a4bced647d706bf33742bca14b1aae3ca01fd5b44120d5"
          },
        });
      })
    })

    describe("matchFunction:", () => {
      it("matchFunction to match existing variable path function", () => {
        assert.deepEqual(node.db.matchFunction("/apps/test/test_function/some/var_path"), {
          "matched_path": {
            "target_path": "/apps/test/test_function/some/$var_path",
            "ref_path": "/apps/test/test_function/some/var_path",
            "path_vars": {
              "$var_path": "var_path"
            },
          },
          "matched_config": {
            "config": {
              "fid_var": {
                "function_type": "REST",
                "function_id": "fid_var",
                "function_url": "https://events.ainetwork.ai/trigger",
              },
            },
            "path": "/apps/test/test_function/some/$var_path"
          },
          "subtree_configs": []
        });
      })

      it("matchFunction to match existing non-variable path function", () => {
        assert.deepEqual(node.db.matchFunction("/apps/test/test_function/some/path"), {
          "matched_path": {
            "target_path": "/apps/test/test_function/some/path",
            "ref_path": "/apps/test/test_function/some/path",
            "path_vars": {},
          },
          "matched_config": {
            "config": {
              "fid": {
                "function_url": "https://events.ainetwork.ai/trigger",
                "function_id": "fid",
                "function_type": "REST",
              }
            },
            "path": "/apps/test/test_function/some/path"
          },
          "subtree_configs": [
            {
              "config": {
                "fid_deeper": {
                  "function_url": "https://events.ainetwork.ai/trigger",
                  "function_id": "fid_deeper",
                  "function_type": "REST",
                }
              },
              "path": "/deeper/path"
            }
          ]
        });
        assert.deepEqual(node.db.matchFunction("/apps/test/test_function/some/path/deeper/path"), {
          "matched_path": {
            "target_path": "/apps/test/test_function/some/path/deeper/path",
            "ref_path": "/apps/test/test_function/some/path/deeper/path",
            "path_vars": {},
          },
          "matched_config": {
            "config": {
              "fid_deeper": {
                "function_url": "https://events.ainetwork.ai/trigger",
                "function_id": "fid_deeper",
                "function_type": "REST",
              }
            },
            "path": "/apps/test/test_function/some/path/deeper/path"
          },
          "subtree_configs": []
        });
      })

      it("matchFunction NOT to match existing closest non-variable path function", () => {
        assert.deepEqual(node.db.matchFunction("/apps/test/test_function/some/path/deeper"), {
          "matched_path": {
            "target_path": "/apps/test/test_function/some/path/deeper",
            "ref_path": "/apps/test/test_function/some/path/deeper",
            "path_vars": {},
          },
          "matched_config": {
            "config": null,
            "path": "/apps/test/test_function/some/path/deeper"
          },
          "subtree_configs": [
            {
              "config": {
                "fid_deeper": {
                  "function_url": "https://events.ainetwork.ai/trigger",
                  "function_id": "fid_deeper",
                  "function_type": "REST",
                }
              },
              "path": "/path"
            }
          ]
        });
      })
    })

    describe("setFunction:", () => {
      it("setFunction to overwrite existing function config with simple path", () => {
        const functionConfig = {
          ".function": {
            "fid": {
              "function_url": "http://echo-bot.ainetwork.ai/trigger",
              "function_id": "fid",
              "function_type": "REST",
            }
          }
        };
        expect(node.db.setFunction("/apps/test/test_function/some/path", functionConfig).code)
            .to.equal(0);
        assert.deepEqual(node.db.getFunction("/apps/test/test_function/some/path"), {
          ".function": {
            "fid": {
              "function_url": "http://echo-bot.ainetwork.ai/trigger",  // modified
              "function_id": "fid",
              "function_type": "REST",
            }
          },
          "deeper": {
            "path": {
              ".function": {
                "fid_deeper": {
                  "function_url": "https://events.ainetwork.ai/trigger",
                  "function_id": "fid_deeper",
                  "function_type": "REST",
                }
              }
            }
          }
        })
      })

      it("setFunction to write with variable path", () => {
        const functionConfig = {
          ".function": {
            "fid_other": {
              "function_url": "http://echo-bot.ainetwork.ai/trigger",
              "function_id": "fid_other",
              "function_type": "REST",
            }
          }
        };
        expect(node.db.setFunction("/apps/test/test_function/some/$variable/path", functionConfig).code)
            .to.equal(0);
        assert.deepEqual(
            node.db.getFunction("/apps/test/test_function/some/$variable/path"), functionConfig)
      })

      it("setFunction to write invalid object", () => {
        assert.deepEqual(node.db.setFunction("/apps/test/test_function/some/path2", {array: []}), {
          "code": 10401,
          "error_message": "Invalid object for states: /array",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getFunction("/apps/test/new2/unchartered/nested/path2")).to.equal(null)

        assert.deepEqual(node.db.setFunction("/apps/test/test_function/some/path2", {'.': 'x'}), {
          "code": 10401,
          "error_message": "Invalid object for states: /.",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getFunction("/apps/test/new2/unchartered/nested/path2")).to.equal(null)
      })

      it("setFunction to write invalid function tree", () => {
        const functionTreeBefore = node.db.getOwner("/apps/test/test_function/some/path");
        assert.deepEqual(node.db.setFunction(
            "/apps/test/test_function/some/path", { ".function": null }), {
          "code": 10403,
          "error_message": "Invalid function tree: /.function",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.getOwner("/apps/test/test_function/some/path"), functionTreeBefore);
      })

      it("setFunction to write with invalid path", () => {
        assert.deepEqual(node.db.setFunction(
            "/apps/test/test_function/some/path/.", {
              ".function": {
                "fid": {
                  "function_url": "http://echo-bot.ainetwork.ai/trigger",
                  "function_id": "fid",
                  "function_type": "REST",
                }
              }
            }), {
          "code": 10402,
          "error_message": "Invalid function path: /apps/test/test_function/some/path/.",
          "bandwidth_gas_amount": 1
        });
      })

      // For details, see test case 'evalOwner to evaluate write_function permission with subtree owners'.
      it("setFunction to write with subtree owners with isMerge = false", () => {
        const functionConfig = {
          ".function": {
            "fid_other": {
              "function_url": "http://echo-bot.ainetwork.ai/trigger",
              "function_id": "fid_other",
              "function_type": "REST",
            }
          }
        };
        assert.deepEqual(node.db.setFunction(
            "/apps/test/test_owner/some/upper/path/deeper", functionConfig), {
          "code": 12401,
          "error_message": "Non-empty (1) subtree owners for function path '/apps/test/test_owner/some/upper/path/deeper': [\"/path\"]",
          "bandwidth_gas_amount": 1,
        });
      })

      // For details, see test case 'evalOwner to evaluate write_function permission with subtree owners'.
      it("setFunction to write with subtree owners with isMerge = true", () => {
        const functionConfig = {
          ".function": {
            "fid_other": {
              "function_url": "http://echo-bot.ainetwork.ai/trigger",
              "function_id": "fid_other",
              "function_type": "REST",
            }
          }
        };
        assert.deepEqual(node.db.setFunction(
            "/apps/test/test_owner/some/upper/path", functionConfig,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }), {
          "code": 0,
          "bandwidth_gas_amount": 1,
        });
      })
    })
  });

  describe("Rule operations", () => {
    describe("getRule:", () => {
      it("getRule to retrieve non-existing rule config", () => {
        expect(node.db.getRule("/test/test_rule/other/rule/path")).to.equal(null);
        expect(node.db.getRule("/test/test_rule/some/other_path")).to.equal(null);
      })

      it("getRule to retrieve existing rule config", () => {
        assert.deepEqual(node.db.getRule("/apps/test/test_rule/some/upper/path"), {
          ".rule": {
            "write": "auth.addr === 'abcd'"
          },
          "deeper": {
            "path": {
              ".rule": {
                "write": "auth.addr === 'ijkl'"
              }
            }
          }
        });
      })

      it('getRule to retrieve existing rule config with is_shallow', () => {
        assert.deepEqual(node.db.getRule('/apps/test/test_rule', { isShallow: true }), {
          "some": {
            "#state_ph": "0x2be40be7d05dfe5a88319f6aa0f1a7eb61691f8f5fae8c7c993f10892cd29038"
          },
        });
      });
    })

    describe("matchRule:", () => {
      it("matchRule to match a variable path rule", () => {
        assert.deepEqual(node.db.matchRule("/apps/test/test_rule/some/var_path"), {
          "write": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/$var_path",
              "ref_path": "/apps/test/test_rule/some/var_path",
              "path_vars": {
                "$var_path": "var_path"
              },
            },
            "matched_config": {
              "config": {
                "write": "auth.addr !== 'abcd'"
              },
              "path": "/apps/test/test_rule/some/$var_path"
            },
            "subtree_configs": []
          },
          "state": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/$var_path",
              "ref_path": "/apps/test/test_rule/some/var_path",
              "path_vars": {
                "$var_path": "var_path"
              }
            },
            "matched_config": {
              "path": "/",
              "config": null
            }
          }
        });
      })

      it("matchRule to match a non-variable path rule", () => {
        assert.deepEqual(node.db.matchRule("/apps/test/test_rule/some/path"), {
          "write": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/path",
              "ref_path": "/apps/test/test_rule/some/path",
              "path_vars": {},
            },
            "matched_config": {
              "config": {
                "write": "auth.addr === 'abcd'"
              },
              "path": "/apps/test/test_rule/some/path"
            },
            "subtree_configs": []
          },
          "state": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/path",
              "ref_path": "/apps/test/test_rule/some/path",
              "path_vars": {}
            },
            "matched_config": {
              "path": "/",
              "config": null
            }
          }
        });
        assert.deepEqual(node.db.matchRule("/apps/test/test_rule/some/upper/path/deeper/path"), {
          "write": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/upper/path/deeper/path",
              "ref_path": "/apps/test/test_rule/some/upper/path/deeper/path",
              "path_vars": {},
            },
            "matched_config": {
              "config": {
                "write": "auth.addr === 'ijkl'"
              },
              "path": "/apps/test/test_rule/some/upper/path/deeper/path"
            },
            "subtree_configs": []
          },
          "state": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/upper/path/deeper/path",
              "ref_path": "/apps/test/test_rule/some/upper/path/deeper/path",
              "path_vars": {}
            },
            "matched_config": {
              "path": "/",
              "config": null
            }
          }
        });
      })

      it("matchRule to match a closest variable path rule", () => {
        assert.deepEqual(node.db.matchRule("/apps/test/test_rule/some/var_path/subpath"), {
          "write": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/$var_path",
              "ref_path": "/apps/test/test_rule/some/var_path",
              "path_vars": {
                "$var_path": "var_path"
              }
            },
            "matched_config": {
              "config": {
                "write": "auth.addr !== 'abcd'"

              },
              "path": "/apps/test/test_rule/some/$var_path"

            },
            "subtree_configs": []
          },
          "state": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/$var_path",
              "ref_path": "/apps/test/test_rule/some/var_path",
              "path_vars": {
                "$var_path": "var_path"
              }
            },
            "matched_config": {
              "path": "/",
              "config": null
            }
          }
        });
      })

      it("matchRule to match a closest non-variable path rule", () => {
        assert.deepEqual(node.db.matchRule("/apps/test/test_rule/some/path/subpath"), {
          "write": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/path",
              "ref_path": "/apps/test/test_rule/some/path",
              "path_vars": {},
            },
            "matched_config": {
              "config": {
                "write": "auth.addr === 'abcd'"
              },
              "path": "/apps/test/test_rule/some/path"
            },
            "subtree_configs": []
          },
          "state": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/path",
              "ref_path": "/apps/test/test_rule/some/path",
              "path_vars": {}
            },
            "matched_config": {
              "path": "/",
              "config": null
            }
          }
        });
      })

      it("matchRule to match a rule without subtree rules", () => {
        assert.deepEqual(node.db.matchRule("/apps/test/test_rule/some/upper/path/subpath"), {
          "write": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/upper/path",
              "ref_path": "/apps/test/test_rule/some/upper/path",
              "path_vars": {},
            },
            "matched_config": {
              "config": {
                "write": "auth.addr === 'abcd'"
              },
              "path": "/apps/test/test_rule/some/upper/path"
            },
            "subtree_configs": []
          },
          "state": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/upper/path",
              "ref_path": "/apps/test/test_rule/some/upper/path",
              "path_vars": {}
            },
            "matched_config": {
              "path": "/",
              "config": null
            }
          }
        });
      })

      it("matchRule to match a rule with subtree rules", () => {
        assert.deepEqual(node.db.matchRule("/apps/test/test_rule/some/upper/path"), {
          "write": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/upper/path",
              "ref_path": "/apps/test/test_rule/some/upper/path",
              "path_vars": {},
            },
            "matched_config": {
              "config": {
                "write": "auth.addr === 'abcd'"
              },
              "path": "/apps/test/test_rule/some/upper/path"
            },
            "subtree_configs": [
              {
                "config": {
                  "write": "auth.addr === 'ijkl'"
                },
                "path": "/deeper/path"
              }
            ]
          },
          "state": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/upper/path",
              "ref_path": "/apps/test/test_rule/some/upper/path",
              "path_vars": {}
            },
            "matched_config": {
              "path": "/",
              "config": null
            }
          }
        });
      })
    })

    describe("evalRule:", () => {
      const timestamp = 1234567890000;

      it("evalRule to evaluate a variable path rule", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/test/test_rule/some/var_path", 'value', { addr: 'abcd' }, timestamp)), {
          "code": 12103,
          "error_message": "Write rule evaluated false: [auth.addr !== 'abcd'] at '/apps/test/test_rule/some/$var_path' for value path '/apps/test/test_rule/some/var_path' with path vars '{\"$var_path\":\"var_path\"}', data 'null', newData '\"value\"', auth '{\"addr\":\"abcd\"}', timestamp '1234567890000'",
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/test/test_rule/some/var_path", 'value', { addr: 'other' }, timestamp)), {
          "code": 0,
          "matched": "erased",
        });
      })

      it("evalRule to evaluate a non-variable path rule", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/test/test_rule/some/path", 'value', { addr: 'abcd' }, timestamp)), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/test/test_rule/some/path", 'value', { addr: 'other' }, timestamp)), {
          "code": 12103,
          "error_message": "Write rule evaluated false: [auth.addr === 'abcd'] at '/apps/test/test_rule/some/path' for value path '/apps/test/test_rule/some/path' with path vars '{}', data 'null', newData '\"value\"', auth '{\"addr\":\"other\"}', timestamp '1234567890000'",
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/test/test_rule/some/upper/path/deeper/path", 'value', { addr: 'ijkl' }, timestamp)), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/test/test_rule/some/upper/path/deeper/path", 'value', { addr: 'other' }, timestamp)), {
          "code": 12103,
          "error_message": "Write rule evaluated false: [auth.addr === 'ijkl'] at '/apps/test/test_rule/some/upper/path/deeper/path' for value path '/apps/test/test_rule/some/upper/path/deeper/path' with path vars '{}', data 'null', newData '\"value\"', auth '{\"addr\":\"other\"}', timestamp '1234567890000'",
          "matched": "erased",
        });
      })

      it("evalRule to evaluate a closest variable path rule", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/test/test_rule/some/var_path/subpath", 'value', { addr: 'abcd' }, timestamp)), {
          "code": 12103,
          "error_message": "Write rule evaluated false: [auth.addr !== 'abcd'] at '/apps/test/test_rule/some/$var_path' for value path '/apps/test/test_rule/some/var_path/subpath' with path vars '{\"$var_path\":\"var_path\"}', data 'null', newData '\"value\"', auth '{\"addr\":\"abcd\"}', timestamp '1234567890000'",
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/test/test_rule/some/var_path/subpath", 'value', { addr: 'other' }, timestamp)), {
          "code": 0,
          "matched": "erased",
        });
      })

      it("evalRule to evaluate a closest non-variable rule", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/test/test_rule/some/path/subpath", 'value', { addr: 'abcd' }, timestamp)), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/test/test_rule/some/path/subpath", 'value', { addr: 'other' }, timestamp)), {
          "code": 12103,
          "error_message": "Write rule evaluated false: [auth.addr === 'abcd'] at '/apps/test/test_rule/some/path' for value path '/apps/test/test_rule/some/path/subpath' with path vars '{}', data 'null', newData '\"value\"', auth '{\"addr\":\"other\"}', timestamp '1234567890000'",
          "matched": "erased",
        });
      })

      it("evalRule to evaluate a rule without subtree rules", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/test/test_rule/some/upper/path/subpath", 'value', { addr: 'abcd' }, timestamp)), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/test/test_rule/some/upper/path/subpath", 'value', { addr: 'other' }, timestamp)), {
          "code": 12103,
          "error_message": "Write rule evaluated false: [auth.addr === 'abcd'] at '/apps/test/test_rule/some/upper/path' for value path '/apps/test/test_rule/some/upper/path/subpath' with path vars '{}', data 'null', newData '\"value\"', auth '{\"addr\":\"other\"}', timestamp '1234567890000'",
          "matched": "erased",
        });
      })

      it("evalRule to evaluate a rule with subtree rules", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/test/test_rule/some/upper/path", 'value', { addr: 'abcd' }, timestamp)), {
          "code": 12101,
          "error_message": "Non-empty (1) subtree rules for value path '/apps/test/test_rule/some/upper/path'': [\"/deeper/path\"]",
          "matched": "erased",
        });
      })
    })

    describe("setRule:", () => {
      it("setRule to overwrite existing rule config with simple path", () => {
        const ruleConfig = {
          ".rule": {
            "write": "auth.addr === 'xyz'"
          }
        };
        expect(node.db.setRule("/apps/test/test_rule/some/path", ruleConfig).code).to.equal(0);
        assert.deepEqual(node.db.getRule("/apps/test/test_rule/some/path"), ruleConfig);
      })

      it("setRule to write with variable path", () => {
        const ruleConfig = {
          ".rule": {
            "write": "auth.addr === 'xyz'"
          }
        };
        expect(node.db.setRule("/apps/test/test_rule/some/$variable/path", ruleConfig).code)
            .to.equal(0)
        assert.deepEqual(node.db.getRule("/apps/test/test_rule/some/$variable/path"), ruleConfig)
      })

      it("setRule to write invalid object", () => {
        assert.deepEqual(node.db.setRule("/apps/test/test_rule/some/path2", {array: []}), {
          "code": 10501,
          "error_message": "Invalid object for states: /array",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getRule("/apps/test/test_rule/some/path2")).to.equal(null)

        assert.deepEqual(node.db.setRule("/apps/test/test_rule/some/path2", {'.': 'x'}), {
          "code": 10501,
          "error_message": "Invalid object for states: /.",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getRule("/apps/test/test_rule/some/path2")).to.equal(null)
      })

      it("setRule to write invalid rule tree", () => {
        const ruleTreeBefore = node.db.getRule("/apps/test/test_rule/some/path");
        assert.deepEqual(node.db.setRule(
            "/apps/test/test_rule/some/path",
            {
              ".rule": {
                "write": {
                  "a": true
                }
              }
            }), {
          "code": 10503,
          "error_message": "Invalid rule tree: /.rule/write",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.getRule("/apps/test/test_rule/some/path"), ruleTreeBefore);
      })

      it("setRule to write invalid write rule with not-allowed top-level tokens", () => {
        const ruleTreeBefore = node.db.getRule("/apps/test/test_rule/some/path");
        assert.deepEqual(node.db.setRule(
            "/apps/test/test_rule/some/path",
            {
              ".rule": {
                "write": "invalid_top_level_token"
              }
            }), {
          "code": 10503,
          "error_message": "Invalid rule tree: /.rule/write",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.getRule("/apps/test/test_rule/some/path"), ruleTreeBefore);
      })

      it("setRule to write with invalid path", () => {
        assert.deepEqual(node.db.setRule("/apps/test/test_rule/some/path/.",
            {
              ".rule": {
                "write": "auth.addr === 'xyz'"
              }
            }), {
          "code": 10502,
          "error_message": "Invalid rule path: /apps/test/test_rule/some/path/.",
          "bandwidth_gas_amount": 1
        });
      })

      it("setRule to write state rule", () => {
        const ruleConfig = {
          ".rule": {
            "state": {
              "max_children": 1
            }
          }
        };
        expect(node.db.setRule("/apps/test/test_rule/some/path", ruleConfig).code).to.equal(0);
        assert.deepEqual(node.db.getRule("/apps/test/test_rule/some/path"), {
          ".rule": {
            "state": {
              "max_children": 1
            },
            "write": "auth.addr === 'abcd'"
          }
        });
      })

      it("setRule to write both state and write rules", () => {
        const ruleConfig = {
          ".rule": {
            "state": {
              "max_children": 1
            },
            "write": "auth.addr === 'ijkl'"
          }
        };
        expect(node.db.setRule("/apps/test/test_rule/some/path", ruleConfig).code).to.equal(0);
        assert.deepEqual(node.db.getRule("/apps/test/test_rule/some/path"), {
          ".rule": {
            "state": {
              "max_children": 1
            },
            "write": "auth.addr === 'ijkl'" // updated
          }
        });
      })

      // For details, see test case 'evalOwner to evaluate write_rule permission with subtree owners'.
      it("setRule to write with subtree owners with isMerge = false", () => {
        assert.deepEqual(node.db.setRule("/apps/test/test_owner/some/upper/path/deeper",
            {
              ".rule": {
                "write": "auth.addr === 'xyz'"
              }
            }), {
          "code": 12301,
          "error_message": "Non-empty (1) subtree owners for rule path '/apps/test/test_owner/some/upper/path/deeper': [\"/path\"]",
          "bandwidth_gas_amount": 1,
        });
      })

      // For details, see test case 'evalOwner to evaluate write_rule permission with subtree owners'.
      it("setRule to write with subtree owners with isMerge = true", () => {
        assert.deepEqual(node.db.setRule("/apps/test/test_owner/some/upper/path", {
              ".rule": {
                "write": "auth.addr === 'xyz'"
              }
        }, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }), {
          "code": 0,
          "bandwidth_gas_amount": 1,
        });
      })
    })
  });

  describe("Owner operations", () => {
    describe("getOwner:", () => {
      it("getOwner to retrieve non-existing owner config", () => {
        expect(node.db.getOwner("/apps/test/test_owner/other/owner/path")).to.equal(null)
      })

      it("getOwner to retrieve existing owner config", () => {
        assert.deepEqual(node.db.getOwner("/apps/test/test_owner/some/upper/path"), {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": false,
                "write_function": false,
                "write_owner": false,
                "write_rule": false,
              },
              "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true,
              }
            }
          },
          "deeper": {
            "path": {
              ".owner": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_function": false,
                    "write_owner": false,
                    "write_rule": false,
                  },
                  "0x08Aed7AF9354435c38d52143EE50ac839D20696b": {
                    "branch_owner": true,
                    "write_function": true,
                    "write_owner": true,
                    "write_rule": true,
                  }
                }
              }
            }
          }
        });
      })

      it("getOwner to retrieve existing owner config with is_shallow", () => {
        assert.deepEqual(node.db.getOwner("/apps/test/test_owner", { isShallow: true }), {
          some: {
            "#state_ph": "0x6127bafe410040319f8d36b1ec0491e16db32d2d0be00f8fc28015c564582b80"
          },
        })
      })
    })

    describe("matchOwner:", () => {
      it("matchOwner to match existing owner with matching address", () => {
        assert.deepEqual(node.db.matchOwner("/apps/test/test_owner/some/path", 'write_owner', 'abcd'), {
          "matched_path": {
            "target_path": "/apps/test/test_owner/some/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": false,
                  "write_owner": false,
                  "write_rule": false
                },
                "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true
                }
              }
            },
            "path": "/apps/test/test_owner/some/path"
          },
          "subtree_configs": []
        });
        assert.deepEqual(node.db.matchOwner("/apps/test/test_owner/some/upper/path/deeper/path", 'write_owner', 'ijkl'), {
          "matched_path": {
            "target_path": "/apps/test/test_owner/some/upper/path/deeper/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": false,
                  "write_owner": false,
                  "write_rule": false
                },
                "0x08Aed7AF9354435c38d52143EE50ac839D20696b": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true
                }
              }
            },
            "path": "/apps/test/test_owner/some/upper/path/deeper/path"
          },
          "subtree_configs": []
        });
      })

      it("matchOwner to match existing owner without matching address", () => {
        assert.deepEqual(node.db.matchOwner("/apps/test/test_owner/some/path", 'write_owner', 'other'), {
          "matched_path": {
            "target_path": "/apps/test/test_owner/some/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": false,
                  "write_owner": false,
                  "write_rule": false
                },
                "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true
                }
              }
            },
            "path": "/apps/test/test_owner/some/path"
          },
          "subtree_configs": []
        });
        assert.deepEqual(node.db.matchOwner("/apps/test/test_owner/some/upper/path/deeper/path", 'write_owner', 'other'), {
          "matched_path": {
            "target_path": "/apps/test/test_owner/some/upper/path/deeper/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": false,
                  "write_owner": false,
                  "write_rule": false
                },
                "0x08Aed7AF9354435c38d52143EE50ac839D20696b": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true
                }
              }
            },
            "path": "/apps/test/test_owner/some/upper/path/deeper/path"
          },
          "subtree_configs": []
        });
      })

      it("matchOwner to match closest owner", () => {
        assert.deepEqual(node.db.matchOwner("/apps/test/test_owner/some/path/subpath", 'write_owner', 'abcd'), {
          "matched_path": {
            "target_path": "/apps/test/test_owner/some/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": false,
                  "write_owner": false,
                  "write_rule": false
                },
                "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true
                }
              }
            },
            "path": "/apps/test/test_owner/some/path"
          },
          "subtree_configs": []
        });
      })

      it("matchOwner to match an owner without subtree owners", () => {
        assert.deepEqual(node.db.matchOwner("/apps/test/test_owner/some/upper/path/subpath", 'write_owner', 'abcd'), {
          "matched_path": {
            "target_path": "/apps/test/test_owner/some/upper/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": false,
                  "write_owner": false,
                  "write_rule": false
                },
                "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true
                }
              }
            },
            "path": "/apps/test/test_owner/some/upper/path"
          },
          "subtree_configs": []
        });
      })

      it("matchOwner to match an owner with subtree owners", () => {
        assert.deepEqual(node.db.matchOwner("/apps/test/test_owner/some/upper/path", 'write_owner', 'abcd'), {
          "matched_path": {
            "target_path": "/apps/test/test_owner/some/upper/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": false,
                  "write_owner": false,
                  "write_rule": false
                },
                "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true
                }
              }
            },
            "path": "/apps/test/test_owner/some/upper/path"
          },
          "subtree_configs": [
            {
              "config": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_function": false,
                    "write_owner": false,
                    "write_rule": false,
                  },
                  "0x08Aed7AF9354435c38d52143EE50ac839D20696b": {
                    "branch_owner": true,
                    "write_function": true,
                    "write_owner": true,
                    "write_rule": true,
                  }
                }
              },
              "path": "/deeper/path"
            }
          ]
        });
      })
    })

    describe("evalOwner:", () => {
      it("evalOwner to evaluate existing owner with matching address", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path", 'write_rule',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path", 'write_function',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path", 'write_owner',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path", 'branch_owner',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 0,
          "matched": "erased",
        });
      })

      it("evalOwner to evaluate existing owner without matching address", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path", 'write_rule', { addr: 'other' })), {
          "code": 12302,
          "error_message": "write_rule permission evaluated false: [{\"branch_owner\":false,\"write_function\":false,\"write_owner\":false,\"write_rule\":false}] at '/apps/test/test_owner/some/path' for rule path '/apps/test/test_owner/some/path' with permission 'write_rule', auth '{\"addr\":\"other\"}'",
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path", 'write_function', { addr: 'other' })), {
          "code": 12402,
          "error_message": "write_function permission evaluated false: [{\"branch_owner\":false,\"write_function\":false,\"write_owner\":false,\"write_rule\":false}] at '/apps/test/test_owner/some/path' for function path '/apps/test/test_owner/some/path' with permission 'write_function', auth '{\"addr\":\"other\"}'",
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path", 'write_owner', { addr: 'other' })), {
          "code": 12502,
          "error_message": "write_owner permission evaluated false: [{\"branch_owner\":false,\"write_function\":false,\"write_owner\":false,\"write_rule\":false}] at '/apps/test/test_owner/some/path' for owner path '/apps/test/test_owner/some/path' with permission 'write_owner', auth '{\"addr\":\"other\"}'",
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path", 'branch_owner', { addr: 'other' })), {
          "code": 12502,
          "error_message": "write_owner permission evaluated false: [{\"branch_owner\":false,\"write_function\":false,\"write_owner\":false,\"write_rule\":false}] at '/apps/test/test_owner/some/path' for owner path '/apps/test/test_owner/some/path' with permission 'write_owner', auth '{\"addr\":\"other\"}'",
          "matched": "erased",
        });
      })

      it("evalOwner to evaluate closest owner with matching address", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path/subpath", 'write_rule',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path/subpath", 'write_function',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path/subpath", 'write_owner',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path/subpath", 'branch_owner',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 0,
          "matched": "erased",
        });
      })

      it("evalOwner to evaluate closest owner without matching address", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path/subpath", 'write_rule', { addr: 'other' })), {
          "code": 12302,
          "error_message": "write_rule permission evaluated false: [{\"branch_owner\":false,\"write_function\":false,\"write_owner\":false,\"write_rule\":false}] at '/apps/test/test_owner/some/path' for rule path '/apps/test/test_owner/some/path/subpath' with permission 'write_rule', auth '{\"addr\":\"other\"}'",
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path/subpath", 'write_function', { addr: 'other' })), {
          "code": 12402,
          "error_message": "write_function permission evaluated false: [{\"branch_owner\":false,\"write_function\":false,\"write_owner\":false,\"write_rule\":false}] at '/apps/test/test_owner/some/path' for function path '/apps/test/test_owner/some/path/subpath' with permission 'write_function', auth '{\"addr\":\"other\"}'",
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path/subpath", 'write_owner', { addr: 'other' })), {
          "code": 12502,
          "error_message": "branch_owner permission evaluated false: [{\"branch_owner\":false,\"write_function\":false,\"write_owner\":false,\"write_rule\":false}] at '/apps/test/test_owner/some/path' for owner path '/apps/test/test_owner/some/path/subpath' with permission 'branch_owner', auth '{\"addr\":\"other\"}'",
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/path/subpath", 'branch_owner', { addr: 'other' })), {
          "code": 12502,
          "error_message": "branch_owner permission evaluated false: [{\"branch_owner\":false,\"write_function\":false,\"write_owner\":false,\"write_rule\":false}] at '/apps/test/test_owner/some/path' for owner path '/apps/test/test_owner/some/path/subpath' with permission 'branch_owner', auth '{\"addr\":\"other\"}'",
          "matched": "erased",
        });
      })

      it("evalOwner to evaluate a owner without subtree owners", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/upper/path/subpath", 'write_rule',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/upper/path/subpath", 'write_function',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/upper/path/subpath", 'write_owner',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/upper/path/subpath", 'branch_owner',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 0,
          "matched": "erased",
        });
      })

      it("evalOwner to evaluate a owner with subtree owners", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/upper/path", 'write_rule',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 12301,
          "error_message": "Non-empty (1) subtree owners for rule path '/apps/test/test_owner/some/upper/path': [\"/deeper/path\"]",
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/upper/path", 'write_function',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 12401,
          "error_message": "Non-empty (1) subtree owners for function path '/apps/test/test_owner/some/upper/path': [\"/deeper/path\"]",
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/upper/path", 'write_owner',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 12501,
          "error_message": "Non-empty (1) subtree owners for owner path '/apps/test/test_owner/some/upper/path': [\"/deeper/path\"]",
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/upper/path", 'branch_owner',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' })), {
          "code": 12501,
          "error_message": "Non-empty (1) subtree owners for owner path '/apps/test/test_owner/some/upper/path': [\"/deeper/path\"]",
          "matched": "erased",
        });
      })

      it("evalOwner to evaluate a owner with subtree owners and isMerge = true", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/upper/path", 'write_rule',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, { isMerge: true })), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/upper/path", 'write_function',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, { isMerge: true })), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/upper/path", 'write_owner',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, { isMerge: true })), {
          "code": 0,
          "matched": "erased",
        });
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_owner/some/upper/path", 'branch_owner',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, { isMerge: true })), {
          "code": 0,
          "matched": "erased",
        });
      })

      it("evalOwner to evaluate a owner with invalid permission", () => {
        assert.deepEqual(node.db.evalOwner(
            "/apps/test/test_owner/some/upper/path", 'invalid permission',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }), {
          "code": 12201,
          "error_message": "Invalid permission 'invalid permission' for local path '/apps/test/test_owner/some/upper/path' with auth '{\"addr\":\"0x09A0d53FDf1c36A131938eb379b98910e55EEfe1\"}'",
          "matched": null,
        });
      })
    })

    describe("setOwner:", () => {
      const ownerTree = {
        ".owner": {
          "owners": {
            "*": {
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
              }
            }
          }
        }
      };

      it("setOwner to overwrite existing owner config", () => {
        assert.deepEqual(node.db.setOwner(
            "/apps/test/test_owner/some/path", ownerTree,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }), {
          "code": 0,
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.getOwner("/apps/test/test_owner/some/path"), ownerTree)
      })

      it("setOwner to write invalid object", () => {
        assert.deepEqual(node.db.setOwner("/apps/test/test_owner/some/path2", {array: []}), {
          "code": 10601,
          "error_message": "Invalid object for states: /array",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getOwner("/apps/test/test_owner/some/path2")).to.equal(null)

        assert.deepEqual(node.db.setOwner("/apps/test/test_owner/some/path2", {'.': 'x'}), {
          "code": 10601,
          "error_message": "Invalid object for states: /.",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getOwner("/apps/test/test_owner/some/path2")).to.equal(null)
      })

      it("setOwner to write invalid owner tree", () => {
        const ownerTreeBefore = node.db.getOwner("/apps/test/test_owner/some/path");
        assert.deepEqual(node.db.setOwner("/apps/test/test_owner/some/path", {
          ".owner": "invalid owners config"
        }, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }), {
          "code": 10603,
          "error_message": "Invalid owner tree: /.owner",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.getOwner("/apps/test/test_owner/some/path"), ownerTreeBefore);

        assert.deepEqual(node.db.setOwner("/apps/test/test_owner/some/path", {
          ".owner": {
            "owners": "invalid owners config"
          }
        }, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }), {
          "code": 10603,
          "error_message": "Invalid owner tree: /.owner/owners",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.getOwner("/apps/test/test_owner/some/path"), ownerTreeBefore);
      })

      it("setOwner to write with invalid path", () => {
        assert.deepEqual(node.db.setOwner("/apps/test/test_owner/some/path/.", {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true,
              }
            }
          }
        }, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }), {
          "code": 10602,
          "error_message": "Invalid owner path: /apps/test/test_owner/some/path/.",
          "bandwidth_gas_amount": 1
        });
      })

      // For details, see test case 'evalOwner to evaluate write_owner permission with subtree owners'.
      it("setOwner to write with subtree owners with isMerge = false", () => {
        assert.deepEqual(node.db.setOwner("/apps/test/test_owner/some/upper/path/deeper", {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true,
              }
            }
          }
        }, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }), {
          "code": 12501,
          "error_message": "Non-empty (1) subtree owners for owner path '/apps/test/test_owner/some/upper/path/deeper': [\"/path\"]",
          "bandwidth_gas_amount": 1
        });
      })

      // For details, see test case 'evalOwner to evaluate write_owner permission with subtree owners'.
      it("setOwner to write with subtree owners with isMerge = true", () => {
        assert.deepEqual(node.db.setOwner(
            "/apps/test/test_owner/some/upper/path", {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true,
              }
            }
          }
        }, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }), {
          "code": 0,
          "bandwidth_gas_amount": 1
        });
      })
    })
  });

  describe("Composite operations", () => {
    const timestamp = 1234567890000;

    describe("get:", () => {
      it("get to retrieve non-existing value or function or rule or owner", () => {
        assert.deepEqual(node.db.get([
          {
            // Default type: GET_VALUE
            ref: "/apps/value/other/path",
          },
          {
            type: "GET_RULE",
            ref: "/apps/rule/other/path",
          },
          {
            type: "GET_FUNCTION",
            ref: "/apps/function/other/path",
          },
          {
            type: "GET_OWNER",
            ref: "/apps/owner/other/path",
          },
          {
            type: "MATCH_FUNCTION",
            ref: "/apps/test/test_function/some/path/deeper",
          },
          {
            type: "MATCH_RULE",
            ref: "/apps/test/test_rule/some/path/subpath",
          },
          {
            type: "MATCH_OWNER",
            ref: "/apps/test/test_owner/some/path/subpath",
          },
          {
            type: "EVAL_RULE",
            ref: "/apps/test/test_rule/some/path/subpath",
            value: "value",
            address: "efgh",
            timestamp: timestamp,
          },
          {
            type: "EVAL_OWNER",
            ref: "/apps/test/test_owner/some/path/subpath",
            permission: "write_rule",
            address: "efgh",
            timestamp: timestamp,
          },
        ]), [
          null,
          null,
          null,
          null,
          {
            "matched_path": {
              "target_path": "/apps/test/test_function/some/path/deeper",
              "ref_path": "/apps/test/test_function/some/path/deeper",
              "path_vars": {},
            },
            "matched_config": {
              "config": null,
              "path": "/apps/test/test_function/some/path/deeper"
            },
            "subtree_configs": [
              {
                "config": {
                  "fid_deeper": {
                    "function_url": "https://events.ainetwork.ai/trigger",
                    "function_id": "fid_deeper",
                    "function_type": "REST",
                  }
                },
                "path": "/path"
              }
            ]
          },
          {
            "write": {
                "matched_path": {
                "target_path": "/apps/test/test_rule/some/path",
                "ref_path": "/apps/test/test_rule/some/path",
                "path_vars": {},
              },
              "matched_config": {
                "config": {
                  "write": "auth.addr === 'abcd'"
                },
                "path": "/apps/test/test_rule/some/path"
              },
              "subtree_configs": []
            },
            "state": {
              "matched_config": {
                "config": null,
                "path": "/"
              },
              "matched_path": {
                "path_vars": {},
                "ref_path": "/apps/test/test_rule/some/path",
                "target_path": "/apps/test/test_rule/some/path"
              }
            }
          },
          {
            "matched_path": {
              "target_path": "/apps/test/test_owner/some/path"
            },
            "matched_config": {
              "config": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_function": false,
                    "write_owner": false,
                    "write_rule": false
                  },
                  "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                    "branch_owner": true,
                    "write_function": true,
                    "write_owner": true,
                    "write_rule": true
                  }
                }
              },
              "path": "/apps/test/test_owner/some/path"
            },
            "subtree_configs": []
          },
          {
            "code": 12103,
            "error_message": "Write rule evaluated false: [auth.addr === 'abcd'] at '/apps/test/test_rule/some/path' for value path '/apps/test/test_rule/some/path/subpath' with path vars '{}', data 'null', newData '\"value\"', auth '{\"addr\":\"efgh\"}', timestamp '1234567890000'",
            "matched": {
              "state": {
                "closestRule": {
                  "config": null,
                  "path": [],
                },
                "matchedRulePath": [
                  "apps",
                  "test",
                  "test_rule",
                  "some",
                  "path",
                ],
                "matchedValuePath": [
                  "apps",
                  "test",
                  "test_rule",
                  "some",
                  "path",
                ],
                "pathVars": {},
              },
              "write": {
                "closestRule": {
                  "config": {
                    "write": "auth.addr === 'abcd'"
                  },
                  "path": [
                    "apps",
                    "test",
                    "test_rule",
                    "some",
                    "path",
                  ]
                },
                "matchedRulePath": [
                  "apps",
                  "test",
                  "test_rule",
                  "some",
                  "path",
                ],
                "matchedValuePath": [
                  "apps",
                  "test",
                  "test_rule",
                  "some",
                  "path",
                ],
                "pathVars": {},
                "subtreeRules": []
              }
            }
          },
          {
            "code": 12302,
            "error_message": "write_rule permission evaluated false: [{\"branch_owner\":false,\"write_function\":false,\"write_owner\":false,\"write_rule\":false}] at '/apps/test/test_owner/some/path' for rule path '/apps/test/test_owner/some/path/subpath' with permission 'write_rule', auth '{\"addr\":\"efgh\"}'",
            "matched": {
              "closestOwner": {
                "config": {
                  "owners": {
                    "*": {
                      "branch_owner": false,
                      "write_function": false,
                      "write_owner": false,
                      "write_rule": false,
                    },
                    "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                      "branch_owner": true,
                      "write_function": true,
                      "write_owner": true,
                      "write_rule": true,
                    }
                  }
                },
                "path": [
                  "apps",
                  "test",
                  "test_owner",
                  "some",
                  "path",
                ]
              },
              "matchedOwnerPath": [
                "apps",
                "test",
                "test_owner",
                "some",
                "path",
              ],
              "subtreeOwners": []
            }
          }
        ]);
      })

      it("get to retrieve existing value or function or rule or owner", () => {
        assert.deepEqual(node.db.get([
          {
            // Default type: GET_VALUE
            ref: "/apps/test/nested/far/down",
          },
          {
            type: "GET_RULE",
            ref: "/apps/test/test_rule/some/path",
          },
          {
            type: "GET_FUNCTION",
            ref: "/apps/test/test_function/some/path",
          },
          {
            type: "GET_OWNER",
            ref: "/apps/test/test_owner/some/path",
          },
          {
            type: "MATCH_FUNCTION",
            ref: "/apps/test/test_function/some/path",
          },
          {
            type: "MATCH_RULE",
            ref: "/apps/test/test_rule/some/path",
          },
          {
            type: "MATCH_OWNER",
            ref: "/apps/test/test_owner/some/path",
          },
          {
            type: "EVAL_RULE",
            ref: "/apps/test/test_rule/some/path",
            value: "value",
            address: "abcd",
            timestamp: Date.now(),
          },
          {
            type: "EVAL_OWNER",
            ref: "/apps/test/test_owner/some/path",
            permission: "write_owner",
            address: "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1",
            timestamp: Date.now(),
          },
        ]), [
          456,
          {
            ".rule": {
              "write": "auth.addr === 'abcd'"
            },
          },
          {
            ".function": {
              "fid": {
                "function_url": "https://events.ainetwork.ai/trigger",
                "function_id": "fid",
                "function_type": "REST",
              }
            },
            "deeper": {
              "path": {
                ".function": {
                  "fid_deeper": {
                    "function_url": "https://events.ainetwork.ai/trigger",
                    "function_id": "fid_deeper",
                    "function_type": "REST",
                  }
                }
              }
            }
          },
          {
            ".owner": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": false,
                  "write_owner": false,
                  "write_rule": false,
                },
                "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true,
                }
              }
            }
          },
          {
            "matched_path": {
              "target_path": "/apps/test/test_function/some/path",
              "ref_path": "/apps/test/test_function/some/path",
              "path_vars": {},
            },
            "matched_config": {
              "config": {
                "fid": {
                  "function_url": "https://events.ainetwork.ai/trigger",
                  "function_id": "fid",
                  "function_type": "REST",
                }
              },
              "path": "/apps/test/test_function/some/path"
            },
            "subtree_configs": [
              {
                "config": {
                  "fid_deeper": {
                    "function_url": "https://events.ainetwork.ai/trigger",
                    "function_id": "fid_deeper",
                    "function_type": "REST",
                  }
                },
                "path": "/deeper/path"
              }
            ]
          },
          {
            "write": {
              "matched_path": {
                "target_path": "/apps/test/test_rule/some/path",
                "ref_path": "/apps/test/test_rule/some/path",
                "path_vars": {},
              },
              "matched_config": {
                "config": {
                  "write": "auth.addr === 'abcd'"
                },
                "path": "/apps/test/test_rule/some/path"
              },
              "subtree_configs": []
            },
            "state": {
              "matched_config": {
                "config": null,
                "path": "/"
              },
              "matched_path": {
                "path_vars": {},
                "ref_path": "/apps/test/test_rule/some/path",
                "target_path": "/apps/test/test_rule/some/path"
              }
            }
          },
          {
            "matched_path": {
              "target_path": "/apps/test/test_owner/some/path"
            },
            "matched_config": {
              "config": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_function": false,
                    "write_owner": false,
                    "write_rule": false
                  },
                  "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                    "branch_owner": true,
                    "write_function": true,
                    "write_owner": true,
                    "write_rule": true
                  }
                }
              },
              "path": "/apps/test/test_owner/some/path"
            },
            "subtree_configs": []
          },
          {
            "code": 0,
            "matched": {
              "state": {
                "closestRule": {
                  "config": null,
                  "path": [],
                },
                "matchedRulePath": [
                  "apps",
                  "test",
                  "test_rule",
                  "some",
                  "path",
                ],
                "matchedValuePath": [
                  "apps",
                  "test",
                  "test_rule",
                  "some",
                  "path",
                ],
                "pathVars": {}
              },
              "write": {
                "closestRule": {
                  "config": {
                    "write": "auth.addr === 'abcd'"
                  },
                  "path": [
                    "apps",
                    "test",
                    "test_rule",
                    "some",
                    "path",
                  ]
                },
                "matchedRulePath": [
                  "apps",
                  "test",
                  "test_rule",
                  "some",
                  "path",
                ],
                "matchedValuePath": [
                  "apps",
                  "test",
                  "test_rule",
                  "some",
                  "path",
                ],
                "pathVars": {},
                "subtreeRules": []
              }
            }
          },
          {
            "code": 0,
            "matched": {
              "closestOwner": {
                "config": {
                  "owners": {
                    "*": {
                      "branch_owner": false,
                      "write_function": false,
                      "write_owner": false,
                      "write_rule": false,
                    },
                    "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                      "branch_owner": true,
                      "write_function": true,
                      "write_owner": true,
                      "write_rule": true,
                    }
                  }
                },
                "path": [
                  "apps",
                  "test",
                  "test_owner",
                  "some",
                  "path",
                ]
              },
              "matchedOwnerPath": [
                "apps",
                "test",
                "test_owner",
                "some",
                "path",
              ],
              "subtreeOwners": []
            }
          }
        ]);
      })
    })
  });


  describe("Execute operations", () => {
    const timestamp = 1234567890000;

    describe("executeSingleSetOperation:", () => {
      it("when successful", () => {
        assert.deepEqual(node.db.executeSingleSetOperation({
          // Default type: SET_VALUE
          ref: "/apps/test/nested/far/down",
          value: {
            "new": 12345
          }
        }, { addr: 'abcd' }, null, { extra: { executed_at: timestamp }}), {
          "code": 0,
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.getValue("/apps/test/nested/far/down"), { "new": 12345 })
      })

      it("returning error code and leaving value unchanged when it fails", () => {
        assert.deepEqual(node.db.executeSingleSetOperation({
          type: "INC_VALUE",
          ref: "/apps/test/ai/foo",
          value: 10
        }), {
          "code": 10201,
          "error_message": "Not a number type: bar or 10",
          "bandwidth_gas_amount": 1
        })
        expect(node.db.getValue("/apps/test/ai/foo")).to.equal("bar")
      })

      it("when successful with function triggering", () => {
        const valuePath = '/apps/test/test_function_triggering/allowed_path/value';
        const functionResultPath = '/apps/test/test_function_triggering/allowed_path/.last_tx/value';
        const value = 'some value';

        const result = node.db.executeMultiSetOperation([
          {
            type: 'SET_FUNCTION',
            ref: valuePath,
            value: {
              ".function": {
                "_saveLastTx": {
                  "function_type": "NATIVE",
                  "function_id": "_saveLastTx"
                }
              }
            }
          },
          {
            type: 'SET_RULE',
            ref: valuePath,
            value: {
              ".rule": {
                "write": true
              }
            }
          },
          {
            type: 'SET_RULE',
            ref: functionResultPath,
            value: {
              ".rule": {
                "write": true  // Allow all.
              }
            }
          },
          {
            type: 'SET_FUNCTION',
            ref: functionResultPath,
            value: {
              ".function": {
                "_eraseValue": {
                  "function_type": "NATIVE",
                  "function_id": "_eraseValue"
                }
              }
            }
          },
        ], { addr: 'abcd' }, null, { extra: { executed_at: timestamp }});
        expect(CommonUtil.isFailedTx(result)).to.equal(false);

        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: valuePath,
            value,
          },
          gas_price: 1,
          nonce: -1,
          timestamp,
          address: 'abcd',
        };
        const tx = Transaction.fromTxBody(txBody, null);
        expect(tx).to.not.equal(null);

        assert.deepEqual(node.db.executeSingleSetOperation(txBody.operation, { addr: 'abcd' },
            timestamp, tx), {
          "func_results": {
            "_saveLastTx": {
              "op_results": {
                "0": {
                  "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                  "result": {
                    "func_results": {
                      "_eraseValue": {
                        "op_results": {
                          "0": {
                            "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                            "result": {
                              "code": 0,
                              "bandwidth_gas_amount": 1,
                            }
                          }
                        },
                        "code": 0,
                        "bandwidth_gas_amount": 0,
                      }
                    },
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                }
              },
              "code": 0,
              "bandwidth_gas_amount": 0
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.getValue(valuePath), value)
      })

      it("when failed with function triggering", () => {
        const valuePath = '/apps/test/test_function_triggering/allowed_path/value';
        const functionResultPath = '/apps/test/test_function_triggering/allowed_path/.last_tx/value';
        const value = 'some value';

        const result = node.db.executeMultiSetOperation([
          {
            type: 'SET_FUNCTION',
            ref: valuePath,
            value: {
              ".function": {
                "_saveLastTx": {
                  "function_type": "NATIVE",
                  "function_id": "_saveLastTx"
                }
              }
            }
          },
          {
            type: 'SET_RULE',
            ref: valuePath,
            value: {
              ".rule": {
                "write": true
              }
            }
          },
          {
            type: 'SET_RULE',
            ref: functionResultPath,
            value: {
              ".rule": {
                "write": "auth.fid !== '_eraseValue'"  // Do NOT allow writes by the last function.
              }
            }
          },
          {
            type: 'SET_FUNCTION',
            ref: functionResultPath,
            value: {
              ".function": {
                "_eraseValue": {
                  "function_type": "NATIVE",
                  "function_id": "_eraseValue"
                }
              }
            }
          },
        ], { addr: 'abcd' }, null, { extra: { executed_at: timestamp }});
        expect(CommonUtil.isFailedTx(result)).to.equal(false);

        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: valuePath,
            value,
          },
          gas_price: 1,
          nonce: -1,
          timestamp,
          address: 'abcd',
        };
        const tx = Transaction.fromTxBody(txBody, null);
        expect(tx).to.not.equal(null);

        assert.deepEqual(node.db.executeSingleSetOperation(txBody.operation, { addr: 'abcd' },
            timestamp, tx), {
          "func_results": {
            "_saveLastTx": {
              "op_results": {
                "0": {
                  "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                  "result": {
                    "func_results": {
                      "_eraseValue": {
                        "op_results": {
                          "0": {
                            "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                            "result": {
                              "code": 12103,
                              "error_message": "Write rule evaluated false: [auth.fid !== '_eraseValue'] at '/apps/test/test_function_triggering/allowed_path/.last_tx/value' for value path '/apps/test/test_function_triggering/allowed_path/.last_tx/value' with path vars '{}', data '{\"tx_hash\":\"0xa67134a3d4d525a35681801f6ccaad4ba3e4a7c75a2568aea84cf514c932d39f\"}', newData '\"erased\"', auth '{\"addr\":\"abcd\",\"fid\":\"_eraseValue\",\"fids\":[\"_saveLastTx\",\"_eraseValue\"]}', timestamp '1234567890000'",
                              "bandwidth_gas_amount": 1
                            }
                          }
                        },
                        "code": 20001,
                        "bandwidth_gas_amount": 0,
                      }
                    },
                    "code": 10104,
                    "error_message": "Triggered function call failed",
                    "bandwidth_gas_amount": 1
                  }
                }
              },
              "code": 20001,
              "bandwidth_gas_amount": 0,
            }
          },
          "code": 10104,
          "error_message": "Triggered function call failed",
          "bandwidth_gas_amount": 1,
        });
        assert.deepEqual(node.db.getValue(valuePath), value)
      })
    })

    describe("executeMultiSetOperation:", () => {
      const timestamp = 1234567890000;

      it("when all operations applied successfully", () => {
        assert.deepEqual(node.db.executeMultiSetOperation([
          {
            // Default type: SET_VALUE
            ref: "/apps/test/nested/far/down",
            value: {
              "new": 12345
            }
          },
          {
            type: "INC_VALUE",
            ref: "/apps/test/increment/value",
            value: 10
          },
          {
            type: "DEC_VALUE",
            ref: "/apps/test/decrement/value",
            value: 10
          },
          {
            type: "SET_FUNCTION",
            ref: "/apps/test/test_function/some/path",
            value: {
              ".function": {
                "fid": {
                  "function_url": "http://echo-bot.ainetwork.ai/trigger",
                  "function_id": "fid",
                  "function_type": "REST",
                }
              }
            }
          },
          {
            type: "SET_RULE",
            ref: "/apps/test/test_rule/some/path",
            value: {
              ".rule": {
                "write": "auth.addr === 'xyz'"
              }
            }
          },
          {
            type: "SET_OWNER",
            ref: "/apps/test/test_owner/some/path",
            value: {
              ".owner": {
                "owners": {
                  "*": {
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
                    }
                  }
                }
              }
            }
          }
        ], { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, null, { extra: { executed_at: timestamp }}), {
          "result_list": {
            "0": {
              "code": 0,
              "bandwidth_gas_amount": 1,
            },
            "1": {
              "code": 0,
              "bandwidth_gas_amount": 1
            },
            "2": {
              "code": 0,
              "bandwidth_gas_amount": 1
            },
            "3": {
              "code": 0,
              "bandwidth_gas_amount": 1
            },
            "4": {
              "code": 0,
              "bandwidth_gas_amount": 1
            },
            "5": {
              "code": 0,
              "bandwidth_gas_amount": 1
            }
          }
        });
        assert.deepEqual(node.db.getValue("/apps/test/nested/far/down"), { "new": 12345 })
        expect(node.db.getValue("/apps/test/increment/value")).to.equal(30)
        expect(node.db.getValue("/apps/test/decrement/value")).to.equal(10)
        assert.deepEqual(node.db.getFunction("/apps/test/test_function/some/path"), {
          ".function": {
            "fid": {
              "function_url": "http://echo-bot.ainetwork.ai/trigger",  // modified
              "function_id": "fid",
              "function_type": "REST",
            }
          },
          "deeper": {
            "path": {
              ".function": {
                "fid_deeper": {
                  "function_url": "https://events.ainetwork.ai/trigger",
                  "function_id": "fid_deeper",
                  "function_type": "REST",
                }
              }
            }
          }
        });
        assert.deepEqual(node.db.getRule("/apps/test/test_rule/some/path"), {
          ".rule": {
            "write": "auth.addr === 'xyz'"
          }
        });
        assert.deepEqual(
            node.db.getOwner("/apps/test/test_owner/some/path"), {
              ".owner": {
                "owners": {
                  "*": {
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
                    }
                  }
                }
              }
            });
      })

      it("returning error code and leaving value unchanged when an operation fails", () => {
        assert.deepEqual(node.db.executeMultiSetOperation([
          {
            type: "SET_VALUE",
            ref: "/apps/test/nested/far/down",
            value: {
              "new": 12345
            }
          },
          {
            type: "INC_VALUE",
            ref: "/apps/test/ai/foo",
            value: 10
          },
          {
            type: "DEC_VALUE",
            ref: "/apps/test/decrement/value",
            value: 10
          },
        ]), {
          result_list: {
            "0": {
              "code": 0,
              "bandwidth_gas_amount": 1
            },
            "1": {
              "code": 10201,
              "error_message": "Not a number type: bar or 10",
              "bandwidth_gas_amount": 1
            }
          }
        })
        expect(node.db.getValue("/apps/test/ai/foo")).to.equal("bar")
      })

      it("when successful with function triggering", () => {
        const valuePath = '/apps/test/test_function_triggering/allowed_path/value';
        const functionResultPath = '/apps/test/test_function_triggering/allowed_path/.last_tx/value';
        const value = 'some value';

        const result = node.db.executeMultiSetOperation([
          {
            type: 'SET_FUNCTION',
            ref: valuePath,
            value: {
              ".function": {
                "_saveLastTx": {
                  "function_type": "NATIVE",
                  "function_id": "_saveLastTx"
                }
              }
            }
          },
          {
            type: 'SET_RULE',
            ref: valuePath,
            value: {
              ".rule": {
                "write": true
              }
            }
          },
          {
            type: 'SET_RULE',
            ref: functionResultPath,
            value: {
              ".rule": {
                "write": true  // Allow all.
              }
            }
          },
          {
            type: 'SET_FUNCTION',
            ref: functionResultPath,
            value: {
              ".function": {
                "_eraseValue": {
                  "function_type": "NATIVE",
                  "function_id": "_eraseValue"
                }
              }
            }
          },
        ], { addr: 'abcd' }, null, { extra: { executed_at: timestamp }});
        expect(CommonUtil.isFailedTx(result)).to.equal(false);

        const txBody = {
          operation: {
            type: "SET",
            op_list: [
              {
                type: 'SET_VALUE',
                ref: valuePath,
                value,
              },
              {
                // Default type: SET_VALUE
                ref: "/apps/test/nested/far/down",
                value: {
                  "new": 12345
                }
              },
            ],
          },
          gas_price: 1,
          nonce: -1,
          timestamp,
          address: 'abcd',
        };
        const tx = Transaction.fromTxBody(txBody, null);
        expect(tx).to.not.equal(null);

        assert.deepEqual(node.db.executeMultiSetOperation(txBody.operation.op_list,
            { addr: 'abcd' }, timestamp, tx), {
          "result_list": {
            "0": {
              "func_results": {
                "_saveLastTx": {
                  "op_results": {
                    "0": {
                      "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                      "result": {
                        "func_results": {
                          "_eraseValue": {
                            "op_results": {
                              "0": {
                                "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                                "result": {
                                  "code": 0,
                                  "bandwidth_gas_amount": 1
                                }
                              }
                            },
                            "code": 0,
                            "bandwidth_gas_amount": 0
                          }
                        },
                        "code": 0,
                        "bandwidth_gas_amount": 1
                      }
                    }
                  },
                  "code": 0,
                  "bandwidth_gas_amount": 0
                }
              },
              "code": 0,
              "bandwidth_gas_amount": 1
            },
            "1": {
              "code": 0,
              "bandwidth_gas_amount": 1
            },
          },
        });
      })

      it("when failed with function triggering", () => {
        const valuePath = '/apps/test/test_function_triggering/allowed_path/value';
        const functionResultPath = '/apps/test/test_function_triggering/allowed_path/.last_tx/value';
        const value = 'some value';

        const result = node.db.executeMultiSetOperation([
          {
            type: 'SET_FUNCTION',
            ref: valuePath,
            value: {
              ".function": {
                "_saveLastTx": {
                  "function_type": "NATIVE",
                  "function_id": "_saveLastTx"
                }
              }
            }
          },
          {
            type: 'SET_RULE',
            ref: valuePath,
            value: {
              ".rule": {
                "write": true
              }
            }
          },
          {
            type: 'SET_RULE',
            ref: functionResultPath,
            value: {
              ".rule": {
                "write": "auth.fid !== '_eraseValue'"  // Do NOT allow writes by the last function.
              }
            }
          },
          {
            type: 'SET_FUNCTION',
            ref: functionResultPath,
            value: {
              ".function": {
                "_eraseValue": {
                  "function_type": "NATIVE",
                  "function_id": "_eraseValue"
                }
              }
            }
          },
        ], { addr: 'abcd' }, null, { extra: { executed_at: timestamp }});
        expect(CommonUtil.isFailedTx(result)).to.equal(false);

        const txBody = {
          operation: {
            type: "SET",
            op_list: [
              {
                type: 'SET_VALUE',
                ref: valuePath,
                value,
              },
              {
                // Default type: SET_VALUE
                ref: "/apps/test/nested/far/down",
                value: {
                  "new": 12345
                }
              },
            ],
          },
          gas_price: 1,
          nonce: -1,
          timestamp,
          address: 'abcd',
        };
        const tx = Transaction.fromTxBody(txBody, null);
        expect(tx).to.not.equal(null);

        assert.deepEqual(node.db.executeMultiSetOperation(txBody.operation.op_list,
            { addr: 'abcd' }, timestamp, tx), {
          "result_list": {
            "0": {
              "func_results": {
                "_saveLastTx": {
                  "op_results": {
                    "0": {
                      "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                      "result": {
                        "func_results": {
                          "_eraseValue": {
                            "op_results": {
                              "0": {
                                "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                                "result": {
                                  "code": 12103,
                                  "error_message": "Write rule evaluated false: [auth.fid !== '_eraseValue'] at '/apps/test/test_function_triggering/allowed_path/.last_tx/value' for value path '/apps/test/test_function_triggering/allowed_path/.last_tx/value' with path vars '{}', data '{\"tx_hash\":\"0xce0ed4ea7f36c493ad1d73e769c00e30812efa55214309c3dfdc3a8463bd7e7d\"}', newData '\"erased\"', auth '{\"addr\":\"abcd\",\"fid\":\"_eraseValue\",\"fids\":[\"_saveLastTx\",\"_eraseValue\"]}', timestamp '1234567890000'",
                                  "bandwidth_gas_amount": 1,
                                }
                              }
                            },
                            "code": 20001,
                            "bandwidth_gas_amount": 0,
                          }
                        },
                        "code": 10104,
                        "error_message": "Triggered function call failed",
                        "bandwidth_gas_amount": 1
                      }
                    }
                  },
                  "code": 20001,
                  "bandwidth_gas_amount": 0,
                }
              },
              "code": 10104,
              "error_message": "Triggered function call failed",
              "bandwidth_gas_amount": 1
            },
          },
        });
      })
    })
  })

  describe("Execute transactions", () => {
    let node;
    let txBody;
    let executableTx;
    let objectTx;

    beforeEach(() => {
      rimraf.sync(NodeConfigs.CHAINS_DIR);

      node = new BlockchainNode();
      setNodeForTesting(node);
      node.db.setValuesForTesting(`/staking/test/balance_total`, 1);

      txBody = {
        operation: {
          type: 'SET_VALUE',
          ref: '/apps/test/some/path/for/tx',
          value: 'some value',
        },
        gas_price: 1000000,
        nonce: -1,
        timestamp: 1568798344000,
      };
      executableTx = Transaction.fromTxBody(txBody, node.account.private_key);
      objectTx = Transaction.toJsObject(executableTx);
    });

    afterEach(() => {
      rimraf.sync(NodeConfigs.CHAINS_DIR);
    });

    describe("executeTransaction:", () => {
      it("returns code 0 for executable transaction", () => {
        expect(executableTx.extra).to.not.equal(undefined);
        expect(executableTx.extra.executed_at).to.equal(null);
        assert.deepEqual(node.db.executeTransaction(executableTx, false, true, node.bc.lastBlockNumber() + 1), {
          code: 0,
          gas_amount_charged: 8,
          bandwidth_gas_amount: 1,
          gas_amount_total: {
            bandwidth: {
              app: {
                test: 1
              },
              service: 0
            },
            state: {
              app: {
                test: 846
              },
              service: 8
            }
          },
          gas_cost_total: 8
        });
        // extra.executed_at is updated with a non-null value.
        expect(executableTx.extra.executed_at).to.not.equal(null);
      });

      it("returns error code for object transaction", () => {
        assert.deepEqual(node.db.executeTransaction(objectTx, false, true, node.bc.lastBlockNumber() + 1), {
          code: 10707,
          error_message: "[precheckTransaction] Not executable transaction: {\"tx_body\":{\"operation\":{\"type\":\"SET_VALUE\",\"ref\":\"/apps/test/some/path/for/tx\",\"value\":\"some value\"},\"gas_price\":1000000,\"nonce\":-1,\"timestamp\":1568798344000},\"signature\":\"0x8b07b9ba72d969396c460faee6959b1b89b61fa049e116fd81686224fffd4fb19a879b401552e0c07bc211a7ba7cbb99e2ac32922e6f3c118caf183c2b351a7527ad5322e51d5f8405b2751255ca012008894a7e2e7673232fba1490a9fb35671b\",\"hash\":\"0x8b07b9ba72d969396c460faee6959b1b89b61fa049e116fd81686224fffd4fb1\",\"address\":\"0x00ADEc28B6a845a085e03591bE7550dd68673C1C\"}",
          bandwidth_gas_amount: 0
        });
        assert.deepEqual(objectTx.extra, undefined);
      });

      it("rejects over-height transaction", () => {
        const maxHeightTxBody = {
          operation: {
            type: 'SET_VALUE',
            ref: '/apps/test/4/5/6/7/8/9/10/11/12/13/14/15/16/17/18/19/20/21/22/23/24/25/26/27/28/29/30',
            value: 'some value',
          },
          gas_price: 0,
          nonce: -1,
          timestamp: 1568798344000,
        };
        const maxHeightTx = Transaction.fromTxBody(maxHeightTxBody, node.account.private_key);
        assert.deepEqual(node.db.executeTransaction(maxHeightTx, false, true, node.bc.lastBlockNumber() + 1), {
          code: 0,
          gas_amount_charged: 8,
          bandwidth_gas_amount: 1,
          gas_amount_total: {
            bandwidth: {
              app: {
                test: 1
              },
              service: 0
            },
            state: {
              app: {
                test: 4596
              },
              service: 8
            }
          },
          gas_cost_total: 0,
        });

        const overHeightTxBody = {
          operation: {
            type: 'SET_VALUE',
            ref: '/apps/test/4/5/6/7/8/9/10/11/12/13/14/15/16/17/18/19/20/21/22/23/24/25/26/27/28/29/30/31',
            value: 'some value',
          },
          gas_price: 0,
          nonce: -1,
          timestamp: 1568798344000,
        };
        const overHeightTx = Transaction.fromTxBody(overHeightTxBody, node.account.private_key);
        assert.deepEqual(node.db.executeTransaction(overHeightTx, false, true, node.bc.lastBlockNumber() + 1), {
          code: 11101,
          error_message: "Out of tree height limit (31 > 30)",
          gas_amount_charged: 0,
          bandwidth_gas_amount: 1,
          gas_cost_total: 0,
          gas_amount_total: {
            bandwidth: {
              app: {
                test: 1
              },
              service: 0
            },
            state: {
              service: 0
            }
          }
        });
      });

      it('cannot exceed service state budget', () => {
        // Bloat the state tree just below the service state budget
        const addr = ainUtil.createAccount().address;
        const valueObj = {};
        for (let i = 0; i < 6000; i++) {
          valueObj[i] = {
            value: 1,
            result: {
              timestamp: 1568798344000,
              tx_hash: "0xb23fbdfb7b38dc4859872c565b1b0e4140ca4b7896397c817a290b2507e79708",
              code: 0
            }
          }
        }
        const tempDb = node.createTempDb(node.db.stateVersion, 'CONSENSUS_UNIT_TEST',
            node.bc.lastBlockNumber(), BlockchainParams.genesis.genesis_addr);
        tempDb.setValuesForTesting(`/accounts/${node.account.address}/balance`, 1000000000);
        tempDb.setValuesForTesting(`/transfer/${node.account.address}/${addr}`, valueObj);
        node.cloneAndFinalizeVersion(tempDb.stateVersion, -1);
        const serviceStateBudget = BlockchainParams.resource.state_tree_bytes_limit * BlockchainParams.resource.service_state_budget_ratio;
        expect(node.db.getStateUsageAtPath('/')[StateInfoProperties.TREE_BYTES]).to.be.lessThan(serviceStateBudget);

        const expectedGasAmountTotal = {
          bandwidth: {
            service: 3009000,
          },
          state: {
            service: 4086120
          }
        };
        const overSizeTxBody = {
          operation: {
            type: 'SET',
            op_list: []
          },
          gas_price: 1,
          nonce: -1,
          timestamp: 1568798344000,
        };
        for (let i = 0; i < 1500; i++) {
          overSizeTxBody.operation.op_list.push({
            type: 'SET_VALUE',
            ref: `/staking/app_${i}/${node.account.address}/0/stake/${i}/value`,
            value: 1
          });
        }
        const overSizeTx = Transaction.fromTxBody(overSizeTxBody, node.account.private_key);
        const res = node.db.executeTransaction(overSizeTx, false, true, node.bc.lastBlockNumber() + 1);
        assert.deepEqual(res.code, 10901);
        assert.deepEqual(res.error_message.includes("Exceeded state budget limit for services"), true);
        assert.deepEqual(res.gas_amount_total, expectedGasAmountTotal);
        assert.deepEqual(res.gas_cost_total, 7.09512);
      });

      it("cannot exceed apps state budget", () => {
        const overSizeTree = {};
        for (let i = 0; i < 1000; i++) {
          overSizeTree[i] = {};
          for (let j = 0; j < 75; j++) {
            overSizeTree[i][j] = 'a';
          }
        }
        const overSizeTxBody = {
          operation: {
            type: 'SET_VALUE',
            ref: '/apps/test/tree',
            value: overSizeTree,
          },
          gas_price: 1,
          nonce: -1,
          timestamp: 1568798344000,
        };
        const overSizeTx = Transaction.fromTxBody(overSizeTxBody, node.account.private_key);
        const res = node.db.executeTransaction(overSizeTx, false, true, node.bc.lastBlockNumber() + 1);
        assert.deepEqual(res.code, 10902);
        assert.deepEqual(res.error_message, "Exceeded state budget limit for apps (12621228 > 9000000)");
        assert.deepEqual(res.gas_amount_total, {
          bandwidth: { service: 0, app: { test: 1 } },
          state: { service: 8, app: { test: 12596108 } }
        });
        assert.deepEqual(res.gas_cost_total, 0);
      });

      it('cannot exceed per-app state budget', () => {
        // Set up 10 apps & stake 1 for each
        let timestamp = 1568798344000;
        for (let i = 0; i < 10; i++) {
          const stakeTx = Transaction.fromTxBody({
            operation: {
              type: 'SET_VALUE',
              ref: `/staking/app_${i}/${node.account.address}/0/stake/${i}/value`,
              value: 1
            },
            gas_price: 1,
            nonce: -1,
            timestamp: timestamp++,
          }, node.account.private_key);
          const stakeRes = node.db.executeTransaction(stakeTx, false, true, node.bc.lastBlockNumber() + 1);
          assert.deepEqual(stakeRes.code, 0);
          const createAppTx = Transaction.fromTxBody({
            operation: {
              type: 'SET_VALUE',
              ref: `/manage_app/app_${i}/create/${i}`,
              value: { admin: { [node.account.address]: true } }
            },
            gas_price: 1,
            nonce: -1,
            timestamp: timestamp++,
          }, node.account.private_key);
          const createAppRes = node.db.executeTransaction(createAppTx, false, true, node.bc.lastBlockNumber() + 1);
          assert.deepEqual(createAppRes.code, 0);
        }
        // Send 1/10 + 1 budget tx for one of them
        const overSizeTree = {};
        for (let i = 0; i < 1000; i++) {
          overSizeTree[i] = {};
          for (let j = 0; j < 5; j++) {
            overSizeTree[i][j] = 'a';
          }
        }
        const overSizeTxBody = {
          operation: {
            type: 'SET_VALUE',
            ref: '/apps/app_0/tree',
            value: overSizeTree,
          },
          gas_price: 1,
          nonce: -1,
          timestamp
        };
        const overSizeTx = Transaction.fromTxBody(overSizeTxBody, node.account.private_key);
        const res = node.db.executeTransaction(overSizeTx, false, true, node.bc.lastBlockNumber() + 1);
        assert.deepEqual(res.code, 10907);
        assert.deepEqual(res.error_message, "Exceeded state budget limit for app app_0 (988222 > 818181.8181818182)");
        assert.deepEqual(res.gas_amount_total, {
          bandwidth: { service: 0, app: { app_0: 1 } },
          state: { service: 8, app: { app_0: 986108 } }
        });
        assert.deepEqual(res.gas_cost_total, 0);
      });

      it('cannot exceed 10% free tier for state budget', () => {
        // Set up 1 app & do not stake
        const createAppTx = Transaction.fromTxBody({
          operation: {
            type: 'SET_VALUE',
            ref: `/manage_app/app_0/create/0`,
            value: { admin: { [node.account.address]: true } }
          },
          gas_price: 1,
          nonce: -1,
          timestamp: 1568798344000
        }, node.account.private_key);
        const createAppRes = node.db.executeTransaction(createAppTx, false, true, node.bc.lastBlockNumber() + 1);
        assert.deepEqual(createAppRes.code, 0);
        // Send over 10% budget tx
        const overSizeTree = {};
        for (let i = 0; i < 1000; i++) {
          overSizeTree[i] = {};
          for (let j = 0; j < 10; j++) {
            overSizeTree[i][j] = 'a';
          }
        }
        const overSizeTxBody = {
          operation: {
            type: 'SET_VALUE',
            ref: '/apps/app_0/tree',
            value: overSizeTree,
          },
          gas_price: 1,
          nonce: -1,
          timestamp: 1568798344001
        };
        const overSizeTx = Transaction.fromTxBody(overSizeTxBody, node.account.private_key);
        const res = node.db.executeTransaction(overSizeTx, false, true, node.bc.lastBlockNumber() + 1);
        assert.deepEqual(res.code, 10905);
        assert.deepEqual(res.error_message, "Exceeded state budget limit for free tier (1808222 > 1000000)");
        assert.deepEqual(res.gas_amount_total, {
          bandwidth: { service: 0, app: { app_0: 1 } },
          state: { service: 8, app: { app_0: 1806108 } }
        });
        assert.deepEqual(res.gas_cost_total, 0);
      });
    });
  });

  describe("Remove null terminals nodes (garbage collection)", () => {
    beforeEach(() => {
      emptyValues = {
        "terminal_1a": null,
        "terminal_1b": null,
        "terminal_1c": "",
        "node_1a": {
          "node_2": {
            "node_3": "a value"
          }
        },
        "node_1b": {
          "terminal_2": null,
        }
      };
      node.db.setValuesForTesting("/apps/test/empty_values/node_0", emptyValues);

      emptyRules = {
        "node_1a": {
          "node_2a": {
            "node_3a": {
              ".rule": {
                "write": "auth.addr === 'abc'"
              }
            }
          }
        },
        "node_1b": {
          "node_2b": {
            "node_3b": {
              ".rule": {
                "write": "auth.addr === 'def'"
              }
            }
          }
        }
      };
      node.db.setRulesForTesting("/apps/test/empty_rules/node_0", emptyRules);

      emptyOwners = {
        "node_1a": {
          "node_2a": {
            "node_3a": {
              ".owner": {
                "owners": {
                  "*": {
                    "branch_owner": true,
                    "write_owner": true,
                    "write_rule": true,
                    "write_function": true
                  }
                }
              }
            }
          }
        },
        "node_1b": {
          "node_2b": {
            "node_3b": {
              ".owner": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_owner": false,
                    "write_rule": false,
                    "write_function": false
                  }
                }
              }
            }
          }
        }
      };
      node.db.setOwnersForTesting("/apps/test/empty_owners/node_0", emptyOwners);
    });

    afterEach(() => {
      node.db.setValuesForTesting("/apps/test/empty_values/node_0", null);

      node.db.setRulesForTesting("/apps/test/empty_rules/node_0", null);

      node.db.setOwnersForTesting("/apps/test/empty_owners/node_0", null);
    });

    it("when setValue() with non-empty value", () => {
      expect(node.db.setValue(
          "/apps/test/empty_values/node_0/node_1a/node_2/node_3", "another value").code).to.equal(0);
      assert.deepEqual(node.db.getValue("/apps/test/empty_values/node_0"), {
        "terminal_1a": null,
        "terminal_1b": null,
        "terminal_1c": "",
        "node_1a": {
          "node_2": {
            "node_3": "another value"
          }
        },
        "node_1b": {
          "terminal_2": null,
        }
      })
    })

    it("when setValue() with 'null' value", () => {
      expect(node.db.setValue(
          "/apps/test/empty_values/node_0/node_1a/node_2/node_3", null).code).to.equal(0);
      assert.deepEqual(node.db.getValue("/apps/test/empty_values/node_0"), {
        "terminal_1a": null,
        "terminal_1b": null,
        "terminal_1c": "",
        "node_1b": {
          "terminal_2": null,
        }
      })
    })

    it("when setRule() with non-empty rule", () => {
      expect(node.db.setRule("/apps/test/empty_rules/node_0/node_1a/node_2a/node_3a", {
        ".rule": {
          "write": "auth.addr === 'xyz'"
        }
      }).code).to.equal(0)
      assert.deepEqual(node.db.getRule("/apps/test/empty_rules/node_0"), {
        "node_1a": {
          "node_2a": {
            "node_3a": {
              ".rule": {
                "write": "auth.addr === 'xyz'"
              }
            }
          }
        },
        "node_1b": {
          "node_2b": {
            "node_3b": {
              ".rule": {
                "write": "auth.addr === 'def'"
              }
            }
          }
        }
      })
    })

    it("when setRule() with 'null' rule", () => {
      expect(node.db.setRule(
          "/apps/test/empty_rules/node_0/node_1a/node_2a/node_3a", null).code).to.equal(0);
      assert.deepEqual(node.db.getRule("/apps/test/empty_rules/node_0"), {
        "node_1b": {
          "node_2b": {
            "node_3b": {
              ".rule": {
                "write": "auth.addr === 'def'"
              }
            }
          }
        }
      })
    })

    it("when setOwner() with non-empty owner", () => {
      expect(node.db.setOwner(
          "/apps/test/empty_owners/node_0/node_1a/node_2a/node_3a", {
            ".owner": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_owner": true,
                  "write_rule": false,
                  "write_function": false
                }
              }
            }
          }).code).to.equal(0)
      assert.deepEqual(node.db.getOwner("/apps/test/empty_owners/node_0"), {
        "node_1a": {
          "node_2a": {
            "node_3a": {
              ".owner": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_owner": true,
                    "write_rule": false,
                    "write_function": false
                  }
                }
              }
            }
          }
        },
        "node_1b": {
          "node_2b": {
            "node_3b": {
              ".owner": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_owner": false,
                    "write_rule": false,
                    "write_function": false
                  }
                }
              }
            }
          }
        }
      })
    })

    it("when setOwner() with 'null' owner", () => {
      expect(node.db.setOwner(
          "/apps/test/empty_owners/node_0/node_1a/node_2a/node_3a", null).code).to.equal(0);
      assert.deepEqual(node.db.getOwner("/apps/test/empty_owners/node_0"), {
        "node_1b": {
          "node_2b": {
            "node_3b": {
              ".owner": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_owner": false,
                    "write_rule": false,
                    "write_function": false
                  }
                }
              }
            }
          }
        }
      })
    })
  })
})

describe("DB rule config", () => {
  let node1, node2, dbValues;

  beforeEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);

    node1 = new BlockchainNode();
    setNodeForTesting(node1, 0);
    node2 = new BlockchainNode();
    setNodeForTesting(node2, 1);
    dbValues = {
      "comcom": "unreadable value",
      "unspecified": {
        "test": {
          "nested": "readable"
        }
      },
      "ai" : "readable",
      "billing_keys": {
        "other": "unreadable",
        "update_billing": {}
      },
      "users": {},
      "second_users": {}
    };
    dbValues["users"][node1.account.address] = {};
    dbValues["users"][node2.account.address] = {};
    dbValues["users"][node1.account.address]["balance"] = 100;
    dbValues["users"][node2.account.address]["balance"] = 50;
    dbValues["users"][node1.account.address]["info"] = 8474;
    dbValues["users"][node1.account.address]["string_only"] = "some string";
    dbValues["users"][node2.account.address]["string_only"] = 101;
    dbValues["billing_keys"]["update_billing"][node2.account.address] = "'not null'";
    dbValues["users"][node1.account.address]["next_counter"] = 10;
    dbValues["second_users"][node1.account.address] = {};
    dbValues["second_users"][node2.account.address] = {};
    dbValues["second_users"][node2.account.address][node2.account.address] = "i can write";
    dbValues["second_users"][node1.account.address]["something_else"] = "i can write";

    node1.db.setValuesForTesting("/apps/test", dbValues);
    node2.db.setValuesForTesting("/apps/test", dbValues);
  })

  afterEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);
  });

  it("only allows certain users to write certain info if balance is greater than 0", () => {
    assert.deepEqual(eraseEvalResMatched(node2.db.evalRule(
        `/apps/test/users/${node2.account.address}/balance`, 0, null, null)), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node2.db.evalRule(
        `/apps/test/users/${node2.account.address}/balance`, -1, null, null)), {
      "code": 12103,
      "error_message": "Write rule evaluated false: [typeof newData === 'number' && newData >= 0] at '/apps/test/users/$uid/balance' for value path '/apps/test/users/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance' with path vars '{\"$uid\":\"0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204\"}', data '50', newData '-1', auth 'null', timestamp 'null'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node1.db.evalRule(
        `/apps/test/users/${node1.account.address}/balance`, 1, null, null)), {
      "code": 0,
      "matched": "erased",
    });
  })

  it("only allows certain users to write certain info if data exists", () => {
    assert.deepEqual(eraseEvalResMatched(node1.db.evalRule(
        `/apps/test/users/${node1.account.address}/info`, "something", null, null)), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node2.db.evalRule(
        `/apps/test/users/${node2.account.address}/info`, "something else", null, null)), {
      "code": 12103,
      "error_message": "Write rule evaluated false: [data !== null] at '/apps/test/users/$uid/info' for value path '/apps/test/users/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/info' with path vars '{\"$uid\":\"0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204\"}', data 'null', newData '\"something else\"', auth 'null', timestamp 'null'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node2.db.evalRule(
        `/apps/test/users/${node2.account.address}/new_info`, "something",
        { addr: node2.account.address }, null)), {
      "code": 0,
      "matched": "erased",
    });
  })

  it("apply the closest ancestor's rule config if not exists", () => {
    assert.deepEqual(eraseEvalResMatched(node1.db.evalRule(
        `/apps/test/users/${node1.account.address}/child/grandson`, "something",
        { addr: node1.account.address }, null)), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node2.db.evalRule(
        `/apps/test/users/${node2.account.address}/child/grandson`, "something",
        { addr: node1.account.address }, null)), {
      "code": 12103,
      "error_message": "Write rule evaluated false: [auth.addr === $uid] at '/apps/test/users/$uid' for value path '/apps/test/users/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/child/grandson' with path vars '{\"$uid\":\"0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204\"}', data 'null', newData '\"something\"', auth '{\"addr\":\"0x00ADEc28B6a845a085e03591bE7550dd68673C1C\"}', timestamp 'null'",
      "matched": "erased",
    });
  })

  it("only allows certain users to write certain info if data at other locations exists", () => {
    assert.deepEqual(eraseEvalResMatched(node2.db.evalRule(
        `/apps/test/users/${node2.account.address}/balance_info`, "something", null, null)), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node1.db.evalRule(
        `/apps/test/users/${node1.account.address}/balance_info`, "something", null, null)), {
      "code": 12103,
      "error_message": "Write rule evaluated false: [getValue('/apps/test/billing_keys/update_billing/' + $uid) !== null] at '/apps/test/users/$uid/balance_info' for value path '/apps/test/users/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/balance_info' with path vars '{\"$uid\":\"0x00ADEc28B6a845a085e03591bE7550dd68673C1C\"}', data 'null', newData '\"something\"', auth 'null', timestamp 'null'",
      "matched": "erased",
    });
  })

  it("validates old data and new data together", () => {
    assert.deepEqual(eraseEvalResMatched(node1.db.evalRule(
        `/apps/test/users/${node1.account.address}/next_counter`, 11, null,  null)), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node1.db.evalRule(
        `/apps/test/users/${node1.account.address}/next_counter`, 12, null, null)), {
      "code": 12103,
      "error_message": "Write rule evaluated false: [typeof newData === 'number' && newData === data + 1] at '/apps/test/users/$uid/next_counter' for value path '/apps/test/users/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/next_counter' with path vars '{\"$uid\":\"0x00ADEc28B6a845a085e03591bE7550dd68673C1C\"}', data '10', newData '12', auth 'null', timestamp 'null'",
      "matched": "erased",
    });
  })

  it("can handle nested path variables", () => {
    assert.deepEqual(eraseEvalResMatched(node2.db.evalRule(
        `/apps/test/second_users/${node2.account.address}/${node2.account.address}`,
        "some value", null, null)), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node1.db.evalRule(
        `/apps/test/second_users/${node1.account.address}/next_counter`,
        "some other value", null, null)), {
      "code": 12103,
      "error_message": "Write rule evaluated false: [$wcard1 == $wcard2] at '/apps/test/second_users/$wcard1/$wcard2' for value path '/apps/test/second_users/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/next_counter' with path vars '{\"$wcard2\":\"next_counter\",\"$wcard1\":\"0x00ADEc28B6a845a085e03591bE7550dd68673C1C\"}', data 'null', newData '\"some other value\"', auth 'null', timestamp 'null'",
      "matched": "erased",
    });
  })

  it("duplicated path variables", () => {
    assert.deepEqual(eraseEvalResMatched(node1.db.evalRule(
        '/apps/test/no_dup_key/aaa/bbb', "some value", null, null)), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node1.db.evalRule(
        '/apps/test/dup_key/aaa/bbb', "some value", null, null)), {
      "code": 0,
      "matched": "erased",
    });
  })
})

describe("DB owner config", () => {
  let node;

  beforeEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node);
    result = node.db.setOwnersForTesting("/apps/test/test_owner/mixed/true/true/true", {
      ".owner": {
        "owners": {
          "*": {
            "branch_owner": false,
            "write_owner": false,
            "write_rule": false,
            "write_function": false
          },
          "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
            "branch_owner": false,
            "write_owner": false,
            "write_rule": false,
            "write_function": false
          },
          "0x08Aed7AF9354435c38d52143EE50ac839D20696b": {
            "branch_owner": true,
            "write_owner": true,
            "write_rule": true,
            "write_function": true
          }
        }
      }
    });

    node.db.setOwnersForTesting("/apps/test/test_owner/mixed/false/true/true", {
      ".owner": {
        "owners": {
          "*": {
            "branch_owner": true,
            "write_owner": false,
            "write_rule": false,
            "write_function": false
          },
          "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
            "branch_owner": true,
            "write_owner": false,
            "write_rule": false,
            "write_function": false
          },
          "0x08Aed7AF9354435c38d52143EE50ac839D20696b": {
            "branch_owner": false,
            "write_owner": true,
            "write_rule": true,
            "write_function": true
          }
        }
      }
    });

    node.db.setOwnersForTesting("/apps/test/test_owner/mixed/true/false/true", {
      ".owner": {
        "owners": {
          "*": {
            "branch_owner": false,
            "write_owner": true,
            "write_rule": false,
            "write_function": false
          },
          "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
            "branch_owner": false,
            "write_owner": true,
            "write_rule": false,
            "write_function": false
          },
          "0x08Aed7AF9354435c38d52143EE50ac839D20696b": {
            "branch_owner": true,
            "write_owner": false,
            "write_rule": true,
            "write_function": true
          }
        }
      }
    });

    node.db.setOwnersForTesting("/apps/test/test_owner/mixed/true/true/false", {
      ".owner": {
        "owners": {
          "*": {
            "branch_owner": false,
            "write_owner": false,
            "write_rule": true,
            "write_function": true
          },
          "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
            "branch_owner": false,
            "write_owner": false,
            "write_rule": true,
            "write_function": true
          },
          "0x08Aed7AF9354435c38d52143EE50ac839D20696b": {
            "branch_owner": true,
            "write_owner": true,
            "write_rule": false,
            "write_function": false
          }
        }
      }
    });
  })

  afterEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);
  });

  // Known user
  it("branch_owner permission for known user with mixed config", () => {
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true/branch', 'branch_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true/branch', 'branch_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 12502,
      "error_message": "branch_owner permission evaluated false: [{\"branch_owner\":false,\"write_owner\":true,\"write_rule\":true,\"write_function\":true}] at '/apps/test/test_owner/mixed/false/true/true' for owner path '/apps/test/test_owner/mixed/false/true/true/branch' with permission 'branch_owner', auth '{\"addr\":\"0x08Aed7AF9354435c38d52143EE50ac839D20696b\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true/branch', 'branch_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false/branch', 'branch_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
  })

  it("write_owner permission for known user with mixed config", () => {
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true', 'write_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true', 'write_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true', 'write_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 12502,
      "error_message": "write_owner permission evaluated false: [{\"branch_owner\":true,\"write_owner\":false,\"write_rule\":true,\"write_function\":true}] at '/apps/test/test_owner/mixed/true/false/true' for owner path '/apps/test/test_owner/mixed/true/false/true' with permission 'write_owner', auth '{\"addr\":\"0x08Aed7AF9354435c38d52143EE50ac839D20696b\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false', 'write_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
  })

  it("write_rule permission for known user with mixed config", () => {
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 12302,
      "error_message": "write_rule permission evaluated false: [{\"branch_owner\":true,\"write_owner\":true,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/true/true/false' for rule path '/apps/test/test_owner/mixed/true/true/false' with permission 'write_rule', auth '{\"addr\":\"0x08Aed7AF9354435c38d52143EE50ac839D20696b\"}'",
      "matched": "erased",
    });
  })

  it("write_rule permission on deeper path for known user with mixed config", () => {
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true/deeper_path', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true/deeper_path', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true/deeper_path', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false/deeper_path', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 12302,
      "error_message": "write_rule permission evaluated false: [{\"branch_owner\":true,\"write_owner\":true,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/true/true/false' for rule path '/apps/test/test_owner/mixed/true/true/false/deeper_path' with permission 'write_rule', auth '{\"addr\":\"0x08Aed7AF9354435c38d52143EE50ac839D20696b\"}'",
      "matched": "erased",
    });
  })

  it("write_function permission for known user with mixed config", () => {
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 12402,
      "error_message": "write_function permission evaluated false: [{\"branch_owner\":true,\"write_owner\":true,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/true/true/false' for function path '/apps/test/test_owner/mixed/true/true/false' with permission 'write_function', auth '{\"addr\":\"0x08Aed7AF9354435c38d52143EE50ac839D20696b\"}'",
      "matched": "erased",
    });
  })

  it("write_function permission on deeper path for known user with mixed config", () => {
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true/deeper_path', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true/deeper_path', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true/deeper_path', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false/deeper_path', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' })), {
      "code": 12402,
      "error_message": "write_function permission evaluated false: [{\"branch_owner\":true,\"write_owner\":true,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/true/true/false' for function path '/apps/test/test_owner/mixed/true/true/false/deeper_path' with permission 'write_function', auth '{\"addr\":\"0x08Aed7AF9354435c38d52143EE50ac839D20696b\"}'",
      "matched": "erased",
    });
  })

  // Unknown user
  it("branch_owner permission for unknown user with mixed config", () => {
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true/branch', 'branch_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12502,
      "error_message": "branch_owner permission evaluated false: [{\"branch_owner\":false,\"write_owner\":false,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/true/true/true' for owner path '/apps/test/test_owner/mixed/true/true/true/branch' with permission 'branch_owner', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true/branch', 'branch_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true/branch', 'branch_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12502,
      "error_message": "branch_owner permission evaluated false: [{\"branch_owner\":false,\"write_owner\":true,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/true/false/true' for owner path '/apps/test/test_owner/mixed/true/false/true/branch' with permission 'branch_owner', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false/branch', 'branch_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12502,
      "error_message": "branch_owner permission evaluated false: [{\"branch_owner\":false,\"write_owner\":false,\"write_rule\":true,\"write_function\":true}] at '/apps/test/test_owner/mixed/true/true/false' for owner path '/apps/test/test_owner/mixed/true/true/false/branch' with permission 'branch_owner', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
  })

  it("write_owner permission for unknown user with mixed config", () => {
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true', 'write_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12502,
      "error_message": "write_owner permission evaluated false: [{\"branch_owner\":false,\"write_owner\":false,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/true/true/true' for owner path '/apps/test/test_owner/mixed/true/true/true' with permission 'write_owner', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true', 'write_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12502,
      "error_message": "write_owner permission evaluated false: [{\"branch_owner\":true,\"write_owner\":false,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/false/true/true' for owner path '/apps/test/test_owner/mixed/false/true/true' with permission 'write_owner', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true', 'write_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 0,
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false', 'write_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12502,
      "error_message": "write_owner permission evaluated false: [{\"branch_owner\":false,\"write_owner\":false,\"write_rule\":true,\"write_function\":true}] at '/apps/test/test_owner/mixed/true/true/false' for owner path '/apps/test/test_owner/mixed/true/true/false' with permission 'write_owner', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
  })

  it("write_rule permission for unknown user with mixed config", () => {
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12302,
      "error_message": "write_rule permission evaluated false: [{\"branch_owner\":false,\"write_owner\":false,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/true/true/true' for rule path '/apps/test/test_owner/mixed/true/true/true' with permission 'write_rule', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12302,
      "error_message": "write_rule permission evaluated false: [{\"branch_owner\":true,\"write_owner\":false,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/false/true/true' for rule path '/apps/test/test_owner/mixed/false/true/true' with permission 'write_rule', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12302,
      "error_message": "write_rule permission evaluated false: [{\"branch_owner\":false,\"write_owner\":true,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/true/false/true' for rule path '/apps/test/test_owner/mixed/true/false/true' with permission 'write_rule', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 0,
      "matched": "erased",
    });
  })

  it("write_rule permission on deeper path for unknown user with mixed config", () => {
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true/deeper_path', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12302,
      "error_message": "write_rule permission evaluated false: [{\"branch_owner\":false,\"write_owner\":false,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/true/true/true' for rule path '/apps/test/test_owner/mixed/true/true/true/deeper_path' with permission 'write_rule', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true/deeper_path', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12302,
      "error_message": "write_rule permission evaluated false: [{\"branch_owner\":true,\"write_owner\":false,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/false/true/true' for rule path '/apps/test/test_owner/mixed/false/true/true/deeper_path' with permission 'write_rule', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true/deeper_path', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12302,
      "error_message": "write_rule permission evaluated false: [{\"branch_owner\":false,\"write_owner\":true,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/true/false/true' for rule path '/apps/test/test_owner/mixed/true/false/true/deeper_path' with permission 'write_rule', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false/deeper_path', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 0,
      "matched": "erased",
    });
  })

  it("write_function permission for unknown user with mixed config", () => {
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true', 'write_function',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12402,
      "error_message": "write_function permission evaluated false: [{\"branch_owner\":false,\"write_owner\":false,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/true/true/true' for function path '/apps/test/test_owner/mixed/true/true/true' with permission 'write_function', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true', 'write_function',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12402,
      "error_message": "write_function permission evaluated false: [{\"branch_owner\":true,\"write_owner\":false,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/false/true/true' for function path '/apps/test/test_owner/mixed/false/true/true' with permission 'write_function', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true', 'write_function',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12402,
      "error_message": "write_function permission evaluated false: [{\"branch_owner\":false,\"write_owner\":true,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/true/false/true' for function path '/apps/test/test_owner/mixed/true/false/true' with permission 'write_function', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false', 'write_function',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 0,
      "matched": "erased",
    });
  })

  it("write_function permission on deeper path for unknown user with mixed config", () => {
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true/deeper_path', 'write_function',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12402,
      "error_message": "write_function permission evaluated false: [{\"branch_owner\":false,\"write_owner\":false,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/true/true/true' for function path '/apps/test/test_owner/mixed/true/true/true/deeper_path' with permission 'write_function', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true/deeper_path', 'write_function',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12402,
      "error_message": "write_function permission evaluated false: [{\"branch_owner\":true,\"write_owner\":false,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/false/true/true' for function path '/apps/test/test_owner/mixed/false/true/true/deeper_path' with permission 'write_function', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true/deeper_path', 'write_function',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 12402,
      "error_message": "write_function permission evaluated false: [{\"branch_owner\":false,\"write_owner\":true,\"write_rule\":false,\"write_function\":false}] at '/apps/test/test_owner/mixed/true/false/true' for function path '/apps/test/test_owner/mixed/true/false/true/deeper_path' with permission 'write_function', auth '{\"addr\":\"0x07A43138CC760C85A5B1F115aa60eADEaa0bf417\"}'",
      "matched": "erased",
    });
    assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false/deeper_path', 'write_function',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })), {
      "code": 0,
      "matched": "erased",
    });
  })
})

describe("DB sharding config", () => {
  let node;

  beforeEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node, 0, false, false);

    dbValues = {
      "some": {
        "path": {
          "to": {
            "value": "this",
            "number": 10,
          }
        }
      },
      "shards": {
        "enabled_shard": {
          ".shard": {
            "sharding_enabled": true,
          },
          "path": 10,
        },
        "disabled_shard": {
          ".shard": {
            "sharding_enabled": false,
          },
          "path": 10,
        }
      }
    };
    node.db.setValuesForTesting("/apps/test/test_sharding", dbValues);

    dbFuncs = {
      "some": {
        "path": {
          "to": {
            ".function": {
              "fid": {
                "function_type": "REST",
                "function_id": "fid",
                "function_url": "https://events.ainetwork.ai/trigger",
              }
            },
            "deeper": {
              ".function": {
                "fid_deeper": {
                  "function_type": "REST",
                  "function_id": "fid_deeper",
                  "function_url": "https://events.ainetwork.ai/trigger",
                }
              }
            }
          }
        }
      }
    };
    node.db.setFunctionsForTesting("/apps/test/test_sharding", dbFuncs);

    dbRules = {
      "some": {
        "path": {
          ".rule": {
            "write": "false"
          },
          "to": {
            ".rule": {
              "write": "auth.addr === '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1'"
            }
          }
        }
      }
    };
    node.db.setRulesForTesting("/apps/test/test_sharding", dbRules);

    dbOwners = {
      "some": {
        "path": {
          "to": {
            ".owner": {
              "owners": {
                "*": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true,
                },
                "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true,
                }
              }
            }
          }
        }
      }
    };
    node.db.setOwnersForTesting("/apps/test/test_sharding", dbOwners);
  })

  afterEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);
  });

  describe("Sharding path", () => {
    it("getShardingPath", () => {
      expect(node.db.getShardingPath()).to.equal("/apps/afan");
    })

    it("setShardingPath", () => {
      node.db.setShardingPath("/apps/another_app");
      expect(node.db.getShardingPath()).to.equal("/apps/another_app");
    })

    it("isRootBlockchain", () => {
      expect(node.db.isRootBlockchain).to.equal(false);
    })
  })

  describe("Value operations", () => {
    const value = "this";
    const newValue = "that";
    const incDelta = 5;
    const decDelta = 3;

    describe("getValue with isGlobal:", () => {
      it("getValue with isGlobal = false", () => {
        expect(node.db.getValue("/apps/test/test_sharding/some/path/to/value")).to.equal(value);
        expect(node.db.getValue("/apps/test_sharding/afan/test/some/path/to/value")).to.equal(null);
      })

      it("getValue with isGlobal = true", () => {
        expect(node.db.getValue("/apps/test/apps/test/test_sharding/some/path/to/value", { isShallow: false, isGlobal: true })).to.equal(null);
        expect(node.db.getValue("/apps/afan/apps/test/test_sharding/some/path/to/value", { isShallow: false, isGlobal: true }))
            .to.equal(value);
      })

      it("getValue with isGlobal = true and non-existing path", () => {
        expect(node.db.getValue("/apps/some/non-existing/path", { isShallow: false, isGlobal: true })).to.equal(null);
      })
    })


    describe("setValue with isGlobal:", () => {
      it("setValue with isGlobal = false", () => {
        expect(node.db.setValue(
            "/apps/test/test_sharding/some/path/to/value", newValue,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
            null, { extra: { executed_at: 1234567890000 }}).code)
            .to.equal(0);
        expect(node.db.getValue("/apps/test/test_sharding/some/path/to/value")).to.equal(newValue);
      })

      it("setValue with isGlobal = true", () => {
        expect(node.db.setValue(
            "/apps/afan/apps/test/test_sharding/some/path/to/value", newValue,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
            null, { extra: { executed_at: 1234567890000 }}, 100, 1234567890000,
            { isGlobal: true }).code)
            .to.equal(0);
        expect(node.db.getValue("/apps/test/test_sharding/some/path/to/value")).to.equal(newValue);
      })

      it("setValue with isGlobal = true and non-existing path", () => {
        expect(node.db.setValue(
            "/apps/some/non-existing/path", newValue,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
            null, { extra: { executed_at: 1234567890000 }}, 100, 1234567890000,
            { isGlobal: true }).code)
            .to.equal(0);
      })

      it("setValue with isGlobal = false and non-writable path with sharding", () => {
        assert.deepEqual(node.db.setValue(
            "/apps/test/test_sharding/shards/enabled_shard/path", 20), {
          "code": 10103,
          "error_message": "Non-writable path with shard config: /values/apps/test/test_sharding/shards/enabled_shard",
          "bandwidth_gas_amount": 1
        });
      })

      it("setValue with isGlobal = true and non-writable path with sharding", () => {
        expect(node.db.setValue(
            "/apps/afan/apps/test/test_sharding/shards/enabled_shard/path", 20,
            '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1', null, null,
            100, 1234567890000, { isGlobal: true }).code)
            .to.equal(0);
        expect(node.db.getValue(
            "/apps/afan/apps/test/test_sharding/shards/enabled_shard/path",
            { isShallow: false, isGlobal: true }))
            .to.equal(10);  // value unchanged
      })

      it("setValue with isGlobal = false and writable path with sharding", () => {
        expect(node.db.setValue(
            "/apps/test/test_sharding/shards/disabled_shard/path", 20).code)
            .to.equal(0);
        expect(node.db.getValue("/apps/test/test_sharding/shards/disabled_shard/path")).to.equal(20);
      })

      it("setValue with isGlobal = true and writable path with sharding", () => {
        expect(node.db.setValue(
            "apps/afan/apps/test/test_sharding/shards/disabled_shard/path", 20,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
            null, { extra: { executed_at: 1234567890000 }}, 100, 1234567890000,
            { isGlobal: true }).code)
            .to.equal(0);
        expect(node.db.getValue(
            "apps/afan/apps/test/test_sharding/shards/disabled_shard/path",
            { isShallow: false, isGlobal: true }))
            .to.equal(20);  // value changed
      })
    });

    describe("incValue with isGlobal:", () => {
      it("incValue with isGlobal = false", () => {
        expect(node.db.incValue(
            "/apps/test/test_sharding/some/path/to/number", incDelta,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
            null, { extra: { executed_at: 1234567890000 }}).code)
            .to.equal(0);
        expect(node.db.getValue(
            "/apps/test/test_sharding/some/path/to/number")).to.equal(10 + incDelta);
      })

      it("incValue with isGlobal = true", () => {
        expect(node.db.incValue(
            "/apps/afan/apps/test/test_sharding/some/path/to/number", incDelta,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
            null, { extra: { executed_at: 1234567890000 }}, 100, 1234567890000,
            { isGlobal: true }).code)
            .to.equal(0);
        expect(node.db.getValue(
            "/apps/test/test_sharding/some/path/to/number")).to.equal(10 + incDelta);
      })

      it("incValue with isGlobal = true and non-existing path", () => {
        expect(node.db.incValue(
            "/apps/some/non-existing/path", incDelta,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, null, null, 100, 1234567890000,
            { isGlobal: true }).code)
            .to.equal(0);
      })

      it("incValue with isGlobal = false and non-writable path with sharding", () => {
        assert.deepEqual(node.db.incValue("/apps/test/test_sharding/shards/enabled_shard/path", 5), {
          "code": 10103,
          "error_message": "Non-writable path with shard config: /values/apps/test/test_sharding/shards/enabled_shard",
          "bandwidth_gas_amount": 1
        });
      })

      it("incValue with isGlobal = true and non-writable path with sharding", () => {
        expect(node.db.incValue(
            "/apps/afan/apps/test/test_sharding/shards/enabled_shard/path", 5,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
            null, null, 100, 1234567890000, { isGlobal: true }).code)
            .to.equal(0);
        expect(node.db.getValue(
            "apps/afan/apps/test/test_sharding/shards/enabled_shard/path",
            { isShallow: false, isGlobal: true }))
            .to.equal(10);  // value unchanged
      })

      it("incValue with isGlobal = false and writable path with sharding", () => {
        expect(node.db.incValue("/apps/test/test_sharding/shards/disabled_shard/path", 5).code).to.equal(0);
        expect(node.db.getValue("/apps/test/test_sharding/shards/disabled_shard/path"))
            .to.equal(15);  // value changed
      })

      it("incValue with isGlobal = true and writable path with sharding", () => {
        expect(node.db.incValue(
            "/apps/afan/apps/test/test_sharding/shards/disabled_shard/path", 5,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
            null, { extra: { executed_at: 1234567890000 }}, 100, 1234567890000, { isGlobal: true }).code)
            .to.equal(0);
        expect(node.db.getValue(
            "/apps/afan/apps/test/test_sharding/shards/disabled_shard/path",
            { isShallow: false, isGlobal: true }))
            .to.equal(15);  // value changed
      })
    });

    describe("decValue with isGlobal:", () => {
      it("decValue with isGlobal = false", () => {
        expect(node.db.decValue(
            "/apps/test/test_sharding/some/path/to/number", decDelta,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
            null, { extra: { executed_at: 1234567890000 }}).code)
            .to.equal(0);
        expect(node.db.getValue(
            "/apps/test/test_sharding/some/path/to/number")).to.equal(10 - decDelta);
      })

      it("decValue with isGlobal = true", () => {
        expect(node.db.decValue(
            "/apps/afan/apps/test/test_sharding/some/path/to/number", decDelta,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
            null, { extra: { executed_at: 1234567890000 }}, 100, 1234567890000,
            { isGlobal: true }).code)
            .to.equal(0);
        expect(node.db.getValue(
            "/apps/test/test_sharding/some/path/to/number")).to.equal(10 - decDelta);
      })

      it("decValue with isGlobal = true and non-existing path", () => {
        expect(node.db.decValue(
            "/apps/some/non-existing/path", decDelta,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, null, null, 100, 1234567890000, { isGlobal: true }).code)
            .to.equal(0);
      })

      it("decValue with isGlobal = false and non-writable path with sharding", () => {
        assert.deepEqual(node.db.decValue("/apps/test/test_sharding/shards/enabled_shard/path", 5), {
          "code": 10103,
          "error_message": "Non-writable path with shard config: /values/apps/test/test_sharding/shards/enabled_shard",
          "bandwidth_gas_amount": 1
        });
      })

      it("decValue with isGlobal = true and non-writable path with sharding", () => {
        expect(node.db.decValue(
            "/apps/afan/apps/test/test_sharding/shards/enabled_shard/path", 5,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
            null, null, 100, 1234567890000, { isGlobal: true }).code)
            .to.equal(0);
        expect(node.db.getValue(
            "/apps/afan/apps/test/test_sharding/shards/enabled_shard/path",
            { isShallow: false, isGlobal: true }))
            .to.equal(10);  // value unchanged
      })

      it("decValue with isGlobal = false and writable path with sharding", () => {
        expect(node.db.decValue("/apps/test/test_sharding/shards/disabled_shard/path", 5).code)
            .to.equal(0);
        expect(node.db.getValue("/apps/test/test_sharding/shards/disabled_shard/path"))
            .to.equal(5);  // value changed
      })

      it("decValue with isGlobal = true and writable path with sharding", () => {
        expect(node.db.decValue(
            "/apps/afan/apps/test/test_sharding/shards/disabled_shard/path", 5,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
            null, { extra: { executed_at: 1234567890000 }}, 100, 1234567890000,
            { isGlobal: true }).code)
            .to.equal(0);
        expect(node.db.getValue(
            "/apps/afan/apps/test/test_sharding/shards/disabled_shard/path",
            { isShallow: false, isGlobal: true }))
            .to.equal(5);  // value changed
      })
    });
  })

  describe("Function operations", () => {
    const func = {
      ".function": {
        "fid": {
          "function_type": "REST",
          "function_id": "fid",
          "function_url": "https://events.ainetwork.ai/trigger",
        },
      },
      "deeper": {
        ".function": {
          "fid_deeper": {
            "function_type": "REST",
            "function_id": "fid_deeper",
            "function_url": "https://events.ainetwork.ai/trigger",
          },
        }
      }
    };
    const funcChange = {
      ".function": {
        "fid": {
          "function_type": "REST",
          "function_id": "fid",
          "function_url": "http://echo-bot.ainetwork.ai/trigger",  // Listener 2
        },
      }
    };
    const newFunc = {
      ".function": {
        "fid": {
          "function_type": "REST",
          "function_id": "fid",
          "function_url": "http://echo-bot.ainetwork.ai/trigger",  // Listener 2
        },
      },
      "deeper": {
        ".function": {
          "fid_deeper": {
            "function_type": "REST",
            "function_id": "fid_deeper",
            "function_url": "https://events.ainetwork.ai/trigger",
          },
        }
      }
    };

    describe("getFunction with isGlobal:", () => {
      it("getFunction with isGlobal = false", () => {
        assert.deepEqual(node.db.getFunction(
            "/apps/test/test_sharding/some/path/to"), func);
        expect(node.db.getFunction(
            "apps/afan/test/test_sharding/some/path/to")).to.equal(null);
      })

      it("getFunction with isGlobal = true", () => {
        expect(node.db.getFunction(
            "/apps/test/test_sharding/some/path/to",
            { isShallow: false, isGlobal: true })).to.equal(null);
        assert.deepEqual(node.db.getFunction(
            "/apps/afan/apps/test/test_sharding/some/path/to",
            { isShallow: false, isGlobal: true }), func);
      })

      it("getFunction with isGlobal = true and non-existing path", () => {
        expect(node.db.getFunction(
            "/apps/some/non-existing/path", { isShallow: false, isGlobal: true })).to.equal(null);
      })
    });

    describe("setFunction with isGlobal:", () => {
      it("setFunction with isGlobal = false", () => {
        expect(node.db.setFunction(
            "/apps/test/test_sharding/some/path/to", funcChange,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }).code)
            .to.equal(0);
        assert.deepEqual(node.db.getFunction("/apps/test/test_sharding/some/path/to"), newFunc);
      })

      it("setFunction with isGlobal = true", () => {
        expect(node.db.setFunction(
            "/apps/afan/apps/test/test_sharding/some/path/to", funcChange,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, 0, { isGlobal: true }).code)
            .to.equal(0);
        assert.deepEqual(node.db.getFunction(
            "/apps/afan/apps/test/test_sharding/some/path/to",
            { isShallow: false, isGlobal: true }), newFunc);
      })

      it("setFunction with isGlobal = true and non-existing path", () => {
        expect(node.db.setFunction(
            "/apps/some/non-existing/path", funcChange,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, 0, { isGlobal: true }).code)
            .to.equal(0);
      })
    });

    describe("matchFunction with isGlobal:", () => {
      it("matchFunction with isGlobal = false", () => {
        assert.deepEqual(node.db.matchFunction(
            "/apps/test/test_sharding/some/path/to"), {
          "matched_path": {
            "target_path": "/apps/test/test_sharding/some/path/to",
            "ref_path": "/apps/test/test_sharding/some/path/to",
            "path_vars": {},
          },
          "matched_config": {
            "config": {
              "fid": {
                "function_type": "REST",
                "function_id": "fid",
                "function_url": "https://events.ainetwork.ai/trigger",
              }
            },
            "path": "/apps/test/test_sharding/some/path/to"
          },
          "subtree_configs": [
            {
              "config": {
                "fid_deeper": {
                  "function_type": "REST",
                  "function_id": "fid_deeper",
                  "function_url": "https://events.ainetwork.ai/trigger",
                },
              },
              "path": "/deeper",
            }
          ]
        });
      })

      it("matchFunction with isGlobal = true", () => {
        assert.deepEqual(node.db.matchFunction(
            "/apps/afan/apps/test/test_sharding/some/path/to", { isGlobal: true }), {
          "matched_path": {
            "target_path": "/apps/afan/apps/test/test_sharding/some/path/to",
            "ref_path": "/apps/afan/apps/test/test_sharding/some/path/to",
            "path_vars": {},
          },
          "matched_config": {
            "config": {
              "fid": {
                "function_type": "REST",
                "function_id": "fid",
                "function_url": "https://events.ainetwork.ai/trigger",
              }
            },
            "path": "/apps/afan/apps/test/test_sharding/some/path/to"
          },
          "subtree_configs": [
            {
              "config": {
                "fid_deeper": {
                  "function_type": "REST",
                  "function_id": "fid_deeper",
                  "function_url": "https://events.ainetwork.ai/trigger",
                },
              },
              "path": "/deeper",
            }
          ]
        });
      })

      it("matchFunction with isGlobal = true and non-existing path", () => {
        expect(node.db.matchFunction("/apps/some/non-existing/path", { isGlobal: true })).to.equal(null);
      })
    });
  })

  describe("Rule operations", () => {
    const rule = {
      ".rule": {
        "write": "auth.addr === '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1'"
      }
    };
    const newRule = {
      ".rule": {
        "write": "auth.addr === 'xyz'"
      }
    };
    const newValue = "that";

    describe("getRule with isGlobal:", () => {
      it("getRule with isGlobal = false", () => {
        assert.deepEqual(node.db.getRule("/apps/test/test_sharding/some/path/to"), rule);
        expect(node.db.getRule("/apps/afan/apps/test/test_sharding/some/path/to")).to.equal(null);
      })

      it("getRule with isGlobal = true", () => {
        expect(node.db.getRule(
            "/apps/test/test_sharding/some/path/to", { isShallow: false, isGlobal: true })).to.equal(null);
        assert.deepEqual(node.db.getRule(
            "/apps/afan/apps/test/test_sharding/some/path/to", { isShallow: false, isGlobal: true }), rule);
      })

      it("getRule with isGlobal = true and non-existing path", () => {
        expect(node.db.getRule(
            "/apps/some/non-existing/path", { isShallow: false, isGlobal: true })).to.equal(null);
      })
    });

    describe("setRule with isGlobal:", () => {
      it("setRule with isGlobal = false", () => {
        expect(node.db.setRule(
            "/apps/test/test_sharding/some/path/to", newRule,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }).code)
            .to.equal(0);
        assert.deepEqual(node.db.getRule("/apps/test/test_sharding/some/path/to"), newRule);
      })

      it("setRule with isGlobal = true", () => {
        expect(node.db.setRule(
            "/apps/afan/apps/test/test_sharding/some/path/to", newRule,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, 0, { isGlobal: true }).code)
            .to.equal(0);
        assert.deepEqual(node.db.getRule(
            "/apps/afan/apps/test/test_sharding/some/path/to",
            { isShallow: false, isGlobal: true }), newRule);
      })

      it("setRule with isGlobal = true and non-existing path", () => {
        expect(node.db.setRule("/apps/some/non-existing/path", newRule, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, 0, { isGlobal: true }).code)
            .to.equal(0);
      })
    });

    describe("matchRule with isGlobal:", () => {
      it("matchRule with isGlobal = false", () => {
        assert.deepEqual(node.db.matchRule("/apps/test/test_sharding/some/path/to"), {
          "write": {
            "matched_path": {
              "target_path": "/apps/test/test_sharding/some/path/to",
              "ref_path": "/apps/test/test_sharding/some/path/to",
              "path_vars": {},
            },
            "matched_config": {
              "config": {
                "write": "auth.addr === '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1'"
              },
              "path": "/apps/test/test_sharding/some/path/to"
            },
            "subtree_configs": []
          },
          "state": {
            "matched_path": {
              "target_path": "/apps/test/test_sharding/some/path/to",
              "ref_path": "/apps/test/test_sharding/some/path/to",
              "path_vars": {}
            },
            "matched_config": {
              "path": "/",
              "config": null
            }
          }
        });
      })

      it("matchRule with isGlobal = true", () => {
        assert.deepEqual(node.db.matchRule(
            "/apps/afan/apps/test/test_sharding/some/path/to", { isGlobal: true }), {
          "write": {
            "matched_path": {
              "target_path": "/apps/afan/apps/test/test_sharding/some/path/to",
              "ref_path": "/apps/afan/apps/test/test_sharding/some/path/to",
              "path_vars": {},
            },
            "matched_config": {
              "config": {
                "write": "auth.addr === '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1'"
              },
              "path": "/apps/afan/apps/test/test_sharding/some/path/to"
            },
            "subtree_configs": []
          },
          "state": {
            "matched_config": {
              "config": null,
              "path": "/apps/afan"
            },
            "matched_path": {
              "path_vars": {},
              "ref_path": "/apps/afan/apps/test/test_sharding/some/path/to",
              "target_path": "/apps/afan/apps/test/test_sharding/some/path/to"
            }
          }
        });
      })

      it("matchRule with isGlobal = true and non-existing path", () => {
        expect(node.db.matchRule("/apps/some/non-existing/path", { isGlobal: true })).to.equal(null);
      })
    });

    describe("evalRule with isGlobal:", () => {
      it("evalRule with isGlobal = false", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/test/test_sharding/some/path/to", newValue,
            { addr: "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1" })), {
          "code": 0,
          "matched": "erased",
        });
      })

      it("evalRule with isGlobal = true", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/afan/apps/test/test_sharding/some/path/to", newValue,
            { addr: "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1" }, null, { isGlobal: true })), {
          "code": 0,
          "matched": "erased",
        });
      })

      it("evalRule with isGlobal = true and non-existing path", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalRule(
            "/apps/some/non-existing/path", newValue,
            { addr: "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1" }, null, { isGlobal: true })),
            null);
      })
    });
  })

  describe("Owner operations", () => {
    const owner = {
      ".owner": {
        "owners": {
          "*": {
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            "write_rule": true,
          },
          "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            "write_rule": true,
          }
        }
      }
    };
    const ownerChange = {
      ".owner": {
        "owners": {
          "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": null
        }
      }
    };
    const newOwner = {
      ".owner": {
        "owners": {
          "*": {
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            "write_rule": true,
          },
        }
      }
    };

    describe("getOwner with isGlobal:", () => {
      it("getOwner with isGlobal = false", () => {
        assert.deepEqual(node.db.getOwner("/apps/test/test_sharding/some/path/to"), owner);
        expect(node.db.getOwner("/apps/afan/apps/test/test_sharding/some/path/to")).to.equal(null);
      })

      it("getOwner with isGlobal = true", () => {
        expect(node.db.getOwner("/apps/test/test_sharding/some/path/to", { isShallow: false, isGlobal: true })).to.equal(null);
        assert.deepEqual(
            node.db.getOwner("apps/afan/apps/test/test_sharding/some/path/to", { isShallow: false, isGlobal: true }), owner);
      })

      it("getOwner with isGlobal = true and non-existing path", () => {
        expect(node.db.getOwner("/apps/some/non-existing/path", { isShallow: false, isGlobal: true })).to.equal(null);
      })
    });

    describe("setOwner with isGlobal:", () => {
      it("setOwner with isGlobal = false", () => {
        expect(node.db.setOwner(
            "/apps/test/test_sharding/some/path/to", ownerChange,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }).code)
                .to.equal(0);
        assert.deepEqual(node.db.getOwner("/apps/test/test_sharding/some/path/to"), newOwner);
      })

      it("setOwner with isGlobal = true", () => {
        expect(node.db.setOwner(
            "/apps/afan/apps/test/test_sharding/some/path/to", ownerChange,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, 0, { isGlobal: true }).code)
                .to.equal(0);
        assert.deepEqual(
            node.db.getOwner("/apps/afan/apps/test/test_sharding/some/path/to", { isShallow: false, isGlobal: true }), newOwner);
      })

      it("setOwner with isGlobal = true and non-existing path", () => {
        expect(node.db.setOwner(
            "/apps/some/non-existing/path", ownerChange,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, 0, { isGlobal: true }).code).to.equal(0);
      })
    });

    describe("matchOwner with isGlobal:", () => {
      it("matchOwner with isGlobal = false", () => {
        assert.deepEqual(node.db.matchOwner("/apps/test/test_sharding/some/path/to"), {
          "matched_path": {
            "target_path": "/apps/test/test_sharding/some/path/to",
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true,
                },
                "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true,
                }
              }
            },
            "path": "/apps/test/test_sharding/some/path/to"
          },
          "subtree_configs": []
        });
      })

      it("matchOwner with isGlobal = true", () => {
        assert.deepEqual(node.db.matchOwner("/apps/afan/apps/test/test_sharding/some/path/to", { isGlobal: true }), {
          "matched_path": {
            "target_path": "/apps/afan/apps/test/test_sharding/some/path/to",
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true,
                },
                "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true,
                }
              }
            },
            "path": "/apps/afan/apps/test/test_sharding/some/path/to"
          },
          "subtree_configs": []
        });
      })

      it("matchOwner with isGlobal = true and non-existing path", () => {
        expect(node.db.matchOwner("/apps/some/non-existing/path", { isGlobal: true })).to.equal(null);
      })
    });

    describe("evalOwner with isGlobal:", () => {
      it("evalOwner with isGlobal = false", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/test/test_sharding/some/path/to", "write_rule",
            { addr: "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1" })), {
          "code": 0,
          "matched": "erased",
        });
      })

      it("evalOwner with isGlobal = true", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/afan/apps/test/test_sharding/some/path/to", "write_rule",
            { addr: "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1" }, { isGlobal: true })), {
          "code": 0,
          "matched": "erased",
        });
      })

      it("evalOwner with isGlobal = true and non-existing path", () => {
        assert.deepEqual(eraseEvalResMatched(node.db.evalOwner(
            "/apps/some/non-existing/path", "write_rule",
            { addr: "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1" }, { isGlobal: true })),
            null);
      })
    });
  })
})

describe("State info", () => {
  let node, valuesObject;

  beforeEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node);

    valuesObject = {
      level0: {
        level1: {
          level2: {
            foo: 'bar',
            baz: 'caz'
          },
          level2_sibling: {
            data1: true,
            data2: -200
          }
        }
      },
      another_route: {
        child1: '',
        child2: 0,
        child3: false
      }
    };
    node.db.setValuesForTesting("/apps/test", valuesObject);
  });

  afterEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);
  });

  describe("Check proof for setValue, setOwner, setRule, and setFunction", () => {
    it("checks state info of under $root_path/test", () => {
      const valuesNode = node.db.getRefForReading(['values', 'apps', 'test']);
      const ownersNode = node.db.getRefForReading(['owners', 'apps', 'test']);
      const rulesNode = node.db.getRefForReading(['rules', 'apps', 'test']);
      const functionNode = node.db.getRefForReading(['functions', 'apps', 'test']);
      expect(valuesNode.verifyStateInfo()).to.equal(true);
      expect(ownersNode.verifyStateInfo()).to.equal(true);
      expect(rulesNode.verifyStateInfo()).to.equal(true);
      expect(functionNode.verifyStateInfo()).to.equal(true);
    });

    it("checks newly setup state info", () => {
      const nestedRules = {
        "nested": {
          "$var_path": {
            ".rule": {
              "write": "auth.addr !== 'abcd'"
            }
          },
          "path": {
            ".rule": {
              "write": "auth.addr === 'abcd'"
            },
            "deeper": {
              "path": {
                ".rule": {
                  "write": "auth.addr === 'ijkl'"
                }
              }
            }
          }
        }
      };

      const dbFuncs = {
        "some": {
          "$var_path": {
            ".function": {
              "fid_var": "some function config with var path"
            }
          },
          "path": {
            ".function": {
              "fid": "some function config",
            },
            "deeper": {
              "path": {
                ".function": {
                  "fid_deeper": "some function config deeper"
                }
              }
            }
          },
        }
      };
      node.db.setValue("/apps/test/level0/level1/level2", { aaa: 'bbb' });
      node.db.setOwner("/apps/test/empty_owners/.owner/owners/*/write_function", false);
      node.db.setRule("/apps/test/test_rules", nestedRules);
      node.db.setFunction("/apps/test/test_functions", dbFuncs);
      const valuesNode = node.db.getRefForReading(['values', 'apps', 'test']);
      const ownersNode = node.db.getRefForReading(['owners', 'apps', 'test']);
      const rulesNode = node.db.getRefForReading(['rules', 'apps', 'test']);
      const functionNode = node.db.getRefForReading(['functions', 'apps', 'test']);
      expect(valuesNode.verifyStateInfo()).to.equal(true);
      expect(ownersNode.verifyStateInfo()).to.equal(true);
      expect(rulesNode.verifyStateInfo()).to.equal(true);
      expect(functionNode.verifyStateInfo()).to.equal(true);
    });
  });

  describe("getStateProof / verifyStateProof", () => {
    it("null case", () => {
      assert.deepEqual(null, node.db.getStateProof('/apps/test/test'));
    });

    it("non-null case", () => {
      const proof = node.db.getStateProof('/values/blockchain_params/token/symbol');
      expect(proof).to.not.equal(null);
      expect(proof['#state_ph']).to.not.equal(null);
      const verifResult = verifyStateProof(hashDelimiter, proof);
      _.set(verifResult, 'curProofHash', 'erased');
      assert.deepEqual(verifResult, {
        "curProofHash": "erased",
        "isVerified": true,
        "mismatchedPath": null,
        "mismatchedProofHash": null,
        "mismatchedProofHashComputed": null,
      });
    });
  });

  describe("getProofHash", () => {
    it("null case", () => {
      assert.deepEqual(null, node.db.getProofHash('/apps/test/test'));
    });

    it("non-null case", () => {
      expect(node.db.getProofHash('/values/blockchain_params/token/symbol')).to.not.equal(null);
    });
  });
});

describe("State info - getStateInfo", () => {
  let node, valuesObject;

  beforeEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node);

    valuesObject = {
      label1: {
        label11: 'value11',
        label12: {
          label121: 'value121',
          label122: 'value122',
        }
      },
      label2: {
        label21: 'value11',
        label22: 'value12',
      }
    };
    node.db.setValuesForTesting("/apps/test", valuesObject);
  });

  afterEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);
  });

  describe("No tree structure change", () => {
    it("replace node values", () => {
      result = node.db.setValue('/apps/test/label1/label12', {  // Only value updates
        label121: 'new_value121',
        label122: 'new_value122'
      });
      assert.deepEqual(result.code, 0);

      // Existing paths.
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label1'), {
        "#state_ph": "0xe4fd1f81f45b74ccd16540efa905abde37b6660d3fe9fb18eb3bf6b3e7cd215a",
        "#tree_bytes": 922,
        "#tree_height": 2,
        "#tree_size": 5,
        "#version": "NODE:0"
      });
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label1/label11'), {
        "#state_ph": "0xa8681012b27ff56a45aa80f6f4d95c66c3349046cdd18cdc77028b6a634c9b0b",
        "#tree_bytes": 174,
        "#tree_height": 0,
        "#tree_size": 1,
        "#version": "NODE:0",
      });
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label1/label12'), {
        "#state_ph": "0x19037329315c0182c0f965a786e6d0659bb374e907a3937f885f0da3984cfa6e",
        "#tree_bytes": 560,
        "#tree_height": 1,
        "#tree_size": 3,
        "#version": "NODE:0",
      });
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label1/label12/label121'), {
        "#state_ph": "0xfbe04067ec980e5d7364e8b6cf45f4bee9d53be89419211d0233aada9151ad50",
        "#tree_bytes": 184,
        "#tree_height": 0,
        "#tree_size": 1,
        "#version": "NODE:0",
      });
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label1/label12/label122'), {
        "#state_ph": "0x8f17965ac862bad15172d21facff45ff3efb8a55ae50ca085131a3012e001c1f",
        "#tree_bytes": 184,
        "#tree_height": 0,
        "#tree_size": 1,
        "#version": "NODE:0",
      });
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label2'), {
        "#state_ph": "0x0088bff9a36081510c230f5fd6b6581b81966b185414e625df7553693d6517e3",
        "#tree_bytes": 536,
        "#tree_height": 1,
        "#tree_size": 3,
        "#version": "NODE:0",
      });
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label2/label21'), {
        "#state_ph": "0xa8681012b27ff56a45aa80f6f4d95c66c3349046cdd18cdc77028b6a634c9b0b",
        "#tree_bytes": 174,
        "#tree_height": 0,
        "#tree_size": 1,
        "#version": "NODE:0",
      });
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label2/label22'), {
        "#state_ph": "0xc0da1458b190e12347891ab14253518f5e43d95473cd2546dbf8852dfb3dc281",
        "#tree_bytes": 174,
        "#tree_height": 0,
        "#tree_size": 1,
        "#version": "NODE:0",
      });

      // Non-existing paths.
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/non-existing/path'), null);
    });
  });

  describe("Tree reduction", () => {
    it("remove state nodes", () => {
      result = node.db.setValue("/apps/test/label1/label12", null);  // Reduce tree
      assert.deepEqual(result.code, 0);

      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label1'), {
        "#state_ph": "0xe037f0083e30127f0e5088be69c2629a7e14e18518ee736fc31d86ec39b3c459",
        "#tree_bytes": 348,
        "#tree_height": 1,
        "#tree_size": 2,
        "#version": "NODE:0"
      });
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label1/label11'), {
        "#state_ph": "0xa8681012b27ff56a45aa80f6f4d95c66c3349046cdd18cdc77028b6a634c9b0b",
        "#tree_bytes": 174,
        "#tree_height": 0,
        "#tree_size": 1,
        "#version": "NODE:0",
      });
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label1/label12'), null);
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label2'), {
        "#state_ph": "0x0088bff9a36081510c230f5fd6b6581b81966b185414e625df7553693d6517e3",
        "#tree_bytes": 536,
        "#tree_height": 1,
        "#tree_size": 3,
        "#version": "NODE:0",
      });
    });
  });

  describe("Tree expansion", () => {
    it("add state nodes", () => {
      result = node.db.setValue('/apps/test/label2/label21', {  // Expand tree
        label211: 'value211',
        label212: 'value212'
      });
      assert.deepEqual(result.code, 0);

      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label1'), {
        "#state_ph": "0xc751739c3275e0b4c143835fcc0342b80af43a74cf338a8571c17e727643bbe7",
        "#tree_bytes": 906,
        "#tree_height": 2,
        "#tree_size": 5,
        "#version": "NODE:0"
      });
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label2'), {
        "#state_ph": "0xdd1c06ba6d6ff93fea2f2a1a3a026692858cd3528424b2f86197e1761539b0e4",
        "#tree_bytes": 906,
        "#tree_height": 2,
        "#tree_size": 5,
        "#version": "NODE:0",
      });
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label2/label21'), {
        "#state_ph": "0xdfe61d4a6c026b34261bc83f4c9d5d24deaed1671177fee24a889930588edd89",
        "#tree_bytes": 544,
        "#tree_height": 1,
        "#tree_size": 3,
        "#version": "NODE:0",
      });
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label2/label21/label211'), {
        "#state_ph": "0xc7b107bdd716d26c8fe34fbcec5b91d738c3f53ee09fdf047678e85181e5f90c",
        "#tree_bytes": 176,
        "#tree_height": 0,
        "#tree_size": 1,
        "#version": "NODE:0",
      });
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label2/label21/label212'), {
        "#state_ph": "0x736c5dded3f67ab5717c8c7c1b15580cb0bbf23562edd4a6898f2c1a6ca63200",
        "#tree_bytes": 176,
        "#tree_height": 0,
        "#tree_size": 1,
        "#version": "NODE:0",
      });
      assert.deepEqual(node.db.getStateInfo('/values/apps/test/label2/label22'), {
        "#state_ph": "0xc0da1458b190e12347891ab14253518f5e43d95473cd2546dbf8852dfb3dc281",
        "#tree_bytes": 174,
        "#tree_height": 0,
        "#tree_size": 1,
        "#version": "NODE:0",
      });
    });
  });
});

describe("State version handling", () => {
  let node;
  let dbValues;

  beforeEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node);

    dbValues = {
      "child_1": {
        "child_11": {
          "child_111": "value_111",
          "child_112": "value_112",
        },
        "child_12": {
          "child_121": "value_121",
          "child_122": "value_122",
        }
      },
      "child_2": {
        "child_21": {
          "child_211": "value_211",
          "child_212": "value_212",
        },
        "child_22": {
          "child_221": "value_221",
          "child_222": "value_222",
        }
      }
    };
    node.db.setValuesForTesting("/apps/test", dbValues);
  });

  afterEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);
  });

  describe("getRefForReading", () => {
    it("the nodes on the path are not affected", () => {
      expect(node.db.deleteBackupStateVersion()).to.equal(true);
      const child2 = node.db.stateRoot.getChild('values').getChild('apps').getChild('test').getChild('child_2');
      const child21 = child2.getChild('child_21');
      const child212 = child21.getChild('child_212');

      expect(node.db.getRefForReading(['values', 'apps', 'test', 'child_2', 'child_21', 'child_212']))
          .to.not.equal(null);

      // The nodes on the path are not affected.
      const newChild2 = node.db.stateRoot.getChild('values').getChild('apps').getChild('test').getChild('child_2');
      const newChild21 = newChild2.getChild('child_21');
      const newChild212 = newChild21.getChild('child_212');
      expect(newChild2).to.equal(child2);  // Not cloned
      expect(newChild21).to.equal(child21);  // Not cloned
      expect(newChild212).to.equal(child212);  // Not cloned
    });
  });

  describe("getRefForWriting", () => {
    it("the nodes of single access path are not cloned", () => {
      // First referencing to make the number of access paths = 1.
      expect(node.db.getRefForWriting(['values', 'apps', 'test', 'child_2', 'child_21', 'child_212']))
          .to.not.equal(null);
      const child2 = node.db.stateRoot.getChild('values').getChild('apps').getChild('test').getChild('child_2');
      const child21 = child2.getChild('child_21');
      const child212 = child21.getChild('child_212');

      // Second referencing.
      expect(node.db.getRefForWriting(['values', 'apps', 'test', 'child_2', 'child_21', 'child_212']))
          .to.not.equal(null);

      // The nodes on the path are not cloned.
      const newChild2 = node.db.stateRoot.getChild('values').getChild('apps').getChild('test').getChild('child_2');
      const newChild21 = newChild2.getChild('child_21');
      const newChild212 = newChild21.getChild('child_212');
      expect(newChild2).to.equal(child2);  // Not cloned
      expect(newChild21).to.equal(child21);  // Not cloned
      expect(newChild212).to.equal(child212);  // Not cloned
    });

    it("the nodes of multiple access paths are cloned - multiple roots", () => {
      // Make the number of roots = 2.
      const otherRoot = node.stateManager.cloneVersion(node.db.stateVersion, 'new version');
      expect(otherRoot).to.not.equal(null);
      const child2 = node.db.stateRoot.getChild('values').getChild('apps').getChild('test').getChild('child_2');
      const child21 = child2.getChild('child_21');
      const child212 = child21.getChild('child_212');

      expect(node.db.getRefForWriting(['values', 'apps', 'test', 'child_2', 'child_21', 'child_212']))
          .to.not.equal(null);

      // The nodes on the path are cloned.
      const newChild2 = node.db.stateRoot.getChild('values').getChild('apps').getChild('test').getChild('child_2');
      const newChild21 = newChild2.getChild('child_21');
      const newChild212 = newChild21.getChild('child_212');
      expect(newChild2).to.not.equal(child2);  // Cloned.
      expect(newChild21).to.not.equal(child21);  // Cloned.
      expect(newChild212).to.not.equal(child212);  // Cloned.
    });

    it("the nodes of multiple access paths are cloned - multiple parents case 1", () => {
      const child2 = node.db.stateRoot.getChild('values').getChild('apps').getChild('test').getChild('child_2');
      const child21 = child2.getChild('child_21');
      const child212 = child21.getChild('child_212');
      // Make child21's number of parents = 2.
      const clonedChild2 = child2.clone('new version');

      expect(node.db.getRefForWriting(['values', 'apps', 'test', 'child_2', 'child_21', 'child_212']))
          .to.not.equal(null);

      // Only the nodes of multiple paths are cloned.
      const newChild2 = node.db.stateRoot.getChild('values').getChild('apps').getChild('test').getChild('child_2');
      const newChild21 = newChild2.getChild('child_21');
      const newChild212 = newChild21.getChild('child_212');
      expect(newChild2).to.equal(child2);  // Not cloned.
      expect(newChild21).to.not.equal(child21);  // Cloned.
      expect(newChild212).to.not.equal(child212);  // Cloned.
    });

    it("the nodes of multiple access paths are cloned - multiple parents case 2", () => {
      const child2 = node.db.stateRoot.getChild('values').getChild('apps').getChild('test').getChild('child_2');
      const child21 = child2.getChild('child_21');
      const child212 = child21.getChild('child_212');
      // Make child212's number of parents = 2.
      const clonedChild21 = child21.clone('new version');

      expect(node.db.getRefForWriting(['values', 'apps', 'test', 'child_2', 'child_21', 'child_212']))
          .to.not.equal(null);

      // Only the nodes of multiple paths are cloned.
      const newChild2 = node.db.stateRoot.getChild('values').getChild('apps').getChild('test').getChild('child_2');
      const newChild21 = newChild2.getChild('child_21');
      const newChild212 = newChild21.getChild('child_212');
      expect(newChild2).to.equal(child2);  // Not cloned.
      expect(newChild21).to.equal(child21);  // Not cloned.
      expect(newChild212).to.not.equal(child212);  // Cloned.
    });

    it("the on other ref paths are not affected", () => {
      const otherRoot = node.stateManager.cloneVersion(node.db.stateVersion, 'new version');
      expect(otherRoot).to.not.equal(null);
      const beforeOtherChild2 = otherRoot.getChild('values').getChild('apps').getChild('test').getChild('child_2');
      const beforeOtherChild21 = beforeOtherChild2.getChild('child_21');
      const beforeOtherChild212 = beforeOtherChild21.getChild('child_212');

      expect(node.db.getRefForWriting(['values', 'apps', 'test', 'child_2', 'child_21', 'child_212']))
          .to.not.equal(null);

      // The nodes on the path from other roots are not affected.
      const afterOtherChild2 = otherRoot.getChild('values').getChild('apps').getChild('test').getChild('child_2');
      const afterOtherChild21 = afterOtherChild2.getChild('child_21');
      const afterOtherChild212 = afterOtherChild21.getChild('child_212');
      expect(afterOtherChild2).to.equal(beforeOtherChild2);  // Not cloned
      expect(afterOtherChild21).to.equal(beforeOtherChild21);  // Not cloned
      expect(afterOtherChild212).to.equal(beforeOtherChild212);  // Not cloned

      // The state values of other roots are not affected.
      assert.deepEqual(otherRoot.getChild('values').getChild('apps').getChild('test').toStateSnapshot(), dbValues);
    });
  });

  describe("backupDb / restoreDb", () => {
    it("backuped states are restored", () => {
      assert.deepEqual(node.db.getValue('/apps/test'), dbValues);

      assert.deepEqual(node.db.backupDb(), true);
      expect(node.db.backupStateVersion).to.not.equal(null);
      expect(node.db.backupStateRoot).to.not.equal(null);
      assert.deepEqual(node.db.getValue('/apps/test'), dbValues);
      assert.deepEqual(
          node.db.setValue('/apps/test/child_2/child_21', { 'new_child': 'new_value' }).code, 0);
      assert.deepEqual(node.db.getValue('/apps/test/child_2/child_21'), { 'new_child': 'new_value' });

      assert.deepEqual(node.db.restoreDb(), true);
      expect(node.db.backupStateVersion).to.equal(null);
      expect(node.db.backupStateRoot).to.equal(null);
      assert.deepEqual(node.db.getValue('/apps/test'), dbValues);
    });
  });
});
