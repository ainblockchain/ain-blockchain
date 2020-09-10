#!/bin/sh

if [ "$#" -lt 2 ]; then
    echo "Usage: sh start_node.sh spring 0"
    exit
fi

if [ "$1" = 'spring' ]; then
    export TRACKER_WS_ADDR=ws://35.221.137.80:5000  # spring-tracker-ip
elif [ "$1" = 'summer' ]; then
    export TRACKER_WS_ADDR=ws://35.194.172.106:5000  # summer-tracker-ip
elif [ "$1" = 'dev' ]; then
    export TRACKER_WS_ADDR=ws://34.80.184.73:5000  # dev-tracker-ip
elif [ "$1" = 'staging' ]; then
    export TRACKER_WS_ADDR=ws://35.221.150.73:5000 # staging-tracker-ip
else
    echo "Invalid season argument: $1"
    exit
fi
echo "TRACKER_WS_ADDR=$TRACKER_WS_ADDR"

if [ "$2" -lt 0 ] || [ "$2" -gt 4 ]; then
    echo "Invalid account_index argument: $2"
    exit
fi

export NUM_VALIDATORS=5
export ACCOUNT_INDEX="$2"
echo "ACCOUNT_INDEX=$ACCOUNT_INDEX"

export HOSTING_ENV=gcp
export DEBUG=false

nohup node client/index.js >/dev/null 2>&1 &
