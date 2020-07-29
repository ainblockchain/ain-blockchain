#!/bin/sh

if [ "$#" -lt 2 ]; then
    echo "Usage: sh deploy_cloud.sh dev lia"
    exit
fi

if [ "$1" = 'spring' ] || [ "$1" = 'summer' ] || [ "$1" = 'dev' ] || [ "$1" = 'staging' ]; then
    SEASON="$1"
else
    echo "Invalid project/season argument: $1"
    exit
fi
echo "SEASON=$SEASON"

GCP_USER="$2"
echo "GCP_USER=$GCP_USER"

FILES_FOR_TRACKER="setup_tracker_gcp.sh setup_ubuntu.sh start_tracker_gcp.sh tracker-server/"
FILES_FOR_NODE="blockchain/ chain-util.js client/ consensus/ constants.js db json_rpc logger/ node/ package.json server/ setup_node_gcp.sh setup_ubuntu.sh start_node_gcp.sh tx-pool/"

printf "\nRemoving redundant files..."
rm -rf blockchain/blockchains logger/logs tracker-server/node_modules tracker-server/logs

TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-tracker-taiwan"
printf "\nDeploying files to ${TRACKER_TARGET_ADDR}..."
gcloud compute scp --recurse $FILES_FOR_TRACKER ${TRACKER_TARGET_ADDR}:~/

NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-node-0-taiwan"
printf "\nDeploying files to ${NODE_0_TARGET_ADDR}..."
gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_0_TARGET_ADDR}:~/

NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-node-1-oregon"
printf "\nDeploying files to ${NODE_1_TARGET_ADDR}..."
gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_1_TARGET_ADDR}:~/

NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-node-2-singapore"
printf "\nDeploying files to ${NODE_2_TARGET_ADDR}..."
gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_2_TARGET_ADDR}:~/

NODE_3_TARGET_ADDR="${GCP_USER}@${SEASON}-node-3-iowa"
printf "\nDeploying files to ${NODE_3_TARGET_ADDR}..."
gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_3_TARGET_ADDR}:~/

NODE_4_TARGET_ADDR="${GCP_USER}@${SEASON}-node-4-netherlands"
printf "\nDeploying files to ${NODE_4_TARGET_ADDR}..."
gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_4_TARGET_ADDR}:~/
