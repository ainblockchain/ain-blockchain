#!/bin/sh

if [ "$#" -lt 2 ]; then
    echo "Usage: sh start_node.sh spring 0 0"
    exit
fi

if [ "$1" = 'spring' ]; then
    export GENESIS_CONFIGS_DIR="genesis-configs/testnet"
    export TRACKER_WS_ADDR="ws://35.221.137.80:5000"
elif [ "$1" = 'summer' ]; then
    export GENESIS_CONFIGS_DIR="genesis-configs/testnet"
    export TRACKER_WS_ADDR="ws://35.194.172.106:5000"
elif [ "$1" = 'staging' ]; then
    export GENESIS_CONFIGS_DIR="genesis-configs/testnet"
    export TRACKER_WS_ADDR="ws://35.221.150.73:5000"
elif [ "$1" = 'dev' ]; then
    export GENESIS_CONFIGS_DIR="genesis-configs/testnet"
    export TRACKER_WS_ADDR="ws://34.80.184.73:5000"
  if [ "$2" -lt 0 ] || [ "$2" -gt 20 ]; then
    echo "Invalid shard ID argument: $2"
    exit
  elif [ "$2" -gt 0 ]; then
    export GENESIS_CONFIGS_DIR="genesis-configs/sim-shard"
  fi
else
    echo "Invalid season argument: $1"
    exit
fi

if [ "$3" -lt 0 ] || [ "$3" -gt 4 ]; then
    echo "Invalid account_index argument: $2"
    exit
fi

echo "TRACKER_WS_ADDR=$TRACKER_WS_ADDR"

export ACCOUNT_INDEX="$3"
echo "ACCOUNT_INDEX=$ACCOUNT_INDEX"

export DEBUG=false
export LIGHTWEIGHT=false
export STAKE=100000

nohup node --async-stack-traces client/index.js >/dev/null 2>error_logs.txt &
