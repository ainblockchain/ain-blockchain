#!/bin/bash

echo 'Installing NodeJS..'
sudo apt update
curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
sudo apt install -y nodejs

echo 'node -v'
node -v

echo 'npm --version'
npm --version


echo 'Installing make..'
sudo apt update
sudo apt-get install -y build-essential

echo 'make --version'
make --version


echo 'Installing vim..'
sudo apt update
sudo apt install -y vim

echo 'vim --version'
vim --version


echo 'Installing apt-transport-https..'
sudo apt-get install -y apt-transport-https


echo 'Installing wget..'
sudo apt-get install -y software-properties-common wget

echo 'wget --version'
wget --version


echo 'Installing Grafana..'
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -

echo "deb https://packages.grafana.com/oss/deb stable main" | sudo tee -a /etc/apt/sources.list.d/grafana.list

sudo apt-get update
sudo apt-get install -y grafana