#!/bin/sh

if [ "$#" -lt 2 ]; then
    echo "Usage: sh start_node_incremental_gcp.sh [dev|staging|spring|summer] <Shard Index> <Node Index>"
    echo "Example: sh start_node_incremental_gcp.sh spring 0 0"
    exit
fi

# 1. Configure env vars (GENESIS_CONFIGS_DIR, TRACKER_WS_ADDR, ACCOUNT_INDEX, ...)
export GENESIS_CONFIGS_DIR=genesis-configs/testnet
if [ "$1" = 'spring' ]; then
    export TRACKER_WS_ADDR=ws://35.221.137.80:5000
elif [ "$1" = 'summer' ]; then
    export TRACKER_WS_ADDR=ws://35.194.172.106:5000
elif [ "$1" = 'staging' ]; then
    export TRACKER_WS_ADDR=ws://35.221.150.73:5000
elif [ "$1" = 'dev' ]; then
    if [ "$2" = 0 ]; then
        export TRACKER_WS_ADDR=ws://34.80.184.73:5000  # dev-tracker-ip
    elif [ "$2" = 1 ]; then
        export TRACKER_WS_ADDR=ws://35.187.153.22:5000  # dev-shard-1-tracker-ip
    elif [ "$2" = 2 ]; then
        export TRACKER_WS_ADDR=ws://34.80.203.104:5000  # dev-shard-2-tracker-ip
    elif [ "$2" = 3 ]; then
        export TRACKER_WS_ADDR=ws://35.189.174.17:5000  # dev-shard-3-tracker-ip
    elif [ "$2" = 4 ]; then
        export TRACKER_WS_ADDR=ws://35.221.164.158:5000  # dev-shard-4-tracker-ip
    elif [ "$2" = 5 ]; then
        export TRACKER_WS_ADDR=ws://35.234.46.65:5000  # dev-shard-5-tracker-ip
    elif [ "$2" = 6 ]; then
        export TRACKER_WS_ADDR=ws://35.221.210.171:5000  # dev-shard-6-tracker-ip
    elif [ "$2" = 7 ]; then
        export TRACKER_WS_ADDR=ws://34.80.222.121:5000  # dev-shard-7-tracker-ip
    elif [ "$2" = 8 ]; then
        export TRACKER_WS_ADDR=ws://35.221.200.95:5000  # dev-shard-8-tracker-ip
    elif [ "$2" = 9 ]; then
        export TRACKER_WS_ADDR=ws://34.80.216.199:5000  # dev-shard-9-tracker-ip
    elif [ "$2" = 10 ]; then
        export TRACKER_WS_ADDR=ws://34.80.161.85:5000  # dev-shard-10-tracker-ip
    elif [ "$2" = 11 ]; then
        export TRACKER_WS_ADDR=ws://35.194.239.169:5000  # dev-shard-11-tracker-ip
    elif [ "$2" = 12 ]; then
        export TRACKER_WS_ADDR=ws://35.185.156.22:5000  # dev-shard-12-tracker-ip
    elif [ "$2" = 13 ]; then
        export TRACKER_WS_ADDR=ws://35.229.247.143:5000  # dev-shard-13-tracker-ip
    elif [ "$2" = 14 ]; then
        export TRACKER_WS_ADDR=ws://35.229.226.47:5000  # dev-shard-14-tracker-ip
    elif [ "$2" = 15 ]; then
        export TRACKER_WS_ADDR=ws://35.234.61.23:5000  # dev-shard-15-tracker-ip
    elif [ "$2" = 16 ]; then
        export TRACKER_WS_ADDR=ws://34.80.66.41:5000  # dev-shard-16-tracker-ip
    elif [ "$2" = 17 ]; then
        export TRACKER_WS_ADDR=ws://35.229.143.18:5000  # dev-shard-17-tracker-ip
    elif [ "$2" = 18 ]; then
        export TRACKER_WS_ADDR=ws://35.234.58.137:5000  # dev-shard-18-tracker-ip
    elif [ "$2" = 19 ]; then
        export TRACKER_WS_ADDR=ws://34.80.249.104:5000  # dev-shard-19-tracker-ip
    elif [ "$2" = 20 ]; then
        export TRACKER_WS_ADDR=ws://35.201.248.92:5000  # dev-shard-20-tracker-ip
    else
        echo "Invalid shard ID argument: $2"
        exit
    fi
    if [ "$2" -gt 0 ]; then
        # Create a genesis_params.json
        export GENESIS_CONFIGS_DIR="genesis-configs/shard_$2"
        mkdir -p "./$GENESIS_CONFIGS_DIR"
        node > "./$GENESIS_CONFIGS_DIR/genesis_params.json" <<EOF
        const data = require('./genesis-configs/testnet/genesis_params.json');
        data.blockchain.TRACKER_WS_ADDR = '$TRACKER_WS_ADDR';
        data.consensus.MIN_NUM_VALIDATORS = 3;
        console.log(JSON.stringify(data, null, 2));
EOF
    fi
else
    echo "Invalid season argument: $1"
    exit
fi

if [ "$3" -lt 0 ] || [ "$3" -gt 4 ]; then
    echo "Invalid account_index argument: $2"
    exit
fi

echo "TRACKER_WS_ADDR=$TRACKER_WS_ADDR"
echo "GENESIS_CONFIGS_DIR=$GENESIS_CONFIGS_DIR"

export ACCOUNT_INDEX="$3"
echo "ACCOUNT_INDEX=$ACCOUNT_INDEX"

export DEBUG=false
export CONSOLE_LOG=false
export ENABLE_DEV_CLIENT_API=false
export ENABLE_TX_SIG_VERIF_WORKAROUND=false
export ENABLE_GAS_FEE_WORKAROUND=true
export LIGHTWEIGHT=false
export STAKE=100000

date=$(date '+%Y-%m-%dT%H:%M')
echo "date=$date"
NEW_DIR_PATH="../ain-blockchain-$date"
echo "NEW_DIR_PATH=$NEW_DIR_PATH"

# 2. Get currently used directory
OLD_DIR_PATH=$(find ../ain-blockchain* -maxdepth 0 -type d)
echo "OLD_DIR_PATH=$OLD_DIR_PATH"

# 3. Kill old node & remove old directory
sudo killall node
sudo rm -rf ../ain-blockchain*

# 4. Create a new directory
sudo mkdir $NEW_DIR_PATH
sudo chmod 777 $NEW_DIR_PATH
mv * $NEW_DIR_PATH

# 5. Start a new node process
cd $NEW_DIR_PATH
npm install
printf "Starting up Node server.."
nohup node --async-stack-traces client/index.js >/dev/null 2>error_logs.txt &

# 6. Wait until the new node catches up
loopCount=0

generate_post_data()
{
  cat <<EOF
  {"method":"net_consensusState","params":{"protoVer":"0.7.1"},"jsonrpc":"2.0","id":"1"}
EOF
}

while :
do
    consensusState=$(curl -X POST -H "Content-Type: application/json" --data "$(generate_post_data)" "http://localhost:8080/json-rpc" | jq -r '.result.result.state')
    printf "\nconsensusState = ${consensusState}"
    if [ "$consensusState" == "RUNNING" ]; then
        printf "\nNode is synced & running!\n\n"
        break
    fi
    ((loopCount++))
    printf "\nLoop count: ${loopCount}\n"
    sleep 30
done
