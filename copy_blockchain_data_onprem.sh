#!/bin/bash

function usage() {
    printf "Usage: bash copy_blockchain_data_onprem.sh [staging|spring|mainnet] <Node Index> [download|upload] [<Old Port Number> <New Port Number>]\n"
    printf "Example: bash copy_blockchain_data_onprem.sh staging 0 download\n"
    printf "Example: bash copy_blockchain_data_onprem.sh staging 1 upload 8080 8079\n"
    printf "\n"
    exit
}

if [[ $# != 3 ]] && [[ $# != 5 ]]; then
    usage
fi

if [[ "$1" = 'staging' ]] || [[ "$1" = 'spring' ]] || [[ "$1" = 'mainnet' ]]; then
    SEASON="$1"
else
    printf "Invalid <Season> argument: $1\n"
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

if [[ "$COMMAND" = 'download' ]]; then
    if [[ $# != 3 ]]; then
        printf "\n"
        printf "<Old Port Number> and <New Port Number> can be used only with 'upload' command.\n"
        printf "\n"
        usage
    fi
    OLD_PORT=""
    NEW_PORT=""
else
    if [[ $# != 5 ]]; then
        printf "\n"
        printf "<Old Port Number> and <New Port Number> should be specified with 'upload' command.\n"
        printf "\n"
        usage
    fi
    OLD_PORT="$4"
    NEW_PORT="$5"
fi
printf "OLD_PORT=$OLD_PORT\n"
printf "NEW_PORT=$NEW_PORT\n"

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
    TGZ_CMD="ssh $node_target_addr 'sudo -S ls -la; cd /home/${SEASON}/ain_blockchain_data; tar cvf - chains snapshots | gzip -c > ~/ain_blockchain_data.tar.gz'"
    printf "TGZ_CMD=$TGZ_CMD\n\n"
    eval "echo ${node_login_pw} | sshpass -f <(printf '%s\n' ${node_login_pw}) ${TGZ_CMD}"

    # 2. Copy tgz file from node
    printf "\n\n<<< Copying tgz file from node $node_index >>>\n\n"
    SCP_CMD="scp -r $node_target_addr:~/ain_blockchain_data.tar.gz ."
    printf "SCP_CMD=$SCP_CMD\n\n"
    eval "sshpass -f <(printf '%s\n' ${node_login_pw}) ${SCP_CMD}"

    # 3. Clean up tgz file for node
    printf "\n\n<<< Cleaning up tgz file for node $node_index >>>\n\n"
    CLEANUP_CMD="ssh $node_target_addr 'rm ~/ain_blockchain_data.tar.gz'"
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
    SCP_CMD="scp -r ./ain_blockchain_data.tar.gz $node_target_addr:~"
    printf "SCP_CMD=$SCP_CMD\n\n"
    eval "sshpass -f <(printf '%s\n' ${node_login_pw}) ${SCP_CMD}"

    # 2. Extract tgz file for node
    printf "\n\n<<< Extracting tgz file for node $node_index >>>\n\n"
    TGZ_CMD="ssh $node_target_addr 'sudo -S ls -la; cd /home; sudo mkdir -p ${SEASON}/ain_blockchain_data; sudo chown $ONPREM_USER:$ONPREM_USER ${SEASON} ${SEASON}/ain_blockchain_data; sudo chmod 777 ${SEASON} ${SEASON}/ain_blockchain_data; cd ${SEASON}/ain_blockchain_data; sudo rm -rf chains snapshots; gzip -dc ~/ain_blockchain_data.tar.gz | tar xvf -'"
    printf "TGZ_CMD=$TGZ_CMD\n\n"
    eval "echo ${node_login_pw} | sshpass -f <(printf '%s\n' ${node_login_pw}) ${TGZ_CMD}"

    # 3. Change port number directory
    printf "\n\n<<< Changing port number directory for node $node_index >>>\n\n"
    MV_CMD="ssh $node_target_addr 'mv /home/${SEASON}/ain_blockchain_data/chains/${OLD_PORT} /home/${SEASON}/ain_blockchain_data/chains/${NEW_PORT}; mv /home/${SEASON}/ain_blockchain_data/snapshots/${OLD_PORT} /home/${SEASON}/ain_blockchain_data/snapshots/${NEW_PORT}'"
    printf "MV_CMD=$MV_CMD\n\n"
    eval "sshpass -f <(printf '%s\n' ${node_login_pw}) ${MV_CMD}"

    # 4. Clean up tgz file for node
    printf "\n\n<<< Cleaning up tgz file for node $node_index >>>\n\n"
    CLEANUP_CMD="ssh $node_target_addr 'rm ~/ain_blockchain_data.tar.gz'"
    printf "CLEANUP_CMD=$CLEANUP_CMD\n\n"
    eval "sshpass -f <(printf '%s\n' ${node_login_pw}) ${CLEANUP_CMD}"
}

if [[ "$COMMAND" = 'upload' ]]; then
    upload_data "$NODE_INDEX"
else
    download_data "$NODE_INDEX"
fi
