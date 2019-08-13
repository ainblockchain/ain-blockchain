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
    const server = flags.server;
    let address = flags.address || null;
    if (!Boolean(transactionFile) || !Boolean(server)) {
      throw Error('Must specify transactionFile and server\nExample: transaction-executor/bin/run' +
      '--server="http://localhost:8080" --transactionFile="./transactions.txt"');
    }
    this.log(`Broadcasting transactions in file ${transactionFile} to server ${server}`);
    const jsonRpcClient = jayson.client.http(server + JSON_RPC_ENDPOINT);
    // TODO: (chris) Persist and reload keypairs from disk.
    const keyPair = address === null ? ChainUtil.genKeyPair() : null;
    address = keyPair === null ? address: keyPair.getPublic().encode('hex');
    const transactions = TransactionExecutorCommand.createTransactions(transactionFile, keyPair, address);
    await Promise.all(TransactionExecutorCommand.sendTransactionList(transactions, jsonRpcClient)).then((values) => {
      console.log(values);
    });
  }

  static createTransactions(transactionFile, keyPair, address) {
    const transactions = [];
    if (keyPair === null) {
      console.log(`Using account credential ${address}`);
    } else {
      console.log(`Sending unverified transatcions using ${address}`);
    }

    let nonce = -1;
    let transactionAddress;
    const lines = fs.readFileSync(transactionFile, 'utf-8').split('\n').filter(Boolean);
    lines.forEach((line) => {
      if (line.length > 0) {
        if (line.includes(ADDRESS_KEY_WORD)) {
          line = line.replace(ADDRESS_REG_EX, `${address}`);
        }
        const transactionData = JSON.parse(line);

        if (typeof transactionData.nonce !== 'undefined') {
          nonce = transactionData.nonce;
          delete transactionData['nonce'];
        } else {
          nonce = nonce + 1;
        }

        if (keyPair === null || typeof transactionData.address !== 'undefined') {
          transactionData['skipVerif'] = true;
        }

        if (typeof transactionData.address !== 'undefined') {
          transactionAddress = transactionData.address;
          delete transactionAddress['address'];
        } else {
          transactionAddress = address;
        }

        // TODO: (chris) Use https://www.npmjs.com/package/@ainblockchain/ain-util package to sign transactions
        const trans = new Transaction(Date.now(), transactionData, transactionAddress, keyPair === null || address !== transactionAddress ? '' : keyPair.sign(ChainUtil.hash(transactionData)), nonce);
        if (trans.signature !== '' && !Transaction.verifyTransaction(trans)) {
          console.log(`Transaction ${JSON.stringify(trans)} is invalid`);
        }
        transactions.push(trans);
      }
    });
    return transactions;
  }


  static sendTransactionList(transactions, jsonRpcClient) {
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
transaction. If no nonce is specified for a transaction, a nonce which is one greater
than the last transaction sent will be automatically assigned.
`;

TransactionExecutorCommand.flags = {
  // add --help flag to show CLI version
  help: flags.help({char: 'h'}),
  server: flags.string({char: 'n', description: `server to send rpc transasction (e.x. http://localhost:8080)`}),
  transactionFile: flags.string({char: 'n', description: 'File containg one valid josn transaction per line'}),
  address: flags.string({char: 'n', description: 'Address to use instead of a valid address. Will result in skip verification being true.' +
                      'Alternatively address can be set in the transaction file (see sample transactions)'}),

};

module.exports = TransactionExecutorCommand;
