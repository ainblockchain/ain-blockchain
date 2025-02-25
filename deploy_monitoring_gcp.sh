#!/bin/bash

function usage() {
    printf "Usage: bash deploy_monitoring_gcp.sh [dev|staging|sandbox|exp|spring|summer|mainnet] [gcp|onprem} [--setup]\n"
    printf "Example: bash deploy_monitoring_gcp.sh staging gcp \n"
    printf "Example: bash deploy_monitoring_gcp.sh staging gcp --setup\n"
    printf "Example: bash deploy_monitoring_gcp.sh staging onprem \n"
    printf "Example: bash deploy_monitoring_gcp.sh staging onprem --setup\n"
    printf "\n"
    exit
}

if [[ $# -lt 2 ]] || [[ $# -gt 3 ]]; then
    usage
fi

printf "\n[[[[[ deploy_monitoring_gcp.sh ]]]]]\n\n"

if [[ "$1" = 'dev' ]] || [[ "$1" = 'staging' ]] || [[ "$1" = 'sandbox' ]] || [[ "$1" = 'exp' ]] || [[ "$1" = 'spring' ]] || [[ "$1" = 'summer' ]] || [[ "$1" = 'mainnet' ]]; then
    SEASON="$1"
    if [[ "$1" = 'mainnet' ]]; then
        PROJECT_ID="mainnet-prod-ground"
    elif [[ "$1" = 'spring' ]] || [[ "$1" = 'summer' ]]; then
        PROJECT_ID="testnet-prod-ground"
    else
        PROJECT_ID="testnet-$1-ground"
    fi
else
    printf "Invalid <Season> argument: $1\n"
    exit
fi
printf "SEASON=$SEASON\n"
printf "PROJECT_ID=$PROJECT_ID\n"

if [[ "$2" = 'gcp' ]] || [[ "$2" = 'onprem' ]]; then
    BLOCKCHAIN_HOSTING="$2"
else
    printf "Invalid blockchain hosting argument: $2\n"
    exit
fi
printf "BLOCKCHAIN_HOSTING=$BLOCKCHAIN_HOSTING\n"

OPTIONS="$3"
printf "OPTIONS=$OPTIONS\n"

GCP_USER="runner"
printf "GCP_USER=$GCP_USER\n"

# Get confirmation.
printf "\n"
read -p "Do you want to proceed for $SEASON? [y/N]: " -n 1 -r
printf "\n\n"
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
fi

FILES_FOR_MONITORING="monitoring/ setup_monitoring_gcp.sh setup_monitoring_ubuntu.sh start_monitoring_gcp.sh"

MONITORING_TARGET_ADDR="${GCP_USER}@${SEASON}-monitoring-taiwan"
MONITORING_ZONE="asia-east1-b"

# kill any processes still alive
gcloud compute ssh $MONITORING_TARGET_ADDR --command "sudo killall prometheus" --project $PROJECT_ID --zone $MONITORING_ZONE
gcloud compute ssh $MONITORING_TARGET_ADDR --command "sudo killall grafana-server" --project $PROJECT_ID --zone $MONITORING_ZONE

# deploy files to GCP instances
printf "\nDeploying monitoring..."
printf "\nDeploying files to ${MONITORING_TARGET_ADDR}..."
gcloud compute ssh ${MONITORING_TARGET_ADDR} --command "sudo rm -rf ~/ain-blockchain; sudo mkdir ~/ain-blockchain; sudo chmod -R 777 ~/ain-blockchain" --project $PROJECT_ID --zone $MONITORING_ZONE
gcloud compute scp --recurse $FILES_FOR_MONITORING ${MONITORING_TARGET_ADDR}:~/ain-blockchain/ --project $PROJECT_ID --zone $MONITORING_ZONE

# ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
if [[ $OPTIONS = "--setup" ]]; then
    printf "\n\n##########################\n# Setting up monitoring #\n###########################\n\n"
    gcloud compute ssh $MONITORING_TARGET_ADDR --command "cd ./ain-blockchain; . setup_monitoring_ubuntu.sh" --project $PROJECT_ID
fi

# ssh into each instance, install packages and start up the server
printf "\n\n############################\n# Running monitoring #\n############################\n\n"
gcloud compute ssh $MONITORING_TARGET_ADDR --command "cd ./ain-blockchain; . setup_monitoring_gcp.sh $SEASON $GCP_USER $BLOCKCHAIN_HOSTING && . start_monitoring_gcp.sh" --project $PROJECT_ID --zone $MONITORING_ZONE
