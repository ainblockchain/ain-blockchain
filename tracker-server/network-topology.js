const commonUtil = require('../common/common-util');
const {
  abbrAddr,
  isNodeAlive
} = require('./util');

const _buildGraphData = (blockchainNode) => {
  const filteredblockchainNodesEntries = Object.entries(blockchainNode)
      .filter(([, node]) => isNodeAlive(node));
  const blockchainNodeAlive = Object.fromEntries(filteredblockchainNodesEntries);
  const data = { nodes: [], links: [] };
  const blockchainNodeIdMap = { };

  Object.keys(blockchainNodeAlive).forEach((address, i) => {
    Object.assign(blockchainNodeIdMap, { [address]: i });
    data.nodes.push({ address: abbrAddr(address) });
  });

  Object.entries(blockchainNodeAlive).forEach(([address, nodeInfo]) => {
    const outGoingList = nodeInfo.networkStatus.connectionStatus.outgoingPeers;
    outGoingList.forEach(outGoingAddress => {
      data.links.push({
        source: blockchainNodeIdMap[address], target: blockchainNodeIdMap[outGoingAddress], weight: 1
      });
    });
  });

  return data;
}

const getGraphData = (networkStatus) => {
  try {
    if (!commonUtil.isEmpty(networkStatus.blockchainNode)) {
      const data = _buildGraphData(networkStatus.blockchainNode);
      return data;
    } else {
      return {
        "nodes": [
          { "address": "Blockchain nodes are NOT online." },
          { "address": "Blockchain nodes are NOT online." }
        ],
        "links": [
          { "source": 0, "target": 1, "weight": 1 }
        ],
      };
    }
  } catch (error) {
    return {
      "nodes": [
        { "address": "Something went wrong!" },
        { "error": error }
      ],
      "links": [
        { "source": 0, "target": 1, "weight": 1 }
      ],
    };
  }
}

module.exports = {
  getGraphData
};
