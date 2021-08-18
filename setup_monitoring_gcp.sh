#!/bin/bash

if [[ "$#" -lt 1 ]]; then
    echo "Usage: bash setup_monitoring_gcp.sh [dev|staging|spring|summer]"
    echo "Example: bash setup_monitoring_gcp.sh dev"
    exit
fi

if [[ "$1" != 'spring' ]] && [[ "$1" != 'summer' ]] && [[ "$1" != 'dev' ]] && [[ "$1" != 'staging' ]]; then
    echo "Invalid season argument: $1"
    exit
fi

SEASON="$1"


echo 'Killing old jobs..'
killall prometheus
killall grafana-server


echo 'Setting up working directory..'
cd
sudo rm -rf ../ain-blockchain
sudo mkdir ../ain-blockchain
sudo chmod 777 ../ain-blockchain
mv * ../ain-blockchain
cd ../ain-blockchain


echo 'Installing Prometheus..'
curl -s https://api.github.com/repos/prometheus/prometheus/releases/latest \
  | grep browser_download_url \
  | grep linux-amd64 \
  | cut -d '"' -f 4 \
  | wget -qi -

tar xvf prometheus*.tar.gz

echo 'Renaming Prometheus folder..'
mv prometheus*/ prometheus


echo 'Copying Prometheus yml file..'
PROMETHEUS_CONFIG_FILE="prometheus-${SEASON}.yml"
echo "PROMETHEUS_CONFIG_FILE=${PROMETHEUS_CONFIG_FILE}"
cp -f monitoring/${PROMETHEUS_CONFIG_FILE} prometheus/prometheus.yml
