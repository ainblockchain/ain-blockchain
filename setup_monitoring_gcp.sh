#!/bin/bash

function usage() {
    printf "Usage: bash setup_monitoring_gcp.sh [dev|staging|sandbox|exp|spring|summer|mainnet] <GCP Username> [gcp|onprem]\n"
    printf "Example: bash setup_monitoring_gcp.sh staging gcp_user gcp\n"
    printf "Example: bash setup_monitoring_gcp.sh staging gcp_user onprem\n"
    printf "\n"
    exit
}

if [[ $# -lt 3 ]] || [[ $# -gt 3 ]]; then
    usage
fi

printf "\n[[[[[ setup_monitoring_gcp.sh ]]]]]\n\n"

if [[ "$1" != 'dev' ]] && [[ "$1" != 'staging' ]] && [[ "$1" != 'sandbox' ]] && [[ "$1" != 'exp' ]] && [[ "$1" != 'spring' ]] && [[ "$1" != 'summer' ]] && [[ "$1" != 'mainnet' ]]; then
    printf "Invalid <Season> argument: $1\n"
    exit
fi
if [[ "$3" != 'gcp' ]] && [[ "$3" != 'onprem' ]]; then
    printf "Invalid blockchain hosting argument: $3\n"
    exit
fi

SEASON="$1"
GCP_USER="$2"
BLOCKCHAIN_HOSTING="$3"
printf "SEASON=$SEASON\n"
printf "GCP_USER=$GCP_USER\n"
printf "BLOCKCHAIN_HOSTING=$BLOCKCHAIN_HOSTING\n"
printf "\n"

printf 'Killing old jobs..\n'
killall prometheus
killall grafana-server


printf 'Setting up working directory..\n'
sudo rm -rf /home/ain-blockchain
cd ~
sudo mv ain-blockchain /home
sudo chmod -R 777 /home/ain-blockchain
sudo chown -R $GCP_USER:$GCP_USER /home/ain-blockchain
cd /home/ain-blockchain

printf 'Installing Prometheus..\n'
curl -s https://api.github.com/repos/prometheus/prometheus/releases/latest \
  | grep browser_download_url \
  | grep linux-amd64 \
  | cut -d '"' -f 4 \
  | wget -qi -

tar xvf prometheus*.tar.gz

printf 'Renaming Prometheus folder..\n'
mv prometheus*/ prometheus


printf 'Copying Prometheus yml file..\n'
PROMETHEUS_CONFIG_FILE="prometheus-${SEASON}-${BLOCKCHAIN_HOSTING}.yml"
printf "PROMETHEUS_CONFIG_FILE=${PROMETHEUS_CONFIG_FILE}\n"
cp -f monitoring/${PROMETHEUS_CONFIG_FILE} prometheus/prometheus.yml
