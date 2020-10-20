const _ = require("lodash");
const axios = require('axios');
const ainUtil = require('@ainblockchain/ain-util');
const config = require("./config");
const ChainUtil = require('../../chain-util');

const CURRENT_PROTOCOL_VERSION = require('../../package.json').version;

function signTx(tx, keyBuffer) {
  const sig = ainUtil.ecSignTransaction(tx, keyBuffer);
  const sigBuffer = ainUtil.toBuffer(sig);
  const lenHash = sigBuffer.length - 65;
  const hashedData = sigBuffer.slice(0, lenHash);
  const txHash = '0x' + hashedData.toString('hex');
  return {
    txHash,
    signedTx: {
      signature: sig,
      transaction: tx
    }
  };
}

function signAndSendTx(endpoint, txBody, keyBuffer) {
  const { txHash, signedTx } = signTx(txBody, keyBuffer);
  const params = {
    protoVer: CURRENT_PROTOCOL_VERSION,
    signature: signedTx.signature,
    transaction: signedTx.transaction,
  };
  return axios.post(
      endpoint,
      {
        method: "ain_sendSignedTransaction",
        params,
        jsonrpc: "2.0",
        id: 0
      })
  .then(resp => {
    const result = _.get(resp, 'data.result');
    console.log(`result: ${JSON.stringify(result, null, 2)}`);
    if (ChainUtil.transactionFailed(result)) {
      throw Error(`Transaction failed: ${JSON.stringify(result)}`);
    }
    return { txHash, signedTx };
  })
  .catch(err => {
    console.log(`Failed to send transaction: ${err}`);
    return { errMsg: err.message };
  });
}

function sendSetupTransaction(endpoint, keyBuffer) {
  console.log('Sending setup transaction...')
  const setupTxBody = {
    operation: {
      type: "SET",
      op_list: [
        {
          type: "SET_OWNER",
          ref: `${config.targetPath}`,
          value: {
            ".owner": {
              "owners": {
                [config.address]: {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true,
                },
                "*": {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true,
                },
              }
            }
          }
        },
        {
          type: "SET_RULE",
          ref: `${config.targetPath}`,
          value: {
            ".write": `auth === '${ChainUtil.toCksumAddr(config.address)}'`
          }
        }
      ]
    },
    timestamp: Date.now(),
    nonce: -1
  }
  console.log(`setupTxBody: ${JSON.stringify(setupTxBody, null, 2)}`);
  return signAndSendTx(endpoint, setupTxBody, keyBuffer);
}

function sendJobTransaction(endpoint, keyBuffer) {
  console.log('Sending job transaction...')
  const jobTxBody = {
    operation: {
      type: "INC_VALUE",
      ref: `${config.targetPath}`,
      value: 1,
    },
    timestamp: Date.now(),
    nonce: -1
  }
  console.log(`jobTxBody: ${JSON.stringify(jobTxBody, null, 2)}`);
  return signAndSendTx(endpoint, jobTxBody, keyBuffer);
}

async function sendTransaction(setup) {
  console.log(`config: ${JSON.stringify(config, null, 2)}`);
  const endpoint = `${config.nodeUrl}/json-rpc`;
  const keyBuffer = Buffer.from(config.privateKey, 'hex');
  const txInfo = setup ? await sendSetupTransaction(endpoint, keyBuffer) :
      await sendJobTransaction(endpoint, keyBuffer);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
}

function processArguments() {
  if (process.argv.length !== 2 && process.argv.length !== 3) {
    usage();
  }
  if (process.argv.length === 3 && process.argv[2] !== '-s') {
    console.log('Invalid option: ' + process.argv[2])
    usage();
  }
  sendTransaction(process.argv.length === 3);
}

function usage() {
  console.log('\nExample commandlines:\n  node sendTransaction.js -s\n')
  console.log('\n  node sendTransaction.js\n')
  process.exit(0)
}

processArguments()