#!/bin/bash

if [[ "$#" -lt 4 ]] || [[ "$#" -gt 5 ]]; then
    printf "Usage: bash start_node_incremental_gcp.sh [dev|staging|spring|summer] <Shard Index> <Node Index> [fast|full] [--keystore]\n"
    printf "Example: bash start_node_incremental_gcp.sh spring 0 0 fast --keystore\n"
    exit
fi

# 1. Configure env vars (GENESIS_CONFIGS_DIR, TRACKER_WS_ADDR, ...)
printf "\n#### [Step 1] Configure env vars ####\n\n"

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
        printf "Invalid <Shard Index> argument: $2\n"
        exit
    fi
    if [[ "$2" -gt 0 ]]; then
        # Create a genesis_params.json
        export GENESIS_CONFIGS_DIR="genesis-configs/shard_$2"
        mkdir -p "./$GENESIS_CONFIGS_DIR"
        node > "./$GENESIS_CONFIGS_DIR/genesis_params.json" <<EOF
        const data = require('./genesis-configs/testnet/genesis_params.json');
        data.blockchain.TRACKER_WS_ADDR = '$TRACKER_WS_ADDR';
        data.consensus.MIN_NUM_VALIDATORS = 3;
        console.log(JSON.stringify(data, null, 2));
EOF
    fi
else
    printf "Invalid <Project/Season> argument: $1\n"
    exit
fi

printf "TRACKER_WS_ADDR=$TRACKER_WS_ADDR\n"
printf "GENESIS_CONFIGS_DIR=$GENESIS_CONFIGS_DIR\n"
printf "KEYSTORE_DIR=$KEYSTORE_DIR\n"

if [[ "$3" -lt 0 ]] || [[ "$3" -gt 4 ]]; then
    printf "Invalid <Node Index> argument: $3\n"
    exit
fi

if [[ "$4" != 'fast' ]] && [[ "$4" != 'full' ]]; then
    printf "Invalid <Sync Mode> argument: $2\n"
    exit
fi

export SYNC_MODE="$4"
printf "SYNC_MODE=$SYNC_MODE\n"
KEYSTORE_OPTION=$5
printf "KEYSTORE_OPTION=$KEYSTORE_OPTION\n"

export DEBUG=false
export CONSOLE_LOG=false
export ENABLE_DEV_SET_CLIENT_API=false
export ENABLE_TX_SIG_VERIF_WORKAROUND=false
export ENABLE_GAS_FEE_WORKAROUND=true
export LIGHTWEIGHT=false
export STAKE=100000
export BLOCKCHAIN_DATA_DIR="/home/ain_blockchain_data"

date=$(date '+%Y-%m-%dT%H-%M')
printf "date=$date\n"
NEW_DIR_PATH="../ain-blockchain-$date"
printf "NEW_DIR_PATH=$NEW_DIR_PATH\n"

# 2. Get currently used directory
printf "\n#### [Step 2] Get currently used directory ####\n\n"

OLD_DIR_PATH=$(find ../ain-blockchain* -maxdepth 0 -type d)
printf "OLD_DIR_PATH=$OLD_DIR_PATH\n"

# 3. Create a new directory
printf "\n#### [Step 3] Create a new directory ####\n\n"

MKDIR_CMD="sudo mkdir $NEW_DIR_PATH"
printf "MKDIR_CMD=$MKDIR_CMD\n"
eval $MKDIR_CMD

sudo chmod -R 777 $NEW_DIR_PATH
mv * $NEW_DIR_PATH
sudo mkdir -p $BLOCKCHAIN_DATA_DIR
sudo chmod -R 777 $BLOCKCHAIN_DATA_DIR

# 4. Install dependencies
printf "\n#### [Step 4] Install dependencies ####\n\n"

cd $NEW_DIR_PATH
npm install

# 5. Kill old node server 
printf "\n#### [Step 5] Kill old node server ####\n\n"

KILL_CMD="sudo killall node"
printf "KILL_CMD='$KILL_CMD'\n\n"
eval $KILL_CMD
sleep 10

# 6. Remove old directory keeping the chain data
printf "\n#### [Step 6] Remove old directory keeping the chain data ####\n\n"

RM_CMD="sudo rm -rf $OLD_DIR_PATH"
printf "RM_CMD='$RM_CMD'\n"
eval $RM_CMD

# 7. Start a new node server
printf "\n#### [Step 7] Start new node server ####\n\n"

# NOTE(liayoo): Currently this script supports --keystore option only for the parent chain.
if [[ "$KEYSTORE_OPTION" != '--keystore' ]] || [[ "$2" -gt 0 ]]; then
    export ACCOUNT_INDEX="$3"
    printf "ACCOUNT_INDEX=$ACCOUNT_INDEX\n"
    COMMAND_PREFIX=""
else
    if [[ "$3" = 0 ]]; then
        KEYSTORE_FILENAME="keystore_node_0.json"
    elif [[ "$3" = 1 ]]; then
        KEYSTORE_FILENAME="keystore_node_1.json"
    elif [[ "$3" = 2 ]]; then
        KEYSTORE_FILENAME="keystore_node_2.json"
    elif [[ "$3" = 3 ]]; then
        KEYSTORE_FILENAME="keystore_node_3.json"
    else
        KEYSTORE_FILENAME="keystore_node_4.json"
    fi
    printf "KEYSTORE_FILENAME=$KEYSTORE_FILENAME\n"
    sudo mkdir -p $BLOCKCHAIN_DATA_DIR/keys/8080
    sudo mv $NEW_DIR_PATH/$KEYSTORE_DIR/$KEYSTORE_FILENAME $BLOCKCHAIN_DATA_DIR/keys/8080/
    export KEYSTORE_FILE_PATH=$BLOCKCHAIN_DATA_DIR/keys/8080/$KEYSTORE_FILENAME
    echo "KEYSTORE_FILE_PATH=$KEYSTORE_FILE_PATH"
fi

MAX_OLD_SPACE_SIZE_MB=5500

# NOTE(liayoo): This is a temporary setting. Remove once domain is set up for afan metaverse related services.
export CORS_WHITELIST=*
printf "CORS_WHITELIST=$CORS_WHITELIST\n"

START_CMD="nohup node --async-stack-traces --max-old-space-size=$MAX_OLD_SPACE_SIZE_MB client/index.js >/dev/null 2>error_logs.txt &"
printf "START_CMD='$START_CMD'\n"
eval $START_CMD

printf "\n* << Node server successfully deployed! ***************************************\n\n"
