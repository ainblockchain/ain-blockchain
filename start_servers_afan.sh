rm -rf ./chains/ ./logs/

# PARENT CHAIN
CONSOLE_LOG=true node ./tracker-server/index.js &
sleep 5
CONSOLE_LOG=true ACCOUNT_INDEX=0 GENESIS_CONFIGS_DIR=genesis-configs/base node ./client/index.js &
sleep 5
CONSOLE_LOG=true ACCOUNT_INDEX=1 GENESIS_CONFIGS_DIR=genesis-configs/base node ./client/index.js &
sleep 5
CONSOLE_LOG=true ACCOUNT_INDEX=2 GENESIS_CONFIGS_DIR=genesis-configs/base node ./client/index.js &
sleep 15

# AFAN CHILD CHAIN
CONSOLE_LOG=true PORT=9010 P2P_PORT=6000 node ./tracker-server/index.js &
sleep 5
CONSOLE_LOG=true PORT=9011 P2P_PORT=6001 ACCOUNT_INDEX=0 GENESIS_CONFIGS_DIR=genesis-configs/afan-shard node ./client/index.js &
sleep 5
CONSOLE_LOG=true PORT=9012 P2P_PORT=6002 ACCOUNT_INDEX=1 GENESIS_CONFIGS_DIR=genesis-configs/afan-shard node ./client/index.js &
sleep 5
CONSOLE_LOG=true PORT=9013 P2P_PORT=6003 ACCOUNT_INDEX=2 GENESIS_CONFIGS_DIR=genesis-configs/afan-shard node ./client/index.js &
sleep 15
