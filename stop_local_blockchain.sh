#!/bin/bash
#
# A script to stop all local blockchains.
# Only kills blockchain processes started by start_local_blockchain.sh.
#

printf "\n[[[[[ stop_local_blockchain.sh ]]]]]\n\n"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.ain_pids"

if [ -f "$PID_FILE" ]; then
  while read -r pid; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      printf "Killing process %s\n" "$pid"
      kill -9 "$pid" 2>/dev/null
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
  printf "\nAll blockchain processes stopped.\n"
else
  printf "No PID file found. Falling back to port-based cleanup.\n"
  # Kill only processes on blockchain-specific ports (8080-8083, 5000-5003)
  for port in 8080 8081 8082 8083 5000 5001 5002 5003; do
    pid=$(lsof -ti:"$port" 2>/dev/null)
    if [ -n "$pid" ]; then
      printf "Killing process %s on port %s\n" "$pid" "$port"
      kill -9 "$pid" 2>/dev/null
    fi
  done
fi

rm -rf ./ain_blockchain_data/
