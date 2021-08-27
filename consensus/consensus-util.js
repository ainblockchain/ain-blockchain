const _get = require('lodash/get');
const { WriteDbOperations, PredefinedDbPaths } = require('../common/constants');
const CommonUtil = require('../common/common-util');

class ConsensusUtil {
  static isValidConsensusTx(tx) {
    const op = _get(tx, 'tx_body.operation');
    if (!op) return false;
    const consensusTxPrefix = CommonUtil.formatPath(
        [PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_NUMBER]);
    if (op.type === WriteDbOperations.SET_VALUE) {
      return op.ref.startsWith(consensusTxPrefix);
    } else if (op.type === WriteDbOperations.SET) {
      const opList = op.op_list;
      if (!opList || opList.length !== 2) {
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
    if (!op) return false;
    if (op.type === WriteDbOperations.SET_VALUE) {
      return op.ref.endsWith(PredefinedDbPaths.CONSENSUS_PROPOSE);
    } else if (op.type === WriteDbOperations.SET) {
      return _get(op, 'op_list.0.ref', '').endsWith(PredefinedDbPaths.CONSENSUS_PROPOSE);
    }
    return false;
  }

  static filterProposalFromVotes(votes) {
    if (!votes) return null;
    const proposal = votes.filter((tx) => ConsensusUtil.isProposalTx(tx));
    return proposal.length ? proposal[0] : null;
  }

  static getBlockHashFromConsensusTx(tx) {
    const op = _get(tx, 'tx_body.operation');
    if (!tx || !op) return null;
    if (op.type === WriteDbOperations.SET_VALUE) {
      return _get(op, 'value.block_hash');
    } else if (op.type === WriteDbOperations.SET) {
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
    return _get(tx, 'tx_body.operation.value.offenses', {});
  }
}

module.exports = ConsensusUtil;
