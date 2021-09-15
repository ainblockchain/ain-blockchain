const EventCounter = require('./event-counter');

class TrafficStatsManager {
  constructor(intervalMs, maxIntervals) {
    this.intervalMs = intervalMs;
    this.maxIntervals = maxIntervals;
    this.eventCounterMap = new Map();
  }

  addEvent(eventType, currentTimeMs = null) {
    if (!this.eventCounterMap.has(eventType)) {
      const newTdb = new EventCounter(this.intervalMs, this.maxIntervals, currentTimeMs);
      this.eventCounterMap.set(eventType, newTdb);
    }
    const tdb = this.eventCounterMap.get(eventType);
    tdb.addEvent(currentTimeMs);
  }

  countEvents(eventType, periodMs, currentTimeMs = null) {
    if (!this.eventCounterMap.has(eventType)) {
      return 0;
    }
    const tdb = this.eventCounterMap.get(eventType);
    return tdb.countEvents(periodMs, currentTimeMs);
  }

  getEventRates(periodSec, currentTimeMs = null) {
    const rates = {};
    for (const eventType of this.eventCounterMap.keys()) {
      let rate = -1;
      if (periodSec > 0) {
        const count = this.countEvents(eventType, periodSec * 1000, currentTimeMs);
        if (count >= 0) {
          rate = count / periodSec;
        }
      }
      rates[eventType] = rate;
    }
    return rates;
  }
}

module.exports = TrafficStatsManager;
