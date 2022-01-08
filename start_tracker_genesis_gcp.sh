#!/bin/bash

if [[ $# -gt 1 ]]; then
    printf "Usage: bash start_tracker_genesis_gcp.sh [--keep-code|--no-keep-code]\n"
    printf "Example: bash start_tracker_genesis_gcp.sh --keep-code\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ start_tracker_genesis_gcp.sh ]]]]]\n\n"

KEEP_CODE_OPTION=""

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

printf '\n'
printf 'Killing jobs..\n'
killall node


if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
    printf '\n'
    printf 'Creating new working directory..\n'
    cd
    sudo rm -rf /home/ain_blockchain_data
    sudo mkdir /home/ain_blockchain_data
    sudo chmod -R 777 /home/ain_blockchain_data
    sudo rm -rf ../ain-blockchain*
    sudo mkdir ../ain-blockchain
    sudo chmod -R 777 ../ain-blockchain
    mv * ../ain-blockchain
    cd ../ain-blockchain

    printf '\n'
    printf 'Installing node modules..\n'
    sudo yarn install --ignore-engines
else
    printf '\n'
    printf 'Using old directory..\n'
    OLD_DIR_PATH=$(find ../ain-blockchain* -maxdepth 0 -type d)
    printf "OLD_DIR_PATH=$OLD_DIR_PATH\n"
    sudo chmod -R 777 $OLD_DIR_PATH
fi


printf "\nStarting up Blockchain Tracker server..\n\n"
START_CMD="nohup node --async-stack-traces tracker-server/index.js >/dev/null 2>error_logs.txt &"
printf "START_CMD=$START_CMD\n"
printf "START_CMD=$START_CMD\n" >> start_commands.txt
eval $START_CMD

printf "\nBlockchain Tracker server is now up!\n\n"
