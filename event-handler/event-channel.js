class EventChannel {
  constructor(id, webSocket) {
    this.id = id;
    this.webSocket = webSocket;
    this.eventFilterIds = new Set();
    this.lastMessagingTimeMs = Date.now();
  }

  setLastMessagingTimeMs(timeMs) {
    this.lastMessagingTimeMs = timeMs;
  }

  getFilterIdsSize() {
    return this.eventFilterIds.size;
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
      lastMessagingTimeMs: this.lastMessagingTimeMs,
    };
  }
}

module.exports = EventChannel;
