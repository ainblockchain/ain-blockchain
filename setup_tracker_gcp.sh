#!/bin/sh
cd
killall node
sudo rm -rf ../ain-blockchain
sudo mkdir ../ain-blockchain
sudo chmod 777 ../ain-blockchain
mv * ../ain-blockchain
cd ../ain-blockchain
npm install
cd ./tracker-server
npm install
cd ..
