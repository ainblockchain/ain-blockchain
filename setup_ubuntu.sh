#!/bin/sh

echo 'Installing nodejs..'
sudo apt update
curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
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

