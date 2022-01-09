#!/bin/bash

if [[ $# -lt 5 ]] || [[ $# -gt 11 ]]; then
    printf "Usage: bash deploy_blockchain_incremental_gcp.sh [dev|staging|sandbox|spring|summer|mainnet] <GCP Username> <# of Shards> <Begin Parent Node Index> <End Parent Node Index> [--setup] [--keystore|--mnemonic|--private-key] [--keep-code|--no-keep-code] [--keep-data|--no-keep-data] [--full-sync|--fast-sync]\n"
    printf "Example: bash deploy_blockchain_incremental_gcp.sh dev lia 0 0 1 --setup --keystore --no-keep-code --full-sync\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ deploy_blockchain_incremental_gcp.sh ]]]]]\n\n"

if [[ "$1" = 'dev' ]] || [[ "$1" = 'staging' ]] || [[ "$1" = 'sandbox' ]] || [[ "$1" = 'spring' ]] || [[ "$1" = 'summer' ]] || [[ "$1" = 'mainnet' ]]; then
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

GCP_USER="$2"
printf "GCP_USER=$GCP_USER\n"

number_re='^[0-9]+$'
if ! [[ $3 =~ $number_re ]] ; then
    printf "Invalid <# of Shards> argument: $3\n"
    exit
fi
NUM_SHARDS=$3
printf "NUM_SHARDS=$NUM_SHARDS\n"
BEGIN_PARENT_NODE_INDEX=$4
printf "BEGIN_PARENT_NODE_INDEX=$BEGIN_PARENT_NODE_INDEX\n"
END_PARENT_NODE_INDEX=$5
printf "END_PARENT_NODE_INDEX=$END_PARENT_NODE_INDEX\n"
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

ARG_INDEX=6
while [ $ARG_INDEX -le $# ]
do
  parse_options "${!ARG_INDEX}"
  ((ARG_INDEX++))
done

printf "SETUP_OPTION=$SETUP_OPTION\n"
printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
printf "KEEP_DATA_OPTION=$KEEP_DATA_OPTION\n"
printf "SYNC_MODE_OPTION=$SYNC_MODE_OPTION\n"

if [[ "$ACCOUNT_INJECTION_OPTION" = "" ]]; then
    printf "Must provide an ACCOUNT_INJECTION_OPTION\n"
    exit
fi

# Get confirmation.
printf "\n"
read -p "Do you want to proceed? >> (y/N) " -n 1 -r
printf "\n\n"
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
fi

# Read node ip addresses
IFS=$'\n' read -d '' -r -a IP_ADDR_LIST < ./ip_addresses/$SEASON.txt
if [[ $ACCOUNT_INJECTION_OPTION = "--keystore" ]]; then
    # Get keystore password
    printf "Enter password: "
    read -s PASSWORD
    printf "\n\n"
    if [[ $SEASON = "mainnet" ]]; then
        KEYSTORE_DIR="mainnet_prod_keys/"
    elif [[ $SEASON = "spring" ]] || [[ $SEASON = "summer" ]]; then
        KEYSTORE_DIR="testnet_prod_keys/"
    else
        KEYSTORE_DIR="testnet_dev_staging_keys/"
    fi
elif [[ $ACCOUNT_INJECTION_OPTION = "--mnemonic" ]]; then
    IFS=$'\n' read -d '' -r -a MNEMONIC_LIST < ./testnet_mnemonics/$SEASON.txt
fi

FILES_FOR_TRACKER="blockchain/ blockchain-configs/ block-pool/ client/ common/ consensus/ db/ logger/ tracker-server/ traffic/ package.json setup_blockchain_ubuntu.sh start_tracker_genesis_gcp.sh start_tracker_incremental_gcp.sh"
FILES_FOR_NODE="blockchain/ blockchain-configs/ block-pool/ client/ common/ consensus/ db/ event-handler/ json_rpc/ logger/ node/ p2p/ tools/ traffic/ tx-pool/ $KEYSTORE_DIR package.json setup_blockchain_ubuntu.sh start_node_genesis_gcp.sh start_node_incremental_gcp.sh wait_until_node_sync_gcp.sh"

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
    printf "\n* >> Deploying tracker ********************************************************\n\n"

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
        SETUP_CMD="gcloud compute ssh $TRACKER_TARGET_ADDR --command '. setup_blockchain_ubuntu.sh' --project $PROJECT_ID --zone $TRACKER_ZONE"
        printf "SETUP_CMD=$SETUP_CMD\n\n"
        eval $SETUP_CMD
    fi

    # 3. Start tracker
    printf "\n\n[[[ Starting tracker ]]]\n\n"

    printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"

    printf "\n"
    START_TRACKER_CMD="gcloud compute ssh $TRACKER_TARGET_ADDR --command '$START_TRACKER_CMD_BASE $KEEP_CODE_OPTION' --project $PROJECT_ID --zone $TRACKER_ZONE"
    printf "START_TRACKER_CMD=$START_TRACKER_CMD\n\n"
    eval $START_TRACKER_CMD
}

function deploy_node() {
    local node_index="$1"
    local node_target_addr=${NODE_TARGET_ADDR_LIST[${node_index}]}
    local node_zone=${NODE_ZONE_LIST[${node_index}]}

    printf "\n* >> Deploying node $node_index *********************************************************\n\n"

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
        SETUP_CMD="gcloud compute ssh $node_target_addr --command '. setup_blockchain_ubuntu.sh' --project $PROJECT_ID --zone $node_zone"
        printf "SETUP_CMD=$SETUP_CMD\n\n"
        eval $SETUP_CMD
    fi

    # 3. Start node
    printf "\n\n<<< Starting node $node_index >>>\n\n"
    if [[ $node_index -gt 4 ]]; then
        JSON_RPC_OPTION="--json-rpc"
        REST_FUNC_OPTION="--rest-func"
    else
        JSON_RPC_OPTION=""
        REST_FUNC_OPTION=""
    fi

    printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
    printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
    printf "KEEP_DATA_OPTION=$KEEP_DATA_OPTION\n"
    printf "SYNC_MODE_OPTION=$SYNC_MODE_OPTION\n"
    printf "JSON_RPC_OPTION=$JSON_RPC_OPTION\n"
    printf "REST_FUNC_OPTION=$REST_FUNC_OPTION\n"

    printf "\n"
    START_NODE_CMD="gcloud compute ssh $node_target_addr --command '$START_NODE_CMD_BASE $SEASON 0 $node_index $KEEP_CODE_OPTION $KEEP_DATA_OPTION $SYNC_MODE_OPTION $ACCOUNT_INJECTION_OPTION $JSON_RPC_OPTION $REST_FUNC_OPTION' --project $PROJECT_ID --zone $node_zone"
    printf "START_NODE_CMD=$START_NODE_CMD\n\n"
    eval $START_NODE_CMD

    # 4. Inject node account
    if [[ $ACCOUNT_INJECTION_OPTION = "--keystore" ]]; then
        local node_ip_addr=${IP_ADDR_LIST[${node_index}]}
        printf "\n* >> Initializing account for node $node_index ********************\n\n"
        printf "node_ip_addr='$node_ip_addr'\n"

        echo $PASSWORD | node inject_account_gcp.js $node_ip_addr $ACCOUNT_INJECTION_OPTION
    elif [[ $ACCOUNT_INJECTION_OPTION = "--mnemonic" ]]; then
        local node_ip_addr=${IP_ADDR_LIST[${node_index}]}
        local MNEMONIC=${MNEMONIC_LIST[${node_index}]}
        printf "\n* >> Injecting an account for node $node_index ********************\n\n"
        printf "node_ip_addr='$node_ip_addr'\n"

        {
            echo $MNEMONIC
            sleep 1
            echo 0
        } | node inject_account_gcp.js $node_ip_addr $ACCOUNT_INJECTION_OPTION
    else
        local node_ip_addr=${IP_ADDR_LIST[${node_index}]}
        printf "\n* >> Injecting an account for node $node_index ********************\n\n"
        printf "node_ip_addr='$node_ip_addr'\n"
        local GENESIS_ACCOUNTS_PATH="blockchain-configs/base/genesis_accounts.json"
        if [[ "$SEASON" = "spring" ]] || [[ "$SEASON" = "summer" ]]; then
            GENESIS_ACCOUNTS_PATH="blockchain-configs/testnet-prod/genesis_accounts.json"
        fi
        PRIVATE_KEY=$(cat $GENESIS_ACCOUNTS_PATH | jq -r '.others['$node_index'].private_key')
        echo $PRIVATE_KEY | node inject_account_gcp.js $node_ip_addr $ACCOUNT_INJECTION_OPTION
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

# Tracker server is deployed with node 0
if [[ $BEGIN_PARENT_NODE_INDEX = 0 ]]; then
    deploy_tracker
fi
for j in `seq $BEGIN_PARENT_NODE_INDEX $(( $END_PARENT_NODE_INDEX - 1 ))`
    do
        deploy_node "$j"
        sleep 40
    done

if [[ $NUM_SHARDS -gt 0 ]]; then
    for i in $(seq $NUM_SHARDS)
        do
            printf "###############################################################################\n"
            printf "# Deploying shard $i blockchain #\n"
            printf "###############################################################################\n\n"

            TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-tracker-taiwan"
            NODE_TARGET_ADDR_LIST=( \
                "${GCP_USER}@${SEASON}-shard-${i}-node-0-taiwan" \
                "${GCP_USER}@${SEASON}-shard-${i}-node-1-oregon" \
                "${GCP_USER}@${SEASON}-shard-${i}-node-2-singapore")

            deploy_tracker "$NUM_SHARD_NODES"
            for j in `seq 0 $(( ${NUM_SHARD_NODES} - 1 ))`
                do
                    deploy_node "$j"
                done
    done
fi
