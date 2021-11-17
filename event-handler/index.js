const logger = new (require('../logger'))('EVENT_HANDLER');
const _ = require('lodash');
const EventHandlerServer = require('./server');
const { EventTypes } = require('../common/constants');
const Filter = require('./filter');

class EventHandler {
  constructor() {
    this.server = null;
    this.running = false;
    this.filters = {};
    this.eventTypeToFilters = {};
    for (const eventType of Object.keys(EventTypes)) {
      this.eventTypeToFilters[eventType] = [];
    }
  }

  run() {
    this.server = new EventHandlerServer(this);
    this.server.startListen();
    this.running = true;
    logger.info(`Event handler started!`);
  }

  isRunning() {
    return this.running;
  }

  emit(event) {
    if (!this.running) {
      return;
    }
    switch (event.type) {
      case EventTypes.BLOCK_FINALIZED:
        for (const filterId of this.eventTypeToFilters[EventTypes.BLOCK_FINALIZED]) {
          const filter = this.filters[filterId];
          const filterBlockNumber = _.get(filter, 'config.block_number', -1);
          if (filterBlockNumber === -1) {
            break;
          }
          const eventBlockNumber = _.get(event, 'payload.block_number', -1);
          if (eventBlockNumber === -1) {
            break;
          }
          if (filterBlockNumber === eventBlockNumber) {
            this.server.propagateEventByFilterId(filterId, event);
          }
        }
        break;
      case EventTypes.VALUE_CHANGED:
        // TODO(sanghee): Implement
        break;
    }
  }

  createAndRegisterFilter(eventType, config) {
    if (!Object.keys(EventTypes).includes(eventType)) {
      throw Error(`Invalid event type (${eventType})`);
    }
    const filterId = Date.now();
    if (this.filters[filterId]) { // TODO: Retry logic
      throw Error(`Filter ID ${filterId} is already in use`);
    }
    const filter = new Filter(filterId, eventType, config);
    this.filters[filterId] = filter;
    this.eventTypeToFilters[eventType].push(filterId);
    return filter;
  }
}

module.exports = EventHandler;
