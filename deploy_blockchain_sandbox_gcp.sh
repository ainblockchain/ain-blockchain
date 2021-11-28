#!/bin/bash

if [[ $# -lt 1 ]] || [[ $# -gt 4 ]]; then
    printf "Usage: bash deploy_blockchain_sandbox_gcp.sh <GCP Username> [--setup] [--restart|--reset]\n"
    printf "Example: bash deploy_blockchain_sandbox_gcp.sh lia --setup\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ deploy_blockchain_sandbox_gcp.sh ]]]]]\n\n"

SEASON=sandbox
PROJECT_ID=testnet-$SEASON-ground
printf "SEASON=$SEASON\n"
printf "PROJECT_ID=$PROJECT_ID\n"

GCP_USER="$1"
printf "GCP_USER=$GCP_USER\n"

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
    else
        printf "Invalid options: $option\n"
        exit
    fi
}

# Parse options.
SETUP_OPTION=""
RESET_RESTART_OPTION=""

ARG_INDEX=4
while [ $ARG_INDEX -le $# ]
do
  parse_options "${!ARG_INDEX}"
  ((ARG_INDEX++))
done
printf "SETUP_OPTION=$SETUP_OPTION\n"
printf "RESET_RESTART_OPTION=$RESET_RESTART_OPTION\n"


# Get confirmation.
printf "\n"
read -p "Do you want to proceed? >> (y/N) " -n 1 -r
printf "\n\n"
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
fi

# deploy files
FILES_FOR_NODE="blockchain/ block-pool/ client/ common/ consensus/ db/ blockchain-configs/ json_rpc/ logger/ node/ p2p/ tools/ traffic/ tx-pool/ package.json setup_blockchain_ubuntu.sh start_node_genesis_gcp.sh start_node_incremental_gcp.sh wait_until_node_sync_gcp.sh"

# GCP node address
NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-node-0-taiwan"
NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-node-1-oregon"
NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-node-2-singapore"
NODE_3_TARGET_ADDR="${GCP_USER}@${SEASON}-node-3-iowa"
NODE_4_TARGET_ADDR="${GCP_USER}@${SEASON}-node-4-netherlands"
NODE_5_TARGET_ADDR="${GCP_USER}@${SEASON}-node-5-taiwan"
NODE_6_TARGET_ADDR="${GCP_USER}@${SEASON}-node-6-oregon"
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
NODE_ZONE_ASIA_EAST1_B="asia-east1-b"
NODE_ZONE_US_WEST1_B="us-west1-b"
NODE_ZONE_ASIA_SOUTHEAST1_b="asia-southeast1-b"
NODE_ZONE_US_CENTRAL1_A="us-central1-a"
NODE_ZONE_EUROPE_WEST4_A="europe-west4-a"

# kill any processes still alive
printf "\nKilling all blockchain nodes...\n"
gcloud compute ssh $NODE_0_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_1_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_2_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_3_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_4_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_5_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_6_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_7_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_8_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_9_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_10_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_11_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_12_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_13_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_14_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_15_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_16_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_17_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_18_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_19_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_20_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_21_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_22_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_23_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_24_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_25_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_26_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_27_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_28_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_29_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_30_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_31_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_32_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_33_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_34_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_35_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_36_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_37_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_38_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_39_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_40_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_41_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_42_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_43_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_44_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_45_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_46_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_47_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_48_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_49_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_50_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_51_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_52_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_53_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_54_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_55_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_56_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_57_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_58_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_59_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_60_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_61_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_62_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_63_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_64_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_65_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_66_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_67_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_68_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_69_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_70_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_71_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_72_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_73_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_74_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_75_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_76_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_77_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_78_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_79_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_80_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_81_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_82_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_83_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_84_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_85_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_86_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_87_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_88_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_89_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_90_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_91_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_92_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_93_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_94_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
# gcloud compute ssh $NODE_95_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
# gcloud compute ssh $NODE_96_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
# gcloud compute ssh $NODE_97_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
# gcloud compute ssh $NODE_98_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
# gcloud compute ssh $NODE_99_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null
printf "Kill all processes done.\n\n";

# deploy files to GCP instances
if [[ $RESET_RESTART_OPTION = "" ]]; then
    printf "\nDeploying parent blockchain...\n"
    gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_0_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_1_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_2_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_3_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_4_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_5_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_6_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_7_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_8_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_9_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_10_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_11_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_12_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_13_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_14_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_15_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_16_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_17_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_18_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_19_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_20_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_21_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_22_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_23_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_24_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_25_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_26_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_27_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_28_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_29_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_30_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_31_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_32_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_33_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_34_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_35_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_36_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_37_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_38_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_39_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_40_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_41_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_42_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_43_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_44_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_45_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_46_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_47_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_48_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_49_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_50_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_51_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_52_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_53_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_54_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_55_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_56_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_57_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_58_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_59_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_60_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_61_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_62_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_63_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_64_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_65_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_66_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_67_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_68_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_69_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_70_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_71_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_72_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_73_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_74_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_75_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_76_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_77_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_78_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_79_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_80_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_81_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_82_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_83_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_84_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_85_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_86_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_87_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_88_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_89_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_90_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_91_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_92_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_93_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_94_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_95_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_96_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_97_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_98_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A &> /dev/null &
    # gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_99_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A &> /dev/null
fi
printf "Deploy files done.\n\n";

# ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
if [[ $SETUP_OPTION = "--setup" ]]; then
    printf "\n\n##########################\n# Setting up blockchain nodes #\n##########################\n"
    gcloud compute ssh $NODE_0_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_1_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_2_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_3_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_4_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_5_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_6_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_7_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_8_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_9_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_10_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_11_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_12_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_13_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_14_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_15_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_16_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_17_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_18_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_19_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_20_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_21_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_22_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_23_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_24_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_25_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_26_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_27_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_28_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_29_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_30_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_31_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_32_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_33_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_34_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_35_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_36_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_37_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_38_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_39_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_40_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_41_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_42_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_43_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_44_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_45_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_46_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_47_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_48_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_49_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_50_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_51_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_52_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_53_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_54_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_55_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_56_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_57_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_58_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_59_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_60_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_61_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_62_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_63_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_64_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_65_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_66_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_67_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_68_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_69_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_70_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_71_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_72_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_73_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_74_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_75_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_76_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_77_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_78_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_79_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_80_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_81_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_82_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_83_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_84_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_85_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_86_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_87_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_88_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_89_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_90_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_91_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_92_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_93_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_94_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
    # gcloud compute ssh $NODE_95_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_EAST1_B
    # gcloud compute ssh $NODE_96_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_WEST1_B
    # gcloud compute ssh $NODE_97_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_ASIA_SOUTHEAST1_b
    # gcloud compute ssh $NODE_98_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_US_CENTRAL1_A
    # gcloud compute ssh $NODE_99_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID --zone $NODE_ZONE_EUROPE_WEST4_A
fi
printf "Setting up blockchain nodes done.\n\n";

# printf "\nStarting blockchain servers...\n\n"
# if [[ $RESET_RESTART_OPTION = "--reset" ]]; then
#     # restart after removing chains, snapshots, and log files
#     CHAINS_DIR=/home/ain_blockchain_data/chains
#     SNAPSHOTS_DIR=/home/ain_blockchain_data/snapshots
#     START_TRACKER_CMD_BASE="sudo rm -rf /home/ain_blockchain_data/ && cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && sudo rm -rf ./logs/ && . start_tracker_genesis_gcp.sh"
#     START_NODE_CMD_BASE="sudo rm -rf $CHAINS_DIR $SNAPSHOTS_DIR && cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && sudo rm -rf ./logs/ && . start_node_genesis_gcp.sh"
#     KEEP_CODE_OPTION="--keep-code"
# elif [[ $RESET_RESTART_OPTION = "--restart" ]]; then
#     # restart
#     START_TRACKER_CMD_BASE="cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && . start_tracker_genesis_gcp.sh"
#     START_NODE_CMD_BASE="cd \$(find /home/ain-blockchain* -maxdepth 0 -type d) && . start_node_genesis_gcp.sh"
#     KEEP_CODE_OPTION="--keep-code"
# else
#     # start
#     START_TRACKER_CMD_BASE=". start_tracker_genesis_gcp.sh"
#     START_NODE_CMD_BASE=". start_node_genesis_gcp.sh"
#     KEEP_CODE_OPTION=""
# fi
# printf "\n"
# printf "START_TRACKER_CMD_BASE=$START_TRACKER_CMD_BASE\n"
# printf "START_NODE_CMD_BASE=$START_NODE_CMD_BASE\n"
# printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"

# NUM_NODES=7
# index=0
# while [ $index -lt $NUM_NODES ]
# do
#     printf "\n\n##########################\n# Starting parent node $index #\n##########################\n\n"
#     if [[ $index -gt 4 ]]; then
#         JSON_RPC_OPTION="--json-rpc"
#         REST_FUNC_OPTION="--rest-func"
#     else
#         JSON_RPC_OPTION=""
#         REST_FUNC_OPTION=""
#     fi
#     NODE_TARGET_ADDR=NODE_${index}_TARGET_ADDR
#     NODE_ZONE=NODE_${index}_ZONE

#     printf "KEEP_CODE_OPTION=$KEEP_CODE_OPTION\n"
#     printf "ACCOUNT_INJECTION_OPTION=$ACCOUNT_INJECTION_OPTION\n"
#     printf "JSON_RPC_OPTION=$JSON_RPC_OPTION\n"
#     printf "REST_FUNC_OPTION=$REST_FUNC_OPTION\n"

#     printf "\n"
#     START_NODE_CMD="gcloud compute ssh ${!NODE_TARGET_ADDR} --command '$START_NODE_CMD_BASE $SEASON 0 $index $KEEP_CODE_OPTION $ACCOUNT_INJECTION_OPTION $JSON_RPC_OPTION $REST_FUNC_OPTION' --project $PROJECT_ID --zone ${!NODE_ZONE}"
#     printf "START_NODE_CMD=$START_NODE_CMD\n"
#     eval $START_NODE_CMD
#     inject_account "$index"
#     ((index++))
# done
