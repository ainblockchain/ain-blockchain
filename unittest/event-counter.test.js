const EventCounter = require('../traffic/event-counter');

const { expect, assert } = require('chai');

describe("event-counter", () => {
  const intervalMs = 1000;
  const maxIntervals = 10;
  const initialTimeMs = 5000;
  let ec;

  beforeEach(() => {
    ec = new EventCounter(intervalMs, maxIntervals, initialTimeMs);
  })

  describe("initialization", () => {
    it("constructor", () => {
      expect(ec.intervalMs).to.equal(intervalMs);
      expect(ec.maxIntervals).to.equal(maxIntervals);
      expect(ec.countCircularQueue).to.not.equal(null);
      expect(ec.countCircularQueue.length).to.equal(maxIntervals);
      assert.deepEqual(ec.countCircularQueue, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(0);
      expect(ec.lastQueueIndex).to.equal(0);
    });
  });

  describe("addEvent", () => {
    it("with intervals not overlapping", () => {
      ec.addEvent(10, initialTimeMs);
      ec.addEvent(10, initialTimeMs);
      ec.addEvent(10, initialTimeMs);
      assert.deepEqual(ec.countCircularQueue, [3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [30, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(0);
      expect(ec.lastQueueIndex).to.equal(0);

      ec.addEvent(10, initialTimeMs + intervalMs);
      ec.addEvent(10, initialTimeMs + intervalMs);
      ec.addEvent(10, initialTimeMs + intervalMs);
      assert.deepEqual(ec.countCircularQueue, [3, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [30, 30, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(1);
      expect(ec.lastQueueIndex).to.equal(1);

      ec.addEvent(10, initialTimeMs + intervalMs * 3);
      ec.addEvent(10, initialTimeMs + intervalMs * 3);
      ec.addEvent(10, initialTimeMs + intervalMs * 3);
      assert.deepEqual(ec.countCircularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [30, 30, 0, 30, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(3);
      expect(ec.lastQueueIndex).to.equal(3);

      // go back to the past
      ec.addEvent(10, initialTimeMs + intervalMs * 2);
      assert.deepEqual(ec.countCircularQueue, [3, 3, 0, 4, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [30, 30, 0, 40, 0, 0, 0, 0, 0, 0]);
      // no changes
      expect(ec.lastIntervalCount).to.equal(3);
      expect(ec.lastQueueIndex).to.equal(3);
    });

    it("with intervals overlapping", () => {
      ec.addEvent(10, initialTimeMs);
      ec.addEvent(10, initialTimeMs);
      ec.addEvent(10, initialTimeMs);
      assert.deepEqual(ec.countCircularQueue, [3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [30, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(0);
      expect(ec.lastQueueIndex).to.equal(0);

      // with 1 round
      ec.addEvent(10, initialTimeMs + intervalMs);
      ec.addEvent(10, initialTimeMs + intervalMs);
      ec.addEvent(10, initialTimeMs + intervalMs);
      assert.deepEqual(ec.countCircularQueue, [3, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [30, 30, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(1);
      expect(ec.lastQueueIndex).to.equal(1);

      ec.addEvent(10, initialTimeMs + intervalMs * (maxIntervals + 1));
      ec.addEvent(10, initialTimeMs + intervalMs * (maxIntervals + 1));
      assert.deepEqual(ec.countCircularQueue, [0, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [0, 20, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals + 1);
      expect(ec.lastQueueIndex).to.equal(1);

      ec.addEvent(10, initialTimeMs + intervalMs * (maxIntervals + 3));
      ec.addEvent(10, initialTimeMs + intervalMs * (maxIntervals + 3));
      assert.deepEqual(ec.countCircularQueue, [0, 2, 0, 2, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [0, 20, 0, 20, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals + 3);
      expect(ec.lastQueueIndex).to.equal(3);

      // with 2 rounds
      ec.addEvent(10, initialTimeMs + intervalMs * (maxIntervals * 2 + 3));
      assert.deepEqual(ec.countCircularQueue, [0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [0, 0, 0, 10, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals * 2 + 3);
      expect(ec.lastQueueIndex).to.equal(3);
    });

    it("with various time", () => {
      ec.addEvent(10, initialTimeMs + 1);
      assert.deepEqual(ec.countCircularQueue, [0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [0, 10, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(1);
      expect(ec.lastQueueIndex).to.equal(1);

      ec.addEvent(10, initialTimeMs + intervalMs * 2 - 1);
      assert.deepEqual(ec.countCircularQueue, [0, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [0, 10, 10, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(2);
      expect(ec.lastQueueIndex).to.equal(2);
    });
  });

  describe("getEventSums", () => {
    beforeEach(() => {
      ec.addEvent(10, initialTimeMs);
      ec.addEvent(10, initialTimeMs);
      ec.addEvent(10, initialTimeMs);

      ec.addEvent(20, initialTimeMs + intervalMs);
      ec.addEvent(20, initialTimeMs + intervalMs);
      ec.addEvent(20, initialTimeMs + intervalMs);

      ec.addEvent(30, initialTimeMs + intervalMs * 3);
      ec.addEvent(30, initialTimeMs + intervalMs * 3);
      ec.addEvent(30, initialTimeMs + intervalMs * 3);

      assert.deepEqual(ec.countCircularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [30, 60, 0, 90, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(3);
      expect(ec.lastQueueIndex).to.equal(3);
    });

    it("with intervals not overlapping", () => {
      assert.deepEqual(ec.countCircularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [30, 60, 0, 90, 0, 0, 0, 0, 0, 0]);

      // numIntervals = 1
      assert.deepEqual(ec.getEventSums(1, initialTimeMs + intervalMs * 3), {
        countSum: 0,
        latencySum: 0,
      });
      assert.deepEqual(ec.getEventSums(intervalMs, initialTimeMs + intervalMs * 4), {
        countSum: 3,
        latencySum: 90,
      });
      assert.deepEqual(ec.getEventSums(intervalMs * 2 - 1, initialTimeMs + intervalMs * 4), {
        countSum: 3,
        latencySum: 90,
      });
      assert.deepEqual(ec.countCircularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [30, 60, 0, 90, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(4);
      expect(ec.lastQueueIndex).to.equal(4);

      // numIntervals = 2
      assert.deepEqual(ec.getEventSums(intervalMs * 2, initialTimeMs + intervalMs * 4), {
        countSum: 3,
        latencySum: 90,
      });
      assert.deepEqual(ec.countCircularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [30, 60, 0, 90, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(4);
      expect(ec.lastQueueIndex).to.equal(4);

      // numIntervals = 3
      assert.deepEqual(ec.getEventSums(intervalMs * 3, initialTimeMs + intervalMs * 4), {
        countSum: 6,
        latencySum: 150,
      });
      assert.deepEqual(ec.countCircularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [30, 60, 0, 90, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(4);
      expect(ec.lastQueueIndex).to.equal(4);

      // numIntervals = 4
      assert.deepEqual(ec.getEventSums(intervalMs * 4, initialTimeMs + intervalMs * 4), {
        countSum: 9,
        latencySum: 180,
      });
      assert.deepEqual(ec.countCircularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [30, 60, 0, 90, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(4);
      expect(ec.lastQueueIndex).to.equal(4);
    });

    it("with intervals overlapping with 1 round", () => {
      assert.deepEqual(ec.countCircularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [30, 60, 0, 90, 0, 0, 0, 0, 0, 0]);

      // numIntervals = 10, lastQueueIndex = 0
      assert.deepEqual(ec.getEventSums(intervalMs * maxIntervals, initialTimeMs + intervalMs * maxIntervals), {
        countSum: 6,
        latencySum: 150,
      });
      assert.deepEqual(ec.countCircularQueue, [0, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [0, 60, 0, 90, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals);
      expect(ec.lastQueueIndex).to.equal(0);

      // numIntervals = 10, lastQueueIndex = 1
      assert.deepEqual(ec.getEventSums(intervalMs * maxIntervals, initialTimeMs + intervalMs * (maxIntervals + 1)), {
        countSum: 3,
        latencySum: 90,
      });
      assert.deepEqual(ec.countCircularQueue, [0, 0, 0, 3, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [0, 0, 0, 90, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals + 1);
      expect(ec.lastQueueIndex).to.equal(1);

      // numIntervals = 10, lastQueueIndex = 2
      assert.deepEqual(ec.getEventSums(intervalMs * maxIntervals, initialTimeMs + intervalMs * (maxIntervals + 2)), {
        countSum: 3,
        latencySum: 90,
      });
      assert.deepEqual(ec.countCircularQueue, [0, 0, 0, 3, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [0, 0, 0, 90, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals + 2);
      expect(ec.lastQueueIndex).to.equal(2);

      // numIntervals = 10, lastQueueIndex = 3
      assert.deepEqual(ec.getEventSums(intervalMs * maxIntervals, initialTimeMs + intervalMs * (maxIntervals + 3)), {
        countSum: 0,
        latencySum: 0,
      });
      assert.deepEqual(ec.countCircularQueue, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals + 3);
      expect(ec.lastQueueIndex).to.equal(3);
    });

    it("with intervals overlapping with 100 rounds", () => {
      assert.deepEqual(ec.countCircularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [30, 60, 0, 90, 0, 0, 0, 0, 0, 0]);

      // numIntervals = 10, lastQueueIndex = 3
      assert.deepEqual(ec.getEventSums(intervalMs * maxIntervals, initialTimeMs + intervalMs * (maxIntervals * 100 + 4)), {
        countSum: 0,
        latencySum: 0,
      });
      assert.deepEqual(ec.countCircularQueue, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals * 100 + 4);
      expect(ec.lastQueueIndex).to.equal(4);
    });

    it("with various periods", () => {
      assert.deepEqual(ec.countCircularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(ec.latencyCircularQueue, [30, 60, 0, 90, 0, 0, 0, 0, 0, 0]);

      assert.deepEqual(ec.getEventSums(-1, initialTimeMs + intervalMs * 4), null);
      assert.deepEqual(ec.getEventSums(0, initialTimeMs + intervalMs * 4), null);
      assert.deepEqual(ec.getEventSums(1, initialTimeMs + intervalMs * 4), {
        countSum: 0,
        latencySum: 0,
      });
      assert.deepEqual(ec.getEventSums(intervalMs * maxIntervals, initialTimeMs + intervalMs * 4), {
        countSum: 9,
        latencySum: 180,
      });
      assert.deepEqual(ec.getEventSums(intervalMs * maxIntervals + intervalMs - 1, initialTimeMs + intervalMs * 4), {
        countSum: 9,
        latencySum: 180,
      });
      assert.deepEqual(ec.getEventSums(intervalMs * (maxIntervals + 1), initialTimeMs + intervalMs * 4), null);
    });
  });
});
