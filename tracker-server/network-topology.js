const commonUtil = require('../common/common-util');

const abbrAddr = (address) => {
  return `${address.substring(0, 6)}..${address.substring(address.length - 4)}`;
}

const _buildGraphData = (peerNodes) => {
  const data = { nodes: [], links: [] };
  const peerNodeIdMap = { };

  Object.keys(peerNodes).forEach((peerNode, i) => {
    Object.assign(peerNodeIdMap, { [peerNode]: i });
    data.nodes.push({ address: abbrAddr(peerNode) });
  });

  Object.entries(peerNodes).forEach(([address, nodeInfo]) => {
    const outGoingList = nodeInfo.networkStatus.connectionStatus.outgoingPeers;
    outGoingList.forEach(outGoingAddress => {
      data.links.push({
        source: peerNodeIdMap[address], target: peerNodeIdMap[outGoingAddress], weight: 1
      });
    });
  });

  return data;
}

const getGraphData = async (networkStatus) => {
  try {
    if (!commonUtil.isEmpty(networkStatus.peerNodes)) {
      const data = _buildGraphData(networkStatus.peerNodes);
      return data;
    } else {
      return {
        "nodes": [
          { "address": "Peer nodes are NOT online." },
          { "address": "Peer nodes are NOT online." }
        ],
        "links": [
          { "source": 0, "target": 1, "weight": 1 }
        ],
      };
    }
  } catch (error) {
    return {
      "nodes": [
        { "address": "Tracker is NOT online." },
        { "address": "Tracker is NOT online." }
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
