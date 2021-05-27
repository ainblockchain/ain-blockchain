#!/bin/sh

echo 'Killing jobs..'
killall node


echo 'Setting up working directory..'
cd
sudo rm -rf /home/ain_blockchain_data
sudo mkdir /home/ain_blockchain_data
sudo chmod 777 /home/ain_blockchain_data
sudo rm -rf ../ain-blockchain*
sudo mkdir ../ain-blockchain
sudo chmod 777 ../ain-blockchain
mv * ../ain-blockchain
cd ../ain-blockchain


echo 'Installing node modules..'
npm install
