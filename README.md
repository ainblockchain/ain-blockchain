## Tracker Server

Tracker server is required by new peers who wish to join the AIN network. Each peer is sent the ipaddress of 2 other nodes in the network. These nodes then gossip information through the network of all transactions and blocks.

NOTE: Tracker Server must be started first before starting any blockchain-database instances

### To build docker image locally
	cd tracker-server/
	docker build -t ainblockchain/tracker-server .

  
### To pull docker image
	docker pull ainblockchain/tracker-server

  
### To run docker image
	docker run --network="host" -d ainblockchain/tracker-server:latest

  ### Description
By default this tracker-server service is queriable by blockchain-database instances at ws://localhost:3001

---
## Blockchain Database

Operates a single peer node instance of the AIN blockchain. A single blockchain-database instance processes incoming transaction requests and maintains a local copy of the entire blockchain blockchain. The blockchain-database first queries the tracker-server for ipaddresses of other peers, and then syncs it's local blockchain to the network consensus blockchain. If the blockchain specifies a "STAKE" argument on startup, it will then begin to take part in the forging/validating process for new blocks.

  

### To run test cases
	npm init && npm run test

### To build docker image locally
	docker build -t ainblockchain/blockchain-database .

### To pull docker image 

	docker pull ainblockchain/blockchain-database

### To run docker image 

	docker run -e LOG=true -e STAKE=250 -e TRACKER_IP="ws://<ip_address_of_tracker_server>:3001" --network="host" -d ainblockchain/blockchain-database:latest

  
### Description 


#### Optional arguments:
  

STAKE: Set if you would like node participate in the block forg/validating process. Likelihood of node being chosen as forger is propotional to amount staked

LOG: Set to true if you want blockchain-database to maintain log files

  

#### To enter docker container and see blockchain files

	docker exec -it <container_id> /bin/bash
	cd blockchain/.blockchains/8080/
  

### To enter docker container and see log files

	docker exec -it <container_id> /bin/bash
	cat client/.logs/8080debug.log


#### The blockchain database exposes the following endpoint:

GET https://<ip_address>:8080/blocks -> See all blocks in the blockchain

GET https://<ip_address>:8080/transactions -> See all transactions in the transaction pool

GET https://<ip_address>:8080/blocks?from=1&to=100 -> psql -h localhost -U postgres -d postgresQuery for specific list of blocks from blockchain

GET https://<ip_address>:8080/get?ref=/database/path/to/query -> Query for data at specific database location

POST https://<ip_address>:8080/set_value with json_body {"ref": "test/comeonnnnnnn", "value": "testme"}

POST https://<ip_address>:8080/inc_value with json_body {"ref": "test/increase/first/level", "value": 10}

POST https://<ip_address>:8080/dec_value with json_body {"ref": "test/decrease/first/level", "value": 10}

POST https://<ip_address>:8080/updates with json_body {"data": [{"ref": "test/increase/first/level", "value": 10}, {"ref": "test/increase/first/level2", "value": 20}]}

POST https://<ip_address>:8080/batch with json_body {"batch_list": [{"op": "set_value", "ref": "test/comeonnnnnnn", "value": "testme"}, {"op": "set_value", "ref": "test/b/u", "value": 10000}]}

  

## Postgres Database (will move to different repositoy)

Database which will be used by ain_scan to store data regarding blocks and transactions. CUrrently defines schemas for database of blocks and transactions

  

### To build docker image locally

	cd postgres/
	docker build -t ainblockchain/postgres .

### To run docker image 

	docker run --rm --name pg-docker -e POSTGRES_PASSWORD=postgres -d -p 5432:5432 ainblockchain/postgres

### To enter postgres container and check default schemas

	psql -h localhost -U postgres -d postgres
