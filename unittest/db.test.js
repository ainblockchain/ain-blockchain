const BlockchainNode = require('../node')
const rimraf = require('rimraf');
const _ = require("lodash");
const ainUtil = require('@ainblockchain/ain-util');
const {
  CHAINS_DIR,
  GenesisToken,
  GenesisAccounts,
  GenesisSharding,
  GENESIS_WHITELIST,
  GenesisFunctions,
  GenesisRules,
  GenesisOwners,
  PredefinedDbPaths,
  StateInfoProperties,
  SERVICE_STATE_BUDGET,
  StateVersions,
} = require('../common/constants')
const {
  verifyStateProof,
} = require('../db/state-util');
const Transaction = require('../tx-pool/transaction');
const CommonUtil = require('../common/common-util');
const {
  setNodeForTesting,
} = require('./test-util');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("DB initialization", () => {
  let node;

  beforeEach(() => {
    rimraf.sync(CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node, 0, true);
  })

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  describe("Sharding path", () => {
    it("getShardingPath", () => {
      expect(node.db.getShardingPath()).to.equal(GenesisSharding.sharding_path);
    })

    it("isRootBlockchain", () => {
      expect(node.db.isRootBlockchain).to.equal(GenesisSharding.sharding_protocol === 'NONE');
    })
  })

  describe("Token", () => {
    it("loading token properly on initialization", () => {
      assert.deepEqual(node.db.getValue(`/token`), GenesisToken);
    })
  })

  describe("Balances", () => {
    it("loading balances properly on initialization", () => {
      const expected =
          GenesisToken.total_supply - GenesisAccounts.others.length * GenesisAccounts.shares;
      const dbPath = `/accounts/${GenesisAccounts.owner.address}/balance`;
      expect(node.db.getValue(dbPath)).to.equal(expected);
    })
  })

  describe("Sharding", () => {
    it("loading sharding properly on initialization", () => {
      assert.deepEqual(node.db.getValue(`/sharding/config`), GenesisSharding);
    })
  })

  describe("Whitelist", () => {
    it("loading whitelist properly on initialization", () => {
      assert.deepEqual(node.db.getValue(`/consensus/whitelist`), GENESIS_WHITELIST);
    })
  })

  describe("Functions", () => {
    it("loading functions properly on initialization", () => {
      assert.deepEqual(node.db.getFunction('/'), GenesisFunctions);
    })
  })

  describe("Rules", () => {
    it("loading rules properly on initialization", () => {
      const genesisRuleWithConsensusApp = JSON.parse(JSON.stringify(GenesisRules));
      CommonUtil.setJsObject(
        genesisRuleWithConsensusApp,
        ['apps', 'consensus'],
        {
          ".rule": {
            "write": "auth.addr === '0xAAAf6f50A0304F12119D218b94bea8082642515B'"
          }
        }
      );
      assert.deepEqual(node.db.getRule("/"), genesisRuleWithConsensusApp);
    })
  })

  describe("Owners", () => {
    it("loading owners properly on initialization", () => {
      const genesisOwnerWithConsensusApp = JSON.parse(JSON.stringify(GenesisOwners));
      CommonUtil.setJsObject(genesisOwnerWithConsensusApp, ['apps', 'consensus'], {
        ".owner": {
          owners: {
            "0xAAAf6f50A0304F12119D218b94bea8082642515B": {
              branch_owner: true,
              write_function: true,
              write_owner: true,
              write_rule: true
            }
          }
        }
      });
      assert.deepEqual(node.db.getOwner('/'), genesisOwnerWithConsensusApp);
    })
  })
})

describe("DB operations", () => {
  let node, dbValues, dbFuncs, dbRules, dbOwners;

  beforeEach(() => {
    let result;

    rimraf.sync(CHAINS_DIR);

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
    result = node.db.setValue("/apps/test", dbValues);
    assert.deepEqual(result.code, 0);

    dbFuncs = {
      "some": {
        "$var_path": {
          ".function": {
            "fid_var": {
              "function_type": "REST",
              "function_id": "fid_var",
              "event_listener": "https://events.ainetwork.ai/trigger",
              "service_name": "https://ainetwork.ai",
            },
          }
        },
        "path": {
          ".function": {
            "fid": {
              "function_type": "REST",
              "function_id": "fid",
              "event_listener": "https://events.ainetwork.ai/trigger",
              "service_name": "https://ainetwork.ai",
            },
          },
          "deeper": {
            "path": {
              ".function": {
                "fid_deeper": {
                  "function_type": "REST",
                  "function_id": "fid_deeper",
                  "event_listener": "https://events.ainetwork.ai/trigger",
                  "service_name": "https://ainetwork.ai",
                }
              }
            }
          }
        },
      }
    };
    result = node.db.setFunction("/apps/test/test_function", dbFuncs);
    assert.deepEqual(result.code, 0);

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
    result = node.db.setRule("/apps/test/test_rule", dbRules);
    assert.deepEqual(result.code, 0);

    dbOwners = {
      "some": {
        "path": {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": false,
                "write_function": true,
                "write_owner": false,
                "write_rule": true,
              },
              "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                "branch_owner": true,
                "write_function": false,
                "write_owner": true,
                "write_rule": false,
              }
            }
          },
          "deeper": {
            "path": {
              ".owner": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_function": true,
                    "write_owner": false,
                    "write_rule": true,
                  },
                  "0x08Aed7AF9354435c38d52143EE50ac839D20696b": {
                    "branch_owner": true,
                    "write_function": false,
                    "write_owner": true,
                    "write_rule": false,
                  }
                }
              }
            }
          }
        }
      }
    };
    result = node.db.setOwner("/apps/test/test_owner", dbOwners);
    assert.deepEqual(result.code, 0);
  });

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  describe("Read operations", () => {
    describe("getValue", () => {
      it("when retrieving high value near top of database", () => {
        assert.deepEqual(node.db.getValue("/apps/test"), dbValues)
      })

      it("when retrieving high value near top of database with is_final", () => {
        const backupFinalVersion = node.db.stateManager.getFinalVersion();
        node.db.stateManager.finalizeVersion(StateVersions.EMPTY);
        assert.deepEqual(node.db.getValue("/apps/test", { isFinal: true }), null)
        node.db.stateManager.finalizeVersion(backupFinalVersion);
      })

      it('when retrieving value near top of database with is_shallow', () => {
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

      it('when retrieving value with include_tree_info', () => {
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

      it('when retrieving value with include_proof', () => {
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

      it('when retrieving value with include_version', () => {
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

      it("when retrieving shallow nested value", () => {
        assert.deepEqual(node.db.getValue("/apps/test/ai/comcom"), dbValues["ai"]["comcom"])
      })

      it("when retrieving deeply nested value", () => {
        assert.deepEqual(node.db.getValue("/apps/test/nested/far/down"), dbValues["nested"]["far"]["down"])
      })

      it("by failing when value is not present", () => {
        expect(node.db.getValue("/apps/test/nested/far/down/to/nowhere")).to.equal(null)
      })

      it("by failing when value is not present with is_shallow", () => {
        expect(node.db.getValue("/apps/test/nested/far/down/to/nowhere", true, false)).to.equal(null)
      })
    })

    describe("getFunction", () => {
      it("when retrieving non-existing function config", () => {
        expect(node.db.getFunction("/apps/test/test_function/other/function/path")).to.equal(null);
        expect(node.db.getFunction("/apps/test/test_function/some/other_path")).to.equal(null);
      })

      it("when retrieving existing function config", () => {
        assert.deepEqual(node.db.getFunction("/apps/test/test_function/some/path"), {
          ".function": {
            "fid": {
              "event_listener": "https://events.ainetwork.ai/trigger",
              "function_id": "fid",
              "function_type": "REST",
              "service_name": "https://ainetwork.ai"
            }
          },
          "deeper": {
            "path": {
              ".function": {
                "fid_deeper": {
                  "event_listener": "https://events.ainetwork.ai/trigger",
                  "function_id": "fid_deeper",
                  "function_type": "REST",
                  "service_name": "https://ainetwork.ai"
                }
              }
            }
          }
        });
      })

      it("when retrieving existing function config with is_shallow", () => {
        assert.deepEqual(node.db.getFunction('/apps/test/test_function', { isShallow: true }), {
          some: {
            "#state_ph": "0x14df539ce39f11f6f049adf3013eae1197a71a4ce0bdbfd66d3f8adb9d97f61c"
          },
        });
      })
    })

    describe("getRule", () => {
      it("when retrieving non-existing rule config", () => {
        expect(node.db.getRule("/test/test_rule/other/rule/path")).to.equal(null);
        expect(node.db.getRule("/test/test_rule/some/other_path")).to.equal(null);
      })

      it("when retrieving existing rule config", () => {
        assert.deepEqual(node.db.getRule("/apps/test/test_rule/some/path"), {
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

      it('when retrieving existing rule config with is_shallow', () => {
        assert.deepEqual(node.db.getRule('/apps/test/test_rule', { isShallow: true }), {
          some: {
            "#state_ph": "0x65d1d444e7f35a54ae9c196d83fda0ffbf93f91341a2470b83d0d512419aaf28"
          },
        });
      });
    })

    describe("getOwner", () => {
      it("when retrieving non-existing owner config", () => {
        expect(node.db.getOwner("/apps/test/test_owner/other/owner/path")).to.equal(null)
      })

      it("when retrieving existing owner config", () => {
        assert.deepEqual(node.db.getOwner("/apps/test/test_owner/some/path"), {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": false,
                "write_function": true,
                "write_owner": false,
                "write_rule": true,
              },
              "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                "branch_owner": true,
                "write_function": false,
                "write_owner": true,
                "write_rule": false,
              }
            }
          },
          "deeper": {
            "path": {
              ".owner": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_function": true,
                    "write_owner": false,
                    "write_rule": true,
                  },
                  "0x08Aed7AF9354435c38d52143EE50ac839D20696b": {
                    "branch_owner": true,
                    "write_function": false,
                    "write_owner": true,
                    "write_rule": false,
                  }
                }
              }
            }
          }
        });
      })

      it("when retrieving existing owner config with is_shallow", () => {
        assert.deepEqual(node.db.getOwner("/apps/test/test_owner", { isShallow: true }), {
          some: {
            "#state_ph": "0x5086ccf28e98a15e4d1de16b1f78e3b429e3049baeb39ea22041d75dd16f5800"
          },
        })
      })
    })

    describe("matchFunction", () => {
      it("when matching existing variable path function", () => {
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
                "event_listener": "https://events.ainetwork.ai/trigger",
                "service_name": "https://ainetwork.ai",
              },
            },
            "path": "/apps/test/test_function/some/$var_path"
          },
          "subtree_configs": []
        });
      })

      it("when matching existing non-variable path function", () => {
        assert.deepEqual(node.db.matchFunction("/apps/test/test_function/some/path"), {
          "matched_path": {
            "target_path": "/apps/test/test_function/some/path",
            "ref_path": "/apps/test/test_function/some/path",
            "path_vars": {},
          },
          "matched_config": {
            "config": {
              "fid": {
                "event_listener": "https://events.ainetwork.ai/trigger",
                "function_id": "fid",
                "function_type": "REST",
                "service_name": "https://ainetwork.ai"
              }
            },
            "path": "/apps/test/test_function/some/path"
          },
          "subtree_configs": [
            {
              "config": {
                "fid_deeper": {
                  "event_listener": "https://events.ainetwork.ai/trigger",
                  "function_id": "fid_deeper",
                  "function_type": "REST",
                  "service_name": "https://ainetwork.ai"
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
                "event_listener": "https://events.ainetwork.ai/trigger",
                "function_id": "fid_deeper",
                "function_type": "REST",
                "service_name": "https://ainetwork.ai"
              }
            },
            "path": "/apps/test/test_function/some/path/deeper/path"
          },
          "subtree_configs": []
        });
      })

      it("when NOT matching existing closest non-variable path function", () => {
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
                  "event_listener": "https://events.ainetwork.ai/trigger",
                  "function_id": "fid_deeper",
                  "function_type": "REST",
                  "service_name": "https://ainetwork.ai"
                }
              },
              "path": "/path"
            }
          ]
        });
      })
    })

    describe("matchRule", () => {
      it("when matching existing variable path rule", () => {
        assert.deepEqual(node.db.matchRule("/apps/test/test_rule/some/var_path"), {
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
        });
      })

      it("when matching existing non-variable path rule", () => {
        assert.deepEqual(node.db.matchRule("/apps/test/test_rule/some/path"), {
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
          "subtree_configs": [
            {
              "config": {
                "write": "auth.addr === 'ijkl'"
              },
              "path": "/deeper/path"
            }
          ]
        });
        assert.deepEqual(node.db.matchRule("/apps/test/test_rule/some/path/deeper/path"), {
          "matched_path": {
            "target_path": "/apps/test/test_rule/some/path/deeper/path",
            "ref_path": "/apps/test/test_rule/some/path/deeper/path",
            "path_vars": {},
          },
          "matched_config": {
            "config": {
              "write": "auth.addr === 'ijkl'"
            },
            "path": "/apps/test/test_rule/some/path/deeper/path"
          },
          "subtree_configs": []
        });
      })

      it("when matching existing closest non-variable path rule", () => {
        assert.deepEqual(node.db.matchRule("/apps/test/test_rule/some/path/deeper"), {
          "matched_path": {
            "target_path": "/apps/test/test_rule/some/path/deeper",
            "ref_path": "/apps/test/test_rule/some/path/deeper",
            "path_vars": {},
          },
          "matched_config": {
            "config": {
              "write": "auth.addr === 'abcd'"
            },
            "path": "/apps/test/test_rule/some/path"
          },
          "subtree_configs": [
            {
              "config": {
                "write": "auth.addr === 'ijkl'"
              },
              "path": "/path"
            }
          ]
        });
      })
    })

    describe("matchOwner", () => {
      it("when matching existing owner with matching address", () => {
        assert.deepEqual(node.db.matchOwner("/apps/test/test_owner/some/path", 'write_owner', 'abcd'), {
          "matched_path": {
            "target_path": "/apps/test/test_owner/some/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": false,
                  "write_rule": true
                },
                "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                  "branch_owner": true,
                  "write_function": false,
                  "write_owner": true,
                  "write_rule": false
                }
              }
            },
            "path": "/apps/test/test_owner/some/path"
          }
        });
        assert.deepEqual(node.db.matchOwner("/apps/test/test_owner/some/path/deeper/path", 'write_owner', 'ijkl'), {
          "matched_path": {
            "target_path": "/apps/test/test_owner/some/path/deeper/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": false,
                  "write_rule": true
                },
                "0x08Aed7AF9354435c38d52143EE50ac839D20696b": {
                  "branch_owner": true,
                  "write_function": false,
                  "write_owner": true,
                  "write_rule": false
                }
              }
            },
            "path": "/apps/test/test_owner/some/path/deeper/path"
          }
        });
      })

      it("when matching existing owner without matching address", () => {
        assert.deepEqual(node.db.matchOwner("/apps/test/test_owner/some/path", 'write_owner', 'other'), {
          "matched_path": {
            "target_path": "/apps/test/test_owner/some/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": false,
                  "write_rule": true
                },
                "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                  "branch_owner": true,
                  "write_function": false,
                  "write_owner": true,
                  "write_rule": false
                }
              }
            },
            "path": "/apps/test/test_owner/some/path"
          }
        });
        assert.deepEqual(node.db.matchOwner("/apps/test/test_owner/some/path/deeper/path", 'write_owner', 'other'), {
          "matched_path": {
            "target_path": "/apps/test/test_owner/some/path/deeper/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": false,
                  "write_rule": true
                },
                "0x08Aed7AF9354435c38d52143EE50ac839D20696b": {
                  "branch_owner": true,
                  "write_function": false,
                  "write_owner": true,
                  "write_rule": false
                }
              }
            },
            "path": "/apps/test/test_owner/some/path/deeper/path"
          }
        });
      })

      it("when matching closest owner", () => {
        assert.deepEqual(node.db.matchOwner("/apps/test/test_owner/some/path/deeper", 'write_owner', 'abcd'), {
          "matched_path": {
            "target_path": "/apps/test/test_owner/some/path/deeper"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": false,
                  "write_rule": true
                },
                "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                  "branch_owner": true,
                  "write_function": false,
                  "write_owner": true,
                  "write_rule": false
                }
              }
            },
            "path": "/apps/test/test_owner/some/path"
          }
        });
      })
    })

    describe("evalRule", () => {
      it("when evaluating existing variable path rule", () => {
        expect(node.db.evalRule(
            "/apps/test/test_rule/some/var_path", 'value', { addr: 'abcd' }, Date.now()))
                .to.equal(false);
        expect(node.db.evalRule(
            "/apps/test/test_rule/some/var_path", 'value', { addr: 'other' }, Date.now()))
                .to.equal(true);
      })

      it("when evaluating existing non-variable path rule", () => {
        expect(node.db.evalRule("/apps/test/test_rule/some/path", 'value', { addr: 'abcd' }, Date.now()))
            .to.equal(true);
        expect(node.db.evalRule("/apps/test/test_rule/some/path", 'value', { addr: 'other' }, Date.now()))
            .to.equal(false);
        expect(node.db.evalRule(
            "/apps/test/test_rule/some/path/deeper/path", 'value', { addr: 'ijkl' }, Date.now()))
                .to.equal(true);
        expect(node.db.evalRule(
            "/apps/test/test_rule/some/path/deeper/path", 'value', { addr: 'other' }, Date.now()))
                .to.equal(false);
      })

      it("when evaluating existing closest rule", () => {
        expect(node.db.evalRule(
            "/apps/test/test_rule/some/path/deeper", 'value', { addr: 'abcd' }, Date.now()))
                .to.equal(true);
        expect(node.db.evalRule(
            "/apps/test/test_rule/some/path/deeper", 'value', { addr: 'other' }, Date.now()))
                .to.equal(false);
      })
    })

    describe("evalOwner", () => {
      it("when evaluating existing owner with matching address", () => {
        expect(node.db.evalOwner(
            "/apps/test/test_owner/some/path", 'write_owner',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }))
                .to.equal(true);
        expect(node.db.evalOwner("/apps/test/test_owner/some/path", 'write_rule', { addr: '' }))
            .to.equal(false);
        expect(node.db.evalOwner(
            "/apps/test/test_owner/some/path/deeper/path", 'write_owner',
            { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
                .to.equal(true);
        expect(node.db.evalOwner(
            "/apps/test/test_owner/some/path/deeper/path", 'write_rule',
            { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
                .to.equal(false);
      })

      it("when evaluating existing owner without matching address", () => {
        expect(node.db.evalOwner("/apps/test/test_owner/some/path", 'write_owner', { addr: 'other' }))
            .to.equal(false);
        expect(node.db.evalOwner("/apps/test/test_owner/some/path", 'write_rule', { addr: 'other' }))
            .to.equal(true);
        expect(node.db.evalOwner(
            "/apps/test/test_owner/some/path/deeper/path", 'write_owner', { addr: 'other' }))
                .to.equal(false);
        expect(node.db.evalOwner(
            "/apps/test/test_owner/some/path/deeper/path", 'write_rule', { addr: 'other' }))
                .to.equal(true);
      })

      it("when evaluating closest owner", () => {
        expect(node.db.evalOwner(
            "/apps/test/test_owner/some/path/deeper", 'write_owner',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }))
                .to.equal(true);
        expect(node.db.evalOwner(
            "/apps/test/test_owner/some/path/deeper", 'write_rule',
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }))
                .to.equal(false);
        expect(node.db.evalOwner(
            "/apps/test/test_owner/some/path/deeper", 'write_owner', { addr: 'other' }))
                .to.equal(false);
        expect(node.db.evalOwner(
            "/apps/test/test_owner/some/path/deeper", 'write_rule', { addr: 'other' }))
                .to.equal(true);
      })
    })

    describe("get", () => {
      it("when retrieving non-existing value or function or rule or owner", () => {
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
            ref: "/apps/test/test_rule/some/path/deeper",
          },
          {
            type: "MATCH_OWNER",
            ref: "/apps/test/test_owner/some/path/deeper",
          },
          {
            type: "EVAL_RULE",
            ref: "/apps/rule/other/path",
            value: "value",
            address: "abcd",
            timestamp: Date.now(),
          },
          {
            type: "EVAL_OWNER",
            ref: "/apps/owner/other/path",
            permission: "write_rule",
            address: "abcd",
            timestamp: Date.now(),
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
                    "event_listener": "https://events.ainetwork.ai/trigger",
                    "function_id": "fid_deeper",
                    "function_type": "REST",
                    "service_name": "https://ainetwork.ai"
                  }
                },
                "path": "/path"
              }
            ]
          },
          {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/path/deeper",
              "ref_path": "/apps/test/test_rule/some/path/deeper",
              "path_vars": {},
            },
            "matched_config": {
              "config": {
                "write": "auth.addr === 'abcd'"
              },
              "path": "/apps/test/test_rule/some/path"
            },
            "subtree_configs": [
              {
                "config": {
                  "write": "auth.addr === 'ijkl'"
                },
                "path": "/path"
              }
            ]
          },
          {
            "matched_path": {
              "target_path": "/apps/test/test_owner/some/path/deeper"
            },
            "matched_config": {
              "config": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_function": true,
                    "write_owner": false,
                    "write_rule": true
                  },
                  "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                    "branch_owner": true,
                    "write_function": false,
                    "write_owner": true,
                    "write_rule": false
                  }
                }
              },
              "path": "/apps/test/test_owner/some/path"
            }
          },
          false,
          false
        ]);
      })

      it("when retrieving existing value or function or rule or owner", () => {
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
            "deeper": {
              "path": {
                ".rule": {
                  "write": "auth.addr === 'ijkl'"
                }
              }
            }
          },
          {
            ".function": {
              "fid": {
                "event_listener": "https://events.ainetwork.ai/trigger",
                "function_id": "fid",
                "function_type": "REST",
                "service_name": "https://ainetwork.ai"
              }
            },
            "deeper": {
              "path": {
                ".function": {
                  "fid_deeper": {
                    "event_listener": "https://events.ainetwork.ai/trigger",
                    "function_id": "fid_deeper",
                    "function_type": "REST",
                    "service_name": "https://ainetwork.ai"
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
                  "write_function": true,
                  "write_owner": false,
                  "write_rule": true,
                },
                "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                  "branch_owner": true,
                  "write_function": false,
                  "write_owner": true,
                  "write_rule": false,
                }
              }
            },
            "deeper": {
              "path": {
                ".owner": {
                  "owners": {
                    "*": {
                      "branch_owner": false,
                      "write_function": true,
                      "write_owner": false,
                      "write_rule": true,
                    },
                    "0x08Aed7AF9354435c38d52143EE50ac839D20696b": {
                      "branch_owner": true,
                      "write_function": false,
                      "write_owner": true,
                      "write_rule": false,
                    }
                  }
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
                  "event_listener": "https://events.ainetwork.ai/trigger",
                  "function_id": "fid",
                  "function_type": "REST",
                  "service_name": "https://ainetwork.ai"
                }
              },
              "path": "/apps/test/test_function/some/path"
            },
            "subtree_configs": [
              {
                "config": {
                  "fid_deeper": {
                    "event_listener": "https://events.ainetwork.ai/trigger",
                    "function_id": "fid_deeper",
                    "function_type": "REST",
                    "service_name": "https://ainetwork.ai"
                  }
                },
                "path": "/deeper/path"
              }
            ]
          },
          {
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
            "subtree_configs": [
              {
                "config": {
                  "write": "auth.addr === 'ijkl'"
                },
                "path": "/deeper/path"
              }
            ]
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
                    "write_function": true,
                    "write_owner": false,
                    "write_rule": true
                  },
                  "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1": {
                    "branch_owner": true,
                    "write_function": false,
                    "write_owner": true,
                    "write_rule": false
                  }
                }
              },
              "path": "/apps/test/test_owner/some/path"
            }
          },
          true,
          true,
        ]);
      })
    })
  })

  describe("Write operations", () => {
    describe("setValue", () => {
      it("when overwriting nested value", () => {
        const newValue = {"new": 12345}
        expect(node.db.setValue("/apps/test/nested/far/down", newValue).code).to.equal(0)
        assert.deepEqual(node.db.getValue("/apps/test/nested/far/down"), newValue)
      })

      it("when creating new path in database", () => {
        const newValue = 12345
        expect(node.db.setValue("/apps/test/new/unchartered/nested/path", newValue).code).to.equal(0)
        expect(node.db.getValue("/apps/test/new/unchartered/nested/path")).to.equal(newValue)
      })

      it("when writing invalid object", () => {
        assert.deepEqual(node.db.setValue("/apps/test/unchartered/nested/path2", {array: []}), {
          "code": 101,
          "error_message": "Invalid object for states: /array",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getValue("/apps/test/unchartered/nested/path2")).to.equal(null)

        assert.deepEqual(node.db.setValue("/apps/test/unchartered/nested/path2", {'.': 'x'}), {
          "code": 101,
          "error_message": "Invalid object for states: /.",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getValue("/apps/test/unchartered/nested/path2")).to.equal(null)

        assert.deepEqual(node.db.setValue("/apps/test/unchartered/nested/path2", {'$': 'x'}), {
          "code": 101,
          "error_message": "Invalid object for states: /$",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getValue("/apps/test/unchartered/nested/path2")).to.equal(null)

        assert.deepEqual(node.db.setValue("/apps/test/unchartered/nested/path2", {'*a': 'x'}), {
          "code": 101,
          "error_message": "Invalid object for states: /*a",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getValue("/apps/test/unchartered/nested/path2")).to.equal(null)

        assert.deepEqual(node.db.setValue("/apps/test/unchartered/nested/path2", {'a*': 'x'}), {
          "code": 101,
          "error_message": "Invalid object for states: /a*",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getValue("/apps/test/unchartered/nested/path2")).to.equal(null)
      })

      it("when writing with invalid path", () => {
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/.", 12345), {
          "code": 102,
          "error_message": "Invalid path: /apps/test/new/unchartered/nested/.",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/$", 12345), {
          "code": 102,
          "error_message": "Invalid path: /apps/test/new/unchartered/nested/$",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/a*", 12345), {
          "code": 102,
          "error_message": "Invalid path: /apps/test/new/unchartered/nested/a*",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/*a", 12345), {
          "code": 102,
          "error_message": "Invalid path: /apps/test/new/unchartered/nested/*a",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/#", 12345), {
          "code": 102,
          "error_message": "Invalid path: /apps/test/new/unchartered/nested/#",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/{", 12345), {
          "code": 102,
          "error_message": "Invalid path: /apps/test/new/unchartered/nested/{",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/}", 12345), {
          "code": 102,
          "error_message": "Invalid path: /apps/test/new/unchartered/nested/}",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/[", 12345), {
          "code": 102,
          "error_message": "Invalid path: /apps/test/new/unchartered/nested/[",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/]", 12345), {
          "code": 102,
          "error_message": "Invalid path: /apps/test/new/unchartered/nested/]",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/\x00", 12345), {
          "code": 102,
          "error_message": "Invalid path: /apps/test/new/unchartered/nested/\x00",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/\x1F", 12345), {
          "code": 102,
          "error_message": "Invalid path: /apps/test/new/unchartered/nested/\x1F",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/new/unchartered/nested/\x7F", 12345), {
          "code": 102,
          "error_message": "Invalid path: /apps/test/new/unchartered/nested/\x7F",
          "bandwidth_gas_amount": 1
        });
      })

      it("when writing with non-writable path with sharding", () => {
        assert.deepEqual(node.db.setValue("/apps/test/shards/enabled_shard", 20), {
          "code": 104,
          "error_message": "Non-writable path with shard config: /values/apps/test/shards/enabled_shard",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.setValue("/apps/test/shards/enabled_shard/path", 20), {
          "code": 104,
          "error_message": "Non-writable path with shard config: /values/apps/test/shards/enabled_shard",
          "bandwidth_gas_amount": 1
        });
      })

      it("when writing with writable path with sharding", () => {
        expect(node.db.setValue("/apps/test/shards/disabled_shard", 20).code).to.equal(0);
        expect(node.db.getValue("/apps/test/shards/disabled_shard")).to.equal(20)
        expect(node.db.setValue("/apps/test/shards/disabled_shard/path", 20).code).to.equal(0);
        expect(node.db.getValue("/apps/test/shards/disabled_shard/path")).to.equal(20)
      })
    })

    describe("incValue", () => {
      it("when increasing value successfully", () => {
        expect(node.db.incValue("/apps/test/increment/value", 10).code).to.equal(0)
        expect(node.db.getValue("/apps/test/increment/value")).to.equal(30)
      })

      it("returning error code and leaving value unchanged if delta is not numerical", () => {
        expect(node.db.incValue("/apps/test/increment/value", '10').code).to.equal(201)
        expect(node.db.getValue("/apps/test/increment/value")).to.equal(20)
      })

      it("returning error code and leaving value unchanged if path is not numerical", () => {
        expect(node.db.incValue("/apps/test/ai/foo", 10).code).to.equal(201)
        expect(node.db.getValue("/apps/test/ai/foo")).to.equal("bar")
      })

      it("creating and increasing given path from 0 if not currently in database", () => {
        node.db.incValue("/apps/test/completely/new/path/test", 100);
        expect(node.db.getValue("/apps/test/completely/new/path/test")).to.equal(100)
      })

      it("returning error code with non-writable path with sharding", () => {
        assert.deepEqual(node.db.incValue("/apps/test/shards/enabled_shard/path", 5), {
          "code": 104,
          "error_message": "Non-writable path with shard config: /values/apps/test/shards/enabled_shard",
          "bandwidth_gas_amount": 1
        });
      })

      it("when increasing with writable path with sharding", () => {
        expect(node.db.incValue("/apps/test/shards/disabled_shard/path", 5).code).to.equal(0);
        expect(node.db.getValue("/apps/test/shards/disabled_shard/path")).to.equal(15)
      })
    })

    describe("decValue", () => {
      it("when decreasing value successfully", () => {
        expect(node.db.decValue("/apps/test/decrement/value", 10).code).to.equal(0)
        expect(node.db.getValue("/apps/test/decrement/value")).to.equal(10)
      })

      it("returning error code and leaving value unchanged if delta is not numerical", () => {
        expect(node.db.decValue("/apps/test/decrement/value", '10').code).to.equal(301)
        expect(node.db.getValue("/apps/test/decrement/value")).to.equal(20)
      })

      it("returning error code and leaving value unchanged if path is not numerical", () => {
        expect(node.db.decValue("/apps/test/ai/foo", 10).code).to.equal(301)
        expect(node.db.getValue("/apps/test/ai/foo")).to.equal("bar")
      })

      it("creating and decreasing given path from 0 if not currently in database", () => {
        node.db.decValue("/apps/test/completely/new/path/test", 100);
        expect(node.db.getValue("/apps/test/completely/new/path/test")).to.equal(-100)
      })

      it("returning error code with non-writable path with sharding", () => {
        assert.deepEqual(node.db.decValue("/apps/test/shards/enabled_shard/path", 5), {
          "code": 104,
          "error_message": "Non-writable path with shard config: /values/apps/test/shards/enabled_shard",
          "bandwidth_gas_amount": 1
        });
      })

      it("when increasing with writable path with sharding", () => {
        expect(node.db.decValue("/apps/test/shards/disabled_shard/path", 5).code).to.equal(0);
        expect(node.db.getValue("/apps/test/shards/disabled_shard/path")).to.equal(5)
      })
    })

    describe("setFunction", () => {
      it("when overwriting existing function config with simple path", () => {
        const functionConfig = {
          ".function": {
            "fid": {
              "event_listener": "https://events.ainetwork.ai/trigger2",
              "function_id": "fid",
              "function_type": "REST",
              "service_name": "https://ainetwork.ai"
            }
          }
        };
        expect(node.db.setFunction("/apps/test/test_function/some/path", functionConfig).code)
            .to.equal(0);
        assert.deepEqual(node.db.getFunction("/apps/test/test_function/some/path"), {
          ".function": {
            "fid": {
              "event_listener": "https://events.ainetwork.ai/trigger2",  // modified
              "function_id": "fid",
              "function_type": "REST",
              "service_name": "https://ainetwork.ai"
            }
          },
          "deeper": {
            "path": {
              ".function": {
                "fid_deeper": {
                  "event_listener": "https://events.ainetwork.ai/trigger",
                  "function_id": "fid_deeper",
                  "function_type": "REST",
                  "service_name": "https://ainetwork.ai"
                }
              }
            }
          }
        })
      })

      it("when writing with variable path", () => {
        const functionConfig = {
          ".function": {
            "fid_other": {
              "event_listener": "https://events.ainetwork.ai/trigger2",
              "function_id": "fid_other",
              "function_type": "REST",
              "service_name": "https://ainetwork.ai"
            }
          }
        };
        expect(node.db.setFunction("/apps/test/test_function/some/$variable/path", functionConfig).code)
            .to.equal(0);
        assert.deepEqual(
            node.db.getFunction("/apps/test/test_function/some/$variable/path"), functionConfig)
      })

      it("when writing invalid object", () => {
        assert.deepEqual(node.db.setFunction("/apps/test/test_function/some/path2", {array: []}), {
          "code": 401,
          "error_message": "Invalid object for states: /array",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getFunction("/apps/test/new2/unchartered/nested/path2")).to.equal(null)

        assert.deepEqual(node.db.setFunction("/apps/test/test_function/some/path2", {'.': 'x'}), {
          "code": 401,
          "error_message": "Invalid object for states: /.",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getFunction("/apps/test/new2/unchartered/nested/path2")).to.equal(null)
      })

      it("when writing invalid function tree", () => {
        const functionTreeBefore = node.db.getOwner("/apps/test/test_function/some/path");
        assert.deepEqual(node.db.setFunction(
            "/apps/test/test_function/some/path", { ".function": null }), {
          "code": 405,
          "error_message": "Invalid function tree: /.function",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.getOwner("/apps/test/test_function/some/path"), functionTreeBefore);
      })

      it("when writing with invalid path", () => {
        assert.deepEqual(node.db.setFunction(
            "/apps/test/test_function/some/path/.", {
              ".function": {
                "fid": {
                  "event_listener": "https://events.ainetwork.ai/trigger2",
                  "function_id": "fid",
                  "function_type": "REST",
                  "service_name": "https://ainetwork.ai"
                }
              }
            }), {
          "code": 402,
          "error_message": "Invalid path: /apps/test/test_function/some/path/.",
          "bandwidth_gas_amount": 1
        });
      })
    })

    describe("setRule", () => {
      it("when overwriting existing rule config with simple path", () => {
        const ruleConfig = {
          ".rule": {
            "write": "other rule config"
          }
        };
        expect(node.db.setRule("/apps/test/test_rule/some/path", ruleConfig).code).to.equal(0);
        assert.deepEqual(node.db.getRule("/apps/test/test_rule/some/path"), ruleConfig)
      })

      it("when writing with variable path", () => {
        const ruleConfig = {
          ".rule": {
            "write": "other rule config"
          }
        };
        expect(node.db.setRule("/apps/test/test_rule/some/$variable/path", ruleConfig).code)
            .to.equal(0)
        assert.deepEqual(node.db.getRule("/apps/test/test_rule/some/$variable/path"), ruleConfig)
      })

      it("when writing invalid object", () => {
        assert.deepEqual(node.db.setRule("/apps/test/test_rule/some/path2", {array: []}), {
          "code": 501,
          "error_message": "Invalid object for states: /array",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getRule("/apps/test/test_rule/some/path2")).to.equal(null)

        assert.deepEqual(node.db.setRule("/apps/test/test_rule/some/path2", {'.': 'x'}), {
          "code": 501,
          "error_message": "Invalid object for states: /.",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getRule("/apps/test/test_rule/some/path2")).to.equal(null)
      })

      it("when writing invalid rule tree", () => {
        const ruleTreeBefore = node.db.getRule("/apps/test/test_rule/some/path");
        assert.deepEqual(node.db.setRule(
            "/apps/test/test_rule/some/path",
            {
              ".rule": {
                "write": null
              }
            }), {
          "code": 504,
          "error_message": "Invalid rule tree: /.rule/write",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.getRule("/apps/test/test_rule/some/path"), ruleTreeBefore);
      })

      it("when writing with invalid path", () => {
        assert.deepEqual(node.db.setRule("/apps/test/test_rule/some/path/.",
            {
              ".rule": {
                "write": "some rule config"
              }
            }), {
          "code": 502,
          "error_message": "Invalid path: /apps/test/test_rule/some/path/.",
          "bandwidth_gas_amount": 1
        });
      })
    })

    describe("setOwner", () => {
      it("when overwriting existing owner config", () => {
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
        assert.deepEqual(node.db.setOwner(
            "/apps/test/test_owner/some/path", ownerTree,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }), {
          "code": 0,
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.getOwner("/apps/test/test_owner/some/path"), ownerTree)
      })

      it("when writing invalid object", () => {
        assert.deepEqual(node.db.setOwner("/apps/test/test_owner/some/path2", {array: []}), {
          "code": 601,
          "error_message": "Invalid object for states: /array",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getOwner("/apps/test/test_owner/some/path2")).to.equal(null)

        assert.deepEqual(node.db.setOwner("/apps/test/test_owner/some/path2", {'.': 'x'}), {
          "code": 601,
          "error_message": "Invalid object for states: /.",
          "bandwidth_gas_amount": 1
        });
        expect(node.db.getOwner("/apps/test/test_owner/some/path2")).to.equal(null)
      })

      it("when writing invalid owner tree", () => {
        const ownerTreeBefore = node.db.getOwner("/apps/test/test_owner/some/path");
        assert.deepEqual(node.db.setOwner("/apps/test/test_owner/some/path", {
          ".owner": "invalid owners config"
        }, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }), {
          "code": 604,
          "error_message": "Invalid owner tree: /.owner",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.getOwner("/apps/test/test_owner/some/path"), ownerTreeBefore);

        assert.deepEqual(node.db.setOwner("/apps/test/test_owner/some/path", {
          ".owner": {
            "owners": "invalid owners config"
          }
        }, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }), {
          "code": 604,
          "error_message": "Invalid owner tree: /.owner/owners",
          "bandwidth_gas_amount": 1
        });
        assert.deepEqual(node.db.getOwner("/apps/test/test_owner/some/path"), ownerTreeBefore);
      })

      it("when writing with invalid path", () => {
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
          "code": 602,
          "error_message": "Invalid path: /apps/test/test_owner/some/path/.",
          "bandwidth_gas_amount": 1
        });
      })
    })

    describe("executeSingleSetOperation", () => {
      it("when successful", () => {
        assert.deepEqual(node.db.executeSingleSetOperation({
          // Default type: SET_VALUE
          ref: "/apps/test/nested/far/down",
          value: {
            "new": 12345
          }
        }, { addr: 'abcd' }, null, { extra: { executed_at: 1234567890000 }}), {
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
          "code": 201,
          "error_message": "Not a number type: bar or 10",
          "bandwidth_gas_amount": 1
        })
        expect(node.db.getValue("/apps/test/ai/foo")).to.equal("bar")
      })

      it("when successful with function triggering", () => {
        const valuePath = '/apps/test/test_function_triggering/allowed_path/value';
        const functionResultPath = '/apps/test/test_function_triggering/allowed_path/.last_tx/value';
        const value = 'some value';
        const timestamp = 1234567890000;

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
        ], { addr: 'abcd' }, null, { extra: { executed_at: 1234567890000 }});
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
        const timestamp = 1234567890000;

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
        ], { addr: 'abcd' }, null, { extra: { executed_at: 1234567890000 }});
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
                              "code": 103,
                              "error_message": "No write permission on: /apps/test/test_function_triggering/allowed_path/.last_tx/value",
                              "bandwidth_gas_amount": 1
                            }
                          }
                        },
                        "code": 1,
                        "bandwidth_gas_amount": 0,
                      }
                    },
                    "code": 105,
                    "error_message": "Triggered function call failed",
                    "bandwidth_gas_amount": 1
                  }
                }
              },
              "code": 1,
              "bandwidth_gas_amount": 0,
            }
          },
          "code": 105,
          "error_message": "Triggered function call failed",
          "bandwidth_gas_amount": 1,
        });
        assert.deepEqual(node.db.getValue(valuePath), value)
      })
    })

    describe("executeMultiSetOperation", () => {
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
                  "event_listener": "https://events.ainetwork.ai/trigger2",
                  "function_id": "fid",
                  "function_type": "REST",
                  "service_name": "https://ainetwork.ai"
                }
              }
            }
          },
          {
            type: "SET_RULE",
            ref: "/apps/test/test_rule/some/path",
            value: {
              ".rule": {
                "write": "other rule config"
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
        ], { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, null, { extra: { executed_at: 1234567890000 }}), {
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
              "event_listener": "https://events.ainetwork.ai/trigger2",  // modified
              "function_id": "fid",
              "function_type": "REST",
              "service_name": "https://ainetwork.ai"
            }
          },
          "deeper": {
            "path": {
              ".function": {
                "fid_deeper": {
                  "event_listener": "https://events.ainetwork.ai/trigger",
                  "function_id": "fid_deeper",
                  "function_type": "REST",
                  "service_name": "https://ainetwork.ai"
                }
              }
            }
          }
        });
        assert.deepEqual(node.db.getRule("/apps/test/test_rule/some/path"), {
          ".rule": {
            "write": "other rule config"
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
              "code": 201,
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
        const timestamp = 1234567890000;

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
        ], { addr: 'abcd' }, null, { extra: { executed_at: 1234567890000 }});
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
        const timestamp = 1234567890000;

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
        ], { addr: 'abcd' }, null, { extra: { executed_at: 1234567890000 }});
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
                                  "code": 103,
                                  "error_message": "No write permission on: /apps/test/test_function_triggering/allowed_path/.last_tx/value",
                                  "bandwidth_gas_amount": 1,
                                }
                              }
                            },
                            "code": 1,
                            "bandwidth_gas_amount": 0,
                          }
                        },
                        "code": 105,
                        "error_message": "Triggered function call failed",
                        "bandwidth_gas_amount": 1
                      }
                    }
                  },
                  "code": 1,
                  "bandwidth_gas_amount": 0,
                }
              },
              "code": 105,
              "error_message": "Triggered function call failed",
              "bandwidth_gas_amount": 1
            },
          },
        });
      })
    })
  })

  describe("Transaction execution", () => {
    let node;
    let txBody;
    let executableTx;
    let objectTx;

    beforeEach(() => {
      rimraf.sync(CHAINS_DIR);

      node = new BlockchainNode();
      setNodeForTesting(node);
      node.db.writeDatabase(
        [PredefinedDbPaths.VALUES_ROOT, PredefinedDbPaths.STAKING, 'test', PredefinedDbPaths.STAKING_BALANCE_TOTAL],
        1
      );

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
      rimraf.sync(CHAINS_DIR);
    });

    describe("executeTransaction", () => {
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
          code: 21,
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
          code: 23,
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
        const tempDb = node.createTempDb(node.db.stateVersion, 'CONSENSUS_UNIT_TEST', node.bc.lastBlockNumber());
        tempDb.writeDatabase(
          [PredefinedDbPaths.VALUES_ROOT, PredefinedDbPaths.ACCOUNTS, node.account.address, PredefinedDbPaths.BALANCE],
          1000000000);
        tempDb.writeDatabase(
            [PredefinedDbPaths.VALUES_ROOT, PredefinedDbPaths.TRANSFER, node.account.address, addr],
            valueObj);
        node.cloneAndFinalizeVersion(tempDb.stateVersion, -1);
        expect(node.db.getStateUsageAtPath('/')[StateInfoProperties.TREE_BYTES]).to.be.lessThan(SERVICE_STATE_BUDGET);

        const expectedGasAmountTotal = {
          bandwidth: {
            service: 1509000,
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
        assert.deepEqual(res.code, 25);
        assert.deepEqual(res.error_message, "Exceeded state budget limit for services (11293042 > 10000000)");
        assert.deepEqual(res.gas_amount_total, expectedGasAmountTotal);
        assert.deepEqual(res.gas_cost_total, 5.59512);
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
        assert.deepEqual(res.code, 26);
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
        assert.deepEqual(res.code, 31);
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
        assert.deepEqual(res.code, 29);
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
      const valueResult = node.db.setValue("/apps/test/empty_values/node_0", emptyValues);
      assert.deepEqual(valueResult.code, 0);

      emptyRules = {
        "node_1a": {
          "node_2a": {
            "node_3a": {
              ".rule": {
                "write": "some rule a"
              }
            }
          }
        },
        "node_1b": {
          "node_2b": {
            "node_3b": {
              ".rule": {
                "write": "some rule b"
              }
            }
          }
        }
      };
      const ruleResult = node.db.setRule("/apps/test/empty_rules/node_0", emptyRules);
      assert.deepEqual(ruleResult.code, 0);

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
      const ownerResult = node.db.setOwner("/apps/test/empty_owners/node_0", emptyOwners);
      assert.deepEqual(ownerResult.code, 0);
    });

    afterEach(() => {
      const valueResult = node.db.setValue("/apps/test/empty_values/node_0", null);
      assert.deepEqual(valueResult.code, 0);

      const ruleResult = node.db.setRule("/apps/test/empty_rules/node_0", null);
      assert.deepEqual(ruleResult.code, 0);

      const ownerResult = node.db.setRule("/apps/test/empty_owners/node_0", null);
      assert.deepEqual(ownerResult.code, 0);
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
          "write": "some other rule"
        }
      }).code).to.equal(0)
      assert.deepEqual(node.db.getRule("/apps/test/empty_rules/node_0"), {
        "node_1a": {
          "node_2a": {
            "node_3a": {
              ".rule": {
                "write": "some other rule"
              }
            }
          }
        },
        "node_1b": {
          "node_2b": {
            "node_3b": {
              ".rule": {
                "write": "some rule b"
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
                "write": "some rule b"
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
    let result;

    rimraf.sync(CHAINS_DIR);

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

    result = node1.db.setValue("/apps/test", dbValues);
    assert.deepEqual(result.code, 0);
    result = node2.db.setValue("/apps/test", dbValues);
    assert.deepEqual(result.code, 0);
  })

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  it("only allows certain users to write certain info if balance is greater than 0", () => {
    expect(node2.db.evalRule(`/apps/test/users/${node2.account.address}/balance`, 0, null, null))
        .to.equal(true)
    expect(node2.db.evalRule(`/apps/test/users/${node2.account.address}/balance`, -1, null, null))
        .to.equal(false)
    expect(node1.db.evalRule(`/apps/test/users/${node1.account.address}/balance`, 1, null, null))
        .to.equal(true)
  })

  it("only allows certain users to write certain info if data exists", () => {
    expect(node1.db.evalRule(`/apps/test/users/${node1.account.address}/info`, "something", null, null))
        .to.equal(true)
    expect(node2.db.evalRule(
        `/apps/test/users/${node2.account.address}/info`, "something else", null, null))
            .to.equal(false)
    expect(node2.db.evalRule(
        `/apps/test/users/${node2.account.address}/new_info`, "something",
        { addr: node2.account.address }, null))
            .to.equal(true)
  })

  it("apply the closest ancestor's rule config if not exists", () => {
    expect(node1.db.evalRule(
        `/apps/test/users/${node1.account.address}/child/grandson`, "something",
        { addr: node1.account.address },
        null))
            .to.equal(true)
    expect(node2.db.evalRule(
        `/apps/test/users/${node2.account.address}/child/grandson`, "something",
        { addr: node1.account.address },
        null))
            .to.equal(false)
  })

  it("only allows certain users to write certain info if data at other locations exists", () => {
    expect(node2.db.evalRule(
        `/apps/test/users/${node2.account.address}/balance_info`, "something", null, null))
            .to.equal(true)
    expect(node1.db.evalRule(
        `/apps/test/users/${node1.account.address}/balance_info`, "something", null, null))
            .to.equal(false)
  })

  it("validates old data and new data together", () => {
    expect(node1.db.evalRule(`/apps/test/users/${node1.account.address}/next_counter`, 11, null,  null))
        .to.equal(true)
    expect(node1.db.evalRule(`/apps/test/users/${node1.account.address}/next_counter`, 12, null, null))
        .to.equal(false)
  })

  it("can handle nested path variables", () => {
    expect(node2.db.evalRule(
        `/apps/test/second_users/${node2.account.address}/${node2.account.address}`, "some value", null,
        null))
            .to.equal(true)
    expect(node1.db.evalRule(
        `/apps/test/second_users/${node1.account.address}/next_counter`, "some other value", null, null))
            .to.equal(false)
  })

  it("duplicated path variables", () => {
    expect(node1.db.evalRule('/apps/test/no_dup_key/aaa/bbb', "some value", null, null))
        .to.equal(true)
    expect(node1.db.evalRule('/apps/test/dup_key/aaa/bbb', "some value", null, null))
        .to.equal(true)
  })
})

describe("DB owner config", () => {
  let node;

  beforeEach(() => {
    rimraf.sync(CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node);
    assert.deepEqual(node.db.setOwner("/apps/test/test_owner/mixed/true/true/true",
      {
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
      }
    ).code, 0);
    assert.deepEqual(node.db.setOwner("/apps/test/test_owner/mixed/false/true/true",
      {
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
      }
    ).code, 0);
    assert.deepEqual(node.db.setOwner("/apps/test/test_owner/mixed/true/false/true",
      {
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
      }
    ).code, 0);
    assert.deepEqual(node.db.setOwner("/apps/test/test_owner/mixed/true/true/false",
      {
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
      }
    ).code, 0);
  })

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  // Known user
  it("branch_owner permission for known user with mixed config", () => {
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true/branch', 'branch_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true/branch', 'branch_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(false)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true/branch', 'branch_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false/branch', 'branch_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
  })

  it("write_owner permission for known user with mixed config", () => {
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true', 'write_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true', 'write_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true', 'write_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(false)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false', 'write_owner',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
  })

  it("write_rule permission for known user with mixed config", () => {
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(false)
  })

  it("write_rule permission on deeper path for known user with mixed config", () => {
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true/deeper_path', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true/deeper_path', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true/deeper_path', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false/deeper_path', 'write_rule',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(false)
  })

  it("write_function permission for known user with mixed config", () => {
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(false)
  })

  it("write_function permission on deeper path for known user with mixed config", () => {
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true/deeper_path', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true/deeper_path', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true/deeper_path', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false/deeper_path', 'write_function',
        { addr: '0x08Aed7AF9354435c38d52143EE50ac839D20696b' }))
            .to.equal(false)
  })

  // Unknown user
  it("branch_owner permission for unknown user with mixed config", () => {
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true/branch', 'branch_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(false)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true/branch', 'branch_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true/branch', 'branch_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(false)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false/branch', 'branch_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(false)
  })

  it("write_owner permission for unknown user with mixed config", () => {
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/true/true/true', 'write_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(false)
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/false/true/true', 'write_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(false)
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/true/false/true', 'write_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(true)
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/true/true/false', 'write_owner',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(false)
  })

  it("write_rule permission for unknown user with mixed config", () => {
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/true/true/true', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(false)
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/false/true/true', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(false)
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/true/false/true', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(false)
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/true/true/false', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(true)
  })

  it("write_rule permission on deeper path for unknown user with mixed config", () => {
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/true/true/true/deeper_path', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(false)
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/false/true/true/deeper_path', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(false)
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/true/false/true/deeper_path', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(false)
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/true/true/false/deeper_path', 'write_rule',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(true)
  })

  it("write_function permission for unknown user with mixed config", () => {
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/true/true/true', 'write_function',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })).to.equal(false)
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/false/true/true', 'write_function',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })).to.equal(false)
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/true/false/true', 'write_function',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })).to.equal(false)
    expect(node.db.evalOwner('/apps/test/test_owner/mixed/true/true/false', 'write_function',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' })).to.equal(true)
  })

  it("write_function permission on deeper path for unknown user with mixed config", () => {
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/true/deeper_path', 'write_function',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(false)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/false/true/true/deeper_path', 'write_function',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(false)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/false/true/deeper_path', 'write_function',
         { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(false)
    expect(node.db.evalOwner(
        '/apps/test/test_owner/mixed/true/true/false/deeper_path', 'write_function',
        { addr: '0x07A43138CC760C85A5B1F115aa60eADEaa0bf417' }))
            .to.equal(true)
  })
})


describe("DB sharding config", () => {
  let node;

  beforeEach(() => {
    let result;

    rimraf.sync(CHAINS_DIR);

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
    result = node.db.setValue("/apps/test/test_sharding", dbValues);
    assert.deepEqual(result.code, 0);

    dbFuncs = {
      "some": {
        "path": {
          "to": {
            ".function": {
              "fid": {
                "function_type": "REST",
                "function_id": "fid",
                "event_listener": "https://events.ainetwork.ai/trigger",
                "service_name": "https://ainetwork.ai",
              }
            },
            "deeper": {
              ".function": {
                "fid_deeper": {
                  "function_type": "REST",
                  "function_id": "fid_deeper",
                  "event_listener": "https://events.ainetwork.ai/trigger",
                  "service_name": "https://ainetwork.ai",
                }
              }
            }
          }
        }
      }
    };
    result = node.db.setFunction("/apps/test/test_sharding", dbFuncs);
    assert.deepEqual(result.code, 0);

    dbRules = {
      "some": {
        "path": {
          ".rule": {
            "write": "false"
          },
          "to": {
            ".rule": {
              "write": "auth.addr === '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1'"
            },
            "deeper": {
              ".rule": {
                "write": "some deeper rule config"
              }
            }
          }
        }
      }
    };
    result = node.db.setRule("/apps/test/test_sharding", dbRules);
    assert.deepEqual(result.code, 0);

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
          }
        }
      }
    };
    result = node.db.setOwner("/apps/test/test_sharding", dbOwners);
    assert.deepEqual(result.code, 0);
  })

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
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

    it("setValue with isGlobal = false", () => {
      expect(node.db.setValue(
          "/apps/test/test_sharding/some/path/to/value", newValue, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
          null, { extra: { executed_at: 1234567890000 }}).code)
              .to.equal(0);
      expect(node.db.getValue("/apps/test/test_sharding/some/path/to/value")).to.equal(newValue);
    })

    it("setValue with isGlobal = true", () => {
      expect(node.db.setValue(
          "/apps/afan/apps/test/test_sharding/some/path/to/value", newValue, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
          null, { extra: { executed_at: 1234567890000 }}, 1234567890000, { isGlobal: true }).code)
              .to.equal(0);
      expect(node.db.getValue("/apps/test/test_sharding/some/path/to/value")).to.equal(newValue);
    })

    it("setValue with isGlobal = true and non-existing path", () => {
      expect(node.db.setValue(
          "/apps/some/non-existing/path", newValue, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
          null, { extra: { executed_at: 1234567890000 }}, 1234567890000, { isGlobal: true }).code)
              .to.equal(0);
    })

    it("setValue with isGlobal = false and non-writable path with sharding", () => {
      assert.deepEqual(node.db.setValue("/apps/test/test_sharding/shards/enabled_shard/path", 20), {
        "code": 104,
        "error_message": "Non-writable path with shard config: /values/apps/test/test_sharding/shards/enabled_shard",
        "bandwidth_gas_amount": 1
      });
    })

    it("setValue with isGlobal = true and non-writable path with sharding", () => {
      expect(node.db.setValue(
          "/apps/afan/apps/test/test_sharding/shards/enabled_shard/path", 20, '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1', null, null,
          1234567890000, { isGlobal: true }).code)
              .to.equal(0);
      expect(node.db.getValue("/apps/afan/apps/test/test_sharding/shards/enabled_shard/path", { isShallow: false, isGlobal: true }))
          .to.equal(10);  // value unchanged
    })

    it("setValue with isGlobal = false and writable path with sharding", () => {
      expect(node.db.setValue("/apps/test/test_sharding/shards/disabled_shard/path", 20).code)
          .to.equal(0);
      expect(node.db.getValue("/apps/test/test_sharding/shards/disabled_shard/path")).to.equal(20);
    })

    it("setValue with isGlobal = true and writable path with sharding", () => {
      expect(node.db.setValue(
          "apps/afan/apps/test/test_sharding/shards/disabled_shard/path", 20, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
          null, { extra: { executed_at: 1234567890000 }}, 1234567890000, { isGlobal: true }).code)
              .to.equal(0);
      expect(node.db.getValue("apps/afan/apps/test/test_sharding/shards/disabled_shard/path", { isShallow: false, isGlobal: true }))
          .to.equal(20);  // value changed
    })

    it("incValue with isGlobal = false", () => {
      expect(node.db.incValue(
          "/apps/test/test_sharding/some/path/to/number", incDelta, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
          null, { extra: { executed_at: 1234567890000 }}).code)
              .to.equal(0);
      expect(node.db.getValue("/apps/test/test_sharding/some/path/to/number")).to.equal(10 + incDelta);
    })

    it("incValue with isGlobal = true", () => {
      expect(node.db.incValue(
          "/apps/afan/apps/test/test_sharding/some/path/to/number", incDelta, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
          null, { extra: { executed_at: 1234567890000 }}, 1234567890000, { isGlobal: true }).code)
              .to.equal(0);
      expect(node.db.getValue("/apps/test/test_sharding/some/path/to/number")).to.equal(10 + incDelta);
    })

    it("incValue with isGlobal = true and non-existing path", () => {
      expect(node.db.incValue(
          "/apps/some/non-existing/path", incDelta, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, null, null, 1234567890000, { isGlobal: true }).code)
              .to.equal(0);
    })

    it("setValue with isGlobal = false and non-writable path with sharding", () => {
      assert.deepEqual(node.db.incValue("/apps/test/test_sharding/shards/enabled_shard/path", 5), {
        "code": 104,
        "error_message": "Non-writable path with shard config: /values/apps/test/test_sharding/shards/enabled_shard",
        "bandwidth_gas_amount": 1
      });
    })

    it("setValue with isGlobal = true and non-writable path with sharding", () => {
      expect(node.db.incValue(
          "/apps/afan/apps/test/test_sharding/shards/enabled_shard/path", 5, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
          null, null, 1234567890000, { isGlobal: true }).code)
              .to.equal(0);
      expect(node.db.getValue("apps/afan/apps/test/test_sharding/shards/enabled_shard/path", { isShallow: false, isGlobal: true }))
          .to.equal(10);  // value unchanged
    })

    it("setValue with isGlobal = false and writable path with sharding", () => {
      expect(node.db.incValue("/apps/test/test_sharding/shards/disabled_shard/path", 5).code).to.equal(0);
      expect(node.db.getValue("/apps/test/test_sharding/shards/disabled_shard/path"))
          .to.equal(15);  // value changed
    })

    it("setValue with isGlobal = true and writable path with sharding", () => {
      expect(node.db.incValue(
          "/apps/afan/apps/test/test_sharding/shards/disabled_shard/path", 5, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
          null, { extra: { executed_at: 1234567890000 }}, 1234567890000, { isGlobal: true }).code)
              .to.equal(0);
      expect(node.db.getValue("/apps/afan/apps/test/test_sharding/shards/disabled_shard/path", { isShallow: false, isGlobal: true }))
          .to.equal(15);  // value changed
    })

    it("decValue with isGlobal = false", () => {
      expect(node.db.decValue(
          "/apps/test/test_sharding/some/path/to/number", decDelta, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
          null, { extra: { executed_at: 1234567890000 }}).code)
              .to.equal(0);
      expect(node.db.getValue("/apps/test/test_sharding/some/path/to/number")).to.equal(10 - decDelta);
    })

    it("decValue with isGlobal = true", () => {
      expect(node.db.decValue(
          "/apps/afan/apps/test/test_sharding/some/path/to/number", decDelta, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
          null, { extra: { executed_at: 1234567890000 }}, 1234567890000, { isGlobal: true }).code)
              .to.equal(0);
      expect(node.db.getValue("/apps/test/test_sharding/some/path/to/number")).to.equal(10 - decDelta);
    })

    it("decValue with isGlobal = true and non-existing path", () => {
      expect(node.db.decValue(
          "/apps/some/non-existing/path", decDelta, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, null, null, 1234567890000, { isGlobal: true }).code)
              .to.equal(0);
    })

    it("setValue with isGlobal = false and non-writable path with sharding", () => {
      assert.deepEqual(node.db.decValue("/apps/test/test_sharding/shards/enabled_shard/path", 5), {
        "code": 104,
        "error_message": "Non-writable path with shard config: /values/apps/test/test_sharding/shards/enabled_shard",
        "bandwidth_gas_amount": 1
      });
    })

    it("setValue with isGlobal = true and non-writable path with sharding", () => {
      expect(node.db.decValue(
          "/apps/afan/apps/test/test_sharding/shards/enabled_shard/path", 5, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
          null, null, 1234567890000, { isGlobal: true }).code)
              .to.equal(0);
      expect(node.db.getValue(
          "/apps/afan/apps/test/test_sharding/shards/enabled_shard/path", { isShallow: false, isGlobal: true }))
              .to.equal(10);  // value unchanged
    })

    it("setValue with isGlobal = false and writable path with sharding", () => {
      expect(node.db.decValue("/apps/test/test_sharding/shards/disabled_shard/path", 5).code)
          .to.equal(0);
      expect(node.db.getValue("/apps/test/test_sharding/shards/disabled_shard/path"))
          .to.equal(5);  // value changed
    })

    it("setValue with isGlobal = true and writable path with sharding", () => {
      expect(node.db.decValue(
          "/apps/afan/apps/test/test_sharding/shards/disabled_shard/path", 5, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
          null, { extra: { executed_at: 1234567890000 }}, 1234567890000, { isGlobal: true }).code)
              .to.equal(0);
      expect(node.db.getValue("/apps/afan/apps/test/test_sharding/shards/disabled_shard/path", { isShallow: false, isGlobal: true }))
        .to.equal(5);  // value changed
    })

  })

  describe("Function operations", () => {
    const func = {
      ".function": {
        "fid": {
          "function_type": "REST",
          "function_id": "fid",
          "event_listener": "https://events.ainetwork.ai/trigger",
          "service_name": "https://ainetwork.ai",
        },
      },
      "deeper": {
        ".function": {
          "fid_deeper": {
            "function_type": "REST",
            "function_id": "fid_deeper",
            "event_listener": "https://events.ainetwork.ai/trigger",
            "service_name": "https://ainetwork.ai",
          },
        }
      }
    };
    const funcChange = {
      ".function": {
        "fid": {
          "function_type": "REST",
          "function_id": "fid",
          "event_listener": "https://events.ainetwork.ai/trigger2",  // Listener 2
          "service_name": "https://ainetwork.ai",
        },
      }
    };
    const newFunc = {
      ".function": {
        "fid": {
          "function_type": "REST",
          "function_id": "fid",
          "event_listener": "https://events.ainetwork.ai/trigger2",  // Listener 2
          "service_name": "https://ainetwork.ai",
        },
      },
      "deeper": {
        ".function": {
          "fid_deeper": {
            "function_type": "REST",
            "function_id": "fid_deeper",
            "event_listener": "https://events.ainetwork.ai/trigger",
            "service_name": "https://ainetwork.ai",
          },
        }
      }
    };

    it("getFunction with isGlobal = false", () => {
      assert.deepEqual(node.db.getFunction("/apps/test/test_sharding/some/path/to"), func);
      expect(node.db.getFunction("apps/afan/test/test_sharding/some/path/to")).to.equal(null);
    })

    it("getFunction with isGlobal = true", () => {
      expect(node.db.getFunction("/apps/test/test_sharding/some/path/to", { isShallow: false, isGlobal: true })).to.equal(null);
      assert.deepEqual(
          node.db.getFunction("/apps/afan/apps/test/test_sharding/some/path/to", { isShallow: false, isGlobal: true }), func);
    })

    it("getFunction with isGlobal = true and non-existing path", () => {
      expect(node.db.getFunction("/apps/some/non-existing/path", { isShallow: false, isGlobal: true })).to.equal(null);
    })

    it("setFunction with isGlobal = false", () => {
      expect(node.db.setFunction(
          "/apps/test/test_sharding/some/path/to", funcChange, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }).code)
              .to.equal(0);
      assert.deepEqual(node.db.getFunction("/apps/test/test_sharding/some/path/to"), newFunc);
    })

    it("setFunction with isGlobal = true", () => {
      expect(node.db.setFunction(
          "/apps/afan/apps/test/test_sharding/some/path/to", funcChange, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' },
          { isGlobal: true }).code)
              .to.equal(0);
      assert.deepEqual(
          node.db.getFunction("/apps/afan/apps/test/test_sharding/some/path/to", { isShallow: false, isGlobal: true }), newFunc);
    })

    it("setFunction with isGlobal = true and non-existing path", () => {
      expect(node.db.setFunction(
          "/apps/some/non-existing/path", funcChange, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, { isGlobal: true }).code)
              .to.equal(0);
    })

    it("matchFunction with isGlobal = false", () => {
      assert.deepEqual(node.db.matchFunction("/apps/test/test_sharding/some/path/to"), {
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
              "event_listener": "https://events.ainetwork.ai/trigger",
              "service_name": "https://ainetwork.ai",
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
                "event_listener": "https://events.ainetwork.ai/trigger",
                "service_name": "https://ainetwork.ai",
              },
            },
            "path": "/deeper",
          }
        ]
      });
    })

    it("matchFunction with isGlobal = true", () => {
      assert.deepEqual(node.db.matchFunction("/apps/afan/apps/test/test_sharding/some/path/to", { isGlobal: true }), {
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
              "event_listener": "https://events.ainetwork.ai/trigger",
              "service_name": "https://ainetwork.ai",
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
                "event_listener": "https://events.ainetwork.ai/trigger",
                "service_name": "https://ainetwork.ai",
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
  })

  describe("Rule operations", () => {
    const rule = {
      ".rule": {
        "write": "auth.addr === '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1'"
      },
      "deeper": {
        ".rule": {
          "write": "some deeper rule config"
        }
      }
    };
    const newRule = {
      ".rule": {
        "write": "another rule"
      }
    };
    const newValue = "that";

    it("getRule with isGlobal = false", () => {
      assert.deepEqual(node.db.getRule("/apps/test/test_sharding/some/path/to"), rule);
      expect(node.db.getRule("/apps/afan/apps/test/test_sharding/some/path/to")).to.equal(null);
    })

    it("getRule with isGlobal = true", () => {
      expect(node.db.getRule("/apps/test/test_sharding/some/path/to", { isShallow: false, isGlobal: true })).to.equal(null);
      assert.deepEqual(
          node.db.getRule("/apps/afan/apps/test/test_sharding/some/path/to", { isShallow: false, isGlobal: true }), rule);
    })

    it("getRule with isGlobal = true and non-existing path", () => {
      expect(node.db.getRule("/apps/some/non-existing/path", { isShallow: false, isGlobal: true })).to.equal(null);
    })

    it("setRule with isGlobal = false", () => {
      expect(node.db.setRule(
          "/apps/test/test_sharding/some/path/to", newRule, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }).code)
              .to.equal(0);
      assert.deepEqual(node.db.getRule("/apps/test/test_sharding/some/path/to"), newRule);
    })

    it("setRule with isGlobal = true", () => {
      expect(node.db.setRule(
          "/apps/afan/apps/test/test_sharding/some/path/to", newRule, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, { isGlobal: true }).code)
              .to.equal(0);
      assert.deepEqual(
          node.db.getRule("/apps/afan/apps/test/test_sharding/some/path/to", { isShallow: false, isGlobal: true }), newRule);
    })

    it("setRule with isGlobal = true and non-existing path", () => {
      expect(node.db.setRule("/apps/some/non-existing/path", newRule, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, { isGlobal: true }).code)
          .to.equal(0);
    })

    it("matchRule with isGlobal = false", () => {
      assert.deepEqual(node.db.matchRule("/apps/test/test_sharding/some/path/to"), {
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
        "subtree_configs": [
          {
            "config": {
              "write": "some deeper rule config"
            },
            "path": "/deeper",
          }
        ]
      });
    })

    it("matchRule with isGlobal = true", () => {
      assert.deepEqual(node.db.matchRule("/apps/afan/apps/test/test_sharding/some/path/to", { isGlobal: true }), {
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
        "subtree_configs": [
          {
            "config": {
              "write": "some deeper rule config"
            },
            "path": "/deeper",
          }
        ]
      });
    })

    it("matchRule with isGlobal = true and non-existing path", () => {
      expect(node.db.matchRule("/apps/some/non-existing/path", { isGlobal: true })).to.equal(null);
    })

    it("evalRule with isGlobal = false", () => {
      expect(node.db.evalRule("/apps/test/test_sharding/some/path/to", newValue, { addr: "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1" }))
          .to.equal(true);
    })

    it("evalRule with isGlobal = true", () => {
      expect(node.db.evalRule(
          "/apps/afan/apps/test/test_sharding/some/path/to", newValue, { addr: "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1" },
          null, { isGlobal: true }))
              .to.equal(true);
    })

    it("evalRule with isGlobal = true and non-existing path", () => {
      expect(node.db.evalRule(
          "/apps/some/non-existing/path", newValue, { addr: "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1" }, null, { isGlobal: true }))
              .to.equal(null);
    })
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
          { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, { isGlobal: true }).code)
              .to.equal(0);
      assert.deepEqual(
          node.db.getOwner("/apps/afan/apps/test/test_sharding/some/path/to", { isShallow: false, isGlobal: true }), newOwner);
    })

    it("setOwner with isGlobal = true and non-existing path", () => {
      expect(node.db.setOwner(
          "/apps/some/non-existing/path", ownerChange,
          { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, { isGlobal: true }).code).to.equal(0);
    })

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
        }
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
        }
      });
    })

    it("matchOwner with isGlobal = true and non-existing path", () => {
      expect(node.db.matchOwner("/apps/some/non-existing/path", { isGlobal: true })).to.equal(null);
    })

    it("evalOwner with isGlobal = false", () => {
      expect(node.db.evalOwner(
          "/apps/test/test_sharding/some/path/to", "write_rule",
          { addr: "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1" })).to.equal(true);
    })

    it("evalOwner with isGlobal = true", () => {
      expect(node.db.evalOwner(
          "/apps/afan/apps/test/test_sharding/some/path/to", "write_rule",
          { addr: "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1" }, { isGlobal: true })).to.equal(true);
    })

    it("evalOwner with isGlobal = true and non-existing path", () => {
      expect(node.db.evalOwner(
          "/apps/some/non-existing/path", "write_rule",
          { addr: "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1" }, { isGlobal: true })).to.equal(null);
    })
  })
})

describe("State info", () => {
  let node, valuesObject;

  beforeEach(() => {
    let result;

    rimraf.sync(CHAINS_DIR);

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
    result = node.db.setValue("/apps/test", valuesObject);
    assert.deepEqual(result.code, 0);
  });

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  describe("Check proof for setValue(), setOwner(), setRule(), and setFunction()", () => {
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
      const proof = node.db.getStateProof('/values/token/symbol');
      expect(proof).to.not.equal(null);
      expect(proof['#state_ph']).to.not.equal(null);
      const verifResult = verifyStateProof(proof);
      _.set(verifResult, 'rootProofHash', 'erased');
      assert.deepEqual(verifResult, {
        "isVerified": true,
        "mismatchedPath": null,
        "rootProofHash": "erased",
      });
    });
  });

  describe("getProofHash", () => {
    it("null case", () => {
      assert.deepEqual(null, node.db.getProofHash('/apps/test/test'));
    });

    it("non-null case", () => {
      expect(node.db.getProofHash('/values/token/symbol')).to.not.equal(null);
    });
  });
});

describe("State info - getStateInfo", () => {
  let node, valuesObject;

  beforeEach(() => {
    let result;

    rimraf.sync(CHAINS_DIR);

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
    result = node.db.setValue("/apps/test", valuesObject);
    assert.deepEqual(result.code, 0);
  });

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
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
    rimraf.sync(CHAINS_DIR);

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
    result = node.db.setValue("/apps/test", dbValues);
    assert.deepEqual(result.code, 0);
  });

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  describe("getRefForReading()", () => {
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

  describe("getRefForWriting()", () => {
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
      assert.deepEqual(otherRoot.getChild('values').getChild('apps').getChild('test').toJsObject(), dbValues);
    });
  });

  describe("backupDb() / restoreDb()", () => {
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
