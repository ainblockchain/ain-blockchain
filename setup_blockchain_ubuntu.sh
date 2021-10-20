#!/bin/bash

echo 'Upgrading apt..'
sudo apt update
# skip prompting (see https://serverfault.com/questions/527789/how-to-automate-changed-config-files-during-apt-get-upgrade-in-ubuntu-12)
apt-get --yes --force-yes -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade

echo 'Installing NodeJS..'
sudo apt update
sudo apt -y install curl dirmngr apt-transport-https lsb-release ca-certificates
curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
sudo apt -y install nodejs

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

echo 'Installing jq..'
sudo apt update
sudo apt install -y jq

echo 'jq --version'
jq --version