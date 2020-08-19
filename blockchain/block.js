const fs = require('fs');
const stringify = require('fast-json-stable-stringify');
const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger');
const ChainUtil = require('../chain-util');
const Transaction = require('../tx-pool/transaction');
const {
  GENESIS_OWNERS,
  ADDITIONAL_OWNERS,
  GENESIS_RULES,
  ADDITIONAL_RULES,
  GENESIS_FUNCTIONS,
  ADDITIONAL_FUNCTIONS,
  GENESIS_SHARDING,
  PredefinedDbPaths,
  GenesisToken,
  GenesisAccounts,
  ShardingProperties,
  ShardingProtocols,
} = require('../constants');
const {
  ConsensusDbPaths,
  ConsensusConsts
} = require('../consensus/constants');
const BlockFilePatterns = require('./block-file-patterns');
const zipper = require('zip-local');
const sizeof = require('object-sizeof');

const LOG_PREFIX = 'BLOCK';

class Block {
  constructor(lastHash, lastVotes, transactions, number, epoch, timestamp, proposer, validators) {
    this.last_votes = lastVotes;
    this.transactions = transactions;
    // Block's header
    this.last_hash = lastHash;
    this.last_votes_hash = ChainUtil.hashString(stringify(lastVotes));
    this.transactions_hash = ChainUtil.hashString(stringify(transactions));
    this.number = number;
    this.epoch = epoch;
    this.timestamp = timestamp;
    this.proposer = proposer;
    this.validators = validators;
    this.size = sizeof(this.transactions);
    // Hash of block's header
    this.hash = Block.hash(this);
  }

  get header() {
    return {
      last_hash: this.last_hash,
      last_votes_hash: this.last_votes_hash,
      transactions_hash: this.transactions_hash,
      number: this.number,
      epoch: this.epoch,
      timestamp: this.timestamp,
      proposer: this.proposer,
      validators: this.validators,
      size: this.size
    };
  }

  toString() {
    return `Block -
            hash:              ${ChainUtil.shortenHash(this.hash)}
            last_hash:         ${ChainUtil.shortenHash(this.last_hash)}
            last_votes_hash:   ${ChainUtil.shortenHash(this.last_votes_hash)}
            transactions_hash: ${ChainUtil.shortenHash(this.transactions_hash)}
            number:            ${this.number}
            epoch:             ${this.epoch}
            timestamp:         ${this.timestamp}
            proposer:          ${this.proposer}
            validators:        ${this.validators}
            size:              ${this.size}
            last_votes len:    ${this.last_votes.length}
            transactions len:  ${this.transactions.length}
            last_votes:        ${stringify(this.last_votes)}
            transactions:      ${stringify(this.transactions)}`;
  }

  static hash(block) {
    if (!(block instanceof Block)) block = Block.parse(block);
    return ChainUtil.hashString(stringify(block.header));
  }

  static createBlock(lastHash, lastVotes, transactions, number, epoch, proposer, validators) {
    return new Block(lastHash, lastVotes, transactions, number, epoch, Date.now(), proposer, validators);
  }

  static getFileName(block) {
    return BlockFilePatterns.getBlockFileName(block);
  }

  static loadBlock(blockZipFile) {
    const unzippedfs = zipper.sync.unzip(blockZipFile).memory();
    const blockInfo = JSON.parse(unzippedfs.read(unzippedfs.contents()[0], 'buffer').toString());
    return Block.parse(blockInfo);
  }

  static parse(blockInfo) {
    if (!Block.hasRequiredFields(blockInfo)) return null;
    if (blockInfo instanceof Block) return blockInfo;
    return new Block(blockInfo['last_hash'], blockInfo['last_votes'],
        blockInfo['transactions'], blockInfo['number'], blockInfo['epoch'],
        blockInfo['timestamp'], blockInfo['proposer'], blockInfo['validators']);
  }

  static hasRequiredFields(block) {
    return (block && block.last_hash !== undefined && block.last_votes !== undefined &&
        block.transactions !== undefined && block.number !== undefined &&
        block.epoch !== undefined &&  block.timestamp !== undefined &&
        block.proposer !== undefined && block.validators !== undefined);
  }

  static validateHashes(block) {
    if (block.hash !== Block.hash(block)) {
      logger.error(`[${LOG_PREFIX}] Block hash is incorrect for block ${block.hash}`);
      return false;
    }
    if (block.transactions_hash !== ChainUtil.hashString(stringify(block.transactions))) {
      logger.error(`[${LOG_PREFIX}] Transactions or transactions_hash is incorrect for block ${block.hash}`);
      return false;
    }
    if (block.last_votes_hash !== ChainUtil.hashString(stringify(block.last_votes))) {
      logger.error(`[${LOG_PREFIX}] Last votes or last_votes_hash is incorrect for block ${block.hash}`);
      return false;
    }
    logger.info(`[${LOG_PREFIX}] Hash check successfully done`);
    return true;
  }

  static validateProposedBlock(block) {
    if (!Block.validateHashes(block)) return false;
    const nonceTracker = {};
    let transaction;
    for (let i=0; i<block.transactions.length; i++) {
      transaction = block.transactions[i];
      if (transaction.nonce < 0) {
        continue;
      }
      if (!(transaction.address in nonceTracker)) {
        nonceTracker[transaction.address] = transaction.nonce;
        continue;
      }
      if (transaction.nonce != nonceTracker[transaction.address] + 1) {
        logger.error(`[${LOG_PREFIX}] Invalid noncing for ${transaction.address} ` +
                     `Expected ${nonceTracker[transaction.address] + 1} ` +
                     `Received ${transaction.nonce}`);
        return false;
      }
      nonceTracker[transaction.address] = transaction.nonce;
    }

    logger.info(`[${LOG_PREFIX}] Valid block of number ${block.number}`);
    return true;
  }

  static getShardingConfig() {
    if (!fs.existsSync(GENESIS_SHARDING)) {
      throw Error('Missing genesis sharding config file: ' + GENESIS_SHARDING);
    }
    const config = JSON.parse(fs.readFileSync(GENESIS_SHARDING));
    if (config[ShardingProperties.SHARDING_PROTOCOL] === ShardingProtocols.POA) {
      config[ShardingProperties.SHARD_OWNER] = GenesisAccounts.owner.address;
      config[ShardingProperties.SHARD_REPORTER] = GenesisAccounts.others[0].address;
    }
    return config;
  }

  // TODO(lia): Increase this list to 10.
  static getConsensusWhitelist() {
    const whitelist = {};
    for (let i = 0; i < ConsensusConsts.INITIAL_NUM_VALIDATORS; i++) {
      whitelist[GenesisAccounts.others[i].address] = ConsensusConsts.INITIAL_STAKE;
    }
    return whitelist;
  }

  static getFunctions() {
    if (!fs.existsSync(GENESIS_FUNCTIONS)) {
      throw Error('Missing genesis functions config file: ' + GENESIS_FUNCTIONS);
    }
    const functions = JSON.parse(fs.readFileSync(GENESIS_FUNCTIONS));
    if (ADDITIONAL_FUNCTIONS) {
      if (fs.existsSync(ADDITIONAL_FUNCTIONS.filePath)) {
        const addFunctions = JSON.parse(fs.readFileSync(ADDITIONAL_FUNCTIONS.filePath));
        functions[ADDITIONAL_FUNCTIONS.dbPath] = addFunctions;
      } else {
        throw Error('Missing additional functions config file: ' + ADDITIONAL_FUNCTIONS.filePath);
      }
    }
    return functions;
  }

  static getRules() {
    if (!fs.existsSync(GENESIS_RULES)) {
      throw Error('Missing genesis rules config file: ' + GENESIS_RULES);
    }
    const rules = JSON.parse(fs.readFileSync(GENESIS_RULES));
    if (ADDITIONAL_RULES) {
      if (fs.existsSync(ADDITIONAL_RULES.filePath)) {
        const addRules = JSON.parse(fs.readFileSync(ADDITIONAL_RULES.filePath));
        rules[ADDITIONAL_RULES.dbPath] = addRules;
      } else {
        throw Error('Missing additional rules config file: ' + ADDITIONAL_RULES.filePath);
      }
    }
    return rules;
  }

  static getShardingRule(ownerAddress) {
    return `auth === '${ownerAddress}'`;
  }

  static getConsensusRule(ownerAddress) {
    return `auth === '${ownerAddress}'`;
  }

  static getOwners() {
    if (!fs.existsSync(GENESIS_OWNERS)) {
      throw Error('Missing genesis owners config file: ' + GENESIS_OWNERS);
    }
    const owners = JSON.parse(fs.readFileSync(GENESIS_OWNERS));
    if (ADDITIONAL_OWNERS) {
      if (fs.existsSync(ADDITIONAL_OWNERS.filePath)) {
        const addOwners = JSON.parse(fs.readFileSync(ADDITIONAL_OWNERS.filePath));
        owners[ADDITIONAL_OWNERS.dbPath] = addOwners;
      } else {
        throw Error('Missing additional owners config file: ' + ADDITIONAL_OWNERS.filePath);
      }
    }
    return owners;
  }

  static getShardingOwner(ownerAddress) {
    return {
      ".owner": {
        "owners": {
          [ownerAddress]: {
            "branch_owner": false,
            "write_function": true,
            "write_owner": true,
            "write_rule": true
          },
          "*": {
            "branch_owner": false,
            "write_function": false,
            "write_owner": false,
            "write_rule": false
          }
        }
      }
    };
  }

  static getConsensusOwner(ownerAddress) {
    return {
      ".owner": {
        "owners": {
          [ownerAddress]: {
            "branch_owner": false,
            "write_function": true,
            "write_owner": true,
            "write_rule": true
          },
          "*": {
            "branch_owner": false,
            "write_function": false,
            "write_owner": false,
            "write_rule": false
          }
        }
      }
    };
  }

  static getDbSetupTransaction(ownerAccount, timestamp, keyBuffer) {
    const opList = [];

    // Token operation
    opList.push({
      type: 'SET_VALUE',
      ref: `/${PredefinedDbPaths.TOKEN}`,
      value: GenesisToken
    });

    // Balance operation
    opList.push({
      type: 'SET_VALUE',
      ref: `/${PredefinedDbPaths.ACCOUNTS}/${ownerAccount.address}/${PredefinedDbPaths.BALANCE}`,
      value: GenesisToken.total_supply
    });

    const shardingConfig = Block.getShardingConfig();
    // Sharding value operation
    opList.push({
      type: 'SET_VALUE',
      ref: `/${PredefinedDbPaths.SHARDING}/${PredefinedDbPaths.SHARDING_CONFIG}`,
      value: shardingConfig,
    });

    // Consensus (whitelisting) value operation
    opList.push({
      type: 'SET_VALUE',
      ref: `/${ConsensusDbPaths.CONSENSUS}/${ConsensusDbPaths.WHITELIST}`,
      value: Block.getConsensusWhitelist(),
    });

    // Functions operation
    opList.push({
      type: 'SET_FUNCTION',
      ref: '/',
      value: Block.getFunctions(),
    });

    // Rules operation
    opList.push({
      type: 'SET_RULE',
      ref: '/',
      value: Block.getRules(),
    });
    if (shardingConfig[ShardingProperties.SHARDING_PROTOCOL] !== ShardingProtocols.NONE) {
      // Sharding rule operation
      opList.push({
        type: 'SET_RULE',
        ref: `/${PredefinedDbPaths.SHARDING}/${PredefinedDbPaths.SHARDING_CONFIG}`,
        value: Block.getShardingRule(ownerAccount.address)
      });
    }
    // Consensus (whitelisting) rule operation
    opList.push({
      type: 'SET_RULE',
      ref: `/${ConsensusDbPaths.CONSENSUS}/${ConsensusDbPaths.WHITELIST}`,
      value: Block.getConsensusRule(ownerAccount.address)
    });

    // Owners operation
    opList.push({
      type: 'SET_OWNER',
      ref: '/',
      value: Block.getOwners(),
    });
    // Sharding owner operation
    opList.push({
      type: 'SET_OWNER',
      ref: `/${PredefinedDbPaths.SHARDING}/${PredefinedDbPaths.SHARDING_CONFIG}`,
      value: shardingConfig[ShardingProperties.SHARDING_PROTOCOL] !== ShardingProtocols.NONE ?
          Block.getShardingOwner(ownerAccount.address) : null,
    });
    // Consensus (whitelisting) owner operation
    opList.push({
      type: 'SET_OWNER',
      ref: `/${ConsensusDbPaths.CONSENSUS}/${ConsensusDbPaths.WHITELIST}`,
      value: Block.getConsensusOwner(ownerAccount.address)
    });

    // Transaction
    const firstTxData = {
      nonce: -1,
      timestamp,
      operation: {
        type: 'SET',
        op_list: opList,
      }
    };
    const firstSig = ainUtil.ecSignTransaction(firstTxData, keyBuffer);
    return (new Transaction({ signature: firstSig, transaction: firstTxData }));
  }

  static getAccountsSetupTransaction(ownerAccount, timestamp, keyBuffer) {
    const transferOps = [];
    const otherAccounts = GenesisAccounts.others;
    if (otherAccounts && Array.isArray(otherAccounts) && otherAccounts.length > 0 &&
        GenesisAccounts.shares > 0) {
      for (let i = 0; i < otherAccounts.length; i++) {
        // Transfer operation
        const op = {
          type: 'SET_VALUE',
          ref: `/${PredefinedDbPaths.TRANSFER}/${ownerAccount.address}/` +
              `${otherAccounts[i].address}/${i}/${PredefinedDbPaths.TRANSFER_VALUE}`,
          value: GenesisAccounts.shares
        };
        transferOps.push(op);
      }
    }

    // Transaction
    const secondTxData = {
      nonce: -1,
      timestamp,
      operation: {
        type: 'SET',
        op_list: transferOps
      }
    };
    const secondSig = ainUtil.ecSignTransaction(secondTxData, keyBuffer);
    return (new Transaction({ signature: secondSig, transaction: secondTxData }));
  }

  static getGenesisBlockData(timestamp) {
    const ownerAccount = GenesisAccounts.owner;
    if (!ownerAccount) {
      throw Error('Missing owner account.');
    }
    const keyBuffer = Buffer.from(ownerAccount.private_key, 'hex');

    const firstTx = this.getDbSetupTransaction(ownerAccount, timestamp, keyBuffer);
    const secondTx = this.getAccountsSetupTransaction(ownerAccount, timestamp, keyBuffer);

    return [firstTx, secondTx];
  }

  static genesis() {
    // This is a temporary fix for the genesis block. Code should be modified after
    // genesis block broadcasting feature is implemented.
    const ownerAccount = GenesisAccounts.owner;
    const timestamp = Date.now();
    const lastHash = '';
    const lastVotes = [];
    const transactions = Block.getGenesisBlockData(timestamp);
    const number = 0;
    const epoch = 0;
    const proposer = ownerAccount.address;
    const validators = {};
    for (let i = 0; i < ConsensusConsts.INITIAL_NUM_VALIDATORS; i++) {
      validators[GenesisAccounts.others[i].address] = ConsensusConsts.INITIAL_STAKE;
    }
    return new this(lastHash, lastVotes, transactions, number, epoch, timestamp,
        proposer, validators);
  }
}

module.exports = {Block};
