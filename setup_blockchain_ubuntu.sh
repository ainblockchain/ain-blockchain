#!/bin/bash

printf "\n[[[[[ setup_blockchain_ubuntu.sh ]]]]]\n\n"

printf 'Upgrading apt..\n'
sudo apt update
# skip prompting (see https://serverfault.com/questions/527789/how-to-automate-changed-config-files-during-apt-get-upgrade-in-ubuntu-12)
apt-get --yes --force-yes -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade

printf 'Installing NodeJS..\n'
sudo apt update
sudo apt -y install curl dirmngr apt-transport-https lsb-release ca-certificates
curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt -y install nodejs

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

printf 'Installing jq..\n'
sudo apt update
sudo apt install -y jq

printf 'jq --version\n'
jq --version