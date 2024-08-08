const logger = new (require('../logger'))('EVENT_CHANNEL_MANAGER');
const EventChannel = require('./event-channel');
const ws = require('ws');
const { getIpAddress } = require('../common/network-util');
const {
  BlockchainEventMessageTypes,
  NodeConfigs,
  HostingEnvs,
  BlockchainEventTypes,
  FilterDeletionReasons,
} = require('../common/constants');
const EventHandlerError = require('./event-handler-error');
const { EventHandlerErrorCode } = require('../common/result-code');
const BlockchainEvent = require('./blockchain-event');

class EventChannelManager {
  constructor(node) {
    this.node = node;
    this.wsServer = null;
    // TODO(cshcomcom): Use Map data structure.
    this.channels = {}; // [channelId]: Channel
    this.filterIdToChannelId = {}; // [globalFilterId]: channelId
    this.heartbeatInterval = null;
  }

  getNetworkInfo() {
    const ipAddr = (NodeConfigs.HOSTING_ENV === HostingEnvs.COMCOM || NodeConfigs.HOSTING_ENV === HostingEnvs.LOCAL) ? this.node.ipAddrInternal : this.node.ipAddrExternal;
    const eventHandlerUrl = new URL(`ws://${ipAddr}:${NodeConfigs.EVENT_HANDLER_PORT}`);
    return {
      url: eventHandlerUrl.toString(),
      maxNumEventChannels: NodeConfigs.MAX_NUM_EVENT_CHANNELS,
      numEventChannels: this.getNumEventChannels(),
      maxNumEventFilters: NodeConfigs.MAX_NUM_EVENT_FILTERS,
      numEventFilters: this.node.eh.getNumEventFilters(),
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
        webSocket.terminate();
        throw new EventHandlerError(EventHandlerErrorCode.EVENT_CHANNEL_EXCEEDS_SIZE_LIMIT,
            `The number of event channels exceeds its limit ` +
            `(${NodeConfigs.MAX_NUM_EVENT_CHANNELS})`);
      }
      const channelId = Date.now(); // NOTE: Only used in blockchain
      if (this.channels[channelId]) { // TODO(cshcomcom): Retry logic.
        webSocket.terminate();
        throw new EventHandlerError(EventHandlerErrorCode.DUPLICATED_CHANNEL_ID,
            `Channel ID ${channelId} is already in use`);
      }
      const channel = new EventChannel(channelId, webSocket);
      this.channels[channelId] = channel;
      // TODO(cshcomcom): Handle MAX connections.

      logger.info(`[${LOG_HEADER}] New connection (${channelId})`);

      webSocket.on('message', (message) => {
        try {
          const parsedMessage = JSON.parse(message);
          const messageType = parsedMessage.type;
          if (!messageType) {
            throw new EventHandlerError(EventHandlerErrorCode.MISSING_MESSAGE_TYPE_IN_MSG,
                `No message type in (${JSON.stringify(message)})`);
          }
          const messageData = parsedMessage.data;
          if (!messageData) {
            throw new EventHandlerError(EventHandlerErrorCode.MISSING_MESSAGE_DATA_IN_MSG,
                `No message data in (${JSON.stringify(message)})`);
          }
          // NOTE(platfowner): A custom ping-pong (see https://github.com/ainblockchain/ain-js/issues/171).
          if (messageType === BlockchainEventMessageTypes.PONG) {
            this.handlePong(webSocket);
          } else {
            this.handleMessage(channel, messageType, messageData);
          }
        } catch (err) {
          logger.error(`[${LOG_HEADER}] Error while process message ` +
              `(message: ${JSON.stringify(message, null, 2)}, ` +
              `error message: ${err.message})`);
          this.handleEventError(channel, err);
        }
      });

      webSocket.on('close', (_) => {
        this.closeChannel(channel);
      });


      webSocket.isAlive = true;
    } catch (err) {
      webSocket.terminate();
      logger.error(`[${LOG_HEADER}] ${err.message}`);
    }
  }

  handleRegisterFilterMessage(channel, messageData) {
    const LOG_HEADER = 'handleRegisterFilterMessage';
    const clientFilterId = messageData.id;
    try {
      if (this.node.eh.getNumEventFilters() >= NodeConfigs.MAX_NUM_EVENT_FILTERS) {
        throw new EventHandlerError(
          EventHandlerErrorCode.EVENT_FILTER_EXCEEDS_SIZE_LIMIT,
          `The number of event filters exceeds its limit (${NodeConfigs.MAX_NUM_EVENT_FILTERS})`
        );
      }
      if (channel.getFilterIdsSize() >= NodeConfigs.MAX_NUM_EVENT_FILTERS_PER_CHANNEL) {
        throw new EventHandlerError(
          EventHandlerErrorCode.EVENT_FILTER_EXCEEDS_SIZE_LIMIT_PER_CHANNEL,
          `The number of event filters exceeds its limit per channel ` +
              `(${NodeConfigs.MAX_NUM_EVENT_FILTERS_PER_CHANNEL})`
        );
      }
      const eventType = messageData.type;
      if (!eventType) {
        throw new EventHandlerError(EventHandlerErrorCode.MISSING_EVENT_TYPE_IN_MSG_DATA,
            `Can't find eventType from message.data (${JSON.stringify(messageData)})`);
      }
      const config = messageData.config;
      if (!config) {
        throw new EventHandlerError(EventHandlerErrorCode.MISSING_CONFIG_IN_MSG_DATA,
            `Can't find config from message.data (${JSON.stringify(messageData)})`);
      }
      this.registerFilter(channel, clientFilterId, eventType, config);
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Can't register event filter ` +
        `(clientFilterId: ${clientFilterId}, channelId: ${channel.id}, ` +
        `messageData: ${messageData}, err: ${err.message} at ${err.stack})`);
      throw new EventHandlerError(
        EventHandlerErrorCode.FAILED_TO_REGISTER_FILTER,
        `Failed to register filter with filter ID: ${clientFilterId} due to error: ${err.message}`,
        clientFilterId
      );
    }
  }

  registerFilter(channel, clientFilterId, eventType, config) {
    const filter =
        this.node.eh.createAndRegisterEventFilter(clientFilterId, channel.id,
            eventType, config);
    channel.addEventFilterId(filter.id);
    this.filterIdToChannelId[filter.id] = channel.id;
    if (eventType === BlockchainEventTypes.TX_STATE_CHANGED) {
      const transactionInfo = this.node.getTransactionByHash(config.tx_hash);
      if (!transactionInfo) {
        this.node.eh.setFilterDeletionTimeout(filter.id);
      } else {
        const blockchainEvent = new BlockchainEvent(BlockchainEventTypes.TX_STATE_CHANGED, {
          transaction: transactionInfo.transaction,
          tx_state: {
            before: null,
            after: transactionInfo.state,
          },
        });
        this.transmitEventByEventFilterId(filter.id, blockchainEvent);
      }
    }
  }

  deregisterFilter(channel, clientFilterId) {
    const filter = this.node.eh.deregisterEventFilter(clientFilterId, channel.id);
    channel.deleteEventFilterId(filter.id);
    delete this.filterIdToChannelId[filter.id];
  }

  deregisterFilterAndEmitEvent(channel, clientFilterId, filterDeletionReason) {
    const LOG_HEADER = 'deregisterFilterAndEmitEvent';
    try {
      this.deregisterFilter(channel, clientFilterId);
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Can't deregister event filter ` +
        `(clientFilterId: ${clientFilterId}, channelId: ${channel.id}, ` +
        `err: ${err.message} at ${err.stack})`);
      throw new EventHandlerError(
        EventHandlerErrorCode.FAILED_TO_DEREGISTER_FILTER,
        `Failed to deregister filter with filter ID: ${clientFilterId} ` +
          `due to error: ${err.message}`,
        clientFilterId
      );
    }
    const blockchainEvent = new BlockchainEvent(
      BlockchainEventTypes.FILTER_DELETED,
      {
        filter_id: clientFilterId,
        reason: filterDeletionReason
      },
    );
    const eventObj = blockchainEvent.toObject();
    Object.assign(eventObj, { filter_id: clientFilterId });
    this.transmitEventObj(channel, eventObj);
  }

  handleDeregisterFilterMessage(channel, messageData) {
    const clientFilterId = messageData.id;
    this.deregisterFilterAndEmitEvent(
        channel, clientFilterId, FilterDeletionReasons.DELETED_BY_USER);
  }

  handleEventError(channel, eventErr) {
    const LOG_HEADER = 'handleEventError';
    const { clientFilterId, message } = eventErr;
    try {
      this.transmitEventError(channel, eventErr);
      if (
        clientFilterId &&
        eventErr.code !== EventHandlerErrorCode.FAILED_TO_REGISTER_FILTER &&
        eventErr.code !== EventHandlerErrorCode.FAILED_TO_DEREGISTER_FILTER
      ) {
        this.deregisterFilterAndEmitEvent(
          channel, clientFilterId, FilterDeletionReasons.ERROR_OCCURRED
        );
      }
    } catch (err) {
      logger.error(`[${LOG_HEADER}] errorMessage: ${err.message}, ` +
          `eventErr: ${message}`);
    }
  }

  /**
   * Handles a pong message.
   */
  handlePong(webSocket) {
    webSocket.isAlive = true;
  }

  /**
   * Handles a (non-pong) message from the channel.
   */
  // TODO(cshcomcom): Manage EVENT_PROTOCOL_VERSION.
  handleMessage(channel, messageType, messageData) {
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
    // TODO(ehgmsdk20): reuse same object for memory
    const eventObj = event.toObject();
    const clientFilterId = this.node.eh.getClientFilterIdFromGlobalFilterId(eventFilterId);
    Object.assign(eventObj, { filter_id: clientFilterId });
    this.transmitEventObj(channel, eventObj);
  }

  transmitEventErrorObj(channel, eventErrObj) {
    const errorMessage = this.makeMessage(BlockchainEventMessageTypes.EMIT_ERROR, eventErrObj);
    channel.webSocket.send(JSON.stringify(errorMessage));
  }

  transmitEventError(channel, eventErr) {
    const errObj = eventErr.toObject();
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
        const clientFilterId = this.node.eh.getClientFilterIdFromGlobalFilterId(filterId);
        // NOTE(ehgmsdk20): Do not emit filter_deleted event because the channel is already closed.
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
        this.sendPing(ws);
      });
    }, NodeConfigs.EVENT_HANDLER_HEARTBEAT_INTERVAL_MS || 15000);
  }

  sendPing(webSocket) {
    const pingMessage = this.makeMessage(BlockchainEventMessageTypes.PING, {});
    webSocket.send(JSON.stringify(pingMessage));
  }

  stopHeartbeat() {
    clearInterval(this.heartbeatInterval);
  }
}

module.exports = EventChannelManager;
