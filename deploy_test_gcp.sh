#!/bin/bash

if [[ $# -lt 2 ]]; then
    printf "Usage: bash deploy_test_gcp.sh <GCP Username> <Instatnce Index> [--setup] [--stop-only] [--keep-code|--no-keep-code]\n"
    printf "Example: bash deploy_test_gcp.sh seo 0 --setup test_unit\n"
    printf "Example: bash deploy_test_gcp.sh seo 0 --keep-code test_unit\n"
    printf "Example: bash deploy_test_gcp.sh seo 0 --stop-only\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ deploy_test_gcp.sh ]]]]]\n\n"

GCP_USER="$1"
printf "GCP_USER=$GCP_USER\n"

number_re='^[0-9]+$'
if ! [[ $2 =~ $number_re ]] ; then
    printf "Invalid <Instance Index> argument: $2\n"
    exit
fi
INSTANCE_INDEX=$2
printf "INSTANCE_INDEX=$INSTANCE_INDEX\n"
printf "\n"

function parse_options() {
    local option="$1"
    if [[ $option = '--setup' ]]; then
        SETUP_OPTION="$option"
    elif [[ $option = '--stop-only' ]]; then
        STOP_ONLY_OPTION="$option"
    elif [[ $option = '--keep-code' ]]; then
        KEEP_CODE_OPTION="$option"
    elif [[ $option = '--no-keep-code' ]]; then
        KEEP_CODE_OPTION="$option"
    else
        TESTING_OPTION="$TESTING_OPTION $option"
    fi
}

# Parse options.
SETUP_OPTION=""
STOP_ONLY_OPTION=""
KEEP_CODE_OPTION="--no-keep-code"
TESTING_OPTION=""

ARG_INDEX=3
while [ $ARG_INDEX -le $# ]; do
  parse_options "${!ARG_INDEX}"
  ((ARG_INDEX++))
done
printf "SETUP_OPTION=$SETUP_OPTION\n"
printf "STOP_ONLY_OPTION=$STOP_ONLY_OPTION\n"
printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
printf "TESTING_OPTION=$TESTING_OPTION\n"

# Get confirmation.
printf "\n"
read -p "Do you want to proceed for $SEASON? [y/N]: " -n 1 -r
printf "\n\n"
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
fi

function stop_servers() {
    printf "\n* >> Stopping tests on instance ${TEST_TARGET_ADDR} *********************************************************\n\n"
    STOP_CMD="cd ./ain-blockchain; . stop_servers_local.sh"
    printf "\nSTOP_CMD=$STOP_CMD\n\n"
    gcloud compute ssh ${TEST_TARGET_ADDR} --command "$STOP_CMD" --project $PROJECT_ID --zone ${TEST_ZONE}
}

# deploy files
FILES_FOR_TEST="blockchain/ blockchain-configs/ block-pool/ client/ common/ consensus/ db/ event-handler/ json_rpc/ logger/ node/ p2p/ test/ tools/ tracker-server/ traffic/ tx-pool/ package.json setup_blockchain_ubuntu.sh stop_servers_local.sh"

SEASON="dev"
printf "SEASON=$SEASON\n"

PROJECT_ID="testnet-dev-ground"
printf "PROJECT_ID=$PROJECT_ID\n"

TEST_TARGET_ADDR="${GCP_USER}@${SEASON}-test-${INSTANCE_INDEX}"
printf "TEST_TARGET_ADDR=$TEST_TARGET_ADDR\n"

TEST_ZONE="asia-east1-b"
printf "TEST_ZONE=$TEST_ZONE\n"
printf "\n\n"

printf "###############################################################################\n"
printf "# Deploying blockchain tests #\n"
printf "###############################################################################\n\n"

# stop test servers and exit
if [[ $STOP_ONLY_OPTION = "--stop-only" ]]; then
    stop_servers
    exit 0
fi

# deploy files to GCP instances
if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
    printf "\n* >> Deploying files for instance ${TEST_TARGET_ADDR} *********************************************************\n\n"
    gcloud compute ssh ${TEST_TARGET_ADDR} --command "sudo rm -rf ~/ain-blockchain; mkdir ~/ain-blockchain" --project $PROJECT_ID --zone ${TEST_ZONE}
    gcloud compute scp --recurse $FILES_FOR_TEST ${TEST_TARGET_ADDR}:~/ain-blockchain/ --project $PROJECT_ID --zone ${TEST_ZONE}
fi

# ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
if [[ $SETUP_OPTION = "--setup" ]]; then
    printf "\n* >> Setting up instance ${TEST_TARGET_ADDR} *********************************************************\n\n"
    gcloud compute ssh ${TEST_TARGET_ADDR} --command "cd ./ain-blockchain; . setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone ${TEST_ZONE}
fi

if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
    printf '\n'
    printf "\n* >> Installing node modules on instance ${TEST_TARGET_ADDR} *********************************************************\n\n"
    gcloud compute ssh ${TEST_TARGET_ADDR} --command "cd ./ain-blockchain; yarn install --ignore-engines" --project $PROJECT_ID --zone ${TEST_ZONE}
fi

# stop test servers first
stop_servers

printf "\n* >> Running tests on instance ${TEST_TARGET_ADDR} *********************************************************\n\n"
TEST_CMD="cd ./ain-blockchain; yarn run ${TESTING_OPTION}"
printf "\nTEST_CMD=$TEST_CMD\n\n"
gcloud compute ssh ${TEST_TARGET_ADDR} --command "$TEST_CMD" --project $PROJECT_ID --zone ${TEST_ZONE}
