#!/bin/bash

# PARENT CHAIN
CONSOLE_LOG=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./tracker-server/index.js &
sleep 5
MIN_NUM_VALIDATORS=3 ACCOUNT_INDEX=0 CONSOLE_LOG=true ENABLE_DEV_SET_CLIENT_API=true ENABLE_TX_SIG_VERIF_WORKAROUND=true ENABLE_GAS_FEE_WORKAROUND=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./client/index.js &
sleep 5
MIN_NUM_VALIDATORS=3 ACCOUNT_INDEX=1 CONSOLE_LOG=true ENABLE_DEV_SET_CLIENT_API=true ENABLE_TX_SIG_VERIF_WORKAROUND=true ENABLE_GAS_FEE_WORKAROUND=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./client/index.js &
sleep 5
MIN_NUM_VALIDATORS=3 ACCOUNT_INDEX=2 CONSOLE_LOG=true ENABLE_DEV_SET_CLIENT_API=true ENABLE_TX_SIG_VERIF_WORKAROUND=true ENABLE_GAS_FEE_WORKAROUND=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./client/index.js &
sleep 15

# AFAN CHILD CHAIN
GENESIS_CONFIGS_DIR=genesis-configs/afan-shard PORT=9000 P2P_PORT=6000 CONSOLE_LOG=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./tracker-server/index.js &
sleep 5
GENESIS_CONFIGS_DIR=genesis-configs/afan-shard PORT=9001 P2P_PORT=6001 MIN_NUM_VALIDATORS=3 ACCOUNT_INDEX=0 CONSOLE_LOG=true ENABLE_DEV_SET_CLIENT_API=true ENABLE_TX_SIG_VERIF_WORKAROUND=true ENABLE_GAS_FEE_WORKAROUND=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./client/index.js &
sleep 5

while :
do
    nodeState=$(curl -m 20 -X GET -H "Content-Type: application/json" "http://localhost:9001/node_status" | jq -r '.result.state')
    printf "\nnodeState = ${nodeState}\n"
    if [[ "$nodeState" = "SERVING" ]]; then
        printf "\nShard node 0 is now serving!\n"
        break
    fi
    sleep 20
done

GENESIS_CONFIGS_DIR=genesis-configs/afan-shard PORT=9002 P2P_PORT=6002 MIN_NUM_VALIDATORS=3 ACCOUNT_INDEX=1 CONSOLE_LOG=true ENABLE_DEV_SET_CLIENT_API=true ENABLE_TX_SIG_VERIF_WORKAROUND=true ENABLE_GAS_FEE_WORKAROUND=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./client/index.js &
sleep 5
GENESIS_CONFIGS_DIR=genesis-configs/afan-shard PORT=9003 P2P_PORT=6003 MIN_NUM_VALIDATORS=3 ACCOUNT_INDEX=2 CONSOLE_LOG=true ENABLE_DEV_SET_CLIENT_API=true ENABLE_TX_SIG_VERIF_WORKAROUND=true ENABLE_GAS_FEE_WORKAROUND=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./client/index.js &
sleep 15
