const logger = new (require('../logger'))('BLOCK');

const stringify = require('fast-json-stable-stringify');
const sizeof = require('object-sizeof');
const CommonUtil = require('../common/common-util');
const Transaction = require('../tx-pool/transaction');
const { PredefinedDbPaths } = require('../common/constants');

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
}

module.exports = {
  Block
};
