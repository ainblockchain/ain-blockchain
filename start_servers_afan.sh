rm -rf blockchain/blockchains logger/log

# PARENT CHAIN
node ./tracker-server/index.js &
sleep 5
NUM_VALIDATORS=2 ACCOUNT_INDEX=0 HOSTING_ENV=local STAKE=250 node ./client/index.js &
sleep 5
NUM_VALIDATORS=2 ACCOUNT_INDEX=1 HOSTING_ENV=local STAKE=250 node ./client/index.js &
sleep 10

# AFAN CHILD CHAIN
PORT=9010 P2P_PORT=6010 node ./tracker-server/index.js &
sleep 5
PORT=9011 P2P_PORT=6011 TRACKER_WS_ADDR=ws://localhost:6010 NUM_VALIDATORS=3 ACCOUNT_INDEX=0 HOSTING_ENV=local GENESIS_CONFIGS_DIR=blockchain/afan_shard STAKE=250 node ./client/index.js &
sleep 5
PORT=9012 P2P_PORT=6012 TRACKER_WS_ADDR=ws://localhost:6010 NUM_VALIDATORS=3 ACCOUNT_INDEX=1 HOSTING_ENV=local GENESIS_CONFIGS_DIR=blockchain/afan_shard STAKE=250 node ./client/index.js &
sleep 5
PORT=9013 P2P_PORT=6013 TRACKER_WS_ADDR=ws://localhost:6010 NUM_VALIDATORS=3 ACCOUNT_INDEX=2 HOSTING_ENV=local GENESIS_CONFIGS_DIR=blockchain/afan_shard STAKE=250 node ./client/index.js &
sleep 10