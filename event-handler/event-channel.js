const { buildRemoteUrlFromSocket } = require('../common/network-util');

class EventChannel {
  constructor(id, webSocket) {
    this.id = id;
    this.webSocket = webSocket;
    this.remoteUrl = buildRemoteUrlFromSocket(webSocket);
    this.eventFilterIds = new Set();
    const curTimeMs = Date.now();
    this.creationTimeMs = curTimeMs;
    this.lastMessagingTimeMs = curTimeMs;
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

  getLifeTimeMs() {
    return Date.now() - this.creationTimeMs;
  }

  getIdleTimeMs() {
    return Date.now() - this.lastMessagingTimeMs;
  }

  toObject() {
    return {
      id: this.id,
      remoteUrl: this.remoteUrl,
      eventFilterIds: [...this.eventFilterIds],
      creationTimeMs: this.creationTimeMs,
      lastMessagingTimeMs: this.lastMessagingTimeMs,
      lifeTimeMs: this.getLifeTimeMs(),
      idleTimeMs: this.getIdleTimeMs(),
    };
  }
}

module.exports = EventChannel;
