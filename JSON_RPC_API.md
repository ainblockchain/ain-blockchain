# AIN Blockchain JSON-RPC API

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
curl -X POST --header 'Content-Type: application/json' --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getPendingTransactions",
  "params": {
    "protoVer": "1.0.9"
  }
}' https://testnet-api.ainetwork.ai/json-rpc
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
curl -X POST --header 'Content-Type: application/json' --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getTransactionByBlockNumberAndIndex",
  "params": {
    "protoVer": "1.0.9",
    "block_number": 1018739,
    "index": 1
  }
}' https://testnet-api.ainetwork.ai/json-rpc
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
curl -X POST --header 'Content-Type: application/json' --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getTransactionByBlockHashAndIndex",
  "params": {
    "protoVer": "1.0.9",
    "block_hash": "0x38635f8c1b3ecfaa8314698ac241341dc3ba82bc1d26e4fb5c20e21fe9ce2645",
    "index": 0
  }
}' https://testnet-api.ainetwork.ai/json-rpc
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
curl -X POST --header 'Content-Type: application/json' --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ain_getTransactionByHash",
  "params": {
    "protoVer": "1.0.9",
    "hash": "0xa38fabd1daa7d7d0488275d146bebcacd088eda0069987606a61407c680eb8d9",
    "index": 0
  }
}' https://testnet-api.ainetwork.ai/json-rpc
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
curl -X POST --header 'Content-Type: application/json' --data '{
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
}' https://testnet-api.ainetwork.ai/json-rpc
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
curl -X POST --data
'{
  "jsonrpc":"2.0",
  "id":1, 
  "method":"ain_sendSignedTransactionBatch", 
  "params":{"tx_list":[
    {
      "signature":"0xaabc9ddafffb2ae0bac4107697547d22d9383...",
      "transaction":{
        "nonce":120,
        "timestamp":1566736760322,
        "operation":{"ref":"path/","value":"value","type":"SET_VALUE"}
      }
    },
    {
      "signature":"0x1ec191ef20b0e9628c4397665977cb...",
      "transaction":{
        "nonce":121,
        "timestamp":1566736760400,
        "operation":{"ref":"path/path/","value":100,"type":"SET_VALUE"}
      }
    }
  ]}
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

### ain_getPendingTransactions

Returns the most recent block.

**Parameters**

None.

**Returns**

`Object` - The most recent block. 

**Example**

Request
```
curl -X POST --data '{"jsonrpc":"2.0","id":1,"method":"ain_getRecentBlock"}'
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
curl -X POST --data '{"jsonrpc":"2.0","id":1,"method":"ain_getRecentBlockNumber"}'
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
curl -X POST --data '{"jsonrpc":"2.0","id":1,"method":"ain_getBlockByNumber","params":{"number":675,"getFullTransactions":true}}'
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
curl -X POST --data
'{
  "jsonrpc":"2.0",
  "id":1, 
  "method":"ain_getBlockByHash",
  "params":{"hash":"0x7a6c2a5a91ce3731310885eff761f7ee39484...",
      "getFullTransactions":true}
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
curl -X POST --data 
'{
  "jsonrpc":"2.0",
  "id":1,
  "method":"ain_getBlocks",
  "params":{"from":0,"to":100}
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
curl -X POST --data 
'{
  "jsonrpc":"2.0",
  "id":1,
  "method":"ain_getBlockHeaders",
  "params":{"from":0,"to":100}
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
curl -X POST --data
'{
  "jsonrpc":"2.0",
  "id":1, 
  "method":"ain_getBlockTransactionCountByNumber",
  "params":{"number":"123"}
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
curl -X POST --data
'{
  "jsonrpc":"2.0",
  "id":1, 
  "method":"ain_getBlockTransactionCountByNumber",
  "params":{"hash":"0x7a6c2a5a91ce3731310885eff761f7ee39484..."}
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
curl -X POST --data
'{
  "jsonrpc":"2.0",
  "id":1, 
  "method":"ain_getProposerByHash",
  "params":{"hash":"0x7a6c2a5a91ce3731310885eff761f7ee39484..."}
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
curl -X POST --data
'{
  "jsonrpc":"2.0",
  "id":1,
  "method":"ain_getProposerByNumber",
  "params":{"number":456}
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
curl -X POST --data
'{
  "jsonrpc":"2.0",
  "id":1, 
  "method":"ain_getValidatorsByHash",
  "params":{"hash":"0x7a6c2a5a91ce3731310885eff761f7ee39484..."}
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
curl -X POST --data
'{
  "jsonrpc":"2.0",
  "id":1, 
  "method":"ain_getValidatorsByNumber",
  "params":{"number":2143}
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

