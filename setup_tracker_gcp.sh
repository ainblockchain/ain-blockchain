#!/bin/sh
cd
sudo rm -rf ../ain-blockchain
sudo mkdir ../ain-blockchain
sudo chmod 777 ../ain-blockchain
mv * ../ain-blockchain
cd ../ain-blockchain/tracker-server
npm install
cd ..
