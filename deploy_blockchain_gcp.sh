#!/bin/sh

if [ "$#" -lt 3 ]; then
    echo "Usage: sh deploy_blockchain_gcp.sh dev lia 0"
    exit
fi

if [ "$1" = 'spring' ] || [ "$1" = 'summer' ] || [ "$1" = 'dev' ] || [ "$1" = 'staging' ]; then
    SEASON="$1"
    if [ "$1" = 'spring' ] || [ "$1" = 'summer' ]; then
        PROJECT_ID="testnet-prod-ground"
    else
        PROJECT_ID="testnet-$1-ground"
    fi
else
    echo "Invalid project/season argument: $1"
    exit
fi
echo "SEASON=$SEASON"
echo "PROJECT_ID=$PROJECT_ID"

GCP_USER="$2"
echo "GCP_USER=$GCP_USER"

FILES_FOR_TRACKER="blockchain/ client/ common/ consensus/ db/ genesis-configs/ logger/ tracker-server/ package.json setup_tracker_gcp.sh setup_blockchain_ubuntu.sh start_tracker_gcp.sh"
FILES_FOR_NODE="blockchain/ client/ common/ consensus/ db/ json_rpc/ genesis-configs/ logger/ node/ tx-pool/ p2p/ package.json setup_node_gcp.sh setup_blockchain_ubuntu.sh start_node_gcp.sh"

printf "\nRemoving redundant files..."
rm -rf blockchain/blockchains logger/logs tracker-server/node_modules tracker-server/logs

TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-tracker-taiwan"
NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-node-0-taiwan"
NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-node-1-oregon"
NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-node-2-singapore"
NODE_3_TARGET_ADDR="${GCP_USER}@${SEASON}-node-3-iowa"
NODE_4_TARGET_ADDR="${GCP_USER}@${SEASON}-node-4-netherlands"

# kill any processes still alive
gcloud compute ssh $TRACKER_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID
gcloud compute ssh $NODE_0_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID
gcloud compute ssh $NODE_1_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID
gcloud compute ssh $NODE_2_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID
gcloud compute ssh $NODE_3_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID
gcloud compute ssh $NODE_4_TARGET_ADDR --command "sudo killall node" --project $PROJECT_ID

if [ "$3" -gt 0 ]; then
    for i in $(seq $3)
        do
            echo "shard #$i"

            SHARD_TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-tracker-taiwan"
            SHARD_NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-0-taiwan"
            SHARD_NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-1-oregon"
            SHARD_NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-2-singapore"

            gcloud compute ssh $SHARD_TRACKER_TARGET_ADDR --command "killall node" --project $PROJECT_ID
            gcloud compute ssh $SHARD_NODE_0_TARGET_ADDR --command "killall node" --project $PROJECT_ID
            gcloud compute ssh $SHARD_NODE_1_TARGET_ADDR --command "killall node" --project $PROJECT_ID
            gcloud compute ssh $SHARD_NODE_2_TARGET_ADDR --command "killall node" --project $PROJECT_ID
        done
fi

# deploy files to GCP instances
printf "\nDeploying parent blockchain..."
printf "\nDeploying files to ${TRACKER_TARGET_ADDR}..."
gcloud compute scp --recurse $FILES_FOR_TRACKER ${TRACKER_TARGET_ADDR}:~/ --project $PROJECT_ID
printf "\nDeploying files to ${NODE_0_TARGET_ADDR}..."
gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_0_TARGET_ADDR}:~/ --project $PROJECT_ID
printf "\nDeploying files to ${NODE_1_TARGET_ADDR}..."
gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_1_TARGET_ADDR}:~/ --project $PROJECT_ID
printf "\nDeploying files to ${NODE_2_TARGET_ADDR}..."
gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_2_TARGET_ADDR}:~/ --project $PROJECT_ID
printf "\nDeploying files to ${NODE_3_TARGET_ADDR}..."
gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_3_TARGET_ADDR}:~/ --project $PROJECT_ID
printf "\nDeploying files to ${NODE_4_TARGET_ADDR}..."
gcloud compute scp --recurse $FILES_FOR_NODE ${NODE_4_TARGET_ADDR}:~/ --project $PROJECT_ID

# ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
# printf "\n\n##########################\n# Setting up parent tracker #\n###########################\n\n"
# gcloud compute ssh $TRACKER_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID
# printf "\n\n##########################\n# Setting up parent node 0 #\n##########################\n\n"
# gcloud compute ssh $NODE_0_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID
# printf "\n\n##########################\n# Setting up parent node 1 #\n##########################\n\n"
# gcloud compute ssh $NODE_1_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID
# printf "\n\n##########################\n# Setting up parent node 2 #\n##########################\n\n"
# gcloud compute ssh $NODE_2_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID
# printf "\n\n##########################\n# Setting up parent node 3 #\n##########################\n\n"
# gcloud compute ssh $NODE_3_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID
# printf "\n\n##########################\n# Setting up parent node 4 #\n##########################\n\n"
# gcloud compute ssh $NODE_4_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID

# ssh into each instance, install packages and start up the server
printf "\n\n############################\n# Running parent tracker #\n############################\n\n"
gcloud compute ssh $TRACKER_TARGET_ADDR --command ". setup_tracker_gcp.sh && . start_tracker_gcp.sh" --project $PROJECT_ID
printf "\n\n###########################\n# Running parent node 0 #\n###########################\n\n"
gcloud compute ssh $NODE_0_TARGET_ADDR --command ". setup_node_gcp.sh && . start_node_gcp.sh $SEASON 0 0" --project $PROJECT_ID
printf "\n\n#########################\n# Running parent node 1 #\n#########################\n\n"
gcloud compute ssh $NODE_1_TARGET_ADDR --command ". setup_node_gcp.sh && . start_node_gcp.sh $SEASON 0 1" --project $PROJECT_ID
printf "\n\n#########################\n# Running parent node 2 #\n#########################\n\n"
gcloud compute ssh $NODE_2_TARGET_ADDR --command ". setup_node_gcp.sh && . start_node_gcp.sh $SEASON 0 2" --project $PROJECT_ID
printf "\n\n#########################\n# Running parent node 3 #\n#########################\n\n"
gcloud compute ssh $NODE_3_TARGET_ADDR --command ". setup_node_gcp.sh && . start_node_gcp.sh $SEASON 0 3" --project $PROJECT_ID
printf "\n\n#########################\n# Running parent node 4 #\n#########################\n\n"
gcloud compute ssh $NODE_4_TARGET_ADDR --command ". setup_node_gcp.sh && . start_node_gcp.sh $SEASON 0 4" --project $PROJECT_ID

printf "\nDeploying shard blockchains..."
if [ "$3" -gt 0 ]; then
    for i in $(seq $3)
        do
            echo "shard #$i"

            # generate genesis config files in ./blockchain/shard_$i
            node ./tools/generateShardGenesisFiles.js $SEASON 10 $i

            SHARD_TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-tracker-taiwan"
            SHARD_NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-0-taiwan"
            SHARD_NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-1-oregon"
            SHARD_NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-2-singapore"

            # deploy files to GCP instances
            printf "\nDeploying files to ${SHARD_TRACKER_TARGET_ADDR}..."
            gcloud compute scp --recurse $FILES_FOR_TRACKER ${SHARD_TRACKER_TARGET_ADDR}:~/ --project $PROJECT_ID
            printf "\nDeploying files to ${SHARD_NODE_0_TARGET_ADDR}..."
            gcloud compute scp --recurse $FILES_FOR_NODE ${SHARD_NODE_0_TARGET_ADDR}:~/ --project $PROJECT_ID
            printf "\nDeploying files to ${SHARD_NODE_1_TARGET_ADDR}..."
            gcloud compute scp --recurse $FILES_FOR_NODE ${SHARD_NODE_1_TARGET_ADDR}:~/ --project $PROJECT_ID
            printf "\nDeploying files to ${SHARD_NODE_2_TARGET_ADDR}..."
            gcloud compute scp --recurse $FILES_FOR_NODE ${SHARD_NODE_2_TARGET_ADDR}:~/  --project $PROJECT_ID

             # ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
            # printf "\n\n###########################\n# Setting up shard_$i tracker #\n###########################\n\n"
            # gcloud compute ssh $SHARD_TRACKER_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID
            # printf "\n\n##########################\n# Setting up  shard_$i node 0 #\n##########################\n\n"
            # gcloud compute ssh $SHARD_NODE_0_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID
            # printf "\n\n##########################\n# Setting up  shard_$i node 1 #\n##########################\n\n"
            # gcloud compute ssh $SHARD_NODE_1_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID
            # printf "\n\n##########################\n# Setting up  shard_$i node 2 #\n##########################\n\n"
            # gcloud compute ssh $SHARD_NODE_2_TARGET_ADDR --command ". setup_blockchain_ubuntu.sh" --project $PROJECT_ID

            # ssh into each instance, install packages and start up the server
            printf "\n\n###########################\n# Running shard_$i tracker #\n###########################\n\n"
            gcloud compute ssh $SHARD_TRACKER_TARGET_ADDR --command ". setup_tracker_gcp.sh && . start_tracker_gcp.sh" --project $PROJECT_ID
            printf "\n\n##########################\n# Running shard_$i node 0 #\n##########################\n\n"
            gcloud compute ssh $SHARD_NODE_0_TARGET_ADDR --command ". setup_node_gcp.sh && . start_node_gcp.sh $SEASON $i 0" --project $PROJECT_ID
            printf "\n\n##########################\n# Running shard_$i node 1 #\n##########################\n\n"
            gcloud compute ssh $SHARD_NODE_1_TARGET_ADDR --command ". setup_node_gcp.sh && . start_node_gcp.sh $SEASON $i 1" --project $PROJECT_ID
            printf "\n\n##########################\n# Running shard_$i node 2 #\n##########################\n\n"
            gcloud compute ssh $SHARD_NODE_2_TARGET_ADDR --command ". setup_node_gcp.sh && . start_node_gcp.sh $SEASON $i 2" --project $PROJECT_ID
        done
fi
