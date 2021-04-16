rm -rf ./chains/ ./logs/

# PARENT CHAIN
CONSOLE_LOG=true node ./tracker-server/index.js &
sleep 5
MIN_NUM_VALIDATORS=3 ACCOUNT_INDEX=0 CONSOLE_LOG=true ENABLE_DEV_CLIENT_API=true FORCE_GAS_FEE_WORKAROUND=true node ./client/index.js &
sleep 5
MIN_NUM_VALIDATORS=3 ACCOUNT_INDEX=1 CONSOLE_LOG=true ENABLE_DEV_CLIENT_API=true FORCE_GAS_FEE_WORKAROUND=true node ./client/index.js &
sleep 5
MIN_NUM_VALIDATORS=3 ACCOUNT_INDEX=2 CONSOLE_LOG=true ENABLE_DEV_CLIENT_API=true FORCE_GAS_FEE_WORKAROUND=true node ./client/index.js &
sleep 15

# AFAN CHILD CHAIN
GENESIS_CONFIGS_DIR=genesis-configs/afan-shard PORT=9010 P2P_PORT=6000 CONSOLE_LOG=true node ./tracker-server/index.js &
sleep 5
GENESIS_CONFIGS_DIR=genesis-configs/afan-shard PORT=9011 P2P_PORT=6001 ACCOUNT_INDEX=0 CONSOLE_LOG=true ENABLE_DEV_CLIENT_API=true FORCE_GAS_FEE_WORKAROUND=true node ./client/index.js &
sleep 5
GENESIS_CONFIGS_DIR=genesis-configs/afan-shard PORT=9012 P2P_PORT=6002 ACCOUNT_INDEX=1 CONSOLE_LOG=true ENABLE_DEV_CLIENT_API=true FORCE_GAS_FEE_WORKAROUND=true node ./client/index.js &
sleep 5
GENESIS_CONFIGS_DIR=genesis-configs/afan-shard PORT=9013 P2P_PORT=6003 ACCOUNT_INDEX=2 CONSOLE_LOG=true ENABLE_DEV_CLIENT_API=true FORCE_GAS_FEE_WORKAROUND=true node ./client/index.js &
sleep 15
