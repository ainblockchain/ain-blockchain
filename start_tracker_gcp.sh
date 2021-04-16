#!/bin/sh

export CONSOLE_LOG=false 

echo 'Starting up Tracker server..'
nohup node --async-stack-traces tracker-server/index.js >/dev/null 2>error_logs.txt &
echo "Tracker server is now up!"
