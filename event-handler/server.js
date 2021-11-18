const logger = new (require('../logger'))('EVENT_HANDLER_SERVER');
const EventHandlerClient = require('./client');
const ws = require('ws');
const { getIpAddress } = require('../common/network-util');
const {
  HOSTING_ENV,
  EventHandlerMessageTypes,
  EVENT_HANDLER_PORT,
} = require('../common/constants');

class EventHandlerServer {
  constructor(eventHandler) {
    this.eventHandler = eventHandler;
    this.wsServer = null;
    this.clients = {};
    this.eventFilterIdToClientId = {};
  }

  async getNetworkInfo() {
    const intIp = await getIpAddress(true);
    const extIp = await getIpAddress(false);
    const intUrl = new URL(`ws://${intIp}:${EVENT_HANDLER_PORT}`);
    const extUrl = new URL(`ws://${extIp}:${EVENT_HANDLER_PORT}`);
    const eventHandlerUrl = HOSTING_ENV === 'comcom' || HOSTING_ENV === 'local' ?
        intUrl.toString() : extUrl.toString();
    return {
      url: eventHandlerUrl,
      port: EVENT_HANDLER_PORT,
    }
  }

  startListen() {
    this.wsServer = new ws.Server({
      port: EVENT_HANDLER_PORT,
    });
    this.wsServer.on('connection', this.handleConnection);
  }

  handleConnection(webSocket) {
    const clientId = Date.now(); // Memo: Only used in blockchain
    if (this.clients[clientId]) { // TODO: Retry logic
      throw Error(`Client ID ${clientId} is already in use`);
    }
    const client = new EventHandlerClient(clientId, webSocket);
    this.clients[clientId] = client;
    // TODO(cshcomcom): Handle MAX connections

    logger.info(`New connection (${clientId})`);
    webSocket.on('message', (message) => {
      this.handleMessage(client, message);
    });

    // TODO(cshcomcom): ping-pong & close broken connections
  }

  handleMessage(client, message) {
    try {
      const parsedMessage = JSON.parse(message);
      const messageType = parsedMessage.type;
      if (!messageType) {
        throw Error(`Can't find type from message (${JSON.stringify(message)})`);
      }
      const data = parsedMessage.data;
      if (!data) {
        throw Error(`Can't find data from message (${JSON.stringify(message)})`);
      }
      switch (messageType) {
        case EventHandlerMessageTypes.EVENT_FILTER_REGISTRATION:
          const eventFilterId = data.id;
          const eventType = data.type;
          if (!eventType) {
            throw Error(`Can't find eventType from message.data (${JSON.stringify(message)})`);
          }
          const config = data.config;
          if (!config) {
            throw Error(`Can't find config from message.data (${JSON.stringify(message)})`);
          }

          const eventFilter =
              this.eventHandler.createAndRegisterEventFilter(eventFilterId, eventType, config);
          client.addEventFilter(eventFilter);
          this.eventFilterIdToClientId[eventFilter.id] = client.id;
          break;
        case EventHandlerMessageTypes.EVENT_FILTER_UNREGISTRATION:
          // TODO(cshcomcom): Implement
          break;
        default:
          throw Error(`Invalid message type (${messageType})`);
      }
    } catch (err) {
      logger.error(`Error while process message (${JSON.stringify(message, null, 2)})`);
      // TODO(cshcomcom): Error handling with client
    }
  }

  makeMessage(messageType, data) {
    return {
      type: messageType,
      data: data,
    };
  }

  propagateEvent(client, event) {
    client.webSocket.send(this.makeMessage(EventHandlerMessageTypes.EVENT_EMIT,
        JSON.stringify(event.toObject())));
  }

  propagateEventByEventFilterId(eventFilterId, event) {
    const clientId = this.eventFilterIdToClientId[eventFilterId];
    const client = this.clients[clientId];
    if (!client) {
      logger.error(`Can't find client by event filter id (eventFilterId: ${eventFilterId})`);
      return;
    }
    this.propagateEvent(client, event);
  }

  close() {
    this.wsServer.close(() => {
      logger.info(`Closed event handler server's socket`);
      // TODO(cshcomcom): Clear all data
    });
  }
}

module.exports = EventHandlerServer;