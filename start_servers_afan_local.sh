#!/bin/bash

printf "\n[[[[[ start_servers_afan_local.sh ]]]]]\n\n"

# PARENT CHAIN **
# parent tracker
printf "\nStarting parent tracker..\n"
CONSOLE_LOG=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./tracker-server/index.js &
printf "\nDone\n\n"
sleep 5
# parent node 0
printf "\nStarting parent node 0..\n"
ACCOUNT_INDEX=0 \
  PEER_CANDIDATE_JSON_RPC_URL='' \
  CONSOLE_LOG=true \
  ENABLE_DEV_CLIENT_SET_API=true \
  ENABLE_JSON_RPC_TX_API=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 5
# parent node 1
printf "\nStarting parent node 1..\n"
ACCOUNT_INDEX=1 \
  CONSOLE_LOG=true \
  ENABLE_DEV_CLIENT_SET_API=true \
  ENABLE_JSON_RPC_TX_API=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 5
# parent node 2
printf "\nStarting parent node 2..\n"
ACCOUNT_INDEX=2 \
  CONSOLE_LOG=true \
  ENABLE_DEV_CLIENT_SET_API=true \
  ENABLE_JSON_RPC_TX_API=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 15

# AFAN CHILD CHAIN **
# afan child tracker
printf "\nStarting afan child tracker..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard \
  PORT=9000 \
  P2P_PORT=6000 \
  CONSOLE_LOG=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./tracker-server/index.js &
printf "\nDone\n\n"
sleep 5
# afan child node 0
printf "\nStarting afan child node 0..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard \
  PORT=9001 \
  P2P_PORT=6001 \
  ACCOUNT_INDEX=0 \
  PEER_CANDIDATE_JSON_RPC_URL='' \
  CONSOLE_LOG=true \
  ENABLE_DEV_CLIENT_SET_API=true \
  ENABLE_JSON_RPC_TX_API=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./client/index.js &
printf "\nDone\n\n"
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

# afan child node 1
printf "\nStarting afan child node 1..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard \
  PORT=9002 \
  P2P_PORT=6002 \
  ACCOUNT_INDEX=1 \
  CONSOLE_LOG=true \
  ENABLE_DEV_CLIENT_SET_API=true \
  ENABLE_JSON_RPC_TX_API=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 5
# afan child node 2
printf "\nStarting afan child node 2..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard \
  PORT=9003 \
  P2P_PORT=6003 \
  ACCOUNT_INDEX=2 \
  CONSOLE_LOG=true \
  ENABLE_DEV_CLIENT_SET_API=true \
  ENABLE_JSON_RPC_TX_API=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 15
