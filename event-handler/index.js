const logger = new (require('../logger'))('EVENT_HANDLER');
const _ = require('lodash');
const EventChannelManager = require('./event-channel-manager');
const StateEventTreeManager = require('./state-event-tree-manager');
const { BlockchainEventTypes, isEndState, FilterDeletionReasons, BlockchainParams }
    = require('../common/constants');
const CommonUtil = require('../common/common-util');
const EventFilter = require('./event-filter');
const BlockchainEvent = require('./blockchain-event');
const EventHandlerError = require('./event-handler-error');
const { EventHandlerErrorCode } = require('../common/result-code');
const {
  NodeConfigs,
} = require('../common/constants');

class EventHandler {
  constructor() {
    this.eventChannelManager = null;
    this.stateEventTreeManager = new StateEventTreeManager();
    this.eventFilters = {};
    this.eventTypeToEventFilterIds = {};
    this.eventFilterIdToTimeoutCallback = new Map();
    this.txHashToEventFilterIds = new Map();
    for (const eventType of Object.keys(BlockchainEventTypes)) {
      this.eventTypeToEventFilterIds[eventType] = new Set();
    }
    this.run();
  }

  run() {
    const LOG_HEADER = 'run';
    this.eventChannelManager = new EventChannelManager(this);
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
    if (!eventSource) { // NOTE: If the event source is null, propagation isn't required.
      return;
    }
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
    const eventFilterIds = this.txHashToEventFilterIds.get(transaction.hash);
    if (!eventFilterIds) {
      return;
    }
    for (const eventFilterId of eventFilterIds) {
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
      const [channelId, clientFilterId] = eventFilterId.split(':');

      // NOTE(ehgmsdk20): When the state no longer changes, the event filter is removed.
      if (isEndState(afterState)) {
        this.emitFilterDeleted(eventFilterId, FilterDeletionReasons.END_STATE_REACHED);
        this.deregisterEventFilter(clientFilterId, channelId);
      }
    }
  }

  emitFilterDeleted(eventFilterId, filterDeletionReason) {
    const LOG_HEADER = 'emitFilterDeleted';

    if (!eventFilterId) {
      logger.error(`[${LOG_HEADER}] EventFilterId is empty.`);
      return;
    }
    const clientFilterId = this.getClientFilterIdFromGlobalFilterId(eventFilterId);
    const blockchainEvent = new BlockchainEvent(BlockchainEventTypes.FILTER_DELETED, {
      filter_id: clientFilterId, // Client needs client filter ID.
      reason: filterDeletionReason,
    });
    this.eventChannelManager.transmitEventByEventFilterId(eventFilterId, blockchainEvent);
  }

  getClientFilterIdFromGlobalFilterId(globalFilterId) {
    const [channelId, clientFilterId] = globalFilterId.split(':');
    if (!clientFilterId) {
      throw new EventHandlerError(EventHandlerErrorCode.PARSING_GLOBAL_FILTER_ID_FAILURE,
          `Can't get client filter ID from global filter ID (globalFilterId: ${globalFilterId})`,
          globalFilterId);
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
        const timeout = _.get(config, 'timeout', null);

        // NOTE(ehgmsdk20): If the epoch_ms is changed, it must be changed to get it
        // through the getBlockchainParams function.
        const epochMs = _.get(BlockchainParams, 'genesis.epoch_ms', 30000);

        if (!txHash|| !timeout) {
          throw new EventHandlerError(EventHandlerErrorCode.MISSING_PARAMS_IN_CONFIG,
              `config.tx_hash or config.timeout is missing (${JSON.stringify(config)})`);
        }
        if (!CommonUtil.isValidHash(txHash)) {
          throw new EventHandlerError(EventHandlerErrorCode.INVALID_TX_HASH,
              `Invalid tx hash (${txHash})`);
        }
        if (!CommonUtil.isNumber(timeout) ||
          timeout > NodeConfigs.TX_POOL_TIMEOUT_MS ||
          timeout < epochMs) {
          throw new EventHandlerError(EventHandlerErrorCode.INVALID_TIMEOUT,
            `Invalid timeout (${timeout})\nTimeout must be a number between ` +
            `${epochMs} and ${NodeConfigs.TX_POOL_TIMEOUT_MS}`);
        }
        break;
      default:
        throw new EventHandlerError(EventHandlerErrorCode.INVALID_EVENT_TYPE_IN_VALIDATE_FUNC,
            `Invalid event type (${eventType})`);
    }
  }

  createAndRegisterEventFilter(clientFilterId, channelId, eventType, config) {
    const LOG_HEADER = 'createAndRegisterEventFilter';
    try {
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
        const eventFilterIds = this.txHashToEventFilterIds.get(config.tx_hash)
        if (eventFilterIds) {
          eventFilterIds.push(eventFilterId);
        } else {
          this.txHashToEventFilterIds.set(config.tx_hash, [eventFilterId]);
        }
        this.eventFilterIdToTimeoutCallback.set(eventFilterId, setTimeout(() => {
          this.emitFilterDeleted(eventFilterId, FilterDeletionReasons.FILTER_TIMEOUT);
          this.deregisterEventFilter(clientFilterId, channelId);
        }, config.timeout));
      }
      logger.info(`[${LOG_HEADER}] New filter is registered. (eventFilterId: ${eventFilterId}, ` +
          `eventType: ${eventType}, config: ${JSON.stringify(config)})`);
      return eventFilter;
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Can't create and register event filter ` +
          `(clientFilterId: ${clientFilterId}, channelId: ${channelId}, eventType: ${eventType}, ` +
          `config: ${JSON.stringify(config)}, err: ${err.message})`);
      err.clientFilterId = clientFilterId;
      throw err;
    }
  }

  deregisterEventFilter(clientFilterId, channelId) {
    const LOG_HEADER = 'deregisterEventFilter';
    try {
      const eventFilterId = this.getGlobalFilterId(channelId, clientFilterId);
      const eventFilter = this.eventFilters[eventFilterId];
      if (!eventFilter) {
        throw new EventHandlerError(EventHandlerErrorCode.NO_MATCHED_FILTERS,
            `Can't find filter by filter id`, eventFilterId);
      }
      delete this.eventFilters[eventFilterId];
      if (!this.eventTypeToEventFilterIds[eventFilter.type].delete(eventFilterId)) {
        throw new EventHandlerError(EventHandlerErrorCode.MISSING_FILTER_ID_IN_TYPE_TO_FILTER_IDS,
            `Can't delete filter Id from eventTypeToEventFilterIds (${eventFilterId})`,
            eventFilterId);
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
        if (!txHash) {
          throw new EventHandlerError(EventHandlerErrorCode.MISSING_PARAMS_IN_CONFIG,
              `Missing tx_hash in config (${eventFilterId})`, eventFilterId);
        }
        let eventFilterIds = this.txHashToEventFilterIds.get(txHash);
        eventFilterIds = eventFilterIds.filter((filterId) => filterId !== eventFilterId)
        if (eventFilterIds.length === 0) {
          this.txHashToEventFilterIds.delete(txHash)
        } else {
          this.txHashToEventFilterIds.set(txHash, eventFilterIds);
        }
      }
      logger.info(`[${LOG_HEADER}] Filter is deregistered. (eventFilterId: ${eventFilterId})`);
      return eventFilter;
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Can't deregister event filter ` +
          `(clientFilterId: ${clientFilterId}, channelId: ${channelId}, err: ${err.message})`);
      // NOTE(cshcomcom): After deregister, no error propagation because the callback is not valid.
    }
  }
}

module.exports = EventHandler;
