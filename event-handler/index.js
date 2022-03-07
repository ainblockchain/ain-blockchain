const logger = new (require('../logger'))('EVENT_HANDLER');
const _ = require('lodash');
const EventChannelManager = require('./event-channel-manager');
const StateEventTreeManager = require('./state-event-tree-manager');
const { BlockchainEventTypes } = require('../common/constants');
const CommonUtil = require('../common/common-util');
const EventFilter = require('./event-filter');
const BlockchainEvent = require('./blockchain-event');

class EventHandler {
  constructor() {
    this.eventChannelManager = null;
    this.stateEventTreeManager = new StateEventTreeManager();
    this.eventFilters = {};
    this.eventTypeToEventFilterIds = {};
    for (const eventType of Object.keys(BlockchainEventTypes)) {
      this.eventTypeToEventFilterIds[eventType] = new Set();
    }
    this.run();
  }

  run() {
    this.eventChannelManager = new EventChannelManager(this);
    this.eventChannelManager.startListening();
    logger.info(`Event handler started!`);
  }

  // TODO(cshcomcom): Add tests.
  emitBlockFinalized(blockNumber) {
    if (!blockNumber) {
      return;
    }

    const blockchainEvent = new BlockchainEvent(BlockchainEventTypes.BLOCK_FINALIZED, {
      block_number: blockNumber,
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
  emitValueChanged(auth, parsedValuePath, beforeValue, afterValue) {
    const valuePath = CommonUtil.formatPath(parsedValuePath);
    const matchedEventFilterIdList = this.stateEventTreeManager.matchEventFilterPath(parsedValuePath);
    for (const eventFilterId of matchedEventFilterIdList) {
      const eventFilter = this.eventFilters[eventFilterId];
      const targetPath = _.get(eventFilter, 'config.path', null);
      const parsedTargetPath = CommonUtil.parsePath(targetPath);
      if (parsedValuePath.length !== parsedTargetPath.length) {
        logger.error(`Lengths of parsedLocalPath and parsedTargetPath do not match!`);
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
        values: {
          before: beforeValue,
          after: afterValue,
        },
      });
      this.eventChannelManager.transmitEventByEventFilterId(eventFilterId, blockchainEvent);
    }
  }

  getClientFilterIdFromGlobalFilterId(globalFilterId) {
    const [channelId, clientFilterId] = globalFilterId.split(':');
    if (!clientFilterId) {
      throw Error(`Can't get client filter ID from global filter ID ` +
          `(nodeFilterId: ${globalFilterId})`);
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
          throw Error(`Invalid block_number. It must not be a negative number (${blockNumber})`);
        } else if (!CommonUtil.isNumber(blockNumber) && blockNumber !== null) {
          throw Error(`Invalid block_number type. (${typeof blockNumber})`);
        }
        break;
      case BlockchainEventTypes.VALUE_CHANGED:
        const path = _.get(config, 'path', null);
        if (!path) {
          throw Error(`config.path is missing (${JSON.stringify(config)})`);
        }
        const parsedPath = CommonUtil.parsePath(path);
        if (!StateEventTreeManager.isValidPathForStateEventTree(parsedPath)) {
          throw Error(`Invalid format path (${path})`);
        }
        break;
      default:
        throw Error(`Invalid event type (${eventType})`);
    }
  }

  createAndRegisterEventFilter(clientFilterId, channelId, eventType, config) {
    try {
      const eventFilterId = this.getGlobalFilterId(channelId, clientFilterId);
      if (this.eventFilters[eventFilterId]) {
        throw Error(`Event filter ID ${eventFilterId} is already in use`);
      }
      EventHandler.validateEventFilterConfig(eventType, config);
      const eventFilter = new EventFilter(eventFilterId, eventType, config);
      this.eventFilters[eventFilterId] = eventFilter;
      this.eventTypeToEventFilterIds[eventType].add(eventFilterId);
      if (eventType === BlockchainEventTypes.VALUE_CHANGED) {
        this.stateEventTreeManager.registerEventFilterId(config.path, eventFilterId);
      }
      logger.info(`New filter is registered. (eventFilterId: ${eventFilterId}, ` +
          `eventType: ${eventType}, config: ${JSON.stringify(config)})`);
      return eventFilter;
    } catch (err) {
      logger.error(`Can't create and register event filter (clientFilterId: ${clientFilterId}, ` +
          `channelId: ${channelId}, eventType: ${eventType}, config: ${config}, ` +
          `err: ${err.message})`);
      throw err;
    }
  }

  deregisterEventFilter(clientFilterId, channelId) {
    try {
      const eventFilterId = this.getGlobalFilterId(channelId, clientFilterId);
      const eventFilter = this.eventFilters[eventFilterId];
      if (!eventFilter) {
        throw Error(`Can't find filter by filter id`);
      }
      delete this.eventFilters[eventFilterId];
      if (!this.eventTypeToEventFilterIds[eventFilter.type].delete(eventFilterId)) {
        throw Error(`Can't delete filter Id from eventTypeToEventFilterIds (${eventFilterId})`);
      }
      if (eventFilter.type === BlockchainEventTypes.VALUE_CHANGED) {
        this.stateEventTreeManager.deregisterEventFilterId(eventFilterId);
      }
      logger.info(`Filter is deregistered. (eventFilterId: ${eventFilterId})`);
      return eventFilter;
    } catch (err) {
      logger.error(`Can't deregister event filter (clientFilterId: ${clientFilterId}, ` +
          `channelId: ${channelId}, err: ${err.message})`);
      throw err;
    }
  }
}

module.exports = EventHandler;
