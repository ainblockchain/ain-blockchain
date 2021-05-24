const chai = require('chai');

const BlockchainNode = require('../node');
const VersionUtil = require('../common/version-util');
const P2pClient = require('../p2p');
const {
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_MAP
} = require('../common/constants');

const expect = chai.expect;
const assert = chai.assert;

const { min, max } = VersionUtil.matchVersions(PROTOCOL_VERSION_MAP, CURRENT_PROTOCOL_VERSION);
const minProtocolVersion = min === undefined ? CURRENT_PROTOCOL_VERSION : min;
const maxProtocolVersion = max;

const node = new BlockchainNode();

describe("p2p", () => {
  let p2pClient;
  before(() => {
    p2pClient = new P2pClient(node, minProtocolVersion, maxProtocolVersion);
  });
  after(() => {
    p2pClient.stop();
  });
});