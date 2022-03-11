class EventChannel {
  constructor(id, webSocket) {
    this.id = id;
    this.webSocket = webSocket;
    this.eventFilterIds = new Set();
  }

  getAllFilterIds() {
    return this.eventFilterIds.values();
  }

  addEventFilterId(filterId) {
    this.eventFilterIds.add(filterId);
  }

  deleteEventFilterId(filterId) {
    return this.eventFilterIds.delete(filterId);
  }

  toObject() {
    return {
      id: this.id,
      eventFilterIds: [...this.eventFilterIds],
    };
  }
}

module.exports = EventChannel;
