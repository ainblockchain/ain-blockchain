#!/bin/sh

if [ "$#" -lt 2 ]; then
    echo "Usage: sh start_node_gcp.sh [dev|staging|spring|summer] <Shard Index> <Node Index>"
    echo "Example: sh start_node_gcp.sh spring 0 0"
    exit
fi

export GENESIS_CONFIGS_DIR=genesis-configs/testnet
if [ "$1" = 'spring' ]; then
    export TRACKER_WS_ADDR=ws://35.221.137.80:5000
elif [ "$1" = 'summer' ]; then
    export TRACKER_WS_ADDR=ws://35.194.172.106:5000
elif [ "$1" = 'staging' ]; then
    export TRACKER_WS_ADDR=ws://35.221.150.73:5000
elif [ "$1" = 'dev' ]; then
  if [ "$2" -gt 0 ]; then
    export GENESIS_CONFIGS_DIR=genesis-configs/sim-shard
  fi

  if [ "$2" = 0 ]; then
    export TRACKER_WS_ADDR=ws://34.80.184.73:5000  # dev-tracker-ip
  elif [ "$2" = 1 ]; then
    export TRACKER_WS_ADDR=ws://35.187.153.22:5000  # dev-shard-1-tracker-ip
  elif [ "$2" = 2 ]; then
    export TRACKER_WS_ADDR=ws://34.80.203.104:5000  # dev-shard-2-tracker-ip
  elif [ "$2" = 3 ]; then
    export TRACKER_WS_ADDR=ws://35.189.174.17:5000  # dev-shard-3-tracker-ip
  elif [ "$2" = 4 ]; then
    export TRACKER_WS_ADDR=ws://35.221.164.158:5000  # dev-shard-4-tracker-ip
  elif [ "$2" = 5 ]; then
    export TRACKER_WS_ADDR=ws://35.234.46.65:5000  # dev-shard-5-tracker-ip
  elif [ "$2" = 6 ]; then
    export TRACKER_WS_ADDR=ws://35.221.210.171:5000  # dev-shard-6-tracker-ip
  elif [ "$2" = 7 ]; then
    export TRACKER_WS_ADDR=ws://34.80.222.121:5000  # dev-shard-7-tracker-ip
  elif [ "$2" = 8 ]; then
    export TRACKER_WS_ADDR=ws://35.221.200.95:5000  # dev-shard-8-tracker-ip
  elif [ "$2" = 9 ]; then
    export TRACKER_WS_ADDR=ws://34.80.216.199:5000  # dev-shard-9-tracker-ip
  elif [ "$2" = 10 ]; then
    export TRACKER_WS_ADDR=ws://34.80.161.85:5000  # dev-shard-10-tracker-ip
  elif [ "$2" = 11 ]; then
    export TRACKER_WS_ADDR=ws://35.194.239.169:5000  # dev-shard-11-tracker-ip
  elif [ "$2" = 12 ]; then
    export TRACKER_WS_ADDR=ws://35.185.156.22:5000  # dev-shard-12-tracker-ip
  elif [ "$2" = 13 ]; then
    export TRACKER_WS_ADDR=ws://35.229.247.143:5000  # dev-shard-13-tracker-ip
  elif [ "$2" = 14 ]; then
    export TRACKER_WS_ADDR=ws://35.229.226.47:5000  # dev-shard-14-tracker-ip
  elif [ "$2" = 15 ]; then
    export TRACKER_WS_ADDR=ws://35.234.61.23:5000  # dev-shard-15-tracker-ip
  elif [ "$2" = 16 ]; then
    export TRACKER_WS_ADDR=ws://34.80.66.41:5000  # dev-shard-16-tracker-ip
  elif [ "$2" = 17 ]; then
    export TRACKER_WS_ADDR=ws://35.229.143.18:5000  # dev-shard-17-tracker-ip
  elif [ "$2" = 18 ]; then
    export TRACKER_WS_ADDR=ws://35.234.58.137:5000  # dev-shard-18-tracker-ip
  elif [ "$2" = 19 ]; then
    export TRACKER_WS_ADDR=ws://34.80.249.104:5000  # dev-shard-19-tracker-ip
  elif [ "$2" = 20 ]; then
    export TRACKER_WS_ADDR=ws://35.201.248.92:5000  # dev-shard-20-tracker-ip
  else
    echo "Invalid shard ID argument: $2"
    exit
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
echo "GENESIS_CONFIGS_DIR=$GENESIS_CONFIGS_DIR"

export ACCOUNT_INDEX="$3"
echo "ACCOUNT_INDEX=$ACCOUNT_INDEX"

export DEBUG=false
export CONSOLE_LOG=false 
export ENABLE_DEV_SET_CLIENT_API=false 
export ENABLE_TX_SIG_VERIF_WORKAROUND=false
export ENABLE_GAS_FEE_WORKAROUND=true
export LIGHTWEIGHT=false
export STAKE=100000
export BLOCKCHAIN_DATA_DIR="/home/ain_blockchain_data"

echo 'Starting up Node server..'
nohup node --async-stack-traces client/index.js >/dev/null 2>error_logs.txt &
