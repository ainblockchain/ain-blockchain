const { Command, flags } = require('@oclif/command');
const ChainUtil = require('../../../chain-util');
const Transaction = require('../../../tx-pool/transaction');
const fs = require('fs');
const sleep = require('system-sleep');
const jayson = require('jayson');
const JSON_RPC_ENDPOINT = '/json-rpc';
const JSON_RPC_SEND_TRANSACTION = 'ain_sendSignedTransaction';
const ADDRESS_KEY_WORD = '{address}';
const ADDRESS_REG_EX = new RegExp(ADDRESS_KEY_WORD, 'g');
const EC = require('elliptic').ec;
const ainUtil = require('@ainblockchain/ain-util');
const ec = new EC('secp256k1');

class TransactionExecutorCommand extends Command {
  async run() {
    const { flags } = this.parse(TransactionExecutorCommand);
    const transactionFile = flags.transactionFile;
    const server = flags.server || null;
    const generateKeyPair = flags.generateKeyPair ? flags.generateKeyPair.toLowerCase().startsWith('t') : false;
    const privateKeyString = flags.privateKey || null;
    if (!(transactionFile) || !(server)) {
      throw Error('Must specify transactionFile and server\nExample: transaction-executor/bin/run' +
        '--server="http://localhost:8080" --transactionFile="./transactions.txt"');
    }

    if (generateKeyPair && privateKeyString) {
      throw Error('Both generateKeyPair and privateKey can not be specified.');
    }
    this.log(`Broadcasting transactions in file ${transactionFile} to server ${server}`);
    const jsonRpcClient = jayson.client.http(server + JSON_RPC_ENDPOINT);
    // TODO: (chris) Persist and reload keypairs from disk.
    let transactions;
    if (generateKeyPair) {
      const keyPair = ChainUtil.genKeyPair();
      transactions = TransactionExecutorCommand.createSignedTransactionList(transactionFile, keyPair);
    } else if (privateKeyString) {
      const keyPair = ec.keyFromPrivate(privateKeyString, 'hex')
      keyPair.getPublic()
      transactions = TransactionExecutorCommand.createSignedTransactionList(transactionFile, keyPair);
    } else {
      transactions = TransactionExecutorCommand.createUnsignedTransactionList(transactionFile);
    }
    await Promise.all(TransactionExecutorCommand.sendTransactionList(transactions, jsonRpcClient)).then((values) => {
      console.log(values);
    });
  }

  static createSignedTransactionList(transactionFile, keyPair) {
    const transactions = [];
    const privateKey = keyPair.priv
    TransactionExecutorCommand.getFileLines(transactionFile).forEach((line) => {
      if (line.match(ADDRESS_REG_EX)) {
        const publicKey = ainUtil.toChecksumAddress(ainUtil.bufferToHex(
          ainUtil.pubToAddress(
            Buffer.from(keyPair.getPublic().encode('hex'), 'hex'),
            true
          )
        ));
        line = line.replace(ADDRESS_REG_EX, `${publicKey}`);
      }
      const transactionData = TransactionExecutorCommand.parseLine(line);
      if (Transaction.isBatchTransaction(transactionData)) {
        const txList = [];
        transactionData.tx_list.forEach((subData) => {
          if (typeof subData.address !== 'undefined') {
            throw Error(`Address field should NOT be specified:\n${line}`);
          }
          if (typeof subData.nonce === 'undefined') {
            throw Error(`Nonce field should be specified:\n${line}`);
          }
          txList.push(Transaction.newTransaction(privateKey, subData));
        })
        transactions.push({ tx_list: txList });
      } else {
        if (typeof transactionData.address !== 'undefined') {
          throw Error(`Address field should NOT be specified:\n${line}`);
        }
        if (typeof transactionData.nonce === 'undefined') {
          throw Error(`Nonce field should be specified:\n${line}`);
        }
        const trans = Transaction.newTransaction(privateKey, transactionData);
        transactions.push(trans);
      }
    });
    return transactions;
  }

  static createUnsignedTransactionList(transactionFile) {
    const transactions = [];
    TransactionExecutorCommand.getFileLines(transactionFile).forEach((line) => {
      const transactionData = TransactionExecutorCommand.parseLine(line);
      if (Transaction.isBatchTransaction(transactionData)) {
        const txList = [];
        transactionData.tx_list.forEach((subData) => {
          if (typeof subData.address === 'undefined') {
            throw Error(`Address field should be specified:\n${line}`);
          }
          if (typeof subData.nonce === 'undefined') {
            throw Error(`Nonce field should be specified:\n${line}`);
          }
          subData.skip_verif = true;
          txList.push(Transaction.newTransaction('', subData));
        })
        transactions.push({ tx_list: txList });
      } else {
        if (typeof transactionData.address === 'undefined') {
          throw Error(`Address field should be specified:\n${line}`);
        }
        if (typeof transactionData.nonce === 'undefined') {
          throw Error(`Nonce field should be specified:\n${line}`);
        }
        transactionData.skip_verif = true;
        const trans = Transaction.newTransaction('', transactionData);
        transactions.push(trans);
      }
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
    return new Promise(function (resolve, reject) {
      jsonRpcClient.request(JSON_RPC_SEND_TRANSACTION, JSON.parse(JSON.stringify(transaction)),
        function (err, response) {
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
  help: flags.help({ char: 'h' }),
  server: flags.string({ char: 's', description: 'server to send rpc transasction (e.x. http://localhost:8080)' }),
  transactionFile: flags.string({ char: 't', description: 'File containg one valid josn transaction per line' }),
  privateKey: flags.string({ char: 'p', description: 'Specific private key to use when sending transactions' }),
  generateKeyPair: flags.string({
    char: 'g',
    description: 'Indicates whether to generate a valid public/private key pair for signing and ' +
      'sending transactions. Please note that if this value is set to false, any transaction without an address will result in an error.'
  }),
};

module.exports = TransactionExecutorCommand;
