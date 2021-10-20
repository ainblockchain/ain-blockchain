const commonUtil = require('../common/common-util');
const { abbrAddr } = require('./util');

const _buildGraphData = (peerNodes) => {
  const filteredPeerNodesEntries = Object.entries(peerNodes).filter(([address, peerNode]) => {
    return peerNode.isAlive === true
  });
  const peerNodesAlive = Object.fromEntries(filteredPeerNodesEntries);
  const data = { nodes: [], links: [] };
  const peerNodeIdMap = { };

  Object.keys(peerNodesAlive).forEach((address, i) => {
    Object.assign(peerNodeIdMap, { [address]: i });
    data.nodes.push({ address: abbrAddr(address) });
  });

  Object.entries(peerNodesAlive).forEach(([address, nodeInfo]) => {
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
