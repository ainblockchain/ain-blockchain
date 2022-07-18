#!/bin/bash

if [[ $# -gt 2 ]]; then
    printf "Usage: bash start_tracker_genesis_gcp.sh <GCP Username> [--keep-code|--no-keep-code]\n"
    printf "Example: bash start_tracker_genesis_gcp.sh gcp_user --keep-code\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ start_tracker_genesis_gcp.sh ]]]]]\n\n"

GCP_USER="$1"

KEEP_CODE_OPTION="--keep-code"
if [[ $# = 2 ]]; then
    if [[ $2 = '--keep-code' ]]; then
        KEEP_CODE_OPTION=$2
    elif [[ $2 = '--no-keep-code' ]]; then
        KEEP_CODE_OPTION=$2
    else
        printf "Invalid option: $2\n"
        exit
    fi
fi

printf "GCP_USER=$GCP_USER\n"
printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"

printf '\n'
printf 'Killing jobs..\n'
killall node


if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
    printf '\n'
    printf 'Creating new working directory..\n'
    sudo rm -rf /home/ain-blockchain*
    CODE_CMD="cd ~; sudo mv ain-blockchain /home; sudo chmod -R 777 /home/ain-blockchain; sudo chown -R $GCP_USER:$GCP_USER /home/ain-blockchain; cd /home/ain-blockchain"
    printf "\nCODE_CMD=$CODE_CMD\n"
    eval $CODE_CMD

    printf '\n'
    printf 'Installing node modules..\n'
    INSTALL_CMD="yarn install --ignore-engines"
    printf "\nINSTALL_CMD=$INSTALL_CMD\n"
    eval $INSTALL_CMD
else
    printf '\n'
    printf 'Using old directory..\n'
    OLD_DIR_PATH=$(find /home/ain-blockchain* -maxdepth 0 -type d)
    printf "OLD_DIR_PATH=$OLD_DIR_PATH\n"
    CODE_CMD="sudo chmod -R 777 $OLD_DIR_PATH; sudo chown -R $GCP_USER:$GCP_USER $OLD_DIR_PATH"
    printf "\nCODE_CMD=$CODE_CMD\n"
    eval $CODE_CMD
fi


printf "\nStarting up Blockchain Tracker server..\n\n"
START_CMD="nohup node --async-stack-traces tracker-server/index.js >/dev/null 2>error_logs.txt &"
printf "\nSTART_CMD=$START_CMD\n"
printf "START_CMD=$START_CMD\n" >> start_commands.txt
eval $START_CMD

printf "\nBlockchain Tracker server is now up!\n\n"
