#!/bin/bash

if [[ $# -lt 3 ]] || [[ $# -gt 7 ]]; then
    printf "Usage: bash start_node_genesis_gcp.sh [dev|staging|spring|summer] <Shard Index> <Node Index> [--keep-code] [--full-sync] [--keystore|--mnemonic] [--json-rpc] [--rest-func]\n"
    printf "Example: bash start_node_genesis_gcp.sh spring 0 0 --keep-code --full-sync --keystore\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ start_node_genesis_gcp.sh ]]]]]\n\n"

function parse_options() {
    local option="$1"
    if [[ $option = '--keep-code' ]]; then
        KEEP_CODE_OPTION="$option"
    elif [[ $option = '--full-sync' ]]; then
        FULL_SYNC_OPTION="$option"
    elif [[ $option = '--keystore' ]]; then
        if [[ "$ACCOUNT_INJECTION_OPTION" ]]; then
            printf "You cannot use both keystore and mnemonic\n"
            exit
        fi
        ACCOUNT_INJECTION_OPTION="$option"
    elif [[ $option = '--mnemonic' ]]; then
        if [[ "$ACCOUNT_INJECTION_OPTION" ]]; then
            printf "You cannot use both keystore and mnemonic\n"
            exit
        fi
        ACCOUNT_INJECTION_OPTION="$option"
    elif [[ $option = '--json-rpc' ]]; then
        JSON_RPC_OPTION="$option"
    elif [[ $option = '--rest-func' ]]; then
        REST_FUNC_OPTION="$option"
    else
        printf "Invalid options: $option\n"
        exit
    fi
}

# Parse options.
SEASON="$1"
number_re='^[0-9]+$'
if ! [[ $2 =~ $number_re ]] ; then
    printf "Invalid <Shard Index> argument: $2\n"
    exit
fi
SHARD_INDEX="$2"
if ! [[ $3 =~ $number_re ]] ; then
    printf "Invalid <Node Index> argument: $3\n"
    exit
fi
if [[ "$3" -lt 0 ]] || [[ "$3" -gt 6 ]]; then
    printf "Invalid <Node Index> argument: $3\n"
    exit
fi
NODE_INDEX="$3"

KEEP_CODE_OPTION=""
FULL_SYNC_OPTION=""
ACCOUNT_INJECTION_OPTION=""
JSON_RPC_OPTION=""
REST_FUNC_OPTION=""

ARG_INDEX=4
while [ $ARG_INDEX -le $# ]
do
  parse_options "${!ARG_INDEX}"
  ((ARG_INDEX++))
done

printf "SEASON=$SEASON\n"
printf "SHARD_INDEX=$SHARD_INDEX\n"
printf "NODE_INDEX=$NODE_INDEX\n"

printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
printf "FULL_SYNC_OPTION=$FULL_SYNC_OPTION\n"
printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
printf "JSON_RPC_OPTION=$JSON_RPC_OPTION\n"
printf "REST_FUNC_OPTION=$REST_FUNC_OPTION\n"

if [[ $SEASON = "staging" ]]; then
  # for performance test pipeline
  export ENABLE_EXPRESS_RATE_LIMIT=false
else
  export ENABLE_EXPRESS_RATE_LIMIT=true
fi
if [[ $FULL_SYNC_OPTION = "" ]]; then
  export SYNC_MODE=fast
else
  export SYNC_MODE=full
fi
export ACCOUNT_INJECTION_OPTION="$ACCOUNT_INJECTION_OPTION"
if [[ $JSON_RPC_OPTION ]]; then
  export ENABLE_JSON_RPC_TX_API=true
else
  export ENABLE_JSON_RPC_TX_API=false
fi
if [[ $REST_FUNC_OPTION ]]; then
  export ENABLE_REST_FUNCTION_CALL=true
else
  export ENABLE_REST_FUNCTION_CALL=false
fi

printf '\n'
printf 'Killing old jobs..\n'
sudo killall node

if [[ $KEEP_CODE_OPTION = "" ]]; then
    printf '\n'
    printf 'Setting up working directory..\n'
    cd
    sudo rm -rf /home/ain_blockchain_data
    sudo mkdir /home/ain_blockchain_data
    sudo chmod -R 777 /home/ain_blockchain_data
    sudo rm -rf ../ain-blockchain*
    sudo mkdir ../ain-blockchain
    sudo chmod -R 777 ../ain-blockchain
    mv * ../ain-blockchain
    cd ../ain-blockchain

    printf '\n'
    printf 'Installing node modules..\n'
    yarn install
else
    printf '\n'
    printf 'Using old directory..\n'
    OLD_DIR_PATH=$(find ../ain-blockchain* -maxdepth 0 -type d)
    printf "OLD_DIR_PATH=$OLD_DIR_PATH\n"
    sudo chmod -R 777 $OLD_DIR_PATH
    sudo chmod -R 777 /home/ain_blockchain_data
fi


KEYSTORE_DIR=testnet_dev_staging_keys
if [[ $SEASON = 'spring' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-prod
    export TRACKER_WS_ADDR=ws://35.221.137.80:5000
    export P2P_PEER_CANDIDATE_URL="http://35.221.184.48:8080/json-rpc"
    KEYSTORE_DIR=testnet_prod_keys
elif [[ $SEASON = 'summer' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-prod
    export TRACKER_WS_ADDR=ws://35.194.172.106:5000
    export P2P_PEER_CANDIDATE_URL="http://35.194.169.78:8080/json-rpc"
    KEYSTORE_DIR=testnet_prod_keys
elif [[ $SEASON = 'staging' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-staging
    export P2P_PEER_CANDIDATE_URL="http://35.194.139.219:8080/json-rpc"
elif [[ $SEASON = 'dev' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-dev
    if [[ $SHARD_INDEX = 0 ]]; then
      export P2P_PEER_CANDIDATE_URL="http://35.194.235.180:8080/json-rpc"
    elif [[ $SHARD_INDEX = 1 ]]; then
      export TRACKER_WS_ADDR=ws://35.187.153.22:5000  # dev-shard-1-tracker-ip
    elif [[ $SHARD_INDEX = 2 ]]; then
      export TRACKER_WS_ADDR=ws://34.80.203.104:5000  # dev-shard-2-tracker-ip
    elif [[ $SHARD_INDEX = 3 ]]; then
      export TRACKER_WS_ADDR=ws://35.189.174.17:5000  # dev-shard-3-tracker-ip
    elif [[ $SHARD_INDEX = 4 ]]; then
      export TRACKER_WS_ADDR=ws://35.221.164.158:5000  # dev-shard-4-tracker-ip
    elif [[ $SHARD_INDEX = 5 ]]; then
      export TRACKER_WS_ADDR=ws://35.234.46.65:5000  # dev-shard-5-tracker-ip
    elif [[ $SHARD_INDEX = 6 ]]; then
      export TRACKER_WS_ADDR=ws://35.221.210.171:5000  # dev-shard-6-tracker-ip
    elif [[ $SHARD_INDEX = 7 ]]; then
      export TRACKER_WS_ADDR=ws://34.80.222.121:5000  # dev-shard-7-tracker-ip
    elif [[ $SHARD_INDEX = 8 ]]; then
      export TRACKER_WS_ADDR=ws://35.221.200.95:5000  # dev-shard-8-tracker-ip
    elif [[ $SHARD_INDEX = 9 ]]; then
      export TRACKER_WS_ADDR=ws://34.80.216.199:5000  # dev-shard-9-tracker-ip
    elif [[ $SHARD_INDEX = 10 ]]; then
      export TRACKER_WS_ADDR=ws://34.80.161.85:5000  # dev-shard-10-tracker-ip
    elif [[ $SHARD_INDEX = 11 ]]; then
      export TRACKER_WS_ADDR=ws://35.194.239.169:5000  # dev-shard-11-tracker-ip
    elif [[ $SHARD_INDEX = 12 ]]; then
      export TRACKER_WS_ADDR=ws://35.185.156.22:5000  # dev-shard-12-tracker-ip
    elif [[ $SHARD_INDEX = 13 ]]; then
      export TRACKER_WS_ADDR=ws://35.229.247.143:5000  # dev-shard-13-tracker-ip
    elif [[ $SHARD_INDEX = 14 ]]; then
      export TRACKER_WS_ADDR=ws://35.229.226.47:5000  # dev-shard-14-tracker-ip
    elif [[ $SHARD_INDEX = 15 ]]; then
      export TRACKER_WS_ADDR=ws://35.234.61.23:5000  # dev-shard-15-tracker-ip
    elif [[ $SHARD_INDEX = 16 ]]; then
      export TRACKER_WS_ADDR=ws://34.80.66.41:5000  # dev-shard-16-tracker-ip
    elif [[ $SHARD_INDEX = 17 ]]; then
      export TRACKER_WS_ADDR=ws://35.229.143.18:5000  # dev-shard-17-tracker-ip
    elif [[ $SHARD_INDEX = 18 ]]; then
      export TRACKER_WS_ADDR=ws://35.234.58.137:5000  # dev-shard-18-tracker-ip
    elif [[ $SHARD_INDEX = 19 ]]; then
      export TRACKER_WS_ADDR=ws://34.80.249.104:5000  # dev-shard-19-tracker-ip
    elif [[ $SHARD_INDEX = 20 ]]; then
      export TRACKER_WS_ADDR=ws://35.201.248.92:5000  # dev-shard-20-tracker-ip
    else
      printf "Invalid shard ID argument: $SHARD_INDEX\n"
      exit
    fi
    if [[ $SHARD_INDEX -gt 0 ]]; then
      export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/sim-shard
    fi
else
    printf "Invalid season argument: $SEASON\n"
    exit
fi

if [[ $NODE_INDEX = 0 ]]; then
    export P2P_PEER_CANDIDATE_URL=''
fi

printf "\n"
printf "TRACKER_WS_ADDR=$TRACKER_WS_ADDR\n"
printf "BLOCKCHAIN_CONFIGS_DIR=$BLOCKCHAIN_CONFIGS_DIR\n"
printf "KEYSTORE_DIR=$KEYSTORE_DIR\n"
printf "P2P_PEER_CANDIDATE_URL=$P2P_PEER_CANDIDATE_URL\n"

# NOTE(liayoo): Currently this script supports [--keystore|--mnemonic] option only for the parent chain.
if [[ $ACCOUNT_INJECTION_OPTION = "" ]] || [[ "$SHARD_INDEX" -gt 0 ]]; then
    export ACCOUNT_INDEX="$NODE_INDEX"
    printf "ACCOUNT_INDEX=$ACCOUNT_INDEX\n"
elif [[ $ACCOUNT_INJECTION_OPTION = "--keystore" ]]; then
    if [[ $NODE_INDEX = 0 ]]; then
        KEYSTORE_FILENAME="keystore_node_0.json"
    elif [[ $NODE_INDEX = 1 ]]; then
        KEYSTORE_FILENAME="keystore_node_1.json"
    elif [[ $NODE_INDEX = 2 ]]; then
        KEYSTORE_FILENAME="keystore_node_2.json"
    elif [[ $NODE_INDEX = 3 ]]; then
        KEYSTORE_FILENAME="keystore_node_3.json"
    elif [[ $NODE_INDEX = 4 ]]; then
        KEYSTORE_FILENAME="keystore_node_4.json"
    elif [[ $NODE_INDEX = 5 ]]; then
        KEYSTORE_FILENAME="keystore_node_5.json"
    elif [[ $NODE_INDEX = 6 ]]; then
        KEYSTORE_FILENAME="keystore_node_6.json"
    fi
    printf "KEYSTORE_FILENAME=$KEYSTORE_FILENAME\n"
    if [[ $KEEP_CODE_OPTION = "" ]]; then
        sudo mkdir -p ../ain_blockchain_data/keys/8080
        sudo mv ./$KEYSTORE_DIR/$KEYSTORE_FILENAME ../ain_blockchain_data/keys/8080/
    fi
    export KEYSTORE_FILE_PATH=/home/ain_blockchain_data/keys/8080/$KEYSTORE_FILENAME
    printf "KEYSTORE_FILE_PATH=$KEYSTORE_FILE_PATH\n"
fi

export DEBUG=false
export CONSOLE_LOG=false 
export ENABLE_DEV_CLIENT_SET_API=false 
export ENABLE_TX_SIG_VERIF_WORKAROUND=false
export ENABLE_GAS_FEE_WORKAROUND=true
export LIGHTWEIGHT=false
export STAKE=100000
export BLOCKCHAIN_DATA_DIR="/home/ain_blockchain_data"
# NOTE(liayoo): This is a temporary setting. Remove once domain is set up for afan metaverse related services.
export CORS_WHITELIST=*
printf "CORS_WHITELIST=$CORS_WHITELIST\n"

MAX_OLD_SPACE_SIZE_MB=11000

printf "\nStarting up Blockchain Node server..\n\n"
START_CMD="nohup node --async-stack-traces --max-old-space-size=$MAX_OLD_SPACE_SIZE_MB client/index.js >/dev/null 2>error_logs.txt &"
printf "START_CMD=$START_CMD\n"
printf "START_CMD=$START_CMD\n" >> start_commands.txt
eval $START_CMD


printf "\nBlockchain Node server [$SEASON $SHARD_INDEX $NODE_INDEX] is now up!\n\n"
