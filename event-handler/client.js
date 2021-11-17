class EventHandlerClient {
  constructor(id, webSocket) {
    this.id = id;
    this.webSocket = webSocket;
    this.filters = [];
  }

  addFilter(filter) {
    this.filters.push(filter);
  }
}

module.exports = EventHandlerClient;
