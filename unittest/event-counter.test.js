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
      expect(ec.circularQueue).to.not.equal(null);
      expect(ec.circularQueue.length).to.equal(maxIntervals);
      assert.deepEqual(ec.circularQueue, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(0);
      expect(ec.lastQueueIndex).to.equal(0);
    });
  });

  describe("addEvent", () => {
    it("with intervals not overlapping", () => {
      ec.addEvent(initialTimeMs);
      ec.addEvent(initialTimeMs);
      ec.addEvent(initialTimeMs);
      assert.deepEqual(ec.circularQueue, [3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(0);
      expect(ec.lastQueueIndex).to.equal(0);

      ec.addEvent(initialTimeMs + intervalMs);
      ec.addEvent(initialTimeMs + intervalMs);
      ec.addEvent(initialTimeMs + intervalMs);
      assert.deepEqual(ec.circularQueue, [3, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(1);
      expect(ec.lastQueueIndex).to.equal(1);

      ec.addEvent(initialTimeMs + intervalMs * 3);
      ec.addEvent(initialTimeMs + intervalMs * 3);
      ec.addEvent(initialTimeMs + intervalMs * 3);
      assert.deepEqual(ec.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(3);
      expect(ec.lastQueueIndex).to.equal(3);

      // go back to the past
      ec.addEvent(initialTimeMs + intervalMs * 2);
      assert.deepEqual(ec.circularQueue, [3, 3, 0, 4, 0, 0, 0, 0, 0, 0]);
      // no changes
      expect(ec.lastIntervalCount).to.equal(3);
      expect(ec.lastQueueIndex).to.equal(3);
    });

    it("with intervals overlapping", () => {
      ec.addEvent(initialTimeMs);
      ec.addEvent(initialTimeMs);
      ec.addEvent(initialTimeMs);
      assert.deepEqual(ec.circularQueue, [3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(0);
      expect(ec.lastQueueIndex).to.equal(0);

      // with 1 round
      ec.addEvent(initialTimeMs + intervalMs);
      ec.addEvent(initialTimeMs + intervalMs);
      ec.addEvent(initialTimeMs + intervalMs);
      assert.deepEqual(ec.circularQueue, [3, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(1);
      expect(ec.lastQueueIndex).to.equal(1);

      ec.addEvent(initialTimeMs + intervalMs * (maxIntervals + 1));
      ec.addEvent(initialTimeMs + intervalMs * (maxIntervals + 1));
      assert.deepEqual(ec.circularQueue, [0, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals + 1);
      expect(ec.lastQueueIndex).to.equal(1);

      ec.addEvent(initialTimeMs + intervalMs * (maxIntervals + 3));
      ec.addEvent(initialTimeMs + intervalMs * (maxIntervals + 3));
      assert.deepEqual(ec.circularQueue, [0, 2, 0, 2, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals + 3);
      expect(ec.lastQueueIndex).to.equal(3);

      // with 2 rounds
      ec.addEvent(initialTimeMs + intervalMs * (maxIntervals * 2 + 3));
      assert.deepEqual(ec.circularQueue, [0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals * 2 + 3);
      expect(ec.lastQueueIndex).to.equal(3);
    });

    it("with various time", () => {
      ec.addEvent(initialTimeMs + 1);
      assert.deepEqual(ec.circularQueue, [0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(1);
      expect(ec.lastQueueIndex).to.equal(1);

      ec.addEvent(initialTimeMs + intervalMs * 2 - 1);
      assert.deepEqual(ec.circularQueue, [0, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(2);
      expect(ec.lastQueueIndex).to.equal(2);
    });
  });

  describe("countEvents", () => {
    beforeEach(() => {
      ec.addEvent(initialTimeMs);
      ec.addEvent(initialTimeMs);
      ec.addEvent(initialTimeMs);

      ec.addEvent(initialTimeMs + intervalMs);
      ec.addEvent(initialTimeMs + intervalMs);
      ec.addEvent(initialTimeMs + intervalMs);

      ec.addEvent(initialTimeMs + intervalMs * 3);
      ec.addEvent(initialTimeMs + intervalMs * 3);
      ec.addEvent(initialTimeMs + intervalMs * 3);

      assert.deepEqual(ec.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(3);
      expect(ec.lastQueueIndex).to.equal(3);
    });

    it("with intervals not overlapping", () => {
      assert.deepEqual(ec.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);

      // numIntervals = 1
      expect(ec.countEvents(1, initialTimeMs + intervalMs * 3)).to.equal(0);
      expect(ec.countEvents(intervalMs, initialTimeMs + intervalMs * 4)).to.equal(3);
      expect(ec.countEvents(intervalMs * 2 - 1, initialTimeMs + intervalMs * 4)).to.equal(3);
      assert.deepEqual(ec.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(4);
      expect(ec.lastQueueIndex).to.equal(4);

      // numIntervals = 2
      expect(ec.countEvents(intervalMs * 2, initialTimeMs + intervalMs * 4)).to.equal(3);
      assert.deepEqual(ec.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(4);
      expect(ec.lastQueueIndex).to.equal(4);

      // numIntervals = 3
      expect(ec.countEvents(intervalMs * 3, initialTimeMs + intervalMs * 4)).to.equal(6);
      assert.deepEqual(ec.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(4);
      expect(ec.lastQueueIndex).to.equal(4);

      // numIntervals = 4
      expect(ec.countEvents(intervalMs * 4, initialTimeMs + intervalMs * 4)).to.equal(9);
      assert.deepEqual(ec.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(4);
      expect(ec.lastQueueIndex).to.equal(4);
    });

    it("with intervals overlapping with 1 round", () => {
      assert.deepEqual(ec.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);

      // numIntervals = 10, lastQueueIndex = 0
      expect(ec.countEvents(intervalMs * maxIntervals, initialTimeMs + intervalMs * maxIntervals)).to.equal(6);
      assert.deepEqual(ec.circularQueue, [0, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals);
      expect(ec.lastQueueIndex).to.equal(0);

      // numIntervals = 10, lastQueueIndex = 1
      expect(ec.countEvents(intervalMs * maxIntervals, initialTimeMs + intervalMs * (maxIntervals + 1))).to.equal(3);
      assert.deepEqual(ec.circularQueue, [0, 0, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals + 1);
      expect(ec.lastQueueIndex).to.equal(1);

      // numIntervals = 10, lastQueueIndex = 2
      expect(ec.countEvents(intervalMs * maxIntervals, initialTimeMs + intervalMs * (maxIntervals + 2))).to.equal(3);
      assert.deepEqual(ec.circularQueue, [0, 0, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals + 2);
      expect(ec.lastQueueIndex).to.equal(2);

      // numIntervals = 10, lastQueueIndex = 3
      expect(ec.countEvents(intervalMs * maxIntervals, initialTimeMs + intervalMs * (maxIntervals + 3))).to.equal(0);
      assert.deepEqual(ec.circularQueue, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals + 3);
      expect(ec.lastQueueIndex).to.equal(3);
    });

    it("with intervals overlapping with 100 rounds", () => {
      assert.deepEqual(ec.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);

      // numIntervals = 10, lastQueueIndex = 3
      expect(ec.countEvents(intervalMs * maxIntervals, initialTimeMs + intervalMs * (maxIntervals * 100 + 4))).to.equal(0);
      assert.deepEqual(ec.circularQueue, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(ec.lastIntervalCount).to.equal(maxIntervals * 100 + 4);
      expect(ec.lastQueueIndex).to.equal(4);
    });

    it("with various periods", () => {
      assert.deepEqual(ec.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);

      expect(ec.countEvents(-1, initialTimeMs + intervalMs * 4)).to.equal(-1);
      expect(ec.countEvents(0, initialTimeMs + intervalMs * 4)).to.equal(-1);
      expect(ec.countEvents(1, initialTimeMs + intervalMs * 4)).to.equal(0);
      expect(ec.countEvents(intervalMs * maxIntervals, initialTimeMs + intervalMs * 4)).to.equal(9);
      expect(ec.countEvents(intervalMs * maxIntervals + intervalMs - 1, initialTimeMs + intervalMs * 4)).to.equal(9);
      expect(ec.countEvents(intervalMs * (maxIntervals + 1), initialTimeMs + intervalMs * 4)).to.equal(-1);
    });
  });
});
