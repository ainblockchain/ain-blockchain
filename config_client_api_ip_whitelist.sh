#!/bin/bash

function usage() {
    printf "\n"
    printf "Usage: bash config_client_api_ip_whitelist.sh [dev|staging|sandbox|exp|spring|summer|mainnet] [gcp|onprem] [get|add|remove] [<IP Address>]\n"
    printf "Example: bash config_client_api_ip_whitelist.sh staging onprem get\n"
    printf "Example: bash config_client_api_ip_whitelist.sh staging onprem add 32.190.239.181\n"
    printf "Example: bash config_client_api_ip_whitelist.sh staging onprem add '*'\n"
    printf "Example: bash config_client_api_ip_whitelist.sh staging onprem remove 32.190.239.181\n"
    printf "\n"
    exit
}

if [[ $# -lt 3 ]] || [[ $# -gt 4 ]]; then
    usage
fi
printf "\n[[[[[ config_client_api_ip_whitelist.sh ]]]]]\n\n"

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
IP_ADDR=""
if [[ $# = 4 ]]; then
    IP_ADDR="$4"
fi

if [[ "$COMMAND" = 'get' ]]; then
    if [[ ! "$IP_ADDR" = "" ]]; then
        printf "\nInvalid <IP Address> argument: $IP_ADDR\n"
        usage
    fi
elif [[ "$COMMAND" = 'add' ]] || [[ "$COMMAND" = 'remove' ]]; then
    if [[ "$IP_ADDR" = "" ]]; then
        printf "\nInvalid <IP Address> argument: $IP_ADDR\n"
        usage
    fi
else
    printf "\nInvalid <Command> argument: $COMMAND\n"
    usage
fi
printf "COMMAND=$COMMAND\n"
printf "IP_ADDR=$IP_ADDR\n"

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
    COMMAND_NODE_JS_FILE="addToDevClientApiIpWhitelist.js"
elif [[ $COMMAND = "remove" ]]; then
    COMMAND_NODE_JS_FILE="removeFromDevClientApiIpWhitelist.js"
else
    COMMAND_NODE_JS_FILE="getDevClientApiIpWhitelist.js"
fi

printf "CHAIN_ID=$CHAIN_ID\n"
printf "KEYSTORE_DIR=$KEYSTORE_DIR\n"
printf "COMMAND_NODE_JS_FILE=$COMMAND_NODE_JS_FILE\n"

function config_node() {
    local node_index="$1"
    local node_url=${NODE_URL_LIST[${node_index}]}

    printf "\n\n<<< Configuring ip whitelist of node $node_index ($node_url) >>>\n\n"

    KEYSTORE_FILE_PATH="$KEYSTORE_DIR/keystore_node_$node_index.json"
    if [[ $COMMAND = "get" ]]; then
        CONFIG_NODE_CMD="node tools/api-access/$COMMAND_NODE_JS_FILE $node_url $CHAIN_ID keystore $KEYSTORE_FILE_PATH"
    else
        CONFIG_NODE_CMD="node tools/api-access/$COMMAND_NODE_JS_FILE $node_url $CHAIN_ID $IP_ADDR keystore $KEYSTORE_FILE_PATH"
    fi

    printf "\n"
    printf "CONFIG_NODE_CMD=$CONFIG_NODE_CMD\n\n"
    eval "echo $KEYSTORE_PW | $CONFIG_NODE_CMD"
}

for j in `seq $(( 0 )) $(( 4 ))`; do
    config_node "$j"
done
