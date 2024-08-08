const { buildRemoteUrlFromSocket } = require('../common/network-util');

class EventChannel {
  constructor(id, webSocket) {
    this.id = id;
    this.webSocket = webSocket;
    this.remoteUrl = buildRemoteUrlFromSocket(webSocket);
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
      remoteUrl: this.remoteUrl,
      eventFilterIds: [...this.eventFilterIds],
      lastMessagingTimeMs: this.lastMessagingTimeMs,
      idleTimeMs: Date.now() - this.lastMessagingTimeMs,
    };
  }
}

module.exports = EventChannel;
