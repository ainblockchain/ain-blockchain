#!/bin/sh
cd
sudo rm -rf ../blockchain-database
sudo mkdir ../blockchain-database
sudo chmod 777 ../blockchain-database
mv * ../blockchain-database
cd ../blockchain-database/tracker-server
npm install
cd ..
