const path = require('path');
const fs = require("fs");
const _ = require("lodash");
const syncRequest = require('sync-request');
const { Block } = require('../blockchain/block');
const DB = require('../db');
const { CURRENT_PROTOCOL_VERSION, StateVersions } = require('../common/constants');
const CommonUtil = require('../common/common-util');

const GET_OPTIONS_INCLUDE_ALL = {
  includeTreeInfo: true,
  includeProof: true,
  includeVersion: true,
};

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

function txsToDummyReceipts(txs) {
  return new Array(txs.length).fill({ code: 0, gas_amount_charged: 0, gas_cost_total: 0 });
}

function addBlock(node, txs, votes, validators) {
  const lastBlock = node.bc.lastBlock();
  const finalDb = DB.create(
      node.stateManager.getFinalVersion(), `${StateVersions.FINAL}:${lastBlock.number + 1}`,
      node.bc, true, lastBlock.number, node.stateManager);
  finalDb.executeTransactionList(votes, true);
  finalDb.executeTransactionList(txs, false, true, lastBlock.number + 1);
  node.syncDbAndNonce(`${StateVersions.NODE}:${lastBlock.number + 1}`);
  const receipts = txsToDummyReceipts(txs);
  node.addNewBlock(Block.create(
      lastBlock.hash, votes, {}, txs, receipts, lastBlock.number + 1, lastBlock.epoch + 1, '',
      node.account.address, validators, 0, 0));
}

async function waitUntilTxFinalized(servers, txHash) {
  const MAX_ITERATION = 100;
  const SLEEP_TIME_MS = 1000;
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
    await CommonUtil.sleep(SLEEP_TIME_MS);
    iterCount++;
  }
}

async function waitForNewBlocks(server, waitFor = 1) {
  const initialLastBlockNumber = getLastBlockNumber(server);
  let updatedLastBlockNumber = initialLastBlockNumber;
  while (updatedLastBlockNumber < initialLastBlockNumber + waitFor) {
    await CommonUtil.sleep(1000);
    updatedLastBlockNumber = getLastBlockNumber(server);
  }
}

async function waitUntilNetworkIsReady(serverList) {
  const MAX_ITERATION = 40;
  let iterCount = 0;
  const unchecked = new Set(serverList);
  while (true) {
    if (!unchecked.size) {
      return true;
    }
    if (iterCount >= MAX_ITERATION) {
      console.log(`Iteration count exceeded its limit before the network is ready (${JSON.stringify([...unchecked])})`);
      return false;
    }
    for (const server of unchecked) {
      try {
        const healthCheck = parseOrLog(syncRequest('GET', server + '/health_check')
            .body
            .toString('utf-8'));
        if (healthCheck === true) {
          unchecked.delete(server);
        }
      } catch (e) {
        // server may not be ready yet
      }
    }
    await CommonUtil.sleep(3000);
    iterCount++;
  }
}

async function waitUntilNodeSyncs(server) {
  let isSyncing = true;
  while (isSyncing) {
    try {
      isSyncing = parseOrLog(syncRequest('POST', server + '/json-rpc',
          {json: {jsonrpc: '2.0', method: 'net_syncing', id: 0,
                  params: {protoVer: CURRENT_PROTOCOL_VERSION}}})
          .body.toString('utf-8')).result.result;
    } catch (e) {
      // server may not be ready yet
    }
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
    console.log(`setUpApp(): Failed to check finalization of app staking tx.`);
  }

  const createAppRes = parseOrLog(syncRequest('POST', serverList[0] + '/set_value', {
    json: {
      ref: `/manage_app/${appName}/create/${Date.now()}`,
      value: appConfig
    }
  }).body.toString('utf-8')).result;
  if (!(await waitUntilTxFinalized(serverList, createAppRes.tx_hash))) {
    console.log(`setUpApp(): Failed to check finalization of create app tx.`)
  }
}

function getLastBlock(server) {
  return parseOrLog(syncRequest('GET', server + '/last_block').body.toString('utf-8')).result;
}

function getLastBlockNumber(server) {
  return parseOrLog(syncRequest('GET', server + '/last_block_number').body.toString('utf-8')).result;
}

function getBlockByNumber(server, number) {
  return parseOrLog(syncRequest('GET', server + `/get_block_by_number?number=${number}`)
      .body.toString('utf-8')).result;
}

function eraseStateGas(result) {
  const erased = JSON.parse(JSON.stringify(result));
  _.set(erased, 'gas_amount_charged', 'erased');
  _.set(erased, 'gas_amount_total.state.service', 'erased');
  const stateApp = _.get(erased, 'gas_amount_total.state.app', {});
  for (const appName of Object.keys(stateApp)) {
    _.set(erased, `gas_amount_total.state.app.${appName}`, 'erased');
  }
  return erased;
}

module.exports = {
  GET_OPTIONS_INCLUDE_ALL,
  readConfigFile,
  setNodeForTesting,
  getTransaction,
  addBlock,
  waitUntilTxFinalized,
  waitForNewBlocks,
  waitUntilNetworkIsReady,
  waitUntilNodeSyncs,
  parseOrLog,
  setUpApp,
  getLastBlock,
  getLastBlockNumber,
  getBlockByNumber,
  eraseStateGas,
  txsToDummyReceipts,
};
