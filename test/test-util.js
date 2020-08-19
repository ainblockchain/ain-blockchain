const path = require('path');
const fs = require("fs");
const syncRequest = require('sync-request');
const sleep = require('system-sleep');
const Transaction = require('../tx-pool/transaction');
const { Block } = require('../blockchain/block');
const { PredefinedDbPaths, GenesisAccounts } = require('../constants');
const { ConsensusDbPaths } = require('../consensus/constants');

function setDbForTesting(node, accountIndex = 0, skipTestingConfig = false) {
  node.setAccountForTesting(accountIndex);

  node.init(true);

  if (!skipTestingConfig) {
    const ownersFile = path.resolve(__dirname, './data/owners_for_testing.json');
    if (!fs.existsSync(ownersFile)) {
      throw Error('Missing owners file: ' + ownersFile);
    }
    const owners = JSON.parse(fs.readFileSync(ownersFile));
    node.db.setOwnersForTesting("test", owners);
    const rulesFile = path.resolve(__dirname, './data/rules_for_testing.json');
    if (!fs.existsSync(rulesFile)) {
      throw Error('Missing rules file: ' + rulesFile);
    }
    const rules = JSON.parse(fs.readFileSync(rulesFile));
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

function addShardingOwners(owners) {
  delete owners[PredefinedDbPaths.SHARDING];
}

function addConsensusOwners(owners) {
  const ownerAddress = GenesisAccounts.owner.address;
  if (!owners[ConsensusDbPaths.CONSENSUS]) {
    owners[ConsensusDbPaths.CONSENSUS] = {};
  }
  owners[ConsensusDbPaths.CONSENSUS][ConsensusDbPaths.WHITELIST]
      = Block.getConsensusOwner(ownerAddress);
}

function addConsensusRules(rules) {
  const ownerAddress = GenesisAccounts.owner.address;
  if (!rules[ConsensusDbPaths.CONSENSUS]) {
    rules[ConsensusDbPaths.CONSENSUS] = {};
  }
  rules[ConsensusDbPaths.CONSENSUS][ConsensusDbPaths.WHITELIST]
      = Block.getConsensusRule(ownerAddress);
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
  setDbForTesting,
  getTransaction,
  addBlock,
  addShardingOwners,
  addConsensusOwners,
  addConsensusRules,
  waitUntilTxFinalized
};