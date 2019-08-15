const {PredefinedDbPaths, FunctionResultCode} = require('../constants');

class BuiltInFunctions {
  constructor(db) {
    this.db = db;
  }

  transfer(snapshot, context) {
    const transferPath = context.params.dbPath;
    const from = context.params.from;
    const to = context.params.to;
    const value = snapshot;
    const fromBalancePath = this._getBalancePath(from);
    const toBalancePath = this._getBalancePath(to);
    let fromBalance = this.db.get(fromBalancePath);
    let toBalance = this.db.get(toBalancePath);
    if (fromBalance >= value) {
      this.db.setWithPermission(fromBalancePath, fromBalance - value);
      this.db.setWithPermission(toBalancePath, toBalance + value);
      this.db.setWithPermission(this._getTransferResultPath(transferPath), { code: FunctionResultCode.SUCCESS });
    } else {
      this.db.setWithPermission(this._getTransferResultPath(transferPath), { code: FunctionResultCode.FAILURE });
    }
  }

  _getBalancePath(address) {
    return `${PredefinedDbPaths.ACCOUNT}/${address}/${PredefinedDbPaths.BALANCE}`;
  }

  _getTransferResultPath(transferPath) {
    return `${transferPath}/${PredefinedDbPaths.TRASNSFER_RESULT}`;
  }
}

module.exports = BuiltInFunctions;
