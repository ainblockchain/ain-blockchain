const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const _ = require('lodash');
const moment = require('moment');
const {
  NodeConfigs,
  PredefinedDbPaths,
  OwnerProperties,
  AccountProperties,
  ShardingProperties,
  ShardingProtocols,
  StateVersions,
  getBlockchainConfig,
  buildOwnerPermissions,
  BlockchainParams,
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

function getBlockchainParamsShardingOwner() {
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

function getBlockchainParamsTokenOwner() {
  const genesisTokenOwner = {};
  for (const networkName of Object.keys(BlockchainParams.token.bridge)) {
    for (const chainId of Object.keys(BlockchainParams.token.bridge[networkName])) {
      for (const tokenId of Object.keys(BlockchainParams.token.bridge[networkName][chainId])) {
        CommonUtil.setJsObject(
          genesisTokenOwner,
          [networkName, chainId, tokenId],
          {
            [PredefinedDbPaths.DOT_OWNER]: {
              [OwnerProperties.OWNERS]: {
                [GenesisAccounts.owner.address]: buildOwnerPermissions(true, true, true, true)
              }
            }
          }
        );
      }
    }
  }
  return {
    [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_BRIDGE]: {
      [PredefinedDbPaths.DOT_OWNER]: {
        [OwnerProperties.OWNERS]: {
          [GenesisAccounts.owner.address]: buildOwnerPermissions(true, true, true, true),
          [OwnerProperties.ANYONE]: buildOwnerPermissions(true, false, false, false)
        }
      },
      ...genesisTokenOwner
    }
  };
}

function getConsensusProposerWhitelistOwner() {
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
  return {
    [PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS]: {
      [PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS_USER_WHITELIST]: {
        [ownerAddress]: true
      },
      [PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS_URL_WHITELIST]: {
        [ownerAddress]: BlockchainParams.resource.default_developers_url_whitelist
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

function getBlockchainParamsOwner() {
  const owners = {
    [PredefinedDbPaths.DOT_OWNER]: {
      [OwnerProperties.OWNERS]: {
        [GenesisAccounts.owner.address]: buildOwnerPermissions(true, true, true, true)
      }
    },
    [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN]: getBlockchainParamsTokenOwner()
  };
  if (BlockchainParams.sharding[ShardingProperties.SHARDING_PROTOCOL] !== ShardingProtocols.NONE) {
    CommonUtil.setJsObject(owners, [PredefinedDbPaths.SHARDING], getBlockchainParamsShardingOwner());
  }
  return owners;
}

function getGenesisValues() {
  const values = {};
  const ownerAddress = GenesisAccounts.owner.address;
  CommonUtil.setJsObject(
    values,
    [PredefinedDbPaths.ACCOUNTS, ownerAddress, PredefinedDbPaths.BALANCE],
    BlockchainParams.token[PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_TOTAL_SUPPLY]
  );
  CommonUtil.setJsObject(
    values,
    [PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_PROPOSER_WHITELIST],
    BlockchainParams.consensus.genesis_proposer_whitelist
  );
  CommonUtil.setJsObject(
    values,
    [PredefinedDbPaths.DEVELOPERS],
    getDevelopersValue()
  );
  CommonUtil.setJsObject(values, [PredefinedDbPaths.BLOCKCHAIN_PARAMS], {
    [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN]: BlockchainParams.token,
    [PredefinedDbPaths.BLOCKCHAIN_PARAMS_CONSENSUS]: BlockchainParams.consensus,
    [PredefinedDbPaths.BLOCKCHAIN_PARAMS_GENESIS]: BlockchainParams.genesis,
    [PredefinedDbPaths.BLOCKCHAIN_PARAMS_RESOURCE]: BlockchainParams.resource,
    [PredefinedDbPaths.BLOCKCHAIN_PARAMS_SHARDING]: BlockchainParams.sharding,
  });
  return values;
}

function getGenesisRules() {
  return getBlockchainConfig('genesis_rules.json');
}

function getGenesisOwners() {
  const owners = getBlockchainConfig('genesis_owners.json');
  CommonUtil.setJsObject(
    owners,
    [],
    getRootOwner()
  );
  CommonUtil.setJsObject(
    owners,
    [PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_PROPOSER_WHITELIST],
    getConsensusProposerWhitelistOwner()
  );
  CommonUtil.setJsObject(
    owners,
    [PredefinedDbPaths.DEVELOPERS],
    getDevelopersOwner()
  );
  CommonUtil.setJsObject(
    owners,
    [PredefinedDbPaths.BLOCKCHAIN_PARAMS],
    getBlockchainParamsOwner()
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
    timestamp: BlockchainParams.genesis.genesis_timestamp,
    gas_price: 1,
    operation: {
      type: 'SET',
      op_list: opList,
    }
  };
  const tx = Transaction.fromTxBody(txBody, GenesisAccounts.owner.private_key, BlockchainParams.genesis.chain_id);
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
  if (!CommonUtil.isNumber(BlockchainParams.genesis.num_genesis_accounts) ||
      BlockchainParams.genesis.num_genesis_accounts <= 0 ||
      BlockchainParams.genesis.num_genesis_accounts > otherAccounts.length) {
    console.error(`Invalid NUM_GENESIS_ACCOUNTS value: ${BlockchainParams.genesis.num_genesis_accounts}`);
    process.exit(0);
  }
  for (let i = 0; i < BlockchainParams.genesis.num_genesis_accounts; i++) {
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
    timestamp: BlockchainParams.genesis.genesis_timestamp,
    gas_price: 1,
    operation: {
      type: 'SET',
      op_list: transferOps
    }
  };
  const tx = Transaction.fromTxBody(txBody, GenesisAccounts.owner.private_key, BlockchainParams.genesis.chain_id);
  if (!tx) {
    console.error(`Failed to build account setup tx with tx body: ${JSON.stringify(txBody, null, 2)}`);
    process.exit(0);
  }
  return tx;
}

function buildConsensusAppTx() {
  const admins = {
    [GenesisAccounts.owner.address]: true
  };
  if (BlockchainParams.sharding[ShardingProperties.SHARDING_PROTOCOL] !== ShardingProtocols.NONE) {
    admins[GenesisAccounts.others[0].address] = true;
  }
  const txBody = {
    nonce: -1,
    timestamp: BlockchainParams.genesis.genesis_timestamp,
    gas_price: 1,
    operation: {
      type: 'SET_VALUE',
      ref: PathUtil.getCreateAppRecordPath(PredefinedDbPaths.CONSENSUS, BlockchainParams.genesis.genesis_timestamp),
      value: {
        [PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN]: admins,
        [PredefinedDbPaths.MANAGE_APP_CONFIG_SERVICE]: {
          [PredefinedDbPaths.STAKING]: {
            [PredefinedDbPaths.STAKING_LOCKUP_DURATION]: moment.duration(7, 'days').as('milliseconds')
          }
        }
      }
    }
  }
  const tx = Transaction.fromTxBody(txBody, GenesisAccounts.owner.private_key, BlockchainParams.genesis.chain_id);
  if (!tx) {
    console.error(`Failed to build consensus app tx with tx body: ${JSON.stringify(txBody, null, 2)}`);
    process.exit(0);
  }
  return tx;
}

function buildGenesisStakingTxs() {
  const txs = [];
  Object.entries(BlockchainParams.consensus.genesis_validators).forEach(([address, info], index) => {
    const privateKey = _.get(GenesisAccounts,
        `${AccountProperties.OTHERS}.${index}.${AccountProperties.PRIVATE_KEY}`);
    if (!privateKey) {
      console.error(`GenesisAccounts missing values: ${JSON.stringify(GenesisAccounts)}, ${address}`);
      process.exit(0);
    }
    const txBody = {
      nonce: -1,
      timestamp: BlockchainParams.genesis.genesis_timestamp,
      gas_price: 1,
      operation: {
        type: 'SET_VALUE',
        ref: PathUtil.getStakingStakeRecordValuePath(
            PredefinedDbPaths.CONSENSUS, address, 0, BlockchainParams.genesis.genesis_timestamp),
        value: info[PredefinedDbPaths.CONSENSUS_STAKE]
      }
    };
    const tx = Transaction.fromTxBody(txBody, privateKey, BlockchainParams.genesis.chain_id);
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
      new StateNode(StateVersions.EMPTY),
      StateVersions.EMPTY, null, -1, null, GenesisAccounts.owner.address);
  tempGenesisDb.initDb();
  const resList = [];
  for (const tx of genesisTxs) {
    const res = tempGenesisDb.executeTransaction(
        Transaction.toExecutable(tx), true, false, 0, BlockchainParams.genesis.genesis_timestamp);
    if (CommonUtil.isFailedTx(res)) {
      console.error(`Genesis transaction failed:\n${JSON.stringify(tx, null, 2)}` +
          `\nRESULT: ${JSON.stringify(res)}`)
      process.exit(0);
    }
    resList.push(res);
  }
  const { gasAmountTotal, gasCostTotal } = CommonUtil.getServiceGasCostTotalFromTxList(
      genesisTxs, resList, BlockchainParams.resource.gas_price_unit);
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
      BlockchainParams.genesis.genesis_timestamp, stateProofHash, proposer,
      BlockchainParams.consensus.genesis_validators, gasAmountTotal, gasCostTotal);
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
  writeCompressedBlock(NodeConfigs.GENESIS_BLOCK_DIR, genesisBlock);
}

function usage() {
  console.log('\nUsage:\n  node createGenesisBlock.js\n');
  console.log('Optional environment variables:');
  console.log('  BLOCKCHAIN_CONFIGS_DIR     The path to the directory containing blockchain config files.');
  console.log('\nExamples:');
  console.log('  node createGenesisBlock.js'); // Same as BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/base
  console.log('  BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/1-node node createGenesisBlock.js');
  console.log('  BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/2-nodes node createGenesisBlock.js');
  console.log('  BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/3-nodes node createGenesisBlock.js');
  console.log('  BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/afan-shard node createGenesisBlock.js');
  console.log('  BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/he-shard node tools/genesis-file/createGenesisBlock.js');
  console.log('  BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/mainnet node tools/genesis-file/createGenesisBlock.js');
  console.log('  BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/sim-shard node tools/genesis-file/createGenesisBlock.js');
  console.log('  BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-dev node tools/genesis-file/createGenesisBlock.js');
  console.log('  BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-prod node tools/genesis-file/createGenesisBlock.js');
  console.log('  BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-sandbox node tools/genesis-file/createGenesisBlock.js');
  console.log('  BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/testnet-staging node tools/genesis-file/createGenesisBlock.js');

  process.exit(0);
}

try {
  processArguments();
} catch (e) {
  console.log(e);
}
