const _ = require('lodash');

class TrafficDatabase {
  constructor(
      intervalMs,
      maxIntervals,
      currentTimeMs = null) {
    this.intervalMs = intervalMs;
    this.maxIntervals = maxIntervals;
    this.initialTimeMs = currentTimeMs;
    this.countCircularQueue = _.fill(Array(maxIntervals), 0);
    this.metricCircularQueue = _.fill(Array(maxIntervals), 0);
    this.curCount = 0;
    this.curMetric = 0;
    this.lastIntervalCount = 0;
    this.lastQueueIndex = 0;
  }

  updateQueueIndex(curTime) {
    const intervalCount = Math.ceil((curTime - this.initialTimeMs) / this.intervalMs);
    if (intervalCount <= this.lastIntervalCount) {
      // Does nothing.
      return;
    }
    let queueIndexDelta = intervalCount - this.lastIntervalCount;
    if (queueIndexDelta <= 0) {
      // Does nothing.
      return;
    }
    if (queueIndexDelta > this.maxIntervals) {
      // Multiple rounds are compressed to 1 round.
      queueIndexDelta = this.maxIntervals + queueIndexDelta % this.maxIntervals;
    }
    const oldQueueIndex = this.lastQueueIndex;
    for (let i = 0; i < queueIndexDelta; i++) {
      this.lastQueueIndex = (oldQueueIndex + i) % this.maxIntervals;
      if (queueIndexDelta < this.maxIntervals) {
        // Flush current count / metric.
        this.countCircularQueue[this.lastQueueIndex] = this.curCount;
        this.metricCircularQueue[this.lastQueueIndex] = this.curMetric;
      } else {
        // Reset count / metric.
        this.countCircularQueue[this.lastQueueIndex] = 0;
        this.metricCircularQueue[this.lastQueueIndex] = 0;
      }
      this.curCount = 0;
      this.curMetric = 0;
    }
    this.lastQueueIndex = (oldQueueIndex + queueIndexDelta) % this.maxIntervals;
    this.lastIntervalCount = intervalCount;
  }

  addEvent(metricValue, currentTimeMs = null) {
    const curTime = currentTimeMs !== null ? currentTimeMs : Date.now();
    this.updateQueueIndex(curTime);
    this.curCount += 1;
    this.curMetric += metricValue;
  }

  getEventSums(periodMs, currentTimeMs = null) {
    if (periodMs <= 0) {
      return null;
    }
    const numIntervals = Math.floor(periodMs / this.intervalMs);
    if (numIntervals > this.maxIntervals) {
      return null;
    }
    const curTime = currentTimeMs !== null ? currentTimeMs : Date.now();
    this.updateQueueIndex(curTime);
    let countSum = 0;
    let metricSum = 0;
    for (let i = 1; i <= numIntervals; i++) {
      const queueIndex = (this.lastQueueIndex - i + this.maxIntervals) % this.maxIntervals;
      countSum += this.countCircularQueue[queueIndex];
      metricSum += this.metricCircularQueue[queueIndex];
    }
    return {
      countSum,
      metricSum,
    };
  }
}

module.exports = TrafficDatabase;
