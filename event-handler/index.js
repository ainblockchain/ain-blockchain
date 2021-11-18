const logger = new (require('../logger'))('EVENT_HANDLER');
const _ = require('lodash');
const EventHandlerServer = require('./server');
const { EventTypes } = require('../common/constants');
const EventFilter = require('./event-filter');
const BlockchainEvent = require('./blockchain-event');

class EventHandler {
  constructor() {
    this.server = null;
    this.isRunning = false;
    this.eventFilters = {};
    this.eventTypeToEventFilters = {};
    for (const eventType of Object.keys(EventTypes)) {
      this.eventTypeToEventFilters[eventType] = [];
    }
  }

  run() {
    this.server = new EventHandlerServer(this);
    this.server.startListening();
    this.isRunning = true;
    logger.info(`Event handler started!`);
  }

  emitBlockFinalized(blockNumber) {
    if (!this.isRunning) {
      return;
    }
    if (!blockNumber) {
      return;
    }

    const blockchainEvent = new BlockchainEvent(EventTypes.BLOCK_FINALIZED, {
      block_number: blockNumber,
    });

    for (const eventFilterId of this.eventTypeToEventFilters[EventTypes.BLOCK_FINALIZED]) {
      const eventFilter = this.eventFilters[eventFilterId];
      const eventFilterBlockNumber = _.get(eventFilter, 'config.block_number', -1);
      if (eventFilterBlockNumber === -1) {
        break;
      }
      const eventBlockNumber = _.get(blockchainEvent, 'payload.block_number', -1);
      if (eventBlockNumber === -1) {
        break;
      }
      if (eventFilterBlockNumber === eventBlockNumber) {
        this.server.transmitEventByEventFilterId(eventFilterId, blockchainEvent);
      }
    }
  }

  emitValueChanged() {
    // TODO(cshcomcom): Implement
  }

  createAndRegisterEventFilter(eventFilterId, eventType, config) {
    if (!Object.keys(EventTypes).includes(eventType)) {
      throw Error(`Invalid event type (${eventType})`);
    }
    if (this.eventFilters[eventFilterId]) {
      throw Error(`Event filter ID ${eventFilterId} is already in use`);
    }
    const eventFilter = new EventFilter(eventFilterId, eventType, config);
    this.eventFilters[eventFilterId] = eventFilter;
    this.eventTypeToEventFilters[eventType].push(eventFilterId);
    return eventFilter;
  }
}

module.exports = EventHandler;
