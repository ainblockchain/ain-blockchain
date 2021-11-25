const logger = new (require('../logger'))('EVENT_HANDLER');
const _ = require('lodash');
const EventHandlerServer = require('./server');
const { BlockchainEventTypes } = require('../common/constants');
const EventFilter = require('./event-filter');
const BlockchainEvent = require('./blockchain-event');

class EventHandler {
  constructor() {
    this.server = null;
    this.eventFilters = {};
    this.eventTypeToEventFilters = {};
    for (const eventType of Object.keys(BlockchainEventTypes)) {
      this.eventTypeToEventFilters[eventType] = [];
    }
    run();
  }

  run() {
    this.server = new EventHandlerServer(this);
    this.server.startListening();
    logger.info(`Event handler started!`);
  }

  emitBlockFinalized(blockNumber) {
    if (!blockNumber) {
      return;
    }

    const blockchainEvent = new BlockchainEvent(BlockchainEventTypes.BLOCK_FINALIZED, {
      block_number: blockNumber,
    });

    for (const eventFilterId of this.eventTypeToEventFilters[BlockchainEventTypes.BLOCK_FINALIZED]) {
      const eventFilter = this.eventFilters[eventFilterId];
      const eventFilterBlockNumber = _.get(eventFilter, 'config.block_number', -1);
      if (eventFilterBlockNumber === -1) {
        continue;
      }
      if (eventFilterBlockNumber === blockNumber) {
        this.server.transmitEventByEventFilterId(eventFilterId, blockchainEvent);
      }
    }
  }

  emitValueChanged() {
    // TODO(cshcomcom): Implement
  }

  createAndRegisterEventFilter(clientFilterId, channelId, eventType, config) {
    const eventFilterId = `${channelId}:${clientFilterId}`;
    if (this.eventFilters[eventFilterId]) {
      throw Error(`Event filter ID ${eventFilterId} is already in use`);
    }
    if (!Object.keys(BlockchainEventTypes).includes(eventType)) {
      throw Error(`Invalid event type (${eventType})`);
    }
    const eventFilter = new EventFilter(eventFilterId, eventType, config);
    this.eventFilters[eventFilterId] = eventFilter;
    this.eventTypeToEventFilters[eventType].push(eventFilterId);
    return eventFilter;
  }
}

module.exports = EventHandler;
