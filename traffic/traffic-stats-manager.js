const TrafficDatabase = require('./traffic-database');

class TrafficStatsManager {
  constructor(intervalMs, maxIntervals, enabled = true) {
    this.intervalMs = intervalMs;
    this.maxIntervals = maxIntervals;
    this.enabled = enabled;
    this.trafficDbMap = new Map();
  }

  addEvent(eventType, latencyMs, currentTimeMs = null) {
    if (!this.enabled) {
      return;
    }
    if (!this.trafficDbMap.has(eventType)) {
      const newTdb = new TrafficDatabase(this.intervalMs, this.maxIntervals, currentTimeMs);
      this.trafficDbMap.set(eventType, newTdb);
    }
    const tdb = this.trafficDbMap.get(eventType);
    tdb.addEvent(latencyMs, currentTimeMs);
  }

  getEventSums(eventType, periodMs, currentTimeMs = null) {
    if (!this.enabled) {
      return null;
    }
    if (!this.trafficDbMap.has(eventType)) {
      return null;
    }
    const tdb = this.trafficDbMap.get(eventType);
    return tdb.getEventSums(periodMs, currentTimeMs);
  }

  getEventStats(periodSec, currentTimeMs = null) {
    if (!this.enabled) {
      return {};
    }
    const stats = {};
    for (const eventType of this.trafficDbMap.keys()) {
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
