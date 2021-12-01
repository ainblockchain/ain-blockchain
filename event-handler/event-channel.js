class EventChannel {
  constructor(id, webSocket) {
    this.id = id;
    this.webSocket = webSocket;
    this.eventFilterIds = new Set();
  }

  addEventFilterId(filterId) {
    this.eventFilterIds.add(filterId)
  }
}

module.exports = EventChannel;
