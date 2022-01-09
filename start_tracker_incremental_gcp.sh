#!/bin/bash

if [[ "$#" -gt 1 ]]; then
    printf "Usage: bash start_tracker_incremental_gcp.sh [--keep-code|--no-keep-code]\n"
    printf "Example: bash start_tracker_incremental_gcp.sh --keep-code\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ start_tracker_incremental_gcp.sh ]]]]]\n\n"

# 1. Configure env vars
printf "\n#### [Step 1] Configure env vars ####\n\n"

KEEP_CODE_OPTION="--keep-code"

if [[ $# = 1 ]]; then
    if [[ $1 = '--keep-code' ]]; then
        KEEP_CODE_OPTION=$1
    elif [[ $1 = '--no-keep-code' ]]; then
        KEEP_CODE_OPTION=$1
    else
        printf "Invalid option: $1\n"
        exit
    fi
fi

printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"

# 2. Get currently used directory & new directory
printf "\n#### [Step 2] Get currently used directory & new directory ####\n\n"

OLD_DIR_PATH=$(find /home/ain-blockchain* -maxdepth 0 -type d)
printf "OLD_DIR_PATH=$OLD_DIR_PATH\n"

date=$(date '+%Y-%m-%dT%H:%M')
printf "date=$date\n"
NEW_DIR_NAME="ain-blockchain-$date"
printf "NEW_DIR_NAME=$NEW_DIR_NAME\n"
NEW_DIR_PATH="/home/$NEW_DIR_NAME"
printf "NEW_DIR_PATH=$NEW_DIR_PATH\n"

# 3. Set up working directory & install modules
printf "\n#### [Step 3] Set up working directory & install modules ####\n\n"
if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
    printf '\n'
    printf 'Creating new working directory..\n'
    CODE_CMD="cd ~; sudo mv ain-blockchain $NEW_DIR_NAME; sudo mv $NEW_DIR_NAME /home; sudo chmod -R 777 $NEW_DIR_PATH; sudo chown -R root:root $NEW_DIR_PATH"
    printf "\nCODE_CMD=$CODE_CMD\n"
    eval $CODE_CMD

    printf '\n'
    printf 'Installing node modules..\n'
    cd $NEW_DIR_PATH
    INSTALL_CMD="sudo yarn install --ignore-engines"
    printf "\nINSTALL_CMD=$INSTALL_CMD\n"
    eval $INSTALL_CMD
else
    printf '\n'
    printf 'Using old working directory..\n'
    CODE_CMD="sudo chmod -R 777 $OLD_DIR_PATH; sudo chown -R root:root $OLD_DIR_PATH"
    printf "\nCODE_CMD=$CODE_CMD\n"
    eval $CODE_CMD
fi

# 4. Kill old tracker server 
printf "\n#### [Step 4] Kill old tracker server ####\n\n"

KILL_CMD="sudo killall node"
printf "KILL_CMD=$KILL_CMD\n\n"
eval $KILL_CMD
sleep 10

# 5. Remove old working directory
printf "\n#### [Step 5] Remove old working directory ####\n\n"
if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
    printf '\n'
    printf 'Removing old working directory..\n'
    RM_CMD="sudo rm -rf $OLD_DIR_PATH"
    printf "\nRM_CMD=$RM_CMD\n"
    eval $RM_CMD
else
    printf '\n'
    printf 'Keeping old working directory..\n'
fi

# 6. Start new tracker server
printf "\n#### [Step 6] Start new tracker server ####\n\n"

START_CMD="nohup node --async-stack-traces tracker-server/index.js >/dev/null 2>error_logs.txt &"
printf "\nSTART_CMD=$START_CMD\n"
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
    if [[ $numNodesAlive -gt 0 ]]; then
        printf "\nBlockchain Tracker server is running!\n"
        printf "\nTime it took to sync in seconds: $SECONDS\n"
        break
    fi
    ((loopCount++))
    printf "\nLoop count: ${loopCount}\n"
    sleep 20
done

printf "\n* << Tracker server successfully deployed! ************************************\n\n"
