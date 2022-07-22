#!/bin/bash

if [[ $# -lt 4 ]] || [[ $# -gt 11 ]]; then
    printf "Usage: bash start_node_incremental_gcp.sh [dev|staging|sandbox|exp|spring|summer|mainnet] <GCP Username> <Shard Index> <Node Index> [--keystore|--mnemonic|--private-key] [--keep-code|--no-keep-code] [--keep-data|--no-keep-data] [--full-sync|--fast-sync] [--chown-data|--no-chown-data] [--json-rpc] [--update-front-db] [--rest-func]\n"
    printf "Example: bash start_node_incremental_gcp.sh spring gcp_user 0 0 --keystore --no-keep-code --full-sync --no-chown-data\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ start_node_incremental_gcp.sh ]]]]]\n\n"

function parse_options() {
    local option="$1"
    if [[ $option = '--private-key' ]]; then
        ACCOUNT_INJECTION_OPTION="$option"
    elif [[ $option = '--keystore' ]]; then
        ACCOUNT_INJECTION_OPTION="$option"
    elif [[ $option = '--mnemonic' ]]; then
        ACCOUNT_INJECTION_OPTION="$option"
    elif [[ $option = '--keep-code' ]]; then
        KEEP_CODE_OPTION="$option"
    elif [[ $option = '--no-keep-code' ]]; then
        KEEP_CODE_OPTION="$option"
    elif [[ $option = '--keep-data' ]]; then
        KEEP_DATA_OPTION="$option"
    elif [[ $option = '--no-keep-data' ]]; then
        KEEP_DATA_OPTION="$option"
    elif [[ $option = '--full-sync' ]]; then
        SYNC_MODE_OPTION="$option"
    elif [[ $option = '--fast-sync' ]]; then
        SYNC_MODE_OPTION="$option"
    elif [[ $option = '--chown-data' ]]; then
        CHOWN_DATA_OPTION="$option"
    elif [[ $option = '--no-chown-data' ]]; then
        CHOWN_DATA_OPTION="$option"
    elif [[ $option = '--json-rpc' ]]; then
        JSON_RPC_OPTION="$option"
    elif [[ $option = '--update-front-db' ]]; then
        UPDATE_FRONT_DB_OPTION="$option"
    elif [[ $option = '--rest-func' ]]; then
        REST_FUNC_OPTION="$option"
    elif [[ $option = '--event-handler' ]]; then
        EVENT_HANDLER_OPTION="$option"
    else
        printf "Invalid option: $option\n"
        exit
    fi
}

# Parse options.
SEASON="$1"
GCP_USER="$2"

number_re='^[0-9]+$'
if ! [[ $3 =~ $number_re ]] ; then
    printf "Invalid <Shard Index> argument: $3\n"
    exit
fi
SHARD_INDEX="$3"

if ! [[ $4 =~ $number_re ]] ; then
    printf "Invalid <Node Index> argument: $4\n"
    exit
fi
if [[ "$4" -lt 0 ]] || [[ "$4" -gt 9 ]]; then
    printf "Invalid <Node Index> argument: $4\n"
    exit
fi
NODE_INDEX="$4"

ACCOUNT_INJECTION_OPTION="--private-key"
KEEP_CODE_OPTION="--keep-code"
KEEP_DATA_OPTION="--keep-data"
SYNC_MODE_OPTION="--fast-sync"
CHOWN_DATA_OPTION="--chown-data"
JSON_RPC_OPTION=""
UPDATE_FRONT_DB_OPTION=""
REST_FUNC_OPTION=""
EVENT_HANDLER_OPTION=""

ARG_INDEX=5
while [ $ARG_INDEX -le $# ]; do
  parse_options "${!ARG_INDEX}"
  ((ARG_INDEX++))
done

printf "SEASON=$SEASON\n"
printf "GCP_USER=$GCP_USER\n"
printf "SHARD_INDEX=$SHARD_INDEX\n"
printf "NODE_INDEX=$NODE_INDEX\n"
printf "\n"

printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
printf "KEEP_DATA_OPTION=$KEEP_DATA_OPTION\n"
printf "SYNC_MODE_OPTION=$SYNC_MODE_OPTION\n"
printf "CHOWN_DATA_OPTION=$CHOWN_DATA_OPTION\n"
printf "JSON_RPC_OPTION=$JSON_RPC_OPTION\n"
printf "UPDATE_FRONT_DB_OPTION=$UPDATE_FRONT_DB_OPTION\n"
printf "REST_FUNC_OPTION=$REST_FUNC_OPTION\n"
printf "EVENT_HANDLER_OPTION=$EVENT_HANDLER_OPTION\n"

if [[ "$ACCOUNT_INJECTION_OPTION" = "" ]]; then
    printf "Must provide an ACCOUNT_INJECTION_OPTION\n"
    exit
fi

# 1. Configure env vars (BLOCKCHAIN_CONFIGS_DIR, TRACKER_UPDATE_JSON_RPC_URL, ...)
printf "\n#### [Step 1] Configure env vars ####\n\n"

if [[ $SEASON = 'mainnet' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/mainnet-prod
    export TRACKER_UPDATE_JSON_RPC_URL=http://34.81.167.141:8080/json-rpc
    if [[ $NODE_INDEX -lt 5 ]]; then
        export PEER_CANDIDATE_JSON_RPC_URL="https://mainnet-api.ainetwork.ai/json-rpc"
        export PEER_WHITELIST="0x000C63907F7Aeca56A72F5a4F7cd00EfFCF11c3A,0x001C3C9C4a5669eCD8b78946f6fa5549b33362F8,0x002C76f0aeA9Ba615428d9dF7fedEC6f8ed5369f,0x003C9d091584fEC96bC3bD8423c884680BEAaf4E,0x004C4328B6c2ABF7c4Df897a8124b36E3f00a2FC,0x005C99Db64845e5BF24cd152b22c932989479907,0x006C672861e9DBb09232307c17Be6554BC90687c,0x007C36bf5D0F77836eE138EEAc8df7051b43209b,0x008C287187a5626D0a25DbD67327B36AC55B998E,0x009C66DBce144003f8C4B859fFFce78F80fDD639"
    else
        export PEER_CANDIDATE_JSON_RPC_URL="http://104.199.237.250:8080/json-rpc"
    fi
elif [[ $SEASON = 'summer' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-prod
    export TRACKER_UPDATE_JSON_RPC_URL=http://35.194.172.106:8080/json-rpc
    if [[ $NODE_INDEX -lt 5 ]]; then
        export PEER_CANDIDATE_JSON_RPC_URL="https://summer-api.ainetwork.ai/json-rpc"
        export PEER_WHITELIST="0x000AF024FEDb636294867bEff390bCE6ef9C5fc4,0x001Ac309EFFFF6d307CbC2d09C811aCD7dD8A35d,0x002A273ECd3aAEc4d8748f4E06eAdE3b34d83211,0x003AD6FdB06684175e7D95EcC36758B014517E4b,0x004A2550661c8a306207C9dabb279d5701fFD66e,0x005A3c55EcE1A593b761D408B6E6BC778E0a638B,0x006Af719E197bC81BBb75d2fec7Ea217D1750bAe,0x007Ac58EAc5F0D0bDd10Af8b90799BcF849c2E74,0x008AeBc041B7ceABc53A4cf393ccF16c10c29dba,0x009A97c0cF07fdbbcdA1197aE11792258b6EcedD"
    else
        export PEER_CANDIDATE_JSON_RPC_URL="http://35.194.169.78:8080/json-rpc"
    fi
elif [[ $SEASON = 'spring' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-prod
    export TRACKER_UPDATE_JSON_RPC_URL=http://35.221.137.80:8080/json-rpc
    if [[ $NODE_INDEX -lt 5 ]]; then
        export PEER_CANDIDATE_JSON_RPC_URL="https://spring-api.ainetwork.ai/json-rpc"
        export PEER_WHITELIST="0x000AF024FEDb636294867bEff390bCE6ef9C5fc4,0x001Ac309EFFFF6d307CbC2d09C811aCD7dD8A35d,0x002A273ECd3aAEc4d8748f4E06eAdE3b34d83211,0x003AD6FdB06684175e7D95EcC36758B014517E4b,0x004A2550661c8a306207C9dabb279d5701fFD66e,0x005A3c55EcE1A593b761D408B6E6BC778E0a638B,0x006Af719E197bC81BBb75d2fec7Ea217D1750bAe,0x007Ac58EAc5F0D0bDd10Af8b90799BcF849c2E74,0x008AeBc041B7ceABc53A4cf393ccF16c10c29dba,0x009A97c0cF07fdbbcdA1197aE11792258b6EcedD"
    else
        export PEER_CANDIDATE_JSON_RPC_URL="http://35.221.184.48:8080/json-rpc"
    fi
elif [[ "$SEASON" = "sandbox" ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-sandbox
    if [[ $NODE_INDEX -lt 5 ]]; then
        export PEER_WHITELIST="0x00ADEc28B6a845a085e03591bE7550dd68673C1C,0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204,0x02A2A1DF4f630d760c82BE07F18e5065d103Fa00,0x03AAb7b6f16A92A1dfe018Fe34ee420eb098B98A,0x04A456C92A880cd59D7145C457475515a6f6E0f2,0x05A1247A7400f0C2A893611adD1505743552c631,0x06AD9C8F611f1e9d9CACD4738167A51aA2e80a1A,0x07A43138CC760C85A5B1F115aa60eADEaa0bf417,0x08Aed7AF9354435c38d52143EE50ac839D20696b,0x09A0d53FDf1c36A131938eb379b98910e55EEfe1"
    else
        export PEER_CANDIDATE_JSON_RPC_URL="http://130.211.244.169:8080/json-rpc"
    fi
    # NOTE(platfowner): For non-api-servers, the value in the blockchain configs
    # (https://sandbox-api.ainetwork.ai/json-rpc) is used.
elif [[ $SEASON = 'staging' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-staging
    if [[ $NODE_INDEX -lt 5 ]]; then
        export PEER_WHITELIST="0x00ADEc28B6a845a085e03591bE7550dd68673C1C,0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204,0x02A2A1DF4f630d760c82BE07F18e5065d103Fa00,0x03AAb7b6f16A92A1dfe018Fe34ee420eb098B98A,0x04A456C92A880cd59D7145C457475515a6f6E0f2,0x05A1247A7400f0C2A893611adD1505743552c631,0x06AD9C8F611f1e9d9CACD4738167A51aA2e80a1A,0x07A43138CC760C85A5B1F115aa60eADEaa0bf417,0x08Aed7AF9354435c38d52143EE50ac839D20696b,0x09A0d53FDf1c36A131938eb379b98910e55EEfe1"
    else
        export PEER_CANDIDATE_JSON_RPC_URL="http://35.194.139.219:8080/json-rpc"
    fi
    # NOTE(platfowner): For non-api-servers, the value in the blockchain configs
    # (https://staging-api.ainetwork.ai/json-rpc) is used.
elif [[ $SEASON = 'exp' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-exp
    if [[ $NODE_INDEX -lt 5 ]]; then
        export PEER_WHITELIST="0x00ADEc28B6a845a085e03591bE7550dd68673C1C,0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204,0x02A2A1DF4f630d760c82BE07F18e5065d103Fa00,0x03AAb7b6f16A92A1dfe018Fe34ee420eb098B98A,0x04A456C92A880cd59D7145C457475515a6f6E0f2,0x05A1247A7400f0C2A893611adD1505743552c631,0x06AD9C8F611f1e9d9CACD4738167A51aA2e80a1A,0x07A43138CC760C85A5B1F115aa60eADEaa0bf417,0x08Aed7AF9354435c38d52143EE50ac839D20696b,0x09A0d53FDf1c36A131938eb379b98910e55EEfe1"
    else
        export PEER_CANDIDATE_JSON_RPC_URL="http://34.81.178.195:8080/json-rpc"
    fi
    # NOTE(platfowner): For non-api-servers, the value in the blockchain configs
    # (https://exp-api.ainetwork.ai/json-rpc) is used.
elif [[ $SEASON = 'dev' ]]; then
    export BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-dev
    if [[ $SHARD_INDEX = 0 ]]; then
        if [[ $NODE_INDEX -lt 5 ]]; then
            export PEER_WHITELIST="0x00ADEc28B6a845a085e03591bE7550dd68673C1C,0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204,0x02A2A1DF4f630d760c82BE07F18e5065d103Fa00,0x03AAb7b6f16A92A1dfe018Fe34ee420eb098B98A,0x04A456C92A880cd59D7145C457475515a6f6E0f2,0x05A1247A7400f0C2A893611adD1505743552c631,0x06AD9C8F611f1e9d9CACD4738167A51aA2e80a1A,0x07A43138CC760C85A5B1F115aa60eADEaa0bf417,0x08Aed7AF9354435c38d52143EE50ac839D20696b,0x09A0d53FDf1c36A131938eb379b98910e55EEfe1"
        else
            export PEER_CANDIDATE_JSON_RPC_URL="http://35.194.235.180:8080/json-rpc"
        fi
        # NOTE(platfowner): For non-api-servers, the value in the blockchain configs
        # (https://dev-api.ainetwork.ai/json-rpc) is used.
    elif [[ $SHARD_INDEX = 1 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://35.187.153.22:8080/json-rpc  # dev-shard-1-tracker-ip
    elif [[ $SHARD_INDEX = 2 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://34.80.203.104:8080/json-rpc  # dev-shard-2-tracker-ip
    elif [[ $SHARD_INDEX = 3 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://35.189.174.17:8080/json-rpc  # dev-shard-3-tracker-ip
    elif [[ $SHARD_INDEX = 4 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://35.221.164.158:8080/json-rpc  # dev-shard-4-tracker-ip
    elif [[ $SHARD_INDEX = 5 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://35.234.46.65:8080/json-rpc  # dev-shard-5-tracker-ip
    elif [[ $SHARD_INDEX = 6 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://35.221.210.171:8080/json-rpc  # dev-shard-6-tracker-ip
    elif [[ $SHARD_INDEX = 7 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://34.80.222.121:8080/json-rpc  # dev-shard-7-tracker-ip
    elif [[ $SHARD_INDEX = 8 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://35.221.200.95:8080/json-rpc  # dev-shard-8-tracker-ip
    elif [[ $SHARD_INDEX = 9 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://34.80.216.199:8080/json-rpc  # dev-shard-9-tracker-ip
    elif [[ $SHARD_INDEX = 10 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://34.80.161.85:8080/json-rpc  # dev-shard-10-tracker-ip
    elif [[ $SHARD_INDEX = 11 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://35.194.239.169:8080/json-rpc  # dev-shard-11-tracker-ip
    elif [[ $SHARD_INDEX = 12 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://35.185.156.22:8080/json-rpc  # dev-shard-12-tracker-ip
    elif [[ $SHARD_INDEX = 13 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://35.229.247.143:8080/json-rpc  # dev-shard-13-tracker-ip
    elif [[ $SHARD_INDEX = 14 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://35.229.226.47:8080/json-rpc  # dev-shard-14-tracker-ip
    elif [[ $SHARD_INDEX = 15 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://35.234.61.23:8080/json-rpc  # dev-shard-15-tracker-ip
    elif [[ $SHARD_INDEX = 16 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://34.80.66.41:8080/json-rpc  # dev-shard-16-tracker-ip
    elif [[ $SHARD_INDEX = 17 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://35.229.143.18:8080/json-rpc  # dev-shard-17-tracker-ip
    elif [[ $SHARD_INDEX = 18 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://35.234.58.137:8080/json-rpc  # dev-shard-18-tracker-ip
    elif [[ $SHARD_INDEX = 19 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://34.80.249.104:8080/json-rpc  # dev-shard-19-tracker-ip
    elif [[ $SHARD_INDEX = 20 ]]; then
        export TRACKER_UPDATE_JSON_RPC_URL=http://35.201.248.92:8080/json-rpc  # dev-shard-20-tracker-ip
    else
        printf "Invalid <Shard Index> argument: $SHARD_INDEX\n"
        exit
    fi
    if [[ $SHARD_INDEX -gt 0 ]]; then
        # Create a blockchain_params.json
        export BLOCKCHAIN_CONFIGS_DIR="blockchain-configs/shard_$SHARD_INDEX"
        mkdir -p "./$BLOCKCHAIN_CONFIGS_DIR"
        node > "./$BLOCKCHAIN_CONFIGS_DIR/blockchain_params.json" <<EOF
        const data = require('./$BLOCKCHAIN_CONFIGS_DIR/blockchain_params.json');
        data.blockchain.TRACKER_UPDATE_JSON_RPC_URL = '$TRACKER_UPDATE_JSON_RPC_URL';
        console.log(JSON.stringify(data, null, 2));
EOF
    fi
else
    printf "Invalid <Project/Season> argument: $SEASON\n"
    exit
fi

printf "TRACKER_UPDATE_JSON_RPC_URL=$TRACKER_UPDATE_JSON_RPC_URL\n"
printf "BLOCKCHAIN_CONFIGS_DIR=$BLOCKCHAIN_CONFIGS_DIR\n"
printf "PEER_CANDIDATE_JSON_RPC_URL=$PEER_CANDIDATE_JSON_RPC_URL\n"
printf "PEER_WHITELIST=$PEER_WHITELIST\n"

# NOTE(liayoo): Currently this script supports [--keystore|--mnemonic] option only for the parent chain.
if [[ $ACCOUNT_INJECTION_OPTION != "--private_key" ]] && [[ "$SHARD_INDEX" -gt 0 ]]; then
    printf 'Invalid account injection option\n'
    return 1
fi

if [[ "$ACCOUNT_INJECTION_OPTION" = "" ]]; then
    printf "Must provide an ACCOUNT_INJECTION_OPTION\n"
    return 1
fi

if [[ $ACCOUNT_INJECTION_OPTION = "--keystore" ]]; then
    export ACCOUNT_INJECTION_OPTION=keystore
elif [[ $ACCOUNT_INJECTION_OPTION = "--mnemonic" ]]; then
    export ACCOUNT_INJECTION_OPTION=mnemonic
else
    export ACCOUNT_INJECTION_OPTION=private_key
fi
if [[ $SYNC_MODE_OPTION = "--full-sync" ]]; then
    export SYNC_MODE=full
else
    export SYNC_MODE=fast
fi
if [[ $SEASON = "staging" ]]; then
    # for performance test pipeline
    export ENABLE_EXPRESS_RATE_LIMIT=false
else
    export ENABLE_EXPRESS_RATE_LIMIT=true
fi
if [[ $JSON_RPC_OPTION ]]; then
    export ENABLE_JSON_RPC_API=true
else
    export ENABLE_JSON_RPC_API=false
fi
if [[ $UPDATE_FRONT_DB_OPTION ]]; then
    export UPDATE_NEW_FINAL_FRONT_DB_WITH_TX_POOL=true
else
    export UPDATE_NEW_FINAL_FRONT_DB_WITH_TX_POOL=false
fi
if [[ $REST_FUNC_OPTION ]]; then
    export ENABLE_REST_FUNCTION_CALL=true
else
    export ENABLE_REST_FUNCTION_CALL=false
fi
if [[ $EVENT_HANDLER_OPTION ]]; then
    export ENABLE_EVENT_HANDLER=true
else
    export ENABLE_EVENT_HANDLER=false
fi

# NOTE(liayoo): Currently this script supports [--keystore|--mnemonic] option only for the parent chain.
if [[ $ACCOUNT_INJECTION_OPTION != "private_key" ]] && [[ "$SHARD_INDEX" -gt 0 ]]; then
    printf 'Invalid account injection option\n'
    exit
fi

# 2. Get currently used directory & new directory
printf "\n#### [Step 2] Get currently used directory & new directory ####\n\n"

OLD_DIR_PATH=$(find /home/ain-blockchain* -maxdepth 0 -type d)
printf "OLD_DIR_PATH=$OLD_DIR_PATH\n"

date=$(date '+%Y-%m-%dT%H-%M')
printf "date=$date\n"
NEW_DIR_NAME="ain-blockchain-$date"
printf "NEW_DIR_NAME=$NEW_DIR_NAME\n"
NEW_DIR_PATH="/home/$NEW_DIR_NAME"
printf "NEW_DIR_PATH=$NEW_DIR_PATH\n"

# 3. Set up working directory & install modules
printf "\n#### [Step 3] Set up working directory & install modules ####\n\n"
if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
    printf '\n'
    printf 'Setting up new working directory..\n'
    CODE_CMD="cd ~; sudo mv ain-blockchain $NEW_DIR_NAME; sudo mv $NEW_DIR_NAME /home; sudo chmod -R 777 $NEW_DIR_PATH; sudo chown -R $GCP_USER:$GCP_USER $NEW_DIR_PATH"
    printf "\nCODE_CMD=$CODE_CMD\n"
    eval $CODE_CMD

    printf '\n'
    printf 'Installing node modules..\n'
    cd $NEW_DIR_PATH
    INSTALL_CMD="yarn install --ignore-engines"
    printf "\nINSTALL_CMD=$INSTALL_CMD\n"
    eval $INSTALL_CMD
else
    printf '\n'
    printf 'Reusing existing working directory..\n'
    CODE_CMD="sudo chmod -R 777 $OLD_DIR_PATH; sudo chown -R $GCP_USER:$GCP_USER $OLD_DIR_PATH"
    printf "\nCODE_CMD=$CODE_CMD\n"
    eval $CODE_CMD
fi

# 4. Kill old node server
printf "\n#### [Step 4] Kill old node server ####\n\n"

KILL_CMD="sudo killall node"
printf "KILL_CMD=$KILL_CMD\n\n"
eval $KILL_CMD
sleep 10

# 5. Set up data directory
printf "\n#### [Step 5] Set up data directory ####\n\n"
if [[ $KEEP_DATA_OPTION = "--no-keep-data" ]]; then
    printf '\n'
    printf 'Setting up new data directory..\n'
    sudo rm -rf /home/ain_blockchain_data/chains
    sudo rm -rf /home/ain_blockchain_data/snapshots
    sudo rm -rf /home/ain_blockchain_data/logs
    DATA_CMD="sudo mkdir -p /home/ain_blockchain_data; sudo chmod -R 777 /home/ain_blockchain_data; sudo chown -R $GCP_USER:$GCP_USER /home/ain_blockchain_data"
    printf "\nDATA_CMD=$DATA_CMD\n"
    eval $DATA_CMD
else
    printf '\n'
    printf 'Reusing existing data directory..\n'
    if [[ $CHOWN_DATA_OPTION = "--no-chown-data" ]]; then
        DATA_CMD="sudo mkdir -p /home/ain_blockchain_data; sudo chmod 777 /home/ain_blockchain_data; sudo chown $GCP_USER:$GCP_USER /home/ain_blockchain_data"
    else
        DATA_CMD="sudo mkdir -p /home/ain_blockchain_data; sudo chmod -R 777 /home/ain_blockchain_data; sudo chown -R $GCP_USER:$GCP_USER /home/ain_blockchain_data"
    fi
    printf "\nDATA_CMD=$DATA_CMD\n"
    eval $DATA_CMD
fi

# 6. Remove old working directory keeping the chain data
printf "\n#### [Step 6] Remove old working directory if necessary ####\n\n"
if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
    printf '\n'
    printf 'Removing old working directory..\n'
    RM_CMD="sudo rm -rf $OLD_DIR_PATH"
    printf "\nRM_CMD=$RM_CMD\n"
    eval $RM_CMD
else
    printf '\n'
    printf 'Keeping existing working directory..\n'
fi

# 7. Start a new node server
printf "\n#### [Step 7] Start new node server ####\n\n"

export STAKE=100000
printf "STAKE=$STAKE\n"

if [[ "$SEASON" = "sandbox" ]]; then
    MAX_OLD_SPACE_SIZE_MB=11000
else
    MAX_OLD_SPACE_SIZE_MB=55000
fi

START_CMD="nohup node --async-stack-traces --max-old-space-size=$MAX_OLD_SPACE_SIZE_MB client/index.js >/dev/null 2>error_logs.txt &"
printf "\nSTART_CMD=$START_CMD\n"
printf "START_CMD=$START_CMD\n" >> start_commands.txt
eval $START_CMD

# NOTE(platfowner): deploy_blockchain_incremental_gcp.sh waits until the new server gets healthy.

printf "\n* << Node server [$SEASON $SHARD_INDEX $NODE_INDEX] successfully deployed! ***************************************\n\n"
