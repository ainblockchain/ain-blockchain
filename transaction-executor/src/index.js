const {Command, flags} = require('@oclif/command');
const ChainUtil = require('../../chain-util');
const Transaction = require('../../db/transaction');
const fs = require('fs');
const sleep = require('system-sleep');
const jayson = require('jayson');
const JSON_RPC_ENDPOINT = '/json-rpc';
const JSON_RPC_SEND_TRANSACTION = 'ain_sendRawTransaction';

class TransactionExecutorCommand extends Command {
  async run() {
    const {flags} = this.parse(TransactionExecutorCommand);
    const transactionFile = flags.transactionFile;
    const server = flags.server;
    if (!Boolean(transactionFile) || !Boolean(server)) {
      throw Error('Must specify transactionFile and server');
    }
    this.log(`Broadcasting transactions in file ${transactionFile} to server ${server}`);
    const jsonRpcClient = jayson.client.http(server + JSON_RPC_ENDPOINT);
    const keyPair = ChainUtil.genKeyPair();
    const transactions = TransactionExecutorCommand.createTransactions(transactionFile, keyPair);
    await Promise.all(TransactionExecutorCommand.sendTransactions(transactions, jsonRpcClient)).then((values) => {
      console.log(values);
    });
  }

  static createTransactions(transactionFile, keyPair) {
    const transactions = [];
    const publicKey = keyPair.getPublic().encode('hex');
    console.log(`Using account credential ${publicKey}`);
    let nonce = -1;
    const lines = fs.readFileSync(transactionFile, 'utf-8').split('\n').filter(Boolean);
    lines.forEach((line) => {
      if (line.length > 0) {
        const transactionData = JSON.parse(line);
        if (typeof transactionData.nonce !== 'undefined') {
          nonce = transactionData.nonce;
          delete transactionData['nonce'];
        } else {
          nonce = nonce + 1;
        }
        const trans = new Transaction(Date.now(), transactionData, publicKey, keyPair.sign(ChainUtil.hash(transactionData)), nonce);
        if (!Transaction.verifyTransaction(trans)) {
          console.log(`Transaction ${JSON.stringify(trans)} is invalid`);
        }
        transactions.push(trans);
      }
    });
    return transactions;
  }


  static sendTransactions(transactions, jsonRpcClient) {
    const transactionResults = [];
    for (let i = 0; i < transactions.length; i++) {
      transactionResults.push(this.sendTransaction(transactions[i], jsonRpcClient));
      sleep(100);
    }
    return transactionResults;
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
transaction/ If no nonce is specified for a transaction, a nonce which is one greater
than the last transactions send will be automatically assigned
`;

TransactionExecutorCommand.flags = {
  // add --help flag to show CLI version
  help: flags.help({char: 'h'}),
  server: flags.string({char: 'n', description: `server to send rpc transasction (e.x http://localhost:8080)`}),
  transactionFile: flags.string({char: 'n', description: 'File containg one valid josn transaction per line'}),
};

module.exports = TransactionExecutorCommand;
