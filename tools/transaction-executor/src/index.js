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
    const generateKeyPair = flags.generateKeyPair ? flags.generateKeyPair.toLowerCase().startsWith('t') : true;
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
      transactions = TransactionExecutorCommand.createSignedTransactionList(transactionFile, keyPair);
    } else {
      transactions = TransactionExecutorCommand.createUnsignedTransactionList(transactionFile);
    }
    await Promise.all(TransactionExecutorCommand.sendTransactionList(transactions, jsonRpcClient)).then((values) => {
      console.log(values);
    });
  }

  static createSignedTransactionList(transactionFile, keyPair) {
    const address = keyPair.getPublic().encode('hex');
    const transactions = [];
    TransactionExecutorCommand.getFileLines(transactionFile).forEach((line) => {
      if (line.match(ADDRESS_REG_EX)) {
        line = line.replace(ADDRESS_REG_EX, `${address}`);
      }
      const transactionData = TransactionExecutorCommand.parseLine(line);
      if (typeof transactionData.address !== undefined || typeof transactionData.nonce === undefined) {
        throw Error(`Address field must not be specified and nonce must be specified\n${line}`);
      }

      const transactionNonce = transactionData.nonce;
      delete transactionData['nonce'];
      // TODO: (chris) Use https://www.npmjs.com/package/@ainblockchain/ain-util package to sign transactions
      const trans = new Transaction(Date.now(), transactionData, address, keyPair.sign(ChainUtil.hash(transactionData)), transactionNonce);
      transactions.push(trans);
    });
    return transactions;
  }

  static createUnsignedTransactionList(transactionFile) {
    const transactions = [];
    TransactionExecutorCommand.getFileLines(transactionFile).forEach((line) => {
      const transactionData = TransactionExecutorCommand.parseLine(line);
      if (typeof transactionData.address === undefined || typeof transactionData.nonce === undefined) {
        throw Error(`Address must be specified and nonce must be specified\n${line}`);
      }
      const transactionAddress = transactionData.address;
      const transactionNonce = transactionData.nonce;
      transactionData.skipVerif = true;

      delete transactionData['address'];
      delete transactionData['nonce'];
      const trans = new Transaction(Date.now(), transactionData, transactionAddress, '', transactionNonce);
      transactions.push(trans);
    });
    return transactions;
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
a single transaction written on each line. Nonce must be specified for all transactions.
Address must be speficied for each transaction if --generateKeyPair=false. Otherise address
must not be specified for any trasnaction.
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
