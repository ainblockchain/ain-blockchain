#!/bin/bash

if [[ $# -lt 4 ]] || [[ $# -gt 11 ]]; then
    printf "Usage: bash deploy_blockchain_incremental_gcp.sh [dev|staging|sandbox|exp|spring|summer|mainnet] <# of Shards> <Parent Node Index Begin> <Parent Node Index End> [--setup] [--keystore|--mnemonic|--private-key] [--keep-code|--no-keep-code] [--keep-data|--no-keep-data] [--full-sync|--fast-sync] [--chown-data|--no-chown-data]\n"
    printf "Example: bash deploy_blockchain_incremental_gcp.sh dev 0 -1  4 --keystore --no-keep-code\n"
    printf "Example: bash deploy_blockchain_incremental_gcp.sh dev 0  0  0 --keystore --keep-code\n"
    printf "Example: bash deploy_blockchain_incremental_gcp.sh dev 0 -1 -1 --setup --keystore --no-keep-code\n"
    printf "Example: bash deploy_blockchain_incremental_gcp.sh dev 0  0  0 --setup --keystore --no-keep-code\n"
    printf "Note: <Parent Node Index Begin> = -1 is for tracker\n"
    printf "Note: <Parent Node Index End> is inclusive\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ deploy_blockchain_incremental_gcp.sh ]]]]]\n\n"

if [[ "$1" = 'dev' ]] || [[ "$1" = 'staging' ]] || [[ "$1" = 'sandbox' ]] || [[ "$1" = 'exp' ]] || [[ "$1" = 'spring' ]] || [[ "$1" = 'summer' ]] || [[ "$1" = 'mainnet' ]]; then
    SEASON="$1"
    if [[ "$1" = 'mainnet' ]]; then
        PROJECT_ID="mainnet-prod-ground"
    elif [[ "$1" = 'spring' ]] || [[ "$1" = 'summer' ]]; then
        PROJECT_ID="testnet-prod-ground"
    else
        PROJECT_ID="testnet-$1-ground"
    fi
else
    printf "Invalid <Project/Season> argument: $1\n"
    exit
fi
printf "SEASON=$SEASON\n"
printf "PROJECT_ID=$PROJECT_ID\n"

GCP_USER="runner"
printf "GCP_USER=$GCP_USER\n"

number_re='^[0-9]+$'
if [[ ! $2 =~ $number_re ]] ; then
    printf "Invalid <# of Shards> argument: $2\n"
    exit
fi
NUM_SHARDS=$2
printf "NUM_SHARDS=$NUM_SHARDS\n"
PARENT_NODE_INDEX_BEGIN=$3
printf "PARENT_NODE_INDEX_BEGIN=$PARENT_NODE_INDEX_BEGIN\n"
PARENT_NODE_INDEX_END=$4
printf "PARENT_NODE_INDEX_END=$PARENT_NODE_INDEX_END\n"
printf "\n"

function parse_options() {
    local option="$1"
    if [[ $option = '--setup' ]]; then
        SETUP_OPTION="$option"
    elif [[ $option = '--private-key' ]]; then
        ACCOUNT_INJECTION_OPTION="$option"
    elif [[ $option = '--keystore' ]]; then
        ACCOUNT_INJECTION_OPTION="$option"
    elif [[ $option = '--mnemonic' ]]; then
        ACCOUNT_INJECTION_OPTION="$option"
    elif [[ $option = '--keep-code' ]]; then
        KEEP_CODE_OPTION="$option"
    elif [[ $option = '--no-keep-code' ]]; then
        KEEP_CODE_OPTION="$option"
    elif [[ $option = '--keep-data' ]]; then
        KEEP_DATA_OPTION="$option"
    elif [[ $option = '--no-keep-data' ]]; then
        KEEP_DATA_OPTION="$option"
    elif [[ $option = '--full-sync' ]]; then
        SYNC_MODE_OPTION="$option"
    elif [[ $option = '--fast-sync' ]]; then
        SYNC_MODE_OPTION="$option"
    elif [[ $option = '--chown-data' ]]; then
        CHOWN_DATA_OPTION="$option"
    elif [[ $option = '--no-chown-data' ]]; then
        CHOWN_DATA_OPTION="$option"
    else
        printf "Invalid option: $option\n"
        exit
    fi
}

# Parse options.
SETUP_OPTION=""
ACCOUNT_INJECTION_OPTION="--private-key"
KEEP_CODE_OPTION="--keep-code"
KEEP_DATA_OPTION="--keep-data"
SYNC_MODE_OPTION="--fast-sync"
CHOWN_DATA_OPTION="--no-chown-data"

ARG_INDEX=5
while [ $ARG_INDEX -le $# ]; do
  parse_options "${!ARG_INDEX}"
  ((ARG_INDEX++))
done

if [[ $SETUP_OPTION = "--setup" ]] && [[ ! $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
    printf "You cannot use --setup without --no-keep-code\n"
    exit
fi

printf "SETUP_OPTION=$SETUP_OPTION\n"
printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
printf "KEEP_DATA_OPTION=$KEEP_DATA_OPTION\n"
printf "SYNC_MODE_OPTION=$SYNC_MODE_OPTION\n"
printf "CHOWN_DATA_OPTION=$CHOWN_DATA_OPTION\n"

# Json-RPC-enabled blockchain nodes
JSON_RPC_NODE_INDEX_GE=0
JSON_RPC_NODE_INDEX_LE=4
# Rest-Function-enabled blockchain nodes
REST_FUNC_NODE_INDEX_GE=0
REST_FUNC_NODE_INDEX_LE=2
# Event-Handler-enabled blockchain nodes
EVENT_HANDLER_NODE_INDEX_GE=0
EVENT_HANDLER_NODE_INDEX_LE=4

printf "\n"
printf "JSON_RPC_NODE_INDEX_GE=$JSON_RPC_NODE_INDEX_GE\n"
printf "JSON_RPC_NODE_INDEX_LE=$JSON_RPC_NODE_INDEX_LE\n"
printf "REST_FUNC_NODE_INDEX_LE=$REST_FUNC_NODE_INDEX_LE\n"
printf "REST_FUNC_NODE_INDEX_GE=$REST_FUNC_NODE_INDEX_GE\n"
printf "EVENT_HANDLER_NODE_INDEX_GE=$EVENT_HANDLER_NODE_INDEX_GE\n"
printf "EVENT_HANDLER_NODE_INDEX_LE=$EVENT_HANDLER_NODE_INDEX_LE\n"

if [[ "$ACCOUNT_INJECTION_OPTION" = "" ]]; then
    printf "Must provide an ACCOUNT_INJECTION_OPTION\n"
    exit
fi

# Get confirmation.
if [[ "$SEASON" = "mainnet" ]]; then
    printf "\n"
    printf "Do you want to proceed for $SEASON? Enter [mainnet]: "
    read CONFIRM
    printf "\n"
    if [[ ! $CONFIRM = "mainnet" ]]
    then
        [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
    fi
elif [[ "$SEASON" = "spring" ]] || [[ "$SEASON" = "summer" ]]; then
    printf "\n"
    printf "Do you want to proceed for $SEASON? Enter [testnet]: "
    read CONFIRM
    printf "\n"
    if [[ ! $CONFIRM = "testnet" ]]; then
        [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
    fi
else
    printf "\n"
    read -p "Do you want to proceed for $SEASON? [y/N]: " -n 1 -r
    printf "\n\n"
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
    fi
fi

# Read node urls
IFS=$'\n' read -d '' -r -a NODE_URL_LIST < ./ip_addresses/$SEASON.txt
if [[ $ACCOUNT_INJECTION_OPTION = "--keystore" ]]; then
    # Get keystore password
    printf "Enter keystore password: "
    read -s KEYSTORE_PW
    printf "\n\n"
    if [[ $SEASON = "mainnet" ]]; then
        KEYSTORE_DIR="mainnet_prod_keys"
    elif [[ $SEASON = "spring" ]] || [[ $SEASON = "summer" ]]; then
        KEYSTORE_DIR="testnet_prod_keys"
    else
        KEYSTORE_DIR="testnet_dev_staging_keys"
    fi
elif [[ $ACCOUNT_INJECTION_OPTION = "--mnemonic" ]]; then
    IFS=$'\n' read -d '' -r -a MNEMONIC_LIST < ./testnet_mnemonics/$SEASON.txt
fi

FILES_FOR_TRACKER="blockchain/ blockchain-configs/ block-pool/ client/ common/ consensus/ db/ logger/ tracker-server/ traffic/ package.json setup_blockchain_ubuntu_gcp.sh start_tracker_genesis_gcp.sh start_tracker_incremental_gcp.sh"
FILES_FOR_NODE="blockchain/ blockchain-configs/ block-pool/ client/ common/ consensus/ db/ event-handler/ json_rpc/ logger/ node/ p2p/ tools/ traffic/ tx-pool/ package.json setup_blockchain_ubuntu_gcp.sh start_node_genesis_gcp.sh start_node_incremental_gcp.sh wait_until_node_sync_gcp.sh stop_local_blockchain.sh"

NUM_SHARD_NODES=3

TRACKER_ZONE="asia-east1-b"
NODE_ZONE_LIST=(
    "asia-east1-b" \
    "us-west1-b" \
    "asia-southeast1-b" \
    "us-central1-a" \
    "europe-west4-a" \
    "asia-east1-b" \
    "us-west1-b" \
    "asia-southeast1-b" \
    "us-central1-a" \
    "europe-west4-a" \
)

function deploy_tracker() {
    printf "\n* >> Deploying files for tracker ********************************************************\n\n"

    printf "TRACKER_TARGET_ADDR='$TRACKER_TARGET_ADDR'\n"
    printf "TRACKER_ZONE='$TRACKER_ZONE'\n"

    if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
        # 1. Copy files for tracker
        printf "\n\n[[[ Copying files for tracker ]]]\n\n"
        gcloud compute ssh $TRACKER_TARGET_ADDR --command "sudo rm -rf ~/ain-blockchain; sudo mkdir ~/ain-blockchain; sudo chmod -R 777 ~/ain-blockchain" --project $PROJECT_ID --zone $TRACKER_ZONE
        SCP_CMD="gcloud compute scp --recurse $FILES_FOR_TRACKER ${TRACKER_TARGET_ADDR}:~/ain-blockchain --project $PROJECT_ID --zone $TRACKER_ZONE"
        printf "SCP_CMD=$SCP_CMD\n\n"
        eval $SCP_CMD
    fi

    # ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
    if [[ $SETUP_OPTION = "--setup" ]]; then
        # 2. Set up tracker
        printf "\n\n[[[ Setting up tracker ]]]\n\n"
        SETUP_CMD="gcloud compute ssh $TRACKER_TARGET_ADDR --command 'cd ./ain-blockchain; . setup_blockchain_ubuntu_gcp.sh' --project $PROJECT_ID --zone $TRACKER_ZONE"
        printf "SETUP_CMD=$SETUP_CMD\n\n"
        eval $SETUP_CMD
    fi

    # 3. Start tracker
    printf "\n\n[[[ Starting tracker ]]]\n\n"

    printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"

    printf "\n"
    START_TRACKER_CMD="gcloud compute ssh $TRACKER_TARGET_ADDR --command '$START_TRACKER_CMD_BASE $GCP_USER $KEEP_CODE_OPTION' --project $PROJECT_ID --zone $TRACKER_ZONE"
    printf "START_TRACKER_CMD=$START_TRACKER_CMD\n\n"
    eval $START_TRACKER_CMD
}

function deploy_node() {
    local node_index="$1"
    local node_target_addr=${NODE_TARGET_ADDR_LIST[${node_index}]}
    local node_zone=${NODE_ZONE_LIST[${node_index}]}

    printf "\n* >> Deploying files for node $node_index ($node_target_addr) *********************************************************\n\n"

    printf "node_target_addr='$node_target_addr'\n"
    printf "node_zone='$node_zone'\n"

    if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
        # 1. Copy files for node
        printf "\n\n<<< Copying files for node $node_index >>>\n\n"
        gcloud compute ssh $node_target_addr --command "sudo rm -rf ~/ain-blockchain; sudo mkdir ~/ain-blockchain; sudo chmod -R 777 ~/ain-blockchain" --project $PROJECT_ID --zone $node_zone
        SCP_CMD="gcloud compute scp --recurse $FILES_FOR_NODE ${node_target_addr}:~/ain-blockchain --project $PROJECT_ID --zone $node_zone"
        printf "SCP_CMD=$SCP_CMD\n\n"
        eval $SCP_CMD
    fi

    # ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
    if [[ $SETUP_OPTION = "--setup" ]]; then
        # 2. Set up node
        printf "\n\n<<< Setting up node $node_index >>>\n\n"
        SETUP_CMD="gcloud compute ssh $node_target_addr --command 'cd ./ain-blockchain; . setup_blockchain_ubuntu_gcp.sh' --project $PROJECT_ID --zone $node_zone"
        printf "SETUP_CMD=$SETUP_CMD\n\n"
        eval $SETUP_CMD
    fi

    # 3. Start node
    printf "\n\n<<< Starting node $node_index >>>\n\n"

    if [[ $node_index -ge $JSON_RPC_NODE_INDEX_GE ]] && [[ $node_index -le $JSON_RPC_NODE_INDEX_LE ]]; then
        JSON_RPC_OPTION="--json-rpc"
    else
        JSON_RPC_OPTION=""
    fi
    UPDATE_FRONT_DB_OPTION="--update-front-db"
    if [[ $node_index -ge $REST_FUNC_NODE_INDEX_GE ]] && [[ $node_index -le $REST_FUNC_NODE_INDEX_LE ]]; then
        REST_FUNC_OPTION="--rest-func"
    else
        REST_FUNC_OPTION=""
    fi
    if [[ $node_index -ge $EVENT_HANDLER_NODE_INDEX_GE ]] && [[ $node_index -le $EVENT_HANDLER_NODE_INDEX_LE ]]; then
        EVENT_HANDLER_OPTION="--event-handler"
    else
        EVENT_HANDLER_OPTION=""
    fi

    printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
    printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
    printf "KEEP_DATA_OPTION=$KEEP_DATA_OPTION\n"
    printf "SYNC_MODE_OPTION=$SYNC_MODE_OPTION\n"
    printf "CHOWN_DATA_OPTION=$CHOWN_DATA_OPTION\n"
    printf "JSON_RPC_OPTION=$JSON_RPC_OPTION\n"
    printf "UPDATE_FRONT_DB_OPTION=$UPDATE_FRONT_DB_OPTION\n"
    printf "REST_FUNC_OPTION=$REST_FUNC_OPTION\n"
    printf "EVENT_HANDLER_OPTION=$EVENT_HANDLER_OPTION\n"

    printf "\n"
    START_NODE_CMD="gcloud compute ssh $node_target_addr --command '$START_NODE_CMD_BASE $SEASON $GCP_USER 0 $node_index $KEEP_CODE_OPTION $KEEP_DATA_OPTION $SYNC_MODE_OPTION $CHOWN_DATA_OPTION $ACCOUNT_INJECTION_OPTION $JSON_RPC_OPTION $UPDATE_FRONT_DB_OPTION $REST_FUNC_OPTION $EVENT_HANDLER_OPTION' --project $PROJECT_ID --zone $node_zone"
    printf "START_NODE_CMD=$START_NODE_CMD\n\n"
    eval $START_NODE_CMD

    # 4. Inject node account
    sleep 5
    if [[ $ACCOUNT_INJECTION_OPTION = "--keystore" ]]; then
        local node_url=${NODE_URL_LIST[${node_index}]}
        printf "\n* >> Initializing account for node $node_index ($node_target_addr) ********************\n\n"
        printf "node_url='$node_url'\n"

        KEYSTORE_FILE_PATH="$KEYSTORE_DIR/keystore_node_$node_index.json"
        {
            echo $KEYSTORE_FILE_PATH
            sleep 1
            echo $KEYSTORE_PW
        } | node inject_node_account.js $node_url $ACCOUNT_INJECTION_OPTION
    elif [[ $ACCOUNT_INJECTION_OPTION = "--mnemonic" ]]; then
        local node_url=${NODE_URL_LIST[${node_index}]}
        local MNEMONIC=${MNEMONIC_LIST[${node_index}]}
        printf "\n* >> Injecting an account for node $node_index ($node_target_addr) ********************\n\n"
        printf "node_url='$node_url'\n"

        {
            echo $MNEMONIC
            sleep 1
            echo 0
        } | node inject_node_account.js $node_url $ACCOUNT_INJECTION_OPTION
    else
        local node_url=${NODE_URL_LIST[${node_index}]}
        printf "\n* >> Injecting an account for node $node_index ($node_target_addr) ********************\n\n"
        printf "node_url='$node_url'\n"
        local GENESIS_ACCOUNTS_PATH="blockchain-configs/base/genesis_accounts.json"
        if [[ "$SEASON" = "spring" ]] || [[ "$SEASON" = "summer" ]]; then
            GENESIS_ACCOUNTS_PATH="blockchain-configs/testnet-prod/genesis_accounts.json"
        fi
        PRIVATE_KEY=$(cat $GENESIS_ACCOUNTS_PATH | jq -r '.others['$node_index'].private_key')
        echo $PRIVATE_KEY | node inject_node_account.js $node_url $ACCOUNT_INJECTION_OPTION
    fi

    # 5. Wait until node is synced
    printf "\n\n<<< Waiting until node $node_index is synced >>>\n\n"
    WAIT_CMD="gcloud compute ssh $node_target_addr --command 'cd \$(find /home/ain-blockchain* -maxdepth 0 -type d); . wait_until_node_sync_gcp.sh' --project $PROJECT_ID --zone $node_zone"
    printf "WAIT_CMD=$WAIT_CMD\n\n"
    eval $WAIT_CMD
}

printf "###############################################################################\n"
printf "# Deploying parent blockchain #\n"
printf "###############################################################################\n\n"

TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-tracker-taiwan"
NODE_TARGET_ADDR_LIST=(
    "${GCP_USER}@${SEASON}-node-0-taiwan" \
    "${GCP_USER}@${SEASON}-node-1-oregon" \
    "${GCP_USER}@${SEASON}-node-2-singapore" \
    "${GCP_USER}@${SEASON}-node-3-iowa" \
    "${GCP_USER}@${SEASON}-node-4-netherlands" \
    "${GCP_USER}@${SEASON}-node-5-taiwan" \
    "${GCP_USER}@${SEASON}-node-6-oregon" \
    "${GCP_USER}@${SEASON}-node-7-singapore" \
    "${GCP_USER}@${SEASON}-node-8-iowa" \
    "${GCP_USER}@${SEASON}-node-9-netherlands" \
)

printf "\nStarting blockchain servers...\n\n"
if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
    GO_TO_PROJECT_ROOT_CMD="cd ./ain-blockchain"
else
    GO_TO_PROJECT_ROOT_CMD="cd \$(find /home/ain-blockchain* -maxdepth 0 -type d)"
fi
if [[ $KEEP_DATA_OPTION = "--no-keep-data" ]]; then
    # restart after removing chains, snapshots, and log files (but keep the keys)
    CHAINS_DIR=/home/ain_blockchain_data/chains
    SNAPSHOTS_DIR=/home/ain_blockchain_data/snapshots
    LOGS_DIR=/home/ain_blockchain_data/logs
    START_TRACKER_CMD_BASE="sudo rm -rf /home/ain_blockchain_data/ && $GO_TO_PROJECT_ROOT_CMD && . start_tracker_incremental_gcp.sh"
    START_NODE_CMD_BASE="sudo rm -rf $CHAINS_DIR $SNAPSHOTS_DIR $LOGS_DIR && $GO_TO_PROJECT_ROOT_CMD && . start_node_incremental_gcp.sh"
else
    # restart with existing chains, snapshots, and log files
    START_TRACKER_CMD_BASE="$GO_TO_PROJECT_ROOT_CMD && . start_tracker_incremental_gcp.sh"
    START_NODE_CMD_BASE="$GO_TO_PROJECT_ROOT_CMD && . start_node_incremental_gcp.sh"
fi

# Tracker server is deployed with PARENT_NODE_INDEX_BEGIN = -1
if [[ $PARENT_NODE_INDEX_BEGIN = -1 ]]; then
    deploy_tracker
fi
begin_index=$PARENT_NODE_INDEX_BEGIN
if [[ $begin_index -lt 0 ]]; then
  begin_index=0
fi
if [[ $begin_index -le $PARENT_NODE_INDEX_END ]] && [[ $PARENT_NODE_INDEX_END -ge 0 ]]; then
    for node_index in `seq $(( $begin_index )) $(( $PARENT_NODE_INDEX_END ))`; do
        deploy_node "$node_index"
        sleep 40
    done
fi

if [[ $NUM_SHARDS -gt 0 ]]; then
    for shard_index in $(seq $NUM_SHARDS); do
        printf "###############################################################################\n"
        printf "# Deploying shard $shard_index blockchain #\n"
        printf "###############################################################################\n\n"

        TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${shard_index}-tracker-taiwan"
        NODE_TARGET_ADDR_LIST=( \
            "${GCP_USER}@${SEASON}-shard-${shard_index}-node-0-taiwan" \
            "${GCP_USER}@${SEASON}-shard-${shard_index}-node-1-oregon" \
            "${GCP_USER}@${SEASON}-shard-${shard_index}-node-2-singapore")

        deploy_tracker "$NUM_SHARD_NODES"
        for node_index in `seq 0 $(( ${NUM_SHARD_NODES} - 1 ))`; do
            deploy_node "$node_index"
        done
    done
fi
