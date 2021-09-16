#!/bin/bash

if [[ "$#" -lt 1 ]] || [[ "$#" -gt 1 ]]; then
    printf "Usage: bash restart_tracker_gcp.sh <Number of Nodes>\n"
    printf "Example: bash restart_tracker_gcp.sh 5\n"
    exit
fi

# 1. Configure env vars
printf "\n#### [Step 1] Configure env vars ####\n\n"

NUM_NODES="$1"

# 2. Kill the existing tracker server 
printf "\n#### [Step 2] Kill the existing tracker server ####\n\n"

KILL_CMD="sudo killall node"
printf "KILL_CMD='$KILL_CMD'\n\n"
eval $KILL_CMD
sleep 10

# 3. Restart the tracker server
printf "\n#### [Step 3] Restart the tracker server ####\n\n"

export CONSOLE_LOG=false 

START_CMD="nohup node --async-stack-traces tracker-server/index.js >/dev/null 2>error_logs.txt &"
printf "START_CMD='$START_CMD'\n"
eval $START_CMD

# 4. Wait until the tracker server catches up
printf "\n#### [Step 4] Wait until the tracker server catches up ####\n\n"

SECONDS=0
loopCount=0

while :
do
    numNodesAlive=$(curl -m 20 -X GET -H "Content-Type: application/json" "http://localhost:8080/network_status" | jq -r '.numNodesAlive')
    printf "\nnumNodesAlive = ${numNodesAlive}\n"
    if [[ "$numNodesAlive" = "$NUM_NODES" ]]; then
        printf "\nBlockchain Tracker server is running!\n"
        printf "\nTime it took to sync in seconds: $SECONDS\n"
        break
    fi
    ((loopCount++))
    printf "\nLoop count: ${loopCount}\n"
    sleep 20
done

printf "\n* << Tracker server successfully deployed! ************************************\n\n"
