const EventHandler = require('../../event-handler');
const chai = require('chai');
const { expect, assert } = chai;
const { getIpAddress } = require('../../common/network-util');
const { NodeConfigs, BlockchainEventTypes, TransactionStates, BlockchainParams }
    = require('../../common/constants');
const CommonUtil = require('../../common/common-util');
const Transaction = require('../../tx-pool/transaction');
const _ = require('lodash');

const validTxHash = '0x9ac44b45853c2244715528f89072a337540c909c36bab4c9ed2fd7b7dbab47b2'
const dummyTx = new Transaction({}, 'signature', validTxHash, 'address', true, Date.now());
const epochMs = _.get(BlockchainParams, 'genesis.epoch_ms', 30000);

describe('EventHandler Test', () => {
  let eventHandler;

  before(() => {
    eventHandler = new EventHandler();
  });

  after(() => {
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
          timeout: NodeConfigs.TX_POOL_TIMEOUT_MS
        })).to.equal(undefined);
      });
      it('validate TX_STATE_CHANGED config with wrong config', () => {
        expect(() => EventHandler.validateEventFilterConfig(BlockchainEventTypes.TX_STATE_CHANGED, {
          tx_hash: validTxHash,
        })).to.throw('config.tx_hash or config.timeout is missing' +
            ' ({"tx_hash":"0x9ac44b45853c2244715528f89072a337540c909c36bab4c9ed2fd7b7dbab47b2"})');
        expect(() => EventHandler.validateEventFilterConfig(BlockchainEventTypes.TX_STATE_CHANGED, {
          tx_hash: validTxHash,
          timeout: -1
        })).to.throw(`Invalid timeout (${-1})` +
        `\nTimeout must be a number between ${epochMs} and ${NodeConfigs.TX_POOL_TIMEOUT_MS}`);
        expect(() => EventHandler.validateEventFilterConfig(BlockchainEventTypes.TX_STATE_CHANGED, {
          tx_hash: 123,
          timeout: epochMs
        })).to.throw('Invalid tx hash (123)');
      });
    });

    describe('createAndRegisterFilter', () => {
      beforeEach( async () => { // NOTE(cshcomcom): To avoid id collisions.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });

      it('create and register with right config', () => {
        const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
        const now = Date.now();
        eventHandler.createAndRegisterEventFilter(now, now,
            BlockchainEventTypes.BLOCK_FINALIZED, {
              block_number: 100,
            });
        const numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
        eventHandler.deregisterEventFilter(now, now);
      });

      it('create and register with wrong config', () => {
        const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
        try { // NOTE(cshcomcom): createAndRegisterEventFilter throws error in this case.
          eventHandler.createAndRegisterEventFilter(Date.now(), Date.now(),
              BlockchainEventTypes.BLOCK_FINALIZED, {
                block_number: -1,
              });
        } catch (err) {}
        const numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        expect(numberOfFiltersBefore).to.equal(numberOfFiltersAfter);
      });

      it('create, register and wait until deregistered', async () => {
        const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
        const now = Date.now()
        eventHandler.createAndRegisterEventFilter(now, now,
            BlockchainEventTypes.TX_STATE_CHANGED, {
              tx_hash: validTxHash,
              timeout: epochMs
            });
        let numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
        expect(eventHandler.txHashToEventFilterIds.get(validTxHash)).to.deep.equal(
            [eventHandler.getGlobalFilterId(now, now)]);
        await CommonUtil.sleep(epochMs);
        numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        // Filter is deleted due to filter timeout
        expect(numberOfFiltersBefore).to.equal(numberOfFiltersAfter);
        expect(eventHandler.txHashToEventFilterIds.get(validTxHash)).to.equal(undefined);
      });
    });

    describe('emitTxStateChanged', () => {
      beforeEach( async () => { // NOTE(cshcomcom): To avoid id collisions.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });

      it('emit tx_state_changed event which is not permenant state', async () => {
        const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
        const now = Date.now();
        const timeout = 2 * epochMs;
        eventHandler.createAndRegisterEventFilter(now, now,
        BlockchainEventTypes.TX_STATE_CHANGED, {
          tx_hash: validTxHash,
          timeout,
        });
        // NOTE(ehgmsdk20): To check whether the timer of deleteCallback is reset
        // when A is executed, the delay is divided.
        let numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
        eventHandler.emitTxStateChanged(dummyTx, null, TransactionStates.EXECUTED);
        numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
        expect(eventHandler.txHashToEventFilterIds.get(validTxHash)).to.deep.equal(
          [eventHandler.getGlobalFilterId(now, now)]);
        await CommonUtil.sleep(timeout);
        numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter); // Filter is not deleted
        expect(eventHandler.txHashToEventFilterIds.get(validTxHash)).to.deep.equal(
          [eventHandler.getGlobalFilterId(now, now)]);
        eventHandler.deregisterEventFilter(now, now);
        numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        expect(numberOfFiltersBefore).to.equal(numberOfFiltersAfter);
        expect(eventHandler.txHashToEventFilterIds.get(validTxHash)).to.equal(undefined);
      });

      it('emit tx_state_changed event which is permenant state', () => {
        const numberOfFiltersBefore = Object.keys(eventHandler.eventFilters).length;
        const now = Date.now();
        const timeout = 2 * epochMs;
        eventHandler.createAndRegisterEventFilter(now, now,
        BlockchainEventTypes.TX_STATE_CHANGED, {
          tx_hash: validTxHash,
          timeout,
        });
        let numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
        expect(eventHandler.txHashToEventFilterIds.get(validTxHash)).to.deep.equal(
          [eventHandler.getGlobalFilterId(now, now)]);
        eventHandler.emitTxStateChanged(dummyTx, null, TransactionStates.FINALIZED);
        numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
        // Filter is deleted due to end of state
        expect(numberOfFiltersBefore).to.equal(numberOfFiltersAfter);
        expect(eventHandler.txHashToEventFilterIds.get(validTxHash)).to.equal(undefined);
      });
    });

    describe('deregisterEventFilter', () => {
      beforeEach( async () => { // NOTE(cshcomcom): To avoid id collisions.
        await new Promise((resolve) => setTimeout(resolve, 1000));
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
          const now = Date.now();
          const eventFilterId = eventHandler.createAndRegisterEventFilter(now, now,
          BlockchainEventTypes.TX_STATE_CHANGED, {
            tx_hash: validTxHash,
            timeout: epochMs
          }).id;
          let numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
          expect(numberOfFiltersBefore + 1).to.equal(numberOfFiltersAfter);
          expect(eventHandler.eventFilterIdToTimeoutCallback.has(eventFilterId)).to.be.true;
          expect(eventHandler.txHashToEventFilterIds.get(validTxHash)).to.deep.equal(
            [eventHandler.getGlobalFilterId(now, now)]);
          eventHandler.deregisterEventFilter(now, now);
          numberOfFiltersAfter = Object.keys(eventHandler.eventFilters).length;
          expect(numberOfFiltersBefore).to.equal(numberOfFiltersAfter);
          expect(eventHandler.eventFilterIdToTimeoutCallback.has(eventFilterId)).to.be.false;
          expect(eventHandler.txHashToEventFilterIds.get(validTxHash)).to.equal(undefined);
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
