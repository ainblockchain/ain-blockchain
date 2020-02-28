# Blockchain Database

## Tracker

Tracker server is required by new peers who wish to join the AIN network. Each peer is sent the ipaddress of 2 other nodes in the network. These nodes then gossip information through the network of all transactions and blocks.

NOTE: Tracker Server must be started first before starting any blockchain-database instances

### How to run (without Docker)

#### Dev (Local) 

##### Install npm packages

```
cd tracker-server
npm install
cd ..
```

##### Run Tracker server

```
node tracker-server/index.js
```

#### Prod (GCP)

##### Deploy code (in common with Node server)

```
gcloud init

sh deploy_prod.sh <SEASON> <YOUR_GCP_USER_NAME>
```

For example,
```
sh deploy_prod.sh spring seo
```

##### Set up Ubuntu machine (if it's on a new VM)

```
sh setup_ubuntu.sh
```

##### Copy files to a sharable folder & install npm packages

```
sh setup_tracker_gcp.sh
```

##### Start tracker server job

In the project root, run:
```
sh start_tracker_prod.sh
```

### How to run with Docker

#### Build Docker image
 
```
cd tracker-server/
docker build -t ainblockchain/tracker-server .
```

#### Pull Docker image
 
```
docker pull ainblockchain/tracker-server
```

#### Run with Docker image
 
```
docker run --network="host" -d ainblockchain/tracker-server:latest
```

### Client API

GET http://<ip_address>:5000/ -> Tracker health check

GET http://<ip_address>:5000/peer_nodes -> Node status 

## Node 

Operates a single peer node instance of the AIN blockchain. A single blockchain-database instance processes incoming transaction requests and maintains a local copy of the entire blockchain blockchain. The blockchain-database first queries the tracker-server for ipaddresses of other peers, and then syncs it's local blockchain to the network consensus blockchain. If the blockchain specifies a "STAKE" argument on startup, it will then begin to take part in the forging/validating process for new blocks.


### How to run (without Docker)

#### Dev (Local) 

##### Install npm packages

```
npm install
```

##### Run Node server

```
STAKE=250 P2P_PORT=5001 PORT=8081 ACCOUNT_INDEX=0 HOSTING_ENV=local DEBUG=false node client/index.js
STAKE=250 P2P_PORT=5002 PORT=8082 ACCOUNT_INDEX=1 HOSTING_ENV=local DEBUG=false node client/index.js 
STAKE=250 P2P_PORT=5003 PORT=8083 ACCOUNT_INDEX=2 HOSTING_ENV=local DEBUG=false node client/index.js 
STAKE=250 P2P_PORT=5004 PORT=8084 ACCOUNT_INDEX=3 HOSTING_ENV=local DEBUG=false node client/index.js 
STAKE=250 P2P_PORT=5005 PORT=8085 ACCOUNT_INDEX=4 HOSTING_ENV=local DEBUG=false node client/index.js 
```

Before starting node jobs, remove existing blockchain files and logs if necessary:

```
rm -rf blockchain/blockchains client/logs
```

##### How to test
 
```
npm run test_unit
npm run test_smoke
npm run test_integration
```

#### Prod (GCP)

##### Deploy code (in common with Tracker server) 

```
gcloud init

sh deploy_prod.sh <SEASON> <YOUR_GCP_USER_NAME>
```

For example,
```
sh deploy_prod.sh spring seo
```

##### Set up Ubuntu machine (if it's on a new VM)

```
sh setup_ubuntu.sh
```

##### Copy files to a sharable folder & install npm packages

```
sh setup_node_gcp.sh
```

##### Start Node server job

In the project root, run:
```
sh start_node_prod.sh <SEASON> <SERVER_INDEX>
```

For example,

```
sh start_node_prod.sh spring 0
```

### How to run with Docker

#### Build Docker image
 
```
docker build -t ainblockchain/blockchain-database .
```

#### Pull Docker image
 
```
docker pull ainblockchain/blockchain-database
```

#### Run with Docker image
 
```
docker run -e STAKE=250 -e TRACKER_IP="ws://<ip_address_of_tracker_server>:3001" --network="host" -d ainblockchain/blockchain-database:latest
```


#### Enter Docker container and inspect blockchain files
 
```
docker exec -it <container_id> /bin/bash
cd blockchain/blockchains/8080/
```

#### Enter docker container and inspect log files
 
```
docker exec -it <container_id> /bin/bash
cat client/logs/8080debug.log
```

### Client API

GET http://<ip_address>:8080/ -> Node health check

GET http://<ip_address>:8080/blocks -> Fetch latest blocks in the blockchain (up to 20 blocks)

GET http://<ip_address>:8080/blocks?from=1&to=100 -> psql -h localhost -U postgres -d postgresQuery for specific list of blocks from blockchain

GET http://<ip_address>:8080/tx_pool -> Fetch transactions in the transaction pool

GET http://<ip_address>:8080/tx_tracker -> Fetch transaction status in the transaction tracker

GET http://<ip_address>:8080/committed_nonce_tracker -> Fetch nonce status in the committed nonce tracker

GET http://<ip_address>:8080/pending_nonce_tracker -> Fetch nonce status in the pending nonce tracker

GET http://<ip_address>:8080/get_value?ref=/db/path/to/fetch -> Fetch value

GET http://<ip_address>:8080/get_rule?ref=/db/path/to/fetch -> Fetch rule

GET http://<ip_address>:8080/get_function?ref=/db/path/to/fetch -> Fetch function

GET http://<ip_address>:8080/get_owner?ref=/db/path/to/fetch -> Fetch owner

GET http://<ip_address>:8080/match_rule?ref=/db/path/to/match -> Match rule with database value location

GET http://<ip_address>:8080/match_owner?ref=/db/path/to/match -> Match owner with database rule/function/owner location

POST http://<ip_address>:8080/eval_rule with json_body {"ref": "/db/path/to/eval", "value": "some value", "address": "0xABCD...Z", "timestamp": "1234567890"} -> Evaluate rule

POST http://<ip_address>:8080/eval_owner with json_body {"ref": "/db/path/to/eval", "permission": "write_rule", "address": "0xABCD...Z"} -> Evaluate owner

POST http://<ip_address>:8080/get with json_body {"op_list": [{"type": "GET_VALUE", "ref": "/db/path/to/fetch"}, {"type": "GET_RULE", "ref": "/db/path/to/fetch2"}]} -> Perform multiple get operations

POST http://<ip_address>:8080/set_value with json_body {"ref": "/db/path/to/set", "value": "some value"} -> Set value

POST http://<ip_address>:8080/inc_value with json_body {"ref": "/db/path/to/increase", "value": 10} -> Increase value

POST http://<ip_address>:8080/dec_value with json_body {"ref": "/db/path/to/decrease", "value": 10} -> Decrease value

POST http://<ip_address>:8080/set_rule with json_body {"ref": "/db/path/to/set", "value": "some rule"} -> Set rule

POST http://<ip_address>:8080/set_function with json_body {"ref": "/db/path/to/set", "value": "some function"} -> Set function

POST http://<ip_address>:8080/set with json_body {"op_list": [{"type": "SET_VALUE", "ref": "/db/path/to/set", "value": "some value}, {"type": "SET_RULE", "ref": "/db/path/to/set2", "value": "some rule"}]} -> Perform multiple set operations

POST http://<ip_address>:8080/batch with json_body {"tx_list": [{"operation": {"type": "SET_VALUE", "ref": "/db/path/to/set", "value": "testme"}}, {"operation": {"type": "SET_RULE", "ref": "/db/path/to/set2", "value": "some rule"}}]} -> Perform multiple transactions

## Utility scripts

Four Node server with a Tracker server can be started all at once using `start_servers.sh` like:
```
sh start_servers.sh
```

and can be stopped all at once using `stop_servers.sh` like:
```
sh stop_servers.sh
```
