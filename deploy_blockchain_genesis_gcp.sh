#!/bin/bash

if [[ "$#" -lt 3 ]] || [[ "$#" -gt 6 ]]; then
    echo "Usage: bash deploy_blockchain_genesis_gcp.sh [dev|staging|spring|summer] <GCP Username> <# of Shards> [--setup] [--keystore <Password>]"
    echo "Example: bash deploy_blockchain_genesis_gcp.sh dev lia 0 --setup"
    echo "Example: bash deploy_blockchain_genesis_gcp.sh dev lia 0 --keystore YOUR_PASSWORD"
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
    echo "Invalid project/season argument: $1"
    exit
fi
echo "SEASON=$SEASON"
echo "PROJECT_ID=$PROJECT_ID"

GCP_USER="$2"
echo "GCP_USER=$GCP_USER"

NUM_SHARDS=$3
echo "NUM_SHARDS=$NUM_SHARDS"

USE_KEYSTORE=false
if [[ "$#" = 4 ]]; then
    OPTIONS="$4"
elif [[ "$#" = 5 ]]; then
    if [[ "$4" != '--keystore' ]]; then
        echo "Invalid options: $4 $5"
        exit
    else
        USE_KEYSTORE=true
        PASSWORD="$5"
    fi
else
    USE_KEYSTORE=true
    if [[ "$4" = '--keystore' ]]; then
        PASSWORD="$5"
        OPTIONS="$6"
    elif [[ "$5" != '--keystore' ]]; then
        printf "Invalid option: $5\n"
        exit
    else
        OPTIONS="$4"
        PASSWORD="$6"
    fi
fi
echo "OPTIONS=$OPTIONS"
echo "USE_KEYSTORE=$USE_KEYSTORE"

# Commands for starting nodes.
BASE_COMMAND=". start_node_genesis_gcp.sh $SEASON"
if [[ $USE_KEYSTORE = true ]]; then
    KEYSTORE_COMMAND_SUFFIX="--keystore; echo $PASSWORD > /tmp/blockchain_node_fifo; rm /tmp/blockchain_node_fifo"
else
    KEYSTORE_COMMAND_SUFFIX=""
fi


# Get confirmation.
echo
read -p "Do you want to proceed? >> (y/N) " -n 1 -r
echo
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
fi

FILES_FOR_TRACKER="blockchain/ client/ common/ consensus/ db/ genesis-configs/ logger/ tracker-server/ traffic/ package.json setup_blockchain_ubuntu.sh start_tracker_genesis_gcp.sh start_tracker_incremental_gcp.sh restart_tracker_gcp.sh"
FILES_FOR_NODE="blockchain/ client/ common/ consensus/ db/ genesis-configs/ json_rpc/ logger/ node/ p2p/ testnet_dev_staging_keys/ testnet_spring_summer_keys/ traffic/ tx-pool/ package.json setup_blockchain_ubuntu.sh start_node_genesis_gcp.sh start_node_incremental_gcp.sh restart_node_gcp.sh"

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

# kill any processes still alive
gcloud compute ssh $TRACKER_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $TRACKER_ZONE
gcloud compute ssh $NODE_0_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_0_ZONE
gcloud compute ssh $NODE_1_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_1_ZONE
gcloud compute ssh $NODE_2_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_2_ZONE
gcloud compute ssh $NODE_3_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_3_ZONE
gcloud compute ssh $NODE_4_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_4_ZONE

if [[ "$NUM_SHARDS" -gt 0 ]]; then
    for i in $(seq $NUM_SHARDS)
        do
            echo "shard #$i"

            SHARD_TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-tracker-taiwan"
            SHARD_NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-0-taiwan"
            SHARD_NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-1-oregon"
            SHARD_NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-2-singapore"

            gcloud compute ssh $SHARD_TRACKER_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $TRACKER_ZONE
            gcloud compute ssh $SHARD_NODE_0_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_0_ZONE
            gcloud compute ssh $SHARD_NODE_1_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_1_ZONE
            gcloud compute ssh $SHARD_NODE_2_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_2_ZONE
        done
fi

# deploy files to GCP instances
printf "\nDeploying parent blockchain...\n\n"
printf "\nDeploying files to parent tracker (${TRACKER_TARGET_ADDR})...\n\n"
gcloud compute scp --recurse $FILES_FOR_TRACKER ${TRACKER_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $TRACKER_ZONE
printf "\nDeploying files to parent node 0 (${NODE_0_TARGET_ADDR})...\n\n"
gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_0_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_0_ZONE
printf "\nDeploying files to parent node 1 (${NODE_1_TARGET_ADDR})...\n\n"
gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_1_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_1_ZONE
printf "\nDeploying files to parent node 2 (${NODE_2_TARGET_ADDR})...\n\n"
gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_2_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_2_ZONE
printf "\nDeploying files to parent node 3 (${NODE_3_TARGET_ADDR})...\n\n"
gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_3_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_3_ZONE
printf "\nDeploying files to parent node 4 (${NODE_4_TARGET_ADDR})...\n\n"
gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_4_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_4_ZONE

# ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
if [[ $OPTIONS = "--setup" ]]; then
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

# ssh into each instance, install packages and start up the server
printf "\n\n###########################\n# Starting parent tracker #\n###########################\n\n"
gcloud compute ssh $TRACKER_TARGET_ADDR --command ". start_tracker_genesis_gcp.sh" --project $PROJECT_ID --zone $TRACKER_ZONE
printf "\n\n##########################\n# Starting parent node 0 #\n##########################\n\n"
gcloud compute ssh $NODE_0_TARGET_ADDR --command "$BASE_COMMAND 0 0 $KEYSTORE_COMMAND_SUFFIX" --project $PROJECT_ID --zone $NODE_0_ZONE
printf "\n\n##########################\n# Starting parent node 1 #\n##########################\n\n"
gcloud compute ssh $NODE_1_TARGET_ADDR --command "$BASE_COMMAND 0 1 $KEYSTORE_COMMAND_SUFFIX" --project $PROJECT_ID --zone $NODE_1_ZONE
printf "\n\n##########################\n# Starting parent node 2 #\n##########################\n\n"
gcloud compute ssh $NODE_2_TARGET_ADDR --command "$BASE_COMMAND 0 2 $KEYSTORE_COMMAND_SUFFIX" --project $PROJECT_ID --zone $NODE_2_ZONE
printf "\n\n##########################\n# Starting parent node 3 #\n##########################\n\n"
gcloud compute ssh $NODE_3_TARGET_ADDR --command "$BASE_COMMAND 0 3 $KEYSTORE_COMMAND_SUFFIX" --project $PROJECT_ID --zone $NODE_3_ZONE
printf "\n\n##########################\n# Starting parent node 4 #\n##########################\n\n"
gcloud compute ssh $NODE_4_TARGET_ADDR --command "$BASE_COMMAND 0 4 $KEYSTORE_COMMAND_SUFFIX" --project $PROJECT_ID --zone $NODE_4_ZONE


if [[ "$NUM_SHARDS" -gt 0 ]]; then
    printf "\nDeploying shard blockchains..."
    for i in $(seq $NUM_SHARDS)
        do
            echo "shard #$i"

            # generate genesis config files in ./blockchain/shard_$i
            if [[ $OPTIONS = "--setup" ]]; then
                node ./tools/generateShardGenesisFiles.js $SEASON 10 $i
            fi

            SHARD_TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-tracker-taiwan"
            SHARD_NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-0-taiwan"
            SHARD_NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-1-oregon"
            SHARD_NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-2-singapore"

            # deploy files to GCP instances
            printf "\nDeploying files to shard_$i tracker (${SHARD_TRACKER_TARGET_ADDR})...\n\n"
            gcloud compute scp --recurse $FILES_FOR_TRACKER ${SHARD_TRACKER_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $TRACKER_ZONE
            printf "\nDeploying files to shard_$i node 0 (${SHARD_NODE_0_TARGET_ADDR})...\n\n"
            gcloud compute scp --recurse $FILES_FOR_NODE ${SHARD_NODE_0_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_0_ZONE
            printf "\nDeploying files to shard_$i node 1 (${SHARD_NODE_1_TARGET_ADDR})...\n\n"
            gcloud compute scp --recurse $FILES_FOR_NODE ${SHARD_NODE_1_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_1_ZONE
            printf "\nDeploying files to shard_$i node 2 (${SHARD_NODE_2_TARGET_ADDR})...\n\n"
            gcloud compute scp --recurse $FILES_FOR_NODE ${SHARD_NODE_2_TARGET_ADDR}:~/  --project $PROJECT_ID --zone $NODE_2_ZONE

            # ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
            if [[ $OPTIONS = "--setup" ]]; then
                printf "\n\n###########################\n# Setting up shard_$i tracker #\n###########################\n\n"
                gcloud compute ssh $SHARD_TRACKER_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $TRACKER_ZONE
                printf "\n\n##########################\n# Setting up  shard_$i node 0 #\n##########################\n\n"
                gcloud compute ssh $SHARD_NODE_0_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_0_ZONE
                printf "\n\n##########################\n# Setting up  shard_$i node 1 #\n##########################\n\n"
                gcloud compute ssh $SHARD_NODE_1_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_1_ZONE
                printf "\n\n##########################\n# Setting up  shard_$i node 2 #\n##########################\n\n"
                gcloud compute ssh $SHARD_NODE_2_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_2_ZONE
            fi

            # ssh into each instance, install packages and start up the server
            printf "\n\n###########################\n# Starting shard_$i tracker #\n###########################\n\n"
            gcloud compute ssh $SHARD_TRACKER_TARGET_ADDR --command ". start_tracker_genesis_gcp.sh" --project $PROJECT_ID --zone $TRACKER_ZONE
            printf "\n\n##########################\n# Starting shard_$i node 0 #\n##########################\n\n"
            gcloud compute ssh $SHARD_NODE_0_TARGET_ADDR --command "$BASE_COMMAND $i 0" --project $PROJECT_ID --zone $NODE_0_ZONE
            printf "\n\n##########################\n# Starting shard_$i node 1 #\n##########################\n\n"
            gcloud compute ssh $SHARD_NODE_1_TARGET_ADDR --command "$BASE_COMMAND $i 1" --project $PROJECT_ID --zone $NODE_1_ZONE
            printf "\n\n##########################\n# Starting shard_$i node 2 #\n##########################\n\n"
            gcloud compute ssh $SHARD_NODE_2_TARGET_ADDR --command "$BASE_COMMAND $i 2" --project $PROJECT_ID --zone $NODE_2_ZONE
        done
fi
