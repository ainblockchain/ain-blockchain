const _ = require('lodash');
const Websocket = require('ws');
const {
  P2P_ROUTER_PORT,
  RouterMessageTypes
} = require('../common/constants');
const logger = require('../logger')('P2P_ROUTER');

const MAX_LISTENERS = 3;

class P2pRouter {
  constructor(P2pClient, P2pServer) {
    this.client = P2pClient;
    this.server = P2pServer;
  }

  listen() {
    this.routeServer = new Websocket.Server({
      port: P2P_ROUTER_PORT,
      // Enables server-side compression. For option details, see
      // https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback
      perMessageDeflate: {
        zlibDeflateOptions: {
          // See zlib defaults.
          chunkSize: 1024,
          memLevel: 7,
          level: 3
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024
        },
        // Other options settable:
        clientNoContextTakeover: true, // Defaults to negotiated value.
        serverNoContextTakeover: true, // Defaults to negotiated value.
        serverMaxWindowBits: 10, // Defaults to negotiated value.
        // Below options specified as default values.
        concurrencyLimit: 10, // Limits zlib concurrency for perf.
        threshold: 1024 // Size (in bytes) below which messages should not be compressed.
      }
    });
    // Set the number of maximum clients.
    this.routeServer.setMaxListeners(MAX_LISTENERS);
    this.routeServer.on('connection', (socket) => {
      this.setRouterEventHandlers(socket);
    });
    logger.info(`Listening to peer-to-peer router on: ${P2P_ROUTER_PORT}\n`);
  }

  getMaxNumberOfNewPeers(nodeInfo) {
    const numOfCandidates = nodeInfo.networkStatus.connectionStatus.targetOutBound -
        nodeInfo.networkStatus.connectionStatus.outgoingPeers.length;
    if (numOfCandidates > 0) {
      return numOfCandidates;
    } else {
      return 0;
    }
  }

  assignRandomPeers(nodeInfo) {
    const maxNumberOfNewPeers = this.getMaxNumberOfNewPeers(nodeInfo);
    console.log(this.server.inbound)
    if (maxNumberOfNewPeers) {
      const candidates = Object.values(this.server.inbound)
        .filter(peer =>
          peer.peerInfo.address !== nodeInfo.address &&
          // peer.peerInfo.isAlive === true &&   // FIXME(minsulee2): need to update
          !peer.peerInfo.networkStatus.connectionStatus.incomingPeers.includes(nodeInfo.address) &&
          peer.peerInfo.networkStatus.connectionStatus.incomingPeers.length <
              peer.peerInfo.networkStatus.connectionStatus.maxInbound)
        .sort((a, b) =>
          a.peerInfo.networkStatus.connectionStatus.incomingPeers -
              b.peerInfo.networkStatus.connectionStatus.incomingPeers)
        .slice(0, maxNumberOfNewPeers);
      return candidates;
    } else {
      return [];
    }
  }

  setRouterEventHandlers(socket) {
    socket.on('message', (message) => {
      const parsedMessage = JSON.parse(message);
      switch (_.get(parsedMessage, 'type')) {
        case RouterMessageTypes.CONNECTION_REQUEST:
          if (Object.keys(this.server.inbound).length < this.server.maxInbound) {
            const message = {
              type: RouterMessageTypes.CONNECTION_RESPONSE,
              data: this.client.getStatus()
            }
            socket.send(JSON.stringify(message));
          } else {
            const connectionNodeInfo = Object.assign({ isAlive: true }, parsedMessage.data);
            const newManagedPeerInfoList = this.assignRandomPeers(connectionNodeInfo);
            const connectionMessage = {
              type: RouterMessageTypes.NEW_PEERS_RESPONSE,
              data: newManagedPeerInfoList
            };
            socket.send(JSON.stringify(connectionMessage));
          }
          break;
        // FIXME(minsulee2): This should be done in peerEventHandlers
        // case TrackerMessageTypes.PEER_INFO_UPDATE:
        //   const updateNodeInfo = Object.assign({ isAlive: true }, parsedMessage.data);
        //   setPeerNodes(socket, updateNodeInfo);
        //   printNodesInfo();
        //   break;
        default:
          logger.error(`Unknown message type(${parsedMessage.type}) has been ` +
            'specified. Ignore the message.');
          break;
      }
    });

    socket.on('close', (code) => {
      logger.info(`Disconnected from router [${socket.url} : 'unknown'}] with code: ${code}`);
    });

    socket.on('error', (error) => {
      logger.error(`Error in communication with router [${abbrAddr(address)}]: ` +
        `${JSON.stringify(error, null, 2)}`);
    });
  }
}

module.exports = P2pRouter;
