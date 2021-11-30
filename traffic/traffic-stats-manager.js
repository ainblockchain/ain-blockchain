const EventCounter = require('./event-counter');

class TrafficStatsManager {
  constructor(intervalMs, maxIntervals, enabled = true) {
    this.intervalMs = intervalMs;
    this.maxIntervals = maxIntervals;
    this.enabled = enabled;
    this.eventCounterMap = new Map();
  }

  addEvent(eventType, latencyMs, currentTimeMs = null) {
    if (!this.enabled) {
      return;
    }
    if (!this.eventCounterMap.has(eventType)) {
      const newCounter = new EventCounter(this.intervalMs, this.maxIntervals, currentTimeMs);
      this.eventCounterMap.set(eventType, newCounter);
    }
    const counter = this.eventCounterMap.get(eventType);
    counter.addEvent(latencyMs, currentTimeMs);
  }

  getEventSums(eventType, periodMs, currentTimeMs = null) {
    if (!this.enabled) {
      return null;
    }
    if (!this.eventCounterMap.has(eventType)) {
      return null;
    }
    const counter = this.eventCounterMap.get(eventType);
    return counter.getEventSums(periodMs, currentTimeMs);
  }

  getEventStats(periodSec, currentTimeMs = null) {
    if (!this.enabled) {
      return {};
    }
    const stats = {};
    for (const eventType of this.eventCounterMap.keys()) {
      let rate = 0;
      let latency = 0;
      if (periodSec > 0) {
        const sums = this.getEventSums(eventType, periodSec * 1000, currentTimeMs);
        if (sums && sums.countSum > 0) {
          rate = sums.countSum / periodSec;
          latency = sums.latencySum / sums.countSum;
        }
      }
      stats[eventType] = {
        rate,
        latency,
      };
    }
    return stats;
  }
}

module.exports = TrafficStatsManager;
