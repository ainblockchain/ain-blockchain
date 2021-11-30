const _ = require('lodash');

class EventCounter {
  constructor(
      intervalMs,
      maxIntervals,
      currentTimeMs = null) {
    this.intervalMs = intervalMs;
    this.maxIntervals = maxIntervals;
    this.initialTimeMs = currentTimeMs;
    this.countCircularQueue = _.fill(Array(maxIntervals), 0);
    this.latencyCircularQueue = _.fill(Array(maxIntervals), 0);
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
    if (queueIndexDelta > this.maxIntervals) {
      // Multiple rounds are compressed to 1 round.
      queueIndexDelta = this.maxIntervals  + queueIndexDelta % this.maxIntervals;
    }
    let oldQueueIndex = this.lastQueueIndex;
    for (let i = 1; i <= queueIndexDelta; i++) {
      this.lastQueueIndex = (oldQueueIndex + i) % this.maxIntervals;
      this.countCircularQueue[this.lastQueueIndex] = 0;  // Reset count
      this.latencyCircularQueue[this.lastQueueIndex] = 0;  // Reset latency
    }
    this.lastIntervalCount = intervalCount;
  }

  addEvent(latencyMs, currentTimeMs = null) {
    const curTime = currentTimeMs !== null ? currentTimeMs : Date.now();
    this.updateQueueIndex(curTime);
    this.countCircularQueue[this.lastQueueIndex] += 1;
    this.latencyCircularQueue[this.lastQueueIndex] += latencyMs;
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
    let latencySum = 0;
    for (let i = 1; i <= numIntervals; i++) {
      const queueIndex = (this.lastQueueIndex - i + this.maxIntervals) % this.maxIntervals;
      countSum += this.countCircularQueue[queueIndex];
      latencySum += this.latencyCircularQueue[queueIndex];
    }
    return {
      countSum,
      latencySum,
    };
  }
}

module.exports = EventCounter;
