# AI Network Blockchain

### [AI Network](https://ainetwork.ai) | [Whitepaper](https://c9ede755-23ca-410d-8a9d-e5b895cd95bb.filesusr.com/ugd/4f6eb2_482a2386addb4c3283ee6e26f8ad42e6.pdf) | [Documentation](https://docs.ainetwork.ai/)
Official Javascript implementation of AI Network Blockchain.

## Tracker

Tracker server is required by new peers who wish to join the AIN network. Each peer is sent the ipaddress of 2 other nodes in the network. These nodes then gossip information through the network of all transactions and blocks.

NOTE: Tracker Server must be started first before starting any blockchain node instances

### Running without Docker

#### Local

- Clone this repository and install npm packages
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
  Set <NUMBER_OF_SHARDS> to 0 if you only want to run a parent chain, or set it to the specific number of shard chains you want to run in addition to the parent chain.
```
gcloud init
sh deploy_gcp.sh {dev|spring|summer} <YOUR_GCP_USER_NAME> <NUMBER_OF_SHARDS>
```
- Set up Ubuntu machine (if it's on a new VM)
```
sh setup_ubuntu.sh
```
- Copy files to a sharable folder & install npm packages
```
sh setup_tracker_gcp.sh
```
- Start tracker server job
```
cd ain-blockchain/
sh start_tracker_gcp.sh
```

<!--
### Running with Docker

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
docker run -e HOSTING_ENV="gcp" --network="host" -d ainblockchain/tracker-server:latest
```
-->

### Client APIs for development and debugging

#### Tracker health check

GET http://<ip_address>:5000/

#### Node status check

GET http://<ip_address>:5000/peer_nodes

## Node 

Operates a single peer node instance of the AIN blockchain. A single blockchain node instance processes incoming transaction requests and maintains a local copy of the entire blockchain. The blockchain node first queries the tracker-server for ip addresses of other peers, and then syncs its local blockchain to the network consensus blockchain. If a node is included in the whitelist and has staked appropriate amount of AIN, it will then take part in the consensus protocol.

### Running without Docker

#### Local

- Clone this repository and install npm packages
```
git clone https://github.com/ainblockchain/ain-blockchain.git
cd ain-blockchain/
yarn install
```
- Run blockchain nodes
```
NUM_VALIDATORS=4 ACCOUNT_INDEX=0 HOSTING_ENV=local DEBUG=false node client/index.js
NUM_VALIDATORS=4 ACCOUNT_INDEX=1 HOSTING_ENV=local DEBUG=false node client/index.js 
NUM_VALIDATORS=4 ACCOUNT_INDEX=2 HOSTING_ENV=local DEBUG=false node client/index.js 
NUM_VALIDATORS=4 ACCOUNT_INDEX=3 HOSTING_ENV=local DEBUG=false node client/index.js 
```
The environment variable `NUM_VALIDATORS` has default value `5`.
You can override default port numbering system by setting `PORT` and `P2P_PORT` environment variables.
Before starting node jobs, remove existing blockchain files and logs if necessary:
```
rm -rf blockchain/blockchains logger/logs
```
The default size of the validator whitelist is 5. Set NUM_VALIDATORS environment variable when running the first node if you'd like to run different number of validator nodes than 5.
The genesis configs directory used is `blockchain` by default and it can be altered using `GENESIS_CONFIGS_DIR` env variable. For example, afan shard cluster can use the following command line:
```
GENESIS_CONFIGS_DIR=blockchain/afan_shard NUM_VALIDATORS=1 ACCOUNT_INDEX=0 HOSTING_ENV=local DEBUG=false node client/index.js
```

### How to run tests

Please check your node version before running the below tests. Tests has passed node version 10.15.*

```
npm run test_unit
npm run test_smoke
npm run test_integration
```

#### On Google Coud Platform (GCP)

- Deploy code (in common with Tracker server) 
  Set <NUMBER_OF_SHARDS> to 0 if you only want to run a parent chain, or set it to the specific number of shard chains you want to run in addition to the parent chain.
```
gcloud init
sh deploy_gcp.sh {dev|spring|summer} <YOUR_GCP_USER_NAME> <NUMBER_OF_SHARDS>
```
- Set up Ubuntu machine (if it's on a new VM)
```
sh setup_ubuntu.sh
```
- Copy files to a sharable folder & install npm packages
```
sh setup_node_gcp.sh
```
- Start Node server job (set shard index to 0 if you're running a root chain node)
```
sh start_node_gcp.sh {dev|spring|summer} <SHARD_INDEX> <SERVER_INDEX>
```

<!--
### Running with Docker

- Build Docker image
```
docker build -t ain-blockchain .
```
- Pull Docker image
```
docker pull ainblockchain/blockchain-database
```
- Run with Docker image
```
docker run -e ACCOUNT_INDEX=0 -e HOSTING_ENV="gcp" -e TRACKER_WS_ADDR="ws://<ip_address_of_tracker_server>:5000" --network="host" -d ainblockchain/ain-blockchain:latest
```

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

### How to run tests

```
npm run test_unit
npm run test_smoke
npm run test_integration
```

### Client APIs for development and debugging

#### Node health check

GET http://<ip_address>:8080/

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

Four Node server with a Tracker server can be started all at once using `start_servers.sh` like:
```
sh start_servers.sh
```
and can be stopped all at once using `stop_servers.sh` like:
```
sh stop_servers.sh
```

## Contribution

Please read the [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
