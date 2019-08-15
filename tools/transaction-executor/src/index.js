const {Command, flags} = require('@oclif/command');
const ChainUtil = require('../../../chain-util');
const Transaction = require('../../../db/transaction');
const fs = require('fs');
const sleep = require('system-sleep');
const jayson = require('jayson');
const JSON_RPC_ENDPOINT = '/json-rpc';
const JSON_RPC_SEND_TRANSACTION = 'ain_sendTransaction';
const ADDRESS_KEY_WORD = '{address}';
const ADDRESS_REG_EX = new RegExp(ADDRESS_KEY_WORD, 'g');

class TransactionExecutorCommand extends Command {
  async run() {
    const {flags} = this.parse(TransactionExecutorCommand);
    const transactionFile = flags.transactionFile;
    const server = flags.server || null;
    const generateKeyPair = flags.generateKeyPair ? flags.generateKeyPair.toLowerCase()[0] === 't' : true;
    if (!(transactionFile) || !(server)) {
      throw Error('Must specify transactionFile and server\nExample: transaction-executor/bin/run' +
      '--server="http://localhost:8080" --transactionFile="./transactions.txt"');
    }
    this.log(`Broadcasting transactions in file ${transactionFile} to server ${server}`);
    const jsonRpcClient = jayson.client.http(server + JSON_RPC_ENDPOINT);
    // TODO: (chris) Persist and reload keypairs from disk.
    let transactions;
    if (generateKeyPair) {
      const keyPair = ChainUtil.genKeyPair();
      const address = keyPair.getPublic().encode('hex');
      transactions = TransactionExecutorCommand.createSignedTransactionList(transactionFile, keyPair, address);
    } else {
      transactions = TransactionExecutorCommand.createUnsignedTransactionList(transactionFile);
    }

    await Promise.all(TransactionExecutorCommand.sendTransactionList(transactions, jsonRpcClient)).then((values) => {
      console.log(values);
    });
  }


  static createSignedTransactionList(transactionFile, keyPair, address) {
    // All transactionsa are from one sender so only one nonce needs to be tracked
    let globalNonce = 0;
    const transactions = [];
    TransactionExecutorCommand.getFileLines(transactionFile).forEach((line) => {
      if (line.match(ADDRESS_REG_EX)) {
        line = line.replace(ADDRESS_REG_EX, `${address}`);
      }
      const transactionData = TransactionExecutorCommand.parseLine(line);
      if (typeof transactionData.address !== 'undefined') {
        throw Error(`Address field can not be specified for signed transactions\n ${line}`);
      }
      const transactionNonce = TransactionExecutorCommand.getNonce(transactionData, globalNonce);
      if (transactionNonce >= 0) {
        globalNonce = transactionNonce + 1;
      }
      const trans = new Transaction(Date.now(), transactionData, address, keyPair.sign(ChainUtil.hash(transactionData)), transactionNonce);
      transactions.push(trans);
    });
    return transactions;
  }

  static createUnsignedTransactionList(transactionFile) {
    const globalNonceTracker = {};
    const transactions = [];
    TransactionExecutorCommand.getFileLines(transactionFile).forEach((line) => {
      const transactionData = TransactionExecutorCommand.parseLine(line);
      if (typeof transactionData.address === 'undefined') {
        throw Error(`No address specified for transaction ${line}`);
      }
      const transactionAddress = transactionData.address;
      delete transactionData['address'];
      transactionData['skipVerif'] = true;
      const transactionNonce = TransactionExecutorCommand.getNonce(transactionData, globalNonceTracker[transactionAddress] ? globalNonceTracker[transactionAddress]: 0);
      if (transactionNonce >= 0) {
        globalNonceTracker[transactionAddress] = transactionNonce + 1;
      }
      // TODO: (chris) Use https://www.npmjs.com/package/@ainblockchain/ain-util package to sign transactions
      const trans = new Transaction(Date.now(), transactionData, transactionAddress, '', transactionNonce);
      transactions.push(trans);
    });
    return transactions;
  }

  static getNonce(transactionData, nonce) {
    if (typeof transactionData.nonce !== 'undefined') {
      nonce = transactionData.nonce;
      delete transactionData['nonce'];
    }
    return nonce;
  }

  static parseLine(line) {
    return JSON.parse(line);
  }

  static sendTransactionList(transactions, jsonRpcClient) {
    const transactionResults = [];
    for (let i = 0; i < transactions.length; i++) {
      transactionResults.push(this.sendTransaction(transactions[i], jsonRpcClient));
      sleep(100);
    }
    return transactionResults;
  }

  static getFileLines(transactionFile) {
    return fs.readFileSync(transactionFile, 'utf-8').split('\n').filter(Boolean);
  }

  static sendTransaction(transaction, jsonRpcClient) {
    return new Promise(function(resolve, reject) {
      jsonRpcClient.request(JSON_RPC_SEND_TRANSACTION, [JSON.parse(JSON.stringify(transaction))],
          function(err, response) {
            if (err) {
              reject(err);
            } else {
              resolve(response);
            }
          });
    });
  }
}

TransactionExecutorCommand.description = `Reads transactions from file and sends them to the specified server
...
Creates a valid privae/public key pair and uses this pair to send transactions
to the speified server. Transactions must be specified in valid JSON format, with 
a single transaction written on each line. Nonces can be optionally added to each 
transaction. If no nonce is specified for a transaction, a nonce which is one greater
than the last transaction sent will be automatically assigned.
`;

TransactionExecutorCommand.flags = {
  // add --help flag to show CLI version
  help: flags.help({char: 'h'}),
  server: flags.string({char: 's', description: `server to send rpc transasction (e.x. http://localhost:8080)`}),
  transactionFile: flags.string({char: 't', description: 'File containg one valid josn transaction per line'}),
  generateKeyPair: flags.string({char: 'g', description: 'Indicates whether to generate a valid public/private key pair for signing and ' +
      'sending transactions. Please note that if this value is set to false, any transaction without an address will result in an error.'}),
};

module.exports = TransactionExecutorCommand;
