const logger = new (require('../logger'))('NETWORK-UTIL');

const _ = require('lodash');
const axios = require('axios');
const { BlockchainConsts, NodeConfigs, HostingEnvs } = require('../common/constants');
const ip = require('ip');
const extIp = require('ext-ip')();
const CommonUtil = require('../common/common-util');
const DB = require('../db');
const { JSON_RPC_METHODS } = require('../json_rpc/constants');
const GCP_EXTERNAL_IP_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip';
const GCP_INTERNAL_IP_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/ip';
const AWS_TOKEN_URL = 'http://169.254.169.254/latest/api/token';
const AWS_EXTERNAL_IP_URL = 'http://169.254.169.254/latest/meta-data/public-ipv4';
const AWS_INTERNAL_IP_URL = 'http://169.254.169.254/latest/meta-data/local-ipv4';

axios.defaults.timeout = NodeConfigs.DEFAULT_AXIOS_REQUEST_TIMEOUT;

async function _waitUntilTxFinalize(endpoint, txHash) {
  while (true) {
    const confirmed = await sendGetRequest(
      endpoint,
      JSON_RPC_METHODS.AIN_GET_TRANSACTION_BY_HASH,
      { hash: txHash }
    )
      .then((resp) => {
        return (_.get(resp, 'data.result.result.is_finalized', false) === true);
      })
      .catch((err) => {
        logger.error(`Failed to confirm transaction: ${err}`);
        return false;
      });
    if (confirmed) {
      return true;
    }
    await CommonUtil.sleep(1000);
  }
}

async function sendTxAndWaitForFinalization(endpoint, tx, privateKey) {
  const res = await signAndSendTx(endpoint, tx, privateKey);
  if (_.get(res, 'errMsg', false) || !_.get(res, 'success', false)) {
    throw Error(`Failed to sign and send tx: ${res.errMsg}`);
  }
  if (!(await _waitUntilTxFinalize(endpoint, _.get(res, 'txHash', null)))) {
    throw Error('Transaction did not finalize in time.' +
      'Try selecting a different parent_chain_poc.');
  }
}

async function sendSignedTx(endpoint, params) {
  return await axios.post(
    endpoint,
    {
      method: JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION,
      params,
      jsonrpc: '2.0',
      id: 0
    }
  ).then((resp) => {
    const result = _.get(resp, 'data.result.result.result', {});
    const success = !CommonUtil.isFailedTx(result);
    return { success, errMsg: result.message };
  }).catch((err) => {
    logger.error(`Failed to send transaction: ${err}`);
    return { success: false, errMsg: err.message };
  });
}

// FIXME(minsulee2): this is duplicated function see: ./tools/util.js
async function signAndSendTx(endpoint, tx, privateKey) {
  const { txHash, signedTx } = CommonUtil.signTransaction(
      tx, privateKey, DB.getBlockchainParam('genesis/chain_id'));
  const result = await sendSignedTx(endpoint, signedTx);
  return Object.assign(result, { txHash });
}

function sendGetRequest(endpoint, method, params) {
  // NOTE(platfowner): .then() was used here to avoid some unexpected behavior of axios.post()
  //                   (see https://github.com/ainblockchain/ain-blockchain/issues/101)
  return axios.post(
    endpoint,
    {
      method,
      params: Object.assign(params, { protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION }),
      jsonrpc: '2.0',
      id: 0
    }
  ).then((resp) => {
    return resp;
  }).catch((err) => {
    logger.error(`Failed to send get request: ${err}`);
    return null;
  });
}

function getIpAddress(internal = false) {
  return Promise.resolve()
  .then(() => {
    if (NodeConfigs.HOSTING_ENV === HostingEnvs.GCP) {
      return axios.get(internal ? GCP_INTERNAL_IP_URL : GCP_EXTERNAL_IP_URL, {
        headers: {'Metadata-Flavor': 'Google'},
        timeout: 3000
      })
      .then((res) => {
        return res.data;
      })
      .catch((err) => {
        CommonUtil.finishWithStackTrace(
            logger, `Failed to get ip address: ${JSON.stringify(err, null, 2)}`);
      });
    } else if (NodeConfigs.HOSTING_ENV === HostingEnvs.AWS) {
      const token = axios.put(AWS_TOKEN_URL, { }, {
        headers: {'X-aws-ec2-metadata-token-ttl-seconds': 21600}
      })
      .then((res) => {
        return res.data;
      })
      .catch((err) => {
        CommonUtil.finishWithStackTrace(
            logger, `Failed to get aws token: ${JSON.stringify(err, null, 2)}`);
      });
      return axios.get(internal ? AWS_INTERNAL_IP_URL : AWS_EXTERNAL_IP_URL, {
        headers: {'X-aws-ec2-metadata-token': token},
        timeout: 3000
      })
      .then((res) => {
        return res.data;
      })
      .catch((err) => {
        CommonUtil.finishWithStackTrace(
            logger, `Failed to get ip address: ${JSON.stringify(err, null, 2)}`);
      });
    } else {
      if (internal) {
        return ip.address();
      } else {
        return extIp.get();
      }
    }
  }).then((ipAddr) => {
    return ipAddr;
  });
}

// NOTE(minsulee2): This builds the URL using a client socket in the server side.
function buildRemoteUrlFromSocket(socket) {
  const remoteAddress = _.get(socket, '_socket.remoteAddress', '');
  const remotePort = _.get(socket, '_socket.remotePort', '');
  return `${remoteAddress}:${remotePort}`;
}

module.exports = {
  sendTxAndWaitForFinalization,
  sendSignedTx,
  signAndSendTx,
  sendGetRequest,
  getIpAddress,
  buildRemoteUrlFromSocket,
};
