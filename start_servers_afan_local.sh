#!/bin/bash

printf "\n[[[[[ start_servers_afan_local.sh ]]]]]\n\n"

# PARENT CHAIN **
# parent tracker
printf "\nStarting parent tracker..\n"
PORT=8080 \
  P2P_PORT=5000 \
  CONSOLE_LOG=true \
  node ./tracker-server/index.js &
printf "\nDone\n\n"
sleep 5
# parent node 0
printf "\nStarting parent node 0..\n"
UNSAFE_PRIVATE_KEY=b22c95ffc4a5c096f7d7d0487ba963ce6ac945bdc91c79b64ce209de289bec96 \
  PORT=8081 \
  P2P_PORT=5001 \
  PEER_CANDIDATE_JSON_RPC_URL='' \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 5
# parent node 1
printf "\nStarting parent node 1..\n"
UNSAFE_PRIVATE_KEY=921cc48e48c876fc6ed1eb02a76ad520e8d16a91487f9c7e03441da8e35a0947 \
  PORT=8082 \
  P2P_PORT=5002 \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 5
# parent node 2
printf "\nStarting parent node 2..\n"
UNSAFE_PRIVATE_KEY=41e6e5718188ce9afd25e4b386482ac2c5272c49a622d8d217887bce21dce560 \
  PORT=8083 \
  P2P_PORT=5003 \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
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
  node ./tracker-server/index.js &
printf "\nDone\n\n"
sleep 5
# afan child node 0
printf "\nStarting afan child node 0..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard \
  PORT=9001 \
  P2P_PORT=6001 \
  UNSAFE_PRIVATE_KEY=d8f77aa2afe2580a858a8cc97b6056e10f888c6fd07ebb58755d8422b03da816 \
  PEER_CANDIDATE_JSON_RPC_URL='' \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
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
  UNSAFE_PRIVATE_KEY=a3409e22bc14a3d0e73697df25617b3f2eaae9b5eade77615a32abc0ad5ee0df \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 5
# afan child node 2
printf "\nStarting afan child node 2..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard \
  PORT=9003 \
  P2P_PORT=6003 \
  UNSAFE_PRIVATE_KEY=c4611582dbb5319f08ba0907af6430a79e02b87b112aa4039d43e8765384f568 \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 15
