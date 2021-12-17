#!/bin/bash

printf "\n[[[[[ start_servers_local.sh ]]]]]\n\n"

# PARENT CHAIN **
# parent tracker
printf "\nStarting parent tracker..\n"
PORT=8080 \
  P2P_PORT=5000 \
  node ./tracker-server/index.js &
printf "\nDone\n\n"
sleep 5
# parent node 0
printf "\nStarting parent node 0..\n"
ACCOUNT_INJECTION_OPTION=private_key \
  UNSAFE_PRIVATE_KEY=b22c95ffc4a5c096f7d7d0487ba963ce6ac945bdc91c79b64ce209de289bec96 \
  PORT=8081 \
  P2P_PORT=5001 \
  PEER_CANDIDATE_JSON_RPC_URL='' \
  STAKE=100000 \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  ENABLE_EXPRESS_RATE_LIMIT=false \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10
# parent node 1
printf "\nStarting parent node 1..\n"
ACCOUNT_INJECTION_OPTION=private_key \
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
# parent node 2
printf "\nStarting parent node 2..\n"
ACCOUNT_INJECTION_OPTION=private_key \
  UNSAFE_PRIVATE_KEY=41e6e5718188ce9afd25e4b386482ac2c5272c49a622d8d217887bce21dce560 \
  PORT=8083 \
  P2P_PORT=5003 \
  STAKE=100000 \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  ENABLE_EXPRESS_RATE_LIMIT=false \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10

# CHILD CHAIN 1 **
# child 1 tracker
printf "\nStarting child 1 tracker..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard \
  PORT=9000 \
  P2P_PORT=6000 \
  node ./tracker-server/index.js &
printf "\nDone\n\n"
sleep 10
# child 1 node 0
printf "\nStarting child 1 node 0..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard \
  PORT=9001 \
  P2P_PORT=6001 \
  ACCOUNT_INJECTION_OPTION=private_key \
  UNSAFE_PRIVATE_KEY=d8f77aa2afe2580a858a8cc97b6056e10f888c6fd07ebb58755d8422b03da816 \
  PEER_CANDIDATE_JSON_RPC_URL='' \
  STAKE=100000 \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
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
  ACCOUNT_INJECTION_OPTION=private_key \
  UNSAFE_PRIVATE_KEY=a3409e22bc14a3d0e73697df25617b3f2eaae9b5eade77615a32abc0ad5ee0df \
  STAKE=100000 \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10
# child 1 node 2
printf "\nStarting child 1 node 2..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard \
  PORT=9003 \
  P2P_PORT=6003 \
  ACCOUNT_INJECTION_OPTION=private_key \
  UNSAFE_PRIVATE_KEY=c4611582dbb5319f08ba0907af6430a79e02b87b112aa4039d43e8765384f568 \
  STAKE=100000 \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10

# CHILD CHAIN 2 **
# child 2 tracker
printf "\nStarting child 2 tracker..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/sim-shard \
  PORT=9010 \
  P2P_PORT=6010 \
  node ./tracker-server/index.js &
printf "\nDone\n\n"
sleep 10
# child 2 node 0
printf "\nStarting child 2 node 0..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/sim-shard \
  PORT=9011 \
  P2P_PORT=6011 \
  ACCOUNT_INJECTION_OPTION=private_key \
  UNSAFE_PRIVATE_KEY=275dac1207d58d7015b6b55dd13432337aabbb044635e447e819172daba7a69d \
  PEER_CANDIDATE_JSON_RPC_URL='' \
  STAKE=100000 \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
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
  ACCOUNT_INJECTION_OPTION=private_key \
  UNSAFE_PRIVATE_KEY=0d8073dc0ee25ea154762feffa601d83191d3c8f4d7a208dd5b9ce376e414cc2 \
  STAKE=100000 \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10
# child 2 node 2
printf "\nStarting child 2 node 2..\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/sim-shard \
  PORT=9013 \
  P2P_PORT=6013 \
  ACCOUNT_INJECTION_OPTION=private_key \
  UNSAFE_PRIVATE_KEY=0e9b552ee38b0bc370b509b4705bae50e289acb641d9af9960e5e7604907961b \
  STAKE=100000 \
  CONSOLE_LOG=true \
  ENABLE_REST_FUNCTION_CALL=true \
  ENABLE_TX_SIG_VERIF_WORKAROUND=true \
  ENABLE_GAS_FEE_WORKAROUND=true \
  node ./client/index.js &
printf "\nDone\n\n"
sleep 10
