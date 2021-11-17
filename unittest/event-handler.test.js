const EventHandler = require('../event-handler');
const chai = require('chai');
const { expect, assert } = chai;
const { getIpAddress } = require('../common/network-util');
const { EVENT_HANDLER_PORT, EventTypes } = require('../common/constants');

// TODO(sanghee): Add integration test
describe('EventHandler Test', () => {
  let eventHandler;

  before(() => {
    eventHandler = new EventHandler();
    eventHandler.run();
  });

  after(() => {
    // TODO(sanghee): stop & cleanup logic
  });

  describe('EventHandler', () => {
    it('isRunning', () => {
      expect(eventHandler.isRunning()).to.be.true;
    });

    it('createAndRegisterFilter', () => {
      const numberOfFiltersBefore = Object.keys(eventHandler.filters).length;
      eventHandler.createAndRegisterFilter(EventTypes.BLOCK_FINALIZED, {
        block_number: 100,
      });
      const numberOfFiltersAfter = Object.keys(eventHandler.filters).length;
      expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
    });
  });

  describe('EventHandlerServer', () => {
    const eventHandlerServer = eventHandler.server;
    before(() => {
      eventHandlerServer.startListen();
    })

    describe('getNetworkInfo', async () => {
      const intIp = await getIpAddress(true);
      const intUrl = new URL(`ws://${intIp}:${EVENT_HANDLER_PORT}`);
      const networkInfo = await eventHandlerServer.getNetworkInfo();
      assert.deepEqual(networkInfo, {
        url: intUrl.toString(),
        port: EVENT_HANDLER_PORT,
      });
    });
  });
})
