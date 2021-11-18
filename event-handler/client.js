const logger = new (require('../logger'))('EVENT_HANDLER_CLIENT');

class EventHandlerClient {
  constructor(id, webSocket) {
    this.id = id;
    this.webSocket = webSocket;
    this.eventFilters = {};
  }

  addEventFilter(eventFilter) {
    if (!eventFilter.id) {
      logger.error(`Can't find id from event filter (${JSON.stringify(eventFilter, null, 2)})`);
      return;
    }
    this.eventFilters[eventFilter.id] = eventFilter;
  }
}

module.exports = EventHandlerClient;
