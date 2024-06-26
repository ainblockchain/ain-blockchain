const logger = new (require('../logger'))('TRANSACTION');

const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const {
  NodeConfigs,
  WriteDbOperations,
} = require('../common/constants');
const CommonUtil = require('../common/common-util');

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

  static create(txBody, signature, chainId) {
    if (!Transaction.isValidTxBody(txBody)) {
      return null;
    }

    const hash = signature ? CommonUtil.hashSignature(signature) : CommonUtil.hashTxBody(txBody);
    let address = null;
    let skipVerif = false;
    // A devel method for bypassing the signature verification.
    if (NodeConfigs.ENABLE_TX_SIG_VERIF_WORKAROUND && txBody.address !== undefined) {
      address = txBody.address;
      skipVerif = true;
    } else {
      address = CommonUtil.getAddressFromSignature(logger, hash.slice(2), signature, chainId);
    }
    const createdAt = Date.now();
    return new Transaction(txBody, signature, hash, address, skipVerif, createdAt);
  }

  static fromTxBody(txBody, privateKey, chainId) {
    if (!Transaction.isValidTxBody(txBody)) {
      return null;
    }
    // A devel method for bypassing the transaction verification.
    let signature = '';
    if (!txBody.address) {
      const signed = CommonUtil.signTransaction(txBody, privateKey, chainId);
      const sig = _.get(signed, 'signedTx.signature', null);
      if (!sig) {
        return null;
      }
      signature = sig;
    }
    return Transaction.create(txBody, signature, chainId);
  }

  static isExecutable(tx) {
    return tx instanceof Transaction;
  }

  static toExecutable(tx, chainId) {
    if (this.isExecutable(tx)) {
      return tx;
    }
    return Transaction.create(tx.tx_body, tx.signature, chainId);
  }

  static toJsObject(tx) {
    return {
      tx_body: tx.tx_body,
      signature: tx.signature,
      hash: tx.hash,
      address: tx.address
    };
  }

  setExtraField(name, value) {
    if (value === null) {
      delete this.extra[name];
    } else {
      CommonUtil.setJsObject(this, ['extra', name], value);
    }
  }

  toString() {
    return JSON.stringify(this, null, 2);
  }

  /**
   * Sanitize SET operation.
   */
  static sanitizeSetOperation(setOp) {
    const opList = [];
    if (CommonUtil.isArray(setOp.op_list)) {
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
          sanitized.ref = CommonUtil.stringOrEmpty(op.ref);
        }
        if (op.value !== undefined) {
          sanitized.value = op.value;
        }
        break;
      case WriteDbOperations.INC_VALUE:
      case WriteDbOperations.DEC_VALUE:
        if (op.ref) {
          sanitized.ref = CommonUtil.stringOrEmpty(op.ref);
        }
        if (op.value !== undefined) {
          sanitized.value = CommonUtil.numberOrZero(op.value);
        }
        break;
      default:
    }
    if (op.type) {
      sanitized.type = CommonUtil.stringOrEmpty(op.type);
    }
    if (op.is_global !== undefined) {
      sanitized.is_global = CommonUtil.boolOrFalse(op.is_global);
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
      nonce: CommonUtil.numberOrZero(txBody.nonce),
      timestamp: CommonUtil.numberOrZero(txBody.timestamp),
    };
    if (txBody.parent_tx_hash !== undefined) {
      sanitized.parent_tx_hash = CommonUtil.stringOrEmpty(txBody.parent_tx_hash);
    }
    if (txBody.gas_price !== undefined) {
      sanitized.gas_price = CommonUtil.numberOrZero(txBody.gas_price);
    }
    if (txBody.billing !== undefined) {
      sanitized.billing = CommonUtil.stringOrEmpty(txBody.billing);
    }
    // A devel method for bypassing the transaction verification.
    if (txBody.address !== undefined) {
      sanitized.address = CommonUtil.stringOrEmpty(txBody.address);
    }
    return sanitized;
  }

  static verifyTransaction(tx, chainId) {
    const LOG_HEADER = 'verifyTransaction';
    if (!tx || !Transaction.isValidTxBody(tx.tx_body)) {
      logger.info(`[${LOG_HEADER}] Invalid transaction body: ${JSON.stringify(tx, null, 2)}`);
      return false;
    }
    // A devel method for bypassing the transaction verification.
    if (_.get(tx, 'extra.skip_verif')) {
      logger.info(`[${LOG_HEADER}] Skip verifying signature for transaction: ` + JSON.stringify(tx, null, 2));
      return true;
    }
    try {
      return ainUtil.ecVerifySig(tx.tx_body, tx.signature, tx.address, chainId);
    } catch (err) {
      logger.info(`[${LOG_HEADER}] Signature verifycation failed with error: ${err.message}`);
      return false;
    }
  }

  static isValidTxBody(txBody) {
    const LOG_HEADER = 'isValidTxBody';
    if (!Transaction.hasRequiredFields(txBody)) {
      logger.info(`[${LOG_HEADER}] Transaction body has some missing fields: ${JSON.stringify(txBody, null, 2)}`);
      return false;
    }
    if (!Transaction.isValidNonce(txBody.nonce)) {
      logger.info(`[${LOG_HEADER}] Transaction body has invalid nonce: ${JSON.stringify(txBody, null, 2)}`);
      return false;
    }
    if (!Transaction.isValidGasPrice(txBody.gas_price)) {
      logger.info(`[${LOG_HEADER}] Transaction body has invalid gas price: ${JSON.stringify(txBody, null, 2)}`);
      return false;
    }
    if (!Transaction.isValidBilling(txBody.billing)) {
      logger.info(`[${LOG_HEADER}] Transaction body has invalid billing: ${JSON.stringify(txBody, null, 2)}`);
      return false;
    }
    return Transaction.isInStandardFormat(txBody);
  }

  static hasRequiredFields(txBody) {
    return txBody && txBody.operation !== undefined && txBody.timestamp !== undefined &&
        txBody.nonce !== undefined;
  }

  static isValidNonce(nonce) {
    return CommonUtil.isInteger(nonce) && nonce >= -2;
  }

  static isValidGasPrice(gasPrice) {
    // NOTE(platfowner): Allow 'undefined' value for backward compatibility.
    return gasPrice > 0 || NodeConfigs.ENABLE_GAS_FEE_WORKAROUND && (gasPrice === undefined || gasPrice === 0);
  }

  static isValidBilling(billing) {
    return billing === undefined || (CommonUtil.isString(billing) && billing.split('|').length === 2);
  }

  static isInStandardFormat(txBody) {
    const sanitized = Transaction.sanitizeTxBody(txBody);
    const isIdentical = _.isEqual(JSON.parse(JSON.stringify(sanitized)), txBody, { strict: true });
    if (!isIdentical) {
      const diffLines = CommonUtil.getJsonDiff(sanitized, txBody);
      logger.info(`Transaction body is in a non-standard format:\n${diffLines}\n`);
      return false;
    }
    if (sanitized.operation.type === WriteDbOperations.SET &&
        CommonUtil.isEmpty(sanitized.operation.op_list)) {
      return false;
    }
    return true;
  }

  static isBatchTxBody(txBody) {
    return txBody && CommonUtil.isArray(txBody.tx_body_list);
  }

  static isBatchTransaction(tx) {
    return tx && CommonUtil.isArray(tx.tx_list);
  }
  static isFreeTransaction(tx) {
    return tx.tx_body.gas_price === undefined || tx.tx_body.gas_price === 0;
  }
}

module.exports = Transaction;
