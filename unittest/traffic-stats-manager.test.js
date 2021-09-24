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
  })

  describe("initialization", () => {
    it("constructor", () => {
      expect(tm.intervalMs).to.equal(intervalMs);
      expect(tm.maxIntervals).to.equal(maxIntervals);
      expect(tm.eventCounterMap.size).to.equal(0);
    });
  });

  describe("addEvent / countEvents", () => {
    it("with intervals not overlapping", () => {
      expect(tm.eventCounterMap.size).to.equal(0);

      tm.addEvent(eventType1, initialTimeMs);
      expect(tm.eventCounterMap.size).to.equal(1);
      expect(tm.eventCounterMap.has(eventType1)).to.equal(true);
      expect(tm.countEvents(eventType1, intervalMs * 10, initialTimeMs + intervalMs)).to.equal(1);
      expect(tm.countEvents(eventType2, intervalMs * 10, initialTimeMs + intervalMs)).to.equal(0);

      tm.addEvent(eventType2, initialTimeMs + intervalMs);
      expect(tm.eventCounterMap.size).to.equal(2);
      expect(tm.eventCounterMap.has(eventType1)).to.equal(true);
      expect(tm.eventCounterMap.has(eventType2)).to.equal(true);
      expect(tm.countEvents(eventType1, intervalMs * 10, initialTimeMs + intervalMs * 2)).to.equal(1);
      expect(tm.countEvents(eventType2, intervalMs * 10, initialTimeMs + intervalMs * 2)).to.equal(1);

      tm.addEvent(eventType1, initialTimeMs + intervalMs * 2);
      tm.addEvent(eventType2, initialTimeMs + intervalMs * 2);
      tm.addEvent(eventType1, initialTimeMs + intervalMs * 2);
      expect(tm.countEvents(eventType1, intervalMs * 10, initialTimeMs + intervalMs * 3)).to.equal(3);
      expect(tm.countEvents(eventType2, intervalMs * 10, initialTimeMs + intervalMs * 3)).to.equal(2);
    });

    it("with intervals overlapping", () => {
      expect(tm.eventCounterMap.size).to.equal(0);

      tm.addEvent(eventType1, initialTimeMs);
      tm.addEvent(eventType1, initialTimeMs);
      tm.addEvent(eventType1, initialTimeMs);
      tm.addEvent(eventType2, initialTimeMs);
      tm.addEvent(eventType2, initialTimeMs);
      // numIntervals = 10, lastQueueIndex = 0
      expect(tm.countEvents(eventType1, intervalMs * maxIntervals, initialTimeMs)).to.equal(3);
      expect(tm.countEvents(eventType2, intervalMs * maxIntervals, initialTimeMs)).to.equal(2);

      // overlapping of 100 rounds
      tm.addEvent(eventType1, initialTimeMs + intervalMs * (maxIntervals * 100 + 4));
      tm.addEvent(eventType1, initialTimeMs + intervalMs * (maxIntervals * 100 + 4));
      tm.addEvent(eventType2, initialTimeMs + intervalMs * (maxIntervals * 100 + 4));
      // numIntervals = 10, lastQueueIndex = 0
      expect(tm.countEvents(eventType1, intervalMs * maxIntervals, initialTimeMs)).to.equal(2);
      expect(tm.countEvents(eventType2, intervalMs * maxIntervals, initialTimeMs)).to.equal(1);
    });
  });

  describe("getEventRates", () => {
    beforeEach(() => {
      expect(tm.eventCounterMap.size).to.equal(0);
      tm.addEvent(eventType1, initialTimeMs);
      tm.addEvent(eventType1, initialTimeMs);
      tm.addEvent(eventType1, initialTimeMs);
      tm.addEvent(eventType1, initialTimeMs);
      tm.addEvent(eventType1, initialTimeMs);
      tm.addEvent(eventType2, initialTimeMs);
      tm.addEvent(eventType2, initialTimeMs);
      tm.addEvent(eventType2, initialTimeMs);
      tm.addEvent(eventType2, initialTimeMs);
      tm.addEvent(eventType2, initialTimeMs);

      tm.addEvent(eventType1, initialTimeMs + intervalMs);
      tm.addEvent(eventType1, initialTimeMs + intervalMs);
      tm.addEvent(eventType1, initialTimeMs + intervalMs);
      tm.addEvent(eventType1, initialTimeMs + intervalMs);
      tm.addEvent(eventType1, initialTimeMs + intervalMs);
      tm.addEvent(eventType2, initialTimeMs + intervalMs);
      tm.addEvent(eventType2, initialTimeMs + intervalMs);
      tm.addEvent(eventType2, initialTimeMs + intervalMs);
      tm.addEvent(eventType2, initialTimeMs + intervalMs);
      tm.addEvent(eventType2, initialTimeMs + intervalMs);

      tm.addEvent(eventType1, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType1, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType1, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType1, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType1, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType2, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType2, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType2, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType2, initialTimeMs + intervalMs * 3);
      tm.addEvent(eventType2, initialTimeMs + intervalMs * 3);
    })

    it("with invalid periods", () => {
      // with invalid interval period
      assert.deepEqual(tm.getEventRates(0, initialTimeMs + intervalMs * 4), {
        "event_type1": -1,
        "event_type2": -1,
      })
      // with 11 interval period
      assert.deepEqual(tm.getEventRates(intervalMs / 1000 * 11, initialTimeMs + intervalMs * 4), {
        "event_type1": -1,
        "event_type2": -1,
      })
    });

    it("with valid periods", () => {
      // with 1 interval period
      assert.deepEqual(tm.getEventRates(intervalMs / 1000, initialTimeMs + intervalMs * 4), {
        "event_type1": 5,
        "event_type2": 5,
      })
      // with 2 interval period
      assert.deepEqual(tm.getEventRates(intervalMs / 1000 * 2, initialTimeMs + intervalMs * 4), {
        "event_type1": 2.5,
        "event_type2": 2.5,
      })
      // with 3 interval period
      assert.deepEqual(tm.getEventRates(intervalMs / 1000 * 3, initialTimeMs + intervalMs * 4), {
        "event_type1": 3.3333333333333335,
        "event_type2": 3.3333333333333335,
      })
      // with 10 interval period
      assert.deepEqual(tm.getEventRates(intervalMs / 1000 * 10, initialTimeMs + intervalMs * 4), {
        "event_type1": 1.5,
        "event_type2": 1.5,
      })
    });
  });
});
