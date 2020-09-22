# PARENT CHAIN
node ./tracker-server/index.js &
sleep 5
NUM_VALIDATORS=3 ACCOUNT_INDEX=0 HOSTING_ENV=local node ./client/index.js &
sleep 10
NUM_VALIDATORS=3 ACCOUNT_INDEX=1 HOSTING_ENV=local node ./client/index.js &
sleep 10
NUM_VALIDATORS=3 ACCOUNT_INDEX=2 HOSTING_ENV=local node ./client/index.js &
sleep 10

# CHILD CHAIN 1
PORT=9010 P2P_PORT=6010 node ./tracker-server/index.js &
sleep 10
PORT=9011 P2P_PORT=6011 TRACKER_WS_ADDR=ws://localhost:6010 NUM_VALIDATORS=3 ACCOUNT_INDEX=0 HOSTING_ENV=local GENESIS_CONFIGS_DIR=blockchain/shard_1 node ./client/index.js &
sleep 10
PORT=9012 P2P_PORT=6012 TRACKER_WS_ADDR=ws://localhost:6010 NUM_VALIDATORS=3 ACCOUNT_INDEX=1 HOSTING_ENV=local GENESIS_CONFIGS_DIR=blockchain/shard_1 node ./client/index.js &
sleep 10
PORT=9013 P2P_PORT=6013 TRACKER_WS_ADDR=ws://localhost:6010 NUM_VALIDATORS=3 ACCOUNT_INDEX=2 HOSTING_ENV=local GENESIS_CONFIGS_DIR=blockchain/shard_1 node ./client/index.js &
sleep 10

# CHILD CHAIN 2
PORT=9020 P2P_PORT=6020 node ./tracker-server/index.js
sleep 10
PORT=9021 P2P_PORT=6021 TRACKER_WS_ADDR=ws://localhost:6020 NUM_VALIDATORS=3 ACCOUNT_INDEX=0 HOSTING_ENV=local GENESIS_CONFIGS_DIR=blockchain/shard_2 node ./client/index.js &
sleep 1000
PORT=9022 P2P_PORT=6022 TRACKER_WS_ADDR=ws://localhost:6020 NUM_VALIDATORS=3 ACCOUNT_INDEX=1 HOSTING_ENV=local GENESIS_CONFIGS_DIR=blockchain/shard_2 node ./client/index.js &
sleep 10
PORT=9023 P2P_PORT=6023 TRACKER_WS_ADDR=ws://localhost:6020 NUM_VALIDATORS=3 ACCOUNT_INDEX=2 HOSTING_ENV=local GENESIS_CONFIGS_DIR=blockchain/shard_2 node ./client/index.js &
sleep 10
