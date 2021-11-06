#!/bin/bash

if [[ "$#" != 3 ]] && [[ "$#" != 4 ]]; then
    echo "Usage: bash deploy_blockchain_genesis_gcp.sh [dev|staging|spring|summer] <GCP Username> <# of Shards> [--keystore|--mnemonic]"
    echo "Usage: bash reset_blockchain_gcp.sh dev lia 0"
    echo "Usage: bash reset_blockchain_gcp.sh dev lia 0 --keystore"
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

ACCOUNT_INJECTION_OPTION=""
if [[ "$#" = 4 ]]; then
    if [[ "$4" = '--keystore' ]]; then
        ACCOUNT_INJECTION_OPTION="$4"
    elif [[ "$4" = '--mnemonic' ]]; then
        ACCOUNT_INJECTION_OPTION="$4"
    else
        echo "Invalid option: $4"
        exit
    fi
fi
echo "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION"

# Get confirmation.
echo
read -p "Do you want to proceed? >> (y/N) " -n 1 -r
echo
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
fi

# Read node ip addresses
IFS=$'\n' read -d '' -r -a IP_ADDR_LIST < ./testnet_ip_addresses/$SEASON.txt

if [[ "$ACCOUNT_INJECTION_OPTION" = "--keystore" ]]; then
    # Get keystore password
    echo -n "Enter password: "
    read -s PASSWORD
    echo
    echo
elif [[ "$ACCOUNT_INJECTION_OPTION" = "--mnemonic" ]]; then
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

        echo $MNEMONIC | node inject_account_gcp.js $node_ip_addr $ACCOUNT_INJECTION_OPTION
    fi
}

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

printf "\nStopping parent blockchain..."
gcloud compute ssh $TRACKER_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $TRACKER_ZONE
gcloud compute ssh $NODE_0_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_0_ZONE
gcloud compute ssh $NODE_1_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_1_ZONE
gcloud compute ssh $NODE_2_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_2_ZONE
gcloud compute ssh $NODE_3_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_3_ZONE
gcloud compute ssh $NODE_4_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_4_ZONE
gcloud compute ssh $NODE_5_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_5_ZONE
gcloud compute ssh $NODE_6_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_6_ZONE

printf "\nStopping shard blockchains..."
if [[ "$3" -gt 0 ]]; then
    for i in $(seq $3)
        do
            echo "shard #$i"

            SHARD_TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-tracker-taiwan"
            SHARD_NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-0-taiwan"
            SHARD_NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-1-oregon"
            SHARD_NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-2-singapore"

            gcloud compute ssh $SHARD_TRACKER_TARGET_ADDR --command "killall node" --project $PROJECT_ID --zone $TRACKER_ZONE
            gcloud compute ssh $SHARD_NODE_0_TARGET_ADDR --command "killall node" --project $PROJECT_ID --zone $NODE_0_ZONE
            gcloud compute ssh $SHARD_NODE_1_TARGET_ADDR --command "killall node" --project $PROJECT_ID --zone $NODE_1_ZONE
            gcloud compute ssh $SHARD_NODE_2_TARGET_ADDR --command "killall node" --project $PROJECT_ID --zone $NODE_2_ZONE
        done
fi

# ssh into each instance, clean up, and start running the nodes
CHAINS_DIR=/home/ain_blockchain_data/chains
SNAPSHOTS_DIR=/home/ain_blockchain_data/snapshots
START_TRACKER_CMD="sudo rm -rf /home/ain_blockchain_data/ && cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && sudo rm -rf ./logs/ && . start_tracker_genesis_gcp.sh"
START_NODE_CMD_BASE="sudo rm -rf $CHAINS_DIR $SNAPSHOTS_DIR && cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && sudo rm -rf ./logs/ && . start_node_genesis_gcp.sh $SEASON"
printf "\n\n############################\n# Running parent tracker #\n############################\n\n"
gcloud compute ssh $TRACKER_TARGET_ADDR --command "$START_TRACKER_CMD --keep-code" --project $PROJECT_ID --zone $TRACKER_ZONE
printf "\n\n###########################\n# Running parent node 0 #\n###########################\n\n"
gcloud compute ssh $NODE_0_TARGET_ADDR --command "$START_NODE_CMD_BASE 0 0 $ACCOUNT_INJECTION_OPTION --keep-code" --project $PROJECT_ID --zone $NODE_0_ZONE
inject_account "0"
sleep 10
printf "\n\n#########################\n# Running parent node 1 #\n#########################\n\n"
gcloud compute ssh $NODE_1_TARGET_ADDR --command "$START_NODE_CMD_BASE 0 1 $ACCOUNT_INJECTION_OPTION --keep-code" --project $PROJECT_ID --zone $NODE_1_ZONE
inject_account "1"
sleep 10
printf "\n\n#########################\n# Running parent node 2 #\n#########################\n\n"
gcloud compute ssh $NODE_2_TARGET_ADDR --command "$START_NODE_CMD_BASE 0 2 $ACCOUNT_INJECTION_OPTION --keep-code" --project $PROJECT_ID --zone $NODE_2_ZONE
inject_account "2"
sleep 10
printf "\n\n#########################\n# Running parent node 3 #\n#########################\n\n"
gcloud compute ssh $NODE_3_TARGET_ADDR --command "$START_NODE_CMD_BASE 0 3 $ACCOUNT_INJECTION_OPTION --keep-code" --project $PROJECT_ID --zone $NODE_3_ZONE
inject_account "3"
sleep 10
printf "\n\n#########################\n# Running parent node 4 #\n#########################\n\n"
gcloud compute ssh $NODE_4_TARGET_ADDR --command "$START_NODE_CMD_BASE 0 4 $ACCOUNT_INJECTION_OPTION --keep-code" --project $PROJECT_ID --zone $NODE_4_ZONE
inject_account "4"
sleep 10
printf "\n\n#########################\n# Running parent node 5 #\n#########################\n\n"
gcloud compute ssh $NODE_5_TARGET_ADDR --command "$START_NODE_CMD_BASE 0 5 $ACCOUNT_INJECTION_OPTION --keep-code" --project $PROJECT_ID --zone $NODE_5_ZONE
inject_account "5"
sleep 10
printf "\n\n#########################\n# Running parent node 6 #\n#########################\n\n"
gcloud compute ssh $NODE_6_TARGET_ADDR --command "$START_NODE_CMD_BASE 0 6 $ACCOUNT_INJECTION_OPTION --keep-code" --project $PROJECT_ID --zone $NODE_6_ZONE
inject_account "6"
sleep 10

if [[ "$3" -gt 0 ]]; then
    for i in $(seq $3)
        do
            echo "shard #$i"
            sleep 3

            SHARD_TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-tracker-taiwan"
            SHARD_NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-0-taiwan"
            SHARD_NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-1-oregon"
            SHARD_NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-2-singapore"

            # ssh into each instance, clean up, and start running the nodes
            printf "\n\n###########################\n# Running shard_$i tracker #\n###########################\n\n"
            gcloud compute ssh $SHARD_TRACKER_TARGET_ADDR --command "$START_TRACKER_CMD --keep-code" --project $PROJECT_ID --zone $TRACKER_ZONE
            printf "\n\n##########################\n# Running shard_$i node 0 #\n##########################\n\n"
            gcloud compute ssh $SHARD_NODE_0_TARGET_ADDR --command "$START_NODE_CMD_BASE $i 0 --keep-code" --project $PROJECT_ID --zone $NODE_0_ZONE
            inject_account "0"
            sleep 10
            printf "\n\n##########################\n# Running shard_$i node 1 #\n##########################\n\n"
            gcloud compute ssh $SHARD_NODE_1_TARGET_ADDR --command "$START_NODE_CMD_BASE $i 1 --keep-code" --project $PROJECT_ID --zone $NODE_1_ZONE
            inject_account "1"
            sleep 10
            printf "\n\n##########################\n# Running shard_$i node 2 #\n##########################\n\n"
            gcloud compute ssh $SHARD_NODE_2_TARGET_ADDR --command "$START_NODE_CMD_BASE $i 2 --keep-code" --project $PROJECT_ID --zone $NODE_2_ZONE
            inject_account "2"
        done
fi
