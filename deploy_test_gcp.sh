#!/bin/bash

if [[ $# -lt 2 ]]; then
    printf "Usage: bash deploy_test_gcp.sh <GCP Username> <Instatnce Index> [--setup] [--keep-code|--no-keep-code] [--fg] [--cat-log] [--stop-only] <Testing Option>\n"
    printf "Example: bash deploy_test_gcp.sh my_username 0 --setup test_unit\n"
    printf "Example: bash deploy_test_gcp.sh my_username 0 --keep-code test_unit\n"
    printf "Example: bash deploy_test_gcp.sh my_username 0 --keep-code test_unit \"-g 'matchFunction NOT'\"\n"
    printf "Example: bash deploy_test_gcp.sh my_username 0 --fg test_unit\n"
    printf "Example: bash deploy_test_gcp.sh my_username 0 --cat-log\n"
    printf "Example: bash deploy_test_gcp.sh my_username 0 --stop-only\n"
    printf "Example: bash deploy_test_gcp.sh my_username all --setup\n"
    printf "Example: bash deploy_test_gcp.sh my_username all --keep-code\n"
    printf "Example: bash deploy_test_gcp.sh my_username all --cat-log\n"
    printf "Example: bash deploy_test_gcp.sh my_username all --stop-only\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ deploy_test_gcp.sh ]]]]]\n\n"

GCP_USER="$1"
printf "GCP_USER=$GCP_USER\n"

number_re='^[0-9]+$'
if [[ $2 =~ $number_re ]] || [[ $2 = 'all' ]]; then
    INSTANCE_INDEX=$2
else
    printf "Invalid <Instance Index> argument: $2\n"
    exit
fi
printf "INSTANCE_INDEX=$INSTANCE_INDEX\n"
printf "\n"

function parse_options() {
    local option="$1"
    if [[ $option = '--setup' ]]; then
        SETUP_OPTION="$option"
    elif [[ $option = '--keep-code' ]]; then
        KEEP_CODE_OPTION="$option"
    elif [[ $option = '--no-keep-code' ]]; then
        KEEP_CODE_OPTION="$option"
    elif [[ $option = '--fg' ]]; then
        FOREGROUND_OPTION="$option"
    elif [[ $option = '--cat-log' ]]; then
        CAT_LOG_OPTION="$option"
    elif [[ $option = '--stop-only' ]]; then
        STOP_ONLY_OPTION="$option"
    else
        TESTING_OPTION="$TESTING_OPTION $option"
    fi
}

# Parse options.
SETUP_OPTION=""
CAT_LOG_OPTION=""
STOP_ONLY_OPTION=""
KEEP_CODE_OPTION="--no-keep-code"
FOREGROUND_OPTION=""
TESTING_OPTION=""
SEASON="dev"

ARG_INDEX=3
while [ $ARG_INDEX -le $# ]; do
  parse_options "${!ARG_INDEX}"
  ((ARG_INDEX++))
done
printf "SETUP_OPTION=$SETUP_OPTION\n"
printf "CAT_LOG_OPTION=$CAT_LOG_OPTION\n"
printf "STOP_ONLY_OPTION=$STOP_ONLY_OPTION\n"
printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
printf "FOREGROUND_OPTION=$FOREGROUND_OPTION\n"
printf "TESTING_OPTION=$TESTING_OPTION\n"
printf "SEASON=$SEASON\n"

if [[ $CAT_LOG_OPTION != "--cat-log" ]]; then
    # Get confirmation.
    printf "\n"
    read -p "Do you want to proceed for $SEASON? [y/N]: " -n 1 -r
    printf "\n\n"
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
    fi
fi

function stop_servers() {
    local instance_index="$1"
    local test_target_addr="${GCP_USER}@${SEASON}-test-${instance_index}"

    printf "\n >> Stopping tests on instance [$instance_index] ($test_target_addr) >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n\n"
    STOP_CMD="cd ./ain-blockchain; . stop_local_blockchain.sh"
    printf "\nSTOP_CMD=$STOP_CMD\n\n"
    gcloud compute ssh ${test_target_addr} --command "$STOP_CMD" --project $PROJECT_ID --zone ${TEST_ZONE}
}

# deploy files
FILES_FOR_TEST="afan_client/ blockchain/ blockchain-configs/ block-pool/ client/ common/ consensus/ db/ event-handler/ json_rpc/ logger/ node/ p2p/ test/ tools/ tracker-server/ traffic/ tx-pool/ package.json setup_blockchain_ubuntu.sh stop_local_blockchain.sh"

printf "\n"
PROJECT_ID="testnet-dev-ground"
printf "PROJECT_ID=$PROJECT_ID\n"

TEST_ZONE="asia-east1-b"
printf "TEST_ZONE=$TEST_ZONE\n"
printf "\n"

function deploy_test() {
    local instance_index="$1"
    local testing_option="$2"
    local test_target_addr="${GCP_USER}@${SEASON}-test-${instance_index}"

    printf "\n== Instance [$instance_index] ($test_target_addr) for testing $testing_option ===========================================================\n\n"

    if [[ $STOP_ONLY_OPTION = "--stop-only" ]]; then
        # stop test servers and exit
        stop_servers "$instance_index"
        printf "\n"
    elif [[ $CAT_LOG_OPTION = "--cat-log" ]]; then
        # cat-log test log and exit
        printf "\n >> Cat-logging test log from instance [$instance_index] ($test_target_addr) >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n\n"
        gcloud compute ssh ${test_target_addr} --command "cd ./ain-blockchain; cat test_log.txt" --project $PROJECT_ID --zone ${TEST_ZONE}
        printf "\n"
    else
        # deploy files to GCP instances
        if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
            printf "\n >> Deploying files for instance [$instance_index] ($test_target_addr) >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n\n"
            gcloud compute ssh ${test_target_addr} --command "sudo rm -rf ~/ain-blockchain; mkdir ~/ain-blockchain" --project $PROJECT_ID --zone ${TEST_ZONE}
            gcloud compute scp --recurse $FILES_FOR_TEST ${test_target_addr}:~/ain-blockchain/ --project $PROJECT_ID --zone ${TEST_ZONE}
        fi

        # ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
        if [[ $SETUP_OPTION = "--setup" ]]; then
            printf "\n >> Setting up instance [$instance_index] ($test_target_addr) >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n\n"
            gcloud compute ssh ${test_target_addr} --command "cd ./ain-blockchain; . setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone ${TEST_ZONE}
        fi

        if [[ $KEEP_CODE_OPTION = "--no-keep-code" ]]; then
            printf "\n >> Installing node modules on instance [$instance_index] ($test_target_addr) >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n\n"
            gcloud compute ssh ${test_target_addr} --command "cd ./ain-blockchain; yarn install --ignore-engines" --project $PROJECT_ID --zone ${TEST_ZONE}
        fi

        # stop test servers first
        stop_servers "$instance_index"

        printf "\n >> Running tests on instance [$instance_index] ($test_target_addr) >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n\n"
        if [[ $FOREGROUND_OPTION = "--fg" ]]; then
            TEST_CMD="cd ./ain-blockchain; yarn run ${testing_option}"
        else
            TEST_CMD="cd ./ain-blockchain; nohup yarn run ${testing_option} >test_log.txt 2>&1 &"
        fi
        printf "\nTEST_CMD=$TEST_CMD\n\n"
        gcloud compute ssh ${test_target_addr} --command "$TEST_CMD" --project $PROJECT_ID --zone ${TEST_ZONE}
    fi
}

if [[ $INSTANCE_INDEX = "all" ]]; then
    if [[ $FOREGROUND_OPTION = "--fg" ]] || [[ $CAT_LOG_OPTION = "--cat-log" ]]; then
        # serialized function calls
        deploy_test 0 test_unit
        deploy_test 1 test_integration_function
        deploy_test 2 test_integration_node
        deploy_test 3 test_integration_sharding
        deploy_test 4 test_integration_blockchain
        deploy_test 5 test_integration_consensus
        deploy_test 6 test_integration_dapp
        deploy_test 7 test_integration_he_protocol
        deploy_test 8 test_integration_he_sharding
        deploy_test 9 test_integration_event_handler
    else
        # parallelized function calls
        deploy_test 0 test_unit &
        deploy_test 1 test_integration_function &
        deploy_test 2 test_integration_node &
        deploy_test 3 test_integration_sharding &
        deploy_test 4 test_integration_blockchain &
        deploy_test 5 test_integration_consensus &
        deploy_test 6 test_integration_dapp &
        deploy_test 7 test_integration_he_protocol &
        deploy_test 8 test_integration_he_sharding &
        deploy_test 9 test_integration_event_handler
    fi
else
    deploy_test "$INSTANCE_INDEX" "$TESTING_OPTION"
fi
