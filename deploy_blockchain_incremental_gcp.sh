#!/bin/sh

if [[ "$#" -lt 4 ]]; then
    echo "Usage: sh deploy_blockchain_incremental_gcp.sh [dev|staging|spring|summer] <GCP Username> <# of Shards> [canary|full] [--setup]"
    echo "Example: sh deploy_blockchain_incremental_gcp.sh dev lia 0 canary --setup"
    exit
fi

if [[ "$1" == 'spring' ]] || [[ "$1" == 'summer' ]] || [[ "$1" == 'dev' ]] || [[ "$1" == 'staging' ]]; then
    SEASON="$1"
    if [[ "$1" == 'spring' ]] || [[ "$1" == 'summer' ]]; then
        PROJECT_ID="testnet-prod-ground"
    else
        PROJECT_ID="testnet-$1-ground"
    fi
else
    echo "Invalid project/season argument: $1"
    exit
fi
echo "SEASON=$SEASON"
echo "PROJECT_ID=$PROJECT_ID"

GCP_USER="$2"
echo "GCP_USER=$GCP_USER"

NUM_SHARDS=$3
echo "NUM_SHARDS=$NUM_SHARDS"

if [[ "$4" == 'canary' ]] || [[ "$4" == 'full' ]]; then
    RUN_MODE="$4"
else
    echo "Invalid run mode argument: $4"
    exit
fi
echo "RUN_MODE=$RUN_MODE"

OPTIONS="$5"
echo "OPTIONS=$OPTIONS"

# Get confirmation.
echo
read -p "Do you want to proceed? >> (y/N) " -n 1 -r
echo
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    [[ "$0" == "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
fi

FILES_FOR_TRACKER="blockchain/ client/ common/ consensus/ db/ genesis-configs/ logger/ tracker-server/ package.json setup_tracker_gcp.sh setup_blockchain_ubuntu.sh start_tracker_gcp.sh"
FILES_FOR_NODE="blockchain/ client/ common/ consensus/ db/ json_rpc/ genesis-configs/ logger/ node/ tx-pool/ p2p/ package.json setup_blockchain_ubuntu.sh start_node_incremental_gcp.sh"

TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-tracker-taiwan"
NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-node-0-taiwan"
NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-node-1-oregon"
NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-node-2-singapore"
NODE_3_TARGET_ADDR="${GCP_USER}@${SEASON}-node-3-iowa"
NODE_4_TARGET_ADDR="${GCP_USER}@${SEASON}-node-4-netherlands"

TRACKER_ZONE="asia-east1-b"
NODE_0_ZONE="asia-east1-b"
NODE_1_ZONE="us-west1-b"
NODE_2_ZONE="asia-southeast1-b"
NODE_3_ZONE="us-central1-a"
NODE_4_ZONE="europe-west4-a"

# 1. Copy files to gcp
printf "\nDeploying parent blockchain...\n"
if [[ $RUN_MODE == "canary" ]]; then
    printf "\nCopying files to parent node 0 (${NODE_0_TARGET_ADDR})...\n\n"
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_0_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_0_ZONE
else
    printf "\nCopying files to parent tracker (${TRACKER_TARGET_ADDR})...\n\n"
    gcloud compute scp --recurse $FILES_FOR_TRACKER ${TRACKER_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $TRACKER_ZONE
    printf "\nCopying files to parent node 0 (${NODE_0_TARGET_ADDR})...\n\n"
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_0_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_0_ZONE
    printf "\nCopying files to parent node 1 (${NODE_1_TARGET_ADDR})...\n\n"
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_1_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_1_ZONE
    printf "\nCopying files to parent node 2 (${NODE_2_TARGET_ADDR})...\n\n"
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_2_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_2_ZONE
    printf "\nCopying files to parent node 3 (${NODE_3_TARGET_ADDR})...\n\n"
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_3_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_3_ZONE
    printf "\nCopying files to parent node 4 (${NODE_4_TARGET_ADDR})...\n\n"
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_4_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_4_ZONE
fi

# ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
if [[ $OPTIONS == "--setup" ]]; then
    if [[ $RUN_MODE == "canary" ]]; then
        printf "\n\n##########################\n# Setting up parent node 0 #\n##########################\n\n"
        gcloud compute ssh $NODE_0_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_0_ZONE
    else
        printf "\n\n##########################\n# Setting up parent tracker #\n###########################\n\n"
        gcloud compute ssh $TRACKER_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $TRACKER_ZONE
        printf "\n\n##########################\n# Setting up parent node 0 #\n##########################\n\n"
        gcloud compute ssh $NODE_0_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_0_ZONE
        printf "\n\n##########################\n# Setting up parent node 1 #\n##########################\n\n"
        gcloud compute ssh $NODE_1_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_1_ZONE
        printf "\n\n##########################\n# Setting up parent node 2 #\n##########################\n\n"
        gcloud compute ssh $NODE_2_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_2_ZONE
        printf "\n\n##########################\n# Setting up parent node 3 #\n##########################\n\n"
        gcloud compute ssh $NODE_3_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_3_ZONE
        printf "\n\n##########################\n# Setting up parent node 4 #\n##########################\n\n"
        gcloud compute ssh $NODE_4_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_4_ZONE
    fi
fi

# 2. Set up parent chain
if [[ $RUN_MODE == "canary" ]]; then
    printf "\n\n###########################\n# Running parent node 0 #\n###########################\n\n"
    gcloud compute ssh $NODE_0_TARGET_ADDR --command ". start_node_incremental_gcp.sh $SEASON 0 0" --project $PROJECT_ID --zone $NODE_0_ZONE
else
    printf "\n\n############################\n# Running parent tracker #\n############################\n\n"
    gcloud compute ssh $TRACKER_TARGET_ADDR --command ". setup_tracker_gcp.sh && . start_tracker_gcp.sh" --project $PROJECT_ID --zone $TRACKER_ZONE
    printf "\n\n###########################\n# Running parent node 0 #\n###########################\n\n"
    gcloud compute ssh $NODE_0_TARGET_ADDR --command ". start_node_incremental_gcp.sh $SEASON 0 0" --project $PROJECT_ID --zone $NODE_0_ZONE
    printf "\n\n#########################\n# Running parent node 1 #\n#########################\n\n"
    gcloud compute ssh $NODE_1_TARGET_ADDR --command ". start_node_incremental_gcp.sh $SEASON 0 1" --project $PROJECT_ID --zone $NODE_1_ZONE
    printf "\n\n#########################\n# Running parent node 2 #\n#########################\n\n"
    gcloud compute ssh $NODE_2_TARGET_ADDR --command ". start_node_incremental_gcp.sh $SEASON 0 2" --project $PROJECT_ID --zone $NODE_2_ZONE
    printf "\n\n#########################\n# Running parent node 3 #\n#########################\n\n"
    gcloud compute ssh $NODE_3_TARGET_ADDR --command ". start_node_incremental_gcp.sh $SEASON 0 3" --project $PROJECT_ID --zone $NODE_3_ZONE
    printf "\n\n#########################\n# Running parent node 4 #\n#########################\n\n"
    gcloud compute ssh $NODE_4_TARGET_ADDR --command ". start_node_incremental_gcp.sh $SEASON 0 4" --project $PROJECT_ID --zone $NODE_4_ZONE
fi

# 3. Shards
if [[ "$NUM_SHARDS" -gt 0 ]]; then
    printf "\nDeploying shard blockchains..."
    for i in $(seq $NUM_SHARDS)
        do
            echo "shard #$i"

            # generate genesis config files in ./blockchain/shard_$i
            if [[ $OPTIONS == "--setup" ]]; then
                node ./tools/generateShardGenesisFiles.js $SEASON 10 $i
            fi

            SHARD_TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-tracker-taiwan"
            SHARD_NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-0-taiwan"
            SHARD_NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-1-oregon"
            SHARD_NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-2-singapore"

            # deploy files to GCP instances
            if [[ $RUN_MODE == "canary" ]]; then
                printf "\nDeploying files to shard_$i node 0 ${SHARD_NODE_0_TARGET_ADDR}..."
                gcloud compute scp --recurse $FILES_FOR_NODE ${SHARD_NODE_0_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_0_ZONE
            else
                printf "\nDeploying files to shard_$i tracker ${SHARD_TRACKER_TARGET_ADDR}..."
                gcloud compute scp --recurse $FILES_FOR_TRACKER ${SHARD_TRACKER_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $TRACKER_ZONE
                printf "\nDeploying files to shard_$i node 0 ${SHARD_NODE_0_TARGET_ADDR}..."
                gcloud compute scp --recurse $FILES_FOR_NODE ${SHARD_NODE_0_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_0_ZONE
                printf "\nDeploying files to shard_$i node 1 ${SHARD_NODE_1_TARGET_ADDR}..."
                gcloud compute scp --recurse $FILES_FOR_NODE ${SHARD_NODE_1_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_1_ZONE
                printf "\nDeploying files to shard_$i node 2 ${SHARD_NODE_2_TARGET_ADDR}..."
                gcloud compute scp --recurse $FILES_FOR_NODE ${SHARD_NODE_2_TARGET_ADDR}:~/  --project $PROJECT_ID --zone $NODE_2_ZONE
            fi

            # ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
            if [[ $OPTIONS == "--setup" ]]; then
                if [[ $RUN_MODE == "canary" ]]; then
                    printf "\n\n##########################\n# Setting up  shard_$i node 0 #\n##########################\n\n"
                    gcloud compute ssh $SHARD_NODE_0_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_0_ZONE
                else
                    printf "\n\n###########################\n# Setting up shard_$i tracker #\n###########################\n\n"
                    gcloud compute ssh $SHARD_TRACKER_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $TRACKER_ZONE
                    printf "\n\n##########################\n# Setting up  shard_$i node 0 #\n##########################\n\n"
                    gcloud compute ssh $SHARD_NODE_0_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_0_ZONE
                    printf "\n\n##########################\n# Setting up  shard_$i node 1 #\n##########################\n\n"
                    gcloud compute ssh $SHARD_NODE_1_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_1_ZONE
                    printf "\n\n##########################\n# Setting up  shard_$i node 2 #\n##########################\n\n"
                    gcloud compute ssh $SHARD_NODE_2_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_2_ZONE
                fi
            fi

            # ssh into each instance, install packages and start up the server
            if [[ $RUN_MODE == "canary" ]]; then
                printf "\n\n##########################\n# Running shard_$i node 0 #\n##########################\n\n"
                gcloud compute ssh $SHARD_NODE_0_TARGET_ADDR --command ". start_node_incremental_gcp.sh $SEASON $i 0" --project $PROJECT_ID --zone $NODE_0_ZONE
            else
                printf "\n\n###########################\n# Running shard_$i tracker #\n###########################\n\n"
                gcloud compute ssh $SHARD_TRACKER_TARGET_ADDR --command ". setup_tracker_gcp.sh && . start_tracker_gcp.sh" --project $PROJECT_ID --zone $TRACKER_ZONE
                printf "\n\n##########################\n# Running shard_$i node 0 #\n##########################\n\n"
                gcloud compute ssh $SHARD_NODE_0_TARGET_ADDR --command ". start_node_incremental_gcp.sh $SEASON $i 0" --project $PROJECT_ID --zone $NODE_0_ZONE
                printf "\n\n##########################\n# Running shard_$i node 1 #\n##########################\n\n"
                gcloud compute ssh $SHARD_NODE_1_TARGET_ADDR --command ". start_node_incremental_gcp.sh $SEASON $i 1" --project $PROJECT_ID --zone $NODE_1_ZONE
                printf "\n\n##########################\n# Running shard_$i node 2 #\n##########################\n\n"
                gcloud compute ssh $SHARD_NODE_2_TARGET_ADDR --command ". start_node_incremental_gcp.sh $SEASON $i 2" --project $PROJECT_ID --zone $NODE_2_ZONE
            fi
        done
fi
