const _get = require('lodash/get');
const {
  NodeConfigs,
  WriteDbOperations,
  PredefinedDbPaths,
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const { ConsensusErrorCodeSetToVoteAgainst } = require('../common/result-code');
const CommonUtil = require('../common/common-util');
const Transaction = require('../tx-pool/transaction');
const DB = require('../db');

class ConsensusUtil {
  static isValidConsensusTx(tx) {
    const executableTx = Transaction.toExecutable(tx);
    if (!Transaction.isExecutable(executableTx)) {
      return false;
    }
    if (!NodeConfigs.LIGHTWEIGHT) {
      const chainId = DB.getBlockchainParam('genesis/chain_id');
      if (!Transaction.verifyTransaction(executableTx, chainId)) {
        return false;
      }
    }
    const nonce = _get(tx, 'tx_body.nonce');
    if (nonce !== -1) {
      return false;
    }
    const op = _get(tx, 'tx_body.operation');
    if (!op) {
      return false;
    }
    const consensusTxPrefix = CommonUtil.formatPath(
        [PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_NUMBER]);
    if (op.type === WriteDbOperations.SET_VALUE) { // vote tx
      return op.ref.startsWith(consensusTxPrefix);
    } else if (op.type === WriteDbOperations.SET) { // propose tx
      const opList = op.op_list;
      if (!opList || opList.length > 2) {
        return false;
      }
      opList.forEach((innerOp) => {
        if (!innerOp.ref.startsWith(consensusTxPrefix)) return false;
      })
      return true;
    } else {
      return false;
    }
  }

  static isProposalTx(tx) {
    const op = _get(tx, 'tx_body.operation');
    if (!op || op.type !== WriteDbOperations.SET) return false;
    return _get(op, 'op_list.0.ref', '').endsWith(PredefinedDbPaths.CONSENSUS_PROPOSE);
  }

  static filterProposalFromVotes(votes) {
    if (!votes) return null;
    const proposal = votes.filter((tx) => ConsensusUtil.isProposalTx(tx));
    return proposal.length ? proposal[0] : null;
  }

  static getBlockHashFromConsensusTx(tx) {
    const op = _get(tx, 'tx_body.operation');
    if (!tx) return null;
    if (!op) return null;
    if (op.type === WriteDbOperations.SET_VALUE) { // vote tx
      return _get(op, 'value.block_hash');
    } else if (op.type === WriteDbOperations.SET) { // propose tx
      return _get(op, 'op_list.0.value.block_hash');
    } else {
      return null;
    }
  }

  static getBlockNumberFromConsensusTx(tx) {
    const op = _get(tx, 'tx_body.operation');
    if (!tx) return null;
    if (!op) return null;
    let parsedPath = [];
    if (op.type === WriteDbOperations.SET_VALUE) { // vote tx
      parsedPath = CommonUtil.parsePath(_get(op, 'ref'));
    } else if (op.type === WriteDbOperations.SET) { // propose tx
      parsedPath = CommonUtil.parsePath(_get(op, 'op_list.0.ref'));
    } else {
      return null;
    }
    return _get(parsedPath, 2); // /consensus/number/${blockNumber}/...
  }

  static getStakeFromVoteTx(tx) {
    return _get(tx, 'tx_body.operation.value.stake', 0);
  }

  static getOffenseTypeFromVoteTx(tx) {
    return _get(tx, 'tx_body.operation.value.offense_type');
  }

  static getTimestampFromVoteTx(tx) {
    return _get(tx, 'tx_body.timestamp');
  }

  static isAgainstVoteTx(tx) {
    return _get(tx, 'tx_body.operation.value.is_against') === true;
  }

  static getOffensesFromProposalTx(tx) {
    if (!ConsensusUtil.isProposalTx(tx)) return {};
    return _get(tx, 'tx_body.operation.op_list.0.value.offenses', {});
  }

  static getTotalAtStake(validators) {
    return Object.values(validators).reduce((acc, cur) => {
      return acc + _get(cur, PredefinedDbPaths.CONSENSUS_STAKE, 0);
    }, 0);
  }

  static isVoteAgainstBlockError(errorCode) {
    return ConsensusErrorCodeSetToVoteAgainst.has(errorCode);
  }

  static getInvalidBlockHashesFromBlock(block) {
    const invalidBlockHashList = [];
    if (CommonUtil.isEmpty(block.evidence)) {
      return [];
    }
    for (const evidenceList of Object.values(block.evidence)) {
      for (const evidenceForOffense of evidenceList) {
        invalidBlockHashList.push(_get(evidenceForOffense, 'block.hash'));
      }
    }
    return invalidBlockHashList;
  }

  static addTrafficEventsForProposalTx(proposalTx) {
    const txTimestamp = proposalTx.tx_body.timestamp;
    const currentTime = Date.now();
    trafficStatsManager.addEvent(
        TrafficEventTypes.PROPOSE_P2P_MESSAGE, currentTime - txTimestamp, currentTime);
  }

  static addTrafficEventsForVoteTx(voteTx) {
    const txTimestamp = voteTx.tx_body.timestamp;
    const currentTime = Date.now();
    trafficStatsManager.addEvent(
        TrafficEventTypes.VOTE_P2P_MESSAGE, currentTime - txTimestamp, currentTime);
  }
}

module.exports = ConsensusUtil;
