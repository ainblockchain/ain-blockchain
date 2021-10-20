const _get = require('lodash/get');
const { WriteDbOperations, PredefinedDbPaths, LIGHTWEIGHT } = require('../common/constants');
const CommonUtil = require('../common/common-util');
const { ConsensusErrorCodesToVoteAgainst } = require('./constants');
const Transaction = require('../tx-pool/transaction');

class ConsensusUtil {
  static isValidConsensusTx(tx) {
    const executableTx = Transaction.toExecutable(tx);
    if (!Transaction.isExecutable(executableTx)) {
      return false;
    }
    if (!LIGHTWEIGHT) {
      if (!Transaction.verifyTransaction(executableTx)) {
        return false;
      }
    }
    const op = _get(tx, 'tx_body.operation');
    if (!op) return false;
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
    if (!tx || !op) return null;
    if (op.type === WriteDbOperations.SET_VALUE) { // vote tx
      return _get(op, 'value.block_hash');
    } else if (op.type === WriteDbOperations.SET) { // propose tx
      return _get(op, 'op_list.0.value.block_hash');
    } else {
      return null;
    }
  }

  static getStakeFromVoteTx(tx) {
    return _get(tx, 'tx_body.operation.value.stake');
  }

  static getOffenseTypeFromVoteTx(tx) {
    return _get(tx, 'tx_body.operation.value.offense_type');
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
    return ConsensusErrorCodesToVoteAgainst.has(errorCode);
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
}

module.exports = ConsensusUtil;
