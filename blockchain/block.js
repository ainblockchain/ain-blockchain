const logger = new (require('../logger'))('BLOCK');

const stringify = require('fast-json-stable-stringify');
const sizeof = require('object-sizeof');
const moment = require('moment');
const _ = require('lodash');
const CommonUtil = require('../common/common-util');
const Transaction = require('../tx-pool/transaction');
const StateNode = require('../db/state-node');
const DB = require('../db');
const {
  PredefinedDbPaths,
  GenesisAccounts,
  GENESIS_TIMESTAMP,
  GENESIS_ACCOUNT_SHARES,
  NUM_GENESIS_ACCOUNTS,
  GENESIS_VALIDATORS,
  GenesisValues,
  GenesisFunctions,
  GenesisRules,
  GenesisOwners,
  AccountProperties,
  StateVersions,
} = require('../common/constants');
const PathUtil = require('../common/path-util');

class Block {
  constructor(lastHash, lastVotes, evidence, transactions, receipts, number, epoch, timestamp,
      stateProofHash, proposer, validators, gasAmountTotal, gasCostTotal) {
    this.last_votes = lastVotes;
    this.evidence = evidence;
    this.transactions = Block.sanitizeTransactions(transactions);
    this.receipts = receipts;
    // Block's header
    this.last_hash = lastHash;
    this.last_votes_hash = CommonUtil.hashString(stringify(lastVotes));
    this.evidence_hash = CommonUtil.hashString(stringify(this.evidence));
    this.transactions_hash = CommonUtil.hashString(stringify(this.transactions));
    this.receipts_hash = CommonUtil.hashString(stringify(this.receipts));
    this.number = number;
    this.epoch = epoch;
    this.timestamp = timestamp;
    this.state_proof_hash = stateProofHash;
    this.proposer = proposer;
    this.validators = validators;
    this.gas_amount_total = gasAmountTotal;
    this.gas_cost_total = gasCostTotal;
    // Hash of block's header
    this.hash = Block.hash(this);
    this.size = Block.getSize(this);
  }

  get header() {
    return {
      last_hash: this.last_hash,
      last_votes_hash: this.last_votes_hash,
      transactions_hash: this.transactions_hash,
      receipts_hash: this.receipts_hash,
      evidence_hash: this.evidence_hash,
      number: this.number,
      epoch: this.epoch,
      timestamp: this.timestamp,
      state_proof_hash: this.state_proof_hash,
      proposer: this.proposer,
      validators: this.validators,
      gas_amount_total: this.gas_amount_total,
      gas_cost_total: this.gas_cost_total,
    };
  }

  get body() {
    return {
      last_votes: this.last_votes,
      evidence: this.evidence,
      transactions: this.transactions,
      receipts: this.receipts,
    };
  }

  toString() {
    return JSON.stringify(this, null, 2);
  }

  static sanitizeTransactions(transactions) {
    const sanitized = [];
    transactions.forEach((tx) => {
      sanitized.push(Transaction.toJsObject(tx));
    });
    return sanitized;
  }

  static hash(block) {
    if (!(block instanceof Block)) block = Block.parse(block);
    return CommonUtil.hashString(stringify(block.header));
  }

  static getSize(block) {
    if (!(block instanceof Block)) block = Block.parse(block);
    return sizeof({...block.header, ...block.body});
  }

  static create(lastHash, lastVotes, evidence, transactions, receipts, number, epoch,
      stateProofHash, proposer, validators, gasAmountTotal, gasCostTotal, timestamp) {
    return new Block(lastHash, lastVotes, evidence, transactions, receipts, number, epoch,
        timestamp ? timestamp : Date.now(), stateProofHash, proposer, validators, gasAmountTotal,
        gasCostTotal);
  }

  static parse(blockInfo) {
    // TODO(liayoo): add sanitization logic.
    if (!Block.hasRequiredFields(blockInfo)) return null;
    if (blockInfo instanceof Block) return blockInfo;
    return new Block(blockInfo.last_hash, blockInfo.last_votes, blockInfo.evidence,
        blockInfo.transactions, blockInfo.receipts, blockInfo.number, blockInfo.epoch,
        blockInfo.timestamp, blockInfo.state_proof_hash, blockInfo.proposer, blockInfo.validators,
        blockInfo.gas_amount_total, blockInfo.gas_cost_total);
  }

  static hasRequiredFields(block) {
    return (block && block.last_hash !== undefined && block.last_votes !== undefined &&
        block.evidence !== undefined && block.transactions !== undefined &&
        block.receipts !== undefined && block.number !== undefined && block.epoch !== undefined &&
        block.timestamp !== undefined && block.state_proof_hash !== undefined &&
        block.proposer !== undefined && block.validators !== undefined &&
        block.gas_amount_total !== undefined && block.gas_cost_total !== undefined);
  }

  static validateHashes(block) {
    const LOG_HEADER = 'validateHashes';

    if (block.hash !== Block.hash(block)) {
      logger.error(`[${LOG_HEADER}] Block hash is incorrect for block ${block.hash}`);
      return false;
    }
    if (block.transactions_hash !== CommonUtil.hashString(stringify(block.transactions))) {
      logger.error(
          `[${LOG_HEADER}] Transactions or transactions_hash is incorrect for block ${block.hash}`);
      return false;
    }
    if (block.receipts_hash !== CommonUtil.hashString(stringify(block.receipts))) {
      logger.error(
          `[${LOG_HEADER}] Receipts or receipts_hash is incorrect for block ${block.hash}`);
      return false;
    }
    if (block.last_votes_hash !== CommonUtil.hashString(stringify(block.last_votes))) {
      logger.error(
          `[${LOG_HEADER}] Last votes or last_votes_hash is incorrect for block ${block.hash}`);
      return false;
    }
    if (block.evidence_hash !== CommonUtil.hashString(stringify(block.evidence))) {
      logger.error(
        `[${LOG_HEADER}] Evidence or evidence_hash is incorrect for block ${block.hash}`);
      return false;
    }
    return true;
  }

  static validateValidators(validators) {
    if (!CommonUtil.isDict(validators)) return false;
    for (const [address, info] of Object.entries(validators)) {
      if (!CommonUtil.isCksumAddr(address)) {
        return false;
      }
      if (!CommonUtil.isDict(info) || !CommonUtil.isNumber(info[PredefinedDbPaths.CONSENSUS_STAKE]) ||
          !CommonUtil.isBool(info[PredefinedDbPaths.CONSENSUS_PROPOSAL_RIGHT])) {
        return false;
      }
    }
    return true;
  }

  // TODO(liayoo): Remove the following functions
  static buildDbSetupTx(timestamp, privateKey) {
    const opList = [];

    // Values operation
    opList.push({
      type: 'SET_VALUE',
      ref: '/',
      value: GenesisValues,
    });

    // Functions operation
    opList.push({
      type: 'SET_FUNCTION',
      ref: '/',
      value: GenesisFunctions,
    });

    // Rules operation
    opList.push({
      type: 'SET_RULE',
      ref: '/',
      value: GenesisRules,
    });

    // Owners operation
    opList.push({
      type: 'SET_OWNER',
      ref: '/',
      value: GenesisOwners,
    });

    // Transaction
    const txBody = {
      nonce: -1,
      timestamp,
      gas_price: 1,
      operation: {
        type: 'SET',
        op_list: opList,
      }
    };
    const tx = Transaction.fromTxBody(txBody, privateKey);
    if (!tx) {
      CommonUtil.finishWithStackTrace(
          logger, `Failed to build DB setup tx with tx body: ${JSON.stringify(txBody, null, 2)}`);
    }
    return tx;
  }

  static buildAccountsSetupTx(timestamp, privateKey, ownerAddress) {
    const transferOps = [];
    const otherAccounts = GenesisAccounts[AccountProperties.OTHERS];
    if (!otherAccounts || !CommonUtil.isArray(otherAccounts) || otherAccounts.length === 0) {
      CommonUtil.finishWithStackTrace(
          logger, `Invalid genesis accounts: ${JSON.stringify(otherAccounts, null, 2)}`);
    }
    if (!CommonUtil.isNumber(GENESIS_ACCOUNT_SHARES) || GENESIS_ACCOUNT_SHARES <= 0) {
      CommonUtil.finishWithStackTrace(
          logger, `Invalid genesis account shares: ${GENESIS_ACCOUNT_SHARES}`);
    }
    if (!CommonUtil.isNumber(NUM_GENESIS_ACCOUNTS) || NUM_GENESIS_ACCOUNTS <= 0 ||
        NUM_GENESIS_ACCOUNTS > otherAccounts.length) {
      CommonUtil.finishWithStackTrace(
          logger, `Invalid NUM_GENESIS_ACCOUNTS value: ${NUM_GENESIS_ACCOUNTS}`);
    }
    for (let i = 0; i < NUM_GENESIS_ACCOUNTS; i++) {
      const accountAddress = otherAccounts[i][AccountProperties.ADDRESS];
      // Transfer operation
      const op = {
        type: 'SET_VALUE',
        ref: PathUtil.getTransferValuePath(ownerAddress, accountAddress, i),
        value: GENESIS_ACCOUNT_SHARES,
      };
      transferOps.push(op);
    }

    // Transaction
    const txBody = {
      nonce: -1,
      timestamp,
      gas_price: 1,
      operation: {
        type: 'SET',
        op_list: transferOps
      }
    };
    const tx = Transaction.fromTxBody(txBody, privateKey);
    if (!tx) {
      CommonUtil.finishWithStackTrace(
          logger, `Failed to build account setup tx with tx body: ${JSON.stringify(txBody, null, 2)}`);
    }
    return tx;
  }

  static buildConsensusAppTx(timestamp, privateKey, ownerAddress) {
    const txBody = {
      nonce: -1,
      timestamp,
      gas_price: 1,
      operation: {
        type: 'SET_VALUE',
        ref: PathUtil.getCreateAppRecordPath(PredefinedDbPaths.CONSENSUS, timestamp),
        value: {
          [PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN]: {
            [ownerAddress]: true
          },
          [PredefinedDbPaths.MANAGE_APP_CONFIG_SERVICE]: {
            [PredefinedDbPaths.STAKING]: {
              [PredefinedDbPaths.STAKING_LOCKUP_DURATION]: moment.duration(180, 'days').as('milliseconds')
            }
          }
        }
      }
    }
    const tx = Transaction.fromTxBody(txBody, privateKey);
    if (!tx) {
      CommonUtil.finishWithStackTrace(
          logger, `Failed to build consensus app tx with tx body: ${JSON.stringify(txBody, null, 2)}`);
    }
    return tx;
  }

  static buildGenesisStakingTxs(timestamp) {
    const txs = [];
    Object.entries(GENESIS_VALIDATORS).forEach(([address, info], index) => {
      const privateKey = _.get(GenesisAccounts,
          `${AccountProperties.OTHERS}.${index}.${AccountProperties.PRIVATE_KEY}`);
      if (!privateKey) {
        throw Error(`GenesisAccounts missing values: ${JSON.stringify(GenesisAccounts)}, ${address}`);
      }
      const txBody = {
        nonce: -1,
        timestamp,
        gas_price: 1,
        operation: {
          type: 'SET_VALUE',
          ref: PathUtil.getStakingStakeRecordValuePath(PredefinedDbPaths.CONSENSUS, address, 0, timestamp),
          value: info[PredefinedDbPaths.CONSENSUS_STAKE]
        }
      };
      const tx = Transaction.fromTxBody(txBody, privateKey);
      if (!tx) {
        CommonUtil.finishWithStackTrace(
            logger, `Failed to build genesis staking txs with tx body: ${JSON.stringify(txBody, null, 2)}`);
      }
      txs.push(tx);
    });
    return txs;
  }

  static getGenesisBlockTxs(genesisTime) {
    const ownerAddress = CommonUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.ADDRESS]);
    const ownerPrivateKey = CommonUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.PRIVATE_KEY]);

    const firstTx = this.buildDbSetupTx(genesisTime, ownerPrivateKey);
    const secondTx = this.buildAccountsSetupTx(genesisTime, ownerPrivateKey, ownerAddress);
    const thirdTx = this.buildConsensusAppTx(genesisTime, ownerPrivateKey, ownerAddress);
    // TODO(liayoo): Change the logic to staking & signing by the current node.
    const stakingTxs = this.buildGenesisStakingTxs(genesisTime);

    return [firstTx, secondTx, thirdTx, ...stakingTxs];
  }

  static executeGenesisTxsAndGetData(genesisTxs, genesisTime) {
    const tempGenesisDb = new DB(
        new StateNode(StateVersions.EMPTY), StateVersions.EMPTY, null, -1, null);
    tempGenesisDb.initDbStates();
    const resList = [];
    for (const tx of genesisTxs) {
      const res = tempGenesisDb.executeTransaction(Transaction.toExecutable(tx), true, false, 0, genesisTime);
      if (CommonUtil.isFailedTx(res)) {
        logger.error(`Genesis transaction failed:\n${JSON.stringify(tx, null, 2)}` +
            `\nRESULT: ${JSON.stringify(res)}`)
        return null;
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

  static genesis() {
    // This is a temporary fix for the genesis block. Code should be modified after
    // genesis block broadcasting feature is implemented.
    const ownerAddress = CommonUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.ADDRESS]);
    const genesisTime = GENESIS_TIMESTAMP;
    const lastHash = '';
    const lastVotes = [];
    const evidence = {};
    const transactions = Block.getGenesisBlockTxs(genesisTime);
    const number = 0;
    const epoch = 0;
    const proposer = ownerAddress;
    const validators = GENESIS_VALIDATORS;
    const { stateProofHash, gasAmountTotal, gasCostTotal, receipts } =
        Block.executeGenesisTxsAndGetData(transactions, genesisTime);
    return new Block(lastHash, lastVotes, evidence, transactions, receipts, number, epoch,
        genesisTime, stateProofHash, proposer, validators, gasAmountTotal, gasCostTotal);
  }
}

module.exports = {
  Block
};
