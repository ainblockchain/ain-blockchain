#!/bin/bash

if [[ $# -lt 4 ]] || [[ $# -gt 12 ]]; then
    printf "Usage: bash deploy_blockchain_incremental_onprem.sh [staging|spring|mainnet] <# of Shards> <Parent Node Index Begin> <Parent Node Index End> [--setup] [--keystore|--mnemonic|--private-key] [--keep-code|--no-keep-code] [--keep-data|--no-keep-data] [--full-sync|--fast-sync] [--chown-data|--no-chown-data] [--kill-job|--kill-only]\n"
    printf "Example: bash deploy_blockchain_incremental_onprem.sh staging 0  0  4 --keystore --no-keep-code\n"
    printf "Example: bash deploy_blockchain_incremental_onprem.sh staging 0  0  0 --keystore --keep-code\n"
    #printf "Example: bash deploy_blockchain_incremental_onprem.sh staging 0 -1 -1 --setup --keystore --no-keep-code\n"
    printf "Example: bash deploy_blockchain_incremental_onprem.sh staging 0  0  0 --setup --keystore --no-keep-code\n"
    #printf "Note: <Parent Node Index Begin> = -1 is for tracker\n"
    printf "Note: <Parent Node Index End> is inclusive\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ deploy_blockchain_incremental_onprem.sh ]]]]]\n\n"

if [[ "$1" = 'staging' ]] || [[ "$1" = 'spring' ]] || [[ "$1" = 'mainnet' ]]; then
    SEASON="$1"
else
    printf "Invalid <Project/Season> argument: $1\n"
    exit
fi
printf "SEASON=$SEASON\n"

ONPREM_USER="nvidia"
printf "ONPREM_USER=$ONPREM_USER\n"

number_re='^[0-9]+$'
if [[ ! $2 =~ $number_re ]] ; then
    printf "Invalid <# of Shards> argument: $2\n"
    exit
fi
PARENT_NODE_INDEX_BEGIN=$3
printf "PARENT_NODE_INDEX_BEGIN=$PARENT_NODE_INDEX_BEGIN\n"
PARENT_NODE_INDEX_END=$4
printf "PARENT_NODE_INDEX_END=$PARENT_NODE_INDEX_END\n"
printf "\n"

function parse_options() {
    local option="$1"
    if [[ $option = '--setup' ]]; then
        SETUP_OPTION="$option"
    elif [[ $option = '--private-key' ]]; then
        ACCOUNT_INJECTION_OPTION="$option"
    elif [[ $option = '--keystore' ]]; then
        ACCOUNT_INJECTION_OPTION="$option"
    elif [[ $option = '--mnemonic' ]]; then
        ACCOUNT_INJECTION_OPTION="$option"
    elif [[ $option = '--keep-code' ]]; then
        KEEP_CODE_OPTION="$option"
    elif [[ $option = '--no-keep-code' ]]; then
        KEEP_CODE_OPTION="$option"
    elif [[ $option = '--keep-data' ]]; then
        KEEP_DATA_OPTION="$option"
    elif [[ $option = '--no-keep-data' ]]; then
        KEEP_DATA_OPTION="$option"
    elif [[ $option = '--full-sync' ]]; then
        SYNC_MODE_OPTION="$option"
    elif [[ $option = '--fast-sync' ]]; then
        SYNC_MODE_OPTION="$option"
    elif [[ $option = '--chown-data' ]]; then
        CHOWN_DATA_OPTION="$option"
    elif [[ $option = '--no-chown-data' ]]; then
        CHOWN_DATA_OPTION="$option"
    elif [[ $option = '--kill-job' ]]; then
        KILL_OPTION="$option"
    elif [[ $option = '--kill-only' ]]; then
        KILL_OPTION="$option"
    else
        printf "Invalid option: $option\n"
        exit
    fi
}

# Parse options.
SETUP_OPTION=""
ACCOUNT_INJECTION_OPTION="--private-key"
KEEP_CODE_OPTION="--keep-code"
KEEP_DATA_OPTION="--keep-data"
SYNC_MODE_OPTION="--fast-sync"
CHOWN_DATA_OPTION="--no-chown-data"
KILL_OPTION="--kill-job"

ARG_INDEX=5
while [ $ARG_INDEX -le $# ]; do
  parse_options "${!ARG_INDEX}"
  ((ARG_INDEX++))
done

if [[ $SETUP_OPTION = "--setup" ]] && [[ ! $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
    printf "You cannot use --setup without --no-keep-code\n"
    exit
fi

if [[ $PARENT_NODE_INDEX_BEGIN -lt 0 ]]; then
    printf "Please use deploy_blockchain_incremental_gcp.sh instead for the tracker job.\n"
    exit
fi

printf "SETUP_OPTION=$SETUP_OPTION\n"
printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
printf "KEEP_DATA_OPTION=$KEEP_DATA_OPTION\n"
printf "SYNC_MODE_OPTION=$SYNC_MODE_OPTION\n"
printf "CHOWN_DATA_OPTION=$CHOWN_DATA_OPTION\n"
printf "KILL_OPTION=$KILL_OPTION\n"

# Json-RPC-enabled blockchain nodes
JSON_RPC_NODE_INDEX_GE=0
JSON_RPC_NODE_INDEX_LE=4
# Rest-Function-enabled blockchain nodes
REST_FUNC_NODE_INDEX_GE=0
REST_FUNC_NODE_INDEX_LE=2
# Event-Handler-enabled blockchain nodes
EVENT_HANDLER_NODE_INDEX_GE=0
EVENT_HANDLER_NODE_INDEX_LE=4

printf "\n"
printf "JSON_RPC_NODE_INDEX_GE=$JSON_RPC_NODE_INDEX_GE\n"
printf "JSON_RPC_NODE_INDEX_LE=$JSON_RPC_NODE_INDEX_LE\n"
printf "REST_FUNC_NODE_INDEX_GE=$REST_FUNC_NODE_INDEX_GE\n"
printf "REST_FUNC_NODE_INDEX_LE=$REST_FUNC_NODE_INDEX_LE\n"
printf "EVENT_HANDLER_NODE_INDEX_GE=$EVENT_HANDLER_NODE_INDEX_GE\n"
printf "EVENT_HANDLER_NODE_INDEX_LE=$EVENT_HANDLER_NODE_INDEX_LE\n"

if [[ "$ACCOUNT_INJECTION_OPTION" = "" ]]; then
    printf "Must provide an ACCOUNT_INJECTION_OPTION\n"
    exit
fi

# Get confirmation.
if [[ "$SEASON" = "mainnet" ]]; then
    printf "\n"
    printf "Do you want to proceed for $SEASON? Enter [mainnet]: "
    read CONFIRM
    printf "\n"
    if [[ ! $CONFIRM = "mainnet" ]]
    then
        [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
    fi
elif [[ "$SEASON" = "spring" ]] || [[ "$SEASON" = "summer" ]]; then
    printf "\n"
    printf "Do you want to proceed for $SEASON? Enter [testnet]: "
    read CONFIRM
    printf "\n"
    if [[ ! $CONFIRM = "testnet" ]]; then
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

if [[ ! $KILL_OPTION = '--kill-only' ]]; then
    # Read node urls
    IFS=$'\n' read -d '' -r -a NODE_URL_LIST < ./ip_addresses/${SEASON}_onprem.txt
    if [[ $ACCOUNT_INJECTION_OPTION = "--keystore" ]]; then
        # Get keystore password
        printf "Enter keystore password: "
        read -s KEYSTORE_PW
        printf "\n\n"
        if [[ $SEASON = "mainnet" ]]; then
            KEYSTORE_DIR="mainnet_prod_keys"
        elif [[ $SEASON = "spring" ]] || [[ $SEASON = "summer" ]]; then
            KEYSTORE_DIR="testnet_prod_keys"
        else
            KEYSTORE_DIR="testnet_dev_staging_keys"
        fi
    elif [[ $ACCOUNT_INJECTION_OPTION = "--mnemonic" ]]; then
        IFS=$'\n' read -d '' -r -a MNEMONIC_LIST < ./testnet_mnemonics/$SEASON.txt
    fi
fi

#FILES_FOR_TRACKER="blockchain/ blockchain-configs/ block-pool/ client/ common/ consensus/ db/ logger/ tracker-server/ traffic/ package.json setup_blockchain_ubuntu_onprem.sh start_tracker_genesis_onprem.sh start_tracker_incremental_onprem.sh"
FILES_FOR_NODE="blockchain/ blockchain-configs/ block-pool/ client/ common/ consensus/ db/ event-handler/ json_rpc/ logger/ node/ p2p/ tools/ traffic/ tx-pool/ package.json setup_blockchain_ubuntu_onprem.sh start_node_genesis_onprem.sh start_node_incremental_onprem.sh wait_until_node_sync.sh stop_local_blockchain.sh"

#function deploy_tracker() {
#    printf "\n* >> Deploying files for tracker ********************************************************\n\n"
#
#    printf "TRACKER_TARGET_ADDR='$TRACKER_TARGET_ADDR'\n"
#    printf "TRACKER_ZONE='$TRACKER_ZONE'\n"
#
#    # 0. Kill jobs for tracker (if necessary)
#    if [[ $KILL_OPTION = "--kill-only" ]]; then
#        printf "\n\n<<< Killing tracker job (${TRACKER_TARGET_ADDR}) *********************************************************\n\n"
#
#        KILL_CMD="gcloud compute ssh $TRACKER_TARGET_ADDR --command 'sudo killall node' --project $PROJECT_ID --zone $TRACKER_ZONE"
#        printf "KILL_CMD=$KILL_CMD\n\n"
#        eval $KILL_CMD
#
#        return 0
#    fi
#
#    # 1. Copy files for tracker (if necessary)
#    if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
#        printf "\n\n[[[ Copying files for tracker ]]]\n\n"
#        gcloud compute ssh $TRACKER_TARGET_ADDR --command "sudo rm -rf ~/ain-blockchain; sudo mkdir ~/ain-blockchain; sudo chmod -R 777 ~/ain-blockchain" --project $PROJECT_ID --zone $TRACKER_ZONE
#        SCP_CMD="gcloud compute scp --recurse $FILES_FOR_TRACKER ${TRACKER_TARGET_ADDR}:~/ain-blockchain --project $PROJECT_ID --zone $TRACKER_ZONE"
#        printf "SCP_CMD=$SCP_CMD\n\n"
#        eval $SCP_CMD
#    fi
#
#    # 2. Set up tracker (if necessary)
#    # ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
#    if [[ $SETUP_OPTION = "--setup" ]]; then
#        printf "\n\n[[[ Setting up tracker ]]]\n\n"
#        SETUP_CMD="gcloud compute ssh $TRACKER_TARGET_ADDR --command 'cd ./ain-blockchain; . setup_blockchain_ubuntu_onprem.sh' --project $PROJECT_ID --zone $TRACKER_ZONE"
#        printf "SETUP_CMD=$SETUP_CMD\n\n"
#        eval $SETUP_CMD
#    fi
#
#    # 3. Start tracker
#    printf "\n\n[[[ Starting tracker ]]]\n\n"
#
#    printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
#
#    printf "\n"
#    START_TRACKER_CMD="gcloud compute ssh $TRACKER_TARGET_ADDR --command '$START_TRACKER_CMD_BASE $ONPREM_USER $KEEP_CODE_OPTION' --project $PROJECT_ID --zone $TRACKER_ZONE"
#    printf "START_TRACKER_CMD=$START_TRACKER_CMD\n\n"
#    eval $START_TRACKER_CMD
#}

function deploy_node() {
    local node_index="$1"
    local node_target_addr="${ONPREM_USER}@${NODE_IP_LIST[${node_index}]}"
    local node_login_pw="${NODE_PW_LIST[${node_index}]}"

    printf "\n\n* >> Deploying files for node $node_index ($node_target_addr) *********************************************************\n\n"

    # 0. Kill jobs for node (if necessary)
    if [[ $KILL_OPTION = "--kill-only" ]]; then
        printf "\n\n<<< Killing node $node_index job (${node_target_addr}) *********************************************************\n\n"

        KILL_CMD="ssh $node_target_addr 'sudo -S pkill -f client/${SEASON}-ain-blockchain-index.js'"
        printf "\n\nKILL_CMD=$KILL_CMD\n\n"
        eval "echo ${node_login_pw} | sshpass -f <(printf '%s\n' ${node_login_pw}) ${KILL_CMD}"

        return 0
    fi

    # 1. Copy files for node (if necessary)
    if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
        printf "\n\n<<< Copying files for node $node_index ($node_target_addr) >>>\n\n"

        echo ${node_login_pw} | sshpass -f <(printf '%s\n' ${node_login_pw}) ssh $node_target_addr "sudo -S rm -rf ~/ain-blockchain; mkdir ~/ain-blockchain; chmod -R 777 ~/ain-blockchain"
        SCP_CMD="scp -r $FILES_FOR_NODE ${node_target_addr}:~/ain-blockchain"
        printf "\n\nSCP_CMD=$SCP_CMD\n\n"
        eval "sshpass -f <(printf '%s\n' ${node_login_pw}) ${SCP_CMD}"
    fi

    # 2. Set up node (if necessary)
    # ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
    if [[ $SETUP_OPTION = "--setup" ]]; then
        printf "\n\n<<< Setting up node $node_index ($node_target_addr) >>>\n\n"

        SETUP_CMD="ssh $node_target_addr 'cd ./ain-blockchain; . setup_blockchain_ubuntu_onprem.sh'"
        printf "\n\nSETUP_CMD=$SETUP_CMD\n\n"
        eval "echo ${node_login_pw} | sshpass -f <(printf '%s\n' ${node_login_pw}) ${SETUP_CMD}"
    fi

    # 3. Start node
    printf "\n\n<<< Starting node $node_index ($node_target_addr) >>>\n\n"

    if [[ $node_index -ge $JSON_RPC_NODE_INDEX_GE ]] && [[ $node_index -le $JSON_RPC_NODE_INDEX_LE ]]; then
        JSON_RPC_OPTION="--json-rpc"
    else
        JSON_RPC_OPTION=""
    fi
    UPDATE_FRONT_DB_OPTION="--update-front-db"
    if [[ $node_index -ge $REST_FUNC_NODE_INDEX_GE ]] && [[ $node_index -le $REST_FUNC_NODE_INDEX_LE ]]; then
        REST_FUNC_OPTION="--rest-func"
    else
        REST_FUNC_OPTION=""
    fi
    if [[ $node_index -ge $EVENT_HANDLER_NODE_INDEX_GE ]] && [[ $node_index -le $EVENT_HANDLER_NODE_INDEX_LE ]]; then
        EVENT_HANDLER_OPTION="--event-handler"
    else
        EVENT_HANDLER_OPTION=""
    fi

    printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
    printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
    printf "KEEP_DATA_OPTION=$KEEP_DATA_OPTION\n"
    printf "SYNC_MODE_OPTION=$SYNC_MODE_OPTION\n"
    printf "CHOWN_DATA_OPTION=$CHOWN_DATA_OPTION\n"
    printf "JSON_RPC_OPTION=$JSON_RPC_OPTION\n"
    printf "UPDATE_FRONT_DB_OPTION=$UPDATE_FRONT_DB_OPTION\n"
    printf "REST_FUNC_OPTION=$REST_FUNC_OPTION\n"
    printf "EVENT_HANDLER_OPTION=$EVENT_HANDLER_OPTION\n"

    START_NODE_CMD="ssh $node_target_addr '$START_NODE_CMD_BASE $SEASON $ONPREM_USER 0 $node_index $KEEP_CODE_OPTION $KEEP_DATA_OPTION $SYNC_MODE_OPTION $CHOWN_DATA_OPTION $ACCOUNT_INJECTION_OPTION $JSON_RPC_OPTION $UPDATE_FRONT_DB_OPTION $REST_FUNC_OPTION $EVENT_HANDLER_OPTION'"
    printf "\n\nSTART_NODE_CMD=$START_NODE_CMD\n\n"
    eval "echo ${node_login_pw} | sshpass -f <(printf '%s\n' ${node_login_pw}) ${START_NODE_CMD}"

    # 4. Inject node account
    sleep 5
    if [[ $ACCOUNT_INJECTION_OPTION = "--keystore" ]]; then
        local node_url=${NODE_URL_LIST[${node_index}]}
        printf "\n\n* >> Initializing account for node $node_index ($node_target_addr) ********************\n\n"
        printf "node_url='$node_url'\n"

        KEYSTORE_FILE_PATH="$KEYSTORE_DIR/keystore_node_$node_index.json"
        {
            echo $KEYSTORE_FILE_PATH
            sleep 1
            echo $KEYSTORE_PW
        } | node inject_node_account.js $node_url $ACCOUNT_INJECTION_OPTION
    elif [[ $ACCOUNT_INJECTION_OPTION = "--mnemonic" ]]; then
        local node_url=${NODE_URL_LIST[${node_index}]}
        local MNEMONIC=${MNEMONIC_LIST[${node_index}]}
        printf "\n\n* >> Injecting an account for node $node_index ($node_target_addr) ********************\n\n"
        printf "node_url='$node_url'\n"

        {
            echo $MNEMONIC
            sleep 1
            echo 0
        } | node inject_node_account.js $node_url $ACCOUNT_INJECTION_OPTION
    else
        local node_url=${NODE_URL_LIST[${node_index}]}
        printf "\n\n* >> Injecting an account for node $node_index ($node_target_addr) ********************\n\n"
        printf "node_url='$node_url'\n"

        local GENESIS_ACCOUNTS_PATH="blockchain-configs/base/genesis_accounts.json"
        if [[ "$SEASON" = "spring" ]] || [[ "$SEASON" = "summer" ]]; then
            GENESIS_ACCOUNTS_PATH="blockchain-configs/testnet-prod/genesis_accounts.json"
        fi
        PRIVATE_KEY=$(cat $GENESIS_ACCOUNTS_PATH | jq -r '.others['$node_index'].private_key')
        echo $PRIVATE_KEY | node inject_node_account.js $node_url $ACCOUNT_INJECTION_OPTION
    fi

    # 5. Wait until node is synced
    printf "\n\n<<< Waiting until node $node_index ($node_target_addr) is synced >>>\n\n"

    WAIT_CMD="ssh $node_target_addr 'cd \$(find /home/${SEASON}/ain-blockchain* -maxdepth 0 -type d); . wait_until_node_sync.sh'"
    printf "\n\nWAIT_CMD=$WAIT_CMD\n\n"
    eval "echo ${node_login_pw} | sshpass -f <(printf '%s\n' ${node_login_pw}) ${WAIT_CMD}"
}

printf "###############################################################################\n"
printf "# Deploying parent blockchain #\n"
printf "###############################################################################\n\n"

printf "\nStarting blockchain servers...\n\n"
if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
    GO_TO_PROJECT_ROOT_CMD="cd ./ain-blockchain"
else
    GO_TO_PROJECT_ROOT_CMD="cd \$(find /home/${SEASON}/ain-blockchain* -maxdepth 0 -type d)"
fi

#START_TRACKER_CMD_BASE="$GO_TO_PROJECT_ROOT_CMD && . start_tracker_incremental_onprem.sh"
START_NODE_CMD_BASE="$GO_TO_PROJECT_ROOT_CMD && . start_node_incremental_onprem.sh"

## Tracker server is deployed with PARENT_NODE_INDEX_BEGIN = -1
#if [[ $PARENT_NODE_INDEX_BEGIN = -1 ]]; then
#    deploy_tracker
#fi
begin_index=$PARENT_NODE_INDEX_BEGIN
if [[ $begin_index -lt 0 ]]; then
  begin_index=0
fi
if [[ $begin_index -le $PARENT_NODE_INDEX_END ]] && [[ $PARENT_NODE_INDEX_END -ge 0 ]]; then
    for node_index in `seq $(( $begin_index )) $(( $PARENT_NODE_INDEX_END ))`; do
        deploy_node "$node_index"
        if [[ ! $KILL_OPTION = "--kill-only" ]]; then
            sleep 40
        fi
    done
fi
