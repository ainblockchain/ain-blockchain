#!/bin/bash

if [[ $# -lt 3 ]] || [[ $# -gt 7 ]]; then
    printf "Usage: bash deploy_blockchain_genesis_gcp.sh [dev|staging|sandbox|spring|summer] <GCP Username> <# of Shards> [--setup] [--keystore|--mnemonic] [--restart|--reset] [--kill-only]\n"
    printf "Example: bash deploy_blockchain_genesis_gcp.sh dev lia 0 --setup --keystore\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ deploy_blockchain_genesis_gcp.sh ]]]]]\n\n"

if [[ "$1" = 'spring' ]] || [[ "$1" = 'summer' ]] || [[ "$1" = 'dev' ]] || [[ "$1" = 'staging' ]] || [[ "$1" = 'sandbox' ]]; then
    SEASON="$1"
    if [[ "$1" = 'spring' ]] || [[ "$1" = 'summer' ]]; then
        PROJECT_ID="testnet-prod-ground"
    else
        PROJECT_ID="testnet-$1-ground"
    fi
else
    printf "Invalid project/season argument: $1\n"
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


function parse_options() {
    local option="$1"
    if [[ $option = '--setup' ]]; then
        SETUP_OPTION="$option"
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
    elif [[ $option = '--kill-only' ]]; then
        KILL_ONLY_OPTION="$option"
    else
        printf "Invalid options: $option\n"
        exit
    fi
}

# Parse options.
SETUP_OPTION=""
ACCOUNT_INJECTION_OPTION=""
RESET_RESTART_OPTION=""
KILL_ONLY_OPTION=""

ARG_INDEX=4
while [ $ARG_INDEX -le $# ]
do
  parse_options "${!ARG_INDEX}"
  ((ARG_INDEX++))
done
printf "SETUP_OPTION=$SETUP_OPTION\n"
printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
printf "RESET_RESTART_OPTION=$RESET_RESTART_OPTION\n"
printf "KILL_ONLY_OPTION=$KILL_ONLY_OPTION\n"

# Get confirmation.
printf "\n"
read -p "Do you want to proceed? >> (y/N) " -n 1 -r
printf "\n\n"
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
fi

if [[ "$ACCOUNT_INJECTION_OPTION" = "--keystore" ]]; then
    # Get keystore password
    printf "Enter password: "
    read -s PASSWORD
    printf "\n\n"

    # Read node ip addresses
    IFS=$'\n' read -d '' -r -a IP_ADDR_LIST < ./testnet_ip_addresses/$SEASON.txt

    if [[ "$SEASON" = "spring" ]] || [[ "$SEASON" = "summer" ]]; then
        KEYSTORE_DIR="testnet_prod_keys/"
    else
        KEYSTORE_DIR="testnet_dev_staging_keys/"
    fi
elif [[ "$ACCOUNT_INJECTION_OPTION" = "--mnemonic" ]]; then
    # Read node ip addresses
    IFS=$'\n' read -d '' -r -a IP_ADDR_LIST < ./testnet_ip_addresses/$SEASON.txt

    IFS=$'\n' read -d '' -r -a MNEMONIC_LIST < ./testnet_mnemonics/$SEASON.txt
fi

function inject_account() {
    if [[ "$ACCOUNT_INJECTION_OPTION" = "--keystore" ]]; then
        local node_index="$1"
        local node_ip_addr=${IP_ADDR_LIST[${node_index}]}
        printf "\n* >> Injecting an account for node $node_index ********************\n\n"
        printf "node_ip_addr='$node_ip_addr'\n"

        echo $PASSWORD | node inject_account_gcp.js $node_ip_addr $ACCOUNT_INJECTION_OPTION
    elif [[ "$ACCOUNT_INJECTION_OPTION" = "--mnemonic" ]]; then
        local node_index="$1"
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
}

# deploy files
FILES_FOR_TRACKER="blockchain/ blockchain-configs/ block-pool/ client/ common/ consensus/ db/ logger/ tracker-server/ traffic/ package.json setup_blockchain_ubuntu.sh start_tracker_genesis_gcp.sh start_tracker_incremental_gcp.sh"
FILES_FOR_NODE="blockchain/ blockchain-configs/ block-pool/ client/ common/ consensus/ db/ event-handler/ json_rpc/ logger/ node/ p2p/ tools/ traffic/ tx-pool/ package.json $KEYSTORE_DIR setup_blockchain_ubuntu.sh start_node_genesis_gcp.sh start_node_incremental_gcp.sh wait_until_node_sync_gcp.sh"

TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-tracker-taiwan"
NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-node-0-taiwan"
NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-node-1-oregon"
NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-node-2-singapore"
NODE_3_TARGET_ADDR="${GCP_USER}@${SEASON}-node-3-iowa"
NODE_4_TARGET_ADDR="${GCP_USER}@${SEASON}-node-4-netherlands"
NODE_5_TARGET_ADDR="${GCP_USER}@${SEASON}-node-5-taiwan"
NODE_6_TARGET_ADDR="${GCP_USER}@${SEASON}-node-6-oregon"

TRACKER_ZONE="asia-east1-b"
NODE_0_ZONE="asia-east1-b"
NODE_1_ZONE="us-west1-b"
NODE_2_ZONE="asia-southeast1-b"
NODE_3_ZONE="us-central1-a"
NODE_4_ZONE="europe-west4-a"
NODE_5_ZONE="asia-east1-b"
NODE_6_ZONE="us-west1-b"

# kill any processes still alive
gcloud compute ssh $TRACKER_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $TRACKER_ZONE
gcloud compute ssh $NODE_0_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_0_ZONE
gcloud compute ssh $NODE_1_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_1_ZONE
gcloud compute ssh $NODE_2_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_2_ZONE
gcloud compute ssh $NODE_3_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_3_ZONE
gcloud compute ssh $NODE_4_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_4_ZONE
gcloud compute ssh $NODE_5_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_5_ZONE
gcloud compute ssh $NODE_6_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_6_ZONE

if [[ $NUM_SHARDS -gt 0 ]]; then
    for i in $(seq $NUM_SHARDS)
        do
            printf "shard #$i\n"

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

# If --kill-only, do not proceed any further
if [[ $KILL_ONLY_OPTION != "" ]]; then
    exit
fi

# deploy files to GCP instances
if [[ $RESET_RESTART_OPTION = "" ]]; then
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
    printf "\nDeploying files to parent node 5 (${NODE_5_TARGET_ADDR})...\n\n"
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_5_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_5_ZONE
    printf "\nDeploying files to parent node 6 (${NODE_6_TARGET_ADDR})...\n\n"
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_6_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_6_ZONE
fi

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
    printf "\n\n##########################\n# Setting up parent node 5 #\n##########################\n\n"
    gcloud compute ssh $NODE_5_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_5_ZONE
    printf "\n\n##########################\n# Setting up parent node 6 #\n##########################\n\n"
    gcloud compute ssh $NODE_6_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_6_ZONE
fi

printf "\nStarting blockchain servers...\n\n"
if [[ $RESET_RESTART_OPTION = "--reset" ]]; then
    # restart after removing chains, snapshots, and log files
    CHAINS_DIR=/home/ain_blockchain_data/chains
    SNAPSHOTS_DIR=/home/ain_blockchain_data/snapshots
    START_TRACKER_CMD_BASE="sudo rm -rf /home/ain_blockchain_data/ && cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && sudo rm -rf ./logs/ && . start_tracker_genesis_gcp.sh"
    START_NODE_CMD_BASE="sudo rm -rf $CHAINS_DIR $SNAPSHOTS_DIR && cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && sudo rm -rf ./logs/ && . start_node_genesis_gcp.sh"
    KEEP_CODE_OPTION="--keep-code"
elif [[ $RESET_RESTART_OPTION = "--restart" ]]; then
    # restart
    START_TRACKER_CMD_BASE="cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && . start_tracker_genesis_gcp.sh"
    START_NODE_CMD_BASE="cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && . start_node_genesis_gcp.sh"
    KEEP_CODE_OPTION="--keep-code"
else
    # start
    START_TRACKER_CMD_BASE=". start_tracker_genesis_gcp.sh"
    START_NODE_CMD_BASE=". start_node_genesis_gcp.sh"
    KEEP_CODE_OPTION=""
fi
printf "\n"
printf "START_TRACKER_CMD_BASE=$START_TRACKER_CMD_BASE\n"
printf "START_NODE_CMD_BASE=$START_NODE_CMD_BASE\n"
printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"

printf "\n\n###########################\n# Starting parent tracker #\n###########################\n\n"

printf "\n"
printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
START_TRACKER_CMD="gcloud compute ssh $TRACKER_TARGET_ADDR --command '$START_TRACKER_CMD_BASE $KEEP_CODE_OPTION' --project $PROJECT_ID --zone $TRACKER_ZONE"
printf "START_TRACKER_CMD=$START_TRACKER_CMD\n"
eval $START_TRACKER_CMD

NUM_NODES=7
node_index=0
while [ $node_index -lt $NUM_NODES ]
do
    printf "\n\n##########################\n# Starting parent node $node_index #\n##########################\n\n"
    if [[ $node_index -gt 4 ]]; then
        JSON_RPC_OPTION="--json-rpc"
        REST_FUNC_OPTION="--rest-func"
    else
        JSON_RPC_OPTION=""
        REST_FUNC_OPTION=""
    fi
    NODE_TARGET_ADDR=NODE_${node_index}_TARGET_ADDR
    NODE_ZONE=NODE_${node_index}_ZONE

    printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
    printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
    printf "JSON_RPC_OPTION=$JSON_RPC_OPTION\n"
    printf "REST_FUNC_OPTION=$REST_FUNC_OPTION\n"

    printf "\n"
    START_NODE_CMD="gcloud compute ssh ${!NODE_TARGET_ADDR} --command '$START_NODE_CMD_BASE $SEASON 0 $node_index $KEEP_CODE_OPTION $ACCOUNT_INJECTION_OPTION $JSON_RPC_OPTION $REST_FUNC_OPTION' --project $PROJECT_ID --zone ${!NODE_ZONE}"
    printf "START_NODE_CMD=$START_NODE_CMD\n"
    eval $START_NODE_CMD
    inject_account "$node_index"
    ((node_index++))
done


if [[ $NUM_SHARDS -gt 0 ]]; then
    printf "\nDeploying shard blockchains..."
    for i in $(seq $NUM_SHARDS)
        do
            printf "shard #$i\n"

            # generate genesis config files in ./blockchain/shard_$i
            if [[ $SETUP_OPTION = "--setup" ]]; then
                node ./tools/generateShardGenesisFiles.js $SEASON 10 $i
            fi

            SHARD_TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-tracker-taiwan"
            SHARD_NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-0-taiwan"
            SHARD_NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-1-oregon"
            SHARD_NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-2-singapore"

            # deploy files to GCP instances
            if [[ $RESET_RESTART_OPTION = "" ]]; then
                printf "\nDeploying files to shard_$i tracker (${SHARD_TRACKER_TARGET_ADDR})...\n\n"
                gcloud compute scp --recurse $FILES_FOR_TRACKER ${SHARD_TRACKER_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $TRACKER_ZONE
                printf "\nDeploying files to shard_$i node 0 (${SHARD_NODE_0_TARGET_ADDR})...\n\n"
                gcloud compute scp --recurse $FILES_FOR_NODE ${SHARD_NODE_0_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_0_ZONE
                printf "\nDeploying files to shard_$i node 1 (${SHARD_NODE_1_TARGET_ADDR})...\n\n"
                gcloud compute scp --recurse $FILES_FOR_NODE ${SHARD_NODE_1_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_1_ZONE
                printf "\nDeploying files to shard_$i node 2 (${SHARD_NODE_2_TARGET_ADDR})...\n\n"
                gcloud compute scp --recurse $FILES_FOR_NODE ${SHARD_NODE_2_TARGET_ADDR}:~/  --project $PROJECT_ID --zone $NODE_2_ZONE
            fi

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
            START_TRACKER_CMD="gcloud compute ssh $SHARD_TRACKER_TARGET_ADDR --command '$START_TRACKER_CMD_BASE $KEEP_CODE_OPTION' --project $PROJECT_ID --zone $TRACKER_ZONE"
            printf "START_TRACKER_CMD=$START_TRACKER_CMD\n"
            eval $START_TRACKER_CMD
            printf "\n\n##########################\n# Starting shard_$i node 0 #\n##########################\n\n"
            START_NODE_CMD="gcloud compute ssh $SHARD_NODE_0_TARGET_ADDR --command '$START_NODE_CMD_BASE $SEASON $SEASON $i 0 $KEEP_CODE_OPTION' --project $PROJECT_ID --zone $NODE_0_ZONE"
            printf "START_NODE_CMD=$START_NODE_CMD\n"
            eval $START_NODE_CMD
            printf "\n\n##########################\n# Starting shard_$i node 1 #\n##########################\n\n"
            START_NODE_CMD="gcloud compute ssh $SHARD_NODE_1_TARGET_ADDR --command '$START_NODE_CMD_BASE $SEASON $SEASON $i 0 $KEEP_CODE_OPTION' --project $PROJECT_ID --zone $NODE_1_ZONE"
            printf "START_NODE_CMD=$START_NODE_CMD\n"
            eval $START_NODE_CMD
            printf "\n\n##########################\n# Starting shard_$i node 2 #\n##########################\n\n"
            START_NODE_CMD="gcloud compute ssh $SHARD_NODE_2_TARGET_ADDR --command '$START_NODE_CMD_BASE $SEASON $SEASON $i 0 $KEEP_CODE_OPTION' --project $PROJECT_ID --zone $NODE_2_ZONE"
            printf "START_NODE_CMD=$START_NODE_CMD\n"
            eval $START_NODE_CMD
        done
fi
