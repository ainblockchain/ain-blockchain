#!/bin/bash

printf "\n[[[[[ start_servers_afan_local.sh ]]]]]\n\n"

# PARENT CHAIN
CONSOLE_LOG=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./tracker-server/index.js &
sleep 5
ACCOUNT_INDEX=0 P2P_PEER_CANDIDATE_URL='' CONSOLE_LOG=true ENABLE_DEV_CLIENT_SET_API=true ENABLE_TX_SIG_VERIF_WORKAROUND=true ENABLE_GAS_FEE_WORKAROUND=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./client/index.js &
sleep 5
ACCOUNT_INDEX=1 CONSOLE_LOG=true ENABLE_DEV_CLIENT_SET_API=true ENABLE_TX_SIG_VERIF_WORKAROUND=true ENABLE_GAS_FEE_WORKAROUND=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./client/index.js &
sleep 5
ACCOUNT_INDEX=2 CONSOLE_LOG=true ENABLE_DEV_CLIENT_SET_API=true ENABLE_TX_SIG_VERIF_WORKAROUND=true ENABLE_GAS_FEE_WORKAROUND=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./client/index.js &
sleep 15

# AFAN CHILD CHAIN
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard PORT=9000 P2P_PORT=6000 CONSOLE_LOG=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./tracker-server/index.js &
sleep 5
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard PORT=9001 P2P_PORT=6001 ACCOUNT_INDEX=0 P2P_PEER_CANDIDATE_URL='' CONSOLE_LOG=true ENABLE_DEV_CLIENT_SET_API=true ENABLE_TX_SIG_VERIF_WORKAROUND=true ENABLE_GAS_FEE_WORKAROUND=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./client/index.js &
sleep 5

while :
do
    nodeState=$(curl -m 20 -X GET -H "Content-Type: application/json" "http://localhost:9001/node_status" | node_modules/node-jq/bin/jq -r '.result.state')
    printf "\nnodeState = ${nodeState}\n"
    if [[ "$nodeState" = "SERVING" ]]; then
        printf "\nShard node 0 is now serving!\n"
        break
    fi
    sleep 20
done

BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard PORT=9002 P2P_PORT=6002 ACCOUNT_INDEX=1 CONSOLE_LOG=true ENABLE_DEV_CLIENT_SET_API=true ENABLE_TX_SIG_VERIF_WORKAROUND=true ENABLE_GAS_FEE_WORKAROUND=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./client/index.js &
sleep 5
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard PORT=9003 P2P_PORT=6003 ACCOUNT_INDEX=2 CONSOLE_LOG=true ENABLE_DEV_CLIENT_SET_API=true ENABLE_TX_SIG_VERIF_WORKAROUND=true ENABLE_GAS_FEE_WORKAROUND=true BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data node ./client/index.js &
sleep 15
