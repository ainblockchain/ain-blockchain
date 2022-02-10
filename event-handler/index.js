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

  emitValueChanged(auth, parsedValuePath, beforeValue, afterValue) {
    const valuePath = CommonUtil.formatPath(parsedValuePath);
    const matchedEventFilterIdList =
        this.stateEventTreeManager.findMatchedEventFilterIdList(parsedValuePath);
    for (const eventFilterId of matchedEventFilterIdList) {
      const eventFilter = this.eventFilters[eventFilterId];
      const targetPath = _.get(eventFilter, 'config.path', null);
      if (!targetPath) {
        logger.error(`Filter ${eventFilterId} doesn't have config.path`);
        continue;
      }
      const parsedTargetPath = CommonUtil.parsePath(targetPath);
      if (parsedValuePath.length !== parsedTargetPath.length) {
        logger.error(`Lengths of parsedLocalPath and parsedTargetPath do not match!`);
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
      throw Error(`Can't get client filter ID from global filter ID (nodeFilterId: ${globalFilterId})`);
    }
    return clientFilterId;
  }

  getGlobalFilterId(channelId, clientFilterId) {
    return `${channelId}:${clientFilterId}`;
  }

  checkEventFilterConfig(eventType, config) {
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
        const parsedPath = CommonUtil.parsePath(path);
        if (!this.stateEventTreeManager.isValidPathForStateEventTree(parsedPath)) {
          throw Error(`Invalid format path (${path})`);
        }
        break;
      default:
        throw Error(`Invalid event type (${eventType})`);
    }
  }

  createAndRegisterEventFilter(clientFilterId, channelId, eventType, config) {
    const eventFilterId = this.getGlobalFilterId(channelId, clientFilterId);
    if (this.eventFilters[eventFilterId]) {
      throw Error(`Event filter ID ${eventFilterId} is already in use`);
    }
    this.checkEventFilterConfig(eventType, config);
    const eventFilter = new EventFilter(eventFilterId, eventType, config);
    this.eventFilters[eventFilterId] = eventFilter;
    this.eventTypeToEventFilterIds[eventType].add(eventFilterId);
    if (eventType === BlockchainEventTypes.VALUE_CHANGED) {
      this.stateEventTreeManager.registerEventFilterId(config.path, eventFilterId);
    }
    return eventFilter;
  }
}

module.exports = EventHandler;
