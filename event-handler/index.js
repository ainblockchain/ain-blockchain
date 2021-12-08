const logger = new (require('../logger'))('EVENT_HANDLER');
const _ = require('lodash');
const EventChannelManager = require('./event-channel-manager');
const { BlockchainEventTypes } = require('../common/constants');
const EventFilter = require('./event-filter');
const BlockchainEvent = require('./blockchain-event');

class EventHandler {
  constructor() {
    this.eventChannelManager = null;
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

  emitValueChanged() {
    // TODO(cshcomcom): Implement
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

  createAndRegisterEventFilter(clientFilterId, channelId, eventType, config) {
    const eventFilterId = this.getGlobalFilterId(clientFilterId, channelId);
    if (this.eventFilters[eventFilterId]) {
      throw Error(`Event filter ID ${eventFilterId} is already in use`);
    }
    if (!Object.keys(BlockchainEventTypes).includes(eventType)) {
      throw Error(`Invalid event type (${eventType})`);
    }
    const eventFilter = new EventFilter(eventFilterId, eventType, config);
    this.eventFilters[eventFilterId] = eventFilter;
    this.eventTypeToEventFilterIds[eventType].add(eventFilterId);
    return eventFilter;
  }
}

module.exports = EventHandler;
