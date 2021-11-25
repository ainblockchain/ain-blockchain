const logger = new (require('../logger'))('EVENT_HANDLER_SERVER');
const EventChannel = require('./event-channel');
const ws = require('ws');
const { getIpAddress } = require('../common/network-util');
const {
  HOSTING_ENV,
  BlockchainEventMessageTypes,
  EVENT_HANDLER_PORT,
} = require('../common/constants');

class EventHandlerServer {
  constructor(eventHandler) {
    this.eventHandler = eventHandler;
    this.wsServer = null;
    this.channels = {};
    this.filterIdToChannelId = {};
  }

  async getNetworkInfo() {
    const ipAddr = await getIpAddress(HOSTING_ENV === 'comcom' || HOSTING_ENV === 'local');
    const eventHandlerUrl = new URL(`ws://${ipAddr}:${EVENT_HANDLER_PORT}`);
    return {
      url: eventHandlerUrl.toString(),
      port: EVENT_HANDLER_PORT,
    }
  }

  startListening() {
    this.wsServer = new ws.Server({
      port: EVENT_HANDLER_PORT,
    });
    this.wsServer.on('connection', this.handleConnection);
  }

  handleConnection(webSocket) {
    const channelId = Date.now(); // Memo: Only used in blockchain
    if (this.channels[channelId]) { // TODO: Retry logic
      throw Error(`Channel ID ${channelId} is already in use`);
    }
    const channel = new EventChannel(channelId, webSocket);
    this.channels[channelId] = channel;
    // TODO(cshcomcom): Handle MAX connections

    logger.info(`New connection (${channelId})`);
    webSocket.on('message', (message) => {
      this.handleMessage(channel, message);
    });
    webSocket.on('close', (message) => {
      // TODO(cshcomcom): Delete unused variables
    });
    // TODO(cshcomcom): ping-pong & close broken connections (ref: https://github.com/ainblockchain/ain-blockchain/blob/develop/p2p/index.js#L490)
  }

  handleMessage(channel, message) {
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
        case BlockchainEventMessageTypes.REGISTER_FILTER:
          const clientFilterId = data.id
          const eventType = data.type;
          if (!eventType) {
            throw Error(`Can't find eventType from message.data (${JSON.stringify(message)})`);
          }
          const config = data.config;
          if (!config) {
            throw Error(`Can't find config from message.data (${JSON.stringify(message)})`);
          }

          const filter =
              this.eventHandler.createAndRegisterEventFilter(clientFilterId, channel.id,
                  eventType, config);
          channel.addEventFilter(filter);
          this.filterIdToChannelId[filter.id] = channel.id;
          break;
        case BlockchainEventMessageTypes.DEREGISTER_FILTER:
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

  transmitEvent(channel, event) {
    channel.webSocket.send(this.makeMessage(BlockchainEventMessageTypes.EMIT_EVENT,
        JSON.stringify(event.toObject())));
  }

  transmitEventByEventFilterId(eventFilterId, event) {
    const channelId = this.filterIdToChannelId[eventFilterId];
    const channel = this.channels[channelId];
    if (!channel) {
      logger.error(`Can't find channel by event filter id (eventFilterId: ${eventFilterId})`);
      return;
    }
    this.transmitEvent(channel, event);
  }

  close() {
    this.wsServer.close(() => {
      logger.info(`Closed event handler server's socket`);
      // TODO(cshcomcom): Clear all data
    });
  }
}

module.exports = EventHandlerServer;
