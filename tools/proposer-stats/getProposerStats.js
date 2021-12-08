/**
 * Fetches a list of blocks and counts how many blocks were proposed by each address.
 * Note that the script includes the end block number.
 */
const axios = require('axios');
const _ = require('lodash');
const CommonUtil = require('../../common/common-util');
const { BlockchainConsts, NodeConfigs } = require('../../common/constants');

async function getBlockList(from, to, endpointUrl) {
  console.log(`getting block list from ${from} to ${to}`);
  return await axios.post(
    `${endpointUrl}/json-rpc`,
    {
      method: 'ain_getBlockList',
      params: {
        from,
        to,
        protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
      },
      jsonrpc: '2.0',
      id: 0
    })
    .then(function(resp) {
      return _.get(resp, 'data.result.result');
    })
}

async function getProposerStats(startBlockNumber, endBlockNumber, endpointUrl) {
  console.log(`* Gathering blockchain info... ${startBlockNumber} ... ${endBlockNumber}`);
  const blocksProposed = {};
  let totalCount = 0;
  for (let i = startBlockNumber; i <= endBlockNumber; i += NodeConfigs.CHAIN_SEGMENT_LENGTH) {
    const blockList = await getBlockList(i, Math.min(endBlockNumber + 1, i + NodeConfigs.CHAIN_SEGMENT_LENGTH), endpointUrl);
    console.log(`blockList: ${blockList.length}`);
    for (const block of blockList) {
      if (!blocksProposed[block.proposer]) {
        blocksProposed[block.proposer] = 0;
      }
      blocksProposed[block.proposer]++;
    }
    await CommonUtil.sleep(2000);
  }

  for (const [address, count] of Object.entries(blocksProposed)) {
    console.log(`  > # of Blocks proposed by ${address}: ${count}`);
    totalCount += count;
  }
  console.log(`  > # of Blocks proposed in total: ${totalCount}`);
}

async function processArguments() {
  if (process.argv.length !== 5) {
    console.log('Invalid number of args');
    usage();
  }
  const startBlockNumber = CommonUtil.numberOrZero(Number(process.argv[2]));
  const endBlockNumber = CommonUtil.numberOrZero(Number(process.argv[3]));
  const endpointUrl = process.argv[4];
  await getProposerStats(startBlockNumber, endBlockNumber, endpointUrl);
}

function usage() {
  console.log('\nUsage: node getProposerStats.js <start block number> <end block number> <node url>\n');
  console.log('Example:  node getProposerStats.js 0 200 http://localhost:8081');
  process.exit(0)
}

processArguments();
