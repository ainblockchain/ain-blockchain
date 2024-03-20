# AIN Blockchain JSON-RPC API

## Table of Contents

- [Database API](#database-api)
  - [ain_get](#ain_get)
  - [ain_matchFunction](#ain_matchfunction)
  - [ain_matchRule](#ain_matchrule)
  - [ain_matchOwner](#ain_matchowner)
  - [ain_evalRule](#ain_evalrule)
  - [ain_evalOwner](#ain_evalowner)
  - [ain_getStateProof](#ain_getstateproof)
  - [ain_getProofHash](#ain_getproofhash)
  - [ain_getStateInfo](#ain_getstateinfo)
  - [ain_getStateUsage](#ain_getstateusage)
- [Account API](#account-api)
  - [ain_getAddress](#ain_getaddress)
  - [ain_getBalance](#ain_getbalance)
  - [ain_getNonce](#ain_getnonce)
  - [ain_getTimestamp](#ain_gettimestamp)
- [Transaction API](#transaction-api)
  - [ain_getPendingTransactions](#ain_getpendingtransactions)
  - [ain_getTransactionPoolSizeUtilization](#ain_gettransactionpoolsizeutilization)
  - [ain_getTransactionByHash](#ain_gettransactionbyhash)
  - [ain_getTransactionByBlockHashAndIndex](#ain_gettransactionbyblockhashandindex)
  - [ain_getTransactionByBlockNumberAndIndex](#ain_gettransactionbyblocknumberandindex)
  - [ain_sendSignedTransactionDryrun](#ain_sendsignedtransactiondryrun)
  - [ain_sendSignedTransaction](#ain_sendsignedtransaction)
  - [ain_sendSignedTransactionBatch](#ain_sendsignedtransactionbatch)
- [Block API](#block-api)
  - [ain_getLastBlock](#ain_getlastblock)
  - [ain_getLastBlockNumber](#ain_getlastblocknumber)
  - [ain_getBlockByNumber](#ain_getblockbynumber)
  - [ain_getBlockByHash](#ain_getblockbyhash)
  - [ain_getBlockList](#ain_getblocklist)
  - [ain_getBlockHeadersList](#ain_getblockheaderslist)
  - [ain_getBlockTransactionCountByNumber](#ain_getblocktransactioncountbynumber)
  - [ain_getBlockTransactionCountByHash](#ain_getblocktransactioncountbyhash)
- [Blockchain Node API](#blockchain-node-api)
  - [ain_getValidatorInfo](#ain_getvalidatorinfo)
  - [ain_getValidatorsByNumber](#ain_getvalidatorsbynumber)
  - [ain_getValidatorsByHash](#ain_getvalidatorsbyhash)
  - [ain_getProposerByNumber](#ain_getproposerbynumber)
  - [ain_getProposerByHash](#ain_getproposerbyhash)
- [Network API](#network-api)
  - [net_getNetworkId](#net_getnetworkid)
  - [net_getChainId](#net_getchainid)
  - [net_listening](#net_listening)
  - [net_syncing](#net_syncing)
  - [net_peerCount](#net_peercount)
  - [net_consensusStatus](#net_consensusstatus)
  - [net_rawConsensusStatus](#net_rawconsensusstatus)
  - [p2p_getPeerCandidateInfo](#p2p_getpeercandidateinfo)

---

## Database API

### ain_get

Returns the value, write rule, owner rule, or function at the given path in the global state tree. 

**Parameters**

An array of objects with properties:

- protoVer: `String` - protocol version
- type: `String` - "GET_VALUE" | "GET_RULE" | "GET_FUNCTION" | "GET_OWNER" | "GET"
- ref: `String` - reference path to get a value/rule/owner/function of. Only required if the type is not "GET".
- op_list: `Array` - array of get operations ({ type, ref, [is_shallow, is_global, is_final, include_tree_info, include_proof, include_version] }). Only required if the type is "GET".
- is_shallow: `Boolean` | `undefined` - an optional get request parameter. When specified as `true`, the shallow result (only the keys of the children) will be returned.
- is_global: `Boolean` | `undefined` - an optional get request parameter. When specified as `true`, the given ref will be interpreted as a global path.
- is_final: `Boolean` | `undefined` - an optional get request parameter. When specified as `true`, the finalization result will be returned.
- include_tree_info: `Boolean` | `undefined` - an optional get request parameter. When specified as `true`, the result will include additional state tree information.
- include_proof: `Boolean` | `undefined` - an optional get request parameter. When specified as `true`, the result will include state proof hashes.
- include_version: `Boolean` | `undefined` - an optional get request parameter. When specified as `true`, the result will include state versions.

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

An object with properties:

- protoVer: `String` - protocol version
- ref:  `String` - reference value path

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

An object with properties:

- protoVer: `String` - protocol version
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

An object with properties:

- protoVer: `String` - protocol version
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

An object with properties:

- protoVer: `String` - protocol version
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

An object with properties:

- protoVer: `String` - protocol version
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

An object with properties:

- protoVer: `String` - protocol version
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
    "ref": "/values/blockchain_params"
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
      "#state_ph": "0xdf8694f052e026a8afeea926a69591ba24cd2b5ae16a1cb51058ad5880027602",
      "#radix:6": {
        "#radix_ph": "0xb1ee79c294caa1b2cfc76f2cb5e0204927e7f7583810b0c175915914dba859d8"
      },
      "#radix:7": {
        "#radix_ph": "0xadcddbecf4c4a26056c59784786f2fc0ed977829fc00c931e96b8d4e166af015",
        "#radix:2756c6573": {
          "#radix_ph": "0x92bf1f2761726c8ff84afed4384e717c83cd5250c5e2d7acce6bad31b0829eb3"
        },
        "#radix:6616c756573": {
          "#radix_ph": "0xf9996bca1a7f41d9a2ffd67ea086fe215dcc678c9861e17bb6ccb051fdfd63ad",
          "#state:values": {
            "#state_ph": "0x2f5e6dcbc67c8b47b354584084afd8230cc88df6d54df181ea80fbf2281c3140",
            "#radix:6": {
              "#radix_ph": "0xf17f4966c6480df406af1f4305d8f71df8704089a20bc2244ff6d9009278bafe",
              "#radix:1": {
                "#radix_ph": "0x3b5f61c11f36018bcb5d320e5b98c9d5f69463d95ef1cee71503f6e19d3a1b3e"
              },
              "#radix:26c6f636b636861696e5f706172616d73": {
                "#radix_ph": "0x0db35261beb8f805e4ced018ff3f0466b6f8536d5d190ef15d6ad7bb1a14bb0b",
                "#state:blockchain_params": {
                  "#state_ph": "0x743b16391b5100908951fb9e33308c95a30570de399616a616a682d8c6d4b0b3"
                }
              },
              "#radix:36": {
                "#radix_ph": "0x6a9192e77bae6f4a56eb719ad42467ad3ba0ba13ca895e1ec9b783661d6c3288"
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

### ain_getProofHash

Returns the state proof hash of the given path in the global state tree. 

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- ref: `String` - reference path prefixed with data type. e.g., /values/accounts/0x..., /rules/transfer/\$from/\$to/value, /functions/transfer/\$from/\$to/\$key/value, /owners/apps/consensus.

**Returns**

The state proof hash.

**Examples**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getProofHash",
  "params": {
    "protoVer": "1.1.3",
    "ref": "/values/blockchain_params"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": "0x743b16391b5100908951fb9e33308c95a30570de399616a616a682d8c6d4b0b3",
    "protoVer": "1.1.3"
  }
}
```

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getProofHash",
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
    "result": "0x985a1f057d5047b1dee392127eb776571fbbe79da7ae6114f8f8f18c4f786135",
    "protoVer": "1.1.3"
  }
}
```

### ain_getStateInfo

Returns the state information of the given path in the global state tree. 

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- ref: `String` - reference path prefixed with data type. e.g., /values/accounts/0x..., /rules/transfer/\$from/\$to/value, /functions/transfer/\$from/\$to/\$key/value, /owners/apps/consensus.

**Returns**

The state information.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getStateInfo",
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
      "#num_children": 1,
      "#tree_height": 2,
      "#tree_size": 3,
      "#tree_bytes": 1840,
      "#tree_max_siblings": 1,
      "#state_ph": "0x985a1f057d5047b1dee392127eb776571fbbe79da7ae6114f8f8f18c4f786135",
      "#version": "POOL:3062598:3062599:1702353330546:0"
    },
    "protoVer": "1.1.3"
  }
}
```

### ain_getStateUsage

Returns the state usage of the given app name. 

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- app_name: `String` - app name

**Returns**

The state usage.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getStateUsage",
  "params": {
    "protoVer": "1.1.3",
    "app_name": "consensus"
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
      "usage": {
        "tree_height": 6,
        "tree_size": 11,
        "tree_bytes": 2114,
        "tree_max_siblings": 5
      },
      "available": {
        "tree_height": 30,
        "tree_bytes": 12291542508.778091,
        "tree_size": 76822140.67986308
      },
      "staking": {
        "app": 50500000,
        "total": 10168575.540000014,
        "unstakeable": 50500000
      }
    },
    "protoVer": "1.1.3"
  }
}
```

---

## Account API

### ain_getAddress

Returns the address of the blockchain node's account. 

**Parameters**

An object with properties:

- protoVer: `String` - protocol version

**Returns**

`String` - The address. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_getAddress",
  "params": {
    "protoVer": "1.1.3"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4",
    "protoVer": "1.1.3"
  }
}
```

### ain_getBalance

Returns the balance of the given account. 

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- address: `String` - address of the account, which should be a checksum address 

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
    "protoVer": "1.1.3",
    "address": "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": 578990573.3755,
    "protoVer": "1.1.3"
  }
}
```

### ain_getNonce

Returns the nonce, number of transactions an address has sent, of the given account 

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- address: `String` - address of the account, which should be a checksum address 

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
    "protoVer": "1.1.3",
    "address": "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": 91,
    "protoVer": "1.1.3"
  }
}
```

### ain_getTimestamp

Returns the timestamp of the given account 

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- address: `String` - address of the account, which should be a checksum address 

**Returns**

`Number` - The timestamp. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_getTimestamp",
  "params": {
    "protoVer": "1.1.3",
    "address": "0xAAAAeEDFf1d2cD909465182165ccc267549554Fc"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": 0,
    "protoVer": "1.1.3"
  }
}
```

---

## Transaction API

### ain_getPendingTransactions

Returns currently pending transactions.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version

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
    "protoVer": "1.1.3"
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
      "0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204": [
        [
          {
            "tx_body": {
              "operation": {
                "type": "SET",
                "op_list": [
                  {
                    "type": "SET_VALUE",
                    "ref": "/consensus/number/1/propose",
                    "value": {
                      "number": 1,
                      "epoch": 3293579,
                      "validators": {
                        "0x00ADEc28B6a845a085e03591bE7550dd68673C1C": {
                          "stake": 10000000,
                          "proposal_right": true
                        },
                        "0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204": {
                          "stake": 10000000,
                          "proposal_right": true
                        },
                        "0x02A2A1DF4f630d760c82BE07F18e5065d103Fa00": {
                          "stake": 10000000,
                          "proposal_right": true
                        }
                      },
                      "total_at_stake": 30000000,
                      "proposer": "0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204",
                      "block_hash": "0x227903519aa2e8810b4f962352278a66e87ba94ce38b1ad24191298d2da5f029",
                      "last_hash": "0x31075a91beeea98fe8030c848d40b592411f2533c77d347d7937be84eae83745",
                      "timestamp": 1706866780852,
                      "gas_cost_total": 0
                    }
                  }
                ]
              },
              "nonce": -1,
              "gas_price": 0,
              "timestamp": 1706866780900
            },
            "signature": "0xd2b9af94907ee0b766eb9dace532be79b1a7ce525c3e8560cc44100fed7e8f7f35fdc552a52761fb43923cd6b320e6e02339ea96e9eaeef6df84134cb7581f9c3dff7714e3f8487eb31f838833486747fec77cc484df5d0bf9808e37c1b1b15e1b",
            "hash": "0xd2b9af94907ee0b766eb9dace532be79b1a7ce525c3e8560cc44100fed7e8f7f",
            "address": "0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204",
            "extra": {
              "created_at": 1706866780973,
              "executed_at": 1706866780973,
              "gas": {
                "bandwidth": {
                  "service": 1
                },
                "state": {
                  "service": 4348
                }
              }
            }
          },
          ...
        ]
      ],
      "0x00ADEc28B6a845a085e03591bE7550dd68673C1C": [
        [
          {
            "tx_body": {
              "operation": {
                "type": "SET_VALUE",
                "ref": "/consensus/number/1/0x227903519aa2e8810b4f962352278a66e87ba94ce38b1ad24191298d2da5f029/vote/0x00ADEc28B6a845a085e03591bE7550dd68673C1C",
                "value": {
                  "block_hash": "0x227903519aa2e8810b4f962352278a66e87ba94ce38b1ad24191298d2da5f029",
                  "stake": 10000000,
                  "is_against": false,
                  "vote_nonce": 1706866780979
                }
              },
              "nonce": -1,
              "gas_price": 0,
              "timestamp": 1706866780979
            },
            "signature": "0xaead9b8bb1d894facf76dfa25765d80c11beaa7da1b19b5b4f90cf6b6ba314b45790b5d2be212b5f41a556322cee7ce7540266c9ab9ba61400705e1ef3401f476f8e08bf38ab0bb47df040d594f1bbf3a61dd8697ed5acf26e2d8e726563891e1b",
            "hash": "0xaead9b8bb1d894facf76dfa25765d80c11beaa7da1b19b5b4f90cf6b6ba314b4",
            "address": "0x00ADEc28B6a845a085e03591bE7550dd68673C1C",
            "extra": {
              "created_at": 1706866780981,
              "executed_at": 1706866780982,
              "gas": {
                "bandwidth": {
                  "service": 1
                },
                "state": {
                  "service": 1900
                }
              }
            }
          }
        ]
      ],
      ...
    },
    "protoVer": "1.1.3"
  }
}
```

### ain_getTransactionPoolSizeUtilization

Returns the transaction pool size utilization.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version

**Returns**

`Object` - An object containing transaction pool size utilization information.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getTransactionPoolSizeUtilization",
  "params": {
    "protoVer": "1.1.3"
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
      "limit": 1000,
      "used": 12,
      "free_limit": 100,
      "free_used": 12
    },
    "protoVer": "1.1.3"
  }
}
```

### ain_getTransactionByHash

Returns the transaction with the hash. 

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- hash: `String` - transaction hash 

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
    "protoVer": "1.1.3",
    "hash": "0x5d4c7de40b158024e2c351460dcbdaea06ced92e623b22930f27ef871dbc8401",
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
      "number": 3286991,
      "index": 0,
      "address": "0x7ed9c30C9F3A31Daa9614b90B4a710f61Bd585c0",
      "timestamp": 1706843368852,
      "is_executed": true,
      "is_finalized": true,
      "tracked_at": 1706843414080,
      "executed_at": 1706843369274,
      "finalized_at": 1706843414080,
      "exec_result": {
        "gas_amount_total": {
          "bandwidth": {
            "service": 0,
            "app": {
              "openai_ainize3": 101
            }
          },
          "state": {
            "service": 0,
            "app": {
              "openai_ainize3": 806
            }
          }
        },
        "gas_cost_total": 0,
        "func_results": {
          "service-trigger": {
            "code": 0,
            "bandwidth_gas_amount": 100
          }
        },
        "code": 0,
        "bandwidth_gas_amount": 1,
        "gas_amount_charged": 0
      },
      "transaction": {
        "tx_body": {
          "operation": {
            "type": "SET_VALUE",
            "ref": "/apps/openai_ainize3/service/0x7ed9c30C9F3A31Daa9614b90B4a710f61Bd585c0/1706843368851/request",
            "value": {
              "assistantId": "asst_jU5mgKHZgw61MKP2mVev0KAA",
              "jobType": "delete_assistant"
            }
          },
          "nonce": -1,
          "timestamp": 1706843368852,
          "gas_price": 500
        },
        "signature": "0x5d4c7de40b158024e2c351460dcbdaea06ced92e623b22930f27ef871dbc84018f207a2a0f41b2fbba4bd3a04a4a687ed43484418547ef1a70847830fa0b0b747d64f52f53776fc7d2d3e2615b011adafc56b9abb941296e1fce87330292b5151c",
        "hash": "0x5d4c7de40b158024e2c351460dcbdaea06ced92e623b22930f27ef871dbc8401",
        "address": "0x7ed9c30C9F3A31Daa9614b90B4a710f61Bd585c0"
      },
      "receipt": {
        "code": 0,
        "gas_amount_charged": 0,
        "gas_cost_total": 0
      }
    },
    "protoVer": "1.1.3"
  }
}
```

### ain_getTransactionByBlockHashAndIndex

Returns the transaction at the {index} position in the block with the {block_hash}.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- block_hash: `String` - block hash
- index: `Number` - index of the transaction within the block

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
    "protoVer": "1.1.3",
    "block_hash": "0x406f4a46cf8434c59777ee73e1834b0109950b74159100ab7920a7a53e9f50af",
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
            "ref": "/apps/openai_ainize3/service/0x7ed9c30C9F3A31Daa9614b90B4a710f61Bd585c0/1706843368851/request",
            "value": {
              "assistantId": "asst_jU5mgKHZgw61MKP2mVev0KAA",
              "jobType": "delete_assistant"
            }
          },
          "nonce": -1,
          "timestamp": 1706843368852,
          "gas_price": 500
        },
        "signature": "0x5d4c7de40b158024e2c351460dcbdaea06ced92e623b22930f27ef871dbc84018f207a2a0f41b2fbba4bd3a04a4a687ed43484418547ef1a70847830fa0b0b747d64f52f53776fc7d2d3e2615b011adafc56b9abb941296e1fce87330292b5151c",
        "hash": "0x5d4c7de40b158024e2c351460dcbdaea06ced92e623b22930f27ef871dbc8401",
        "address": "0x7ed9c30C9F3A31Daa9614b90B4a710f61Bd585c0"
      },
      "is_executed": true,
      "is_finalized": true
    },
    "protoVer": "1.1.3"
  }
}
```

### ain_getTransactionByBlockNumberAndIndex

Returns the transaction at the {index} position within the block with the {block_number}.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- block_number: `Number` - block number
- index: `Number` - index of the transaction within the block
    
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
    "protoVer": "1.1.3",
    "block_number": 3286991,
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
            "ref": "/apps/openai_ainize3/service/0x7ed9c30C9F3A31Daa9614b90B4a710f61Bd585c0/1706843368851/request",
            "value": {
              "assistantId": "asst_jU5mgKHZgw61MKP2mVev0KAA",
              "jobType": "delete_assistant"
            }
          },
          "nonce": -1,
          "timestamp": 1706843368852,
          "gas_price": 500
        },
        "signature": "0x5d4c7de40b158024e2c351460dcbdaea06ced92e623b22930f27ef871dbc84018f207a2a0f41b2fbba4bd3a04a4a687ed43484418547ef1a70847830fa0b0b747d64f52f53776fc7d2d3e2615b011adafc56b9abb941296e1fce87330292b5151c",
        "hash": "0x5d4c7de40b158024e2c351460dcbdaea06ced92e623b22930f27ef871dbc8401",
        "address": "0x7ed9c30C9F3A31Daa9614b90B4a710f61Bd585c0"
      },
      "is_executed": true,
      "is_finalized": true
    },
    "protoVer": "1.1.3"
  }
}
```

### ain_sendSignedTransactionDryrun

Sends a transaction body and its signature to the blockchain node as a dryrun.
 
**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- tx_body: `Object`  - transaction body object (see [ain_sendSignedTransaction](#ain_sendsignedtransaction) for the details)
- signature: `String` - signature of the transaction

**Returns**

`Object` - the transaction hash and the execution result from the dryrun.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_sendSignedTransactionDryrun",
  "params": {
    "protoVer": "1.1.3",
    "signature": "0x40a183b409b54a6d0cb7a68853a05c41af0b9fccf442b9249fde64ff62bc6e54072e60fea9b591130b7a17838db05ef8d50782ada6251064256f517bbb85ed7b09e5bbec43ab1a3724a4df4e4088b1392336d371ce6a8881f6d0e080b4304d701b",
    "tx_body": {
      "operation": {
        "type": "SET_VALUE",
        "ref": "/transfer/0xb16DF4D61Aa206096FE2E705497B91951852989F/0xEfa713E7f2C0cE5f89ae746e91DD476979967EBD/1706853750720/value",
        "value": 10
      },
      "gas_price": 500,
      "timestamp": 1706853750720,
      "nonce": -1
    }
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
      "tx_hash": "0x40a183b409b54a6d0cb7a68853a05c41af0b9fccf442b9249fde64ff62bc6e54",
      "result": {
        "gas_amount_total": {
          "bandwidth": {
            "service": 3
          },
          "state": {
            "service": 364
          }
        },
        "gas_cost_total": 0.1835,
        "func_results": {
          "_transfer": {
            "op_results": {
              "0": {
                "path": "/accounts/0xb16DF4D61Aa206096FE2E705497B91951852989F/balance",
                "result": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              },
              "1": {
                "path": "/accounts/0xEfa713E7f2C0cE5f89ae746e91DD476979967EBD/balance",
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
        "bandwidth_gas_amount": 1,
        "is_dryrun": true,
        "gas_amount_charged": 367
      }
    },
    "protoVer": "1.1.3"
  }
}
```

### ain_sendSignedTransaction

Sends a transaction body and its signature to the blockchain node.
 
**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- tx_body: `Object`  - transaction body object with properties:
  - operation: `Object` - transaction operation with properties:
    - type: `String` - "SET_VALUE" | "SET_RULE" | "SET_FUNCTION" | "SET_OWNER" | "SET". When type = "SET", op_list is used instead of ref and value.
    - ref: `String` - reference path to get a value/rule/owner/function of. Only required if the type is not "SET".
    - value: `Any` - value/rule/function/owner to set
    - op_list: `Array` - array of set operations ({ type, ref, value }). Only required if the type is "SET".
  - timestamp: `Number(<Non-negative Integer>)` - timestamp when the transaction was created
  - nonce: `-2|-1|Number(<Non-negative Integer>)` - nonce value where `-2` means _ordered_ transaction, `-1` means _unordered_ transaction (using timestamp), and `Number` means _numbered (or indexed)_ transaction (like the Ethereum Network).
  - gas_price: `Number(<Non-negative Integer>)` - gas price value in micro unit (10<sup>-6</sup>) to apply to compute the gas cost of the transaction. The gas cost computation rule is _gas_cost_ = _gas_amount_ x _gas_price_ x _10<sup>6</sup>_ where the gas amount is the basically the number of DB write operations of the transaction and gas cost is charged in AIN unit.
- signature: `String` - signature of the transaction

**Returns**

`Object` - the transaction hash and the execution result.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_sendSignedTransaction",
  "params": {
    "protoVer": "1.1.3",
    "signature": "0x40a183b409b54a6d0cb7a68853a05c41af0b9fccf442b9249fde64ff62bc6e54072e60fea9b591130b7a17838db05ef8d50782ada6251064256f517bbb85ed7b09e5bbec43ab1a3724a4df4e4088b1392336d371ce6a8881f6d0e080b4304d701b",
    "tx_body": {
      "operation": {
        "type": "SET_VALUE",
        "ref": "/transfer/0xb16DF4D61Aa206096FE2E705497B91951852989F/0xEfa713E7f2C0cE5f89ae746e91DD476979967EBD/1706853750720/value",
        "value": 10
      },
      "gas_price": 500,
      "timestamp": 1706853750720,
      "nonce": -1
    }
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
      "tx_hash": "0x40a183b409b54a6d0cb7a68853a05c41af0b9fccf442b9249fde64ff62bc6e54",
      "result": {
        "gas_amount_total": {
          "bandwidth": {
            "service": 3
          },
          "state": {
            "service": 364
          }
        },
        "gas_cost_total": 0.1835,
        "func_results": {
          "_transfer": {
            "op_results": {
              "0": {
                "path": "/accounts/0xb16DF4D61Aa206096FE2E705497B91951852989F/balance",
                "result": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              },
              "1": {
                "path": "/accounts/0xEfa713E7f2C0cE5f89ae746e91DD476979967EBD/balance",
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
        "bandwidth_gas_amount": 1,
        "gas_amount_charged": 367
      }
    },
    "protoVer": "1.1.3"
  }
}
```

### ain_sendSignedTransactionBatch

Sends multiple transactions at once to the blockchain node.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- tx_list: `Array` - an array of objects with signature and transaction body (see [ain_sendSignedTransaction](#ain_sendsignedtransaction) for the details) 

**Returns**

`Array` - an array of the transaction hashes and the execution results.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_sendSignedTransactionBatch", 
  "params": {
    "protoVer": "1.1.3",
    "tx_list": [
      {
        "signature": "0xaabc9ddafffb2ae0bac4107697547d22d9383...",
        "tx_body": {
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
        "tx_body": {
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
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": [
      {
        "tx_hash": "0x88df016429689c079f3b2f6ad39fa052532c56795b733da7...",
        "result": {
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 367,
          "gas_amount_total": {
            ...
          },
          "gas_cost_total": 0.1835,
          "func_results": {
            ...
          }
        }
      },
      {
        "tx_hash": "0x8e4340ea3983d86e4b6c44249362f716ec9e09849ef9b6e3...",
        "result": {
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 367,
          "gas_amount_total": {
            ...
          },
          "gas_cost_total": 0.1835,
          "func_results": {
            ...
          }
        }
      }
    ],
    "protoVer": "1.1.3"
  }
}
```

---

## Block API

### ain_getLastBlock

Returns the last block.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version

**Returns**

`Object` - The last block. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getLastBlock",
  "params": {
    "protoVer": "1.1.3"
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
      "last_votes": [
        ...
      ],
      "evidence": {},
      "transactions": [],
      "receipts": [],
      "last_hash": "0x79a17e333d600d234e0eabe103288eeb3fd01f9c0227dd66fd5ad037af07331d",
      "last_votes_hash": "0x934f7d6b833aa268d7c67af0a75d10ab0fe916f746979b94446c802b31d93768",
      "evidence_hash": "0xd35126dcb36a3c4b4ef04c4eff63edecbc9eacff867d1c348c1abaf82567a8f8",
      "transactions_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
      "receipts_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
      "number": 3300494,
      "epoch": 3305917,
      "timestamp": 1707113548716,
      "state_proof_hash": "0xfc95cc439ea82935eb739a94cdc655cee15266dc6254844d5d92585ccf320592",
      "proposer": "0x003AD6FdB06684175e7D95EcC36758B014517E4b",
      "validators": {
        ...
      },
      "gas_amount_total": 0,
      "gas_cost_total": 0,
      "hash": "0x1656a691b9b2007d6f16dc7127f4cdb7f461303cb240c42bc0d6b6016bd5d9f8",
      "size": 11888
    },
    "protoVer": "1.1.3"
  }
}
```

## ain_getLastBlockNumber

Returns the last block number.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version

**Returns**

`Number` - The last block number. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getLastBlockNumber",
  "params": {
    "protoVer": "1.1.3"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": 3300526,
    "protoVer": "1.1.3"
  }
}
```

## ain_getBlockByNumber

Returns the block with the given block number.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- number: `Number` - the block number
- getFullTransactions: `Boolean` - if true, it returns full transaction objects; if false or undefined, it returns the transaction hashes only.

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
    "protoVer": "1.1.3",
    "number": 3300526,
    "getFullTransactions": true
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
      "last_votes": [
        ...
      ],
      "evidence": {},
      "transactions": [],
      "receipts": [],
      "last_hash": "0xe4ec974b210f26f66a0b005a87ea4ea8b74e507ece9ae4219a130fca19c1f15f",
      "last_votes_hash": "0x670bd883418c7b14847dbc315a3a0b4ea23cad091667d5807005026bae7c1600",
      "evidence_hash": "0xd35126dcb36a3c4b4ef04c4eff63edecbc9eacff867d1c348c1abaf82567a8f8",
      "transactions_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
      "receipts_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
      "number": 3300526,
      "epoch": 3305949,
      "timestamp": 1707114196712,
      "state_proof_hash": "0x5966358621862d6f29926921738381944e77365df449b898aaed309090a849e7",
      "proposer": "0x004A2550661c8a306207C9dabb279d5701fFD66e",
      "validators": {
        ...
      },
      "gas_amount_total": 0,
      "gas_cost_total": 0,
      "hash": "0xfb3f0cf12c57238c509cc0abeed503cc1eb837b67840210fe8ec0bd4ce96b8d9",
      "size": 11888
    },
    "protoVer": "1.1.3"
  }
}
```

## ain_getBlockByHash

Returns the block with the specified block hash.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- hash: `String` - block hash
- getFullTransactions: `Boolean` - if true, it returns full transaction objects; if false or undefined, it returns the transaction hashes only.

**Returns**

`Object` - The block object.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getBlockByHash",
  "params": {
    "protoVer": "1.1.3",
    "hash": "0xfb3f0cf12c57238c509cc0abeed503cc1eb837b67840210fe8ec0bd4ce96b8d9",
    "getFullTransactions": true
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
      "last_votes": [
        ...
      ],
      "evidence": {},
      "transactions": [],
      "receipts": [],
      "last_hash": "0xe4ec974b210f26f66a0b005a87ea4ea8b74e507ece9ae4219a130fca19c1f15f",
      "last_votes_hash": "0x670bd883418c7b14847dbc315a3a0b4ea23cad091667d5807005026bae7c1600",
      "evidence_hash": "0xd35126dcb36a3c4b4ef04c4eff63edecbc9eacff867d1c348c1abaf82567a8f8",
      "transactions_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
      "receipts_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
      "number": 3300526,
      "epoch": 3305949,
      "timestamp": 1707114196712,
      "state_proof_hash": "0x5966358621862d6f29926921738381944e77365df449b898aaed309090a849e7",
      "proposer": "0x004A2550661c8a306207C9dabb279d5701fFD66e",
      "validators": {
        ...
      },
      "gas_amount_total": 0,
      "gas_cost_total": 0,
      "hash": "0xfb3f0cf12c57238c509cc0abeed503cc1eb837b67840210fe8ec0bd4ce96b8d9",
      "size": 11888
    },
    "protoVer": "1.1.3"
  }
}
```

## ain_getBlockList

Returns a list of blocks that have a block number between "from" block number and "to" block number.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- from: `Number` - the block number of the starting block
- to: `Number` - the block number of the last block to get
 
**Returns**

`Array` - The list of blocks.
 
**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getBlockList",
  "params": {
    "protoVer": "1.1.3",
    "from": 3300526,
    "to": 3300528
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
        "last_votes": [
          ...
        ],
        "evidence": {},
        "transactions": [],
        "receipts": [],
        "last_hash": "0xe4ec974b210f26f66a0b005a87ea4ea8b74e507ece9ae4219a130fca19c1f15f",
        "last_votes_hash": "0x670bd883418c7b14847dbc315a3a0b4ea23cad091667d5807005026bae7c1600",
        "evidence_hash": "0xd35126dcb36a3c4b4ef04c4eff63edecbc9eacff867d1c348c1abaf82567a8f8",
        "transactions_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
        "receipts_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
        "number": 3300526,
        "epoch": 3305949,
        "timestamp": 1707114196712,
        "state_proof_hash": "0x5966358621862d6f29926921738381944e77365df449b898aaed309090a849e7",
        "proposer": "0x004A2550661c8a306207C9dabb279d5701fFD66e",
        "validators": {
          ...
        },
        "gas_amount_total": 0,
        "gas_cost_total": 0,
        "hash": "0xfb3f0cf12c57238c509cc0abeed503cc1eb837b67840210fe8ec0bd4ce96b8d9",
        "size": 11888
      },
      {
        "last_votes": [
          ...
        ],
        "evidence": {},
        "transactions": [],
        "receipts": [],
        "last_hash": "0xfb3f0cf12c57238c509cc0abeed503cc1eb837b67840210fe8ec0bd4ce96b8d9",
        "last_votes_hash": "0x204b100233731f4b6e8cd8e260d3bb427ff8337764429f37a92262c8018de8b1",
        "evidence_hash": "0xd35126dcb36a3c4b4ef04c4eff63edecbc9eacff867d1c348c1abaf82567a8f8",
        "transactions_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
        "receipts_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
        "number": 3300527,
        "epoch": 3305950,
        "timestamp": 1707114216713,
        "state_proof_hash": "0xd187d996f1106468f4dbba9f535112f7d3c30faee78bc1eb259fafa33dd9a5db",
        "proposer": "0x004A2550661c8a306207C9dabb279d5701fFD66e",
        "validators": {
          ...
        },
        "gas_amount_total": 0,
        "gas_cost_total": 0,
        "hash": "0xf0f5e395461d9ad197bf7b8a10722be993dd7a564af2e3e84431764eff9734ee",
        "size": 11888
      }
    ],
    "protoVer": "1.1.3"
  }
}
```

## ain_getBlockHeadersList

Returns a list of block headers that have a block number between "from" block number and "to" block number.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- from: `Number` - the block number of the starting block
- to: `Number` - the block number of the last block to get
 
**Returns**

`Array` - The list of block headers.
 
**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getBlockHeadersList",
  "params": {
    "protoVer": "1.1.3",
    "from": 3300526,
    "to": 3300528
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
        "last_hash": "0xe4ec974b210f26f66a0b005a87ea4ea8b74e507ece9ae4219a130fca19c1f15f",
        "last_votes_hash": "0x670bd883418c7b14847dbc315a3a0b4ea23cad091667d5807005026bae7c1600",
        "transactions_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
        "receipts_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
        "evidence_hash": "0xd35126dcb36a3c4b4ef04c4eff63edecbc9eacff867d1c348c1abaf82567a8f8",
        "number": 3300526,
        "epoch": 3305949,
        "timestamp": 1707114196712,
        "state_proof_hash": "0x5966358621862d6f29926921738381944e77365df449b898aaed309090a849e7",
        "proposer": "0x004A2550661c8a306207C9dabb279d5701fFD66e",
        "validators": {
          ...
        },
        "gas_amount_total": 0,
        "gas_cost_total": 0
      },
      {
        "last_hash": "0xfb3f0cf12c57238c509cc0abeed503cc1eb837b67840210fe8ec0bd4ce96b8d9",
        "last_votes_hash": "0x204b100233731f4b6e8cd8e260d3bb427ff8337764429f37a92262c8018de8b1",
        "transactions_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
        "receipts_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
        "evidence_hash": "0xd35126dcb36a3c4b4ef04c4eff63edecbc9eacff867d1c348c1abaf82567a8f8",
        "number": 3300527,
        "epoch": 3305950,
        "timestamp": 1707114216713,
        "state_proof_hash": "0xd187d996f1106468f4dbba9f535112f7d3c30faee78bc1eb259fafa33dd9a5db",
        "proposer": "0x004A2550661c8a306207C9dabb279d5701fFD66e",
        "validators": {
          ...
        },
        "gas_amount_total": 0,
        "gas_cost_total": 0
      }
    ],
    "protoVer": "1.1.3"
  }
}
```

## ain_getBlockTransactionCountByNumber

Returns the number of transactions in the block with the specified block number.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- number: `Number` - block number 

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
    "protoVer": "1.1.3",
    "number": 3300526
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": 0,
    "protoVer": "1.1.3"
  }
}
```

## ain_getBlockTransactionCountByHash

Returns the number of transactions in the block with the specified block hash. 

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- hash: `String` - block hash 

**Returns**

`Number` - Number of transactions

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_getBlockTransactionCountByHash",
  "params": {
    "protoVer": "1.1.3",
    "hash": "0xfb3f0cf12c57238c509cc0abeed503cc1eb837b67840210fe8ec0bd4ce96b8d9"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": 0,
    "protoVer": "1.1.3"
  }
}
```

---

## Blockchain Node API

### ain_getValidatorInfo

Returns the information of the given block validator.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- address: `String` - address of the block validator's account, which should be a checksum address

**Returns**

`Object` - The validator's information. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1, 
  "method": "ain_getValidatorInfo",
  "params": {
    "protoVer": "1.1.3",
    "address": "0x001Ac309EFFFF6d307CbC2d09C811aCD7dD8A35d"
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
      "address": "0x001Ac309EFFFF6d307CbC2d09C811aCD7dD8A35d",
      "isWhitelisted": true,
      "stake": 10000000
    },
    "protoVer": "1.1.3"
  }
}
```

## ain_getValidatorsByNumber

Returns the validators who validated the block.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- number: `Number` - block number 

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
    "protoVer": "1.1.3",
    "number": 3313267
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
      "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4": {
        "stake": 10000000,
        "proposal_right": true
      },
      "0x003AD6FdB06684175e7D95EcC36758B014517E4b": {
        "stake": 10000000,
        "proposal_right": true
      },
      "0x001Ac309EFFFF6d307CbC2d09C811aCD7dD8A35d": {
        "stake": 10000000,
        "proposal_right": true
      },
      "0x004A2550661c8a306207C9dabb279d5701fFD66e": {
        "stake": 10000000,
        "proposal_right": true
      },
      "0x002A273ECd3aAEc4d8748f4E06eAdE3b34d83211": {
        "stake": 10000000,
        "proposal_right": true
      },
      "0x009A97c0cF07fdbbcdA1197aE11792258b6EcedD": {
        "stake": 100000,
        "proposal_right": false
      },
      "0x008AeBc041B7ceABc53A4cf393ccF16c10c29dba": {
        "stake": 100000,
        "proposal_right": false
      },
      "0x007Ac58EAc5F0D0bDd10Af8b90799BcF849c2E74": {
        "stake": 100000,
        "proposal_right": false
      },
      "0x006Af719E197bC81BBb75d2fec7Ea217D1750bAe": {
        "stake": 100000,
        "proposal_right": false
      },
      "0x005A3c55EcE1A593b761D408B6E6BC778E0a638B": {
        "stake": 100000,
        "proposal_right": false
      }
    },
    "protoVer": "1.1.3"
  }
}
```

## ain_getValidatorsByHash

Returns the validators who validated the block. 

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- hash: `String` - block hash 

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
    "protoVer": "1.1.3",
    "hash": "0x3e1a023e77ad5b909ce3610b2dad921c3b0a5cae33e75676470c8f75eb08860c"
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
      "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4": {
        "stake": 10000000,
        "proposal_right": true
      },
      "0x003AD6FdB06684175e7D95EcC36758B014517E4b": {
        "stake": 10000000,
        "proposal_right": true
      },
      "0x001Ac309EFFFF6d307CbC2d09C811aCD7dD8A35d": {
        "stake": 10000000,
        "proposal_right": true
      },
      "0x004A2550661c8a306207C9dabb279d5701fFD66e": {
        "stake": 10000000,
        "proposal_right": true
      },
      "0x002A273ECd3aAEc4d8748f4E06eAdE3b34d83211": {
        "stake": 10000000,
        "proposal_right": true
      },
      "0x009A97c0cF07fdbbcdA1197aE11792258b6EcedD": {
        "stake": 100000,
        "proposal_right": false
      },
      "0x008AeBc041B7ceABc53A4cf393ccF16c10c29dba": {
        "stake": 100000,
        "proposal_right": false
      },
      "0x007Ac58EAc5F0D0bDd10Af8b90799BcF849c2E74": {
        "stake": 100000,
        "proposal_right": false
      },
      "0x006Af719E197bC81BBb75d2fec7Ea217D1750bAe": {
        "stake": 100000,
        "proposal_right": false
      },
      "0x005A3c55EcE1A593b761D408B6E6BC778E0a638B": {
        "stake": 100000,
        "proposal_right": false
      }
    },
    "protoVer": "1.1.3"
  }
}
```

## ain_getProposerByNumber

Returns the proposer who produced the block with the given block number.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- number: `Number` - block number 

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
    "protoVer": "1.1.3",
    "number": 3313267
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": "0x001Ac309EFFFF6d307CbC2d09C811aCD7dD8A35d",
    "protoVer": "1.1.3"
  }
}
```

## ain_getProposerByHash

Returns the proposer who produced the block with the given block hash. 

**Parameters**

An object with properties:

- protoVer: `String` - protocol version
- hash: `String` - block hash 

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
    "protoVer": "1.1.3",
    "hash": "0x3e1a023e77ad5b909ce3610b2dad921c3b0a5cae33e75676470c8f75eb08860c"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": "0x001Ac309EFFFF6d307CbC2d09C811aCD7dD8A35d",
    "protoVer": "1.1.3"
  }
}
```

---

## Network API

### net_getNetworkId

Returns the blockchain node's network id.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version

**Returns**

`Number` - the network id.

-   0: mainnet network
-   1: testnet network
    
**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "net_getNetworkId",
  "params": {
    "protoVer": "1.1.3"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": 0,
    "protoVer": "1.1.3"
  }
}
```

### net_getChainId

Returns the blockchain node's chain id.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version

**Returns**

`Number` - the chain id.

-   0: mainnet chain
-   1: testnet chain
    
**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "net_getChainId",
  "params": {
    "protoVer": "1.1.3"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": 0,
    "protoVer": "1.1.3"
  }
}
```

### net_listening

Returns whether the node is listening for network connections.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version

**Returns**

`Boolean` - true is the node is listening for connections; otherwise, false. 

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "net_listening",
  "params": {
    "protoVer": "1.1.3"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": true,
    "protoVer": "1.1.3"
  }
}
```

### net_syncing

Returns whether the node is syncing with the network or not.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version

**Returns**

`Boolean` - true if the node is syncing, false otherwise.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "net_syncing",
  "params": {
    "protoVer": "1.1.3"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": false,
    "protoVer": "1.1.3"
  }
}
```

### net_peerCount

Returns the number of peers the node is connected to.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version

**Returns**

`Number` - number of peers.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "net_peerCount",
  "params": {
    "protoVer": "1.1.3"
  }
}'
```

Response
```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "result": 3,
    "protoVer": "1.1.3"
  }
}
```

### net_consensusStatus

Returns the blockchain node's consensus status.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version

**Returns**

`Object` - an object containing the consensus status.

- `STARTING`: consensus process starting
- `RUNNING`: consensus process running
- `STOPPED`: consensus process stopped

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "net_consensusStatus",
  "params": {
    "protoVer": "1.1.3"
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
      "health": true,
      "state": "RUNNING",
      "stateNumeric": 1,
      "epoch": 3339699,
      "isInEpochTransition": false,
      "validators": {
        "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4": {
          "stake": 10000000,
          "proposal_right": true,
          "voting_right": true
        },
        ...
      },
      "globalTimeSyncStatus": {
        "averageNTPDelta": 0.25,
        "averageNTPLatency": 14,
        "minimalNTPLatencyDelta": 13,
        "minimalNTPLatency": 6,
        "totalSampleCount": 4,
        "syncedAt": 1707789022964
      },
      "rewards": {
        "unclaimed": 1690211.830771636,
        "cumulative": 1690211.830771636
      }
    },
    "protoVer": "1.1.3"
  }
}
```

### net_rawConsensusStatus

Returns the blockchain node's raw consensus status.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version

**Returns**

`Object` - an object containing the raw consensus status.

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "net_rawConsensusStatus",
  "params": {
    "protoVer": "1.1.3"
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
      "consensus": {
        "epoch": 3339714,
        "proposer": "0x002A273ECd3aAEc4d8748f4E06eAdE3b34d83211",
        "state": "RUNNING"
      },
      "block_pool": {
        "hashToBlockInfo": {
          "0xcdc74d17d84ed8b75c5ed4a02d54c3c6011c2d7f7ce7f5b6dd9a0b82b8a4a20c": {
            "block": {
              "last_votes": [
                {
                  "tx_body": {
                    "operation": {
                      "type": "SET",
                      "op_list": [
                        {
                          "type": "SET_VALUE",
                          "ref": "/consensus/number/3334275/propose",
                          "value": {
                            "number": 3334275,
                            "epoch": 3339711,
                            "validators": {
                              "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4": {
                                "stake": 10000000,
                                "proposal_right": true
                              },
                              ...
                            },
                            "total_at_stake": 50500000,
                            "proposer": "0x003AD6FdB06684175e7D95EcC36758B014517E4b",
                            "block_hash": "0x6b148d07060f58bdd8301416f9df9b1225591297ec4eeceff9c1de19748e4a38",
                            "last_hash": "0xc62c681c7d9015505cf2ce01c5a1251e4fb6d56b25069fbaa91d7561d99314fa",
                            "timestamp": 1707789435127,
                            "gas_cost_total": 0
                          }
                        }
                      ]
                    },
                    "nonce": -1,
                    "gas_price": 0,
                    "timestamp": 1707789435176
                  },
                  "signature": "0x19f276213d95bcb4d3a6ff52a105b0bc711d9d742af568d11ddc007cd0bf2b136dbc4d77e0d2709fdf8fa3b360f4500407f2ccbfa8c83658f24cb864065332c853f2ae50b4c54c960c999ddb9efd2c71126ed91ba605270d41dffca60d0271cb1c",
                  "hash": "0x19f276213d95bcb4d3a6ff52a105b0bc711d9d742af568d11ddc007cd0bf2b13",
                  "address": "0x003AD6FdB06684175e7D95EcC36758B014517E4b"
                },
                ...
              ],
              "evidence": {},
              "transactions": [],
              "receipts": [],
              "last_hash": "0x6b148d07060f58bdd8301416f9df9b1225591297ec4eeceff9c1de19748e4a38",
              "last_votes_hash": "0xe9f92185d91193a9c253e9953a126bb29838bb3c18ffcbfc513633c23ed739eb",
              "evidence_hash": "0xd35126dcb36a3c4b4ef04c4eff63edecbc9eacff867d1c348c1abaf82567a8f8",
              "transactions_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
              "receipts_hash": "0x853fb99c831d4952ff90b897bd7d7c5c2f3747e8eda8ad13e7359b731eadc299",
              "number": 3334276,
              "epoch": 3339712,
              "timestamp": 1707789453632,
              "state_proof_hash": "0x4771b8960f7e3d332729f7238aafe418179daca65ddba2471aa2f2edd6dc93fb",
              "proposer": "0x004A2550661c8a306207C9dabb279d5701fFD66e",
              "validators": {
                "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4": {
                  "stake": 10000000,
                  "proposal_right": true
                },
                ...
              },
              "gas_amount_total": 0,
              "gas_cost_total": 0,
              "hash": "0xcdc74d17d84ed8b75c5ed4a02d54c3c6011c2d7f7ce7f5b6dd9a0b82b8a4a20c",
              "size": 11888
            },
            "proposal": {
              "tx_body": {
                "operation": {
                  "type": "SET",
                  "op_list": [
                    {
                      "type": "SET_VALUE",
                      "ref": "/consensus/number/3334276/propose",
                      "value": {
                        "number": 3334276,
                        "epoch": 3339712,
                        "validators": {
                          "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4": {
                            "stake": 10000000,
                            "proposal_right": true
                          },
                          ...
                        },
                        "total_at_stake": 50500000,
                        "proposer": "0x004A2550661c8a306207C9dabb279d5701fFD66e",
                        "block_hash": "0xcdc74d17d84ed8b75c5ed4a02d54c3c6011c2d7f7ce7f5b6dd9a0b82b8a4a20c",
                        "last_hash": "0x6b148d07060f58bdd8301416f9df9b1225591297ec4eeceff9c1de19748e4a38",
                        "timestamp": 1707789453632,
                        "gas_cost_total": 0
                      }
                    }
                  ]
                },
                "nonce": -1,
                "gas_price": 0,
                "timestamp": 1707789453675
              },
              "signature": "0x88cb6d7433691e59995bffa619515df098bb228a6bad46e75017a948b74166ab303e2e09e94fbe2c499cd4fb3329250f6f4390b32478750cd2e48e6468b398a76003e668a9208432f1f2b2212ad806c2ef8d1b22dd927fc3e8ba29570a000cb91c",
              "hash": "0x88cb6d7433691e59995bffa619515df098bb228a6bad46e75017a948b74166ab",
              "address": "0x004A2550661c8a306207C9dabb279d5701fFD66e"
            },
            "votes": [
              {
                "tx_body": {
                  "operation": {
                    "type": "SET_VALUE",
                    "ref": "/consensus/number/3334276/0xcdc74d17d84ed8b75c5ed4a02d54c3c6011c2d7f7ce7f5b6dd9a0b82b8a4a20c/vote/0x000AF024FEDb636294867bEff390bCE6ef9C5fc4",
                    "value": {
                      "block_hash": "0xcdc74d17d84ed8b75c5ed4a02d54c3c6011c2d7f7ce7f5b6dd9a0b82b8a4a20c",
                      "stake": 10000000,
                      "is_against": false,
                      "vote_nonce": 1707789453959
                    }
                  },
                  "nonce": -1,
                  "gas_price": 0,
                  "timestamp": 1707789453959
                },
                "signature": "0x88d0589161197857d0ca90a004674fb39d87556d67b5065a2cae0e2720688f2dead4c555eeca90b5c64c433adcff740870644cd4b30f912efb4e7cd9ca6704d775bf08dd8ec595e235fe3663ef329f3b24b87f793427d0f5534fc4c452ea18cf1c",
                "hash": "0x88d0589161197857d0ca90a004674fb39d87556d67b5065a2cae0e2720688f2d",
                "address": "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4"
              },
              ...
            ],
            "tallied": 50000000,
            "notarized": true
          },
          ...
        },
        "hashToInvalidBlockInfo": {},
        "hashToDb": [
          "0xcdc74d17d84ed8b75c5ed4a02d54c3c6011c2d7f7ce7f5b6dd9a0b82b8a4a20c",
          "0xf45a08f6a6859f4fe3cd712beb07d11e633adb2eccc608c0ce71601b06e08390"
        ],
        "hashToNextBlockSet": {
          "0x0d595aabdf8105a2e147d92c1ad263302eea1783bebba67d5295cccb3affba3f": [
            "0x89045524ffed88d8e04d942269a249463951627eb5ee9bdd6da4a7f8ae902f09"
          ],
          "0xcdc74d17d84ed8b75c5ed4a02d54c3c6011c2d7f7ce7f5b6dd9a0b82b8a4a20c": [
            "0xf45a08f6a6859f4fe3cd712beb07d11e633adb2eccc608c0ce71601b06e08390"
          ]
        },
        "epochToBlock": [
          3339712,
          3339713
        ],
        "numberToBlockSet": [
          3334276,
          "3334276",
          3334277,
          "3334277"
        ],
        "longestNotarizedChainTips": [
          "0xf45a08f6a6859f4fe3cd712beb07d11e633adb2eccc608c0ce71601b06e08390"
        ]
      }
    },
    "protoVer": "1.1.3"
  }
}
```

### p2p_getPeerCandidateInfo

Returns the blockchain node's peer candidate information.

**Parameters**

An object with properties:

- protoVer: `String` - protocol version

**Returns**

`Object` - an object containing the peer candidate information.

- `STARTING`: p2p connection starting
- `EXPANDING`: p2p connection expanding 
- `STEADY`: p2p connection steady

**Example**

Request
```
curl https://testnet-api.ainetwork.ai/json-rpc -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "p2p_getPeerCandidateInfo",
  "params": {
    "protoVer": "1.1.3"
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
      "address": "0x000AF024FEDb636294867bEff390bCE6ef9C5fc4",
      "isAvailableForConnection": true,
      "networkStatus": {
        "urls": {
          "ip": "35.221...",
          "p2p": {
            "url": "ws://35.221...:5000/",
            "port": 5000
          },
          "clientApi": {
            "url": "http://35.221...:8080/",
            "port": 8080
          },
          "jsonRpc": {
            "url": "http://35.221...:8080/json-rpc",
            "port": 8080
          }
        },
        "connectionStatus": {
          "state": "STEADY",
          "stateNumeric": 2,
          "isConnectingToPeerCandidates": false,
          "peerConnectionStartedAt": 1707790289596,
          "peerConnectionElapsedTime": 155538,
          "maxInbound": 6,
          "targetOutBound": 3,
          "peerConnectionsInProgress": [],
          "peerCandidates": [
            "http://35.221...:8080/json-rpc",
            "http://35.199...:8080/json-rpc",
            "http://35.223...:8080/json-rpc",
            "http://35.240...:8080/json-rpc",
            "http://34.90...:8080/json-rpc",
            "http://34.80...:8080/json-rpc",
            "http://23.88...:8080/json-rpc"
          ],
          "numInbound": 3,
          "numOutbound": 3,
          "numConnections": 6,
          "numPeerConnectionsInProgress": 0,
          "numPeerCandidates": 7,
          "incomingPeers": [
            "0xA20D01638DB479bc5a4cC90577CB7A61D2EB22FE",
            "0x004A2550661c8a306207C9dabb279d5701fFD66e",
            "0x76F114dAC5593f671E965DE5912D73dBe7215D5E"
          ],
          "outgoingPeers": [
            "0xA20D01638DB479bc5a4cC90577CB7A61D2EB22FE",
            "0x004A2550661c8a306207C9dabb279d5701fFD66e",
            "0x76F114dAC5593f671E965DE5912D73dBe7215D5E"
          ]
        }
      },
      "peerCandidateJsonRpcUrlList": {
        "0xA20D01638DB479bc5a4cC90577CB7A61D2EB22FE": "http://23.88...:8080/json-rpc",
        "0x004A2550661c8a306207C9dabb279d5701fFD66e": "http://34.90...:8080/json-rpc",
        "0x76F114dAC5593f671E965DE5912D73dBe7215D5E": "http://34.80...:8080/json-rpc"
      }
    },
    "protoVer": "1.1.3"
  }
}
```

---
