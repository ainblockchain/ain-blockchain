#!/bin/bash

printf "\n[[[[[ setup_blockchain_ubuntu_gcp.sh ]]]]]\n\n"

printf '\n[[ Upgrading apt.. ]]\n'
sudo apt update
# skip prompting (see https://serverfault.com/questions/527789/how-to-automate-changed-config-files-during-apt-get-upgrade-in-ubuntu-12)
sudo apt-get --yes -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade

printf '\n[[ Uninstalling NodeJS.. ]]\n'
sudo apt-get -y purge nodejs
sudo apt-get -y autoremove

printf '\n[[ Installing NodeJS.. ]]\n'
sudo apt update
sudo apt -y install curl dirmngr apt-transport-https lsb-release ca-certificates
curl -sL https://deb.nodesource.com/setup_20.x | sudo -E bash -
# skip prompting for daemon restart (see https://askubuntu.com/questions/1367139/apt-get-upgrade-auto-restart-services)
sudo NEEDRESTART_MODE=a apt -y install nodejs

printf 'node -v\n'
node -v

printf 'npm --version\n'
npm --version


printf '\n[[ Installing yarn.. ]]\n'
sudo npm install -g yarn

printf 'yarn --version\n'
sudo yarn --version


printf '\n[[ Installing make.. ]]\n'
sudo apt update
# skip prompting for daemon restart (see https://askubuntu.com/questions/1367139/apt-get-upgrade-auto-restart-services)
sudo NEEDRESTART_MODE=a apt-get install -y build-essential

printf 'make --version\n'
make --version


printf '\n[[ Installing vim.. ]]\n'
sudo apt update
sudo apt install -y vim

printf 'vim --version\n'
vim --version

printf '\n[[ Installing jq.. ]]\n'
sudo apt update
sudo apt install -y jq

printf 'jq --version\n'
jq --version