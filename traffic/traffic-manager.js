const TrafficDb = require('./traffic-db');

class TrafficManager {
  constructor(intervalMs, maxIntervals) {
    this.intervalMs = intervalMs;
    this.maxIntervals = maxIntervals;
    this.trafficDbMap = new Map();
  }

  addEvent(eventType, currentTimeMs = null) {
    if (!this.trafficDbMap.has(eventType)) {
      const newTdb = new TrafficDb(this.intervalMs, this.maxIntervals, currentTimeMs);
      this.trafficDbMap.set(eventType, newTdb);
    }
    const tdb = this.trafficDbMap.get(eventType);
    tdb.addEvent(currentTimeMs);
  }

  countEvents(eventType, periodMs, currentTimeMs = null) {
    if (!this.trafficDbMap.has(eventType)) {
      return 0;
    }
    const tdb = this.trafficDbMap.get(eventType);
    return tdb.countEvents(periodMs, currentTimeMs);
  }

  getEventRates(periodSec, currentTimeMs = null) {
    const rates = {};
    for (const eventType of this.trafficDbMap.keys()) {
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

module.exports = TrafficManager;
