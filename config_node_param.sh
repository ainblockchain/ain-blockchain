#!/bin/bash

function usage() {
    printf "\n"
    printf "Usage: bash config_node_param.sh [dev|staging|sandbox|exp|spring|summer|mainnet] [get|add|remove] <Param> [<Value>]\n"
    printf "Example: bash config_node_param.sh dev get DEV_CLIENT_API_IP_WHITELIST\n"
    printf "Example: bash config_node_param.sh dev add DEV_CLIENT_API_IP_WHITELIST 32.190.239.181\n"
    printf "Example: bash config_node_param.sh dev add DEV_CLIENT_API_IP_WHITELIST '*'\n"
    printf "Example: bash config_node_param.sh dev remove DEV_CLIENT_API_IP_WHITELIST 32.190.239.181\n"
    printf "Example: bash config_node_param.sh dev set DEV_CLIENT_API_IP_WHITELIST '*'\n"
    printf "Example: bash config_node_param.sh dev get CORS_WHITELIST\n"
    printf "\n"
    exit
}

if [[ $# -lt 3 ]] || [[ $# -gt 4 ]]; then
    usage
fi
printf "\n[[[[[ config_node_param.sh ]]]]]\n\n"

if [[ "$1" = 'dev' ]] || [[ "$1" = 'staging' ]] || [[ "$1" = 'sandbox' ]] || [[ "$1" = 'exp' ]] || [[ "$1" = 'spring' ]] || [[ "$1" = 'summer' ]] || [[ "$1" = 'mainnet' ]]; then
    SEASON="$1"
else
    printf "Invalid <Project/Season> argument: $1\n"
    usage
fi
printf "SEASON=$SEASON\n"

if [[ "$2" = 'get' ]]; then
    COMMAND="$2"
    PARAM="$3"
    VALUE="$4"
    if [[ ! "$VALUE" = "" ]]; then
        printf "\nInvalid argument: $VALUE\n"
        usage
    fi
elif [[ "$2" = 'add' ]] || [[ "$2" = 'remove' ]] || [[ "$2" = 'set' ]]; then
    COMMAND="$2"
    PARAM="$3"
    VALUE="$4"
    if [[ "$PARAM" = "" ]]; then
        printf "\nInvalid <Param> argument: $PARAM\n"
        usage
    fi
    if [[ "$VALUE" = "" ]]; then
        printf "\nInvalid <Value> argument: $VALUE\n"
        usage
    fi
else
    printf "Invalid <Command> argument: $2\n"
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

# Read node ip addresses
IFS=$'\n' read -d '' -r -a IP_ADDR_LIST < ./ip_addresses/$SEASON.txt

# Get keystore password
printf "Enter password: "
read -s PASSWORD
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
    local node_ip_addr=${IP_ADDR_LIST[${node_index}]}

    printf "\n\n<<< Configuring ip whitelist of node $node_index ($node_ip_addr) >>>\n\n"

    KEYSTORE_FILE_PATH="$KEYSTORE_DIR/keystore_node_$node_index.json"
    CONFIG_NODE_CMD="node tools/api-access/$COMMAND_NODE_JS_FILE $node_ip_addr $CHAIN_ID keystore $KEYSTORE_FILE_PATH $PARAM"
    if [[ ! $COMMAND = "get" ]]; then
        CONFIG_NODE_CMD="$CONFIG_NODE_CMD '$VALUE'"
    fi

    printf "\n"
    printf "CONFIG_NODE_CMD=$CONFIG_NODE_CMD\n\n"
    eval "echo $PASSWORD | $CONFIG_NODE_CMD"
}

for j in `seq $(( 0 )) $(( 9 ))`; do
    config_node "$j"
done
