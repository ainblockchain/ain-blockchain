#!/bin/bash

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
    healthCheck=$(curl -m 20 -X GET -H "Content-Type: application/json" "http://localhost:8080/health_check")
    printf "\nhealthCheck = ${healthCheck}\n"
    lastBlockNumber=$(curl -m 20 -X POST -H "Content-Type: application/json" --data "$(generate_post_data 'ain_getRecentBlockNumber')" "http://localhost:8080/json-rpc" | jq -r '.result.result')
    printf "\nlastBlockNumber = ${lastBlockNumber}\n"
    if [[ "$healthCheck" = "true" ]]; then
        printf "\nBlockchain Node server is synced & running!\n"
        printf "\nTime it took to sync in seconds: $SECONDS\n"
        break
    fi
    ((loopCount++))
    printf "\nLoop count: ${loopCount}\n"
    sleep 20
done
