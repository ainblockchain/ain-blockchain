#!/bin/bash

printf "\n[[[[[ start_servers_token_bridge.sh ]]]]]\n\n"

# tracker
printf "\nStarting tracker..\n"
PORT=8080 \
  P2P_PORT=5000 \
  CONSOLE_LOG=true \
  node ./tracker-server/index.js &
printf "\nDone\n\n"
sleep 5
# node 0
printf "\nStarting node 0..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/token-bridge \
  PORT=8081 \
  P2P_PORT=5001 \
  STAKE=100000 \
  CONSOLE_LOG=true \
  UNSAFE_PRIVATE_KEY=b22c95ffc4a5c096f7d7d0487ba963ce6ac945bdc91c79b64ce209de289bec96 \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10
# node 1
printf "\nStarting node 1..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/token-bridge \
  PORT=8082 \
  P2P_PORT=5002 \
  STAKE=100000 \
  CONSOLE_LOG=true \
  UNSAFE_PRIVATE_KEY=921cc48e48c876fc6ed1eb02a76ad520e8d16a91487f9c7e03441da8e35a0947 \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10
# node 2
printf "\nStarting node 2..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/token-bridge \
  PORT=8083 \
  P2P_PORT=5003 \
  STAKE=100000 \
  CONSOLE_LOG=true \
  UNSAFE_PRIVATE_KEY=41e6e5718188ce9afd25e4b386482ac2c5272c49a622d8d217887bce21dce560 \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  node ./client/index.js &
printf "\nDone\n\n"
