const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const _ = require('lodash');
const moment = require('moment');
const {
  GENESIS_BLOCK_DIR,
  DEFAULT_DEVELOPERS_URL_WHITELIST,
  PredefinedDbPaths,
  OwnerProperties,
  RuleProperties,
  AccountProperties,
  TokenProperties,
  ShardingProperties,
  ShardingProtocols,
  GenesisSharding,
  StateVersions,
  getGenesisConfig,
  buildOwnerPermissions,
} = require('../../common/constants');
const CommonUtil = require('../../common/common-util');
const FileUtil = require('../../common/file-util');
const PathUtil = require('../../common/path-util');
const Transaction = require('../../tx-pool/transaction');
const { Block } = require('../../blockchain/block');
const DB = require('../../db');
const StateNode = require('../../db/state-node');

/**
 * Genesis DB & sharding config.
 */

 function getRootOwner(genesisAccounts) {
  return {
    [PredefinedDbPaths.DOT_OWNER]: {
      [OwnerProperties.OWNERS]: {
        [genesisAccounts.owner.address]: buildOwnerPermissions(true, true, true, true),
        [OwnerProperties.ANYONE]: buildOwnerPermissions(false, false, false, false),
      }
    }
  };
}

function getShardingOwner(genesisAccounts) {
  return {
    [PredefinedDbPaths.DOT_OWNER]: {
      [OwnerProperties.OWNERS]: {
        // shardOwner
        [genesisAccounts.owner.address]: buildOwnerPermissions(false, true, true, true),
        // shardReporter
        [genesisAccounts.others[0].address]: buildOwnerPermissions(false, true, true, true),
        [OwnerProperties.ANYONE]: buildOwnerPermissions(false, false, false, false),
      }
    }
  };
}

function getShardingRule(genesisAccounts) {
  const ownerAddress = genesisAccounts.owner.address;
  const reporterAddress = genesisAccounts.others[0].address;
  return {
    [PredefinedDbPaths.DOT_RULE]: {
      [RuleProperties.WRITE]: `auth.addr === '${ownerAddress}' || auth.addr === '${reporterAddress}'`
    }
  };
}

function getWhitelistOwner(genesisAccounts) {
  return {
    [PredefinedDbPaths.DOT_OWNER]: {
      [OwnerProperties.OWNERS]: {
        [genesisAccounts.owner.address]: buildOwnerPermissions(false, true, true, true),
        [OwnerProperties.ANYONE]: buildOwnerPermissions(false, false, false, false),
      }
    }
  };
}

function getDevelopersValue(genesisParams, genesisAccounts) {
  const ownerAddress = genesisAccounts.owner.address;
  const maxFunctionUrlsPerDeveloper = genesisParams.resource.MAX_FUNCTION_URLS_PER_DEVELOPER;
  const defaultFunctionUrlWhitelist = {};
  DEFAULT_DEVELOPERS_URL_WHITELIST.forEach((url, index) => {
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

function getDevelopersRule(genesisAccounts) {
  const ownerAddress = genesisAccounts.owner.address;
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

function getDevelopersOwner(genesisAccounts) {
  return {
    [PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS]: {
      [PredefinedDbPaths.DOT_OWNER]: {
        [OwnerProperties.OWNERS]: {
          [genesisAccounts.owner.address]: buildOwnerPermissions(true, true, true, true)
        }
      }
    }
  };
}

function getWhitelist(genesisParams, genesisAccounts) {
  const whitelist = {};
  for (let i = 0; i < genesisParams.consensus.MIN_NUM_VALIDATORS; i++) {
    const addr = genesisAccounts[AccountProperties.OTHERS][i][AccountProperties.ADDRESS];
    CommonUtil.setJsObject(whitelist, [addr], true);
  }
  return whitelist;
}

function getValidators(genesisParams, genesisAccounts) {
  const validators = {};
  for (let i = 0; i < genesisParams.consensus.MIN_NUM_VALIDATORS; i++) {
    const addr = genesisAccounts[AccountProperties.OTHERS][i][AccountProperties.ADDRESS];
    CommonUtil.setJsObject(validators, [addr], {
      [PredefinedDbPaths.CONSENSUS_STAKE]: genesisParams.consensus.MIN_STAKE_PER_VALIDATOR,
      [PredefinedDbPaths.CONSENSUS_PROPOSAL_RIGHT]: true
    });
  }
  return validators;
}

function getGenesisValues(genesisParams, genesisAccounts) {
  const values = {};
  const genesisToken = genesisParams.token;
  const ownerAddress = genesisAccounts.owner.address;
  CommonUtil.setJsObject(values, [PredefinedDbPaths.TOKEN], genesisToken);
  CommonUtil.setJsObject(
    values,
    [PredefinedDbPaths.ACCOUNTS, ownerAddress, PredefinedDbPaths.BALANCE],
    genesisToken[TokenProperties.TOTAL_SUPPLY]
  );
  CommonUtil.setJsObject(
    values,
    [PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_CONFIG],
    GenesisSharding
  );
  CommonUtil.setJsObject(
    values,
    [PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_WHITELIST],
    getWhitelist(genesisParams, genesisAccounts)
  );
  CommonUtil.setJsObject(
    values,
    [PredefinedDbPaths.DEVELOPERS],
    getDevelopersValue(genesisParams, genesisAccounts)
  );
  return values;
}

function getGenesisRules(genesisAccounts) {
  const rules = getGenesisConfig('genesis_rules.json');
  if (GenesisSharding[ShardingProperties.SHARDING_PROTOCOL] !== ShardingProtocols.NONE) {
    CommonUtil.setJsObject(
      rules,
      [PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_CONFIG],
      getShardingRule(genesisAccounts)
    );
  }
  CommonUtil.setJsObject(
    rules,
    [PredefinedDbPaths.DEVELOPERS],
    getDevelopersRule(genesisAccounts)
  );
  return rules;
}

function getGenesisOwners(genesisAccounts) {
  const owners = getGenesisConfig('genesis_owners.json');
  CommonUtil.setJsObject(
    owners,
    [],
    getRootOwner(genesisAccounts)
  );
  if (GenesisSharding[ShardingProperties.SHARDING_PROTOCOL] !== ShardingProtocols.NONE) {
    CommonUtil.setJsObject(
      owners,
      [PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_CONFIG],
      getShardingOwner(genesisAccounts)
    );
  }
  CommonUtil.setJsObject(
    owners,
    [PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_WHITELIST],
    getWhitelistOwner(genesisAccounts)
  );
  CommonUtil.setJsObject(
    owners,
    [PredefinedDbPaths.DEVELOPERS],
    getDevelopersOwner(genesisAccounts)
  );
  return owners;
}

/**
 * Genesis transactions.
 */

function buildDbSetupTx(genesisTime, genesisParams, genesisAccounts, genesisFunctions) {
  const opList = [];

  // Values operation
  opList.push({
    type: 'SET_VALUE',
    ref: '/',
    value: getGenesisValues(genesisParams, genesisAccounts),
  });

  // Functions operation
  opList.push({
    type: 'SET_FUNCTION',
    ref: '/',
    value: genesisFunctions,
  });

  // Rules operation
  opList.push({
    type: 'SET_RULE',
    ref: '/',
    value: getGenesisRules(genesisAccounts),
  });

  // Owners operation
  opList.push({
    type: 'SET_OWNER',
    ref: '/',
    value: getGenesisOwners(genesisAccounts),
  });

  // Transaction
  const txBody = {
    nonce: -1,
    timestamp: genesisTime,
    gas_price: 1,
    operation: {
      type: 'SET',
      op_list: opList,
    }
  };
  const tx = Transaction.fromTxBody(txBody, genesisAccounts.owner.private_key);
  if (!tx) {
    console.error(`Failed to build DB setup tx with tx body: ${JSON.stringify(txBody, null, 2)}`);
    process.exit(0);
  }
  return tx;
}

function buildAccountsSetupTx(genesisTime, genesisParams, genesisAccounts) {
  const transferOps = [];
  const otherAccounts = genesisAccounts.others;
  if (!otherAccounts || !CommonUtil.isArray(otherAccounts) || otherAccounts.length === 0) {
    console.error(`Invalid genesis accounts: ${JSON.stringify(otherAccounts, null, 2)}`);
    process.exit(0);
  }
  const numGenesisAccounts = genesisParams.genesis.NUM_GENESIS_ACCOUNTS;
  if (!CommonUtil.isNumber(numGenesisAccounts) || numGenesisAccounts <= 0 ||
      numGenesisAccounts > otherAccounts.length) {
    console.error(`Invalid NUM_GENESIS_ACCOUNTS value: ${numGenesisAccounts}`);
    process.exit(0);
  }
  for (let i = 0; i < numGenesisAccounts; i++) {
    const accountAddress = otherAccounts[i].address;
    const accountBalance = otherAccounts[i].balance;
    if (!CommonUtil.isNumber(accountBalance) || accountBalance <= 0) {
      console.error(`Invalid genesis account balance: ${accountBalance} (${accountAddress})`);
      process.exit(0);
    }
    // Transfer operation
    const op = {
      type: 'SET_VALUE',
      ref: PathUtil.getTransferValuePath(genesisAccounts.owner.address, accountAddress, i),
      value: accountBalance,
    };
    transferOps.push(op);
  }

  // Transaction
  const txBody = {
    nonce: -1,
    timestamp: genesisTime,
    gas_price: 1,
    operation: {
      type: 'SET',
      op_list: transferOps
    }
  };
  const tx = Transaction.fromTxBody(txBody, genesisAccounts.owner.private_key);
  if (!tx) {
    console.error(`Failed to build account setup tx with tx body: ${JSON.stringify(txBody, null, 2)}`);
    process.exit(0);
  }
  return tx;
}

function buildConsensusAppTx(genesisTime, genesisAccounts) {
  const txBody = {
    nonce: -1,
    timestamp: genesisTime,
    gas_price: 1,
    operation: {
      type: 'SET_VALUE',
      ref: PathUtil.getCreateAppRecordPath(PredefinedDbPaths.CONSENSUS, genesisTime),
      value: {
        [PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN]: {
          [genesisAccounts.owner.address]: true
        },
        [PredefinedDbPaths.MANAGE_APP_CONFIG_SERVICE]: {
          [PredefinedDbPaths.STAKING]: {
            [PredefinedDbPaths.STAKING_LOCKUP_DURATION]: moment.duration(7, 'days').as('milliseconds')
          }
        }
      }
    }
  }
  const tx = Transaction.fromTxBody(txBody, genesisAccounts.owner.private_key);
  if (!tx) {
    console.error(`Failed to build consensus app tx with tx body: ${JSON.stringify(txBody, null, 2)}`);
    process.exit(0);
  }
  return tx;
}

function buildGenesisStakingTxs(genesisTime, genesisAccounts, genesisValidators) {
  const txs = [];
  Object.entries(genesisValidators).forEach(([address, info], index) => {
    const privateKey = _.get(genesisAccounts,
        `${AccountProperties.OTHERS}.${index}.${AccountProperties.PRIVATE_KEY}`);
    if (!privateKey) {
      console.error(`genesisAccounts missing values: ${JSON.stringify(genesisAccounts)}, ${address}`);
      process.exit(0);
    }
    const txBody = {
      nonce: -1,
      timestamp: genesisTime,
      gas_price: 1,
      operation: {
        type: 'SET_VALUE',
        ref: PathUtil.getStakingStakeRecordValuePath(PredefinedDbPaths.CONSENSUS, address, 0, genesisTime),
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

function getGenesisBlockTxs(genesisTime, genesisParams, genesisAccounts, genesisFunctions, genesisValidators) {
  const firstTx = buildDbSetupTx(genesisTime, genesisParams, genesisAccounts, genesisFunctions);
  const secondTx = buildAccountsSetupTx(genesisTime, genesisParams, genesisAccounts);
  const thirdTx = buildConsensusAppTx(genesisTime, genesisAccounts);
  const stakingTxs = buildGenesisStakingTxs(genesisTime, genesisAccounts, genesisValidators);
  return [firstTx, secondTx, thirdTx, ...stakingTxs];
}

function executeGenesisTxsAndGetData(genesisTxs, genesisTime) {
  const tempGenesisDb = new DB(
      new StateNode(StateVersions.EMPTY), StateVersions.EMPTY, null, -1, null);
  tempGenesisDb.initDb();
  const resList = [];
  for (const tx of genesisTxs) {
    const res = tempGenesisDb.executeTransaction(Transaction.toExecutable(tx), true, false, 0, genesisTime);
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

function createGenesisBlock(genesisParams, genesisAccounts, genesisFunctions) {
  const genesisTime = genesisParams.genesis.GENESIS_TIMESTAMP;
  const lastHash = '';
  const lastVotes = [];
  const evidence = {};
  const validators = getValidators(genesisParams, genesisAccounts);
  const transactions = getGenesisBlockTxs(genesisTime, genesisParams, genesisAccounts, genesisFunctions, validators);
  const number = 0;
  const epoch = 0;
  const proposer = genesisAccounts.owner.address;
  const { stateProofHash, gasAmountTotal, gasCostTotal, receipts } =
      executeGenesisTxsAndGetData(transactions, genesisTime);
  return new Block(lastHash, lastVotes, evidence, transactions, receipts, number, epoch,
      genesisTime, stateProofHash, proposer, validators, gasAmountTotal, gasCostTotal);
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

  // Read genesis files
  const genesisParams = getGenesisConfig('genesis_params.json');
  const genesisAccounts = getGenesisConfig('genesis_accounts.json');
  const genesisFunctions = getGenesisConfig('genesis_functions.json');
  const genesisBlock = createGenesisBlock(genesisParams, genesisAccounts, genesisFunctions);
  writeCompressedBlock(GENESIS_BLOCK_DIR, genesisBlock);
}

function usage() {
  console.log('\nUsage:\n  node createGenesisBlock.js\n');
  console.log('Optional environment variables:');
  console.log('  GENESIS_CONFIGS_DIR     The path to the directory containing genesis config files.');
  console.log('  MIN_NUM_VALIDATORS      The minimum number of validators.');
  console.log('\nExample:');
  console.log('  GENESIS_CONFIGS_DIR=genesis-configs/base node createGenesisBlock.js');
  process.exit(0);
}

try {
  processArguments();
} catch (e) {
  console.log(e);
}
