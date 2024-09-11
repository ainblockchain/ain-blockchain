#!/bin/bash

if [[ $# -lt 1 ]] || [[ $# -gt 1 ]]; then
    printf "Usage: bash wait_until_node_sync.sh <Blockchain Node Url>\n"
    printf "Example: bash wait_until_node_sync.sh http://123.456.789.1:8079\n"
    printf "\n"
    return 1
fi

printf "\n[[[[[ wait_until_node_sync.sh ]]]]]\n\n"

# Parse options.
NODE_URL="$1"
printf "NODE_URL=$NODE_URL\n"

printf "\n#### Wait until the new node server catches up ####\n\n"

SECONDS=0
loopCount=0

generate_post_data()
{
  cat <<EOF
  {"method":"$1","params":{"protoVer":"0.8.0"},"jsonrpc":"2.0","id":"1"}
EOF
}

while :
do
    healthCheck=$(curl -m 20 -X GET -H "Content-Type: application/json" "${NODE_URL}/health_check")
    printf "\nhealthCheck = ${healthCheck}\n"
    if [[ "$healthCheck" = "true" ]]; then
        printf "\nBlockchain Node server is synced & running!\n"
        lastBlockNumber=$(curl -m 20 -X GET -H "Content-Type: application/json" "${NODE_URL}/last_block_number" | jq -r '.result')
        printf "\nlastBlockNumber = ${lastBlockNumber}\n"
        printf "\nTime it took to sync in seconds: $SECONDS\n"
        break
    fi
    ((loopCount++))
    printf "\nLoop count: ${loopCount}\n"
    sleep 20
done
