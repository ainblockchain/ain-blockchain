#!/bin/bash

if [[ $# -lt 3 ]] || [[ $# -gt 9 ]]; then
    printf "Usage: bash deploy_blockchain_incremental_gcp.sh [dev|staging|spring|summer] <GCP Username> <# of Shards> [--setup] [--canary] [--full-sync] [--keystore|--mnemonic] [--restart|--reset]\n"
    printf "Example: bash deploy_blockchain_incremental_gcp.sh dev lia 0 --setup --canary --full-sync --keystore\n"
    exit
fi

if [[ "$1" = 'spring' ]] || [[ "$1" = 'summer' ]] || [[ "$1" = 'dev' ]] || [[ "$1" = 'staging' ]]; then
    SEASON="$1"
    if [[ "$1" = 'spring' ]] || [[ "$1" = 'summer' ]]; then
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

printf "GCP_USER=$GCP_USER\n"
GCP_USER="$2"

number_re='^[0-9]+$'
if ! [[ $3 =~ $number_re ]] ; then
    printf "Invalid <# of Shards> argument: $3\n"
    exit
fi
printf "NUM_SHARDS=$NUM_SHARDS\n"
NUM_SHARDS=$3

function parse_options() {
    local option="$1"
    if [[ $option = '--setup' ]]; then
        SETUP_OPTION="$option"
    elif [[ $option = '--canary' ]]; then
        RUN_MODE_OPTION="$option"
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
    elif [[ $option = '--restart' ]]; then
        if [[ "$RESET_RESTART_OPTION" ]]; then
            printf "You cannot use both restart and reset\n"
            exit
        fi
        RESET_RESTART_OPTION="$option"
    elif [[ $option = '--reset' ]]; then
        if [[ "$RESET_RESTART_OPTION" ]]; then
            printf "You cannot use both restart and reset\n"
            exit
        fi
        RESET_RESTART_OPTION="$option"
    else
        printf "Invalid option: $option\n"
        exit
    fi
}

# Parse options.
SETUP_OPTION=""
RUN_MODE_OPTION=""
FULL_SYNC_OPTION=""
ACCOUNT_INJECTION_OPTION=""
RESET_RESTART_OPTION=""

ARG_INDEX=4
while [ $ARG_INDEX -le $# ]
do
  parse_options "${!ARG_INDEX}"
  ((ARG_INDEX++))
done

printf "SETUP_OPTION=$SETUP_OPTION\n"
printf "RUN_MODE_OPTION=$RUN_MODE_OPTION\n"
printf "FULL_SYNC_OPTION=$FULL_SYNC_OPTION\n"
printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
printf "RESET_RESTART_OPTION=$RESET_RESTART_OPTION\n"

# Get confirmation.
printf "\n"
read -p "Do you want to proceed? >> (y/N) " -n 1 -r
printf "\n\n"
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
fi

if [[ $ACCOUNT_INJECTION_OPTION = "--keystore" ]]; then
    # Get keystore password
    echo -n "Enter password: "
    read -s PASSWORD
    echo
    echo

    # Read node ip addresses
    IFS=$'\n' read -d '' -r -a IP_ADDR_LIST < ./testnet_ip_addresses/$SEASON.txt

    if [[ $SEASON = "spring" ]] || [[ $SEASON = "summer" ]]; then
        KEYSTORE_DIR="testnet_prod_keys/"
    else
        KEYSTORE_DIR="testnet_dev_staging_keys/"
    fi
elif [[ $ACCOUNT_INJECTION_OPTION = "--mnemonic" ]]; then
    # Read node ip addresses
    IFS=$'\n' read -d '' -r -a IP_ADDR_LIST < ./testnet_ip_addresses/$SEASON.txt

    IFS=$'\n' read -d '' -r -a MNEMONIC_LIST < ./testnet_mnemonics/$SEASON.txt
fi

FILES_FOR_TRACKER="blockchain/ block-pool/ client/ common/ consensus/ db/ genesis-configs/ logger/ tracker-server/ traffic/ package.json setup_blockchain_ubuntu.sh start_tracker_genesis_gcp.sh start_tracker_incremental_gcp.sh"
FILES_FOR_NODE="blockchain/ block-pool/ client/ common/ consensus/ db/ genesis-configs/ json_rpc/ logger/ node/ p2p/ tools/ traffic/ tx-pool/ $KEYSTORE_DIR package.json setup_blockchain_ubuntu.sh start_node_genesis_gcp.sh start_node_incremental_gcp.sh wait_until_node_sync_gcp.sh"

NUM_PARENT_NODES=7
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
)

function deploy_tracker() {
    local num_nodes="$1"

    printf "\n* >> Deploying tracker ********************************************************\n\n"

    printf "TRACKER_TARGET_ADDR='$TRACKER_TARGET_ADDR'\n"
    printf "TRACKER_ZONE='$TRACKER_ZONE'\n"

    if [[ $RESET_RESTART_OPTION = "" ]]; then
        # 1. Copy files for tracker
        printf "\n\n[[[[ Copying files for tracker ]]]]\n\n"
        SCP_CMD="gcloud compute scp --recurse $FILES_FOR_TRACKER ${TRACKER_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $TRACKER_ZONE"
        printf "SCP_CMD=$SCP_CMD\n\n"
        eval $SCP_CMD
    fi

    # ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
    if [[ $SETUP_OPTION = "--setup" ]]; then
        # 2. Set up tracker
        printf "\n\n[[[[ Setting up tracker ]]]]\n\n"
        SETUP_CMD="gcloud compute ssh $TRACKER_TARGET_ADDR --command '. setup_blockchain_ubuntu.sh' --project $PROJECT_ID --zone $TRACKER_ZONE"
        printf "SETUP_CMD=$SETUP_CMD\n\n"
        eval $SETUP_CMD
    fi

    # 3. Start tracker
    printf "\n\n[[[[ Starting tracker ]]]]\n\n"

    printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"

    printf "\n"
    START_TRACKER_CMD="gcloud compute ssh $TRACKER_TARGET_ADDR --command '$START_TRACKER_CMD_BASE $num_nodes $KEEP_CODE_OPTION' --project $PROJECT_ID --zone $TRACKER_ZONE"
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

    if [[ $RESET_RESTART_OPTION = "" ]]; then
        # 1. Copy files for node
        printf "\n\n[[[[ Copying files for node $node_index ]]]]\n\n"
        SCP_CMD="gcloud compute scp --recurse $FILES_FOR_NODE ${node_target_addr}:~/ --project $PROJECT_ID --zone $node_zone"
        printf "SCP_CMD=$SCP_CMD\n\n"
        eval $SCP_CMD
    fi

    # ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
    if [[ $SETUP_OPTION = "--setup" ]]; then
        # 2. Set up node
        printf "\n\n[[[[ Setting up node $node_index ]]]]\n\n"
        SETUP_CMD="gcloud compute ssh $node_target_addr --command '. setup_blockchain_ubuntu.sh' --project $PROJECT_ID --zone $node_zone"
        printf "SETUP_CMD=$SETUP_CMD\n\n"
        eval $SETUP_CMD
    fi

    # 3. Start node
    printf "\n\n[[[[ Starting node $node_index ]]]]\n\n"
    if [[ $node_index -gt 4 ]]; then
        JSON_RPC_OPTION="--json-rpc"
        REST_FUNC_OPTION="--rest-func"
    else
        JSON_RPC_OPTION=""
        REST_FUNC_OPTION=""
    fi

    printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
    printf "FULL_SYNC_OPTION=$FULL_SYNC_OPTION\n"
    printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
    printf "JSON_RPC_OPTION=$JSON_RPC_OPTION\n"
    printf "REST_FUNC_OPTION=$REST_FUNC_OPTION\n"

    printf "\n"
    START_NODE_CMD="gcloud compute ssh $node_target_addr --command '$START_NODE_CMD_BASE $SEASON 0 $node_index $KEEP_CODE_OPTION $FULL_SYNC_OPTION $ACCOUNT_INJECTION_OPTION $JSON_RPC_OPTION $REST_FUNC_OPTION' --project $PROJECT_ID --zone $node_zone"
    printf "START_NODE_CMD=$START_NODE_CMD\n\n"
    eval $START_NODE_CMD

    # 4. Init account if necessary (if --keystore specified)
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
    fi

    #5. Wait until node is synced
    printf "\n\n[[[[ Waiting until node is synced $node_index ]]]]\n\n"
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
)

printf "\nStarting blockchain servers...\n\n"
if [[ $RESET_RESTART_OPTION = "--reset" ]]; then
    # restart after removing chains, snapshots, and log files
    CHAINS_DIR=/home/ain_blockchain_data/chains
    SNAPSHOTS_DIR=/home/ain_blockchain_data/snapshots
    START_TRACKER_CMD_BASE="sudo rm -rf /home/ain_blockchain_data/ && cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && sudo rm -rf ./logs/ && . start_tracker_incremental_gcp.sh"
    START_NODE_CMD_BASE="sudo rm -rf $CHAINS_DIR $SNAPSHOTS_DIR && cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && sudo rm -rf ./logs/ && . start_node_incremental_gcp.sh"
    KEEP_CODE_OPTION="--keep-code"
elif [[ $RESET_RESTART_OPTION = "--restart" ]]; then
    # restart
    START_TRACKER_CMD_BASE="cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && . start_tracker_incremental_gcp.sh"
    START_NODE_CMD_BASE="cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && . start_node_incremental_gcp.sh"
    KEEP_CODE_OPTION="--keep-code"
else
    # start
    START_TRACKER_CMD_BASE=". start_tracker_incremental_gcp.sh"
    START_NODE_CMD_BASE=". start_node_incremental_gcp.sh"
    KEEP_CODE_OPTION=""
fi

if [[ $RUN_MODE_OPTION = "--canary" ]]; then
    deploy_node "0"
else
    deploy_tracker "$NUM_PARENT_NODES"
    for j in `seq 0 $(( ${NUM_PARENT_NODES} - 1 ))`
        do
            deploy_node "$j"
        done
fi

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

            if [[ $RUN_MODE_OPTION = "--canary" ]]; then
                deploy_node "0"
            else
                deploy_tracker "$NUM_SHARD_NODES"
                for j in `seq 0 $(( ${NUM_SHARD_NODES} - 1 ))`
                    do
                        deploy_node "$j"
                    done
            fi
    done
fi
