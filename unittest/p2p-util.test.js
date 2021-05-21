const Websocket = require('ws');
const util = require('../p2p/util');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("P2P Util", () => {
  const mockAddress = '0x012345678abcdef';
  let mockSocket;
  let connectionObj;
  before(() => {
    mockSocket = new Websocket('ws://127.0.0.1:5000');
    connectionObj = {
      [mockAddress]: {
        socket: mockSocket
      }
    };
  });

  after(() => {
    if (mockSocket.readyState !== 3) {
      mockSocket.close();
    }
  });

  describe("getAddressFromSocket", () => {
    it("finds nothing", () => {
      expect(util.getAddressFromSocket(connectionObj, '0xdeadbeef')).to.equal(undefined);
    });

    it("finds the socket successfully", () => {
      expect(util.getAddressFromSocket(connectionObj, mockSocket)).to.equal(mockAddress);
    });
  });

  describe("removeSocketConnectionIfExists", () => {
    it("removes nothing", () => {
      const clonedConnectionObj = JSON.parse(JSON.stringify(connectionObj));
      util.removeSocketConnectionIfExists(clonedConnectionObj, '0xdeadbeef');
      assert.deepEqual(clonedConnectionObj, clonedConnectionObj);
    });

    it("removes the socket successfully", () => {
      const clonedConnectionObj = JSON.parse(JSON.stringify(connectionObj));
      util.removeSocketConnectionIfExists(clonedConnectionObj, mockAddress);
      expect(clonedConnectionObj[mockAddress]).to.equal(undefined);
    });
  });

  let comparingSocket;
  before(() => {
    comparingSocket = new Websocket('ws://127.0.0.1:5000');
  });

  after(() => {
    comparingSocket.close();
  });

  describe("closeSocketSafe", () => {
    it("closes nothing", () => {
      util.closeSocketSafe(connectionObj, comparingSocket);
      assert.deepEqual(connectionObj, connectionObj);
    });

    it("closes the socket successfully", () => {
      util.closeSocketSafe(connectionObj, mockSocket);
      expect(connectionObj[mockAddress]).to.equal(undefined);
    });
  });
});
