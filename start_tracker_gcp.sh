#!/bin/sh

nohup node --async-stack-traces tracker-server/index.js >/dev/null 2>error_logs.txt &
echo "Tracker server is now up!"
