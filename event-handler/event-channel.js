const logger = new (require('../logger'))('EVENT_CHANNEL');

class EventChannel {
  constructor(id, webSocket) {
    this.id = id;
    this.webSocket = webSocket;
    this.eventFilters = {};
  }

  addEventFilter(filter) {
    if (!filter.id) {
      logger.error(`Can't find id from event filter (${JSON.stringify(filter, null, 2)})`);
      return;
    }
    this.eventFilters[filter.id] = filter;
  }
}

module.exports = EventChannel;
