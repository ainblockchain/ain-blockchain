const EventHandler = require('../../event-handler');
const chai = require('chai');
const { expect, assert } = chai;
const { getIpAddress } = require('../../common/network-util');
const { NodeConfigs, BlockchainEventTypes } = require('../../common/constants');

// TODO(cshcomcom): Add integration test
describe('EventHandler Test', () => {
  let eventHandler;

  before(() => {
    eventHandler = new EventHandler();
  });

  after(() => {
    // TODO(cshcomcom): stop & cleanup logic
  });

  describe('EventHandler', () => {
    it('createAndRegisterFilter', () => {
      const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
      eventHandler.createAndRegisterEventFilter(Date.now(), Date.now(), BlockchainEventTypes.BLOCK_FINALIZED, {
        block_number: 100,
      });
      const numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
      expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
    });
  });

  describe('EvenChannelManager', () => {
    let eventChannelManager;

    before(() => {
      eventChannelManager = eventHandler.eventChannelManager;
    })

    after(() => {
      eventChannelManager.close();
    })

    it('getNetworkInfo', async () => {
      const intIp = await getIpAddress(true);
      const intUrl = new URL(`ws://${intIp}:${NodeConfigs.EVENT_HANDLER_PORT}`);
      const networkInfo = await eventChannelManager.getNetworkInfo();
      assert.deepEqual(networkInfo, {
        url: intUrl.toString(),
        port: NodeConfigs.EVENT_HANDLER_PORT,
      });
    });
  });
})
