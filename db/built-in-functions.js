const { PredefinedDbPaths, FunctionResultCode } = require('../constants');
const ChainUtil = require('../chain-util');

const FUNC_PARAM_PATTERN = /^{(.*)}$/;

const FunctionPaths = {
  TRANSFER: `${PredefinedDbPaths.TRANSFER}/{from}/{to}/{key}/${PredefinedDbPaths.TRANSFER_VALUE}`
};

/**
 * Built-in functions with function paths.
 */
class BuiltInFunctions {
  constructor(db) {
    this.db = db;
    this.funcMap = {
      [FunctionPaths.TRANSFER]: this._transfer.bind(this)
    };
  }

  /**
   * Runs functions of function paths matched with given database path.
   * 
   * @param {Array} parsedValuePath parsed value path
   * @param {*} value value set on the database path
   */
  runFunctions(parsedValuePath, value) {
    const matches = this._matchFunctionPaths(parsedValuePath);
    matches.forEach((elem) => {
      console.log(
        `  ==> Running built-in function '${elem.func.name}' with value '${value}' and params: ` +
        JSON.stringify(elem.params));
      elem.func(value, { params: elem.params });
    })
  }

  // TODO(seo): Optimize function path matching (e.g. using Aho-Corasick-like algorithm).
  _matchFunctionPaths(parsedValuePath) {
    let funcs = [];
    Object.keys(this.funcMap).forEach((path) => {
      const parsedFuncPath = ChainUtil.parsePath(path);
      const result = BuiltInFunctions.matchPaths(parsedValuePath, parsedFuncPath);
      if (result !== null) {
        funcs.push({ func: this.funcMap[path], params: result.params })
      }
    });
    return funcs;
  }

  static matchPaths(parsedValuePath, parsedFuncPath) {
    if (parsedFuncPath.length === parsedValuePath.length) {
      let params = {};
      let matched = true;
      for (let i = 0; i < parsedFuncPath.length; i++) {
        if (parsedFuncPath[i].match(FUNC_PARAM_PATTERN)) {
          const paramName = parsedFuncPath[i].replace(FUNC_PARAM_PATTERN, '$1');
          params[paramName] = parsedValuePath[i];
        } else if (parsedFuncPath[i] !== parsedValuePath[i]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        return { params };
      }
    }
    return null
  }

  // TODO(seo): Add adress validity check.
  _transfer(value, context) {
    const from = context.params.from;
    const to = context.params.to;
    const key = context.params.key;
    const fromBalancePath = this._getBalancePath(from);
    const toBalancePath = this._getBalancePath(to);
    let fromBalance = this.db.getValue(fromBalancePath);
    let toBalance = this.db.getValue(toBalancePath);
    if (fromBalance >= value) {
      const resultPath = this._getTransferResultPath(from, to, key);
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(fromBalancePath)),
          fromBalance - value);
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(toBalancePath)),
          toBalance + value);
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
          { code: FunctionResultCode.SUCCESS });
    } else {
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
          { code: FunctionResultCode.FAILURE });
    }
  }

  _getBalancePath(address) {
    return `${PredefinedDbPaths.ACCOUNT}/${address}/${PredefinedDbPaths.BALANCE}`;
  }

  _getTransferResultPath(from, to, key) {
    return (
      `${PredefinedDbPaths.TRANSFER}/${from}/${to}/${key}/${PredefinedDbPaths.TRANSFER_RESULT}`);
  }

  _getFullValuePath(parsedPath) {
    return this.db.getFullPath(parsedPath, PredefinedDbPaths.VALUES_ROOT);
  }
}

module.exports = BuiltInFunctions;
