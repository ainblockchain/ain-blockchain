#!/bin/bash

if [[ $# -gt 1 ]]; then
    printf "Usage: bash start_tracker_genesis_gcp.sh [--keep-code|--no-keep-code]\n"
    printf "Example: bash start_tracker_genesis_gcp.sh --keep-code\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ start_tracker_genesis_gcp.sh ]]]]]\n\n"

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

printf '\n'
printf 'Killing jobs..\n'
killall node


if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
    printf '\n'
    printf 'Creating new working directory..\n'
    sudo rm -rf /home/ain-blockchain*
    CODE_CMD="cd ~; sudo mv ain-blockchain /home; sudo chmod -R 777 /home/ain-blockchain; sudo chown -R root:root /home/ain-blockchain; cd /home/ain-blockchain"
    printf "\nCODE_CMD=$CODE_CMD\n"
    eval $CODE_CMD

    printf '\n'
    printf 'Installing node modules..\n'
    INSTALL_CMD="sudo yarn install --ignore-engines"
    printf "\nINSTALL_CMD=$INSTALL_CMD\n"
    eval $INSTALL_CMD
else
    printf '\n'
    printf 'Using old directory..\n'
    OLD_DIR_PATH=$(find /home/ain-blockchain* -maxdepth 0 -type d)
    printf "OLD_DIR_PATH=$OLD_DIR_PATH\n"
    CODE_CMD="sudo chmod -R 777 $OLD_DIR_PATH; sudo chown -R root:root $OLD_DIR_PATH"
    printf "\nCODE_CMD=$CODE_CMD\n"
    eval $CODE_CMD
fi


printf "\nStarting up Blockchain Tracker server..\n\n"
START_CMD="nohup node --async-stack-traces tracker-server/index.js >/dev/null 2>error_logs.txt &"
printf "\nSTART_CMD=$START_CMD\n"
printf "START_CMD=$START_CMD\n" >> start_commands.txt
eval $START_CMD

printf "\nBlockchain Tracker server is now up!\n\n"
