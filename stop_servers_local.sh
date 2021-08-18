#!/bin/bash

killall -9 node # SIGKILL
rm -rf ~/ain_blockchain_data/
BASEDIR=$(dirname "$0")
rm -rf $BASEDIR/logs/
