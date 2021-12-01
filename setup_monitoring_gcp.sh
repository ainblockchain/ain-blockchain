#!/bin/bash

if [[ "$#" -lt 1 ]]; then
    printf "Usage: bash setup_monitoring_gcp.sh [dev|staging|sandbox|spring|summer]\n"
    printf "Example: bash setup_monitoring_gcp.sh dev\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ setup_monitoring_gcp.sh ]]]]]\n\n"

if [[ "$1" != 'spring' ]] && [[ "$1" != 'summer' ]] && [[ "$1" != 'dev' ]] && [[ "$1" != 'staging' ]] && [[ "$1" != 'sandbox' ]]; then
    printf "Invalid season argument: $1\n"
    exit
fi

SEASON="$1"


printf 'Killing old jobs..\n'
killall prometheus
killall grafana-server


printf 'Setting up working directory..\n'
cd
sudo rm -rf ../ain-blockchain
sudo mkdir ../ain-blockchain
sudo chmod 777 ../ain-blockchain
mv * ../ain-blockchain
cd ../ain-blockchain


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
PROMETHEUS_CONFIG_FILE="prometheus-${SEASON}.yml"
printf "PROMETHEUS_CONFIG_FILE=${PROMETHEUS_CONFIG_FILE}\n"
cp -f monitoring/${PROMETHEUS_CONFIG_FILE} prometheus/prometheus.yml
