#!/bin/bash
#
# A script to start a local blockchain.
#

printf "\n[[[[[ start_local_blockchain.sh ]]]]]\n\n"

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
UNSAFE_PRIVATE_KEY=b22c95ffc4a5c096f7d7d0487ba963ce6ac945bdc91c79b64ce209de289bec96 \
  PORT=8081 \
  P2P_PORT=5001 \
  STAKE=100000 \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  ENABLE_EXPRESS_RATE_LIMIT=false \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10
# node 1
printf "\nStarting node 1..\n"
UNSAFE_PRIVATE_KEY=921cc48e48c876fc6ed1eb02a76ad520e8d16a91487f9c7e03441da8e35a0947 \
  PORT=8082 \
  P2P_PORT=5002 \
  STAKE=100000 \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  ENABLE_EXPRESS_RATE_LIMIT=false \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10
# node 2 with ENABLE_EVENT_HANDLER=true
printf "\nStarting node 2..\n"
UNSAFE_PRIVATE_KEY=41e6e5718188ce9afd25e4b386482ac2c5272c49a622d8d217887bce21dce560 \
  PORT=8083 \
  P2P_PORT=5003 \
  STAKE=100000 \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  ENABLE_EXPRESS_RATE_LIMIT=false \
  ENABLE_EVENT_HANDLER=true \
  node ./client/index.js &
printf "\nDone\n\n"
