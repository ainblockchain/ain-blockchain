#!/bin/sh

if [ "$#" -lt 2 ]; then
    echo "Usage: sh start_node.sh spring 0 0"
    exit
fi

if [ "$1" = 'spring' ]; then
    export GENESIS_CONFIGS_DIR="genesis-configs/testnet-prod-spring"
elif [ "$1" = 'summer' ]; then
    export GENESIS_CONFIGS_DIR="genesis-configs/testnet-prod-summer"
elif [ "$1" = 'staging' ]; then
    export GENESIS_CONFIGS_DIR="genesis-configs/testnet-staging"
elif [ "$1" = 'dev' ]; then
    export GENESIS_CONFIGS_DIR="genesis-configs/testnet-dev"
  if [ "$2" -lt 0 ] || [ "$2" -gt 20 ]; then
    echo "Invalid shard ID argument: $2"
    exit
  elif [ "$2" -gt 0 ]; then
    export GENESIS_CONFIGS_DIR="genesis-configs/shard-$2"
  fi
else
    echo "Invalid season argument: $1"
    exit
fi

if [ "$3" -lt 0 ] || [ "$3" -gt 4 ]; then
    echo "Invalid account_index argument: $2"
    exit
fi

export ACCOUNT_INDEX="$3"
echo "ACCOUNT_INDEX=$ACCOUNT_INDEX"

export DEBUG=false
export LIGHTWEIGHT=false
export STAKE=250

nohup node --async-stack-traces client/index.js >/dev/null 2>error_logs.txt &
