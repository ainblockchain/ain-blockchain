#!/bin/sh
cd
sudo rm -rf ../ain-blockchain
sudo mkdir ../ain-blockchain
sudo chmod 777 ../ain-blockchain
mv * ../ain-blockchain
cd ../ain-blockchain
npm install
# TODO(lia): create blockchain/shard_{i}/genesis_* files if needed