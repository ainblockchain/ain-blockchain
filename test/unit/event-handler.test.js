const EventHandler = require('../../event-handler');
const EventChannel = require('../../event-handler/event-channel');
const chai = require('chai');
const { expect, assert } = chai;
const { getIpAddress } = require('../../common/network-util');
const { NodeConfigs, BlockchainEventTypes, TransactionStates }
    = require('../../common/constants');
const CommonUtil = require('../../common/common-util');
const Transaction = require('../../tx-pool/transaction');
const BlockchainNode = require('../../node');

const validTxHash = '0x9ac44b45853c2244715528f89072a337540c909c36bab4c9ed2fd7b7dbab47b2'
const dummyTx = new Transaction({}, 'signature', validTxHash, 'address', true, Date.now());

class MockWebSockect {
  close() {
    return;
  }
  terminate() {
    return;
  }
  send() {
    return;
  }
}

describe('EventHandler Test', () => {
  let eventHandler = null;
  let node = null;
  const origianlfilterDeletionTimeout = NodeConfigs.EVENT_HANDLER_FILTER_DELETION_TIMEOUT_MS;

  before(async () => {
    NodeConfigs.ENABLE_EVENT_HANDLER = true;
    // NOTE(ehgmsdk20): Reduce EVENT_HANDLER_FILTER_DELETION_TIMEOUT_MS for faster test
    NodeConfigs.EVENT_HANDLER_FILTER_DELETION_TIMEOUT_MS = 10000;
    node = new BlockchainNode();
    eventHandler = node.eh;
  });

  after(() => {
    NodeConfigs.ENABLE_EVENT_HANDLER = false;
    NodeConfigs.EVENT_HANDLER_FILTER_DELETION_TIMEOUT_MS = origianlfilterDeletionTimeout
    // TODO(cshcomcom): stop & cleanup logic
  });

  describe('EventHandler', () => {
    describe('getClientFilterIdFromGlobalFilterId', () => {
      it('getClientFilterIdFromGlobalFilterId', () => {
        expect(eventHandler.getClientFilterIdFromGlobalFilterId('channelId:clientFilterId'))
        .to.equal('clientFilterId');
      });
    });

    describe('getGlobalFilterId', () => {
      it('getGlobalFilterId', () => {
        expect(eventHandler.getGlobalFilterId('channelId', 'clientFilterId')).
            to.
            equal('channelId:clientFilterId');
      });
    });

    describe('validateEventFilterConfig', () => {
      it('validate BLOCK_FINALIZED config with right config', () => {
        expect(EventHandler.validateEventFilterConfig(BlockchainEventTypes.BLOCK_FINALIZED, {
          block_number: 1000,
        })).to.equal(undefined);
      });
      it('validate BLOCK_FINALIZED config with wrong config', () => {
        expect(() => EventHandler.validateEventFilterConfig(BlockchainEventTypes.BLOCK_FINALIZED, {
          block_number: -1,
        })).to.throw('Invalid block_number. It must not be a negative number (-1)');
        expect(() => EventHandler.validateEventFilterConfig(BlockchainEventTypes.BLOCK_FINALIZED, {
          block_number: 'dummy',
        })).to.throw('Invalid block_number type. (string)');
      });
      it('validate VALUE_CHANGED config with right config', () => {
        expect(EventHandler.validateEventFilterConfig(BlockchainEventTypes.VALUE_CHANGED, {
          path: '/apps/test',
        })).to.equal(undefined);
      });
      it('validate VALUE_CHANGED config with wrong config', () => {
        const wrongPathList = ['/apps/test/****', '/apps/$$new_app'];
        for (const wrongPath of wrongPathList) {
          expect(() => EventHandler.validateEventFilterConfig(BlockchainEventTypes.VALUE_CHANGED, {
            path: wrongPath,
          })).to.throw(`Invalid format path (${wrongPath})`);
        }
      });
      it('validate TX_STATE_CHANGED config with right config', () => {
        expect(EventHandler.validateEventFilterConfig(BlockchainEventTypes.TX_STATE_CHANGED, {
          tx_hash: validTxHash,
        })).to.equal(undefined);
      });
      it('validate TX_STATE_CHANGED config with wrong config', () => {
        expect(() => EventHandler.validateEventFilterConfig(BlockchainEventTypes.TX_STATE_CHANGED,
            {})).to.throw('config.tx_hash is missing ({})');
        expect(() => EventHandler.validateEventFilterConfig(BlockchainEventTypes.TX_STATE_CHANGED, {
          tx_hash: 123,
        })).to.throw('Invalid tx hash (123)');
      });
    });

    describe('createAndRegisterFilter', () => {
      let channel;

      beforeEach( async () => { // NOTE(cshcomcom): To avoid id collisions.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        channel = new EventChannel(Date.now(), new MockWebSockect());
        eventHandler.eventChannelManager.channels[channel.id] = channel;
      });

      afterEach(() => {
        eventHandler.eventChannelManager.closeChannel(channel);
      });

      it('create and register with right config', () => {
        const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
        const clientFilterId = Date.now();
        eventHandler.eventChannelManager.registerFilter(channel, clientFilterId,
            BlockchainEventTypes.BLOCK_FINALIZED, {
              block_number: 100,
            });
        const numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
        const numberOfFiltersPerChannel = eventHandler.eventChannelManager.channels[channel.id].getFilterIdsSize();
        expect(numberOfFiltersPerChannel).to.equal(1);
        eventHandler.eventChannelManager.deregisterFilter(channel, clientFilterId);
      });

      it('create and register with wrong config', () => {
        const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
        const clientFilterId = Date.now();
        try { // NOTE(cshcomcom): createAndRegisterEventFilter throws error in this case.
          eventHandler.eventChannelManager.registerFilter(channel, clientFilterId,
              BlockchainEventTypes.BLOCK_FINALIZED, {
                block_number: -1,
              });
        } catch (err) {}
        const numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        expect(numberOfFiltersBefore).to.equal(numberOfFiltersAfter);
        const numberOfFiltersPerChannel = eventHandler.eventChannelManager.channels[channel.id].getFilterIdsSize();
        expect(numberOfFiltersPerChannel).to.equal(0);
      });

      it('create, register and wait until deregistered', async () => {
        const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
        const clientFilterId = Date.now();
        eventHandler.eventChannelManager.registerFilter(channel, clientFilterId,
            BlockchainEventTypes.TX_STATE_CHANGED, {
              tx_hash: validTxHash,
            });
        let numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        let numberOfFiltersPerChannel = eventHandler.eventChannelManager.channels[channel.id].getFilterIdsSize();
        expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
        expect(numberOfFiltersPerChannel).to.equal(1);
        expect(eventHandler.txHashToEventFilterIdSet.get(validTxHash)).to.deep.equal(
            new Set([eventHandler.getGlobalFilterId(channel.id, clientFilterId)]));
        await CommonUtil.sleep(NodeConfigs.EVENT_HANDLER_FILTER_DELETION_TIMEOUT_MS);
        numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        numberOfFiltersPerChannel = eventHandler.eventChannelManager.channels[channel.id].getFilterIdsSize();
        // Filter is deleted due to filter timeout
        expect(numberOfFiltersBefore).to.equal(numberOfFiltersAfter);
        expect(numberOfFiltersPerChannel).to.equal(0);
        expect(eventHandler.txHashToEventFilterIdSet.get(validTxHash)).to.equal(undefined);
      });
    });

    describe('emitTxStateChanged', () => {
      let channel;

      beforeEach( async () => { // NOTE(cshcomcom): To avoid id collisions.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        channel = new EventChannel(Date.now(), new MockWebSockect());
        eventHandler.eventChannelManager.channels[channel.id] = channel;
      });

      afterEach(() => {
        eventHandler.eventChannelManager.closeChannel(channel);
      });

      it('emit tx_state_changed event which is not an end state', async () => {
        const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
        const clientFilterId = Date.now();
        eventHandler.eventChannelManager.registerFilter(channel, clientFilterId,
            BlockchainEventTypes.TX_STATE_CHANGED, {
              tx_hash: validTxHash,
            });
        let numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        let numberOfFiltersPerChannel = eventHandler.eventChannelManager.channels[channel.id]
            .getFilterIdsSize();
        expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
        expect(numberOfFiltersPerChannel).to.equal(1);

        eventHandler.emitTxStateChanged(dummyTx, null, TransactionStates.EXECUTED);
        numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        numberOfFiltersPerChannel = eventHandler.eventChannelManager.channels[channel.id]
            .getFilterIdsSize();
        expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
        expect(numberOfFiltersPerChannel).to.equal(1);
        expect(eventHandler.txHashToEventFilterIdSet.get(validTxHash)).to.deep.equal(
            new Set([eventHandler.getGlobalFilterId(channel.id, clientFilterId)]));

        // Check whether FilterDeletionTimeout is deleted
        await CommonUtil.sleep(NodeConfigs.EVENT_HANDLER_FILTER_DELETION_TIMEOUT_MS);
        numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
        expect(numberOfFiltersPerChannel).to.equal(1);
        expect(eventHandler.txHashToEventFilterIdSet.get(validTxHash)).to.deep.equal(
            new Set([eventHandler.getGlobalFilterId(channel.id, clientFilterId)]));

        eventHandler.eventChannelManager.deregisterFilter(channel, clientFilterId);
        numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        numberOfFiltersPerChannel = eventHandler.eventChannelManager.channels[channel.id]
            .getFilterIdsSize();
        expect(numberOfFiltersBefore).to.equal(numberOfFiltersAfter);
        expect(numberOfFiltersPerChannel).to.equal(0);
        expect(eventHandler.txHashToEventFilterIdSet.get(validTxHash)).to.equal(undefined);
      });

      it('emit tx_state_changed event which is an end state', () => {
        const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
        const clientFilterId = Date.now();
        eventHandler.eventChannelManager.registerFilter(channel, clientFilterId,
            BlockchainEventTypes.TX_STATE_CHANGED, {
              tx_hash: validTxHash,
            });
        let numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        let numberOfFiltersPerChannel = eventHandler.eventChannelManager.channels[channel.id]
            .getFilterIdsSize();
        expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
        expect(numberOfFiltersPerChannel).to.equal(1);
        expect(eventHandler.txHashToEventFilterIdSet.get(validTxHash)).to.deep.equal(
            new Set([eventHandler.getGlobalFilterId(channel.id, clientFilterId)]));

        eventHandler.emitTxStateChanged(dummyTx, null, TransactionStates.FINALIZED);
        numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        numberOfFiltersPerChannel = eventHandler.eventChannelManager.channels[channel.id]
            .getFilterIdsSize();
        // Filter is deleted due to end of state
        expect(numberOfFiltersBefore).to.equal(numberOfFiltersAfter);
        expect(numberOfFiltersPerChannel).to.equal(0);
        expect(eventHandler.txHashToEventFilterIdSet.get(validTxHash)).to.equal(undefined);
      });
    });

    describe('deregisterEventFilter', () => {
      let channel;

      beforeEach( async () => { // NOTE(cshcomcom): To avoid id collisions.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        channel = new EventChannel(Date.now(), new MockWebSockect());
        eventHandler.eventChannelManager.channels[channel.id] = channel;
      });

      afterEach(() => {
        eventHandler.eventChannelManager.closeChannel(channel);
      });

      describe('deregister filter registered', () => {
        beforeEach( async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        });

        it('BLOCK_FINALIZED event', () => {
          const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
          const now = Date.now();
          eventHandler.createAndRegisterEventFilter(now, now,
              BlockchainEventTypes.BLOCK_FINALIZED, {
                block_number: 100,
              });
          let numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
          expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
          eventHandler.deregisterEventFilter(now, now);
          numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
          expect(numberOfFiltersBefore).to.equal(numberOfFiltersAfter);
        });

        it('VALUE_CHANGED event', () => {
          const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
          const now = Date.now();
          const eventFilterId = eventHandler.createAndRegisterEventFilter(now, now,
              BlockchainEventTypes.VALUE_CHANGED, {
                path: '/apps/test',
              }).id;
          let numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
          expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
          expect(eventHandler.stateEventTreeManager.filterIdToParsedPath[eventFilterId]).to.exist;
          eventHandler.deregisterEventFilter(now, now);
          numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
          expect(numberOfFiltersBefore).to.equal(numberOfFiltersAfter);
          expect(eventHandler.stateEventTreeManager.filterIdToParsedPath[eventFilterId])
              .to.be.undefined;
        });

        it('TX_STATE_CHANGED event', () => {
          const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
          const clientFilterId = Date.now();
          const eventFilterId = eventHandler.getGlobalFilterId(channel.id, clientFilterId);
          eventHandler.eventChannelManager.registerFilter(channel, clientFilterId,
              BlockchainEventTypes.TX_STATE_CHANGED, {
                tx_hash: validTxHash,
              });
          let numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
          let numberOfFiltersPerChannel = eventHandler.eventChannelManager.channels[channel.id]
              .getFilterIdsSize();
          expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
          expect(numberOfFiltersPerChannel).to.equal(1);
          expect(eventHandler.eventFilterIdToTimeoutCallback.has(eventFilterId)).to.be.true;
          expect(eventHandler.txHashToEventFilterIdSet.get(validTxHash)).to.deep.equal(
              new Set([eventHandler.getGlobalFilterId(channel.id, clientFilterId)]));

          eventHandler.eventChannelManager.deregisterFilter(channel, clientFilterId);
          numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
          numberOfFiltersPerChannel = eventHandler.eventChannelManager.channels[channel.id]
              .getFilterIdsSize();
          expect(numberOfFiltersBefore).to.equal(numberOfFiltersAfter);
          expect(numberOfFiltersPerChannel).to.equal(0);
          expect(eventHandler.eventFilterIdToTimeoutCallback.has(eventFilterId)).to.be.false;
          expect(eventHandler.txHashToEventFilterIdSet.get(validTxHash)).to.equal(undefined);
        });
      });

      it('deregister filter which does not exist', () => {
        const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
        const now = Date.now();
        eventHandler.deregisterEventFilter(now, now);
        const numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        expect(numberOfFiltersBefore).to.equal(numberOfFiltersAfter);
      });

      it('deregister filter already deregistered', () => {
        const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
        const now = Date.now();
        eventHandler.createAndRegisterEventFilter(now, now,
            BlockchainEventTypes.BLOCK_FINALIZED, {
              block_number: 100,
            });
        let numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
        eventHandler.deregisterEventFilter(now, now);
        numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        expect(numberOfFiltersBefore).to.equal(numberOfFiltersAfter);
        eventHandler.deregisterEventFilter(now, now);
        numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        expect(numberOfFiltersBefore).to.equal(numberOfFiltersAfter);
      });
    });
  });

  describe('EventChannelManager', () => {
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
        maxNumEventChannels: NodeConfigs.MAX_NUM_EVENT_CHANNELS,
        numEventChannels: 0,
        maxNumEventFilters: NodeConfigs.MAX_NUM_EVENT_FILTERS,
        numEventFilters: 0,
        url: intUrl.toString(),
        port: NodeConfigs.EVENT_HANDLER_PORT,
      });
    });
  });
})
