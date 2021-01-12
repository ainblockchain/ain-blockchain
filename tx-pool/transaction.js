const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const stringify = require('fast-json-stable-stringify');
const logger = require('../logger')('TRANSACTION');
const { WriteDbOperations } = require('../common/constants');
const ChainUtil = require('../common/chain-util');

class Transaction {
  constructor(txBody, signature, hash, address, skipVerif) {
    this.tx_body = JSON.parse(JSON.stringify(txBody));
    this.signature = signature;
    this.hash = hash;
    this.address = address;
    if (skipVerif) {
      this.skip_verif = skipVerif;
    }

    logger.debug(`CREATED TRANSACTION: ${JSON.stringify(this)}`);
  }

  // TODO(seo): Move the validity check on transaction bodies to the request facing points (e.g.
  //            ain_sendSignedTransaction, client APIs, and P2P message handler), i.e. do it
  //            as early as possible.
  static create(txBody, signature) {
    if (!Transaction.isValidTxBody(txBody)) {
      return null;
    }

    const hash = '0x' + ainUtil.hashTransaction(txBody).toString('hex');

    let address = null;
    let skipVerif = null;
    // A devel method for bypassing the transaction verification.
    if (txBody.address !== undefined) {
      address = txBody.address;
      skipVerif = true;
    } else {
      address = Transaction.getAddress(hash.slice(2), signature);
    }

    return new Transaction(txBody, signature, hash, address, skipVerif);
  }

  static signTxBody(txBody, privateKey) {
    if (!Transaction.isValidTxBody(txBody)) {
      return null;
    }
    // A devel method for bypassing the transaction verification.
    const signature = txBody.address !== undefined ?
        '' : ainUtil.ecSignTransaction(txBody, Buffer.from(privateKey, 'hex'));
    return Transaction.create(txBody, signature);
  }

  toString() {
    return `hash:               ${this.hash},
            address:            ${this.address},
            tx_body.nonce:      ${this.tx_body.nonce},
            tx_body.timestamp:  ${this.tx_body.timestamp},
            tx_body.operation:  ${stringify(this.tx_body.operation)},
            ${this.tx_body.skip_verif !== undefined ?
                'tx_body.skip_verif:     ' + this.tx_body.skip_verif + ',' : ''}
            ${this.parent_tx_hash !== undefined ?
                'parent_tx_hash:         ' + this.parent_tx_hash : ''}
        `;
  }

  /**
   * Gets address from hash and signature.
   */
  static getAddress(hash, signature) {
    const sigBuffer = ainUtil.toBuffer(signature);
    const len = sigBuffer.length;
    const lenHash = len - 65;
    const {r, s, v} = ainUtil.ecSplitSig(sigBuffer.slice(lenHash, len));
    const publicKey = ainUtil.ecRecoverPub(Buffer.from(hash, 'hex'), r, s, v);
    return ainUtil.toChecksumAddress(ainUtil.bufferToHex(
        ainUtil.pubToAddress(publicKey, publicKey.length === 65)));
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
    // A devel method for bypassing the transaction verification.
    if (txBody.address !== undefined) {
      sanitized.address = ChainUtil.stringOrEmpty(txBody.address);
    }
    return sanitized;
  }

  static verifyTransaction(tx) {
    if (tx.tx_body !== undefined &&
        tx.tx_body.operation !== undefined &&
        tx.tx_body.operation.type !== undefined &&
        Object.keys(WriteDbOperations).indexOf(tx.tx_body.operation.type) === -1) {
      logger.info(`Invalid transaction type: ${tx.tx_body.operation.type}`);
      return false;
    }
    // A devel method for bypassing the transaction verification.
    if (tx.skip_verif) {
      logger.info('Skip verifying signature for transaction: ' +
          JSON.stringify(tx, null, 2));
      return true;
    }
    return ainUtil.ecVerifySig(tx.tx_body, tx.signature, tx.address);
  }

  static isValidTxBody(txBody) {
    if (!Transaction.hasRequiredFields(txBody)) {
      logger.info(
          `Transaction body with missing timestamp, operation or nonce: ` +
          `${JSON.stringify(txBody, null, 2)}`);
      return false;
    }
    const sanitized = Transaction.sanitizeTxBody(txBody);
    if (!Transaction.isValidFormat(txBody)) {
      logger.info(
          `Transaction body in a non-standard format ` +
          `- input:\n${JSON.stringify(txBody, null, 2)}\n\n` +
          `- sanitized:\n${JSON.stringify(sanitized, null, 2)}\n\n`);
      return false;
    }
    return true;
  }

  static hasRequiredFields(txBody) {
    return txBody.timestamp !== undefined && txBody.nonce !== undefined &&
        txBody.operation !== undefined;
  }

  static isValidFormat(txBody) {
    const sanitized = Transaction.sanitizeTxBody(txBody);
    return _.isEqual(JSON.parse(JSON.stringify(sanitized)), txBody, { strict: true });
  }

  static isBatchTxBody(txBody) {
    return Array.isArray(txBody.tx_list);
  }

  static isBatchTransaction(tx) {
    return Array.isArray(tx.tx_list);
  }
}

module.exports = Transaction;
