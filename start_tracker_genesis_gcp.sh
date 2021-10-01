#!/bin/bash

if [[ "$#" -gt 1 ]]; then
    echo "Usage: bash start_tracker_genesis_gcp.sh [--keep-code]"
    exit
fi

KEEP_CODE_OPTION=""
if [[ "$#" = 1 ]]; then
    if [[ "$1" = '--keep-code' ]]; then
        KEEP_CODE_OPTION=true
    else
        echo "Invalid option: $1\n"
        exit
    fi
fi


echo 'Killing jobs..'
killall node


if [[ "$KEEP_CODE_OPTION" = "" ]]; then
    echo 'Setting up working directory..'
    cd
    sudo rm -rf /home/ain_blockchain_data
    sudo mkdir /home/ain_blockchain_data
    sudo chmod -R 777 /home/ain_blockchain_data
    sudo rm -rf ../ain-blockchain*
    sudo mkdir ../ain-blockchain
    sudo chmod -R 777 ../ain-blockchain
    mv * ../ain-blockchain
    cd ../ain-blockchain

    echo 'Installing node modules..'
    npm install
else
    echo 'Using old directory..'
    OLD_DIR_PATH=$(find ../ain-blockchain* -maxdepth 0 -type d)
    printf "OLD_DIR_PATH=$OLD_DIR_PATH\n"
    sudo chmod -R 777 $OLD_DIR_PATH
    cd $OLD_DIR_PATH
fi


export CONSOLE_LOG=false 

echo 'Starting up Blockchain Tracker server..'
nohup node --async-stack-traces tracker-server/index.js >/dev/null 2>error_logs.txt &
echo "Blockchain Tracker server is now up!"
