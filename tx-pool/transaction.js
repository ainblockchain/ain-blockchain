const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger')('TRANSACTION');
const {
  FeatureFlags,
  WriteDbOperations,
} = require('../common/constants');
const ChainUtil = require('../common/chain-util');

class Transaction {
  constructor(txBody, signature, hash, address, skipVerif, createdAt) {
    this.tx_body = JSON.parse(JSON.stringify(txBody));
    this.signature = signature;
    this.hash = hash;
    this.address = address;
    this.extra = {
      created_at: createdAt,
      executed_at: null,
    };
    if (skipVerif) {
      this.extra.skip_verif = skipVerif;
    }

    logger.debug(`CREATED TRANSACTION: ${JSON.stringify(this)}`);
  }

  static create(txBody, signature) {
    if (!Transaction.isValidTxBody(txBody)) {
      return null;
    }

    const hash = signature ? ChainUtil.hashSignature(signature) : ChainUtil.hashTxBody(txBody);
    let address = null;
    let skipVerif = false;
    // A devel method for bypassing the signature verification.
    if ((FeatureFlags.enableTxSigVerifWorkaround) && txBody.address !== undefined) {
      address = txBody.address;
      skipVerif = true;
    } else {
      address = ChainUtil.getAddressFromSignature(hash.slice(2), signature);
    }
    const createdAt = Date.now();
    return new Transaction(txBody, signature, hash, address, skipVerif, createdAt);
  }

  static fromTxBody(txBody, privateKey) {
    if (!Transaction.isValidTxBody(txBody)) {
      return null;
    }
    // A devel method for bypassing the transaction verification.
    let signature = '';
    if (!txBody.address) {
      const signed = ChainUtil.signTransaction(txBody, privateKey);
      signature = signed.signedTx.signature;
    }
    return Transaction.create(txBody, signature);
  }

  static isExecutable(tx) {
    return tx instanceof Transaction;
  }

  static toExecutable(tx) {
    if (this.isExecutable(tx)) {
      return tx;
    }
    return Transaction.create(tx.tx_body, tx.signature);
  }

  static toJsObject(tx) {
    return {
      tx_body: tx.tx_body,
      signature: tx.signature,
      hash: tx.hash,
      address: tx.address
    };
  }

  setExecutedAt(executedAt) {
    ChainUtil.setJsObject(this, ['extra', 'executed_at'], executedAt);
  }

  toString() {
    return JSON.stringify(this, null, 2);
  }

  /**
   * Sanitize SET operation.
   */
  static sanitizeSetOperation(setOp) {
    const opList = [];
    if (Array.isArray(setOp.op_list)) {
      for (const op of setOp.op_list) {
        opList.push(this.sanitizeSimpleOperation(op));
      }
    }
    return {
      type: setOp.type === WriteDbOperations.SET ? setOp.type : null,
      op_list: opList,
    };
  }

  /**
   * Sanitize simple operation.
   */
  static sanitizeSimpleOperation(op) {
    const sanitized = {}
    switch (op.type) {
      case undefined:
      case WriteDbOperations.SET_VALUE:
      case WriteDbOperations.SET_RULE:
      case WriteDbOperations.SET_FUNCTION:
      case WriteDbOperations.SET_OWNER:
        if (op.ref) {
          sanitized.ref = ChainUtil.stringOrEmpty(op.ref);
        }
        if (op.value !== undefined) {
          sanitized.value = op.value;
        }
        break;
      case WriteDbOperations.INC_VALUE:
      case WriteDbOperations.DEC_VALUE:
        if (op.ref) {
          sanitized.ref = ChainUtil.stringOrEmpty(op.ref);
        }
        if (op.value !== undefined) {
          sanitized.value = ChainUtil.numberOrZero(op.value);
        }
        break;
      default:
    }
    if (op.type) {
      sanitized.type = ChainUtil.stringOrEmpty(op.type);
    }
    if (op.is_global !== undefined) {
      sanitized.is_global = ChainUtil.boolOrFalse(op.is_global);
    }
    return sanitized;
  }

  /**
   * Sanitize operation.
   */
  static sanitizeOperation(op) {
    return (op.type === WriteDbOperations.SET) ?
        this.sanitizeSetOperation(op) : this.sanitizeSimpleOperation(op);
  }

  /**
   * Sanitize transaction body.
   */
  static sanitizeTxBody(txBody) {
    const sanitized = {
      operation: Transaction.sanitizeOperation(txBody.operation),
      nonce: ChainUtil.numberOrZero(txBody.nonce),
      timestamp: ChainUtil.numberOrZero(txBody.timestamp),
    };
    if (txBody.parent_tx_hash !== undefined) {
      sanitized.parent_tx_hash = ChainUtil.stringOrEmpty(txBody.parent_tx_hash);
    }
    if (txBody.gas_price !== undefined) {
      sanitized.gas_price = ChainUtil.numberOrZero(txBody.gas_price);
    }
    // A devel method for bypassing the transaction verification.
    if (txBody.address !== undefined) {
      sanitized.address = ChainUtil.stringOrEmpty(txBody.address);
    }
    return sanitized;
  }

  static verifyTransaction(tx) {
    if (!tx || !Transaction.isValidTxBody(tx.tx_body)) {
      logger.info(`Invalid transaction body: ${JSON.stringify(tx, null, 2)}`);
      return false;
    }
    // A devel method for bypassing the transaction verification.
    if (_.get(tx, 'extra.skip_verif')) {
      logger.info('Skip verifying signature for transaction: ' + JSON.stringify(tx, null, 2));
      return true;
    }
    return ainUtil.ecVerifySig(tx.tx_body, tx.signature, tx.address);
  }

  static isValidTxBody(txBody) {
    if (!Transaction.hasRequiredFields(txBody)) {
      logger.info(`Transaction body has some missing fields: ${JSON.stringify(txBody, null, 2)}`);
      return false;
    }
    return Transaction.isInStandardFormat(txBody);
  }

  static hasRequiredFields(txBody) {
    return txBody && txBody.timestamp !== undefined && txBody.nonce !== undefined &&
        txBody.operation !== undefined;
  }

  static isInStandardFormat(txBody) {
    const sanitized = Transaction.sanitizeTxBody(txBody);
    const isIdentical = _.isEqual(JSON.parse(JSON.stringify(sanitized)), txBody, { strict: true });
    if (!isIdentical) {
      logger.info(
          `Transaction body in a non-standard format ` +
          `- input:\n${JSON.stringify(txBody, null, 2)}\n\n` +
          `- sanitized:\n${JSON.stringify(sanitized, null, 2)}\n\n`);
      return false;
    }
    return true;
  }

  static isBatchTxBody(txBody) {
    return txBody && Array.isArray(txBody.tx_body_list);
  }

  static isBatchTransaction(tx) {
    return tx && Array.isArray(tx.tx_list);
  }
}

module.exports = Transaction;
