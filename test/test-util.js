const path = require('path');
const fs = require("fs");
const _ = require("lodash");
const syncRequest = require('sync-request');
const { Block } = require('../blockchain/block');
const DB = require('../db');
const {
  BlockchainConsts,
  StateVersions,
  ValueChangedEventSources,
} = require('../common/constants');
const CommonUtil = require('../common/common-util');
const { JSON_RPC_METHODS } = require('../json_rpc/constants');

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

async function setNodeForTesting(
    node, accountIndex = 0, skipTestingConfig = false, skipShardingConfig = true) {
  const accountsFile = path.resolve(__dirname, './data/accounts_for_testing.json');
  if (!fs.existsSync(accountsFile)) {
    throw Error('Missing accounts file: ' + accountsFile);
  }
  const accounts = readConfigFile(accountsFile);
  node.setAccountForTesting(accounts.others[accountIndex]);

  await node.startNode(true);

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
  const blockNumber = lastBlock.number + 1;
  const finalDb = DB.create(
      node.stateManager.getFinalVersion(), node.stateManager.createUniqueVersionName(StateVersions.FINAL),
      node.bc, true, lastBlock.number, node.stateManager, node.eh);
  finalDb.executeTransactionList(votes, true, false, blockNumber, lastBlock.timestamp, ValueChangedEventSources.BLOCK);
  finalDb.executeTransactionList(txs, false, true, blockNumber, lastBlock.timestamp, ValueChangedEventSources.BLOCK);
  finalDb.applyBandagesForBlockNumber(blockNumber);
  node.cloneAndFinalizeVersion(finalDb.stateVersion, blockNumber);
  const receipts = txsToDummyReceipts(txs);
  node.bc.addBlockToChain(Block.create(
      lastBlock.hash, votes, {}, txs, receipts, blockNumber, lastBlock.epoch + 1, '',
      node.account.address, validators, 0, 0));
}

async function waitUntilTxFinalized(servers, txHash, maxIteration = 100) {
  const SLEEP_TIME_MS = 1000;

  let iterCount = 0;
  const unchecked = new Set(servers);
  while (true) {
    if (!unchecked.size) {
      return true;
    }
    if (iterCount >= maxIteration) {
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

function getLatestReportedBlockNumber(parentServer, shardingPath) {
  return parseOrLog(syncRequest(
    'GET', parentServer + `/get_value?ref=${shardingPath}/.shard/latest_block_number`)
  .body.toString('utf-8')).result;
}

async function waitForNewShardingReports(parentServer, shardingPath) {
  const latestBefore = getLatestReportedBlockNumber(parentServer, shardingPath);
  let updatedLastBlockNumber = latestBefore;
  while (updatedLastBlockNumber <= latestBefore) {
    await CommonUtil.sleep(1000);
    updatedLastBlockNumber = getLatestReportedBlockNumber(parentServer, shardingPath);
  }
}

async function waitUntilNetworkIsReady(serverList, maxIteration = 40) {
  let iterCount = 0;
  const unchecked = new Set(serverList);
  while (true) {
    if (!unchecked.size) {
      return true;
    }
    if (iterCount >= maxIteration) {
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
          {
            json: {
              jsonrpc: '2.0', method: JSON_RPC_METHODS.NET_SYNCING, id: 0,
              params: { protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION }
            }
          })
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

async function setUpApp(appName, serverList, appConfig, maxIteration = 100) {
  const signingAddr = parseOrLog(syncRequest(
    'GET', serverList[0] + '/get_address').body.toString('utf-8')).result;
  const appStakingRes = parseOrLog(syncRequest('POST', serverList[0] + '/set_value', {
    json: {
      ref: `/staking/${appName}/${signingAddr}/0/stake/${Date.now()}/value`,
      value: 1
    }
  }).body.toString('utf-8')).result;
  if (!(await waitUntilTxFinalized(serverList, appStakingRes.tx_hash, maxIteration))) {
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

function eraseTxCreatedAt(tx) {
  const erased = JSON.parse(JSON.stringify(tx));
  _.set(erased, 'extra.created_at', 'erased');
  return erased;
}

function eraseEvalResMatched(res) {
  const erased = JSON.parse(JSON.stringify(res));
  _.set(erased, 'matched', 'erased');
  return erased;
}

function eraseSubtreeFuncResFuncPromises(res) {
  const erased = JSON.parse(JSON.stringify(res));
  for (const subtreeFuncPath in res) {
    const subtreeFuncPathRes = res[subtreeFuncPath];
    for (const subtreeValuePath in subtreeFuncPathRes) {
      _.set(erased, `${subtreeFuncPath}.${subtreeValuePath}.func_promises`, 'erased');
    }
  }
  return erased;
}

module.exports = {
  GET_OPTIONS_INCLUDE_ALL,
  readConfigFile,
  setNodeForTesting,
  getTransaction,
  txsToDummyReceipts,
  addBlock,
  waitUntilTxFinalized,
  waitForNewBlocks,
  waitForNewShardingReports,
  waitUntilNetworkIsReady,
  waitUntilNodeSyncs,
  parseOrLog,
  setUpApp,
  getLastBlock,
  getLastBlockNumber,
  getBlockByNumber,
  eraseStateGas,
  eraseTxCreatedAt,
  eraseEvalResMatched,
  eraseSubtreeFuncResFuncPromises,
};
