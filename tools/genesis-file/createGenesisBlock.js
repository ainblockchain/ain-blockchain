const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const _ = require('lodash');
const moment = require('moment');
const {
  BlockchainConfigs,
  PredefinedDbPaths,
  OwnerProperties,
  RuleProperties,
  AccountProperties,
  TokenProperties,
  ShardingProperties,
  ShardingProtocols,
  GenesisSharding,
  GenesisToken,
  StateVersions,
  getBlockchainConfig,
  buildOwnerPermissions,
} = require('../../common/constants');
const CommonUtil = require('../../common/common-util');
const FileUtil = require('../../common/file-util');
const PathUtil = require('../../common/path-util');
const Transaction = require('../../tx-pool/transaction');
const { Block } = require('../../blockchain/block');
const DB = require('../../db');
const StateNode = require('../../db/state-node');

let GenesisAccounts = {};

// Genesis DB & sharding config.

 function getRootOwner() {
  return {
    [PredefinedDbPaths.DOT_OWNER]: {
      [OwnerProperties.OWNERS]: {
        [GenesisAccounts.owner.address]: buildOwnerPermissions(true, true, true, true),
        [OwnerProperties.ANYONE]: buildOwnerPermissions(false, false, false, false),
      }
    }
  };
}

function getShardingOwner() {
  return {
    [PredefinedDbPaths.DOT_OWNER]: {
      [OwnerProperties.OWNERS]: {
        // shardOwner
        [GenesisAccounts.owner.address]: buildOwnerPermissions(false, true, true, true),
        // shardReporter
        [GenesisAccounts.others[0].address]: buildOwnerPermissions(false, true, true, true),
        [OwnerProperties.ANYONE]: buildOwnerPermissions(false, false, false, false),
      }
    }
  };
}

function getShardingRule() {
  const ownerAddress = GenesisAccounts.owner.address;
  const reporterAddress = GenesisAccounts.others[0].address;
  return {
    [PredefinedDbPaths.DOT_RULE]: {
      [RuleProperties.WRITE]: `auth.addr === '${ownerAddress}' || auth.addr === '${reporterAddress}'`
    }
  };
}

function getWhitelistOwner() {
  return {
    [PredefinedDbPaths.DOT_OWNER]: {
      [OwnerProperties.OWNERS]: {
        [GenesisAccounts.owner.address]: buildOwnerPermissions(false, true, true, true),
        [OwnerProperties.ANYONE]: buildOwnerPermissions(false, false, false, false),
      }
    }
  };
}

function getDevelopersValue() {
  const ownerAddress = GenesisAccounts.owner.address;
  const maxFunctionUrlsPerDeveloper = BlockchainConfigs.MAX_FUNCTION_URLS_PER_DEVELOPER;
  const defaultFunctionUrlWhitelist = {};
  BlockchainConfigs.DEFAULT_DEVELOPERS_URL_WHITELIST.forEach((url, index) => {
    defaultFunctionUrlWhitelist[index] = url;
  })
  return {
    [PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS]: {
      [PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS_PARAMS]: {
        [PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS_MAX_URLS_PER_DEVELOPER]: maxFunctionUrlsPerDeveloper
      },
      [PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS_USER_WHITELIST]: {
        [ownerAddress]: true
      },
      [PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS_URL_WHITELIST]: {
        [ownerAddress]: defaultFunctionUrlWhitelist
      }
    }
  };
}

function getDevelopersRule() {
  const ownerAddress = GenesisAccounts.owner.address;
  return {
    [PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS]: {
      [PredefinedDbPaths.DOT_RULE]: {
        [RuleProperties.WRITE]: `auth.addr === '${ownerAddress}'`
      },
      [PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS_URL_WHITELIST]: {
        '$user_addr': {
          '$key': {
            [PredefinedDbPaths.DOT_RULE]: {
              [RuleProperties.WRITE]: `auth.addr === '${ownerAddress}' || (auth.addr === $user_addr && util.validateRestFunctionsUrlWhitelistData(auth.addr, data, newData, getValue) === true)`
            }
          }
        }
      }
    }
  };
}

function getDevelopersOwner() {
  return {
    [PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS]: {
      [PredefinedDbPaths.DOT_OWNER]: {
        [OwnerProperties.OWNERS]: {
          [GenesisAccounts.owner.address]: buildOwnerPermissions(true, true, true, true)
        }
      }
    }
  };
}

function getGenesisValues() {
  const values = {};
  const ownerAddress = GenesisAccounts.owner.address;
  CommonUtil.setJsObject(values, [PredefinedDbPaths.TOKEN], GenesisToken);
  CommonUtil.setJsObject(
    values,
    [PredefinedDbPaths.ACCOUNTS, ownerAddress, PredefinedDbPaths.BALANCE],
    GenesisToken[TokenProperties.TOTAL_SUPPLY]
  );
  CommonUtil.setJsObject(
    values,
    [PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_CONFIG],
    GenesisSharding
  );
  CommonUtil.setJsObject(
    values,
    [PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_WHITELIST],
    BlockchainConfigs.GENESIS_WHITELIST
  );
  CommonUtil.setJsObject(
    values,
    [PredefinedDbPaths.DEVELOPERS],
    getDevelopersValue()
  );
  return values;
}

function getGenesisRules() {
  const rules = getBlockchainConfig('genesis_rules.json');
  if (GenesisSharding[ShardingProperties.SHARDING_PROTOCOL] !== ShardingProtocols.NONE) {
    CommonUtil.setJsObject(
      rules,
      [PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_CONFIG],
      getShardingRule()
    );
  }
  CommonUtil.setJsObject(
    rules,
    [PredefinedDbPaths.DEVELOPERS],
    getDevelopersRule()
  );
  return rules;
}

function getGenesisOwners() {
  const owners = getBlockchainConfig('genesis_owners.json');
  CommonUtil.setJsObject(
    owners,
    [],
    getRootOwner()
  );
  if (GenesisSharding[ShardingProperties.SHARDING_PROTOCOL] !== ShardingProtocols.NONE) {
    CommonUtil.setJsObject(
      owners,
      [PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_CONFIG],
      getShardingOwner()
    );
  }
  CommonUtil.setJsObject(
    owners,
    [PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_WHITELIST],
    getWhitelistOwner()
  );
  CommonUtil.setJsObject(
    owners,
    [PredefinedDbPaths.DEVELOPERS],
    getDevelopersOwner()
  );
  return owners;
}

// Genesis transactions.

function buildDbSetupTx() {
  const opList = [];

  // Values operation
  opList.push({
    type: 'SET_VALUE',
    ref: '/',
    value: getGenesisValues(),
  });

  // Functions operation
  opList.push({
    type: 'SET_FUNCTION',
    ref: '/',
    value: getBlockchainConfig('genesis_functions.json'),
  });

  // Rules operation
  opList.push({
    type: 'SET_RULE',
    ref: '/',
    value: getGenesisRules(),
  });

  // Owners operation
  opList.push({
    type: 'SET_OWNER',
    ref: '/',
    value: getGenesisOwners(),
  });

  // Transaction
  const txBody = {
    nonce: -1,
    timestamp: BlockchainConfigs.GENESIS_TIMESTAMP,
    gas_price: 1,
    operation: {
      type: 'SET',
      op_list: opList,
    }
  };
  const tx = Transaction.fromTxBody(txBody, GenesisAccounts.owner.private_key);
  if (!tx) {
    console.error(`Failed to build DB setup tx with tx body: ${JSON.stringify(txBody, null, 2)}`);
    process.exit(0);
  }
  return tx;
}

function buildAccountsSetupTx() {
  const transferOps = [];
  const otherAccounts = GenesisAccounts.others;
  if (!otherAccounts || !CommonUtil.isArray(otherAccounts) || otherAccounts.length === 0) {
    console.error(`Invalid genesis accounts: ${JSON.stringify(otherAccounts, null, 2)}`);
    process.exit(0);
  }
  if (!CommonUtil.isNumber(BlockchainConfigs.NUM_GENESIS_ACCOUNTS) ||
      BlockchainConfigs.NUM_GENESIS_ACCOUNTS <= 0 ||
      BlockchainConfigs.NUM_GENESIS_ACCOUNTS > otherAccounts.length) {
    console.error(`Invalid NUM_GENESIS_ACCOUNTS value: ${BlockchainConfigs.NUM_GENESIS_ACCOUNTS}`);
    process.exit(0);
  }
  for (let i = 0; i < BlockchainConfigs.NUM_GENESIS_ACCOUNTS; i++) {
    const accountAddress = otherAccounts[i].address;
    const accountBalance = otherAccounts[i].balance;
    if (!CommonUtil.isNumber(accountBalance) || accountBalance <= 0) {
      console.error(`Invalid genesis account balance: ${accountBalance} (${accountAddress})`);
      process.exit(0);
    }
    // Transfer operation
    const op = {
      type: 'SET_VALUE',
      ref: PathUtil.getTransferValuePath(GenesisAccounts.owner.address, accountAddress, i),
      value: accountBalance,
    };
    transferOps.push(op);
  }

  // Transaction
  const txBody = {
    nonce: -1,
    timestamp: BlockchainConfigs.GENESIS_TIMESTAMP,
    gas_price: 1,
    operation: {
      type: 'SET',
      op_list: transferOps
    }
  };
  const tx = Transaction.fromTxBody(txBody, GenesisAccounts.owner.private_key);
  if (!tx) {
    console.error(`Failed to build account setup tx with tx body: ${JSON.stringify(txBody, null, 2)}`);
    process.exit(0);
  }
  return tx;
}

function buildConsensusAppTx() {
  const txBody = {
    nonce: -1,
    timestamp: BlockchainConfigs.GENESIS_TIMESTAMP,
    gas_price: 1,
    operation: {
      type: 'SET_VALUE',
      ref: PathUtil.getCreateAppRecordPath(PredefinedDbPaths.CONSENSUS, BlockchainConfigs.GENESIS_TIMESTAMP),
      value: {
        [PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN]: {
          [GenesisAccounts.owner.address]: true
        },
        [PredefinedDbPaths.MANAGE_APP_CONFIG_SERVICE]: {
          [PredefinedDbPaths.STAKING]: {
            [PredefinedDbPaths.STAKING_LOCKUP_DURATION]: moment.duration(7, 'days').as('milliseconds')
          }
        }
      }
    }
  }
  const tx = Transaction.fromTxBody(txBody, GenesisAccounts.owner.private_key);
  if (!tx) {
    console.error(`Failed to build consensus app tx with tx body: ${JSON.stringify(txBody, null, 2)}`);
    process.exit(0);
  }
  return tx;
}

function buildGenesisStakingTxs() {
  const txs = [];
  Object.entries(BlockchainConfigs.GENESIS_VALIDATORS).forEach(([address, info], index) => {
    const privateKey = _.get(GenesisAccounts,
        `${AccountProperties.OTHERS}.${index}.${AccountProperties.PRIVATE_KEY}`);
    if (!privateKey) {
      console.error(`GenesisAccounts missing values: ${JSON.stringify(GenesisAccounts)}, ${address}`);
      process.exit(0);
    }
    const txBody = {
      nonce: -1,
      timestamp: BlockchainConfigs.GENESIS_TIMESTAMP,
      gas_price: 1,
      operation: {
        type: 'SET_VALUE',
        ref: PathUtil.getStakingStakeRecordValuePath(PredefinedDbPaths.CONSENSUS, address, 0, BlockchainConfigs.GENESIS_TIMESTAMP),
        value: info[PredefinedDbPaths.CONSENSUS_STAKE]
      }
    };
    const tx = Transaction.fromTxBody(txBody, privateKey);
    if (!tx) {
      console.error(`Failed to build genesis staking txs with tx body: ${JSON.stringify(txBody, null, 2)}`);
      process.exit(0);
    }
    txs.push(tx);
  });
  return txs;
}

function getGenesisBlockTxs() {
  const firstTx = buildDbSetupTx();
  const secondTx = buildAccountsSetupTx();
  const thirdTx = buildConsensusAppTx();
  const stakingTxs = buildGenesisStakingTxs();
  return [firstTx, secondTx, thirdTx, ...stakingTxs];
}

function executeGenesisTxsAndGetData(genesisTxs) {
  const tempGenesisDb = new DB(
      new StateNode(StateVersions.EMPTY), StateVersions.EMPTY, null, -1, null);
  tempGenesisDb.initDb();
  const resList = [];
  for (const tx of genesisTxs) {
    const res = tempGenesisDb.executeTransaction(Transaction.toExecutable(tx), true, false, 0, BlockchainConfigs.GENESIS_TIMESTAMP);
    if (CommonUtil.isFailedTx(res)) {
      console.error(`Genesis transaction failed:\n${JSON.stringify(tx, null, 2)}` +
          `\nRESULT: ${JSON.stringify(res)}`)
      process.exit(0);
    }
    resList.push(res);
  }
  const { gasAmountTotal, gasCostTotal } = CommonUtil.getServiceGasCostTotalFromTxList(genesisTxs, resList);
  return {
    stateProofHash: tempGenesisDb.getProofHash('/'),
    gasAmountTotal,
    gasCostTotal,
    receipts: CommonUtil.txResultsToReceipts(resList),
  };
}

function createGenesisBlock() {
  const lastHash = '';
  const lastVotes = [];
  const evidence = {};
  const transactions = getGenesisBlockTxs();
  const number = 0;
  const epoch = 0;
  const proposer = GenesisAccounts.owner.address;
  const { stateProofHash, gasAmountTotal, gasCostTotal, receipts } = executeGenesisTxsAndGetData(transactions);
  return new Block(lastHash, lastVotes, evidence, transactions, receipts, number, epoch,
    BlockchainConfigs.GENESIS_TIMESTAMP, stateProofHash, proposer, BlockchainConfigs.GENESIS_VALIDATORS, gasAmountTotal, gasCostTotal);
}

function writeCompressedBlock(dirPath, block) {
  const blockPath = path.join(dirPath, 'genesis_block.json.gz');
  if (!fs.existsSync(blockPath)) {
    FileUtil.createDir(dirPath);
    const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(block)));
    fs.writeFileSync(blockPath, compressed);
  } else {
    console.log(`File already exists at ${blockPath}. Remove & re-run.`);
  }
}

function processArguments() {
  if (process.argv.length !== 2) {
    usage();
  }

  GenesisAccounts = getBlockchainConfig('genesis_accounts.json');
  const genesisBlock = createGenesisBlock();
  writeCompressedBlock(BlockchainConfigs.GENESIS_BLOCK_DIR, genesisBlock);
}

function usage() {
  console.log('\nUsage:\n  node createGenesisBlock.js\n');
  console.log('Optional environment variables:');
  console.log('  BLOCKCHAIN_CONFIGS_DIR     The path to the directory containing blockchain config files.');
  console.log('  MIN_NUM_VALIDATORS      The minimum number of validators.');
  console.log('\nExample:');
  console.log('  BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/base node createGenesisBlock.js');
  process.exit(0);
}

try {
  processArguments();
} catch (e) {
  console.log(e);
}
