rm -rf blockchain/blockchains logger/log

# PARENT CHAIN
node ./tracker-server/index.js &
sleep 5
ACCOUNT_INDEX=0 GENESIS_CONFIGS_DIR=genesis-configs/base node ./client/index.js &
sleep 5
ACCOUNT_INDEX=1 GENESIS_CONFIGS_DIR=genesis-configs/base node ./client/index.js &
sleep 5
ACCOUNT_INDEX=2 GENESIS_CONFIGS_DIR=genesis-configs/base node ./client/index.js &
sleep 15

# AFAN CHILD CHAIN
PORT=9010 P2P_PORT=6000 node ./tracker-server/index.js &
sleep 5
PORT=9011 P2P_PORT=6001 ACCOUNT_INDEX=0 GENESIS_CONFIGS_DIR=genesis-configs/afan-shard node ./client/index.js &
sleep 5
PORT=9012 P2P_PORT=6002 ACCOUNT_INDEX=1 GENESIS_CONFIGS_DIR=genesis-configs/afan-shard node ./client/index.js &
sleep 5
PORT=9013 P2P_PORT=6003 ACCOUNT_INDEX=2 GENESIS_CONFIGS_DIR=genesis-configs/afan-shard node ./client/index.js &
sleep 15