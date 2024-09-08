#!/bin/bash

function usage() {
    printf "Usage: bash copy_blockchain_data_gcp.sh [dev|staging|sandbox|exp|spring|summer|mainnet] <Node Index> [download|upload]\n"
    printf "Example: bash copy_blockchain_data_gcp.sh spring 5 download\n"
    printf "\n"
    exit
}

if [[ $# -lt 3 ]] || [[ $# -gt 3 ]]; then
    usage
fi

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
printf "\n"
printf "SEASON=$SEASON\n"
printf "PROJECT_ID=$PROJECT_ID\n"

GCP_USER="runner"
printf "GCP_USER=$GCP_USER\n"

number_re='^[0-9]+$'
if ! [[ $2 =~ $number_re ]] ; then
    printf "\n"
    printf "Invalid <Node Index> argument: $2\n"
    exit
fi
NODE_INDEX=$2
if [[ $NODE_INDEX -lt 0 ]] || [[ $NODE_INDEX -gt 9 ]]; then
    printf "\n"
    printf "Out-of-range <Node Index> argument: $NODE_INDEX\n"
    exit
fi
printf "NODE_INDEX=$NODE_INDEX\n"

if [[ "$3" = 'download' ]] || [[ "$3" = 'upload' ]]; then
    COMMAND="$3"
else
    printf "\n"
    printf "Invalid <Command> argument: $3\n"
    printf "\n"
    usage
fi
printf "COMMAND=$COMMAND\n"

# Get confirmation.
if [[ "$SEASON" = "mainnet" ]]; then
    printf "\n"
    printf "Do you want to proceed for $SEASON? Enter [mainnet]: "
    read CONFIRM
    printf "\n\n"
    if [[ ! $CONFIRM = "mainnet" ]]
    then
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

function download_data() {
    local node_index="$1"
    local node_target_addr=${NODE_TARGET_ADDR_LIST[${node_index}]}
    local node_zone=${NODE_ZONE_LIST[${node_index}]}

    printf "\n* >> Downloading data from node $node_index ($node_target_addr) *********************************************************\n\n"

    printf "node_target_addr='$node_target_addr'\n"
    printf "node_zone='$node_zone'\n"

    # 1. Create tgz file for node
    printf "\n\n<<< Creating tgz file for node $node_index >>>\n\n"
    TGZ_CMD="gcloud compute ssh $node_target_addr --command 'cd /home/ain_blockchain_data; tar cvf - chains snapshots | gzip -c > ~/ain_blockchain_data.tar.gz' --project $PROJECT_ID --zone $node_zone"
    printf "TGZ_CMD=$TGZ_CMD\n\n"
    eval $TGZ_CMD

    # 2. Copy tgz file from node
    printf "\n\n<<< Copying tgz file from node $node_index >>>\n\n"
    SCP_CMD="gcloud compute scp $node_target_addr:~/ain_blockchain_data.tar.gz . --project $PROJECT_ID --zone $node_zone"
    printf "SCP_CMD=$SCP_CMD\n\n"
    eval $SCP_CMD

    # 3. Clean up tgz file for node
    printf "\n\n<<< Cleaning up tgz file for node $node_index >>>\n\n"
    CLEANUP_CMD="gcloud compute ssh $node_target_addr --command 'rm ~/ain_blockchain_data.tar.gz' --project $PROJECT_ID --zone $node_zone"
    printf "CLEANUP_CMD=$CLEANUP_CMD\n\n"
    eval $CLEANUP_CMD
}

function upload_data() {
    local node_index="$1"
    local node_target_addr=${NODE_TARGET_ADDR_LIST[${node_index}]}
    local node_zone=${NODE_ZONE_LIST[${node_index}]}

    printf "\n* >> Uploading data from node $node_index ($node_target_addr) *********************************************************\n\n"

    printf "node_target_addr='$node_target_addr'\n"
    printf "node_zone='$node_zone'\n"

    # 1. Copy tgz file to node
    printf "\n\n<<< Copying tgz file to node $node_index >>>\n\n"
    SCP_CMD="gcloud compute scp ./ain_blockchain_data.tar.gz $node_target_addr:~ --project $PROJECT_ID --zone $node_zone"
    printf "SCP_CMD=$SCP_CMD\n\n"
    eval $SCP_CMD

    # 2. Extract tgz file for node
    printf "\n\n<<< Extracting tgz file for node $node_index >>>\n\n"
    TGZ_CMD="gcloud compute ssh $node_target_addr --command 'cd /home; sudo mkdir -p ain_blockchain_data; sudo chown $GCP_USER:$GCP_USER ain_blockchain_data; sudo chmod 777 ain_blockchain_data; cd ain_blockchain_data; sudo rm -rf chains snapshots; gzip -dc ~/ain_blockchain_data.tar.gz | tar xvf -' --project $PROJECT_ID --zone $node_zone"
    printf "TGZ_CMD=$TGZ_CMD\n\n"
    eval $TGZ_CMD

    # 3. Clean up tgz file for node
    printf "\n\n<<< Cleaning up tgz file for node $node_index >>>\n\n"
    CLEANUP_CMD="gcloud compute ssh $node_target_addr --command 'rm ~/ain_blockchain_data.tar.gz' --project $PROJECT_ID --zone $node_zone"
    printf "CLEANUP_CMD=$CLEANUP_CMD\n\n"
    eval $CLEANUP_CMD
}

if [[ "$COMMAND" = 'upload' ]]; then
    upload_data "$NODE_INDEX"
else
    download_data "$NODE_INDEX"
fi
