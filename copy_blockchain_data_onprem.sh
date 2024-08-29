#!/bin/bash

function usage() {
    printf "Usage: bash copy_blockchain_data_onprem.sh [dev|staging|sandbox|exp|spring|summer|mainnet] <Node Index> [download|upload]\n"
    printf "Example: bash copy_blockchain_data_onprem.sh spring 5 download\n"
    printf "\n"
    exit
}

if [[ $# -lt 3 ]] || [[ $# -gt 3 ]]; then
    usage
fi

if [[ "$1" = 'dev' ]] || [[ "$1" = 'staging' ]] || [[ "$1" = 'sandbox' ]] || [[ "$1" = 'exp' ]] || [[ "$1" = 'spring' ]] || [[ "$1" = 'summer' ]] || [[ "$1" = 'mainnet' ]]; then
    SEASON="$1"
else
    printf "Invalid <Project/Season> argument: $1\n"
    exit
fi
printf "\n"
printf "SEASON=$SEASON\n"

ONPREM_USER="nvidia"
printf "ONPREM_USER=$ONPREM_USER\n"

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

# Read node ip addresses and passwords
IFS=$'\n' read -d '' -r -a NODE_IP_LIST < ./ip_addresses/${SEASON}_onprem_ip.txt
IFS=$'\n' read -d '' -r -a NODE_PW_LIST < ./ip_addresses/${SEASON}_onprem_pw.txt

function download_data() {
    local node_index="$1"
    local node_target_addr="${ONPREM_USER}@${NODE_IP_LIST[${node_index}]}"
    local node_login_pw="${NODE_PW_LIST[${node_index}]}"

    printf "\n* >> Downloading data from node $node_index ($node_target_addr) *********************************************************\n\n"

    printf "node_target_addr='$node_target_addr'\n"

    # 1. Create tgz file for node
    printf "\n\n<<< Creating tgz file for node $node_index >>>\n\n"
    TGZ_CMD="ssh -v $node_target_addr 'sudo -S ls -la; cd /home/${SEASON}/ain_blockchain_data; tar cvf - chains snapshots | gzip -c > ~/ain_blockchain_data.tar.gz'"
    printf "TGZ_CMD=$TGZ_CMD\n\n"
    eval "echo ${node_login_pw} | sshpass -f <(printf '%s\n' ${node_login_pw}) ${TGZ_CMD}"

    # 2. Copy tgz file from node
    printf "\n\n<<< Copying tgz file from node $node_index >>>\n\n"
    SCP_CMD="scp -rv $node_target_addr:~/ain_blockchain_data.tar.gz ."
    printf "SCP_CMD=$SCP_CMD\n\n"
    eval "sshpass -f <(printf '%s\n' ${node_login_pw}) ${SCP_CMD}"

    # 3. Clean up tgz file for node
    printf "\n\n<<< Cleaning up tgz file for node $node_index >>>\n\n"
    CLEANUP_CMD="ssh -v $node_target_addr 'rm ~/ain_blockchain_data.tar.gz'"
    printf "CLEANUP_CMD=$CLEANUP_CMD\n\n"
    eval "sshpass -f <(printf '%s\n' ${node_login_pw}) ${CLEANUP_CMD}"
}

function upload_data() {
    local node_index="$1"
    local node_target_addr="${ONPREM_USER}@${NODE_IP_LIST[${node_index}]}"
    local node_login_pw="${NODE_PW_LIST[${node_index}]}"

    printf "\n* >> Uploading data from node $node_index ($node_target_addr) *********************************************************\n\n"

    printf "node_target_addr='$node_target_addr'\n"

    # 1. Copy tgz file to node
    printf "\n\n<<< Copying tgz file to node $node_index >>>\n\n"
    SCP_CMD="scp -rv ./ain_blockchain_data.tar.gz $node_target_addr:~"
    printf "SCP_CMD=$SCP_CMD\n\n"
    eval "sshpass -f <(printf '%s\n' ${node_login_pw}) ${SCP_CMD}"

    # 2. Extract tgz file for node
    printf "\n\n<<< Extracting tgz file for node $node_index >>>\n\n"
    TGZ_CMD="ssh -v $node_target_addr 'sudo -S ls -la; cd /home; sudo mkdir -p ${SEASON}/ain_blockchain_data; sudo chown $ONPREM_USER:$ONPREM_USER ${SEASON} ${SEASON}/ain_blockchain_data; sudo chmod 777 ${SEASON} ${SEASON}/ain_blockchain_data; cd ${SEASON}/ain_blockchain_data; gzip -dc ~/ain_blockchain_data.tar.gz | tar xvf -'"
    printf "TGZ_CMD=$TGZ_CMD\n\n"
    eval "echo ${node_login_pw} | sshpass -f <(printf '%s\n' ${node_login_pw}) ${TGZ_CMD}"

    # 3. Clean up tgz file for node
    printf "\n\n<<< Cleaning up tgz file for node $node_index >>>\n\n"
    CLEANUP_CMD="ssh -v $node_target_addr 'rm ~/ain_blockchain_data.tar.gz'"
    printf "CLEANUP_CMD=$CLEANUP_CMD\n\n"
    eval "sshpass -f <(printf '%s\n' ${node_login_pw}) ${CLEANUP_CMD}"
}

if [[ "$COMMAND" = 'upload' ]]; then
    upload_data "$NODE_INDEX"
else
    download_data "$NODE_INDEX"
fi
