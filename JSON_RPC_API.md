# AIN Blockchain JSON-RPC API

## Table of Contents

- [Database API](#database-api)
	- [ain_get](#ain_get)
- [Account API](#account-api)
	- [ain_getBalance](#ain_getbalance)
	- [ain_getConsensusStakeAmount](#ain_getconsensusstakeamount)
	- [ain_getNonce](#ain_getnonce)
	- [ain_isValidator](#ain_isvalidator)
- [Transaction API](#transaction-api)
	- [ain_getPendingTransactions](#ain_getpendingtransactions)
	- [ain_getTransactionByBlockNumberAndIndex](#ain_gettransactionbyblocknumberandindex)
	- [ain_getTransactionByBlockHashAndIndex](#ain_gettransactionbyblockhashandindex)
	- [ain_getTransactionByHash](#ain_gettransactionbyhash)
	- [ain_sendSignedTransaction](#ain_sendsignedtransaction)
	- [ain_sendSignedTransactionBatch](#ain_sendsignedtransactionbatch)
- [Block API](#block-api)
	- [ain_getRecentBlock](#ain_getrecentblock)
	- [ain_getRecentBlockNumber](#ain_getrecentblocknumber)
	- [ain_getBlockByNumber](#ain_getblockbynumber)
	- [ain_getBlockByHash](#ain_getblockbyhash)
	- [ain_getBlocks](#ain_getblocks)
	- [ain_getBlockHeaders](#ain_getblockheaders)
	- [ain_getBlockTransactionCountByNumber](#ain_getblocktransactioncountbynumber)
	- [ain_getBlockTransactionCountByHash](#ain_getblocktransactioncountbyhash)
	- [ain_getProposerByHash](#ain_getproposerbyhash)
	- [ain_getProposerByNumber](#ain_getproposerbynumber)
	- [ain_getValidatorsByHash](#ain_getvalidatorsbyhash)
	- [ain_getValidatorsByNumber](#ain_getvalidatorsbynumber)
- [Network API](#network-api)
	- [net_listening](#net_listening)
	- [net_nodeInfo](#net_nodeinfo)
	- [net_peerCount](#net_peercount)
	- [net_syncing](#net_syncing)
	- [net_id](#net_id)

---

## Database API

### ain_get

Returns the value, write rule, owner rule, or function at the given path in the global state tree. 

**Parameters**

An array of objects with a property:

- ref: `String` - reference path

**Returns**

The array of data/rule/owner data/function hash at each path. The order will be preserved, and if there isn't data present at the path, `null` will be at the path's index.

**Examples**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_get",
  "params": {
    "protoVer": "1.1.3",
    "type": "GET",
    "op_list": [
      {
        "type": "GET_VALUE",
        "ref": "/transfer/0xAAAAeEDFf1d2cD909465182165ccc267549554Fc/0x000AF024FEDb636294867bEff390bCE6ef9C5fc4"
      },
      {
        "type": "GET_RULE",
        "ref": "/accounts"
      },
      {
        "type": "GET_FUNCTION",
        "ref": "/transfer"
      },
      {
        "type": "GET_OWNER",
        "ref": "/apps/consensus"
      }
    ]
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": [
      {
        "0": {
          "value": 11000000
        }
      },
      {
        "$user_addr": {
          "balance": {
            ".rule": {
              "write": "auth.fid === '_transfer'"
            }
          }
        }
      },
      {
        "$from": {
          "$to": {
            "$key": {
              "value": {
                ".function": {
                  "_transfer": {
                    "function_type": "NATIVE",
                    "function_id": "_transfer"
                  }
                }
              }
            }
          }
        }
      },
      {
        ".owner": {
          "owners": {
            "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc": {
              "branch_owner": true,
              "write_function": true,
              "write_owner": true,
              "write_rule": true
            }
          }
        }
      }
    ],
    "protoVer": "1.1.3"
  }
}
```

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_get",
  "params": {
    "protoVer": "1.1.3",
    "type": "GET_VALUE",
    "ref": "/blockchain_params"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": {
      "token": {
        "name": "AI Network",
        "symbol": "AIN",
        "total_supply": 700000000,
        "bridge": {
          "ETH": {
            "3": {
              "0xB16c0C80a81f73204d454426fC413CAe455525A7": {
                "token_pool": "0x00AA7d797FB091AF6dD57ec71Abac8D2066BE298",
                "min_checkout_per_request": 10000,
                "max_checkout_per_request": 100000,
                "max_checkout_per_day": 1000000,
                "checkout_fee_rate": 0.001,
                "token_exchange_rate": 1,
                "token_exchange_scheme": "FIXED"
              }
            }
          }
        }
      },
      "consensus": {
        "min_stake_for_proposer": 10000000,
        "max_stake_for_proposer": 10000000,
        "min_num_validators": 5,
        "max_num_validators": 20,
        "genesis_proposer_whitelist": {
          "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4": true,
          "0x001Ac309EFFFF6d307CbC2d09C811aCD7dD8A35d": true,
          "0x002A273ECd3aAEc4d8748f4E06eAdE3b34d83211": true,
          "0x003AD6FdB06684175e7D95EcC36758B014517E4b": true,
          "0x004A2550661c8a306207C9dabb279d5701fFD66e": true
        },
        "genesis_validator_whitelist": {
          "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4": true,
          "0x001Ac309EFFFF6d307CbC2d09C811aCD7dD8A35d": true,
          "0x002A273ECd3aAEc4d8748f4E06eAdE3b34d83211": true,
          "0x003AD6FdB06684175e7D95EcC36758B014517E4b": true,
          "0x004A2550661c8a306207C9dabb279d5701fFD66e": true,
          "0x005A3c55EcE1A593b761D408B6E6BC778E0a638B": true,
          "0x006Af719E197bC81BBb75d2fec7Ea217D1750bAe": true,
          "0x007Ac58EAc5F0D0bDd10Af8b90799BcF849c2E74": true,
          "0x008AeBc041B7ceABc53A4cf393ccF16c10c29dba": true,
          "0x009A97c0cF07fdbbcdA1197aE11792258b6EcedD": true
        },
        "genesis_validators": {
          "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4": {
            "stake": 10000000,
            "proposal_right": true
          },
          "0x001Ac309EFFFF6d307CbC2d09C811aCD7dD8A35d": {
            "stake": 10000000,
            "proposal_right": true
          },
          "0x002A273ECd3aAEc4d8748f4E06eAdE3b34d83211": {
            "stake": 10000000,
            "proposal_right": true
          },
          "0x003AD6FdB06684175e7D95EcC36758B014517E4b": {
            "stake": 10000000,
            "proposal_right": true
          },
          "0x004A2550661c8a306207C9dabb279d5701fFD66e": {
            "stake": 10000000,
            "proposal_right": true
          }
        },
        "health_threshold_epoch": 10,
        "stake_lockup_extension": 2592000000,
        "max_invalid_blocks_on_mem": 100
      },
      "genesis": {
        "genesis_addr": "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc",
        "genesis_timestamp": 1640995199999,
        "num_genesis_accounts": 10,
        "epoch_ms": 20000,
        "chain_id": 0,
        "network_id": 0
      },
      "resource": {
        "state_tree_height_limit": 30,
        "state_tree_bytes_limit": 5000000000,
        "state_label_length_limit": 150,
        "bandwidth_budget_per_block": 1000000,
        "service_state_budget_ratio": 0.5,
        "apps_state_budget_ratio": 0.495,
        "free_state_budget_ratio": 0.005,
        "max_state_tree_size_per_byte": 0.00625,
        "state_gas_coefficient": 1,
        "unit_write_gas_amount": 1,
        "account_registration_gas_amount": 2000,
        "rest_function_call_gas_amount": 100,
        "gas_price_unit": 0.000001,
        "service_bandwidth_budget_ratio": 0.05,
        "apps_bandwidth_budget_ratio": 0.9495,
        "free_bandwidth_budget_ratio": 0.0005,
        "min_staking_for_app_tx": 0,
        "min_balance_for_service_tx": 0,
        "max_function_urls_per_developer": 3,
        "default_developers_url_whitelist": {
          "0": "https://*.ainetwork.ai",
          "1": "https://*.ainize.ai",
          "2": "https://*.afan.ai",
          "3": "http://localhost:3000"
        },
        "tx_bytes_limit": 10000,
        "batch_tx_list_size_limit": 50,
        "set_op_list_size_limit": 50,
        "min_gc_num_siblings_deleted": 10,
        "snapshot_chunk_size": 1000000,
        "min_gas_price": 500,
        "app_creation_gas_amount": 2000
      },
      "reward": {
        "type": "FIXED",
        "annual_rate": 0.08
      },
      "sharding": {
        "shard_owner": "",
        "shard_reporter": "",
        "sharding_protocol": "NONE",
        "sharding_path": "/",
        "parent_chain_poc": "",
        "reporting_period": 0,
        "max_shard_report": 100,
        "num_shard_report_deleted": 100
      }
    },
    "protoVer": "1.1.3"
  }
}
```

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_get",
  "params": {
    "protoVer": "1.1.3",
    "type": "GET_RULE",
    "ref": "/transfer/$from/$to/$key/value"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": {
      ".rule": {
        "write": "(auth.addr === $from || auth.fid === '_stake' || auth.fid === '_unstake' || auth.fid === '_pay' || auth.fid === '_claim' || auth.fid === '_hold' || auth.fid === '_release' || auth.fid === '_collectFee' || auth.fid === '_claimReward' || auth.fid === '_openCheckout' || auth.fid === '_closeCheckout' || auth.fid === '_closeCheckin') && !getValue('transfer/' + $from + '/' + $to + '/' + $key) && (util.isServAcntName($from, blockNumber) || util.isCksumAddr($from)) && (util.isServAcntName($to, blockNumber) || util.isCksumAddr($to)) && $from !== $to && util.isNumber(newData) && newData > 0 && util.countDecimals(newData) <= 6 && util.getBalance($from, getValue) >= newData"
      }
    },
    "protoVer": "1.1.3"
  }
}
```

### ain_matchFunction

Returns the functions matched at the given value path in the global state tree. 

**Parameters**

An object with a property:

-   ref:  `String` - reference value path

**Returns**

The matched functions.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_matchFunction",
  "params": {
    "protoVer": "1.1.3",
    "ref": "/transfer/0xAAAAeEDFf1d2cD909465182165ccc267549554Fc/0x000AF024FEDb636294867bEff390bCE6ef9C5fc4/1/value"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": {
      "matched_path": {
        "target_path": "/transfer/$from/$to/$key/value",
        "ref_path": "/transfer/0xAAAAeEDFf1d2cD909465182165ccc267549554Fc/0x000AF024FEDb636294867bEff390bCE6ef9C5fc4/1/value",
        "path_vars": {
          "$key": "1",
          "$to": "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4",
          "$from": "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc"
        }
      },
      "matched_config": {
        "path": "/transfer/$from/$to/$key/value",
        "config": {
          "_transfer": {
            "function_type": "NATIVE",
            "function_id": "_transfer"
          }
        }
      },
      "subtree_configs": []
    },
    "protoVer": "1.1.3"
  }
}
```

### ain_matchRule

Returns the rules matched at the given value path in the global state tree. 

**Parameters**

An object with a property:

- ref: `String` - reference value path

**Returns**

The matched rules.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_matchRule",
  "params": {
    "protoVer": "1.1.3",
    "ref": "/transfer/0xAAAAeEDFf1d2cD909465182165ccc267549554Fc/0x000AF024FEDb636294867bEff390bCE6ef9C5fc4/1/value"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": {
      "write": {
        "matched_path": {
          "target_path": "/transfer/$from/$to/$key/value",
          "ref_path": "/transfer/0xAAAAeEDFf1d2cD909465182165ccc267549554Fc/0x000AF024FEDb636294867bEff390bCE6ef9C5fc4/1/value",
          "path_vars": {
            "$key": "1",
            "$to": "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4",
            "$from": "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc"
          }
        },
        "matched_config": {
          "path": "/transfer/$from/$to/$key/value",
          "config": {
            "write": "(auth.addr === $from || auth.fid === '_stake' || auth.fid === '_unstake' || auth.fid === '_pay' || auth.fid === '_claim' || auth.fid === '_hold' || auth.fid === '_release' || auth.fid === '_collectFee' || auth.fid === '_claimReward' || auth.fid === '_openCheckout' || auth.fid === '_closeCheckout' || auth.fid === '_closeCheckin') && !getValue('transfer/' + $from + '/' + $to + '/' + $key) && (util.isServAcntName($from, blockNumber) || util.isCksumAddr($from)) && (util.isServAcntName($to, blockNumber) || util.isCksumAddr($to)) && $from !== $to && util.isNumber(newData) && newData > 0 && util.countDecimals(newData) <= 6 && util.getBalance($from, getValue) >= newData"
          }
        },
        "subtree_configs": []
      },
      "state": {
        "matched_path": {
          "target_path": "/transfer/$from/$to/$key/value",
          "ref_path": "/transfer/0xAAAAeEDFf1d2cD909465182165ccc267549554Fc/0x000AF024FEDb636294867bEff390bCE6ef9C5fc4/1/value",
          "path_vars": {
            "$key": "1",
            "$to": "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4",
            "$from": "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc"
          }
        },
        "matched_config": {
          "path": "/transfer/$from/$to/$key",
          "config": {
            "state": {
              "gc_max_siblings": 10,
              "gc_num_siblings_deleted": 10
            }
          }
        }
      }
    },
    "protoVer": "1.1.3"
  }
}
```

### ain_matchOwner

Returns the owners matched at the given value path in the global state tree. 

**Parameters**

An object with a property:

- ref: `String` - reference value path

**Returns**

The matched owners.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_matchOwner",
  "params": {
    "protoVer": "1.1.3",
    "ref": "/apps/consensus"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": {
      "matched_path": {
        "target_path": "/apps/consensus"
      },
      "matched_config": {
        "path": "/apps/consensus",
        "config": {
          "owners": {
            "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc": {
              "branch_owner": true,
              "write_function": true,
              "write_owner": true,
              "write_rule": true
            }
          }
        }
      },
      "subtree_configs": []
    },
    "protoVer": "1.1.3"
  }
}
```

### ain_evalRule

Evaluates the rule configs matched with the given value path in the global state tree with the given parameters. 

**Parameters**

An object with a property:

- ref: `String` - reference value path
- value: `String|Number|Boolean|Object` - value to write
- address: `String` - account address (optional)
- fid: `String` - function id (optional)
- timestamp: `Number` - timestamp in milliseconds (optional)

**Returns**

The rule evaluation result.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_evalRule",
  "params": {
    "protoVer": "1.1.3",
    "ref": "/transfer/0xAAAAeEDFf1d2cD909465182165ccc267549554Fc/0x000AF024FEDb636294867bEff390bCE6ef9C5fc4/100000/value",
    "address": "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc",
    "value": 100,
    "timestamp": 1706691334000
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": {
      "code": 0,
      "matched": {
        "write": {
          "matchedValuePath": [
            "transfer",
            "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc",
            "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4",
            "100000",
            "value"
          ],
          "matchedRulePath": [
            "transfer",
            "$from",
            "$to",
            "$key",
            "value"
          ],
          "pathVars": {
            "$key": "100000",
            "$to": "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4",
            "$from": "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc"
          },
          "closestRule": {
            "path": [
              "transfer",
              "$from",
              "$to",
              "$key",
              "value"
            ],
            "config": {
              "write": "(auth.addr === $from || auth.fid === '_stake' || auth.fid === '_unstake' || auth.fid === '_pay' || auth.fid === '_claim' || auth.fid === '_hold' || auth.fid === '_release' || auth.fid === '_collectFee' || auth.fid === '_claimReward' || auth.fid === '_openCheckout' || auth.fid === '_closeCheckout' || auth.fid === '_closeCheckin') && !getValue('transfer/' + $from + '/' + $to + '/' + $key) && (util.isServAcntName($from, blockNumber) || util.isCksumAddr($from)) && (util.isServAcntName($to, blockNumber) || util.isCksumAddr($to)) && $from !== $to && util.isNumber(newData) && newData > 0 && util.countDecimals(newData) <= 6 && util.getBalance($from, getValue) >= newData"
            }
          },
          "subtreeRules": []
        },
        "state": {
          "matchedValuePath": [
            "transfer",
            "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc",
            "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4",
            "100000",
            "value"
          ],
          "matchedRulePath": [
            "transfer",
            "$from",
            "$to",
            "$key",
            "value"
          ],
          "pathVars": {
            "$key": "100000",
            "$to": "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4",
            "$from": "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc"
          },
          "closestRule": {
            "path": [
              "transfer",
              "$from",
              "$to",
              "$key"
            ],
            "config": {
              "state": {
                "gc_max_siblings": 10,
                "gc_num_siblings_deleted": 10
              }
            }
          }
        }
      }
    },
    "protoVer": "1.1.3"
  }
}
```

### ain_evalOwner

Evaluates the owner configs matched with the given value path in the global state tree with the given parameters. 

**Parameters**

An object with a property:

- ref: `String` - reference value path
- permission: `'write_rule'|'write_function'|'write_owner'|'branch_owner'` - permission to evaluate with
- address: `String` - account address (optional)
- fid: `String` - function id (optional)

**Returns**

The owner evaluation result.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_evalOwner",
  "params": {
    "protoVer": "1.1.3",
    "ref": "/apps/consensus",
    "address": "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc",
    "permission": "write_rule"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": {
      "code": 0,
      "matched": {
        "matchedOwnerPath": [
          "apps",
          "consensus"
        ],
        "closestOwner": {
          "path": [
            "apps",
            "consensus"
          ],
          "config": {
            "owners": {
              "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true
              }
            }
          }
        },
        "subtreeOwners": []
      }
    },
    "protoVer": "1.1.3"
  }
}
```

### ain_getStateProof

Returns the state proof of the given path in the global state tree. 

**Parameters**

An object with a property:

- ref: `String` - reference path prefixed with data type. e.g., /values/accounts/0x..., /rules/transfer/\$from/\$to/value, /functions/transfer/\$from/\$to/\$key/value, /owners/apps/consensus.

**Returns**

The state proof.

**Examples**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getStateProof",
  "params": {
    "protoVer": "1.1.3",
    "ref": "/values/accounts/0xAAAAeEDFf1d2cD909465182165ccc267549554Fc/balance"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": {
      "#state_ph": "0x10f836de97cced7bcea17d012e3a4a328b7d5f9ce016c69e01eead63bb14e7f2",
      "#radix:6": {
        "#radix_ph": "0xb1ee79c294caa1b2cfc76f2cb5e0204927e7f7583810b0c175915914dba859d8"
      },
      "#radix:7": {
        "#radix_ph": "0xb338802f148a20b6dda118cc2929794542eff272ee2c781c9aa8ce6138c3c381",
        "#radix:2756c6573": {
          "#radix_ph": "0x92bf1f2761726c8ff84afed4384e717c83cd5250c5e2d7acce6bad31b0829eb3"
        },
        "#radix:6616c756573": {
          "#radix_ph": "0x4029c9643c09aace2e958f578f930ea6563713dc4fc7d037b435acd73c0bee0d",
          "#state:values": {
            "#state_ph": "0x1ab3c3ec336fa9790b4706a1c3edca44613a3bab2d3bb86507a05625ce93e4c8",
            "#radix:6": {
              "#radix_ph": "0x5ead39186a85688c5c267bf57c21e8e813c2be8f27cfd8214ed0df605d60e836",
              "#radix:1": {
                "#radix_ph": "0x327ac0aaa1913dd4eac6717a5be650808d02c0df3515d48876e01092b017b09d",
                "#radix:63636f756e7473": {
                  "#radix_ph": "0x2d8fd7d2c1650bbcd9cf8847405d3adcd66a31726fbf3d8c658230e1dcc65596",
                  "#state:accounts": {
                    "#state_ph": "0x389ef90cca395cfff34daaf1af6e8987494b75ad8a0fca9e0ec19c5ff9a0febf",
                    "#radix:0": {
                      "#radix_ph": "0x14a34c98383845ddc3736e9de2bd1966599f6c2e1ab284d6385abeff401bd6d4"
                    },
                    "#radix:1": {
                      "#radix_ph": "0x00f5dc96dee4a091cbbec25cae427ead56ddd2592db2633b88680733dca4caa6"
                    },
                    "#radix:2": {
                      "#radix_ph": "0x2e89ea1805894ed85b3ee1d333e356407921593b0178065a0f6d4b891859dde4"
                    },
                    "#radix:3": {
                      "#radix_ph": "0xdafca44f4568ad6b86e8f6d16a4b976dc07044ac21c5f5864554c43976c0e161"
                    },
                    "#radix:4": {
                      "#radix_ph": "0x7c5f33dc684e432673b1deb3e052d5af8527c6ec8b9c11354db1246287195760"
                    },
                    "#radix:5": {
                      "#radix_ph": "0xb6b0149833a58d1ce778ba567e8c0a4f85290184e83317f7f055f7b0bafb9c68"
                    },
                    "#radix:6": {
                      "#radix_ph": "0x3c33cc686e7fd521e81fae32c701e13bdbe6539a2ccc79f70129bb721f1cf82e"
                    },
                    "#radix:7": {
                      "#radix_ph": "0x56b5e5306dbe9a372eb1d217081ef8d4b3dc101027f6019409170edfd3a4e689"
                    },
                    "#radix:8": {
                      "#radix_ph": "0x61e6f316aba28f5fabf444ee65675bd7bca88ee6ea55396f39896fae52edb1ad"
                    },
                    "#radix:9": {
                      "#radix_ph": "0x3656ae6b72eddf9e32c8a72727770b9e5632c28ac89cfe1f1b8df4e08b1077f0"
                    },
                    "#radix:a": {
                      "#radix_ph": "0x5aa705a9892359dd62a564df75bfdd869a15b39d33cc36a801261b7b2369f856",
                      "#radix:0": {
                        "#radix_ph": "0x9cd19010900d9cebfa2c0944f3277386b5ee80206a1ae753af8f59610918086d"
                      },
                      "#radix:1": {
                        "#radix_ph": "0x9f486ee766bb3e01c551c64d5ffc7448cec7a01c8a272cbf53f1bf0051494034"
                      },
                      "#radix:2": {
                        "#radix_ph": "0x1177aa473e0414cf70c1aa74887cfafa1b689366116e5d0019a8861601d8d0c3"
                      },
                      "#radix:3": {
                        "#radix_ph": "0x83258f3df41b6c09c741b79a2d367e695702985b55e7dd0a1376d61e9ac98f3e"
                      },
                      "#radix:4": {
                        "#radix_ph": "0x7acd3dcd62dc7bd9c60752c06a7061fab0a6e18f54e45bf7871c9104bc4eaee6"
                      },
                      "#radix:5a181bf80366ae376a10fbe1dc8bf534b8cbdfb": {
                        "#radix_ph": "0xd70a5e2fb33e720b1c25e42bf64d9184d111f6a2a5372bed556d152627191a51"
                      },
                      "#radix:6": {
                        "#radix_ph": "0x7fd474d8d0552cf6c23e6b6c6b3cc4c53baabf939e3d2977e6c36570acc5cd74"
                      },
                      "#radix:7": {
                        "#radix_ph": "0xbff4f0c2bf36bec6ed93ff94c2cc8889931cf2ba317aeabb74a42b0b69a31d57"
                      },
                      "#radix:8": {
                        "#radix_ph": "0x851ab0e647e09c19440713056d3d7a8fe05e61806de9eb6f306ba2fc2dc74a24"
                      },
                      "#radix:990a29ecfb3815c893177b22051f6fe5c71ec8f": {
                        "#radix_ph": "0xfe2b320ca54a98774eac7536d2fbd62c511f70ac73af2b523b4f1a4e24e39613"
                      },
                      "#radix:a": {
                        "#radix_ph": "0x2b487ba0eb74c253544ebf06395109f854febe61ea8620b751f43851ff727d2a",
                        "#radix:3a053e56c9fc77f69298673e69ea6d5e031442": {
                          "#radix_ph": "0xde15c7a2e88bed3255856d9c544c749c34743f7d7273306ad13b65ccbb4f9574"
                        },
                        "#radix:4cf08b1d0b08bb1831f14510f984e5ea5aa74f": {
                          "#radix_ph": "0x673899ca7db6352a28d96579afd4a21ed4ecf9eac112985c48ec6e0d2294e76d"
                        },
                        "#radix:7ec983d5415ebedba041ca4b5e08cf7a6d0a1d": {
                          "#radix_ph": "0xa232d40a6240b60203f631535fa3fd7174ae719779a4e0d846ddaab08e45f857"
                        },
                        "#radix:9bcfed3426a5bb709d1606fb1271dadc9d8d60": {
                          "#radix_ph": "0x673899ca7db6352a28d96579afd4a21ed4ecf9eac112985c48ec6e0d2294e76d"
                        },
                        "#radix:aaeedff1d2cd909465182165ccc267549554fc": {
                          "#radix_ph": "0x84498a5b76b0e6f2ec826171e2c829856e1392c6de7a642efae1d4a990ecb0ad",
                          "#state:0xAAAAeEDFf1d2cD909465182165ccc267549554Fc": {
                            "#state_ph": "0x118f633ae944e43b9434d314875c57466b519e07ddd6b845a250d005a24fe6db",
                            "#radix:6": {
                              "#radix_ph": "0xea3ec1aaf3333a130649c66855cca3f70ca43099b1359bf84380e3eaee2efb83",
                              "#radix:2616c616e6365": {
                                "#radix_ph": "0xf7f54de888b15f1de6b2df4751aa0200b5a9d9a298bade55e6b5b9bb855541b7",
                                "#state:balance": {
                                  "#state_ph": "0x48d7d6569b6ce84dbba4d36dc6fbd8457d700cfcb7a30705dc692ba07d545662"
                                }
                              },
                              "#radix:e6f6e6365": {
                                "#radix_ph": "0x3a592cd35b802b59d3eecf39aad5ca136b013251d36a2a4af7ff054aca5f011b"
                              }
                            }
                          }
                        }
                      },
                      "#radix:b": {
                        "#radix_ph": "0x363fa5c5488fac592c828defdd7b007e56eb3e538fa8280a00e2ba1dd51e1dad"
                      },
                      "#radix:c": {
                        "#radix_ph": "0xc6a04610c5835fd0a3b33a71d57f4635f03566c9805b328641a401448a00c2b3"
                      },
                      "#radix:df98a5effc56cadb8859f2cf2e5422afe9ce787": {
                        "#radix_ph": "0xc7b3114b7ecc3f24c84c063fd679a67a13b8963a33c6f68c6f12300d52b1d1cf"
                      },
                      "#radix:e": {
                        "#radix_ph": "0xc2221b21e103d725fafb8fa5d62dde70f02f305d33e2928ae53243aa9499fdfd"
                      },
                      "#radix:f": {
                        "#radix_ph": "0x0266d65bfcbed60f986b420d2ea68fd72271ec63f9b6a5f3e68c24a6c48895de"
                      }
                    },
                    "#radix:b": {
                      "#radix_ph": "0xf68a4e7e4d7f9a71c2975519f61807bcde9a0721d92c7ddbd68d4f4f7cd103c0"
                    },
                    "#radix:c": {
                      "#radix_ph": "0xce878100c7c3ef6eda8e5f78f82e884741963edc9bfa370626d16da5683e2b04"
                    },
                    "#radix:d": {
                      "#radix_ph": "0xbe6155bac97c220873c5790bc3633eea252b24184436d9cc0e20d2aa9aa445e8"
                    },
                    "#radix:e": {
                      "#radix_ph": "0xf2365aa692679db520c761bc5616ea8e78e7d66e8e5b7fa62f5ccede3c4ad21d"
                    },
                    "#radix:f": {
                      "#radix_ph": "0x5d5f1af4318fd0ce355a0c658f8d1695c0a1f00587edf9b9543887955c15fe12"
                    }
                  }
                },
                "#radix:707073": {
                  "#radix_ph": "0x8e3709e38db2e60381f0359985a9b11da39b69c436d91fb9fed4fe7956176bfa"
                }
              },
              "#radix:26c6f636b636861696e5f706172616d73": {
                "#radix_ph": "0x0db35261beb8f805e4ced018ff3f0466b6f8536d5d190ef15d6ad7bb1a14bb0b"
              },
              "#radix:36": {
                "#radix_ph": "0x4d38d68552a062ed3da9978081154a50e24d072da2d94e8a05bf321f243167f5"
              },
              "#radix:46576656c6f70657273": {
                "#radix_ph": "0x6eed3986e6ce5982579a76c50ad98718dc3aa93eeae2724c9dc629264bbfb144"
              },
              "#radix:57363726f77": {
                "#radix_ph": "0x985b5bc09f0751dd9b36a01ef5480c0a13220b381d56ea987731a024da3ca0b9"
              },
              "#radix:761735f666565": {
                "#radix_ph": "0x73ef1cf919a1af7d1fc1474f98015db7921cdd4279fb73fd833958dd4d6c322a"
              },
              "#radix:d616e6167655f617070": {
                "#radix_ph": "0x09c91d8b6ec15ac74bee4b86f27e91a08320b817f98b906401f221fcdc7098d5"
              }
            },
            "#radix:7": {
              "#radix_ph": "0x8b6f952e411eff64c653014abad49a9f16022c57055690a10d1d8c8a2febe566"
            }
          }
        }
      }
    },
    "protoVer": "1.1.3"
  }
}
```

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getStateProof",
  "params": {
    "protoVer": "1.1.3",
    "ref": "/rules/transfer/$from/$to/$key/value"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": {
      "#state_ph": "0x0f8b8321926d6b97202e1235f132b7b5abbd215ccb89a23f3a586039a8ba8eae",
      "#radix:6": {
        "#radix_ph": "0xb1ee79c294caa1b2cfc76f2cb5e0204927e7f7583810b0c175915914dba859d8"
      },
      "#radix:7": {
        "#radix_ph": "0x83ab7a2bb8e72434b1b2e4a44865b5e5651b9f11b7acff8ce79539a1ae1a31d3",
        "#radix:2756c6573": {
          "#radix_ph": "0x92bf1f2761726c8ff84afed4384e717c83cd5250c5e2d7acce6bad31b0829eb3",
          "#state:rules": {
            "#state_ph": "0xfcbc1bf027604a07c667f0c8117c4172ad03f331c940371d63b8148a8f3d0229",
            "#radix:2e72756c65": {
              "#radix_ph": "0xc81213b5048a9d36df0ba967b41e5e6fd91cb23fa34d7865b77d84834fe45609"
            },
            "#radix:6": {
              "#radix_ph": "0xc4a5af3b1505e23b6a56dc26a986f5816a03759f54a6b0198e29099cfe7a6cbc"
            },
            "#radix:7": {
              "#radix_ph": "0x0a601b4a4f14d03418df9a45d2fe89070fb73e1291b1e4c5c0ebf243851f353a",
              "#radix:061796d656e7473": {
                "#radix_ph": "0x43100c4e84ea4aaa52fa7d8178b4e2d0f1ecf48a3bbe5f386ac8eb30468ce7a6"
              },
              "#radix:265636569707473": {
                "#radix_ph": "0x74c9d75b14aa15aacfed1dd234afb9eb76a51e7b52de60f9b44bd1ba5bfda45a"
              },
              "#radix:3": {
                "#radix_ph": "0x3acc464caf851b9b4b17380651b391924bdd8d97f5d93485558cceb2b5c6de3b"
              },
              "#radix:472616e73666572": {
                "#radix_ph": "0xbe2ed91f86677d8fad068cc52741a20001b3bc2f1561cc252f546416165c27b6",
                "#state:transfer": {
                  "#state_ph": "0x0141303f991e7fb0fc33c06c61cb1d3efd5ba32298216f635fd0bb2e52cdc445",
                  "#radix:2466726f6d": {
                    "#radix_ph": "0xe9d9b329ee30ad1b8b39d12bfe388fb9495eb01099acc024297b9f9ff5355f8f",
                    "#state:$from": {
                      "#state_ph": "0x7f30b158f29ae89cac37111984b773500b9560533a1418ca06e2ec84599ba9ab",
                      "#radix:24746f": {
                        "#radix_ph": "0x957b4f5e1c03df8409548cad92fe23150f3138e0aec1369d688d513d12fc3954",
                        "#state:$to": {
                          "#state_ph": "0x3f2681f1f6baadf68f7c0d6092b3bad6cfcfc237a5c4e7259515f2969eccebab",
                          "#radix:246b6579": {
                            "#radix_ph": "0xdfa83c70fa73726e41f9131659c7682216329cc53bbc2de8cde970abe8920eb2",
                            "#state:$key": {
                              "#state_ph": "0x2130187b66a8d0d04b67a3bf400c4f80e157cde53831ce6a64c9ee46a0d14a83",
                              "#radix:2e72756c65": {
                                "#radix_ph": "0x879dd0ff6e90ca3e3185cc1e302abdfe361fb97016fbedbb5949b754d7473621"
                              },
                              "#radix:76616c7565": {
                                "#radix_ph": "0x621192b54cc0b6c2947e3e0c1c4b213c0803dc6961f8e5e05b1707eac55cbd1e",
                                "#state:value": {
                                  "#state_ph": "0x985a1f057d5047b1dee392127eb776571fbbe79da7ae6114f8f8f18c4f786135"
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "#radix:6616c756573": {
          "#radix_ph": "0xf59d499293446f3aef6df58e521162601cf56700e15d20105efe69fb908f515d"
        }
      }
    },
    "protoVer": "1.1.3"
  }
}
```

---

## Account API

### ain_getBalance

Returns the balance of an account. 

**Parameters**

An object with a property:

-   address: `String` - address of the account to get the balance of. 

**Returns**

`Number` - The balance. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_getBalance",
  "params": {
    "address": "0xc94770007dda54cF92009BFF0dE90c06F603a09f"
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":98347
}
```

### ain_getConsensusStakeAmount

Returns the amount of AIN the account (node) is staking for participating in the consensus protocol. 

**Parameters**[](#parameters-1)

An object with a property:

-   address: `String` - address of the account. 

**Returns**

`Number` - The amount at stake. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_getConsensusStakeAmount",
  "params": {
    "address": "0xc94770007dda54cF92009BFF0dE90c06F603a09f"
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":1000
}
```

### ain_getNonce

Returns the nonce (= number of transactions an address has sent) of an address. 

**Parameters**

An object with a property:

-   address: `String` - address of the account to get the transaction count of 

**Returns**

`Number` - The nonce. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_getNonce",
  "params": {
    "address": "0xc94770007dda54cF92009BFF0dE90c06F603a09f"
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":10
}
```

### ain_isValidator

Returns whether the node is currently a validator or not. 

**Parameters**

An object with a property:

-   address: `String` - address of the account to check if it's currently in the validator set 

**Returns**

`Boolean` - Whether the node is a validator or not. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_isValidator",
  "params": {
    "address": "0xc94770007dda54cF92009BFF0dE90c06F603a09f"
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":true
}
```

---

## Transaction API

### ain_getPendingTransactions

Returns currently pending transactions.

**Parameters**

None.

**Returns**

`Array` - A list of pending transactions.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getPendingTransactions",
  "params": {
    "protoVer": "1.0.9"
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":[
    {
      "status":"PENDING",
      "hash":"0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99...",
      "address":"0xa7d9ddbe1f17865597fbd27ec712455208b6b76d",
      "signature":"0x1b5e176d927f8e9ab405058b2d2457392da3e20f3...",
      "timestamp":1566736760322,
      "nonce":-1,
      "parent_tx_hash":"0x88df016429689c079f3b2f6ad39fa052532c56...",
    },
    {
      "status":"PENDING",
      "hash":"0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99...",
      "address":"0xa7d9ddbe1f17865597fbd27ec712455208b6b76d",
      "signature":"0x1ec191ef20b0e9628c4397665977cb...",
      "timestamp":1566736800358,
      "nonce":99
    }
  ]
}
```

### ain_getTransactionByBlockNumberAndIndex

Returns the transaction at the {index} position within the block with the {block_number}.

**Parameters**

An object with 2 properties:
-   block_number: `Number` - block number
-   index: `Number` - index of the transaction within the block
    
**Returns**

`Object` - The transaction. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getTransactionByBlockNumberAndIndex",
  "params": {
    "protoVer": "1.0.9",
    "block_number": 1018739,
    "index": 1
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": {json
      "transaction": {
        "tx_body": {
          "operation": {
            "type": "SET_VALUE",
            "ref": "/apps/collaborative_ai/worker_info/w2udhcx6tzbqxqf0@0xd377ab38E8C9267ce0f85613680b327069d51752/status",
            "value": {
              "workerStatus": "running",
              "currentNumberOfContainer": 0,
              "updatedAt": 1661420944081
            }
          },
          "nonce": -1,
          "timestamp": 1661420944081,
          "gas_price": 0
        },
        "signature": "0x6d652a4e0b8517bb6277db4c2679ec9da4e0f2c9166359361088fa0157288b6ca2bd756e674352fd42713d5b659b240a5ace66a24fc8abdaa995ae8f1b04bbf124aa38111e495dd7aa7502acdf789d2ff18d360d59f42780ac17ac76fa1d92771b",
        "hash": "0x6d652a4e0b8517bb6277db4c2679ec9da4e0f2c9166359361088fa0157288b6c",
        "address": "0xd377ab38E8C9267ce0f85613680b327069d51752"
      },
      "is_executed": true,
      "is_finalized": true
    },
    "protoVer": "1.0.9"
  }
}
```

### ain_getTransactionByBlockHashAndIndex

Returns the transaction at the {index} position in the block with the {block_hash}.

**Parameters**

An object with 2 properties:

-   block_hash: `String` - block hash
-   index: `Number` - index of the transaction within the block

**Returns**

`Object` - The transaction.

### 

**Example**[](#example-2)

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getTransactionByBlockHashAndIndex",
  "params": {
    "protoVer": "1.0.9",
    "block_hash": "0x38635f8c1b3ecfaa8314698ac241341dc3ba82bc1d26e4fb5c20e21fe9ce2645",
    "index": 0
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": {
      "transaction": {
        "tx_body": {
          "operation": {
            "type": "SET_VALUE",
            "ref": "/apps/collaborative_ai/worker_info/w2udhcx6tzbqxqf0@0xd377ab38E8C9267ce0f85613680b327069d51752",
            "value": {
              "ethAddress": "0xbDA5747bFD65F08deb54cb465eB87D40e51B197E",
              "containerSpec": {
                "cpu": {
                  "name": "Intel® Xeon®",
                  "vcpu": 1
                },
                "gpu": {
                  "name": "nvidia-tesla-t4",
                  "memoryGB": 16,
                  "count": 1
                },
                "memory": {
                  "maxGB": 4
                },
                "storage": {
                  "maxGB": 128
                },
                "maxNumberOfContainer": 1,
                "hasEndpoint": true
              },
              "labels": {
                "spec": "nc6",
                "managedBy": "run-your-node"
              },
              "createdAt": 1661420943970
            }
          },
          "nonce": -1,
          "timestamp": 1661420943970,
          "gas_price": 0
        },
        "signature": "0x2c9ffeb45b3377471b8c88e07159cfe0156278338a6763f0e9437f059623997398bd5469498192da259a90e279d4c85510341d05c8ff268f62d4d1299965a503148ad4e1430ab91734764cf0ed048d8a8df4e80c64f4cd3e1a10e0358e447f6c1c",
        "hash": "0x2c9ffeb45b3377471b8c88e07159cfe0156278338a6763f0e9437f0596239973",
        "address": "0xd377ab38E8C9267ce0f85613680b327069d51752"
      },
      "is_executed": true,
      "is_finalized": true
    },
    "protoVer": "1.0.9"
  }
}
```

### ain_getTransactionByHash

Returns the transaction with the hash. 

**Parameters**

An object with a property:

-   hash: `String` - transaction hash 

**Returns**

`Object` - the transaction. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getTransactionByHash",
  "params": {
    "protoVer": "1.0.9",
    "hash": "0xa38fabd1daa7d7d0488275d146bebcacd088eda0069987606a61407c680eb8d9",
    "index": 0
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": {
      "state": "FINALIZED",
      "number": 1161159,
      "index": 0,
      "address": "0x4db42BDE411AfC23B8F3b26EE7AE73DA28c9e470",
      "timestamp": 1664272982427,
      "is_executed": true,
      "is_finalized": true,
      "tracked_at": 1664273029387,
      "executed_at": 1664272982539,
      "finalized_at": 1664273029387,
      "transaction": "0xa38fabd1daa7d7d0488275d146bebcacd088eda0069987606a61407c680eb8d9",
      "receipt": {
        "code": 0,
        "gas_amount_charged": 0,
        "gas_cost_total": 0
      }
    },
    "protoVer": "1.0.9"
  }
}
```

### ain_sendSignedTransaction

Sends the signature and the transaction object to the node.
 
**Parameters**

An object with following properties:

-   signature: `String` - signature of the transaction
-   transaction: `Object`  - transaction object 

**Returns**

`String` - the transaction's hash.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_sendSignedTransaction",
  "params": {
    "protoVer": "1.0.9",
    "signature": "0xdb61ef...FILL_THIS",
    "transaction":{
       "nonce":123,
       "timestamp":1566736760322,
       "operation":{
         "ref":"/account/0x04aac78e17374fd075d1f11bfe95ef7d8e4ed812/balance",
         "type":"SET_VALUE",
         "value":1000
       },
       "parent_tx_hash":"0x88df016429689c079f3b2f6ad39fa052532c56..."
     }
  }
}'
```

### ain_sendSignedTransactionBatch

Sends multiple transactions at once.

**Parameters**

An object with a property:

-   `Array` - an array of transaction objects (with signature and transaction properties) 

**Returns**

`Array` - an array of transaction hashes. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_sendSignedTransactionBatch", 
  "params": {
    "tx_list": [
      {
        "signature": "0xaabc9ddafffb2ae0bac4107697547d22d9383...",
        "transaction": {
          "nonce": 120,
          "timestamp": 1566736760322,
          "operation": {
            "ref": "path/",
            "value": "value",
            "type": "SET_VALUE"
          }
        }
      },
      {
        "signature": "0x1ec191ef20b0e9628c4397665977cb...",
        "transaction": {
          "nonce": 121,
          "timestamp": 1566736760400,
          "operation": {
            "ref": "path/path/",
            "value": 100,
            "type": "SET_VALUE"
          }
        }
      }
    ]
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0",
  "id":1,
  "result":[
    "0x88df016429689c079f3b2f6ad39fa052532c56795b733da7...",
    "0x8e4340ea3983d86e4b6c44249362f716ec9e09849ef9b6e3..."
  ]
}
```

---

## Block API

### ain_getRecentBlock

Returns the most recent block.

**Parameters**

None.

**Returns**

`Object` - The most recent block. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getRecentBlock"
}'
```
Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":{
    "timestamp":1564845946382,
    "hash":"0x7a6c2a5a91ce3731310885eff761f7ee39484...",
    "parent_hash":"0xe670ec64341771606e55d6b4ca35a1a6b75...",
    "number":675,
    "proposer":"0x04aac78e17374fd075d1f11bfe95ef7d8e4ed812",
    "validators":[
      "0x4e65fda2159562a496f9f3522f89122a3088497a",
      "0xd46e8dd67c5d32be8058bb8eb970870f07244567",
      "0xb60e8dd61c5d32be8058bb8eb970870f07233155"
    ],
    "size":163591,
    "transactions":[
      {
        "hash":"0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99...",
        "address":"0xa7d9ddbe1f17865597fbd27ec712455208b6b76d",
        "signature":"0x1b5e176d927f8e9ab405058b2d2457392da3e20f3...",
        "timestamp":1566736760322,
        "nonce":-1,
        "parent_tx_hash":"0x88df016429689c079f3b2f6ad39fa052532c56...",
        "operation":{ ... }
      },
      {
        "hash":"0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99...",
        "address":"0xa7d9ddbe1f17865597fbd27ec712455208b6b76d",
        "signature":"0x1ec191ef20b0e9628c4397665977cb...",
        "timestamp":1566736780022,
        "nonce":99,
        "operation":{ ... }
      },
      ...
    ]
  }
}
```

## ain_getRecentBlockNumber

Returns the most recent block's block number.

**Parameters**

None.

**Returns**

`Number` - The most recent block's block number. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getRecentBlockNumber"
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":98347
}
```

## ain_getBlockByNumber

Returns the block with the given block number.

**Parameters**

An object with properties:

-   number: `Number` - the block number
-   getFullTransactions: `Boolean` - if true, it returns full transaction objects; if false or undefined, it returns the transaction hashes only.

**Returns**

`Object` - A block object.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getBlockByNumber",
  "params": {
    "number": 675,
    "getFullTransactions": true
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":{
    "timestamp":1564845946382,
    "hash":"0x7a6c2a5a91ce3731310885eff761f7ee39484...",
    "parent_hash":"0xe670ec64341771606e55d6b4ca35a1a6b75...",
    "number":675,
    "proposer":"0x04aac78e17374fd075d1f11bfe95ef7d8e4ed812",
    "validators":[
      "0x4e65fda2159562a496f9f3522f89122a3088497a",
      "0xd46e8dd67c5d32be8058bb8eb970870f07244567",
      "0xb60e8dd61c5d32be8058bb8eb970870f07233155"
    ],
    "size":163591,
    "transactions":[
      {
        "hash":"0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99...",
        "address":"0xa7d9ddbe1f17865597fbd27ec712455208b6b76d",
        "signature":"0x1b5e176d927f8e9ab405058b2d2457392da3e20f3...",
        "timestamp":1566736760322,
        "nonce":-1,
        "parent_tx_hash":"0x88df016429689c079f3b2f6ad39fa052532c56...",
        "operation":{ ... }
      },
      {
        "hash":"0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99...",
        "address":"0xa7d9ddbe1f17865597fbd27ec712455208b6b76d",
        "signature":"0x1ec191ef20b0e9628c4397665977cb...",
        "timestamp":1566736780022,
        "nonce":99,
        "operation":{ ... }
      },
      ...
    ]
  }
}
```

## ain_getBlockByHash

Returns the block with the specified block hash.

**Parameters**

An object with properties:

-   hash: `String` - block hash
-   getFullTransactions: `Boolean` - if true, it returns full transaction objects; if false or undefined, it returns the transaction hashes only.

**Returns**

`Object` - The block.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_getBlockByHash",
  "params": {
    "hash": "0x7a6c2a5a91ce3731310885eff761f7ee39484...",
    "getFullTransactions": true
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":{
    "timestamp":1564845946382,
    "hash":"0x7a6c2a5a91ce3731310885eff761f7ee39484...",
    "parent_hash":"0xe670ec64341771606e55d6b4ca35a1a6b75...",
    "number":67526,
    "proposer":"0x04aac78e17374fd075d1f11bfe95ef7d8e4ed81",
    "validators":[
      "0x4e65fda2159562a496f9f3522f89122a3088497a",
      "0xd46e8dd67c5d32be8058bb8eb970870f07244567",
      "0xb60e8dd61c5d32be8058bb8eb970870f07233155"
    ],
    "size":163591,
    "transactions":[
      {
        "hash":"0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99...",
        "address":"0xa7d9ddbe1f17865597fbd27ec712455208b6b76d",
        "signature":"0x1b5e176d927f8e9ab405058b2d2457392da3e20f3...",
        "timestamp":1566736760322,
        "nonce":-1
        "parent_tx_hash":"0x88df016429689c079f3b2f6ad39fa052532c56...",
        "operation":{ ... }
      },
      {
        "hash":"0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99...",
        "address":"0xa7d9ddbe1f17865597fbd27ec712455208b6b76d",
        "signature":"0x1ec191ef20b0e9628c4397665977cb...",
        "timestamp":1566736760400,
        "nonce":99,
        "operation":{ ... }
      },
      ...
    ]
  }
}
```

## ain_getBlocks

Returns a list of blocks that have a block number between "from" block number and "to" block number.

**Parameters**

An object with properties:

-   from: `Number` - the block number of the starting block
-   to: `Number` - the block number of the last block to get
 
**Returns**

`Array` - The list of blocks.
 
**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getBlocks",
  "params": {
    "from": 0,
    "to": 100
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":
  [
    {
      "timestamp":1564845946382,
      "hash":"0x7a6c2a5a91ce3731310885eff761f7ee39484...",
      "parent_hash":"",
      "number":0,
      "proposer":"0x04aac78e17374fd075d1f11bfe95ef7d8e4ed81",
      "validators":[
        "0x4e65fda2159562a496f9f3522f89122a3088497a",
        "0xd46e8dd67c5d32be8058bb8eb970870f07244567",
        "0xb60e8dd61c5d32be8058bb8eb970870f07233155"
      ],
      "size":163591,
      "transactions":[
        {
          "hash":"0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99...",
          "address":"0xa7d9ddbe1f17865597fbd27ec712455208b6b76d",
          "signature":"0x1b5e176d927f8e9ab405058b2d2457392da3e20f3...",
          "timestamp":1566736760322,
          "nonce":-1
          "parent_tx_hash":"0x88df016429689c079f3b2f6ad39fa052532c56...",
          "operation":{ ... }
        },
        {
          "hash":"0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99...",
          "address":"0xa7d9ddbe1f17865597fbd27ec712455208b6b76d",
          "signature":"0x1ec191ef20b0e9628c4397665977cb...",
          "timestamp":1566736760400,
          "nonce":99,
          "operation":{ ... }
        },
        ...
      ]
    },
    ...
  ]
}
```

## ain_getBlockHeaders

Returns a list of block headers that have a block number between "from" block number and "to" block number.

**Parameters**

An object with properties:

-   from: `Number` - the block number of the starting block
-   to: `Number` - the block number of the last block to get
 
**Returns**

`Array` - The list of block headers.
 
**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getBlockHeaders",
  "params": {
    "from": 0,
    "to": 100
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":
  [
    {
      "timestamp":1564845946382,
      "hash":"0x7a6c2a5a91ce3731310885eff761f7ee39484...",
      "parent_hash":"",
      "number":0,
      "proposer":"0x04aac78e17374fd075d1f11bfe95ef7d8e4ed81",
      "validators":[
        "0x4e65fda2159562a496f9f3522f89122a3088497a",
        "0xd46e8dd67c5d32be8058bb8eb970870f07244567",
        "0xb60e8dd61c5d32be8058bb8eb970870f07233155"
      ],
      "size":163591,
    },
    ...
  ]
}
```

## ain_getBlockTransactionCountByNumber

Returns the number of transactions in the block with the specified block number.

**Parameters**

An object with a property:

-   number: `Number` - block number 

**Returns**

`Number` - Number of transactions in the block. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_getBlockTransactionCountByNumber",
  "params": {
    "number": "123"
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":11
}
```

## ain_getBlockTransactionCountByHash

Returns the number of transactions in the block with the specified block hash. 

**Parameters**

An object with a property:

-   hash: `String` - block hash 

**Returns**

`Number` - Number of transactions

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_getBlockTransactionCountByNumber",
  "params": {
    "hash": "0x7a6c2a5a91ce3731310885eff761f7ee39484..."
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":11
}
```

## ain_getProposerByHash

Returns the proposer who produced the block with the given block hash. 

**Parameters**

An object with a property:

-   hash: `String` - block hash 

**Returns**

`String` - The address of the proposer. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_getProposerByHash",
  "params": {
    "hash": "0x7a6c2a5a91ce3731310885eff761f7ee39484..."
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":"0x04aac78e17374fd075d1f11bfe95ef7d8e4ed81"
}
```

## ain_getProposerByNumber

Returns the proposer who produced the block with the given block number.

**Parameters**

An object with a property:

-   number: `Number` - block number 

**Returns**

`String` - The proposer's address. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getProposerByNumber",
  "params": {
    "number": 456
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":"0x04aac78e17374fd075d1f11bfe95ef7d8e4ed81"
}
```

## ain_getValidatorsByHash

Returns the validators who validated the block. 

**Parameters**

An object with a property:

-   hash: `String` - block hash 

**Returns**

`Array` - The list of validators. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_getValidatorsByHash",
  "params": {
    "hash": "0x7a6c2a5a91ce3731310885eff761f7ee39484..."
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":[
    "0x4e65fda2159562a496f9f3522f89122a3088497a",
    "0xd46e8dd67c5d32be8058bb8eb970870f07244567",
    "0xb60e8dd61c5d32be8058bb8eb970870f07233155"
  ]
}
```

## ain_getValidatorsByNumber

Returns the validators who validated the block.

**Parameters**

An object with a property:

-   number: `Number` - block number 

**Returns**

`Array` - The list of validators. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_getValidatorsByNumber",
  "params": {
    "number": 2143
  }
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":[
    "0x4e65fda2159562a496f9f3522f89122a3088497a",
    "0xd46e8dd67c5d32be8058bb8eb970870f07244567",
    "0xb60e8dd61c5d32be8058bb8eb970870f07233155"
  ]
}
```

---

## Network API

### net_listening

Returns whether the node is listening for network connections.

**Parameters**

None.

**Returns**

`Boolean` - true is the node is listening for connections; otherwise, false. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "net_listening"
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":true
}
```

### net_nodeInfo

Returns the node's information.

**Parameters**

None.

**Returns**

`Object` - the object containing node's information.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "net_nodeInfo"
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":{
    "name":"comcom_node",
    "location":"KOR",
    "version":"1.0.0"
  }
}
```

### net_peerCount

Returns the number of peers the node is connected to.

**Parameters**

None.

**Returns**

`Number` - number of peers.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "net_peerCount"
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":7
}
```

### net_syncing

Returns whether the node is syncing with the network or not.

**Parameters**

None.

**Returns**

`Boolean` - true if the node is syncing, false otherwise.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "net_syncing"
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":true
}
```

### net_id

Returns the network id.

**Parameters**

None.

**Returns**

`Number` - the network id.

-   0: main network
-   1: test network
    
**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "net_id"
}'
```

Response
```
{ 
  "jsonrpc":"2.0", 
  "id":1,
  "result":0
}
```

---
