const Websocket = require('ws');
const util = require('../p2p/util');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

const {
  CURRENT_PROTOCOL_VERSION,
  DATA_PROTOCOL_VERSION
} = require('../common/constants');
const Chainutil = require('../common/chain-util');

describe("P2P Util", () => {
  const mockAddress = '0x012345678abcdef';
  let webServer;
  let mockSocket;
  let comparingSocket;
  let connectionObj;
  before(() => {
    webServer = new Websocket.Server({ port: 5000 });
    mockSocket = new Websocket('ws://127.0.0.1:5000');
    comparingSocket = new Websocket('ws://127.0.0.1:5000');
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
    comparingSocket.close();
    webServer.close();
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

  describe("encapsulateMessage", () => {
    const mockType = 'mockType';
    const wrongType1 = 1;
    const wrongType2 = undefined;
    const wrongType3 = ['a', 1];
    const wrongType4 = { foo: 'bar' };
    const wrongType5 = true;

    const mockDataObj = { test: 'encapsulation' };
    const wrongData1 = -5;
    const wrongData2 = null;
    const wrongData3 = 'wrongData';
    const wrongData4 = [];
    const wrongData5 = false;

    it("cannot encapsulate messages with wrong types", () => {
      expect(util.encapsulateMessage(wrongType1, mockDataObj)).to.equal(null);
      expect(util.encapsulateMessage(wrongType2, mockDataObj)).to.equal(null);
      expect(util.encapsulateMessage(wrongType3, mockDataObj)).to.equal(null);
      expect(util.encapsulateMessage(wrongType4, mockDataObj)).to.equal(null);
      expect(util.encapsulateMessage(wrongType5, mockDataObj)).to.equal(null);
    });

    it("cannot encapsulate messages with wrong data", () => {
      expect(util.encapsulateMessage(mockType, wrongData1)).to.equal(null);
      expect(util.encapsulateMessage(mockType, wrongData2)).to.equal(null);
      expect(util.encapsulateMessage(mockType, wrongData3)).to.equal(null);
      expect(util.encapsulateMessage(mockType, wrongData4)).to.equal(null);
      expect(util.encapsulateMessage(mockType, wrongData5)).to.equal(null);
    });

    it("encapsulates the message successfully", () => {
      const encapsulatedMessage = util.encapsulateMessage(mockType, mockDataObj);
      assert.deepEqual(encapsulatedMessage, {
        type: mockType,
        data: mockDataObj,
        protoVer: CURRENT_PROTOCOL_VERSION,
        dataProtoVer: DATA_PROTOCOL_VERSION,
        timestamp: encapsulatedMessage.timestamp
      });
    });
  });

  describe("checkTimestamp", () => {
    it("fails when getting wrong timestamp values", () => {
      const wrongTimestamp1 = 'timestamp';
      const wrongTimestamp2 = undefined;
      const wrongTimestamp3 = ['a', 1];
      const wrongTimestamp4 = { foo: 'bar' };
      const wrongTimestamp5 = true;
      expect(util.checkTimestamp(wrongTimestamp1)).to.equal(false);
      expect(util.checkTimestamp(wrongTimestamp2)).to.equal(false);
      expect(util.checkTimestamp(wrongTimestamp3)).to.equal(false);
      expect(util.checkTimestamp(wrongTimestamp4)).to.equal(false);
      expect(util.checkTimestamp(wrongTimestamp5)).to.equal(false);
    });

    it("passes the timestamp check", () => {
      const timestamp = Date.now();
      expect(util.checkTimestamp(timestamp)).to.equal(true);
    });
  });
});
