#!/bin/sh

if [[ "$#" -lt 4 ]] || [[ "$#" -gt 4 ]]; then
    printf "Usage: sh start_node_incremental_gcp.sh [dev|staging|spring|summer] <Shard Index> <Node Index> [fast|full]\n"
    printf "Example: sh start_node_incremental_gcp.sh spring 0 0 fast\n"
    exit
fi

# 1. Configure env vars (GENESIS_CONFIGS_DIR, TRACKER_WS_ADDR, ACCOUNT_INDEX, ...)
printf "\n#### [Step 1] Configure env vars ####\n\n"

export GENESIS_CONFIGS_DIR=genesis-configs/testnet
if [[ "$1" = 'spring' ]]; then
    export TRACKER_WS_ADDR=ws://35.221.137.80:5000
elif [[ "$1" = 'summer' ]]; then
    export TRACKER_WS_ADDR=ws://35.194.172.106:5000
elif [[ "$1" = 'staging' ]]; then
    export TRACKER_WS_ADDR=ws://35.221.150.73:5000
elif [[ "$1" = 'dev' ]]; then
    if [[ "$2" = 0 ]]; then
        export TRACKER_WS_ADDR=ws://34.80.184.73:5000  # dev-tracker-ip
    elif [[ "$2" = 1 ]]; then
        export TRACKER_WS_ADDR=ws://35.187.153.22:5000  # dev-shard-1-tracker-ip
    elif [[ "$2" = 2 ]]; then
        export TRACKER_WS_ADDR=ws://34.80.203.104:5000  # dev-shard-2-tracker-ip
    elif [[ "$2" = 3 ]]; then
        export TRACKER_WS_ADDR=ws://35.189.174.17:5000  # dev-shard-3-tracker-ip
    elif [[ "$2" = 4 ]]; then
        export TRACKER_WS_ADDR=ws://35.221.164.158:5000  # dev-shard-4-tracker-ip
    elif [[ "$2" = 5 ]]; then
        export TRACKER_WS_ADDR=ws://35.234.46.65:5000  # dev-shard-5-tracker-ip
    elif [[ "$2" = 6 ]]; then
        export TRACKER_WS_ADDR=ws://35.221.210.171:5000  # dev-shard-6-tracker-ip
    elif [[ "$2" = 7 ]]; then
        export TRACKER_WS_ADDR=ws://34.80.222.121:5000  # dev-shard-7-tracker-ip
    elif [[ "$2" = 8 ]]; then
        export TRACKER_WS_ADDR=ws://35.221.200.95:5000  # dev-shard-8-tracker-ip
    elif [[ "$2" = 9 ]]; then
        export TRACKER_WS_ADDR=ws://34.80.216.199:5000  # dev-shard-9-tracker-ip
    elif [[ "$2" = 10 ]]; then
        export TRACKER_WS_ADDR=ws://34.80.161.85:5000  # dev-shard-10-tracker-ip
    elif [[ "$2" = 11 ]]; then
        export TRACKER_WS_ADDR=ws://35.194.239.169:5000  # dev-shard-11-tracker-ip
    elif [[ "$2" = 12 ]]; then
        export TRACKER_WS_ADDR=ws://35.185.156.22:5000  # dev-shard-12-tracker-ip
    elif [[ "$2" = 13 ]]; then
        export TRACKER_WS_ADDR=ws://35.229.247.143:5000  # dev-shard-13-tracker-ip
    elif [[ "$2" = 14 ]]; then
        export TRACKER_WS_ADDR=ws://35.229.226.47:5000  # dev-shard-14-tracker-ip
    elif [[ "$2" = 15 ]]; then
        export TRACKER_WS_ADDR=ws://35.234.61.23:5000  # dev-shard-15-tracker-ip
    elif [[ "$2" = 16 ]]; then
        export TRACKER_WS_ADDR=ws://34.80.66.41:5000  # dev-shard-16-tracker-ip
    elif [[ "$2" = 17 ]]; then
        export TRACKER_WS_ADDR=ws://35.229.143.18:5000  # dev-shard-17-tracker-ip
    elif [[ "$2" = 18 ]]; then
        export TRACKER_WS_ADDR=ws://35.234.58.137:5000  # dev-shard-18-tracker-ip
    elif [[ "$2" = 19 ]]; then
        export TRACKER_WS_ADDR=ws://34.80.249.104:5000  # dev-shard-19-tracker-ip
    elif [[ "$2" = 20 ]]; then
        export TRACKER_WS_ADDR=ws://35.201.248.92:5000  # dev-shard-20-tracker-ip
    else
        printf "Invalid <Shard Index> argument: $2\n"
        exit
    fi
    if [[ "$2" -gt 0 ]]; then
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
    printf "Invalid <Project/Season> argument: $1\n"
    exit
fi

printf "TRACKER_WS_ADDR=$TRACKER_WS_ADDR\n"
printf "GENESIS_CONFIGS_DIR=$GENESIS_CONFIGS_DIR\n"

if [[ "$3" -lt 0 ]] || [[ "$3" -gt 4 ]]; then
    printf "Invalid <Node Index> argument: $3\n"
    exit
fi

export ACCOUNT_INDEX="$3"
printf "ACCOUNT_INDEX=$ACCOUNT_INDEX\n"

if [[ "$4" != 'fast' ]] && [[ "$4" != 'full' ]]; then
    printf "Invalid <Sync Mode> argument: $2\n"
    exit
fi

export SYNC_MODE="$4"
printf "SYNC_MODE=$SYNC_MODE\n"

export DEBUG=false
export CONSOLE_LOG=false
export ENABLE_DEV_SET_CLIENT_API=false
export ENABLE_TX_SIG_VERIF_WORKAROUND=false
export ENABLE_GAS_FEE_WORKAROUND=true
export LIGHTWEIGHT=false
export STAKE=100000
export BLOCKCHAIN_DATA_DIR="/home/ain_blockchain_data"

date=$(date '+%Y-%m-%dT%H:%M')
printf "date=$date\n"
NEW_DIR_PATH="../ain-blockchain-$date"
printf "NEW_DIR_PATH=$NEW_DIR_PATH\n"

# 2. Get currently used directory
printf "\n#### [Step 2] Get currently used directory ####\n\n"

OLD_DIR_PATH=$(find ../ain-blockchain* -maxdepth 0 -type d)
printf "OLD_DIR_PATH=$OLD_DIR_PATH\n"

# 3. Create a new directory
printf "\n#### [Step 3] Create a new directory ####\n\n"

MKDIR_CMD="sudo mkdir $NEW_DIR_PATH"
printf "MKDIR_CMD=$MKDIR_CMD\n"
eval $MKDIR_CMD

sudo chmod 777 $NEW_DIR_PATH
mv * $NEW_DIR_PATH
sudo mkdir -p $BLOCKCHAIN_DATA_DIR
sudo chmod 777 $BLOCKCHAIN_DATA_DIR

# 4. Install dependencies
printf "\n#### [Step 4] Install dependencies ####\n\n"

cd $NEW_DIR_PATH
npm install

# 5. Kill old node process 
printf "\n#### [Step 5] Kill old node process ####\n\n"

KILL_CMD="sudo killall node"
printf "KILL_CMD='$KILL_CMD'\n\n"
eval $KILL_CMD

# 6. Start a new node process
printf "\n#### [Step 6] Start a new node process ####\n\n"

sleep 10
START_CMD="nohup node --async-stack-traces --max-old-space-size=4000 client/index.js >/dev/null 2>error_logs.txt &"
printf "START_CMD='$START_CMD'\n"
eval $START_CMD

# 7. Wait until the new node process catches up
printf "\n#### [Step 7] Wait until the new node process catches up ####\n\n"

SECONDS=0
loopCount=0

generate_post_data()
{
  cat <<EOF
  {"method":"$1","params":{"protoVer":"0.7.1"},"jsonrpc":"2.0","id":"1"}
EOF
}

while :
do
    consensusStatus=$(curl -m 20 -X POST -H "Content-Type: application/json" --data "$(generate_post_data 'net_consensusStatus')" "http://localhost:8080/json-rpc" | jq -r '.result.result.state')
    printf "\nconsensusStatus = ${consensusStatus}\n"
    lastBlockNumber=$(curl -m 20 -X POST -H "Content-Type: application/json" --data "$(generate_post_data 'ain_getRecentBlockNumber')" "http://localhost:8080/json-rpc" | jq -r '.result.result')
    printf "\nlastBlockNumber = ${lastBlockNumber}\n"
    if [[ "$consensusStatus" = "RUNNING" ]]; then
        printf "\nBlockchain Node server is synced & running!\n"
        printf "\nTime it took to sync in seconds: $SECONDS\n"
        break
    fi
    ((loopCount++))
    printf "\nLoop count: ${loopCount}\n"
    sleep 20
done

# 8. Remove old directory keeping the chain data
printf "\n#### [Step 8] Remove old directory keeping the chain data ####\n\n"

RM_CMD="sudo rm -rf $OLD_DIR_PATH"
printf "RM_CMD='$RM_CMD'\n"
eval $RM_CMD
