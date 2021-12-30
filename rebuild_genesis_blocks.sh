#!/bin/bash

printf "\n[[[[[ rebuild_genesis_blocks.sh ]]]]]\n\n"

printf "\n[[[ Removing existing block files... ]]]\n\n"
rm blockchain-configs/1-node/genesis_block.json.gz
rm blockchain-configs/2-nodes/genesis_block.json.gz
rm blockchain-configs/3-nodes/genesis_block.json.gz
rm blockchain-configs/afan-shard/genesis_block.json.gz
rm blockchain-configs/base/genesis_block.json.gz
rm blockchain-configs/he-shard/genesis_block.json.gz
rm blockchain-configs/sim-shard/genesis_block.json.gz
rm blockchain-configs/testnet-dev/genesis_block.json.gz
rm blockchain-configs/testnet-staging/genesis_block.json.gz
rm blockchain-configs/testnet-sandbox/genesis_block.json.gz
rm blockchain-configs/testnet-prod/genesis_block.json.gz

printf "\n[[[ Rebuilding block files... ]]]\n\n"

printf "\n[ blockchain-configs/1-node... ]\n\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/1-node \
  node tools/genesis-file/createGenesisBlock.js

printf "\n[ blockchain-configs/2-nodes... ]\n\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/2-nodes \
  node tools/genesis-file/createGenesisBlock.js

printf "\n[ blockchain-configs/3-nodes... ]\n\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/3-nodes \
  node tools/genesis-file/createGenesisBlock.js

printf "\n[ blockchain-configs/afan-shard... ]\n\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard \
  node tools/genesis-file/createGenesisBlock.js

printf "\n[ blockchain-configs/base... ]\n\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/base \
  node tools/genesis-file/createGenesisBlock.js

printf "\n[ blockchain-configs/he-shard... ]\n\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/he-shard \
  node tools/genesis-file/createGenesisBlock.js

printf "\n[ blockchain-configs/sim-shard... ]\n\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/sim-shard \
  node tools/genesis-file/createGenesisBlock.js

printf "\n[ blockchain-configs/testnet-dev... ]\n\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-dev \
  BLOCKCHAIN_DATA_DIR=./ain_blockchain_data \
  node tools/genesis-file/createGenesisBlock.js

printf "\n[ blockchain-configs/testnet-staging... ]\n\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-staging \
  BLOCKCHAIN_DATA_DIR=./ain_blockchain_data \
  node tools/genesis-file/createGenesisBlock.js

printf "\n[ blockchain-configs/testnet-sandbox... ]\n\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-sandbox \
  BLOCKCHAIN_DATA_DIR=./ain_blockchain_data \
  node tools/genesis-file/createGenesisBlock.js

printf "\n[ blockchain-configs/testnet-prod... ]\n\n"
BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-prod \
  BLOCKCHAIN_DATA_DIR=./ain_blockchain_data \
  node tools/genesis-file/createGenesisBlock.js
