const express = require('express');
const axios = require('axios').default;
const commonUtil = require('../../common/common-util');

const app = express();

const PORT = 8000;

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

const buildGraphData = (peerNodes) => {
  const data = { nodes: [], links: [] };
  const peerNodeIdMap = { };

  Object.keys(peerNodes).forEach((peerNode, i) => {
    Object.assign(peerNodeIdMap, { [peerNode]: i });
    data.nodes.push({ address: peerNode });
  });

  Object.values(peerNodes).forEach(nodeInfo => {
    const id = peerNodeIdMap[nodeInfo.address];
    const outGoingList = nodeInfo.networkStatus.connectionStatus.outgoingPeers;
    outGoingList.forEach(address => {
      data.links.push({ source: id, target: peerNodeIdMap[address], weight: 1 });
    });
  });

  return data;
}

const getGraphData = async () => {
  const networkStatusResponse = await axios.get('http://localhost:8080/network_status');
  const networkStatus = networkStatusResponse.data;
  if (!commonUtil.isEmpty(networkStatus.peerNodes)) {
    const data = buildGraphData(networkStatus.peerNodes);
    return data;
  } else {
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

app.get('/', (req, res) => {
  res.render(__dirname + '/index.html', {}, async (err, html) => {
    const data = await getGraphData();
    html = html.replace(/{ \/\* replace this \*\/ };/g, JSON.stringify(data));
    res.send(html);
  });
});

app.listen(PORT, () => {
  console.log(`Listening at http://localhost:${PORT}`);
});
