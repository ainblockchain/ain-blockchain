const path = require('path');
const fs = require("fs");
const syncRequest = require('sync-request');
const sleep = require('system-sleep');
const Transaction = require('../tx-pool/transaction');
const { Block } = require('../blockchain/block');

function readConfigFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw Error('Missing config file: ' + filePath);
  }
  return JSON.parse(fs.readFileSync(filePath));
}

function setDbForTesting(node, accountIndex = 0, skipTestingConfig = false) {
  node.setAccountForTesting(accountIndex);

  node.init(true);

  if (!skipTestingConfig) {
    const ownersFile = path.resolve(__dirname, './data/owners_for_testing.json');
    const owners = readConfigFile(ownersFile);
    node.db.setOwnersForTesting("test", owners);
    const rulesFile = path.resolve(__dirname, './data/rules_for_testing.json');
    const rules = readConfigFile(rulesFile);
    node.db.setRulesForTesting("test", rules);
  }
}

function getTransaction(node, txData) {
  txData.nonce = node.nonce;
  node.nonce++;
  return Transaction.newTransaction(node.account.private_key, txData);
}

function addBlock(node, txs, votes, validators) {
  const lastBlock = node.bc.lastBlock();
  node.addNewBlock(Block.createBlock(lastBlock.hash, votes, txs, lastBlock.number + 1,
    lastBlock.epoch + 1, node.account.address, validators));
}

function waitUntilTxFinalized(servers, txHash) {
  const unchecked = new Set(servers);
  while (true) {
    if (!unchecked.size) return;
    unchecked.forEach(server => {
      const txStatus = JSON.parse(
        syncRequest('GET', server + `/get_transaction?hash=${txHash}`)
        .body
        .toString('utf-8')
      )
      .result;
      if (txStatus && txStatus.is_confirmed === true) {
        unchecked.delete(server);
      }
    });
    sleep(1000);
  }
}

module.exports = {
  readConfigFile,
  setDbForTesting,
  getTransaction,
  addBlock,
  waitUntilTxFinalized
};