#!/bin/bash

if [[ "$#" -lt 1 ]] || [[ "$#" -gt 2 ]]; then
    printf "Usage: bash start_tracker_incremental_gcp.sh <Number of Nodes> [--keep-code]\n"
    printf "Example: bash start_tracker_incremental_gcp.sh 5 --keep-code\n"
    exit
fi

# 1. Configure env vars
printf "\n#### [Step 1] Configure env vars ####\n\n"

NUM_NODES="$1"
KEEP_CODE_OPTION=""

if [[ $# = 2 ]]; then
    if [[ $2 = '--keep-code' ]]; then
        KEEP_CODE_OPTION=$2
    else
        printf "Invalid option: $2\n"
        exit
    fi
fi

printf "NUM_NODES=$NUM_NODES\n"
printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"

# 2. Get currently used directory & new directory
printf "\n#### [Step 2] Get currently used directory & new directory ####\n\n"

OLD_DIR_PATH=$(find ../ain-blockchain* -maxdepth 0 -type d)
printf "OLD_DIR_PATH=$OLD_DIR_PATH\n"

date=$(date '+%Y-%m-%dT%H:%M')
printf "date=$date\n"
NEW_DIR_PATH="../ain-blockchain-$date"
printf "NEW_DIR_PATH=$NEW_DIR_PATH\n"

# 3. Set up working directory & install modules
printf "\n#### [Step 3] Set up working directory & install modules ####\n\n"
if [[ $KEEP_CODE_OPTION = "" ]]; then
    printf '\n'
    printf 'Creating new working directory..\n'
    MKDIR_CMD="sudo mkdir $NEW_DIR_PATH"
    printf "MKDIR_CMD=$MKDIR_CMD\n"
    eval $MKDIR_CMD

    sudo chmod -R 777 $NEW_DIR_PATH
    mv * $NEW_DIR_PATH

    printf '\n'
    printf 'Installing modules..\n'
    cd $NEW_DIR_PATH
    npm install
else
    printf '\n'
    printf 'Using old working directory..\n'
    sudo chmod -R 777 $OLD_DIR_PATH
fi

# 4. Kill old tracker server 
printf "\n#### [Step 4] Kill old tracker server ####\n\n"

KILL_CMD="sudo killall node"
printf "KILL_CMD=$KILL_CMD\n\n"
eval $KILL_CMD
sleep 10

# 5. Remove old working directory keeping the chain data
printf "\n#### [Step 5] Remove old working directory keeping the chain data ####\n\n"
if [[ $KEEP_CODE_OPTION = "" ]]; then
    printf '\n'
    printf 'Removing old working directory..\n'
    RM_CMD="sudo rm -rf $OLD_DIR_PATH"
    printf "RM_CMD=$RM_CMD\n"
    eval $RM_CMD
else
    printf '\n'
    printf 'Keeping old working directory..\n'
fi

# 6. Start new tracker server
printf "\n#### [Step 6] Start new tracker server ####\n\n"

export CONSOLE_LOG=false 

START_CMD="nohup node --async-stack-traces tracker-server/index.js >/dev/null 2>error_logs.txt &"
printf "START_CMD=$START_CMD\n"
printf "START_CMD=$START_CMD\n" >> start_commands.txt
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

printf "\n* << Tracker server successfully deployed! ************************************\n\n"
