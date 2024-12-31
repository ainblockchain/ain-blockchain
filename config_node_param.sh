#!/bin/bash

function usage() {
    printf "\n"
    printf "Usage: bash config_node_param.sh [dev|staging|sandbox|exp|spring|summer|mainnet] [gcp|onprem] [get|add|remove] <Param> [<Value>]\n"
    printf "Example: bash config_node_param.sh staging onprem get DEV_CLIENT_API_IP_WHITELIST\n"
    printf "Example: bash config_node_param.sh staging onprem add DEV_CLIENT_API_IP_WHITELIST 32.190.239.181\n"
    printf "Example: bash config_node_param.sh staging onprem add DEV_CLIENT_API_IP_WHITELIST '*'\n"
    printf "Example: bash config_node_param.sh staging onprem remove DEV_CLIENT_API_IP_WHITELIST 32.190.239.181\n"
    printf "Example: bash config_node_param.sh staging onprem set DEV_CLIENT_API_IP_WHITELIST '*'\n"
    printf "Example: bash config_node_param.sh staging onprem get CORS_WHITELIST\n"
    printf "\n"
    exit
}

if [[ $# -lt 4 ]] || [[ $# -gt 5 ]]; then
    usage
fi
printf "\n[[[[[ config_node_param.sh ]]]]]\n\n"

if [[ "$1" = 'dev' ]] || [[ "$1" = 'staging' ]] || [[ "$1" = 'sandbox' ]] || [[ "$1" = 'exp' ]] || [[ "$1" = 'spring' ]] || [[ "$1" = 'summer' ]] || [[ "$1" = 'mainnet' ]]; then
    SEASON="$1"
else
    printf "\nInvalid <Season> argument: $1\n"
    usage
fi
printf "SEASON=$SEASON\n"

if [[ "$2" = 'gcp' ]] || [[ "$2" = 'onprem' ]]; then
    BLOCKCHAIN_HOSTING="$2"
else
    printf "\nInvalid <Blockchain Hosting> argument: $2\n"
    usage
fi
printf "BLOCKCHAIN_HOSTING=$BLOCKCHAIN_HOSTING\n"

COMMAND="$3"
PARAM="$4"
VALUE=""
if [[ $# = 5 ]]; then
    VALUE="$5"
fi

if [[ "$COMMAND" = 'get' ]]; then
    if [[ ! "$VALUE" = "" ]]; then
        printf "\nInvalid <Value> argument: $VALUE\n"
        usage
    fi
elif [[ "$COMMAND" = 'add' ]] || [[ "$COMMAND" = 'remove' ]] || [[ "$COMMAND" = 'set' ]]; then
    if [[ "$PARAM" = "" ]]; then
        printf "\nInvalid <Param> argument: $PARAM\n"
        usage
    fi
    if [[ "$VALUE" = "" ]]; then
        printf "\nInvalid <Value> argument: $VALUE\n"
        usage
    fi
else
    printf "\nInvalid <Command> argument: $COMMAND\n"
    usage
fi
printf "COMMAND=$COMMAND\n"
printf "PARAM=$PARAM\n"
printf "VALUE=$VALUE\n"

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

# Read node urls
IFS=$'\n' read -d '' -r -a NODE_URL_LIST < ./ip_addresses/${SEASON}_${BLOCKCHAIN_HOSTING}.txt

# Get keystore password
printf "Enter keystore password: "
read -s KEYSTORE_PW
printf "\n\n"
if [[ $SEASON = "mainnet" ]]; then
    CHAIN_ID="1"
    KEYSTORE_DIR="mainnet_prod_keys"
elif [[ $SEASON = "spring" ]] || [[ $SEASON = "summer" ]]; then
    CHAIN_ID="0"
    KEYSTORE_DIR="testnet_prod_keys"
else
    CHAIN_ID="0"
    KEYSTORE_DIR="testnet_dev_staging_keys"
fi

if [[ $COMMAND = "add" ]]; then
    COMMAND_NODE_JS_FILE="addToWhitelistNodeParam.js"
elif [[ $COMMAND = "remove" ]]; then
    COMMAND_NODE_JS_FILE="removeFromWhitelistNodeParam.js"
elif [[ $COMMAND = "set" ]]; then
    COMMAND_NODE_JS_FILE="setNodeParam.js"
else
    COMMAND_NODE_JS_FILE="getNodeParam.js"
fi

printf "CHAIN_ID=$CHAIN_ID\n"
printf "KEYSTORE_DIR=$KEYSTORE_DIR\n"
printf "COMMAND_NODE_JS_FILE=$COMMAND_NODE_JS_FILE\n"

function config_node() {
    local node_index="$1"
    local node_url=${NODE_URL_LIST[${node_index}]}

    printf "\n\n<<< Configuring node params of node $node_index ($node_url) >>>\n\n"

    KEYSTORE_FILE_PATH="$KEYSTORE_DIR/keystore_node_$node_index.json"
    if [[ $COMMAND = "get" ]]; then
        CONFIG_NODE_CMD="node tools/api-access/$COMMAND_NODE_JS_FILE $node_url $CHAIN_ID $PARAM $VALUE keystore $KEYSTORE_FILE_PATH"
    else
        CONFIG_NODE_CMD="node tools/api-access/$COMMAND_NODE_JS_FILE $node_url $CHAIN_ID $PARAM $VALUE keystore $KEYSTORE_FILE_PATH"
    fi

    printf "\n"
    printf "CONFIG_NODE_CMD=$CONFIG_NODE_CMD\n\n"
    eval "echo $KEYSTORE_PW | $CONFIG_NODE_CMD"
}

for j in `seq $(( 0 )) $(( 4 ))`; do
    config_node "$j"
done
