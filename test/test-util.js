const path = require('path');
const fs = require("fs")
const Transaction = require('../db/transaction');

function setDbForTesting(bc, tp, db, accountIndex = 0, skipTestingConfig = false) {
  db.setAccountForTesting(accountIndex);

  bc.startWithGenesisBlock();
  db.startWithBlockchain(bc, tp);

  if (!skipTestingConfig) {
    const ownersFile = path.resolve(__dirname, './data/owners_for_testing.json');
    if (!fs.existsSync(ownersFile)) {
      throw Error('Missing owners file: ' + ownersFile);
    }
    const owners = JSON.parse(fs.readFileSync(ownersFile));
    db.setOwnersForTesting("test", owners);
    const rulesFile = path.resolve(__dirname, './data/rules_for_testing.json');
    if (!fs.existsSync(rulesFile)) {
      throw Error('Missing rules file: ' + rulesFile);
    }
    const rules = JSON.parse(fs.readFileSync(rulesFile));
    db.setRulesForTesting("test", rules);
  }
}

function getTransaction(db, txData) {
  txData.nonce = db.nonce;
  db.nonce++;
  return Transaction.newTransaction(db.account.private_key, txData);
}

module.exports = {
  setDbForTesting,
  getTransaction
};