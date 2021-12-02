#!/bin/bash

printf "\n[[[[[ start_servers_local.sh ]]]]]\n\n"

# PARENT CHAIN **
# parent tracker
printf "\nStarting parent tracker..\n"
BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  HOSTING_ENV=local \
  node ./tracker-server/index.js &
printf "\nDone\n\n"
sleep 5
# parent node 0
printf "\nStarting parent node 0..\n"
ACCOUNT_INDEX=0 \
  PEER_CANDIDATE_JSON_RPC_URL='' \
  STAKE=100000 \
  HOSTING_ENV=local \
  CONSOLE_LOG=true \
  ENABLE_DEV_CLIENT_SET_API=true \
  ENABLE_JSON_RPC_TX_API=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10
# parent node 1
printf "\nStarting parent node 1..\n"
ACCOUNT_INDEX=1 \
  STAKE=100000 \
  HOSTING_ENV=local \
  CONSOLE_LOG=true \
  ENABLE_DEV_CLIENT_SET_API=true \
  ENABLE_JSON_RPC_TX_API=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10
# parent node 2
printf "\nStarting parent node 2..\n"
ACCOUNT_INDEX=2 \
  STAKE=100000 \
  HOSTING_ENV=local \
  CONSOLE_LOG=true \
  ENABLE_DEV_CLIENT_SET_API=true \
  ENABLE_JSON_RPC_TX_API=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10

# CHILD CHAIN 1 **
# child 1 tracker
printf "\nStarting child 1 tracker..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard \
  HOSTING_ENV=local \
  PORT=9000 \
  P2P_PORT=6000 \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./tracker-server/index.js &
printf "\nDone\n\n"
sleep 10
# child 1 node 0
printf "\nStarting child 1 node 0..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard \
  PORT=9001 \
  P2P_PORT=6001 \
  ACCOUNT_INDEX=0 \
  PEER_CANDIDATE_JSON_RPC_URL='' \
  STAKE=100000 \
  HOSTING_ENV=local \
  CONSOLE_LOG=true \
  ENABLE_DEV_CLIENT_SET_API=true \
  ENABLE_JSON_RPC_TX_API=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10

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

# child 1 node 1
printf "\nStarting child 1 node 1..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard \
  PORT=9002 \
  P2P_PORT=6002 \
  ACCOUNT_INDEX=1 \
  STAKE=100000 \
  HOSTING_ENV=local \
  CONSOLE_LOG=true \
  ENABLE_DEV_CLIENT_SET_API=true \
  ENABLE_JSON_RPC_TX_API=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10
# child 1 node 2
printf "\nStarting child 1 node 2..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard \
  PORT=9003 \
  P2P_PORT=6003 \
  ACCOUNT_INDEX=2 \
  STAKE=100000 \
  HOSTING_ENV=local \
  CONSOLE_LOG=true \
  ENABLE_DEV_CLIENT_SET_API=true \
  ENABLE_JSON_RPC_TX_API=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10

# CHILD CHAIN 2 **
# child 2 tracker
printf "\nStarting child 2 tracker..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/sim-shard \
  PORT=9010 \
  P2P_PORT=6010 \
  HOSTING_ENV=local \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./tracker-server/index.js &
printf "\nDone\n\n"
sleep 10
# child 2 node 0
printf "\nStarting child 2 node 0..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/sim-shard \
  PORT=9011 \
  P2P_PORT=6011 \
  ACCOUNT_INDEX=0 \
  STAKE=100000 \
  HOSTING_ENV=local \
  CONSOLE_LOG=true \
  ENABLE_DEV_CLIENT_SET_API=true \
  ENABLE_JSON_RPC_TX_API=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10

while :
do
    nodeState=$(curl -m 20 -X GET -H "Content-Type: application/json" "http://localhost:9011/node_status" | node_modules/node-jq/bin/jq -r '.result.state')
    printf "\nnodeState = ${nodeState}\n"
    if [[ "$nodeState" = "SERVING" ]]; then
        printf "\nShard node 0 is now serving!\n"
        break
    fi
    sleep 20
done

# child 2 node 1
printf "\nStarting child 2 node 1..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/sim-shard \
  PORT=9012 \
  P2P_PORT=6012 \
  ACCOUNT_INDEX=1 \
  STAKE=100000 \
  HOSTING_ENV=local \
  CONSOLE_LOG=true \
  ENABLE_DEV_CLIENT_SET_API=true \
  ENABLE_JSON_RPC_TX_API=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10
# child 2 node 2
printf "\nStarting child 2 node 2..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/sim-shard \
  PORT=9013 \
  P2P_PORT=6013 \
  ACCOUNT_INDEX=2 \
  STAKE=100000 \
  HOSTING_ENV=local \
  CONSOLE_LOG=true \
  ENABLE_DEV_CLIENT_SET_API=true \
  ENABLE_JSON_RPC_TX_API=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  BLOCKCHAIN_DATA_DIR=~/ain_blockchain_data \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10
