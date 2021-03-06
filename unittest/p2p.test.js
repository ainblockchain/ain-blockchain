const chai = require('chai');

const BlockchainNode = require('../node');
const VersionUtil = require('../common/version-util');
const P2pClient = require('../p2p');
const {
  PORT,
  P2P_PORT,
  DEFAULT_MAX_OUTBOUND,
  DEFAULT_MAX_INBOUND,
  CONSENSUS_PROTOCOL_VERSION,
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_MAP,
  DATA_PROTOCOL_VERSION
} = require('../common/constants');

const expect = chai.expect;
const assert = chai.assert;

const { min, max } = VersionUtil.matchVersions(PROTOCOL_VERSION_MAP, CURRENT_PROTOCOL_VERSION);
const minProtocolVersion = min === undefined ? CURRENT_PROTOCOL_VERSION : min;
const maxProtocolVersion = max;

const node = new BlockchainNode();

describe("p2p", () => {
  let p2pClient;
  let p2pServer;
  before(() => {
    p2pClient = new P2pClient(node, minProtocolVersion, maxProtocolVersion);
    p2pServer = p2pClient.server;
    p2pServer.listen();
  });

  after(() => {
    p2pClient.stop();
  });

  describe("server status", () => {
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
        const actual = {
          COMPATIBLE_MAX_PROTOCOL_VERSION: maxProtocolVersion,
          COMPATIBLE_MIN_PROTOCOL_VERSION: minProtocolVersion,
          CONSENSUS_PROTOCOL_VERSION: CONSENSUS_PROTOCOL_VERSION,
          CURRENT_PROTOCOL_VERSION: CURRENT_PROTOCOL_VERSION,
          DATA_PROTOCOL_VERSION: DATA_PROTOCOL_VERSION
        };
        assert.deepEqual(actual, p2pServer.getProtocolInfo());
      });
    });

    describe("getStateVersionStatus", () => {
      it("gets initial state version status", () => {
        const actual = {
          numVersions: 2,
          versionList: ['EMPTY', 'NODE:-1'],
          finalVersion: null,
        };
        assert.deepEqual(actual, p2pServer.getStateVersionStatus());
      });
    });

    describe("getConsensusStatus", () => {
      it("gets initial consensus state", () => {
        const actual = {
          health: false,
          state: 'STARTING',
          stateNumeric: 0,
          epoch: 1,
          longestNotarizedChainTipsSize: 0
        };
        assert.deepEqual(actual, p2pServer.getConsensusStatus());
      });
    });

    describe("getBlockStatus", () => {
      it("gets initial block status", () => {
        const actual = { number: -1, epoch: -1, timestamp: -1 };
        const expected = p2pServer.getBlockStatus();
        delete expected.elapsedTimeMs;
        assert.deepEqual(actual, expected);
      });
    });

    describe("getNodeStatus", () => {
      it("gets initial node status", () => {
        const actual = {
          address: p2pServer.getNodeAddress(),
          state: 'STARTING',
          stateNumeric: 0,
          nonce: null,
          dbStatus: {
            stateInfo: { tree_height: null, tree_size: null },
            stateProof: { '.proof_hash': null }
          },
          stateVersionStatus: {
            numVersions: 2,
            versionList: [ 'EMPTY', 'NODE:-1' ],
            finalVersion: null
          }
        };
        assert.deepEqual(actual, p2pServer.getNodeStatus());
      });
    });

    describe("getDiskUsage", () => {
      it("gets initial disk usage (it depends on the machine)", () => {
        const actual = {
          available: 113007648768,
          free: 235339354112,
          total: 250685575168,
          used: 15346221056
        };
        assert.deepEqual(Object.keys(actual), Object.keys(p2pServer.getDiskUsage()));
      });
    });

    describe("getCpuUsage", () => {
      it("gets initial cpu usage (it depends on the machine)", () => {
        const actual = { free: 3174023060, usage: 313233920, total: 3487256980 };
        assert.deepEqual(Object.keys(actual), Object.keys(p2pServer.getCpuUsage()));
      });
    });

    describe("getMemoryUsage", () => {
      it("gets initial memory usage (it depends on the machine)", () => {
        const actual = {
          os: { free: 211546112, usage: 16968323072, total: 17179869184 },
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
        const expected = p2pServer.getMemoryUsage();
        assert.deepEqual(Object.keys(actual), Object.keys(expected));
        assert.deepEqual(Object.keys(actual.os), Object.keys(expected.os));
        // NOTE(minsulee2): Since the actual.heap part have in difference between the node version
        // (> 12.16) and (<= 12.17), which newly includes arrayBuffers info as well.
        // See also: the issue #419(https://github.com/ainblockchain/ain-blockchain/issues/419)
        expect(Object.keys(expected.heap)).include.members(Object.keys(actual.heap));
        assert.deepEqual(Object.keys(actual.heapStats), Object.keys(expected.heapStats));
      });
    });

    describe("getRuntimeInfo (it depends on the machine)", () => {
      it("gets runtime information", () => {
        const actual = {
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
            ACCOUNT_INDEX: undefined,
            P2P_PORT: undefined,
            PORT: undefined,
            HOSTING_ENV: undefined,
            DEBUG: undefined
          }
        };
        const expected = p2pServer.getRuntimeInfo();
        assert.deepEqual(Object.keys(actual), Object.keys(expected));
        assert.deepEqual(Object.keys(actual.process), Object.keys(expected.process));
        assert.deepEqual(Object.keys(actual.os), Object.keys(expected.os));
        assert.deepEqual(Object.keys(actual.env), Object.keys(expected.env));
      });
    });

    describe("getTxStatus", () => {
      it("gets initial tx status", () => {
        const actual = { txPoolSize: 0, txTrackerSize: 0 };
        assert.deepEqual(Object.keys(actual), Object.keys(p2pServer.getTxStatus()));
      });
    });

    describe("getShardingStatus", () => {
      it("gets initial sharding status", () => {
        const actual = {};
        assert.deepEqual(Object.keys(actual), Object.keys(p2pServer.getShardingStatus()));
      });
    });
  });

  describe("client status", () => {
    describe("initConnections", () => {
      it("sets maxOutbound", () => {
        expect(p2pClient.maxOutbound).to.equal(DEFAULT_MAX_OUTBOUND);
      });

      it("sets maxInbound", () => {
        expect(p2pClient.maxInbound).to.equal(DEFAULT_MAX_INBOUND);
      });
    });

    describe("getConnectionStatus", () => {
      it("shows initial values of connection status", () => {
        const actual = {
          maxInbound: DEFAULT_MAX_OUTBOUND,
          maxOutbound: DEFAULT_MAX_INBOUND,
          numInbound: 0,
          numOutbound: 0,
          incomingPeers: [],
          outgoingPeers: [],
        };
        assert.deepEqual(actual, p2pClient.getConnectionStatus());
      });
    });

    describe("getNetworkStatus", () => {
      it("shows initial values of connection status", () => {
        const extIp = p2pClient.server.getExternalIp();
        const url = new URL(`ws://${extIp}:${P2P_PORT}`);
        const p2pUrl = url.toString();
        url.protocol = 'http:';
        url.port = PORT;
        const clientApiUrl = url.toString();
        url.pathname = 'json-rpc';
        const jsonRpcUrl = url.toString();
        const actual = {
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
        };
        assert.deepEqual(actual, p2pClient.getNetworkStatus());
      });
    });

    describe("getStatus", () => {
      it("shows initial client status", () => {
        const blockStatus = p2pServer.getBlockStatus();
        const actual = {
          address: p2pServer.getNodeAddress(),
          updatedAt: Date.now(),
          lastBlockNumber: blockStatus.number,
          networkStatus: p2pClient.getNetworkStatus(),
          blockStatus: blockStatus,
          txStatus: p2pServer.getTxStatus(),
          consensusStatus: p2pServer.getConsensusStatus(),
          nodeStatus: p2pServer.getNodeStatus(),
          shardingStatus: p2pServer.getShardingStatus(),
          cpuStatus: p2pServer.getCpuUsage(),
          memoryStatus: p2pServer.getMemoryUsage(),
          diskStatus: p2pServer.getDiskUsage(),
          runtimeInfo: p2pServer.getRuntimeInfo(),
          protocolInfo: p2pServer.getProtocolInfo(),
        };
        assert.deepEqual(Object.keys(actual), Object.keys(p2pClient.getStatus()));
      });
    });
  });
});
