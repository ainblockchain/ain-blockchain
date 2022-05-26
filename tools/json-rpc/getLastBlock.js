const _ = require('lodash');
const axios = require('axios');
const { JSON_RPC_METHODS } = require('../../json_rpc/constants');
const { endpoint } = require('./config_local');

const queryOnNode = (method, params) => {
  return axios.post(
    endpoint,
    {
      method,
      params: Object.assign(params, { protoVer: '1.0.6' }),
      jsonrpc: '2.0',
      id: 1
    }
  ).then((resp) => {
    return _.get(resp, 'data.result.result');
  }).catch((err) => {
    console.error(`Failed to send get request: ${err}`);
    return null;
  });
}

const usage = () => {
  console.log('\nExample commandlines:\n  node index.js\n');
}

const main = async () => {
  if (process.argv.length !== 2) {
    usage();
    process.exit(0);
  }
  const result = await queryOnNode(JSON_RPC_METHODS.AIN_GET_LAST_BLOCK, { });
  // const result = await queryOnNode(JSON_RPC_METHODS.AIN_GET_LAST_BLOCK_NUMBER, { });
  console.log(result);
}

main();
