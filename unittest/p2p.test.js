const rimraf = require("rimraf")
const chai = require('chai');
const BlockchainNode = require('../node');
const VersionUtil = require('../common/version-util');
const P2pClient = require('../p2p');
const {
  BlockchainConsts,
  NodeConfigs,
  P2pNetworkStates,
  BlockchainParams
} = require('../common/constants');
const { setNodeForTesting } = require('./test-util');
const { getIpAddress } = require('../common/network-util');

const expect = chai.expect;
const assert = chai.assert;

const { min, max } = VersionUtil.matchVersions(BlockchainConsts.PROTOCOL_VERSION_MAP, BlockchainConsts.CURRENT_PROTOCOL_VERSION);
const minProtocolVersion = min === undefined ? BlockchainConsts.CURRENT_PROTOCOL_VERSION : min;
const maxProtocolVersion = max;

describe("P2P", () => {
  let node;
  let p2pClient;
  let p2pServer;

  before(async () => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node, 0, true, true);
    p2pClient = new P2pClient(node, minProtocolVersion, maxProtocolVersion);
    p2pServer = p2pClient.server;
    await p2pServer.listen();
  });

  after(() => {
    p2pClient.stop();

    rimraf.sync(NodeConfigs.CHAINS_DIR);
  });

  describe("Server Status", () => {
    describe("getIpAddress", () => {
      it("gets ip address", async () => {
        const actual = await getIpAddress();
        const ipAddressRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        // FIXME(minsulee2): We cannot use CommonUtil.isValidUrl for internal ip.
        expect(ipAddressRegex.test(actual)).to.be.true;
      });
    });

    describe("setUpIpAddresses", () => {
      it("sets ip address", () => {
        const ipAddressRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        // FIXME(minsulee2): We cannot use CommonUtil.isValidUrl for internal ip.
        expect(ipAddressRegex.test(p2pServer.node.ipAddrInternal)).to.be.true;
        expect(ipAddressRegex.test(p2pServer.node.ipAddrExternal)).to.be.true;
      });
    });

    describe("getInternalIp", () => {
      it("gets internal IP address", () => {
        expect(p2pServer.getInternalIp()).to.equal(p2pServer.node.ipAddrInternal);
      });
    });

    describe("getExternalIp", () => {
      it("gets external IP address", () => {
        expect(p2pServer.getExternalIp()).to.equal(p2pServer.node.ipAddrExternal);
      });
    });

    describe("buildUrls", () => {
      it("builds both internal and external ip addresses", () => {
        const intIp = p2pServer.getInternalIp();
        const actualP2pUrl = new URL(`ws://${intIp}:${NodeConfigs.P2P_PORT}`);
        const stringP2pUrl = actualP2pUrl.toString();
        actualP2pUrl.protocol = 'http:';
        actualP2pUrl.port = NodeConfigs.PORT;
        const actualClientApiUrl = actualP2pUrl.toString();
        actualP2pUrl.pathname = 'json-rpc';
        const actualJsonRpcUrl = actualP2pUrl.toString();
        const actual = {
          p2pUrl: stringP2pUrl,
          clientApiUrl: actualClientApiUrl,
          jsonRpcUrl: actualJsonRpcUrl
        }
        const {
          p2pUrl,
          clientApiUrl,
          jsonRpcUrl
        } = p2pServer.buildUrls(intIp);
        expect(p2pUrl).to.equal(actual.p2pUrl);
        expect(clientApiUrl).to.equal(actual.clientApiUrl);
        expect(jsonRpcUrl).to.equal(actual.jsonRpcUrl);
      });
    });

    describe("initUrls", () => {
      it("initializes (test)internal urls", () => {
        const intIp = p2pServer.getInternalIp();
        const extIp = p2pServer.getExternalIp();
        const urls = p2pServer.buildUrls(intIp);
        const expected = {
          ip: extIp,
          p2p: {
            url: urls.p2pUrl,
            port: NodeConfigs.P2P_PORT,
          },
          clientApi: {
            url: urls.clientApiUrl,
            port: NodeConfigs.PORT,
          },
          jsonRpc: {
            url: urls.jsonRpcUrl,
            port: NodeConfigs.PORT,
          }
        }
        assert.deepEqual(expected, p2pServer.initUrls());
      });
    });

    describe("getNetworkStatus", () => {
      it("shows initial values of connection status", () => {
        const expected = {
          urls: p2pServer.initUrls(),
          connectionStatus: p2pClient.getConnectionStatus()
        };
        assert.deepEqual(p2pServer.getNetworkStatus(), expected);
      });
    });

    describe("getNodeAddress", () => {
      it("gets node address", () => {
        expect(p2pServer.getNodeAddress()).to.equal(p2pServer.node.account.address);
      });
    });

    describe("getNodePrivateKey", () => {
      it("gets node private key address", () => {
        expect(p2pServer.getNodePrivateKey()).to.equal(p2pServer.node.account.private_key);
      });
    });

    describe("getProtocolInfo", () => {
      it("gets external IP address", () => {
        assert.deepEqual(p2pServer.getProtocolInfo(), {
          COMPATIBLE_MAX_PROTOCOL_VERSION: maxProtocolVersion,
          COMPATIBLE_MIN_PROTOCOL_VERSION: minProtocolVersion,
          CONSENSUS_PROTOCOL_VERSION: BlockchainConsts.CONSENSUS_PROTOCOL_VERSION,
          CURRENT_PROTOCOL_VERSION: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          DATA_PROTOCOL_VERSION: BlockchainConsts.DATA_PROTOCOL_VERSION
        });
      });
    });

    describe("getStateVersionStatus", () => {
      it("gets initial state version status", () => {
        const stateVersionStatus = p2pServer.getStateVersionStatus();
        expect(stateVersionStatus.numVersions).to.equal(5);
        expect(stateVersionStatus.finalVersion).to.equal('FINAL:0');
      });
    });

    describe("getConsensusStatus", () => {
      it("gets initial consensus state", () => {
        assert.deepEqual(p2pServer.getConsensusStatus(), {
          health: true,
          state: 'STARTING',
          stateNumeric: 0,
          epoch: 1,
          longestNotarizedChainTipsSize: 0,
          globalTimeSyncStatus: {},
          validators: {}
        });
      });
    });

    describe("getBlockStatus", () => {
      it("gets initial block status", () => {
        const actual = p2pServer.getBlockStatus();
        delete actual.elapsedTimeMs;
        assert.deepEqual(actual, {
          number: 0, epoch: 0, timestamp: BlockchainParams.genesis.genesis_timestamp
        });
      });
    });

    describe("getNodeStatus", () => {
      it("gets initial node status", () => {
        const actual = p2pServer.getNodeStatus();
        actual.dbStatus.stateInfo['#tree_size'] = 'erased';
        actual.dbStatus.stateInfo['#tree_bytes'] = 'erased';
        actual.dbStatus.stateInfo['#state_ph'] = 'erased';
        actual.dbStatus.stateProof['#state_ph'] = 'erased';
        actual.stateVersionStatus.versionList = 'erased';
        assert.deepEqual(actual, {
          health: false,
          address: p2pServer.getNodeAddress(),
          state: 'SYNCING',
          stateNumeric: 1,
          nonce: 0,
          dbStatus: {
            stateInfo: {
              "#state_ph": 'erased',
              "#tree_bytes": 'erased',
              "#tree_height": 11,
              "#tree_size": 'erased',
              "#version": "NODE:0",
            },
            stateProof: {
              "#state_ph": 'erased'
            }
          },
          stateVersionStatus: {
            numVersions: 5,
            versionList: 'erased',
            finalVersion: 'FINAL:0'
          }
        });
      });
    });

    describe("getDiskUsage", () => {
      it("gets initial disk usage (it depends on the machine)", () => {
        assert.deepEqual(Object.keys(p2pServer.getDiskUsage()), Object.keys({
          available: 113007648768,
          free: 235339354112,
          total: 250685575168,
          usage: 15346221056,
          usagePercent: 10.1
        }));
      });
    });

    describe("getCpuUsage", () => {
      it("gets initial cpu usage (it depends on the machine)", () => {
        assert.deepEqual(Object.keys(p2pServer.getCpuUsage()), Object.keys({
          free: 3174023060,
          usage: 313233920,
          usagePercent: 7.5,
          total: 3487256980
        }));
      });
    });

    describe("getMemoryUsage", () => {
      it("gets initial memory usage (it depends on the machine)", () => {
        const expected = {
          os: {
            free: 211546112,
            usage: 16968323072,
            usagePercent: 30.3,
            total: 17179869184
          },
          heap: {
            rss: 80953344,
            heapTotal: 56041472,
            heapUsed: 27042840,
            external: 2038194
          },
          heapStats: {
            total_heap_size: 56041472,
            total_heap_size_executable: 835584,
            total_physical_size: 37052632,
            total_available_size: 2170221688,
            used_heap_size: 27042960,
            heap_size_limit: 2197815296,
            malloced_memory: 155800,
            peak_malloced_memory: 6718576,
            does_zap_garbage: 0,
            number_of_native_contexts: 2,
            number_of_detached_contexts: 0
          }
        };
        const actual = p2pServer.getMemoryUsage();
        assert.deepEqual(Object.keys(actual), Object.keys(expected));
        assert.deepEqual(Object.keys(actual.os), Object.keys(expected.os));
        // NOTE(minsulee2): Since the actual.heap part have in difference between the node version
        // (> 12.16) and (<= 12.17), which newly includes arrayBuffers info as well.
        // See also: the issue #419(https://github.com/ainblockchain/ain-blockchain/issues/419)
        expect(Object.keys(actual.heap)).include.members(Object.keys(expected.heap));
        assert.deepEqual(Object.keys(actual.heapStats), Object.keys(expected.heapStats));
      });
    });

    describe("getRuntimeInfo (it depends on the machine)", () => {
      it("gets runtime information", () => {
        const expected = {
          process: {
            version: 'v12.16.0',
            platform: 'darwin',
            pid: 17424,
            uptime: 0,
            v8Version: '7.8.279.23-node.31'
          },
          os: {
            hostname: 'XXXXX-MacBookPro.local',
            type: 'Darwin',
            release: '20.4.0',
            uptime: 892864
          },
        };
        const actual = p2pServer.getRuntimeInfo();
        assert.deepEqual(Object.keys(actual), Object.keys(expected));
        assert.deepEqual(Object.keys(actual.process), Object.keys(expected.process));
        assert.deepEqual(Object.keys(actual.os), Object.keys(expected.os));
      });
    });

    describe("getTxStatus", () => {
      it("gets initial tx status", () => {
        assert.deepEqual(Object.keys(p2pServer.getTxStatus()), Object.keys({
          txPoolSize: 0,
          txTrackerSize: 0
        }));
      });
    });

    describe("getShardingStatus", () => {
      it("gets initial sharding status", () => {
        assert.deepEqual(Object.keys(p2pServer.getShardingStatus()), Object.keys({}));
      });
    });
  });

  describe("Client Status", () => {
    describe("getConnectionStatus", () => {
      it("shows initial values of connection status", () => {
        assert.deepEqual(p2pClient.getConnectionStatus(), {
          p2pState: P2pNetworkStates.STARTING,
          maxInbound: NodeConfigs.MAX_NUM_INBOUND_CONNECTION,
          targetOutBound: NodeConfigs.TARGET_NUM_OUTBOUND_CONNECTION,
          numInbound: 0,
          numOutbound: 0,
          incomingPeers: [],
          outgoingPeers: [],
        });
      });
    });

    describe("getTrafficStats", () => {
      it("gets traffic stats", () => {
        const expected = { '1m': {}, '5m': {}, '1h': {} };
        assert.deepEqual(p2pClient.getTrafficStats(), expected);
      });
    });

    describe("getClientStatus", () => {
      it("gets client status", () => {
        const expected = { trafficStats: p2pClient.getTrafficStats() };
        assert.deepEqual(p2pClient.getClientStatus(), expected);
      });
    });
  });
});
