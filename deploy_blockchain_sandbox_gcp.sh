#!/bin/bash

if [[ $# -lt 3 ]] || [[ $# -gt 6 ]]; then
    printf "Usage: bash deploy_blockchain_sandbox_gcp.sh <GCP Username> <# start node> <# end node> [--setup] [--restart|--reset] [--kill-only|--skip-kill]\n"
    printf "Example: bash deploy_blockchain_sandbox_gcp.sh lia 7 99 --setup\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ deploy_blockchain_sandbox_gcp.sh ]]]]]\n\n"

SEASON=sandbox
PROJECT_ID=testnet-$SEASON-ground
printf "SEASON=$SEASON\n"
printf "PROJECT_ID=$PROJECT_ID\n"

GCP_USER="$1"
START_NODE_IDX="$2"
END_NODE_IDX="$3"
printf "GCP_USER=$GCP_USER\n"
printf "START_NODE_IDX=$START_NODE_IDX\n"
printf "END_NODE_IDX=$END_NODE_IDX\n"

function parse_options() {
    local option="$1"
    if [[ $option = '--setup' ]]; then
        SETUP_OPTION="$option"
    elif [[ $option = '--restart' ]]; then
        if [[ "$RESET_RESTART_OPTION" ]]; then
            printf "You cannot use both restart and reset\n"
            exit
        fi
        RESET_RESTART_OPTION="$option"
    elif [[ $option = '--reset' ]]; then
        if [[ "$RESET_RESTART_OPTION" ]]; then
            printf "You cannot use both restart and reset\n"
            exit
        fi
        RESET_RESTART_OPTION="$option"
    elif [[ $option = '--kill-only' ]]; then
        if [[ "$KILL_OPTION" ]]; then
            printf "You cannot use both --skip-kill and --kill-only\n"
            exit
        fi
        KILL_OPTION="$option"
    elif [[ $option = '--skip-kill' ]]; then
        if [[ "$KILL_OPTION" ]]; then
            printf "You cannot use both --skip-kill and --kill-only\n"
            exit
        fi
        KILL_OPTION="$option"
    else
        printf "Invalid options: $option\n"
        exit
    fi
}

# Parse options.
SETUP_OPTION=""
RESET_RESTART_OPTION=""
KILL_OPTION=""

ARG_INDEX=4
while [ $ARG_INDEX -le $# ]
do
  parse_options "${!ARG_INDEX}"
  ((ARG_INDEX++))
done
printf "SETUP_OPTION=$SETUP_OPTION\n"
printf "RESET_RESTART_OPTION=$RESET_RESTART_OPTION\n"
printf "KILL_OPTION=$KILL_OPTION\n"


# Get confirmation.
printf "\n"
read -p "Do you want to proceed? >> (y/N) " -n 1 -r
printf "\n\n"
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
fi

# GCP node address
# NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-node-0-taiwan"
# NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-node-1-oregon"
# NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-node-2-singapore"
# NODE_3_TARGET_ADDR="${GCP_USER}@${SEASON}-node-3-iowa"
# NODE_4_TARGET_ADDR="${GCP_USER}@${SEASON}-node-4-netherlands"
# NODE_5_TARGET_ADDR="${GCP_USER}@${SEASON}-node-5-taiwan"
# NODE_6_TARGET_ADDR="${GCP_USER}@${SEASON}-node-6-oregon"
NODE_7_TARGET_ADDR="${GCP_USER}@${SEASON}-node-7-singapore"
NODE_8_TARGET_ADDR="${GCP_USER}@${SEASON}-node-8-iowa"
NODE_9_TARGET_ADDR="${GCP_USER}@${SEASON}-node-9-netherlands"
NODE_10_TARGET_ADDR="${GCP_USER}@${SEASON}-node-10-taiwan"
NODE_11_TARGET_ADDR="${GCP_USER}@${SEASON}-node-11-oregon"
NODE_12_TARGET_ADDR="${GCP_USER}@${SEASON}-node-12-singapore"
NODE_13_TARGET_ADDR="${GCP_USER}@${SEASON}-node-13-iowa"
NODE_14_TARGET_ADDR="${GCP_USER}@${SEASON}-node-14-netherlands"
NODE_15_TARGET_ADDR="${GCP_USER}@${SEASON}-node-15-taiwan"
NODE_16_TARGET_ADDR="${GCP_USER}@${SEASON}-node-16-oregon"
NODE_17_TARGET_ADDR="${GCP_USER}@${SEASON}-node-17-singapore"
NODE_18_TARGET_ADDR="${GCP_USER}@${SEASON}-node-18-iowa"
NODE_19_TARGET_ADDR="${GCP_USER}@${SEASON}-node-19-netherlands"
NODE_20_TARGET_ADDR="${GCP_USER}@${SEASON}-node-20-taiwan"
NODE_21_TARGET_ADDR="${GCP_USER}@${SEASON}-node-21-oregon"
NODE_22_TARGET_ADDR="${GCP_USER}@${SEASON}-node-22-singapore"
NODE_23_TARGET_ADDR="${GCP_USER}@${SEASON}-node-23-iowa"
NODE_24_TARGET_ADDR="${GCP_USER}@${SEASON}-node-24-netherlands"
NODE_25_TARGET_ADDR="${GCP_USER}@${SEASON}-node-25-taiwan"
NODE_26_TARGET_ADDR="${GCP_USER}@${SEASON}-node-26-oregon"
NODE_27_TARGET_ADDR="${GCP_USER}@${SEASON}-node-27-singapore"
NODE_28_TARGET_ADDR="${GCP_USER}@${SEASON}-node-28-iowa"
NODE_29_TARGET_ADDR="${GCP_USER}@${SEASON}-node-29-netherlands"
NODE_30_TARGET_ADDR="${GCP_USER}@${SEASON}-node-30-taiwan"
NODE_31_TARGET_ADDR="${GCP_USER}@${SEASON}-node-31-oregon"
NODE_32_TARGET_ADDR="${GCP_USER}@${SEASON}-node-32-singapore"
NODE_33_TARGET_ADDR="${GCP_USER}@${SEASON}-node-33-iowa"
NODE_34_TARGET_ADDR="${GCP_USER}@${SEASON}-node-34-netherlands"
NODE_35_TARGET_ADDR="${GCP_USER}@${SEASON}-node-35-taiwan"
NODE_36_TARGET_ADDR="${GCP_USER}@${SEASON}-node-36-oregon"
NODE_37_TARGET_ADDR="${GCP_USER}@${SEASON}-node-37-singapore"
NODE_38_TARGET_ADDR="${GCP_USER}@${SEASON}-node-38-iowa"
NODE_39_TARGET_ADDR="${GCP_USER}@${SEASON}-node-39-netherlands"
NODE_40_TARGET_ADDR="${GCP_USER}@${SEASON}-node-40-taiwan"
NODE_41_TARGET_ADDR="${GCP_USER}@${SEASON}-node-41-oregon"
NODE_42_TARGET_ADDR="${GCP_USER}@${SEASON}-node-42-singapore"
NODE_43_TARGET_ADDR="${GCP_USER}@${SEASON}-node-43-iowa"
NODE_44_TARGET_ADDR="${GCP_USER}@${SEASON}-node-44-netherlands"
NODE_45_TARGET_ADDR="${GCP_USER}@${SEASON}-node-45-taiwan"
NODE_46_TARGET_ADDR="${GCP_USER}@${SEASON}-node-46-oregon"
NODE_47_TARGET_ADDR="${GCP_USER}@${SEASON}-node-47-singapore"
NODE_48_TARGET_ADDR="${GCP_USER}@${SEASON}-node-48-iowa"
NODE_49_TARGET_ADDR="${GCP_USER}@${SEASON}-node-49-netherlands"
NODE_50_TARGET_ADDR="${GCP_USER}@${SEASON}-node-50-taiwan"
NODE_51_TARGET_ADDR="${GCP_USER}@${SEASON}-node-51-oregon"
NODE_52_TARGET_ADDR="${GCP_USER}@${SEASON}-node-52-singapore"
NODE_53_TARGET_ADDR="${GCP_USER}@${SEASON}-node-53-iowa"
NODE_54_TARGET_ADDR="${GCP_USER}@${SEASON}-node-54-netherlands"
NODE_55_TARGET_ADDR="${GCP_USER}@${SEASON}-node-55-taiwan"
NODE_56_TARGET_ADDR="${GCP_USER}@${SEASON}-node-56-oregon"
NODE_57_TARGET_ADDR="${GCP_USER}@${SEASON}-node-57-singapore"
NODE_58_TARGET_ADDR="${GCP_USER}@${SEASON}-node-58-iowa"
NODE_59_TARGET_ADDR="${GCP_USER}@${SEASON}-node-59-netherlands"
NODE_60_TARGET_ADDR="${GCP_USER}@${SEASON}-node-60-taiwan"
NODE_61_TARGET_ADDR="${GCP_USER}@${SEASON}-node-61-oregon"
NODE_62_TARGET_ADDR="${GCP_USER}@${SEASON}-node-62-singapore"
NODE_63_TARGET_ADDR="${GCP_USER}@${SEASON}-node-63-iowa"
NODE_64_TARGET_ADDR="${GCP_USER}@${SEASON}-node-64-netherlands"
NODE_65_TARGET_ADDR="${GCP_USER}@${SEASON}-node-65-taiwan"
NODE_66_TARGET_ADDR="${GCP_USER}@${SEASON}-node-66-oregon"
NODE_67_TARGET_ADDR="${GCP_USER}@${SEASON}-node-67-singapore"
NODE_68_TARGET_ADDR="${GCP_USER}@${SEASON}-node-68-iowa"
NODE_69_TARGET_ADDR="${GCP_USER}@${SEASON}-node-69-netherlands"
NODE_70_TARGET_ADDR="${GCP_USER}@${SEASON}-node-70-taiwan"
NODE_71_TARGET_ADDR="${GCP_USER}@${SEASON}-node-71-oregon"
NODE_72_TARGET_ADDR="${GCP_USER}@${SEASON}-node-72-singapore"
NODE_73_TARGET_ADDR="${GCP_USER}@${SEASON}-node-73-iowa"
NODE_74_TARGET_ADDR="${GCP_USER}@${SEASON}-node-74-netherlands"
NODE_75_TARGET_ADDR="${GCP_USER}@${SEASON}-node-75-taiwan"
NODE_76_TARGET_ADDR="${GCP_USER}@${SEASON}-node-76-oregon"
NODE_77_TARGET_ADDR="${GCP_USER}@${SEASON}-node-77-singapore"
NODE_78_TARGET_ADDR="${GCP_USER}@${SEASON}-node-78-iowa"
NODE_79_TARGET_ADDR="${GCP_USER}@${SEASON}-node-79-netherlands"
NODE_80_TARGET_ADDR="${GCP_USER}@${SEASON}-node-80-taiwan"
NODE_81_TARGET_ADDR="${GCP_USER}@${SEASON}-node-81-oregon"
NODE_82_TARGET_ADDR="${GCP_USER}@${SEASON}-node-82-singapore"
NODE_83_TARGET_ADDR="${GCP_USER}@${SEASON}-node-83-iowa"
NODE_84_TARGET_ADDR="${GCP_USER}@${SEASON}-node-84-netherlands"
NODE_85_TARGET_ADDR="${GCP_USER}@${SEASON}-node-85-taiwan"
NODE_86_TARGET_ADDR="${GCP_USER}@${SEASON}-node-86-oregon"
NODE_87_TARGET_ADDR="${GCP_USER}@${SEASON}-node-87-singapore"
NODE_88_TARGET_ADDR="${GCP_USER}@${SEASON}-node-88-iowa"
NODE_89_TARGET_ADDR="${GCP_USER}@${SEASON}-node-89-netherlands"
NODE_90_TARGET_ADDR="${GCP_USER}@${SEASON}-node-90-taiwan"
NODE_91_TARGET_ADDR="${GCP_USER}@${SEASON}-node-91-oregon"
NODE_92_TARGET_ADDR="${GCP_USER}@${SEASON}-node-92-singapore"
NODE_93_TARGET_ADDR="${GCP_USER}@${SEASON}-node-93-iowa"
NODE_94_TARGET_ADDR="${GCP_USER}@${SEASON}-node-94-netherlands"
NODE_95_TARGET_ADDR="${GCP_USER}@${SEASON}-node-95-taiwan"
NODE_96_TARGET_ADDR="${GCP_USER}@${SEASON}-node-96-oregon"
NODE_97_TARGET_ADDR="${GCP_USER}@${SEASON}-node-97-singapore"
NODE_98_TARGET_ADDR="${GCP_USER}@${SEASON}-node-98-iowa"
NODE_99_TARGET_ADDR="${GCP_USER}@${SEASON}-node-99-netherlands"

# Node time zone
# NODE_0_ZONE="asia-east1-b"
# NODE_1_ZONE="us-west1-b"
# NODE_2_ZONE="asia-southeast1-b"
# NODE_3_ZONE="us-central1-a"
# NODE_4_ZONE="europe-west4-a"
# NODE_5_ZONE="asia-east1-b"
# NODE_6_ZONE="us-west1-b"
NODE_7_ZONE="asia-southeast1-b"
NODE_8_ZONE="us-central1-a"
NODE_9_ZONE="europe-west4-a"
NODE_10_ZONE="asia-east1-b"
NODE_11_ZONE="us-west1-b"
NODE_12_ZONE="asia-southeast1-b"
NODE_13_ZONE="us-central1-a"
NODE_14_ZONE="europe-west4-a"
NODE_15_ZONE="asia-east1-b"
NODE_16_ZONE="us-west1-b"
NODE_17_ZONE="asia-southeast1-b"
NODE_18_ZONE="us-central1-a"
NODE_19_ZONE="europe-west4-a"
NODE_20_ZONE="asia-east1-b"
NODE_21_ZONE="us-west1-b"
NODE_22_ZONE="asia-southeast1-b"
NODE_23_ZONE="us-central1-a"
NODE_24_ZONE="europe-west4-a"
NODE_25_ZONE="asia-east1-b"
NODE_26_ZONE="us-west1-b"
NODE_27_ZONE="asia-southeast1-b"
NODE_28_ZONE="us-central1-a"
NODE_29_ZONE="europe-west4-a"
NODE_30_ZONE="asia-east1-b"
NODE_31_ZONE="us-west1-b"
NODE_32_ZONE="asia-southeast1-b"
NODE_33_ZONE="us-central1-a"
NODE_34_ZONE="europe-west4-a"
NODE_35_ZONE="asia-east1-b"
NODE_36_ZONE="us-west1-b"
NODE_37_ZONE="asia-southeast1-b"
NODE_38_ZONE="us-central1-a"
NODE_39_ZONE="europe-west4-a"
NODE_40_ZONE="asia-east1-b"
NODE_41_ZONE="us-west1-b"
NODE_42_ZONE="asia-southeast1-b"
NODE_43_ZONE="us-central1-a"
NODE_44_ZONE="europe-west4-a"
NODE_45_ZONE="asia-east1-b"
NODE_46_ZONE="us-west1-b"
NODE_47_ZONE="asia-southeast1-b"
NODE_48_ZONE="us-central1-a"
NODE_49_ZONE="europe-west4-a"
NODE_50_ZONE="asia-east1-b"
NODE_51_ZONE="us-west1-b"
NODE_52_ZONE="asia-southeast1-b"
NODE_53_ZONE="us-central1-a"
NODE_54_ZONE="europe-west4-a"
NODE_55_ZONE="asia-east1-b"
NODE_56_ZONE="us-west1-b"
NODE_57_ZONE="asia-southeast1-b"
NODE_58_ZONE="us-central1-a"
NODE_59_ZONE="europe-west4-a"
NODE_60_ZONE="asia-east1-b"
NODE_61_ZONE="us-west1-b"
NODE_62_ZONE="asia-southeast1-b"
NODE_63_ZONE="us-central1-a"
NODE_64_ZONE="europe-west4-a"
NODE_65_ZONE="asia-east1-b"
NODE_66_ZONE="us-west1-b"
NODE_67_ZONE="asia-southeast1-b"
NODE_68_ZONE="us-central1-a"
NODE_69_ZONE="europe-west4-a"
NODE_70_ZONE="asia-east1-b"
NODE_71_ZONE="us-west1-b"
NODE_72_ZONE="asia-southeast1-b"
NODE_73_ZONE="us-central1-a"
NODE_74_ZONE="europe-west4-a"
NODE_75_ZONE="asia-east1-b"
NODE_76_ZONE="us-west1-b"
NODE_77_ZONE="asia-southeast1-b"
NODE_78_ZONE="us-central1-a"
NODE_79_ZONE="europe-west4-a"
NODE_80_ZONE="asia-east1-b"
NODE_81_ZONE="us-west1-b"
NODE_82_ZONE="asia-southeast1-b"
NODE_83_ZONE="us-central1-a"
NODE_84_ZONE="europe-west4-a"
NODE_85_ZONE="asia-east1-b"
NODE_86_ZONE="us-west1-b"
NODE_87_ZONE="asia-southeast1-b"
NODE_88_ZONE="us-central1-a"
NODE_89_ZONE="europe-west4-a"
NODE_90_ZONE="asia-east1-b"
NODE_91_ZONE="us-west1-b"
NODE_92_ZONE="asia-southeast1-b"
NODE_93_ZONE="us-central1-a"
NODE_94_ZONE="europe-west4-a"
NODE_95_ZONE="asia-east1-b"
NODE_96_ZONE="us-west1-b"
NODE_97_ZONE="asia-southeast1-b"
NODE_98_ZONE="us-central1-a"
NODE_99_ZONE="europe-west4-a"

# deploy files
FILES_FOR_NODE="blockchain/ blockchain-configs/ block-pool/ client/ common/ consensus/ db/ event-handler/ json_rpc/ logger/ node/ p2p/ tools/ traffic/ tx-pool/ package.json setup_blockchain_ubuntu.sh start_node_genesis_gcp.sh start_node_incremental_gcp.sh wait_until_node_sync_gcp.sh"

# Work in progress spinner
spin="-\|/"

i=0
spinner() {
    i=$(( (i+1) %4 ))
    printf "\r${spin:$i:1}"
    sleep .1
}

if [[ $KILL_OPTION = "--skip-kill" ]]; then
    printf "\nSkipping process kill...\n"
else
    # kill any processes still alive
    printf "\nKilling all blockchain nodes...\n"
    index=$START_NODE_IDX
    while [ $index -le $END_NODE_IDX ]
    do
        NODE_TARGET_ADDR=NODE_${index}_TARGET_ADDR
        NODE_ZONE=NODE_${index}_ZONE

        KILL_NODE_CMD="gcloud compute ssh ${!NODE_TARGET_ADDR} --command 'sudo killall node' --project $PROJECT_ID --zone ${!NODE_ZONE}"
        # NOTE(minsulee2): Keep printf for extensibility experiment debugging purpose
        # printf "KILL_NODE_CMD=$KILL_NODE_CMD\n"
        if [[ $index < "$(($NUM_NODES - 1))" ]]; then
            eval $KILL_NODE_CMD &> /dev/null &
        else
            eval $KILL_NODE_CMD &> /dev/null
        fi
        ((index++))
        spinner
    done
    printf "Kill all processes done.\n\n";
fi

# If --kill-only, do not proceed any further
if [[ $KILL_OPTION = "--kill-only" ]]; then
    exit
fi

# deploy files to GCP instances
if [[ $RESET_RESTART_OPTION = "" ]]; then
    printf "\nDeploying parent blockchain...\n"
    index=$START_NODE_IDX
    while [ $index -le $END_NODE_IDX ]
    do
        NODE_TARGET_ADDR=NODE_${index}_TARGET_ADDR
        NODE_ZONE=NODE_${index}_ZONE

        DEPLOY_BLOCKCHAIN_CMD="gcloud compute scp --recurse $FILES_FOR_NODE ${!NODE_TARGET_ADDR}:~/ --project $PROJECT_ID --zone ${!NODE_ZONE}"
        # NOTE(minsulee2): Keep printf for extensibility experiment debugging purpose
        # printf "DEPLOY_BLOCKCHAIN_CMD=$DEPLOY_BLOCKCHAIN_CMD\n"
        if [[ $index < "$(($NUM_NODES - 1))" ]]; then
            eval $DEPLOY_BLOCKCHAIN_CMD &> /dev/null &
        else
            eval $DEPLOY_BLOCKCHAIN_CMD &> /dev/null
        fi
        ((index++))
        spinner
    done
    printf "Deploy files done.\n\n";
fi

# ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
if [[ $SETUP_OPTION = "--setup" ]]; then
    printf "\n\n##########################\n# Setting up blockchain nodes #\n##########################\n"
    index=$START_NODE_IDX
    while [ $index -le $END_NODE_IDX ]
    do
        NODE_TARGET_ADDR=NODE_${index}_TARGET_ADDR
        NODE_ZONE=NODE_${index}_ZONE

        SETUP_BLOCKCHAIN_CMD="gcloud compute ssh ${!NODE_TARGET_ADDR} --command '. setup_blockchain_ubuntu.sh' --project $PROJECT_ID --zone ${!NODE_ZONE}"
        # NOTE(minsulee2): Keep printf for extensibility experiment debugging purpose
        # printf "SETUP_BLOCKCHAIN_CMD=$SETUP_BLOCKCHAIN_CMD\n"
        if [[ $index < "$(($NUM_NODES - 1))" ]]; then
            eval $SETUP_BLOCKCHAIN_CMD &> /dev/null &
        else
            eval $SETUP_BLOCKCHAIN_CMD &> /dev/null
        fi
        ((index++))
        spinner
    done
    printf "Setting up blockchain nodes done.\n\n";
fi

printf "\nStarting blockchain servers...\n\n"
if [[ $RESET_RESTART_OPTION = "--reset" ]]; then
    # restart after removing chains, snapshots, and log files
    CHAINS_DIR=/home/ain_blockchain_data/chains
    SNAPSHOTS_DIR=/home/ain_blockchain_data/snapshots
    START_NODE_CMD_BASE="sudo rm -rf $CHAINS_DIR $SNAPSHOTS_DIR && cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && . start_node_genesis_gcp.sh"
    KEEP_CODE_OPTION="--keep-code"
elif [[ $RESET_RESTART_OPTION = "--restart" ]]; then
    # restart
    START_NODE_CMD_BASE="cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && . start_node_genesis_gcp.sh"
    KEEP_CODE_OPTION="--keep-code"
else
    # start
    START_NODE_CMD_BASE=". start_node_genesis_gcp.sh"
    KEEP_CODE_OPTION=""
fi
printf "\n"
printf "START_NODE_CMD_BASE=$START_NODE_CMD_BASE\n"
printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"

node_index=$START_NODE_IDX
while [ $node_index -le $END_NODE_IDX ]
do
    printf "\n\n##########################\n# Starting parent node $node_index #\n##########################\n\n"
    if [[ $node_index -gt 4 ]]; then
        JSON_RPC_OPTION="--json-rpc"
        REST_FUNC_OPTION="--rest-func"
    else
        JSON_RPC_OPTION=""
        REST_FUNC_OPTION=""
    fi
    NODE_TARGET_ADDR=NODE_${node_index}_TARGET_ADDR
    NODE_ZONE=NODE_${node_index}_ZONE

    printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
    printf "JSON_RPC_OPTION=$JSON_RPC_OPTION\n"
    printf "REST_FUNC_OPTION=$REST_FUNC_OPTION\n"

    printf "\n"
    START_NODE_CMD="gcloud compute ssh ${!NODE_TARGET_ADDR} --command '$START_NODE_CMD_BASE $SEASON 0 $node_index $KEEP_CODE_OPTION $JSON_RPC_OPTION $REST_FUNC_OPTION' --project $PROJECT_ID --zone ${!NODE_ZONE}"
    # NOTE(minsulee2): Keep printf for extensibility experiment debugging purpose
    # printf "START_NODE_CMD=$START_NODE_CMD\n"
    eval $START_NODE_CMD
    ((node_index++))
    sleep 30
done
