#!/bin/bash

if [[ "$#" -lt 1 ]] || [[ "$#" -gt 1 ]]; then
    printf "Usage: bash start_tracker_incremental_gcp.sh <Number of Nodes>\n"
    printf "Example: bash start_tracker_incremental_gcp.sh 5\n"
    exit
fi

# 1. Configure env vars
printf "\n#### [Step 1] Configure env vars ####\n\n"

NUM_NODES="$1"

date=$(date '+%Y-%m-%dT%H:%M')
printf "date=$date\n"
NEW_DIR_PATH="../ain-blockchain-$date"
printf "NEW_DIR_PATH=$NEW_DIR_PATH\n"

# 2. Get currently used directory
printf "\n#### [Step 2] Get currently used directory ####\n\n"

OLD_DIR_PATH=$(find ../ain-blockchain* -maxdepth 0 -type d)
printf "OLD_DIR_PATH=$OLD_DIR_PATH\n"

# 3. Create a new directory
printf "\n#### [Step 3] Create a new directory ####\n\n"

MKDIR_CMD="sudo mkdir $NEW_DIR_PATH"
printf "MKDIR_CMD=$MKDIR_CMD\n"
eval $MKDIR_CMD

sudo chmod -R 777 $NEW_DIR_PATH
mv * $NEW_DIR_PATH

# 4. Install dependencies
printf "\n#### [Step 4] Install dependencies ####\n\n"

cd $NEW_DIR_PATH
npm install

# 5. Kill old tracker server 
printf "\n#### [Step 5] Kill old tracker server ####\n\n"

KILL_CMD="sudo killall node"
printf "KILL_CMD='$KILL_CMD'\n\n"
eval $KILL_CMD
sleep 10

# 6. Start new tracker server
printf "\n#### [Step 6] Start new tracker server ####\n\n"

export CONSOLE_LOG=false 

START_CMD="nohup node --async-stack-traces tracker-server/index.js >/dev/null 2>error_logs.txt &"
printf "START_CMD='$START_CMD'\n"
eval $START_CMD

# 7. Wait until the new tracker server catches up
printf "\n#### [Step 7] Wait until the new tracker server catches up ####\n\n"

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

# 8. Remove old directory keeping the chain data
printf "\n#### [Step 8] Remove old directory keeping the chain data ####\n\n"

RM_CMD="sudo rm -rf $OLD_DIR_PATH"
printf "RM_CMD='$RM_CMD'\n"
eval $RM_CMD

printf "\n* << Tracker server successfully deployed! ************************************\n\n"
