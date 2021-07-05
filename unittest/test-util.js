const path = require('path');
const fs = require("fs");
const syncRequest = require('sync-request');
const { Block } = require('../blockchain/block');
const { CURRENT_PROTOCOL_VERSION, StateVersions } = require('../common/constants');
const CommonUtil = require('../common/common-util');

function readConfigFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw Error('Missing config file: ' + filePath);
  }
  return JSON.parse(fs.readFileSync(filePath));
}

function setNodeForTesting(
    node, accountIndex = 0, skipTestingConfig = false, skipShardingConfig = true) {
  node.setAccountForTesting(accountIndex);

  node.init(true);

  if (!skipTestingConfig) {
    const ownersFile = path.resolve(__dirname, './data/owners_for_testing.json');
    if (!fs.existsSync(ownersFile)) {
      throw Error('Missing owners file: ' + ownersFile);
    }
    const owners = readConfigFile(ownersFile);
    node.db.setOwnersForTesting("/apps/test", owners);

    const rulesFile = path.resolve(__dirname, './data/rules_for_testing.json');
    if (!fs.existsSync(rulesFile)) {
      throw Error('Missing rules file: ' + rulesFile);
    }
    const rules = readConfigFile(rulesFile);
    node.db.setRulesForTesting("/apps/test", rules);

    const functionsFile = path.resolve(__dirname, './data/functions_for_testing.json');
    if (!fs.existsSync(functionsFile)) {
      throw Error('Missing functions file: ' + functionsFile);
    }
    const functions = JSON.parse(fs.readFileSync(functionsFile));
    node.db.setFunctionsForTesting("/apps/test", functions);
  }
  if (!skipShardingConfig) {
    const shardingFile = path.resolve(__dirname, './data/sharding_for_testing.json');
    if (!fs.existsSync(shardingFile)) {
      throw Error('Missing sharding file: ' + shardingFile);
    }
    const sharding = JSON.parse(fs.readFileSync(shardingFile));
    node.db.setShardingForTesting(sharding);
  }
}

function getTransaction(node, inputTxBody) {
  const txBody = JSON.parse(JSON.stringify(inputTxBody));
  return node.createTransaction(txBody);
}

function addBlock(node, txs, votes, validators) {
  const lastBlock = node.bc.lastBlock();
  const finalDb = node.createDb(node.stateManager.getFinalVersion(),
      `${StateVersions.FINAL}:${lastBlock.number + 1}`, node.bc, node.tp, true);
  finalDb.executeTransactionList(votes);
  finalDb.executeTransactionList(txs, lastBlock.number + 1);
  node.syncDbAndNonce(`${StateVersions.NODE}:${lastBlock.number + 1}`);
  node.addNewBlock(Block.create(
      lastBlock.hash, votes, txs, lastBlock.number + 1, lastBlock.epoch + 1, '',
      node.account.address, validators, 0, 0));
}

async function waitUntilTxFinalized(servers, txHash) {
  const MAX_ITERATION = 200;
  let iterCount = 0;
  const unchecked = new Set(servers);
  while (true) {
    if (!unchecked.size) {
      return true;
    }
    if (iterCount >= MAX_ITERATION) {
      console.log(`Iteration count exceeded its limit before the given tx ${txHash} is finalized!`);
      return false;
    }
    for (const server of unchecked) {
      const txStatus = parseOrLog(syncRequest('GET', server + `/get_transaction?hash=${txHash}`)
          .body
          .toString('utf-8')).result;
      if (txStatus && txStatus.is_finalized === true) {
        unchecked.delete(server);
      }
    }
    await CommonUtil.sleep(200);
    iterCount++;
  }
}

async function waitForNewBlocks(server, waitFor = 1) {
  const initialLastBlockNumber =
      parseOrLog(syncRequest('GET', server + '/last_block_number')
        .body.toString('utf-8'))['result'];
  let updatedLastBlockNumber = initialLastBlockNumber;
  while (updatedLastBlockNumber < initialLastBlockNumber + waitFor) {
    await CommonUtil.sleep(1000);
    updatedLastBlockNumber = parseOrLog(syncRequest('GET', server + '/last_block_number')
      .body.toString('utf-8'))['result'];
  }
}

async function waitUntilNodeSyncs(server) {
  let isSyncing = true;
  while (isSyncing) {
    isSyncing = parseOrLog(syncRequest('POST', server + '/json-rpc',
        {json: {jsonrpc: '2.0', method: 'net_syncing', id: 0,
                params: {protoVer: CURRENT_PROTOCOL_VERSION}}})
        .body.toString('utf-8')).result.result;
    await CommonUtil.sleep(1000);
  }
}

function parseOrLog(resp) {
  const parsed = CommonUtil.parseJsonOrNull(resp);
  if (parsed === null) {
    console.log(`Not in JSON format: ${resp}`);
  }
  return parsed;
}

async function setUpApp(appName, serverList, appConfig) {
  const signingAddr = parseOrLog(syncRequest(
    'GET', serverList[0] + '/get_address').body.toString('utf-8')).result;
  const appStakingRes = parseOrLog(syncRequest('POST', serverList[0] + '/set_value', {
    json: {
      ref: `/staking/${appName}/${signingAddr}/0/stake/${Date.now()}/value`,
      value: 1
    }
  }).body.toString('utf-8')).result;
  if (!(await waitUntilTxFinalized(serverList, appStakingRes.tx_hash))) {
    console.log(`setUpTestApp(): Failed to check finalization of app staking tx.`);
  }

  const createAppRes = parseOrLog(syncRequest('POST', serverList[0] + '/set_value', {
    json: {
      ref: `/manage_app/${appName}/create/${Date.now()}`,
      value: appConfig
    }
  }).body.toString('utf-8')).result;
  if (!(await waitUntilTxFinalized(serverList, createAppRes.tx_hash))) {
    console.log(`setUpTestApp(): Failed to check finalization of create app tx.`)
  }
}

module.exports = {
  readConfigFile,
  setNodeForTesting,
  getTransaction,
  addBlock,
  waitUntilTxFinalized,
  waitForNewBlocks,
  waitUntilNodeSyncs,
  parseOrLog,
  setUpApp,
};
