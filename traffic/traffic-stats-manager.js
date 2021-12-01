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
      const newTrafficDb = new TrafficDatabase(this.intervalMs, this.maxIntervals, currentTimeMs);
      this.trafficDbMap.set(eventType, newTrafficDb);
    }
    const trafficDb = this.trafficDbMap.get(eventType);
    trafficDb.addEvent(latencyMs, currentTimeMs);
  }

  getEventSums(eventType, periodMs, currentTimeMs = null) {
    if (!this.enabled) {
      return null;
    }
    if (!this.trafficDbMap.has(eventType)) {
      return null;
    }
    const trafficDb = this.trafficDbMap.get(eventType);
    return trafficDb.getEventSums(periodMs, currentTimeMs);
  }

  getEventStats(periodSec, currentTimeMs = null) {
    if (!this.enabled) {
      return {};
    }
    const stats = {};
    for (const eventType of this.trafficDbMap.keys()) {
      if (periodSec > 0) {
        const sums = this.getEventSums(eventType, periodSec * 1000, currentTimeMs);
        if (sums && sums.countSum > 0) {
          const rate = sums.countSum / periodSec;
          const latency = sums.latencySum / sums.countSum;
          stats[eventType] = {
            rate,
            latency,
          };
        }
      }
    }
    return stats;
  }
}

module.exports = TrafficStatsManager;
