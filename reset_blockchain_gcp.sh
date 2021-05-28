#!/bin/sh

if [ "$#" -lt 3 ]; then
    echo "Usage: sh reset_blockchain_gcp.sh dev lia 0"
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

TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-tracker-taiwan"
NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-node-0-taiwan"
NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-node-1-oregon"
NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-node-2-singapore"
NODE_3_TARGET_ADDR="${GCP_USER}@${SEASON}-node-3-iowa"
NODE_4_TARGET_ADDR="${GCP_USER}@${SEASON}-node-4-netherlands"

printf "\nStopping parent blockchain..."
gcloud compute ssh $TRACKER_TARGET_ADDR --command "killall node" --project $PROJECT_ID
gcloud compute ssh $NODE_0_TARGET_ADDR --command "killall node" --project $PROJECT_ID
gcloud compute ssh $NODE_1_TARGET_ADDR --command "killall node" --project $PROJECT_ID
gcloud compute ssh $NODE_2_TARGET_ADDR --command "killall node" --project $PROJECT_ID
gcloud compute ssh $NODE_3_TARGET_ADDR --command "killall node" --project $PROJECT_ID
gcloud compute ssh $NODE_4_TARGET_ADDR --command "killall node" --project $PROJECT_ID

printf "\nStopping shard blockchains..."
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

# ssh into each instance, clean up, and start running the nodes
printf "\n\n############################\n# Running parent tracker #\n############################\n\n"
gcloud compute ssh $TRACKER_TARGET_ADDR --command "cd ../ain-blockchain && sudo rm -rf ./logs/ && sudo rm -rf /home/ain_blockchain_data/ && . start_tracker_gcp.sh" --project $PROJECT_ID
printf "\n\n###########################\n# Running parent node 0 #\n###########################\n\n"
gcloud compute ssh $NODE_0_TARGET_ADDR --command "cd ../ain-blockchain && sudo rm -rf ./logs/ && sudo rm -rf /home/ain_blockchain_data/ && . start_node_gcp.sh $SEASON 0 0" --project $PROJECT_ID
sleep 3
printf "\n\n#########################\n# Running parent node 1 #\n#########################\n\n"
gcloud compute ssh $NODE_1_TARGET_ADDR --command "cd ../ain-blockchain && sudo rm -rf ./logs/ && sudo rm -rf /home/ain_blockchain_data/ && . start_node_gcp.sh $SEASON 0 1" --project $PROJECT_ID
printf "\n\n#########################\n# Running parent node 2 #\n#########################\n\n"
gcloud compute ssh $NODE_2_TARGET_ADDR --command "cd ../ain-blockchain && sudo rm -rf ./logs/ && sudo rm -rf /home/ain_blockchain_data/ && . start_node_gcp.sh $SEASON 0 2" --project $PROJECT_ID
printf "\n\n#########################\n# Running parent node 3 #\n#########################\n\n"
gcloud compute ssh $NODE_3_TARGET_ADDR --command "cd ../ain-blockchain && sudo rm -rf ./logs/ && sudo rm -rf /home/ain_blockchain_data/ && . start_node_gcp.sh $SEASON 0 3" --project $PROJECT_ID
printf "\n\n#########################\n# Running parent node 4 #\n#########################\n\n"
gcloud compute ssh $NODE_4_TARGET_ADDR --command "cd ../ain-blockchain && sudo rm -rf ./logs/ && sudo rm -rf /home/ain_blockchain_data/ && . start_node_gcp.sh $SEASON 0 4" --project $PROJECT_ID

sleep 10

if [ "$3" -gt 0 ]; then
    for i in $(seq $3)
        do
            echo "shard #$i"
            sleep 3

            SHARD_TRACKER_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-tracker-taiwan"
            SHARD_NODE_0_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-0-taiwan"
            SHARD_NODE_1_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-1-oregon"
            SHARD_NODE_2_TARGET_ADDR="${GCP_USER}@${SEASON}-shard-${i}-node-2-singapore"

            # ssh into each instance, clean up, and start running the nodes
            printf "\n\n###########################\n# Running shard_$i tracker #\n###########################\n\n"
            gcloud compute ssh $SHARD_TRACKER_TARGET_ADDR --command "cd ../ain-blockchain && sudo rm -rf ./logs/ && sudo rm -rf /home/ain_blockchain_data/ && . start_tracker_gcp.sh" --project $PROJECT_ID
            printf "\n\n##########################\n# Running shard_$i node 0 #\n##########################\n\n"
            gcloud compute ssh $SHARD_NODE_0_TARGET_ADDR --command "cd ../ain-blockchain && sudo rm -rf ./logs/ && sudo rm -rf /home/ain_blockchain_data/ && . start_node_gcp.sh $SEASON $i 0" --project $PROJECT_ID
            sleep 3
            printf "\n\n##########################\n# Running shard_$i node 1 #\n##########################\n\n"
            gcloud compute ssh $SHARD_NODE_1_TARGET_ADDR --command "cd ../ain-blockchain && sudo rm -rf ./logs/ && sudo rm -rf /home/ain_blockchain_data/ && . start_node_gcp.sh $SEASON $i 1" --project $PROJECT_ID
            printf "\n\n##########################\n# Running shard_$i node 2 #\n##########################\n\n"
            gcloud compute ssh $SHARD_NODE_2_TARGET_ADDR --command "cd ../ain-blockchain && sudo rm -rf ./logs/ && sudo rm -rf /home/ain_blockchain_data/ && . start_node_gcp.sh $SEASON $i 2" --project $PROJECT_ID
        done
fi