# AI Network Blockchain

### [AI Network](https://ainetwork.ai) | [Whitepaper](https://c9ede755-23ca-410d-8a9d-e5b895cd95bb.filesusr.com/ugd/4f6eb2_482a2386addb4c3283ee6e26f8ad42e6.pdf) | [Documentation](https://docs.ainetwork.ai/)
Official Javascript implementation of AI Network Blockchain.

## JSON-RPC API

For accessing AIN Blockchain nodes, see [JSON_RPC_API.md](./JSON_RPC_API.md).

## Install Environment (Last update at 6th of Dec 2021)
### OS

- macOS 13.5 (macos-latest)
- Ubuntu 22.04 (ubuntu-latest)

### NodeJs version

- v18.x

## Tracker

Tracker server is required by new peers who wish to join the AIN network. Each peer is sent the ip address of 2 other nodes in the network. These nodes then gossip information through the network of all transactions and blocks.

NOTE: Tracker Server must be started first before starting any blockchain node instances.

### Running Tracker without Docker

#### Local

- Clone this repository and install yarn packages
```
git clone https://github.com/ainblockchain/ain-blockchain.git
cd ain-blockchain/tracker-server/
yarn install
cd ..
```
- Run Tracker server
```
node tracker-server/index.js
```
You can override default port numbering system by setting `PORT` and `P2P_PORT` environment variables.

#### On Google Coud Platform (GCP)

- Deploy code (in common with Node server)
  Set <# of Shards> to 0 if you only want to run a parent chain, or set it to the specific number of shard chains you want to run in addition to the parent chain.
```
gcloud init
# For genesis deploy
bash deploy_blockchain_genesis_gcp.sh [dev|staging|sandbox|exp|spring|summer|mainnet] <# of Shards> <Parent Node Index Begin> <Parent Node Index End> [--setup] [--keystore|--mnemonic|--private-key] [--keep-code|--no-keep-code] [--keep-data|--no-keep-data] [--full-sync|--fast-sync] [--chown-data|--no-chown-data] [--kill-job|--kill-only]
# For incremental deploy
bash deploy_blockchain_incremental_gcp.sh [dev|staging|sandbox|exp|spring|summer|mainnet] <# of Shards> <Parent Node Index Begin> <Parent Node Index End> [--setup] [--keystore|--mnemonic|--private-key] [--keep-code|--no-keep-code] [--keep-data|--no-keep-data] [--full-sync|--fast-sync] [--chown-data|--no-chown-data]
```
- Set up Ubuntu machine (if it's on a new VM)
```
bash setup_blockchain_ubuntu_gcp.sh
```
- Start tracker server job
```
cd ain-blockchain/
bash start_tracker_genesis_gcp.sh <GCP Username> [--keep-code|--no-keep-code]
```

<!--
### Running Tracker with Docker

- Build Docker image
```
cd tracker-server/
docker build -t ainblockchain/tracker-server .
```
- Pull Docker image
```
docker pull ainblockchain/tracker-server
```
- Run with Docker image
```
docker run --network="host" -d ainblockchain/tracker-server:latest
```
-->

### Tracker Client API for development and testing purposes

#### Tracker protocol version check & health check

GET http://<ip_address>:8080/

#### Network status check

GET http://<ip_address>:8080/network_status

## Blockchain Node 

Operates a single peer node instance of the AIN blockchain. A single blockchain node instance processes incoming transaction requests and maintains a local copy of the entire blockchain. The blockchain node first queries the tracker-server for ip addresses of other peers, and then syncs its local blockchain to the network consensus blockchain. If a node is included in the whitelist and has staked appropriate amount of AIN, it will then take part in the consensus protocol.

### Running Blockchain Node without Docker

#### Local

- Clone this repository and install yarn packages
```
git clone https://github.com/ainblockchain/ain-blockchain.git
cd ain-blockchain/
yarn install
```
- Run blockchain nodes
```
ACCOUNT_INJECTION_OPTION=keystore DEBUG=false STAKE=100000 CONSOLE_LOG=true ENABLE_GAS_FEE_WORKAROUND=true node client/index.js
ACCOUNT_INJECTION_OPTION=keystore DEBUG=false STAKE=100000 CONSOLE_LOG=true ENABLE_GAS_FEE_WORKAROUND=true node client/index.js 
ACCOUNT_INJECTION_OPTION=keystore DEBUG=false STAKE=100000 CONSOLE_LOG=true ENABLE_GAS_FEE_WORKAROUND=true node client/index.js
```
You can override default port numbering system by setting `PORT` and `P2P_PORT` environment variables.
Before starting node jobs, remove existing blockchain files and logs if necessary:
```
rm -rf /path/to/data/dir logs
```
The default blockchain data directory is ~/ain_blockchain_data (e.g. chain data will be at ~/ain_blockchain_data/chains). You can use a different directory by specifying the `BLOCKCHAIN_DATA_DIR` environment variable.
  
The default minimum size of the validator whitelist is 3. Change MIN_NUM_VALIDATORS parameter in 
the blockchain-configs/base/genesis.json to change this value. You may also need to modify the GENESIS_WHITELIST and GENESIS_VALIDATORS accordingly.
The genesis configs directory used is `blockchain-configs/base` by default and it can be altered using `BLOCKCHAIN_CONFIGS_DIR` env variable. For example, afan shard cluster can use the following command line:
```
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard MIN_NUM_VALIDATORS=1 DEBUG=false STAKE=100000 CONSOLE_LOG=true ENABLE_GAS_FEE_WORKAROUND=true node client/index.js
```

#### On Google Cloud Platform (GCP)

- Deploy code (in common with Tracker server) 
  Set <# of Shards> to 0 if you only want to run a parent chain, or set it to the specific number of shard chains you want to run in addition to the parent chain.
```
gcloud init
# For genesis deploy
bash deploy_blockchain_genesis_gcp.sh [dev|staging|sandbox|exp|spring|summer|mainnet] <# of Shards> <Parent Node Index Begin> <Parent Node Index End> [--setup] [--keystore|--mnemonic|--private-key] [--keep-code|--no-keep-code] [--keep-data|--no-keep-data] [--full-sync|--fast-sync] [--chown-data|--no-chown-data] [--kill-job|--kill-only]
# For incremental deploy
bash deploy_blockchain_incremental_gcp.sh [dev|staging|sandbox|exp|spring|summer|mainnet] <# of Shards> <Parent Node Index Begin> <Parent Node Index End> [--setup] [--keystore|--mnemonic|--private-key] [--keep-code|--no-keep-code] [--keep-data|--no-keep-data] [--full-sync|--fast-sync] [--chown-data|--no-chown-data]
```
- Set up Ubuntu machine (if it's on a new VM)
```
bash setup_blockchain_ubuntu_gcp.sh
```
- Start Node server job (set shard index to 0 if you're running a root chain node)
```
bash start_node_genesis_gcp.sh [dev|staging|sandbox|exp|spring|summer|mainnet] <GCP Username> <Shard Index> <Node Index> [--keystore|--mnemonic|--private-key] [--keep-code|--no-keep-code] [--keep-data|--no-keep-data] [--full-sync|--fast-sync] [--chown-data|--no-chown-data] [--json-rpc] [--update-front-db] [--rest-func] [--event-handler]
```

### Running Blockchain Node with Docker

- Pull Docker image from [Docker Hub](https://hub.docker.com/repository/docker/ainblockchain/ain-blockchain)
```
docker pull ainblockchain/ain-blockchain:latest
docker pull ainblockchain/ain-blockchain:<PACKAGE_VERSION>
```
- Or build Docker image yourself
```
docker build -t ain-blockchain .
```
- Run with Docker image example
```
docker run -e ACCOUNT_INJECTION_OPTION=private_key -e SYNC_MODE=peer -e STAKE=10000 -e SEASON=dev --network="host" -d ainblockchain/ain-blockchain:latest
docker run -e ACCOUNT_INJECTION_OPTION=keystore -e SYNC_MODE=peer -e STAKE=10000 -e SEASON=mainnet --network="host" -d ainblockchain/ain-blockchain:latest
```
You can use some environment variables, and these have the following options.
```
-e SEASON={mainnet|summer|spring|sandbox|staging|exp|dev}
-e ACCOUNT_INJECTION_OPTION={private_key|keystore|mnemonic}
-e SYNC_MODE={fast|full|peer}
-e STAKE=<YOUR_TARGET_STAKE>
-e HOSTING_ENV={local|comcom|gcp|aws}
```
You can mount a volume when you meet some wants.
1. Want to preserve blockchain data in the docker container when changing the docker image due to an update.
2. Want to save your keystore file in the docker container when injecting your account into the blockchain automatically.
```
-v <YOUR_VOLUME>:/home/ain_blockchain_data
```
After the node is executed, you should inject your account into the node.
```
node inject_node_account.js <NODE_ENDPOINT_URL> --private-key
node inject_node_account.js <NODE_ENDPOINT_URL> --keystore
node inject_node_account.js <NODE_ENDPOINT_URL> --mnemonic
```
If you want to inject your account automatically, add one of these environment variables before running the node.
```
-e ACCOUNT_INJECTION_OPTION=private_key -e PRIVATE_KEY=<YOUR_PRIVATE_KEY>
-e ACCOUNT_INJECTION_OPTION=keystore -e KEYSTORE_FILE_PATH="/home/ain_blockchain_data/<KEYSTORE>" -e PASSWORD=<YOUR_PASSWORD>
-e ACCOUNT_INJECTION_OPTION=mnemonic -e MNEMONIC="your mnemonic"
```

<!--
#### Enter Docker container and inspect blockchain files

```
docker exec -it <container_id> /bin/bash
cd blockchain/blockchains/8080/
```

#### Enter docker container and inspect log files

```
docker exec -it <container_id> /bin/bash
cat logger/logs/8080/<log_file>
```
-->

### Testing How-Tos

How to run unit test and integration test all around.
```
yarn run test_unit
yarn run test_integration
```

Some individual tests already definded in the package.json.
```
yarn run test_unit_block_pool
yarn run test_unit_blockchain
yarn run test_unit_common_util
yarn run test_unit_consensus
yarn run test_unit_db
yarn run test_unit_event_handler
yarn run test_unit_functions
yarn run test_unit_object_util
yarn run test_unit_p2p
yarn run test_unit_p2p_util
yarn run test_unit_radix_node
yarn run test_unit_radix_tree
yarn run test_unit_rule_util
yarn run test_unit_state_manager
yarn run test_unit_state_node
yarn run test_unit_state_util
yarn run test_unit_traffic_db
yarn run test_unit_traffic_sm
yarn run test_unit_tx
yarn run test_unit_tx_pool
yarn run test_integration_dapp
yarn run test_integration_blockchain
yarn run test_integration_consensus
yarn run test_integration_event_handler
yarn run test_integration_function
yarn run test_integration_node
yarn run test_integration_he_protocol
yarn run test_integration_he_sharding
yarn run test_integration_sharding
```

The load test is also supported.
```
yarn run loadtest
```

### Blockchain Node Client API for development and testing purposes

#### Node protocol version check

GET http://<ip_address>:8080/

#### Node health check

GET http://<ip_address>:8080/health_check

#### Fetch latest blocks in the blockchain (up to 20 blocks)

GET http://<ip_address>:8080/blocks

#### Fetch specific list of blocks from the blockchain

GET http://<ip_address>:8080/blocks?from=1&to=100

#### Fetch transactions in the transaction pool

GET http://<ip_address>:8080/tx_pool

#### Fetch transaction status in the transaction tracker

GET http://<ip_address>:8080/tx_tracker

#### Fetch nonce status in the committed nonce tracker

GET http://<ip_address>:8080/committed_nonce_tracker

#### Fetch nonce status in the pending nonce tracker

GET http://<ip_address>:8080/pending_nonce_tracker 

#### Fetch value

GET http://<ip_address>:8080/get_value?ref=/db/path/to/fetch

#### Fetch rule

GET http://<ip_address>:8080/get_rule?ref=/db/path/to/fetch

#### Fetch function

GET http://<ip_address>:8080/get_function?ref=/db/path/to/fetch

#### Fetch owner

GET http://<ip_address>:8080/get_owner?ref=/db/path/to/fetch

#### Match rule with database value location

GET http://<ip_address>:8080/match_rule?ref=/db/path/to/match

#### Match function with database value location

GET http://<ip_address>:8080/match_function?ref=/db/path/to/match

#### Match owner with database rule/function/owner location

GET http://<ip_address>:8080/match_owner?ref=/db/path/to/match

#### Evaluate rule

POST http://<ip_address>:8080/eval_rule with json_body {"ref": "/db/path/to/eval", "value": "some value", "address": "0xABCD...Z", "timestamp": "1234567890"}

#### Evaluate owner

POST http://<ip_address>:8080/eval_owner with json_body {"ref": "/db/path/to/eval", "permission": "write_rule", "address": "0xABCD...Z"}

#### Perform multiple get operations

POST http://<ip_address>:8080/get with json_body {"op_list": [{"type": "GET_VALUE", "ref": "/db/path/to/fetch"}, {"type": "GET_RULE", "ref": "/db/path/to/fetch2"}]}

#### Set value

POST http://<ip_address>:8080/set_value with json_body {"ref": "/db/path/to/set", "value": "some value"}

#### Increase value

POST http://<ip_address>:8080/inc_value with json_body {"ref": "/db/path/to/increase", "value": 10}

#### Decrease value

POST http://<ip_address>:8080/dec_value with json_body {"ref": "/db/path/to/decrease", "value": 10}

#### Set rule

POST http://<ip_address>:8080/set_rule with json_body {"ref": "/db/path/to/set", "value": "some rule config"}

#### Set function

POST http://<ip_address>:8080/set_function with json_body {"ref": "/db/path/to/set", "value": "some function config"}

#### Set owner

POST http://<ip_address>:8080/set_owner with json_body {"ref": "/db/path/to/set", "value": "some owner config"}

#### Perform multiple set operations

POST http://<ip_address>:8080/set with json_body {"op_list": [{"type": "SET_VALUE", "ref": "/db/path/to/set", "value": "some value}, {"type": "SET_RULE", "ref": "/db/path/to/set2", "value": "some rule"}]}

#### Perform multiple transactions

POST http://<ip_address>:8080/batch with json_body {"tx_list": [{"operation": {"type": "SET_VALUE", "ref": "/db/path/to/set", "value": "testme"}}, {"operation": {"type": "SET_RULE", "ref": "/db/path/to/set2", "value": "some rule"}}]}

## Utility scripts

Four Node server with a Tracker server can be started all at once using `start_local_blockchain.sh` like:
```
bash start_local_blockchain.sh
```
and can be stopped all at once using `stop_local_blockchain.sh` like:
```
bash stop_local_blockchain.sh
```

## Versions

Please check the latest versions below:
- API_VERSION: [Release](https://github.com/ainblockchain/ain-blockchain/releases)
- DATA_PROTOCOL_VERSION: [README.md](./p2p/README.md)
- CONSENSUS_PROTOCOL_VERSION: [README.md](./consensus/README.md)

## Contribution

Please read the [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
