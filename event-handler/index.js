const logger = new (require('../logger'))('EVENT_HANDLER');
const _ = require('lodash');
const EventHandlerServer = require('./server');
const { EventTypes } = require('../common/constants');
const EventFilter = require('./event-filter');

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
    this.server.startListen();
    this.isRunning = true;
    logger.info(`Event handler started!`);
  }

  emit(event) {
    if (!this.isRunning) {
      return;
    }
    switch (event.type) {
      case EventTypes.BLOCK_FINALIZED:
        for (const eventFilterId of this.eventTypeToEventFilters[EventTypes.BLOCK_FINALIZED]) {
          const eventFilter = this.eventFilters[eventFilterId];
          const eventFilterBlockNumber = _.get(eventFilter, 'config.block_number', -1);
          if (eventFilterBlockNumber === -1) {
            break;
          }
          const eventBlockNumber = _.get(event, 'payload.block_number', -1);
          if (eventBlockNumber === -1) {
            break;
          }
          if (eventFilterBlockNumber === eventBlockNumber) {
            this.server.propagateEventByEventFilterId(eventFilterId, event);
          }
        }
        break;
      case EventTypes.VALUE_CHANGED:
        // TODO(cshcomcom): Implement
        break;
    }
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