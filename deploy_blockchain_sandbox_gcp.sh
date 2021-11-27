#!/bin/bash

if [[ $# -lt 1 ]] || [[ $# -gt 4 ]]; then
    printf "Usage: bash deploy_blockchain_sandbox_gcp.sh <GCP Username> [--setup] [--restart|--reset]\n"
    printf "Example: bash deploy_blockchain_sandbox_gcp.sh lia --setup\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ deploy_blockchain_sandbox_gcp.sh ]]]]]\n\n"

SEASON=sandbox
PROJECT_ID=testnet-$SEASON-ground
printf "SEASON=$SEASON\n"
printf "PROJECT_ID=$PROJECT_ID\n"

GCP_USER="$1"
printf "GCP_USER=$GCP_USER\n"

function parse_options() {
    local option="$1"
    if [[ $option = '--setup' ]]; then
        SETUP_OPTION="$option"
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
        printf "Invalid options: $option\n"
        exit
    fi
}

# Parse options.
SETUP_OPTION=""
ACCOUNT_INJECTION_OPTION=""
RESET_RESTART_OPTION=""

ARG_INDEX=4
while [ $ARG_INDEX -le $# ]
do
  parse_options "${!ARG_INDEX}"
  ((ARG_INDEX++))
done
printf "SETUP_OPTION=$SETUP_OPTION\n"
printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
printf "RESET_RESTART_OPTION=$RESET_RESTART_OPTION\n"


# Get confirmation.
printf "\n"
read -p "Do you want to proceed? >> (y/N) " -n 1 -r
printf "\n\n"
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
fi

# deploy files
FILES_FOR_NODE="blockchain/ block-pool/ client/ common/ consensus/ db/ blockchain-configs/ json_rpc/ logger/ node/ p2p/ tools/ traffic/ tx-pool/ package.json setup_blockchain_ubuntu.sh start_node_genesis_gcp.sh start_node_incremental_gcp.sh wait_until_node_sync_gcp.sh"

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
printf "\nKilling all blockchain nodes...\n\n"
gcloud compute ssh $NODE_0_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_0_ZONE &> /dev/null &
gcloud compute ssh $NODE_1_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_1_ZONE &> /dev/null &
gcloud compute ssh $NODE_2_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_2_ZONE &> /dev/null &
gcloud compute ssh $NODE_3_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_3_ZONE &> /dev/null &
gcloud compute ssh $NODE_4_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_4_ZONE &> /dev/null &
gcloud compute ssh $NODE_5_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_5_ZONE &> /dev/null &
gcloud compute ssh $NODE_6_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_6_ZONE &> /dev/null
printf "Kill all processes done.\n";

# deploy files to GCP instances
if [[ $RESET_RESTART_OPTION = "" ]]; then
    printf "\nDeploying parent blockchain...\n\n"
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_0_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_0_ZONE &> /dev/null &
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_1_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_1_ZONE &> /dev/null &
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_2_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_2_ZONE &> /dev/null &
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_3_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_3_ZONE &> /dev/null &
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_4_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_4_ZONE &> /dev/null &
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_5_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_5_ZONE &> /dev/null &
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_6_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_6_ZONE &> /dev/null
fi
printf "Deploy files done.\n";

# ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
if [[ $SETUP_OPTION = "--setup" ]]; then
    printf "\n\n##########################\n# Setting up blockchain nodes #\n##########################\n\n"
    gcloud compute ssh $NODE_0_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_0_ZONE
    gcloud compute ssh $NODE_1_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_1_ZONE
    gcloud compute ssh $NODE_2_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_2_ZONE
    gcloud compute ssh $NODE_3_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_3_ZONE
    gcloud compute ssh $NODE_4_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_4_ZONE
    gcloud compute ssh $NODE_5_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_5_ZONE
    gcloud compute ssh $NODE_6_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_6_ZONE
fi
printf "Setting up blockchain nodes done.\n";

# printf "\nStarting blockchain servers...\n\n"
# if [[ $RESET_RESTART_OPTION = "--reset" ]]; then
#     # restart after removing chains, snapshots, and log files
#     CHAINS_DIR=/home/ain_blockchain_data/chains
#     SNAPSHOTS_DIR=/home/ain_blockchain_data/snapshots
#     START_TRACKER_CMD_BASE="sudo rm -rf /home/ain_blockchain_data/ && cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && sudo rm -rf ./logs/ && . start_tracker_genesis_gcp.sh"
#     START_NODE_CMD_BASE="sudo rm -rf $CHAINS_DIR $SNAPSHOTS_DIR && cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && sudo rm -rf ./logs/ && . start_node_genesis_gcp.sh"
#     KEEP_CODE_OPTION="--keep-code"
# elif [[ $RESET_RESTART_OPTION = "--restart" ]]; then
#     # restart
#     START_TRACKER_CMD_BASE="cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && . start_tracker_genesis_gcp.sh"
#     START_NODE_CMD_BASE="cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && . start_node_genesis_gcp.sh"
#     KEEP_CODE_OPTION="--keep-code"
# else
#     # start
#     START_TRACKER_CMD_BASE=". start_tracker_genesis_gcp.sh"
#     START_NODE_CMD_BASE=". start_node_genesis_gcp.sh"
#     KEEP_CODE_OPTION=""
# fi
# printf "\n"
# printf "START_TRACKER_CMD_BASE=$START_TRACKER_CMD_BASE\n"
# printf "START_NODE_CMD_BASE=$START_NODE_CMD_BASE\n"
# printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"

# NUM_NODES=7
# index=0
# while [ $index -lt $NUM_NODES ]
# do
#     printf "\n\n##########################\n# Starting parent node $index #\n##########################\n\n"
#     if [[ $index -gt 4 ]]; then
#         JSON_RPC_OPTION="--json-rpc"
#         REST_FUNC_OPTION="--rest-func"
#     else
#         JSON_RPC_OPTION=""
#         REST_FUNC_OPTION=""
#     fi
#     NODE_TARGET_ADDR=NODE_${index}_TARGET_ADDR
#     NODE_ZONE=NODE_${index}_ZONE

#     printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
#     printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
#     printf "JSON_RPC_OPTION=$JSON_RPC_OPTION\n"
#     printf "REST_FUNC_OPTION=$REST_FUNC_OPTION\n"

#     printf "\n"
#     START_NODE_CMD="gcloud compute ssh ${!NODE_TARGET_ADDR} --command '$START_NODE_CMD_BASE $SEASON 0 $index $KEEP_CODE_OPTION $ACCOUNT_INJECTION_OPTION $JSON_RPC_OPTION $REST_FUNC_OPTION' --project $PROJECT_ID --zone ${!NODE_ZONE}"
#     printf "START_NODE_CMD=$START_NODE_CMD\n"
#     eval $START_NODE_CMD
#     inject_account "$index"
#     ((index++))
# done
