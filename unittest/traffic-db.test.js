const TrafficDb = require('../traffic/traffic-db');

const { expect, assert } = require('chai');

describe("traffic-db", () => {
  const intervalMs = 1000;
  const maxIntervals = 10;
  const initialTimeMs = 5000;
  let tdb;

  beforeEach(() => {
    tdb = new TrafficDb(intervalMs, maxIntervals, initialTimeMs);
  })

  describe("initialization", () => {
    it("constructor", () => {
      expect(tdb.intervalMs).to.equal(intervalMs);
      expect(tdb.maxIntervals).to.equal(maxIntervals);
      expect(tdb.circularQueue).to.not.equal(null);
      expect(tdb.circularQueue.length).to.equal(maxIntervals);
      assert.deepEqual(tdb.circularQueue, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(0);
      expect(tdb.lastQueueIndex).to.equal(0);
    });
  });

  describe("addEvent", () => {
    it("with intervals not overlapping", () => {
      tdb.addEvent(initialTimeMs);
      tdb.addEvent(initialTimeMs);
      tdb.addEvent(initialTimeMs);
      assert.deepEqual(tdb.circularQueue, [3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(0);
      expect(tdb.lastQueueIndex).to.equal(0);

      tdb.addEvent(initialTimeMs + intervalMs);
      tdb.addEvent(initialTimeMs + intervalMs);
      tdb.addEvent(initialTimeMs + intervalMs);
      assert.deepEqual(tdb.circularQueue, [3, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(1);
      expect(tdb.lastQueueIndex).to.equal(1);

      tdb.addEvent(initialTimeMs + intervalMs * 3);
      tdb.addEvent(initialTimeMs + intervalMs * 3);
      tdb.addEvent(initialTimeMs + intervalMs * 3);
      assert.deepEqual(tdb.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(3);
      expect(tdb.lastQueueIndex).to.equal(3);

      // go back to the past
      tdb.addEvent(initialTimeMs + intervalMs * 2);
      assert.deepEqual(tdb.circularQueue, [3, 3, 0, 4, 0, 0, 0, 0, 0, 0]);
      // no changes
      expect(tdb.lastIntervalCount).to.equal(3);
      expect(tdb.lastQueueIndex).to.equal(3);
    });

    it("with intervals overlapping", () => {
      tdb.addEvent(initialTimeMs);
      tdb.addEvent(initialTimeMs);
      tdb.addEvent(initialTimeMs);
      assert.deepEqual(tdb.circularQueue, [3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(0);
      expect(tdb.lastQueueIndex).to.equal(0);

      // with 1 round
      tdb.addEvent(initialTimeMs + intervalMs);
      tdb.addEvent(initialTimeMs + intervalMs);
      tdb.addEvent(initialTimeMs + intervalMs);
      assert.deepEqual(tdb.circularQueue, [3, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(1);
      expect(tdb.lastQueueIndex).to.equal(1);

      tdb.addEvent(initialTimeMs + intervalMs * (maxIntervals + 1));
      tdb.addEvent(initialTimeMs + intervalMs * (maxIntervals + 1));
      assert.deepEqual(tdb.circularQueue, [0, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(maxIntervals + 1);
      expect(tdb.lastQueueIndex).to.equal(1);

      tdb.addEvent(initialTimeMs + intervalMs * (maxIntervals + 3));
      tdb.addEvent(initialTimeMs + intervalMs * (maxIntervals + 3));
      assert.deepEqual(tdb.circularQueue, [0, 2, 0, 2, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(maxIntervals + 3);
      expect(tdb.lastQueueIndex).to.equal(3);

      // with 2 rounds
      tdb.addEvent(initialTimeMs + intervalMs * (maxIntervals * 2 + 3));
      assert.deepEqual(tdb.circularQueue, [0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(maxIntervals * 2 + 3);
      expect(tdb.lastQueueIndex).to.equal(3);
    });
  });

  describe("countEvents", () => {
    beforeEach(() => {
      tdb.addEvent(initialTimeMs);
      tdb.addEvent(initialTimeMs);
      tdb.addEvent(initialTimeMs);

      tdb.addEvent(initialTimeMs + intervalMs);
      tdb.addEvent(initialTimeMs + intervalMs);
      tdb.addEvent(initialTimeMs + intervalMs);

      tdb.addEvent(initialTimeMs + intervalMs * 3);
      tdb.addEvent(initialTimeMs + intervalMs * 3);
      tdb.addEvent(initialTimeMs + intervalMs * 3);

      assert.deepEqual(tdb.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(3);
      expect(tdb.lastQueueIndex).to.equal(3);
    });

    it("with intervals not overlapping", () => {
      assert.deepEqual(tdb.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);

      // numIntervals = 1
      expect(tdb.countEvents(1, initialTimeMs + intervalMs * 3)).to.equal(3);
      expect(tdb.countEvents(intervalMs, initialTimeMs + intervalMs * 3)).to.equal(3);
      expect(tdb.countEvents(intervalMs * 2 - 1, initialTimeMs + intervalMs * 3)).to.equal(3);
      assert.deepEqual(tdb.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(3);
      expect(tdb.lastQueueIndex).to.equal(3);

      // numIntervals = 2
      expect(tdb.countEvents(intervalMs * 2, initialTimeMs + intervalMs * 3)).to.equal(3);
      assert.deepEqual(tdb.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(3);
      expect(tdb.lastQueueIndex).to.equal(3);

      // numIntervals = 3
      expect(tdb.countEvents(intervalMs * 3, initialTimeMs + intervalMs * 3)).to.equal(6);
      assert.deepEqual(tdb.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(3);
      expect(tdb.lastQueueIndex).to.equal(3);

      // numIntervals = 4
      expect(tdb.countEvents(intervalMs * 4, initialTimeMs + intervalMs * 3)).to.equal(9);
      assert.deepEqual(tdb.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(3);
      expect(tdb.lastQueueIndex).to.equal(3);
    });

    it("with intervals overlapping with 1 round", () => {
      assert.deepEqual(tdb.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);

      // numIntervals = 10, lastQueueIndex = 0
      expect(tdb.countEvents(intervalMs * maxIntervals, initialTimeMs + intervalMs * maxIntervals)).to.equal(6);
      assert.deepEqual(tdb.circularQueue, [0, 3, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(maxIntervals);
      expect(tdb.lastQueueIndex).to.equal(0);

      // numIntervals = 10, lastQueueIndex = 1
      expect(tdb.countEvents(intervalMs * maxIntervals, initialTimeMs + intervalMs * (maxIntervals + 1))).to.equal(3);
      assert.deepEqual(tdb.circularQueue, [0, 0, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(maxIntervals + 1);
      expect(tdb.lastQueueIndex).to.equal(1);

      // numIntervals = 10, lastQueueIndex = 2
      expect(tdb.countEvents(intervalMs * maxIntervals, initialTimeMs + intervalMs * (maxIntervals + 2))).to.equal(3);
      assert.deepEqual(tdb.circularQueue, [0, 0, 0, 3, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(maxIntervals + 2);
      expect(tdb.lastQueueIndex).to.equal(2);

      // numIntervals = 10, lastQueueIndex = 3
      expect(tdb.countEvents(intervalMs * maxIntervals, initialTimeMs + intervalMs * (maxIntervals + 3))).to.equal(0);
      assert.deepEqual(tdb.circularQueue, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(maxIntervals + 3);
      expect(tdb.lastQueueIndex).to.equal(3);
    });

    it("with intervals overlapping with 100 rounds", () => {
      assert.deepEqual(tdb.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);

      // numIntervals = 10, lastQueueIndex = 3
      expect(tdb.countEvents(intervalMs * maxIntervals, initialTimeMs + intervalMs * (maxIntervals * 100 + 4))).to.equal(0);
      assert.deepEqual(tdb.circularQueue, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(tdb.lastIntervalCount).to.equal(maxIntervals * 100 + 4);
      expect(tdb.lastQueueIndex).to.equal(4);
    });

    it("with various periods", () => {
      assert.deepEqual(tdb.circularQueue, [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]);

      expect(tdb.countEvents(-1, initialTimeMs + intervalMs * 3)).to.equal(-1);
      expect(tdb.countEvents(0, initialTimeMs + intervalMs * 3)).to.equal(-1);
      expect(tdb.countEvents(1, initialTimeMs + intervalMs * 3)).to.equal(3);
      expect(tdb.countEvents(intervalMs * maxIntervals, initialTimeMs + intervalMs * 3)).to.equal(9);
      expect(tdb.countEvents(intervalMs * maxIntervals + 1, initialTimeMs + intervalMs * 3)).to.equal(-1);
    });
  });
});
