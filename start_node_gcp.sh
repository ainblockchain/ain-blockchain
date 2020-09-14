#!/bin/sh

if [ "$#" -lt 2 ]; then
    echo "Usage: sh start_node.sh spring 0 0"
    exit
fi

if [ "$1" = 'spring' ]; then
    export TRACKER_WS_ADDR=ws://35.221.137.80:5000  # spring-tracker-ip
elif [ "$1" = 'summer' ]; then
    export TRACKER_WS_ADDR=ws://35.194.172.106:5000  # summer-tracker-ip
elif [ "$1" = 'staging' ]; then
    export TRACKER_WS_ADDR=ws://35.221.150.73:5000 # staging-tracker-ip
elif [ "$1" = 'dev' ]; then
  if [ "$2" = 0 ]; then
    export TRACKER_WS_ADDR=ws://34.80.184.73:5000  # dev-tracker-ip
  elif [ "$2" = 1 ]; then
    export TRACKER_WS_ADDR=ws://35.187.153.22:5000  # dev-shard-1-tracker-ip
  elif [ "$2" = 2 ]; then
    export TRACKER_WS_ADDR=ws://34.80.203.104:5000  # dev-shard-2-tracker-ip
  else
    echo "Invalid shard ID argument: $2"
    exit
  fi
else
    echo "Invalid season argument: $1"
    exit
fi
echo "TRACKER_WS_ADDR=$TRACKER_WS_ADDR"

if [ "$3" -lt 0 ] || [ "$3" -gt 4 ]; then
    echo "Invalid account_index argument: $2"
    exit
fi

if [ "$2" = 0 ]; then
  export NUM_VALIDATORS=5
else
  export NUM_VALIDATORS=3
  export GENESIS_CONFIGS_DIR="blockchain/shard_$2"
fi

export ACCOUNT_INDEX="$3"
echo "ACCOUNT_INDEX=$ACCOUNT_INDEX"

export HOSTING_ENV=gcp
export DEBUG=false

nohup node client/index.js >/dev/null 2>&1 &
