#!/bin/bash

if [[ "$#" -lt 2 ]]; then
    echo "Usage: bash deploy_monitoring_gcp.sh [dev|staging|spring|summer] <GCP Username>  [--setup]"
    echo "Example: bash deploy_monitoring_gcp.sh dev seo"
    exit
fi

if [[ "$1" = 'spring' ]] || [[ "$1" = 'summer' ]] || [[ "$1" = 'dev' ]] || [[ "$1" = 'staging' ]]; then
    SEASON="$1"
    if [[ "$1" = 'spring' ]] || [[ "$1" = 'summer' ]]; then
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

OPTIONS="$3"
echo "OPTIONS=$OPTIONS"

# Get confirmation.
echo
read -p "Do you want to proceed? >> (y/N) " -n 1 -r
echo
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
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
gcloud compute scp --recurse $FILES_FOR_MONITORING ${MONITORING_TARGET_ADDR}:~/ --project $PROJECT_ID --zone $MONITORING_ZONE

# ssh into each instance, set up the ubuntu VM instance (ONLY NEEDED FOR THE FIRST TIME)
if [[ $OPTIONS = "--setup" ]]; then
    printf "\n\n##########################\n# Setting up monitoring #\n###########################\n\n"
    gcloud compute ssh $MONITORING_TARGET_ADDR --command ". setup_monitoring_ubuntu.sh" --project $PROJECT_ID
fi

# ssh into each instance, install packages and start up the server
printf "\n\n############################\n# Running monitoring #\n############################\n\n"
gcloud compute ssh $MONITORING_TARGET_ADDR --command ". setup_monitoring_gcp.sh ${SEASON} && . start_monitoring_gcp.sh" --project $PROJECT_ID --zone $MONITORING_ZONE
