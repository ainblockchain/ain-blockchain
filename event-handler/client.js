const logger = new (require('../logger'))('EVENT_HANDLER_CLIENT');

class EventHandlerClient {
  constructor(id, webSocket) {
    this.id = id;
    this.webSocket = webSocket;
    this.filters = {};
  }

  addFilter(filter) {
    if (!filter.id) {
      logger.error(`Can't find id from filter (${JSON.stringify(filter, null, 2)})`);
      return;
    }
    this.filters[filter.id] = filter;
  }
}

module.exports = EventHandlerClient;
