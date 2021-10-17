const rimraf = require("rimraf")
const chai = require('chai');
const BlockchainNode = require('../node');
const VersionUtil = require('../common/version-util');
const P2pClient = require('../p2p');
const {
  PORT,
  P2P_PORT,
  TARGET_NUM_OUTBOUND_CONNECTION,
  MAX_NUM_INBOUND_CONNECTION,
  CONSENSUS_PROTOCOL_VERSION,
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_MAP,
  DATA_PROTOCOL_VERSION,
  CHAINS_DIR,
  GenesisAccounts,
  AccountProperties,
  HOSTING_ENV,
  P2pNetworkStates
} = require('../common/constants');
const { setNodeForTesting } = require('./test-util');

const expect = chai.expect;
const assert = chai.assert;

const { min, max } = VersionUtil.matchVersions(PROTOCOL_VERSION_MAP, CURRENT_PROTOCOL_VERSION);
const minProtocolVersion = min === undefined ? CURRENT_PROTOCOL_VERSION : min;
const maxProtocolVersion = max;

describe("P2P", () => {
  let node;
  let p2pClient;
  let p2pServer;

  before(async () => {
    rimraf.sync(CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node, 0, true, true);
    p2pClient = new P2pClient(node, minProtocolVersion, maxProtocolVersion);
    p2pServer = p2pClient.server;
    await p2pServer.listen();
  });

  after(() => {
    p2pClient.stop();

    rimraf.sync(CHAINS_DIR);
  });

  describe("Server Status", () => {
    describe("getIpAddress", () => {
      it("gets ip address", async () => {
        const actual = await p2pServer.getIpAddress();
        const ipAddressRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        expect(ipAddressRegex.test(actual)).to.be.true;
      });
    });

    describe("setUpIpAddresses", () => {
      it("sets ip address", async () => {
        const ipAddressRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        expect(ipAddressRegex.test(p2pServer.node.ipAddrInternal)).to.be.true;
        expect(ipAddressRegex.test(p2pServer.node.ipAddrExternal)).to.be.true;
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

    describe("getExternalIp", () => {
      it("gets external IP address", () => {
        expect(p2pServer.getExternalIp()).to.equal(p2pServer.node.ipAddrExternal);
      });
    });

    describe("getProtocolInfo", () => {
      it("gets external IP address", () => {
        assert.deepEqual(p2pServer.getProtocolInfo(), {
          COMPATIBLE_MAX_PROTOCOL_VERSION: maxProtocolVersion,
          COMPATIBLE_MIN_PROTOCOL_VERSION: minProtocolVersion,
          CONSENSUS_PROTOCOL_VERSION: CONSENSUS_PROTOCOL_VERSION,
          CURRENT_PROTOCOL_VERSION: CURRENT_PROTOCOL_VERSION,
          DATA_PROTOCOL_VERSION: DATA_PROTOCOL_VERSION
        });
      });
    });

    describe("getStateVersionStatus", () => {
      it("gets initial state version status", () => {
        assert.deepEqual(p2pServer.getStateVersionStatus(), {
          numVersions: 3,
          versionList: ['EMPTY', 'FINAL:0', 'NODE:0'],
          finalVersion: 'FINAL:0',
        });
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
          number: 0, epoch: 0, timestamp: GenesisAccounts[AccountProperties.TIMESTAMP]
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
        assert.deepEqual(actual, {
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
            numVersions: 3,
            versionList: [ 'EMPTY', 'FINAL:0', 'NODE:0' ],
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
          env: {
            NETWORK_OPTIMIZATION: undefined,
            GENESIS_CONFIGS_DIR: undefined,
            MIN_NUM_VALIDATORS: undefined,
            MAX_NUM_VALIDATORS: undefined,
            ACCOUNT_INDEX: undefined,
            P2P_PORT: undefined,
            PORT: undefined,
            HOSTING_ENV: undefined,
            DEBUG: undefined
          }
        };
        const actual = p2pServer.getRuntimeInfo();
        assert.deepEqual(Object.keys(actual), Object.keys(expected));
        assert.deepEqual(Object.keys(actual.process), Object.keys(expected.process));
        assert.deepEqual(Object.keys(actual.os), Object.keys(expected.os));
        assert.deepEqual(Object.keys(actual.env), Object.keys(expected.env));
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
    describe("initConnections", () => {
      it("sets targetOutBound", () => {
        expect(p2pClient.targetOutBound).to.equal(TARGET_NUM_OUTBOUND_CONNECTION);
      });

      it("sets maxInbound", () => {
        expect(p2pClient.maxInbound).to.equal(MAX_NUM_INBOUND_CONNECTION);
      });
    });

    describe("getConnectionStatus", () => {
      it("shows initial values of connection status", () => {
        assert.deepEqual(p2pClient.getConnectionStatus(), {
          p2pState: P2pNetworkStates.STARTING,
          targetOutBound: TARGET_NUM_OUTBOUND_CONNECTION,
          maxInbound: MAX_NUM_INBOUND_CONNECTION,
          numInbound: 0,
          numOutbound: 0,
          incomingPeers: [],
          outgoingPeers: [],
        });
      });
    });

    describe("getNetworkStatus", () => {
      it("shows initial values of connection status", () => {
        const intIp = p2pClient.server.getInternalIp();
        const extIp = p2pClient.server.getExternalIp();
        const intUrl = new URL(`ws://${intIp}:${P2P_PORT}`);
        const extUrl = new URL(`ws://${extIp}:${P2P_PORT}`);
        // NOTE(liayoo): The 'comcom', 'local' HOSTING_ENV settings assume that multiple blockchain
        // nodes are on the same machine.
        const p2pUrl = HOSTING_ENV === 'comcom' || HOSTING_ENV === 'local' ?
            intUrl.toString() : extUrl.toString();
        extUrl.protocol = 'http:';
        extUrl.port = PORT;
        const clientApiUrl = extUrl.toString();
        extUrl.pathname = 'json-rpc';
        const jsonRpcUrl = extUrl.toString();
        assert.deepEqual(p2pClient.getNetworkStatus(), {
          ip: extIp,
          p2p: {
            url: p2pUrl,
            port: P2P_PORT,
          },
          clientApi: {
            url: clientApiUrl,
            port: PORT,
          },
          jsonRpc: {
            url: jsonRpcUrl,
            port: PORT,
          },
          connectionStatus: p2pClient.getConnectionStatus()
        });
      });
    });

    describe("getStatus", () => {
      it("shows initial client status", () => {
        const blockStatus = p2pServer.getBlockStatus();
        assert.deepEqual(Object.keys(p2pClient.getStatus()), Object.keys({
          address: p2pServer.getNodeAddress(),
          updatedAt: Date.now(),
          lastBlockNumber: blockStatus.number,
          networkStatus: p2pClient.getNetworkStatus(),
          blockStatus: blockStatus,
          txStatus: p2pServer.getTxStatus(),
          consensusStatus: p2pServer.getConsensusStatus(),
          nodeStatus: p2pServer.getNodeStatus(),
          clientStatus: p2pClient.getClientStatus(),
          shardingStatus: p2pServer.getShardingStatus(),
          cpuStatus: p2pServer.getCpuUsage(),
          memoryStatus: p2pServer.getMemoryUsage(),
          diskStatus: p2pServer.getDiskUsage(),
          runtimeInfo: p2pServer.getRuntimeInfo(),
          protocolInfo: p2pServer.getProtocolInfo(),
          blockchainConfig: p2pServer.getBlockchainConfig(),
        }));
      });
    });
  });
});
