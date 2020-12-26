#!/bin/sh

export HOSTING_ENV=gcp

nohup node tracker-server/index.js >/dev/null 2>error_logs.txt &
echo "Tracker server is now up!"
