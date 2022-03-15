const logger = new (require('../logger'))('EVENT_CHANNEL_MANAGER');
const EventChannel = require('./event-channel');
const ws = require('ws');
const { getIpAddress } = require('../common/network-util');
const {
  BlockchainEventMessageTypes,
  NodeConfigs,
} = require('../common/constants');
const HandlerError = require('./event-handler-error');
const { EventHandlerErrorCode } = require('../common/result-code');

class EventChannelManager {
  constructor(eventHandler) {
    this.eventHandler = eventHandler;
    this.wsServer = null;
    this.channels = {}; // [channelId]: Channel
    this.filterIdToChannelId = {}; // [globalFilterId]: channelId
    this.heartbeatInterval = null;
  }

  async getNetworkInfo() {
    const ipAddr = await getIpAddress(NodeConfigs.HOSTING_ENV === 'comcom' || NodeConfigs.HOSTING_ENV === 'local');
    const eventHandlerUrl = new URL(`ws://${ipAddr}:${NodeConfigs.EVENT_HANDLER_PORT}`);
    return {
      url: eventHandlerUrl.toString(),
      port: NodeConfigs.EVENT_HANDLER_PORT,
    }
  }

  getChannelInfo() {
    const channelInfo = {};
    for (const [channelId, channel] of Object.entries(this.channels)) {
      channelInfo[channelId] = channel.toObject();
    }
    return channelInfo;
  }

  startListening() {
    this.wsServer = new ws.Server({
      port: NodeConfigs.EVENT_HANDLER_PORT,
    });
    this.wsServer.on('connection', (ws) => {
      this.handleConnection(ws);
    });
    this.startHeartbeat(this.wsServer);
  }

  handleConnection(webSocket) {
    try {
      const channelId = Date.now(); // NOTE: Only used in blockchain
      if (this.channels[channelId]) { // TODO(cshcomcom): Retry logic.
        throw new HandlerError(EventHandlerErrorCode.DUPLICATED_CHANNEL_ID,
            `Channel ID ${channelId} is already in use`);
      }
      const channel = new EventChannel(channelId, webSocket);
      this.channels[channelId] = channel;
      // TODO(cshcomcom): Handle MAX connections.

      logger.info(`New connection (${channelId})`);
      webSocket.on('message', (message) => {
        this.handleMessage(channel, message);
      });
      webSocket.on('close', (_) => {
        this.closeChannel(channel);
      });

      // Heartbeat
      webSocket.on('pong', (_) => {
        webSocket.isAlive = true;
      })
      webSocket.isAlive = true;
    } catch (err) {
      webSocket.terminate();
      logger.error(`Error while handle connection (${err.message})`);
    }
  }

  handleRegisterFilterMessage(channel, messageData) {
    const clientFilterId = messageData.id;
    const eventType = messageData.type;
    if (!eventType) {
      throw new HandlerError(EventHandlerErrorCode.MISSING_EVENT_TYPE_IN_MSG_DATA,
          `Can't find eventType from message.data (${JSON.stringify(messageData)})`,
          null, clientFilterId);
    }
    const config = messageData.config;
    if (!config) {
      throw new HandlerError(EventHandlerErrorCode.MISSING_CONFIG_IN_MSG_DATA,
          `Can't find config from message.data (${JSON.stringify(messageData)})`,
          null, clientFilterId);
    }

    const filter =
        this.eventHandler.createAndRegisterEventFilter(clientFilterId, channel.id,
            eventType, config);
    channel.addEventFilterId(filter.id);
    this.filterIdToChannelId[filter.id] = channel.id;
  }

  deregisterFilter(channel, clientFilterId) {
    const filter = this.eventHandler.deregisterEventFilter(clientFilterId, channel.id);
    channel.deleteEventFilterId(filter.id);
    delete this.filterIdToChannelId[filter.id];
  }

  handleDeregisterFilterMessage(channel, messageData) {
    const clientFilterId = messageData.id;
    this.deregisterFilter(channel, clientFilterId);
  }

  handleEventError(channel, eventErr) {
    try {
      const globalFilterId = eventErr.globalFilterId;
      const clientFilterId = eventErr.clientFilterId ||
          this.eventHandler.getClientFilterIdFromGlobalFilterId(globalFilterId);
      if (!clientFilterId) {
        throw Error(`Can't find client filter ID (${eventErr.message})`);
      }
      this.transmitEventError(channel, clientFilterId, eventErr);
      this.deregisterFilter(channel, clientFilterId);
    } catch (err) {
      logger.error(`Error while handle event error (errorMessage: ${err.message}, ` +
          `eventErr: ${eventErr.message})`);
    }
  }

  handleMessage(channel, message) { // TODO(cshcomcom): Manage EVENT_PROTOCOL_VERSION.
    try {
      const parsedMessage = JSON.parse(message);
      const messageType = parsedMessage.type;
      if (!messageType) {
        throw new HandlerError(EventHandlerErrorCode.MISSING_MESSAGE_TYPE_IN_MSG,
            `Can't find type from message (${JSON.stringify(message)})`);
      }
      const messageData = parsedMessage.data;
      if (!messageData) {
        throw new HandlerError(EventHandlerErrorCode.MISSING_MESSAGE_DATA_IN_MSG,
            `Can't find data from message (${JSON.stringify(message)})`);
      }
      switch (messageType) {
        case BlockchainEventMessageTypes.REGISTER_FILTER:
          this.handleRegisterFilterMessage(channel, messageData);
          break;
        case BlockchainEventMessageTypes.DEREGISTER_FILTER:
          this.handleDeregisterFilterMessage(channel, messageData);
          break;
        default:
          throw new HandlerError(EventHandlerErrorCode.INVALID_MESSAGE_TYPE,
              `Invalid message type (${messageType})`);
      }
    } catch (err) {
      logger.error(`Error while process message (message: ${JSON.stringify(message, null, 2)}, ` +
          `error message: ${err.message})`);
      this.handleEventError(channel, err);
    }
  }

  makeMessage(messageType, data) {
    return {
      type: messageType,
      data: data,
    };
  }

  transmitEventObj(channel, eventObj) {
    const eventMessage = this.makeMessage(BlockchainEventMessageTypes.EMIT_EVENT, eventObj);
    channel.webSocket.send(JSON.stringify(eventMessage));
  }

  transmitEventByEventFilterId(eventFilterId, event) {
    const channelId = this.filterIdToChannelId[eventFilterId];
    const channel = this.channels[channelId];
    if (!channel) {
      logger.error(`Can't find channel by event filter id (eventFilterId: ${eventFilterId})`);
      return;
    }
    const eventObj = event.toObject();
    const clientFilterId = this.eventHandler.getClientFilterIdFromGlobalFilterId(eventFilterId);
    Object.assign(eventObj, { filter_id: clientFilterId });
    this.transmitEventObj(channel, eventObj);
  }

  transmitEventErrorObj(channel, eventErrObj) {
    const errorMessage = this.makeMessage(BlockchainEventMessageTypes.EMIT_ERROR, eventErrObj);
    channel.webSocket.send(JSON.stringify(errorMessage));
  }

  transmitEventError(channel, clientFilterId, eventErr) {
    const errObj = eventErr.toObject();
    Object.assign(errObj, { filter_id: clientFilterId }); // Client needs client filter ID.
    this.transmitEventErrorObj(channel, errObj);
  }

  close() {
    this.stopHeartbeat();
    this.wsServer.close(() => {
      logger.info(`Closed event channel manager's socket`);
    });
  }

  closeChannel(channel) {
    try {
      logger.info(`Close channel ${channel.id}`);
      channel.webSocket.terminate();
      const filterIds = channel.getAllFilterIds();
      for (const filterId of filterIds) {
        const clientFilterId = this.eventHandler.getClientFilterIdFromGlobalFilterId(filterId);
        this.deregisterFilter(channel, clientFilterId);
      }
      delete this.channels[channel.id];
    } catch (err) {
      logger.error(`Error while close channel (channelId: ${channel.id}, message:${err.message})`);
    }
  }

  startHeartbeat(wsServer) {
    this.heartbeatInterval = setInterval(() => {
      wsServer.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, NodeConfigs.EVENT_HANDLER_HEARTBEAT_INTERVAL_MS || 15000);
  }

  stopHeartbeat() {
    clearInterval(this.heartbeatInterval);
  }
}

module.exports = EventChannelManager;
