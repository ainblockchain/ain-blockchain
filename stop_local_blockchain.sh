#!/bin/bash
#
# A script to stop all local blockchains.
#

printf "\n[[[[[ stop_local_blockchain.sh ]]]]]\n\n"

killall -9 yarn # SIGKILL
killall -9 mocha # SIGKILL
killall -9 node # SIGKILL
rm -rf ./ain_blockchain_data/
