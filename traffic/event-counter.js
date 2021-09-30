const _ = require('lodash');

class EventCounter {
  constructor(
      intervalMs,
      maxIntervals,
      currentTimeMs = null) {
    this.intervalMs = intervalMs;
    this.maxIntervals = maxIntervals;
    this.initialTimeMs = currentTimeMs;
    this.circularQueue = _.fill(Array(maxIntervals), 0);
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
      this.circularQueue[this.lastQueueIndex] = 0;  // Reset a queue entry.
    }
    this.lastIntervalCount = intervalCount;
  }

  addEvent(currentTimeMs = null) {
    const curTime = currentTimeMs !== null ? currentTimeMs : Date.now();
    this.updateQueueIndex(curTime);
    this.circularQueue[this.lastQueueIndex] += 1;
  }

  countEvents(periodMs, currentTimeMs = null) {
    if (periodMs <= 0) {
      return -1;
    }
    const numIntervals = Math.floor(periodMs / this.intervalMs);
    if (numIntervals > this.maxIntervals) {
      return -1;
    }
    const curTime = currentTimeMs !== null ? currentTimeMs : Date.now();
    this.updateQueueIndex(curTime);
    let count = 0;
    for (let i = 1; i <= numIntervals; i++) {
      const queueIndex = (this.lastQueueIndex - i + this.maxIntervals) % this.maxIntervals;
      count += this.circularQueue[queueIndex];
    }
    return count;
  }
}

module.exports = EventCounter;
