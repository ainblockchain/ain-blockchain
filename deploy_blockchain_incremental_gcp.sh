#!/bin/sh

if [[ "$#" -lt 5 ]] || [[ "$#" -gt 6 ]]; then
    printf "Usage: sh deploy_blockchain_incremental_gcp.sh [dev|staging|spring|summer] <GCP Username> <# of Shards> [fast|full] [canary|full] [--setup]\n"
    printf "Example: sh deploy_blockchain_incremental_gcp.sh dev lia 0 fast canary --setup\n"
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

GCP_USER="$2"
printf "GCP_USER=$GCP_USER\n"

NUM_SHARDS=$3
printf "NUM_SHARDS=$NUM_SHARDS\n"

if [[ "$4" = 'fast' ]] || [[ "$4" = 'full' ]]; then
    SYNC_MODE="$4"
else
    printf "Invalid <Sync Mode> argument: $4\n"
    exit
fi
printf "SYNC_MODE=$SYNC_MODE\n"

if [[ "$5" = 'canary' ]] || [[ "$5" = 'full' ]]; then
    RUN_MODE="$5"
else
    printf "Invalid <Run Mode> argument: $5\n"
    exit
fi
printf "RUN_MODE=$RUN_MODE\n"

OPTIONS="$6"
printf "OPTIONS=$OPTIONS\n"

# Get confirmation.
printf "\n"
read -p "Do you want to proceed? >> (y/N) " -n 1 -r
printf "\n\n"
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
fi

FILES_FOR_TRACKER="blockchain/ client/ common/ consensus/ db/ genesis-configs/ logger/ tracker-server/ package.json setup_blockchain_ubuntu.sh start_tracker_genesis_gcp.sh start_tracker_incremental_gcp.sh"
FILES_FOR_NODE="blockchain/ client/ common/ consensus/ db/ json_rpc/ genesis-configs/ logger/ node/ tx-pool/ p2p/ package.json setup_blockchain_ubuntu.sh start_node_genesis_gcp.sh start_node_incremental_gcp.sh"

NUM_PARENT_NODES=5
NUM_SHARD_NODES=3

TRACKER_ZONE="asia-east1-b"
NODE_ZONE_LIST=(
    "asia-east1-b" \
    "us-west1-b" \
    "asia-southeast1-b" \
    "us-central1-a" \
    "europe-west4-a")

function deploy_tracker() {
    local num_nodes="$1"

    printf "\n* >> Deploying tracker ********************************************************\n\n"

    printf "TRACKER_TARGET_ADDR='$TRACKER_TARGET_ADDR'\n"
    printf "TRACKER_ZONE='$TRACKER_ZONE'\n"

    # 1. Copy files to gcp
    printf "\n\n[[[[ Copying files for tracker ]]]]\n\n"
    SCP_CMD="gcloud compute scp --recurse $FILES_FOR_TRACKER ${TRACKER_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $TRACKER_ZONE"
    printf "SCP_CMD='$SCP_CMD'\n\n"
    eval $SCP_CMD

    # ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
    if [[ $OPTIONS = "--setup" ]]; then
        printf "\n\n[[[[ Setting up tracker ]]]]\n\n"
        SETUP_CMD="gcloud compute ssh $TRACKER_TARGET_ADDR --command '. setup_blockchain_ubuntu.sh' --project $PROJECT_ID --zone $TRACKER_ZONE"
        printf "SETUP_CMD='$SETUP_CMD'\n\n"
        eval $SETUP_CMD
    fi

    # 2. Start tracker
    printf "\n\n[[[[ Starting tracker ]]]]\n\n"
    START_CMD="gcloud compute ssh $TRACKER_TARGET_ADDR --command '. start_tracker_incremental_gcp.sh $num_nodes' --project $PROJECT_ID --zone $TRACKER_ZONE"
    printf "START_CMD='$START_CMD'\n\n"
    eval $START_CMD
}

function deploy_node() {
    local node_index="$1"
    local node_target_addr=${NODE_TARGET_ADDR_LIST[${node_index}]}
    local node_zone=${NODE_ZONE_LIST[${node_index}]}

    printf "\n* >> Deploying node $node_index *********************************************************\n\n"

    printf "node_target_addr='$node_target_addr'\n"
    printf "node_zone='$node_zone'\n"

    # 1. Copy files to gcp
    printf "\n\n[[[[ Copying files for node $node_index ]]]]\n\n"
    SCP_CMD="gcloud compute scp --recurse $FILES_FOR_NODE ${node_target_addr}:~/ --project $PROJECT_ID --zone $node_zone"
    printf "SCP_CMD='$SCP_CMD'\n\n"
    eval $SCP_CMD

    # ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
    if [[ $OPTIONS = "--setup" ]]; then
        printf "\n\n[[[[ Setting up node $node_index ]]]]\n\n"
        SETUP_CMD="gcloud compute ssh $node_target_addr --command '. setup_blockchain_ubuntu.sh' --project $PROJECT_ID --zone $node_zone"
        printf "SETUP_CMD='$SETUP_CMD'\n\n"
        eval $SETUP_CMD
    fi

    # 2. Start node
    printf "\n\n[[[[ Starting node $node_index ]]]]\n\n"
    START_CMD="gcloud compute ssh $node_target_addr --command '. start_node_incremental_gcp.sh $SEASON 0 $node_index $SYNC_MODE' --project $PROJECT_ID --zone $node_zone"
    printf "START_CMD='$START_CMD'\n\n"
    eval $START_CMD
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
    "${GCP_USER}@${SEASON}-node-4-netherlands")

if [[ $RUN_MODE = "canary" ]]; then
    deploy_node "0"
else
    deploy_tracker "$NUM_PARENT_NODES"
    for j in `seq 0 $(( ${NUM_PARENT_NODES} - 1 ))`
        do
            deploy_node "$j"
        done
fi

if [[ "$NUM_SHARDS" -gt 0 ]]; then
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

            if [[ $RUN_MODE = "canary" ]]; then
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
