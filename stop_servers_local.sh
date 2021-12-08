#!/bin/bash

printf "\n[[[[[ stop_servers_local.sh ]]]]]\n\n"

killall -9 node # SIGKILL
rm -rf ./ain_blockchain_data/
