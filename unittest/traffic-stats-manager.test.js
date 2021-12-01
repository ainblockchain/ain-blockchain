const TrafficStatsManager = require('../traffic/traffic-stats-manager');

const { expect, assert } = require('chai');

describe("traffic-stats-manager", () => {
  const intervalMs = 1000;
  const maxIntervals = 10;
  const initialTimeMs = 5000;
  const eventType1 = 'event_type1';
  const eventType2 = 'event_type2';
  let tm;

  beforeEach(() => {
    tm = new TrafficStatsManager(intervalMs, maxIntervals);
  });

  describe("initialization", () => {
    it("constructor", () => {
      expect(tm.intervalMs).to.equal(intervalMs);
      expect(tm.maxIntervals).to.equal(maxIntervals);
      expect(tm.trafficDbMap.size).to.equal(0);
    });
  });

  describe("addEvent / getEventSums", () => {
    it("with intervals not overlapping", () => {
      expect(tm.trafficDbMap.size).to.equal(0);

      tm.addEvent(eventType1, 10, initialTimeMs);
      expect(tm.trafficDbMap.size).to.equal(1);
      expect(tm.trafficDbMap.has(eventType1)).to.equal(true);
      assert.deepEqual(tm.getEventSums(eventType1, intervalMs * 10, initialTimeMs + intervalMs), {
        countSum: 1,
        latencySum: 10,
      });
      assert.deepEqual(tm.getEventSums(eventType2, intervalMs * 10, initialTimeMs + intervalMs), null);

      tm.addEvent(eventType2, 100, initialTimeMs + intervalMs);
      expect(tm.trafficDbMap.size).to.equal(2);
      expect(tm.trafficDbMap.has(eventType1)).to.equal(true);
      expect(tm.trafficDbMap.has(eventType2)).to.equal(true);
      assert.deepEqual(tm.getEventSums(eventType1, intervalMs * 10, initialTimeMs + intervalMs * 2), {
        countSum: 1,
        latencySum: 10,
      });
      assert.deepEqual(tm.getEventSums(eventType2, intervalMs * 10, initialTimeMs + intervalMs * 2), {
        countSum: 1,
        latencySum: 100,
      });

      tm.addEvent(eventType1, 10, initialTimeMs + intervalMs * 2);
      tm.addEvent(eventType2, 100, initialTimeMs + intervalMs * 2);
      tm.addEvent(eventType1, 10, initialTimeMs + intervalMs * 2);
      assert.deepEqual(tm.getEventSums(eventType1, intervalMs * 10, initialTimeMs + intervalMs * 3), {
        countSum: 3,
        latencySum: 30,
      });
      assert.deepEqual(tm.getEventSums(eventType2, intervalMs * 10, initialTimeMs + intervalMs * 3), {
        countSum: 2,
        latencySum: 200,
      });
    });

    it("with intervals overlapping", () => {
      expect(tm.trafficDbMap.size).to.equal(0);

      tm.addEvent(eventType1, 10, initialTimeMs);
      tm.addEvent(eventType1, 10, initialTimeMs);
      tm.addEvent(eventType1, 10, initialTimeMs);
      tm.addEvent(eventType2, 100, initialTimeMs);
      tm.addEvent(eventType2, 100, initialTimeMs);
      // numIntervals = 10, lastQueueIndex = 0
      assert.deepEqual(tm.getEventSums(eventType1, intervalMs * maxIntervals, initialTimeMs), {
        countSum: 3,
        latencySum: 30,
      });
      assert.deepEqual(tm.getEventSums(eventType2, intervalMs * maxIntervals, initialTimeMs), {
        countSum: 2,
        latencySum: 200,
      });

      // overlapping of 100 rounds
      tm.addEvent(eventType1, 10, initialTimeMs + intervalMs * (maxIntervals * 100 + 4));
      tm.addEvent(eventType1, 10, initialTimeMs + intervalMs * (maxIntervals * 100 + 4));
      tm.addEvent(eventType2, 100, initialTimeMs + intervalMs * (maxIntervals * 100 + 4));
      // numIntervals = 10, lastQueueIndex = 0
      assert.deepEqual(tm.getEventSums(eventType1, intervalMs * maxIntervals, initialTimeMs), {
        countSum: 2,
        latencySum: 20,
      });
      assert.deepEqual(tm.getEventSums(eventType2, intervalMs * maxIntervals, initialTimeMs), {
        countSum: 1,
        latencySum: 100,
      });
    });
  });

  describe("getEventStats", () => {
    beforeEach(() => {
      expect(tm.trafficDbMap.size).to.equal(0);
      tm.addEvent(eventType1, 10, initialTimeMs);
      tm.addEvent(eventType1, 10, initialTimeMs);
      tm.addEvent(eventType1, 10, initialTimeMs);
      tm.addEvent(eventType1, 10, initialTimeMs);
      tm.addEvent(eventType1, 10, initialTimeMs);
      tm.addEvent(eventType2, 100, initialTimeMs);
      tm.addEvent(eventType2, 100, initialTimeMs);
      tm.addEvent(eventType2, 100, initialTimeMs);
      tm.addEvent(eventType2, 100, initialTimeMs);
      tm.addEvent(eventType2, 100, initialTimeMs);

      tm.addEvent(eventType1, 10, initialTimeMs + intervalMs);
      tm.addEvent(eventType1, 10, initialTimeMs + intervalMs);
      tm.addEvent(eventType1, 10, initialTimeMs + intervalMs);
      tm.addEvent(eventType1, 10, initialTimeMs + intervalMs);
      tm.addEvent(eventType1, 10, initialTimeMs + intervalMs);
      tm.addEvent(eventType2, 100, initialTimeMs + intervalMs);
      tm.addEvent(eventType2, 100, initialTimeMs + intervalMs);
      tm.addEvent(eventType2, 100, initialTimeMs + intervalMs);
      tm.addEvent(eventType2, 100, initialTimeMs + intervalMs);
      tm.addEvent(eventType2, 100, initialTimeMs + intervalMs);

      tm.addEvent(eventType1, 10, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType1, 10, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType1, 10, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType1, 10, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType1, 10, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType2, 100, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType2, 100, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType2, 100, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType2, 100, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType2, 100, initialTimeMs + intervalMs * 3);
    })

    it("with invalid periods", () => {
      // with invalid interval period
      assert.deepEqual(tm.getEventStats(0, initialTimeMs + intervalMs * 4), {})
      // with 11 interval period
      assert.deepEqual(tm.getEventStats(intervalMs / 1000 * 11, initialTimeMs + intervalMs * 4), {})
    });

    it("with valid periods", () => {
      // with 1 interval period
      assert.deepEqual(tm.getEventStats(intervalMs / 1000, initialTimeMs + intervalMs * 4), {
        "event_type1": {
          "rate": 5,
          "latency": 10,
        },
        "event_type2": {
          "rate": 5,
          "latency": 100,
        },
      })
      // with 2 interval period
      assert.deepEqual(tm.getEventStats(intervalMs / 1000 * 2, initialTimeMs + intervalMs * 4), {
        "event_type1": {
          "rate": 2.5,
          "latency": 10,
        },
        "event_type2": {
          "rate": 2.5,
          "latency": 100,
        },
      })
      // with 3 interval period
      assert.deepEqual(tm.getEventStats(intervalMs / 1000 * 3, initialTimeMs + intervalMs * 4), {
        "event_type1": {
          "rate": 3.3333333333333335,
          "latency": 10,
        },
        "event_type2": {
          "rate": 3.3333333333333335,
          "latency": 100,
        },
      })
      // with 10 interval period
      assert.deepEqual(tm.getEventStats(intervalMs / 1000 * 10, initialTimeMs + intervalMs * 4), {
        "event_type1": {
          "rate": 1.5,
          "latency": 10,
        },
        "event_type2": {
          "rate": 1.5,
          "latency": 100,
        },
      })
    });
  });
});
