#!/bin/bash

if [[ "$#" -lt 3 ]] || [[ "$#" -gt 7 ]]; then
    printf "Usage: bash start_node_genesis_gcp.sh [dev|staging|spring|summer] <Shard Index> <Node Index> [--keystore|--mnemonic] [--keep-code] [--json-rpc] [--rest-func]\n"
    printf "Example: bash start_node_genesis_gcp.sh spring 0 0 --keystore\n"
    exit
fi


function parse_options() {
    local option="$1"
    if [[ "$option" = '--keep-code' ]]; then
        KEEP_CODE_OPTION="$option"
    elif [[ "$option" = '--json-rpc' ]]; then
        JSON_RPC_OPTION="$option"
    elif [[ "$option" = '--rest-func' ]]; then
        REST_FUNC_OPTION="$option"
    elif [[ "$option" = '--keystore' ]]; then
        if [[ "$ACCOUNT_INJECTION_OPTION" ]]; then
            printf "You cannot use both keystore and mnemonic\n"
            exit
        fi
        ACCOUNT_INJECTION_OPTION="$option"
    elif [[ "$option" = '--mnemonic' ]]; then
        if [[ "$ACCOUNT_INJECTION_OPTION" ]]; then
            printf "You cannot use both keystore and mnemonic\n"
            exit
        fi
        ACCOUNT_INJECTION_OPTION="$option"
    else
        printf "Invalid options: $option\n"
        exit
    fi
}

# Parse options.
KEEP_CODE_OPTION=""
ACCOUNT_INJECTION_OPTION=""
REST_FUNC_OPTION=""

number=4
while [ $number -le $# ]
do
  parse_options "${!number}"
  ((number++))
done

printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
export ACCOUNT_INJECTION_OPTION="$ACCOUNT_INJECTION_OPTION"
printf "JSON_RPC_OPTION=$JSON_RPC_OPTION\n"
if [[ $JSON_RPC_OPTION ]]; then
  export ENABLE_JSON_RPC_API=true
else
  export ENABLE_JSON_RPC_API=false
fi
printf "REST_FUNC_OPTION=$REST_FUNC_OPTION\n"
if [[ $REST_FUNC_OPTION ]]; then
  export ENABLE_REST_FUNCTION_CALL=true
else
  export ENABLE_REST_FUNCTION_CALL=false
fi

printf 'Killing old jobs..\n'
sudo killall node

if [[ "$KEEP_CODE_OPTION" = "" ]]; then
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

    printf 'Installing node modules..\n'
    npm install
else
    printf 'Using old directory..\n'
    OLD_DIR_PATH=$(find ../ain-blockchain* -maxdepth 0 -type d)
    printf "OLD_DIR_PATH=$OLD_DIR_PATH\n"
    sudo chmod -R 777 $OLD_DIR_PATH
    sudo chmod -R 777 /home/ain_blockchain_data
    cd $OLD_DIR_PATH
fi


export GENESIS_CONFIGS_DIR=genesis-configs/testnet
KEYSTORE_DIR=testnet_dev_staging_keys
if [[ "$1" = 'spring' ]]; then
    export TRACKER_WS_ADDR=ws://35.221.137.80:5000
    KEYSTORE_DIR=testnet_prod_keys
elif [[ "$1" = 'summer' ]]; then
    export TRACKER_WS_ADDR=ws://35.194.172.106:5000
    KEYSTORE_DIR=testnet_prod_keys
elif [[ "$1" = 'staging' ]]; then
    export TRACKER_WS_ADDR=ws://35.221.150.73:5000
elif [[ "$1" = 'dev' ]]; then
  if [[ "$2" -gt 0 ]]; then
    export GENESIS_CONFIGS_DIR=genesis-configs/sim-shard
  fi

  if [[ "$2" = 0 ]]; then
    export TRACKER_WS_ADDR=ws://34.80.184.73:5000  # dev-tracker-ip
  elif [[ "$2" = 1 ]]; then
    export TRACKER_WS_ADDR=ws://35.187.153.22:5000  # dev-shard-1-tracker-ip
  elif [[ "$2" = 2 ]]; then
    export TRACKER_WS_ADDR=ws://34.80.203.104:5000  # dev-shard-2-tracker-ip
  elif [[ "$2" = 3 ]]; then
    export TRACKER_WS_ADDR=ws://35.189.174.17:5000  # dev-shard-3-tracker-ip
  elif [[ "$2" = 4 ]]; then
    export TRACKER_WS_ADDR=ws://35.221.164.158:5000  # dev-shard-4-tracker-ip
  elif [[ "$2" = 5 ]]; then
    export TRACKER_WS_ADDR=ws://35.234.46.65:5000  # dev-shard-5-tracker-ip
  elif [[ "$2" = 6 ]]; then
    export TRACKER_WS_ADDR=ws://35.221.210.171:5000  # dev-shard-6-tracker-ip
  elif [[ "$2" = 7 ]]; then
    export TRACKER_WS_ADDR=ws://34.80.222.121:5000  # dev-shard-7-tracker-ip
  elif [[ "$2" = 8 ]]; then
    export TRACKER_WS_ADDR=ws://35.221.200.95:5000  # dev-shard-8-tracker-ip
  elif [[ "$2" = 9 ]]; then
    export TRACKER_WS_ADDR=ws://34.80.216.199:5000  # dev-shard-9-tracker-ip
  elif [[ "$2" = 10 ]]; then
    export TRACKER_WS_ADDR=ws://34.80.161.85:5000  # dev-shard-10-tracker-ip
  elif [[ "$2" = 11 ]]; then
    export TRACKER_WS_ADDR=ws://35.194.239.169:5000  # dev-shard-11-tracker-ip
  elif [[ "$2" = 12 ]]; then
    export TRACKER_WS_ADDR=ws://35.185.156.22:5000  # dev-shard-12-tracker-ip
  elif [[ "$2" = 13 ]]; then
    export TRACKER_WS_ADDR=ws://35.229.247.143:5000  # dev-shard-13-tracker-ip
  elif [[ "$2" = 14 ]]; then
    export TRACKER_WS_ADDR=ws://35.229.226.47:5000  # dev-shard-14-tracker-ip
  elif [[ "$2" = 15 ]]; then
    export TRACKER_WS_ADDR=ws://35.234.61.23:5000  # dev-shard-15-tracker-ip
  elif [[ "$2" = 16 ]]; then
    export TRACKER_WS_ADDR=ws://34.80.66.41:5000  # dev-shard-16-tracker-ip
  elif [[ "$2" = 17 ]]; then
    export TRACKER_WS_ADDR=ws://35.229.143.18:5000  # dev-shard-17-tracker-ip
  elif [[ "$2" = 18 ]]; then
    export TRACKER_WS_ADDR=ws://35.234.58.137:5000  # dev-shard-18-tracker-ip
  elif [[ "$2" = 19 ]]; then
    export TRACKER_WS_ADDR=ws://34.80.249.104:5000  # dev-shard-19-tracker-ip
  elif [[ "$2" = 20 ]]; then
    export TRACKER_WS_ADDR=ws://35.201.248.92:5000  # dev-shard-20-tracker-ip
  else
    printf "Invalid shard ID argument: $2\n"
    exit
  fi
else
    printf "Invalid season argument: $1\n"
    exit
fi

printf "TRACKER_WS_ADDR=$TRACKER_WS_ADDR\n"
printf "GENESIS_CONFIGS_DIR=$GENESIS_CONFIGS_DIR\n"
printf "KEYSTORE_DIR=$KEYSTORE_DIR\n"

if [[ "$3" -lt 0 ]] || [[ "$3" -gt 6 ]]; then
    printf "Invalid account_index argument: $2\n"
    exit
fi

# NOTE(liayoo): Currently this script supports [--keystore|--mnemonic] option only for the parent chain.
if [[ "$ACCOUNT_INJECTION_OPTION" = "" ]] || [[ "$2" -gt 0 ]]; then
    export ACCOUNT_INDEX="$3"
    printf "ACCOUNT_INDEX=$ACCOUNT_INDEX\n"
elif [[ "$ACCOUNT_INJECTION_OPTION" = "--keystore" ]]; then
    if [[ "$3" = 0 ]]; then
        KEYSTORE_FILENAME="keystore_node_0.json"
    elif [[ "$3" = 1 ]]; then
        KEYSTORE_FILENAME="keystore_node_1.json"
    elif [[ "$3" = 2 ]]; then
        KEYSTORE_FILENAME="keystore_node_2.json"
    elif [[ "$3" = 3 ]]; then
        KEYSTORE_FILENAME="keystore_node_3.json"
    elif [[ "$3" = 4 ]]; then
        KEYSTORE_FILENAME="keystore_node_4.json"
    elif [[ "$3" = 5 ]]; then
        KEYSTORE_FILENAME="keystore_node_5.json"
    elif [[ "$3" = 6 ]]; then
        KEYSTORE_FILENAME="keystore_node_6.json"
    fi
    printf "KEYSTORE_FILENAME=$KEYSTORE_FILENAME\n"
    if [[ "$KEEP_CODE_OPTION" = "" ]]; then
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
printf "START_CMD='$START_CMD'\n"
eval $START_CMD


printf "\nBlockchain Node server is now up!\n\n"
