#!/bin/sh

if [ "$#" -lt 2 ]; then
    echo "Usage: sh start_node.sh spring 0"
    exit
fi

if [ "$1" = 'spring' ]; then
    export TRACKER_IP=ws://35.221.137.80:3001  # spring-tracker-ip
elif [ "$1" = 'summer' ]; then
    export TRACKER_IP=ws://35.194.172.106:3001  # summer-tracker-ip
else
    echo "Invalid season argument: $1"
    exit
fi
echo "TRACKER_IP=$TRACKER_IP"

if [ "$2" -lt 0 ] || [ "$2" -gt 4 ]; then
    echo "Invalid account_index argument: $2"
    exit
fi

export ACCOUNT_INDEX="$2"
echo "ACCOUNT_INDEX=$ACCOUNT_INDEX"

export STAKE=250
export HOSTING_ENV=gcp
export DEBUG=false 

nohup node client/index.js >/dev/null 2>&1 &
