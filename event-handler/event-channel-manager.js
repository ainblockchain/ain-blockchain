const logger = new (require('../logger'))('EVENT_CHANNEL_MANAGER');
const EventChannel = require('./event-channel');
const ws = require('ws');
const { getIpAddress } = require('../common/network-util');
const {
  BlockchainEventMessageTypes,
  NodeConfigs,
} = require('../common/constants');
const EventHandlerError = require('./event-handler-error');
const { EventHandlerErrorCode } = require('../common/result-code');

class EventChannelManager {
  constructor(eventHandler) {
    this.eventHandler = eventHandler;
    this.wsServer = null;
    // TODO(cshcomcom): Use Map data structure.
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
      maxNumEventChannels: NodeConfigs.MAX_NUM_EVENT_CHANNELS,
      numEventChannels: this.getNumEventChannels(),
      maxNumEventFilters: NodeConfigs.MAX_NUM_EVENT_FILTERS,
      numEventFilters: this.eventHandler.getNumEventFilters(),
    }
  }

  getNumEventChannels() {
    return Object.keys(this.channels).length;
  }

  getChannelInfo() {
    const channelInfo = {};
    for (const [channelId, channel] of Object.entries(this.channels)) {
      channelInfo[channelId] = channel.toObject();
    }
    return channelInfo;
  }

  getChannelByEventFilterId(eventFilterId) {
    const channelId = this.filterIdToChannelId[eventFilterId];
    const channel = this.channels[channelId];
    return channel;
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
    const LOG_HEADER = 'handleConnection';
    try {
      if (this.getNumEventChannels() >= NodeConfigs.MAX_NUM_EVENT_CHANNELS) {
        throw new EventHandlerError(EventHandlerErrorCode.EVENT_CHANNEL_EXCEEDS_SIZE_LIMIT,
            `The number of event channels exceeds its limit ` +
            `(${NodeConfigs.MAX_NUM_EVENT_CHANNELS})`);
      }
      const channelId = Date.now(); // NOTE: Only used in blockchain
      if (this.channels[channelId]) { // TODO(cshcomcom): Retry logic.
        throw new EventHandlerError(EventHandlerErrorCode.DUPLICATED_CHANNEL_ID,
            `Channel ID ${channelId} is already in use`);
      }
      const channel = new EventChannel(channelId, webSocket);
      this.channels[channelId] = channel;
      // TODO(cshcomcom): Handle MAX connections.

      logger.info(`[${LOG_HEADER}] New connection (${channelId})`);
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
      logger.error(`[${LOG_HEADER}] ${err.message}`);
    }
  }

  handleRegisterFilterMessage(channel, messageData) {
    const clientFilterId = messageData.id;
    if (this.eventHandler.getNumEventFilters() >= NodeConfigs.MAX_NUM_EVENT_FILTERS) {
      throw new EventHandlerError(EventHandlerErrorCode.EVENT_FILTER_EXCEEDS_SIZE_LIMIT,
          `The number of event filters exceeds its limit (${NodeConfigs.MAX_NUM_EVENT_FILTERS})`,
          null, clientFilterId);
    }
    if (channel.getFilterIdsSize() >= NodeConfigs.MAX_NUM_EVENT_FILTERS_PER_CHANNEL) {
      throw new EventHandlerError(EventHandlerErrorCode.EVENT_FILTER_EXCEEDS_SIZE_LIMIT_PER_CHANNEL,
          `The number of event filters exceeds its limit per channel ` +
          `(${NodeConfigs.MAX_NUM_EVENT_FILTERS_PER_CHANNEL})`, null, clientFilterId);
    }
    const eventType = messageData.type;
    if (!eventType) {
      throw new EventHandlerError(EventHandlerErrorCode.MISSING_EVENT_TYPE_IN_MSG_DATA,
          `Can't find eventType from message.data (${JSON.stringify(messageData)})`,
          null, clientFilterId);
    }
    const config = messageData.config;
    if (!config) {
      throw new EventHandlerError(EventHandlerErrorCode.MISSING_CONFIG_IN_MSG_DATA,
          `Can't find config from message.data (${JSON.stringify(messageData)})`,
          null, clientFilterId);
    }
    this.registerFilter(channel, clientFilterId, eventType, config);
  }

  registerFilter(channel, clientFilterId, eventType, config) {
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
    const LOG_HEADER = 'handleEventError';
    try {
      const globalFilterId = eventErr.globalFilterId;
      const clientFilterId = eventErr.clientFilterId ||
          this.eventHandler.getClientFilterIdFromGlobalFilterId(globalFilterId);
      if (!clientFilterId) {
        logger.error(`[${LOG_HEADER}] Can't find client filter ID (${eventErr.message})`);
        return;
      }
      this.transmitEventError(channel, clientFilterId, eventErr);
      this.deregisterFilter(channel, clientFilterId);
    } catch (err) {
      logger.error(`[${LOG_HEADER}] errorMessage: ${err.message}, ` +
          `eventErr: ${eventErr.message}`);
    }
  }

  handleMessage(channel, message) { // TODO(cshcomcom): Manage EVENT_PROTOCOL_VERSION.
    const LOG_HEADER = 'handleMessage';
    try {
      const parsedMessage = JSON.parse(message);
      const messageType = parsedMessage.type;
      if (!messageType) {
        throw new EventHandlerError(EventHandlerErrorCode.MISSING_MESSAGE_TYPE_IN_MSG,
            `Can't find type from message (${JSON.stringify(message)})`);
      }
      const messageData = parsedMessage.data;
      if (!messageData) {
        throw new EventHandlerError(EventHandlerErrorCode.MISSING_MESSAGE_DATA_IN_MSG,
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
          throw new EventHandlerError(EventHandlerErrorCode.INVALID_MESSAGE_TYPE,
              `Invalid message type (${messageType})`);
      }
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Error while process message ` +
          `(message: ${JSON.stringify(message, null, 2)}, ` +
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
    const LOG_HEADER = 'transmitEventByEventFilterId';
    const channel = this.getChannelByEventFilterId(eventFilterId);
    if (!channel) {
      logger.error(`[${LOG_HEADER}] Can't find channel by event filter id ` +
          `(eventFilterId: ${eventFilterId})`);
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
    const LOG_HEADER = 'close';
    this.stopHeartbeat();
    this.wsServer.close(() => {
      logger.info(`[${LOG_HEADER}] Closed event channel manager's socket`);
    });
  }

  closeChannel(channel) {
    const LOG_HEADER = 'closeChannel';
    try {
      logger.info(`[${LOG_HEADER}] Close channel ${channel.id}`);
      channel.webSocket.terminate();
      const filterIds = channel.getAllFilterIds();
      for (const filterId of filterIds) {
        const clientFilterId = this.eventHandler.getClientFilterIdFromGlobalFilterId(filterId);
        this.deregisterFilter(channel, clientFilterId);
      }
      delete this.channels[channel.id];
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Error while close channel (channelId: ${channel.id}, ` +
          `message:${err.message})`);
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
