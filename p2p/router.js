const _ = require('lodash');
const Websocket = require('ws');
const {
  P2P_ROUTER_PORT,
  P2pRouterStates
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
      console.log('connected!!!!!!!!!!!!!')
      this.setRouterEventHandlers(socket);
    });
    logger.info(`Listening to peer-to-peer router on: ${P2P_ROUTER_PORT}\n`);
  }

  setRouterEventHandlers(socket) {
    socket.on('message', (message) => {
      const parsedMessage = JSON.parse(message);
      switch (_.get(parsedMessage, 'type')) {
        case P2pRouterStates.NEW_PEERS_REQUEST:
          const connectionNodeInfo = Object.assign({ isAlive: true }, parsedMessage.data);
          setPeerNodes(socket, connectionNodeInfo);
          const newManagedPeerInfoList = assignRandomPeers(connectionNodeInfo);
          const connectionMessage = {
            type: P2pRouterStates.NEW_PEERS_RESPONSE,
            data: {
              newManagedPeerInfoList,
              numLivePeers: getNumNodesAlive() - 1   // except for me.
            }
          };
          logger.info(`>> Message to node [${abbrAddr(connectionNodeInfo.address)}]: ` +
            `${JSON.stringify(connectionMessage, null, 2)}`);
            socket.send(JSON.stringify(connectionMessage));
          printNodesInfo();
          break;
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
      const address = wsList[ws.uuid];
      logger.info(`Disconnected from node [${address ? abbrAddr(address) : 'unknown'}] ` +
        `with code: ${code}`);
      delete wsList[ws.uuid];
      peerNodes[address].isAlive = false;
      printNodesInfo();
    });

    socket.on('error', (error) => {
      const address = wsList[ws.uuid];
      logger.error(`Error in communication with node [${abbrAddr(address)}]: ` +
        `${JSON.stringify(error, null, 2)}`);
    });
  }
}

module.exports = P2pRouter;
