#!/bin/bash

if [[ "$#" -lt 3 ]] || [[ "$#" -gt 5 ]]; then
    echo "Usage: bash deploy_blockchain_genesis_gcp.sh [dev|staging|spring|summer] <GCP Username> <# of Shards> [--setup] [--keystore]"
    echo "Example: bash deploy_blockchain_genesis_gcp.sh dev lia 0 --setup"
    echo "Example: bash deploy_blockchain_genesis_gcp.sh dev lia 0 --keystore"
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


function parse_options() {
    local option="$1"
    if [[ "$option" = '--setup' ]]; then
        SETUP_OPTION="$option"
    elif [[ "$option" = '--keystore' ]]; then
        KEYSTORE_OPTION="$option"
    else
        echo "Invalid options: $option"
        exit
    fi
}

# Parse options.
KEYSTORE_OPTION=""
if [[ "$#" -gt 3 ]]; then
    parse_options "$4"
    if [[ "$#" = 5 ]]; then
        parse_options "$5"
    fi
fi
echo "SETUP_OPTION=$SETUP_OPTION"
echo "KEYSTORE_OPTION=$KEYSTORE_OPTION"


# Commands for starting nodes.
START_NODE_COMMAND_BASE=". start_node_genesis_gcp.sh $SEASON"


# Get confirmation.
echo
read -p "Do you want to proceed? >> (y/N) " -n 1 -r
echo
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
fi

if [[ "$KEYSTORE_OPTION" != "" ]]; then
    # Get keystore password
    echo -n "Enter password: "
    read -s PASSWORD
    echo
    echo

    # Read node ip addresses
    IFS=$'\n' read -d '' -r -a IP_ADDR_LIST < ./testnet_ip_addresses/$SEASON.txt

    if [[ "$SEASON" = "spring" ]] || [[ "$SEASON" = "summer" ]]; then
        KEYSTORE_DIR="testnet_prod_keys/"
    else
        KEYSTORE_DIR="testnet_dev_staging_keys/"
    fi
fi

function inject_account() {
    if [[ "$KEYSTORE_OPTION" != "" ]]; then
        local node_index="$1"
        local node_ip_addr=${IP_ADDR_LIST[${node_index}]}
        printf "\n* >> Injecting an account for node $node_index ********************\n\n"
        printf "node_ip_addr='$node_ip_addr'\n"

        echo $PASSWORD | node inject_account_gcp.js $node_ip_addr
    fi
}

FILES_FOR_TRACKER="blockchain/ client/ common/ consensus/ db/ genesis-configs/ logger/ tracker-server/ traffic/ package.json setup_blockchain_ubuntu.sh start_tracker_genesis_gcp.sh start_tracker_incremental_gcp.sh restart_tracker_gcp.sh"
FILES_FOR_NODE="blockchain/ client/ common/ consensus/ db/ genesis-configs/ json_rpc/ logger/ node/ p2p/ tools/ traffic/ tx-pool/ package.json setup_blockchain_ubuntu.sh start_node_genesis_gcp.sh start_node_incremental_gcp.sh restart_node_gcp.sh wait_until_node_sync_gcp.sh $KEYSTORE_DIR"

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
if [[ $SETUP_OPTION = "--setup" ]]; then
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
gcloud compute ssh $NODE_0_TARGET_ADDR --command "$START_NODE_COMMAND_BASE 0 0 $KEYSTORE_OPTION" --project $PROJECT_ID --zone $NODE_0_ZONE
inject_account "0"
printf "\n\n##########################\n# Starting parent node 1 #\n##########################\n\n"
gcloud compute ssh $NODE_1_TARGET_ADDR --command "$START_NODE_COMMAND_BASE 0 1 $KEYSTORE_OPTION" --project $PROJECT_ID --zone $NODE_1_ZONE
inject_account "1"
printf "\n\n##########################\n# Starting parent node 2 #\n##########################\n\n"
gcloud compute ssh $NODE_2_TARGET_ADDR --command "$START_NODE_COMMAND_BASE 0 2 $KEYSTORE_OPTION" --project $PROJECT_ID --zone $NODE_2_ZONE
inject_account "2"
printf "\n\n##########################\n# Starting parent node 3 #\n##########################\n\n"
gcloud compute ssh $NODE_3_TARGET_ADDR --command "$START_NODE_COMMAND_BASE 0 3 $KEYSTORE_OPTION" --project $PROJECT_ID --zone $NODE_3_ZONE
inject_account "3"
printf "\n\n##########################\n# Starting parent node 4 #\n##########################\n\n"
gcloud compute ssh $NODE_4_TARGET_ADDR --command "$START_NODE_COMMAND_BASE 0 4 $KEYSTORE_OPTION" --project $PROJECT_ID --zone $NODE_4_ZONE
inject_account "4"


if [[ "$NUM_SHARDS" -gt 0 ]]; then
    printf "\nDeploying shard blockchains..."
    for i in $(seq $NUM_SHARDS)
        do
            echo "shard #$i"

            # generate genesis config files in ./blockchain/shard_$i
            if [[ $SETUP_OPTION = "--setup" ]]; then
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
            if [[ $SETUP_OPTION = "--setup" ]]; then
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
            gcloud compute ssh $SHARD_NODE_0_TARGET_ADDR --command "$START_NODE_COMMAND_BASE $i 0" --project $PROJECT_ID --zone $NODE_0_ZONE
            printf "\n\n##########################\n# Starting shard_$i node 1 #\n##########################\n\n"
            gcloud compute ssh $SHARD_NODE_1_TARGET_ADDR --command "$START_NODE_COMMAND_BASE $i 1" --project $PROJECT_ID --zone $NODE_1_ZONE
            printf "\n\n##########################\n# Starting shard_$i node 2 #\n##########################\n\n"
            gcloud compute ssh $SHARD_NODE_2_TARGET_ADDR --command "$START_NODE_COMMAND_BASE $i 2" --project $PROJECT_ID --zone $NODE_2_ZONE
        done
fi
