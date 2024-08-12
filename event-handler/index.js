const logger = new (require('../logger'))('EVENT_HANDLER');
const _ = require('lodash');
const EventChannelManager = require('./event-channel-manager');
const StateEventTreeManager = require('./state-event-tree-manager');
const { BlockchainEventTypes, isEndState, FilterDeletionReasons }
    = require('../common/constants');
const CommonUtil = require('../common/common-util');
const EventFilter = require('./event-filter');
const BlockchainEvent = require('./blockchain-event');
const EventHandlerError = require('./event-handler-error');
const { EventHandlerErrorCode } = require('../common/result-code');
const { NodeConfigs } = require('../common/constants');

class EventHandler {
  constructor(node) {
    this.node = node;
    this.eventChannelManager = new EventChannelManager(node);
    this.stateEventTreeManager = new StateEventTreeManager();
    this.eventFilters = {};
    this.eventTypeToEventFilterIds = {};
    this.eventFilterIdToTimeoutCallback = new Map();
    this.txHashToEventFilterIdSet = new Map();
    for (const eventType of Object.keys(BlockchainEventTypes)) {
      this.eventTypeToEventFilterIds[eventType] = new Set();
    }
    this.run();
  }

  getEventHandlerStatus() {
    return {
      isEnabled: true,
      networkInfo: this.eventChannelManager.getNetworkInfo(),
      channelStatus: this.eventChannelManager.getChannelStatus(),
      filterStatus: this.getFilterStatus(),
    };
  }

  static getDefaultEventHandlerStatus() {
    return {
      isEnabled: false,
      networkInfo: {
        url: "",
        maxNumEventChannels: NodeConfigs.MAX_NUM_EVENT_CHANNELS,
        numEventChannels: 0,
        maxNumEventFilters: NodeConfigs.MAX_NUM_EVENT_FILTERS,
        numEventFilters: 0,
      },
      channelStatus: {
        maxNumEventChannels: NodeConfigs.MAX_NUM_EVENT_CHANNELS,
        numEventChannels: 0,
        channelLifeTimeLimitSecs: NodeConfigs.EVENT_HANDLER_CHANNEL_LIFE_TIME_LIMIT_SECS,
        channelIdleTimeLimitSecs: NodeConfigs.EVENT_HANDLER_CHANNEL_IDLE_TIME_LIMIT_SECS,
        maxChannelLifeTimeMs: 0,
        maxChannelIdleTimeMs: 0,
        channelInfo: {},
      },
      filterStatus: {
        maxNumEventFilters: NodeConfigs.MAX_NUM_EVENT_FILTERS,
        numEventFilters: 0,
        filterInfo: {},
      },
    };
  }

  run() {
    const LOG_HEADER = 'run';
    this.eventChannelManager.startListening();
    logger.info(`[${LOG_HEADER}] Event handler started!`);
  }

  getEventHandlerHealth() {
    if (this.eventChannelManager.getNumEventChannels() >= NodeConfigs.MAX_NUM_EVENT_CHANNELS) {
      return false;
    }
    if (this.getNumEventFilters() >= NodeConfigs.MAX_NUM_EVENT_FILTERS) {
      return false;
    }
    return true;
  }

  getFilterStatus() {
    return {
      maxNumEventFilters: NodeConfigs.MAX_NUM_EVENT_FILTERS,
      numEventFilters: this.getNumEventFilters(),
      filterInfo: this.getFilterInfo(),
    };
  }

  getNumEventFilters() {
    return Object.keys(this.eventFilters).length;
  }

  getFilterInfo() {
    const filterInfo = {};
    for (const [filterId, filter] of Object.entries(this.eventFilters)) {
      filterInfo[filterId] = filter.toObject();
    }
    return filterInfo;
  }

  // TODO(cshcomcom): Add tests.
  emitBlockFinalized(blockNumber, blockHash) {
    if (!blockNumber || !blockHash) {
      return;
    }

    const blockchainEvent = new BlockchainEvent(BlockchainEventTypes.BLOCK_FINALIZED, {
      block_number: blockNumber,
      block_hash: blockHash,
    });

    for (const eventFilterId of this.eventTypeToEventFilterIds[BlockchainEventTypes.BLOCK_FINALIZED]) {
      const eventFilter = this.eventFilters[eventFilterId];
      const eventFilterBlockNumber = _.get(eventFilter, 'config.block_number', null);
      if (eventFilterBlockNumber === null) {
        this.eventChannelManager.transmitEventByEventFilterId(eventFilterId, blockchainEvent);
      } else if (eventFilterBlockNumber === blockNumber) {
        this.eventChannelManager.transmitEventByEventFilterId(eventFilterId, blockchainEvent);
      }
    }
  }

  // TODO(cshcomcom): Add tests.
  emitValueChanged(auth, transaction, parsedValuePath, beforeValue, afterValue, eventSource) {
    const LOG_HEADER = 'emitValueChanged';
    const valuePath = CommonUtil.formatPath(parsedValuePath);
    const matchedEventFilterIdList = this.stateEventTreeManager.matchEventFilterPath(parsedValuePath);
    for (const eventFilterId of matchedEventFilterIdList) {
      const eventFilter = this.eventFilters[eventFilterId];
      const targetPath = _.get(eventFilter, 'config.path', null);
      const parsedTargetPath = CommonUtil.parsePath(targetPath);
      if (parsedValuePath.length !== parsedTargetPath.length) {
        logger.error(`[${LOG_HEADER}] Lengths of parsedLocalPath and parsedTargetPath do not match!`);
        continue;
      }

      const expectedEventSource = _.get(eventFilter, 'config.event_source', null);
      if (expectedEventSource && expectedEventSource !== eventSource) {
        continue;
      }

      const params = {};
      for (const [idx, label] of parsedTargetPath.entries()) {
        if (CommonUtil.isVariableLabel(label)) {
          params[label.substring(1)] = parsedValuePath[idx];
        }
      }

      const blockchainEvent = new BlockchainEvent(BlockchainEventTypes.VALUE_CHANGED, {
        filter_path: targetPath,
        matched_path: valuePath,
        params: params,
        auth: auth,
        transaction: transaction,
        event_source: eventSource,
        values: {
          before: beforeValue,
          after: afterValue,
        },
      });
      this.eventChannelManager.transmitEventByEventFilterId(eventFilterId, blockchainEvent);
    }
  }

  emitTxStateChanged(transaction, beforeState, afterState) {
    const LOG_HEADER = 'emitTxStateChanged';
    if (!_.get(transaction, 'hash', null)) {
      logger.error(`[${LOG_HEADER}] Invalid Tx(${JSON.stringify(transaction)})`);
      return;
    }
    const eventFilterIdSet = this.txHashToEventFilterIdSet.get(transaction.hash);
    if (!eventFilterIdSet) {
      return;
    }
    for (const eventFilterId of eventFilterIdSet) {
      const timeoutCallback = this.eventFilterIdToTimeoutCallback.get(eventFilterId);
      if (timeoutCallback) {
        clearTimeout(timeoutCallback);
      }

      const blockchainEvent = new BlockchainEvent(BlockchainEventTypes.TX_STATE_CHANGED, {
        transaction: transaction,
        tx_state: {
          before: beforeState,
          after: afterState,
        },
      });
      this.eventChannelManager.transmitEventByEventFilterId(eventFilterId, blockchainEvent);

      // NOTE(ehgmsdk20): When the state no longer changes, the event filter is removed.
      if (isEndState(afterState)) {
        const channel = this.eventChannelManager.getChannelByEventFilterId(eventFilterId);
        const clientFilterId = this.getClientFilterIdFromGlobalFilterId(eventFilterId);
        this.eventChannelManager.deregisterFilterAndEmitEvent(
          channel, clientFilterId, FilterDeletionReasons.END_STATE_REACHED
        );
      }
    }
  }

  setFilterDeletionTimeout(eventFilterId) {
    const LOG_HEADER = 'setFilterDeletionTimeout';

    if (!eventFilterId) {
      logger.error(`[${LOG_HEADER}] EventFilterId is empty.`);
      return;
    }
    const timeoutId = this.eventFilterIdToTimeoutCallback.get(eventFilterId);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    this.eventFilterIdToTimeoutCallback.set(eventFilterId, setTimeout(() => {
      const channel = this.eventChannelManager.getChannelByEventFilterId(eventFilterId);
      const clientFilterId = this.getClientFilterIdFromGlobalFilterId(eventFilterId);
      this.eventChannelManager.deregisterFilterAndEmitEvent(
        channel, clientFilterId, FilterDeletionReasons.FILTER_TIMEOUT
      );
    }, NodeConfigs.EVENT_HANDLER_FILTER_DELETION_TIMEOUT_MS));
  }

  getClientFilterIdFromGlobalFilterId(globalFilterId) {
    const clientFilterId = globalFilterId.split(':')[1];
    if (!clientFilterId) {
      throw new EventHandlerError(EventHandlerErrorCode.PARSING_GLOBAL_FILTER_ID_FAILURE,
          `Can't get client filter ID from global filter ID (globalFilterId: ${globalFilterId})`);
    }
    return clientFilterId;
  }

  getGlobalFilterId(channelId, clientFilterId) {
    return `${channelId}:${clientFilterId}`;
  }

  static validateEventFilterConfig(eventType, config) {
    switch (eventType) {
      case BlockchainEventTypes.BLOCK_FINALIZED:
        const blockNumber = _.get(config, 'block_number', null);
        if (CommonUtil.isNumber(blockNumber) && blockNumber < 0) {
          throw new EventHandlerError(EventHandlerErrorCode.NEGATIVE_BLOCK_NUMBER,
              `Invalid block_number. It must not be a negative number (${blockNumber})`);
        } else if (!CommonUtil.isNumber(blockNumber) && blockNumber !== null) {
          throw new EventHandlerError(EventHandlerErrorCode.INVALID_BLOCK_NUMBER_TYPE,
              `Invalid block_number type. (${typeof blockNumber})`);
        }
        break;
      case BlockchainEventTypes.VALUE_CHANGED:
        const path = _.get(config, 'path', null);
        if (!path) {
          throw new EventHandlerError(EventHandlerErrorCode.MISSING_PATH_IN_CONFIG,
              `config.path is missing (${JSON.stringify(config)})`);
        }
        const parsedPath = CommonUtil.parsePath(path);
        if (!StateEventTreeManager.isValidPathForStateEventTree(parsedPath)) {
          throw new EventHandlerError(EventHandlerErrorCode.INVALID_FORMAT_PATH,
              `Invalid format path (${path})`);
        }
        break;
      case BlockchainEventTypes.TX_STATE_CHANGED:
        const txHash = _.get(config, 'tx_hash', null);
        if (!txHash) {
          throw new EventHandlerError(EventHandlerErrorCode.MISSING_TX_HASH_IN_CONFIG,
              `config.tx_hash is missing (${JSON.stringify(config)})`);
        }
        if (!CommonUtil.isValidHash(txHash)) {
          throw new EventHandlerError(EventHandlerErrorCode.INVALID_TX_HASH,
              `Invalid tx hash (${txHash})`);
        }
        break;
      default:
        throw new EventHandlerError(EventHandlerErrorCode.INVALID_EVENT_TYPE_IN_VALIDATE_FUNC,
            `Invalid event type (${eventType})`);
    }
  }

  createAndRegisterEventFilter(clientFilterId, channelId, eventType, config) {
    const LOG_HEADER = 'createAndRegisterEventFilter';
    const eventFilterId = this.getGlobalFilterId(channelId, clientFilterId);
    if (this.eventFilters[eventFilterId]) {
      throw new EventHandlerError(EventHandlerErrorCode.DUPLICATED_GLOBAL_FILTER_ID,
          `Event filter ID ${eventFilterId} is already in use`, eventFilterId);
    }
    EventHandler.validateEventFilterConfig(eventType, config);
    const eventFilter = new EventFilter(eventFilterId, eventType, config);
    this.eventFilters[eventFilterId] = eventFilter;
    this.eventTypeToEventFilterIds[eventType].add(eventFilterId);
    if (eventType === BlockchainEventTypes.VALUE_CHANGED) {
      this.stateEventTreeManager.registerEventFilterId(config.path, eventFilterId);
    } else if (eventType === BlockchainEventTypes.TX_STATE_CHANGED) {
      const eventFilterIdSet = this.txHashToEventFilterIdSet.get(config.tx_hash);
      if (eventFilterIdSet) {
        eventFilterIdSet.add(eventFilterId);
      } else {
        this.txHashToEventFilterIdSet.set(config.tx_hash, new Set([eventFilterId]));
      }
    }
    logger.info(`[${LOG_HEADER}] New filter is registered. (eventFilterId: ${eventFilterId}, ` +
        `eventType: ${eventType}, config: ${JSON.stringify(config)})`);
    return eventFilter;
  }

  deregisterEventFilter(clientFilterId, channelId) {
    const LOG_HEADER = 'deregisterEventFilter';
    const eventFilterId = this.getGlobalFilterId(channelId, clientFilterId);
    const eventFilter = this.eventFilters[eventFilterId];
    if (!eventFilter) {
      throw new EventHandlerError(EventHandlerErrorCode.NO_MATCHED_FILTERS,
          `Can't find filter by filter id`, eventFilterId);
    }
    delete this.eventFilters[eventFilterId];
    if (!this.eventTypeToEventFilterIds[eventFilter.type].delete(eventFilterId)) {
      throw new EventHandlerError(EventHandlerErrorCode.MISSING_FILTER_ID_IN_TYPE_TO_FILTER_IDS,
          `Can't delete filter Id from eventTypeToEventFilterIds (${eventFilterId})`);
    }
    if (eventFilter.type === BlockchainEventTypes.VALUE_CHANGED) {
      this.stateEventTreeManager.deregisterEventFilterId(eventFilterId);
    } else if (eventFilter.type === BlockchainEventTypes.TX_STATE_CHANGED) {
      const timeoutCallback = this.eventFilterIdToTimeoutCallback.get(eventFilterId);
      if (timeoutCallback) {
        clearTimeout(timeoutCallback);
      }
      this.eventFilterIdToTimeoutCallback.delete(eventFilterId);

      const txHash = _.get(eventFilter.config, 'tx_hash', null);
      const eventFilterIdSet = this.txHashToEventFilterIdSet.get(txHash);
      eventFilterIdSet.delete(eventFilterId);
      if (eventFilterIdSet.size === 0) {
        this.txHashToEventFilterIdSet.delete(txHash);
      }
    }
    logger.info(`[${LOG_HEADER}] Filter is deregistered. (eventFilterId: ${eventFilterId})`);
    return eventFilter;
  }
}

module.exports = EventHandler;
