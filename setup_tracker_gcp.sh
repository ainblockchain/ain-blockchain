#!/bin/sh

echo 'Killing jobs..'
killall node


echo 'Setting up working directory..'
cd
sudo rm -rf ../ain-blockchain
sudo mkdir ../ain-blockchain
sudo chmod 777 ../ain-blockchain
mv * ../ain-blockchain
cd ../ain-blockchain


echo 'Installing node modules..'
npm install
