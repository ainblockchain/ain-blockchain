#!/bin/sh

export HOSTING_ENV=gcp

nohup node tracker-server/index.js >/dev/null 2>&1 &
