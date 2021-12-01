#!/bin/bash

printf "\n[[[[[ setup_monitoring_ubuntu.sh ]]]]]\n\n"

printf 'Installing NodeJS..\n'
sudo apt update
curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
sudo apt install -y nodejs

printf 'node -v\n'
node -v

printf 'npm --version\n'
npm --version


printf 'Installing yarn..\n'
sudo npm install -g yarn

printf 'yarn --version\n'
sudo yarn --version


printf 'Installing make..\n'
sudo apt update
sudo apt-get install -y build-essential

printf 'make --version\n'
make --version


printf 'Installing vim..\n'
sudo apt update
sudo apt install -y vim

printf 'vim --version\n'
vim --version


printf 'Installing apt-transport-https..\n'
sudo apt-get install -y apt-transport-https


printf 'Installing wget..\n'
sudo apt-get install -y software-properties-common wget

printf 'wget --version\n'
wget --version


printf 'Installing Grafana..\n'
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -

echo "deb https://packages.grafana.com/oss/deb stable main" | sudo tee -a /etc/apt/sources.list.d/grafana.list

sudo apt-get update
sudo apt-get install -y grafana