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
      const newTdb = new EventCounter(this.intervalMs, this.maxIntervals, currentTimeMs);
      this.eventCounterMap.set(eventType, newTdb);
    }
    const tdb = this.eventCounterMap.get(eventType);
    tdb.addEvent(latencyMs, currentTimeMs);
  }

  countEvents(eventType, periodMs, currentTimeMs = null) {
    if (!this.enabled) {
      return null;
    }
    if (!this.eventCounterMap.has(eventType)) {
      return null;
    }
    const tdb = this.eventCounterMap.get(eventType);
    return tdb.countEvents(periodMs, currentTimeMs);
  }

  getEventRates(periodSec, currentTimeMs = null) {
    if (!this.enabled) {
      return {};
    }
    const stats = {};
    for (const eventType of this.eventCounterMap.keys()) {
      let eventRate = 0;
      let avgLatency = 0;
      if (periodSec > 0) {
        const sums = this.countEvents(eventType, periodSec * 1000, currentTimeMs);
        if (sums && sums.countSum > 0) {
          eventRate = sums.countSum / periodSec;
          avgLatency = sums.latencySum / sums.countSum;
        }
      }
      stats[eventType] = {
        eventRate,
        avgLatency,
      };
    }
    return stats;
  }
}

module.exports = TrafficStatsManager;
