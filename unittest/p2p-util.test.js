const Websocket = require('ws');
const util = require('../p2p/util');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const {
  CURRENT_PROTOCOL_VERSION,
  DATA_PROTOCOL_VERSION,
  NETWORK_ID
} = require('../common/constants');

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
        networkId: NETWORK_ID,
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

  describe("signMessage", () => {
    const mockPrivateKey = '6204d4e083dd09c7b084e5923c5d664d2e1f3ce8440f90a773638f30c61d9c40';
    it("returns null when no object type but the other types", () => {
      const wrongInput1 = 'string';
      const wrongInput2 = undefined;
      const wrongInput3 = ['a', 1];
      const wrongInput4 = -1000;
      const wrongInput5 = true;
      expect(util.signMessage(wrongInput1, mockPrivateKey)).to.equal(null);
      expect(util.signMessage(wrongInput2, mockPrivateKey)).to.equal(null);
      expect(util.signMessage(wrongInput3, mockPrivateKey)).to.equal(null);
      expect(util.signMessage(wrongInput4, mockPrivateKey)).to.equal(null);
      expect(util.signMessage(wrongInput5, mockPrivateKey)).to.equal(null);
    });

    it("returns null when no valid private key but other values", () => {
      const wrongPrivateKey1 = 'string';
      const wrongPrivateKey2 = null;
      const wrongPrivateKey3 = ['a', 1];
      const wrongPrivateKey4 = 1000000000;
      const wrongPrivateKey5 = false;
      const wrongPrivateKey6 = { object: 123 };
      expect(util.signMessage({ correct: 'body' }, wrongPrivateKey1)).to.equal(null);
      expect(util.signMessage({ correct: 'body' }, wrongPrivateKey2)).to.equal(null);
      expect(util.signMessage({ correct: 'body' }, wrongPrivateKey3)).to.equal(null);
      expect(util.signMessage({ correct: 'body' }, wrongPrivateKey4)).to.equal(null);
      expect(util.signMessage({ correct: 'body' }, wrongPrivateKey5)).to.equal(null);
      expect(util.signMessage({ correct: 'body' }, wrongPrivateKey6)).to.equal(null);
    });

    it("returns correct the correct digital signature", () => {
      const body = {
        foo: 'bar',
        test: {
          1: 2,
          success: [1, 2, 3]
        }
      };
      expect(util.signMessage(body, mockPrivateKey)).to.equal('0x4455e15b20f5125fff5196081b02ce827a2eaa931a74e6f1ecdcacddb1a91469319c7cdccfa492a96df6cc0d06eace1c4023b2067b6465dc5858d602f72e19dc2f09ea7cd575ff7a54c77dc6f0de33256e309e5e0c9a0aef66082c670e92775c1c');
    });
  });

  describe("getAddressFromMessage", () => {
    const mockPrivateKey = '6204d4e083dd09c7b084e5923c5d664d2e1f3ce8440f90a773638f30c61d9c40';
    const body = {
      foo: 'bar',
      test: {
        1: 2,
        success: [1, 2, 3]
      }
    };
    const signature = util.signMessage(body, mockPrivateKey);
    it("returns null with wrong messages", () => {
      const wrongMessage1 = {
        data: {
          signature: signature
        }
      };
      const wrongMessage2 = {
        data: {
          body: 'string',
          signature: signature
        }
      };
      const wrongMessage3 = {
        data: {
          body: null,
          signature: signature
        }
      };
      const wrongMessage4 = {
        data: {
          body: ['a', 1],
          signature: signature
        }
      };
      const wrongMessage5 = {
        data: {
          body: 123123,
          signature: signature
        }
      };
      const wrongMessage6 = {
        data: {
          body: false,
          signature: signature
        }
      };
      const wrongMessage7 = {
        data: {
          body: body
        }
      };
      expect(util.getAddressFromMessage(wrongMessage1)).to.equal(null);
      expect(util.getAddressFromMessage(wrongMessage2)).to.equal(null);
      expect(util.getAddressFromMessage(wrongMessage3)).to.equal(null);
      expect(util.getAddressFromMessage(wrongMessage4)).to.equal(null);
      expect(util.getAddressFromMessage(wrongMessage5)).to.equal(null);
      expect(util.getAddressFromMessage(wrongMessage6)).to.equal(null);
      expect(util.getAddressFromMessage(wrongMessage7)).to.equal(null);
    });

    it("gets correct address", () => {
      const mockMessage = {
        type: 'test',
        data: {
          body: body,
          signature: signature
        }
      };
      expect(util.getAddressFromMessage(mockMessage)).to.equal('0xBBB2219cD5eACc54Ce95deF7a67dDe71C8241891');
    });
  });

  describe("verifySignedMessage", () => {
    const mockPrivateKey = '6204d4e083dd09c7b084e5923c5d664d2e1f3ce8440f90a773638f30c61d9c40';
    const body = {
      foo: 'bar',
      test: {
        1: 2,
        success: [1, 2, 3]
      }
    };
    const signature = util.signMessage(body, mockPrivateKey);
    it("returns null with wrong messages", () => {
      const wrongMessage1 = {
        data: {
          signature: signature
        }
      };
      const wrongMessage2 = {
        data: {
          body: 'string',
          signature: signature
        }
      };
      const wrongMessage3 = {
        data: {
          body: null,
          signature: signature
        }
      };
      const wrongMessage4 = {
        data: {
          body: ['a', 1],
          signature: signature
        }
      };
      const wrongMessage5 = {
        data: {
          body: 123123,
          signature: signature
        }
      };
      const wrongMessage6 = {
        data: {
          body: false,
          signature: signature
        }
      };
      const wrongMessage7 = {
        data: {
          body: body
        }
      };
      expect(util.verifySignedMessage(wrongMessage1)).to.equal(null);
      expect(util.verifySignedMessage(wrongMessage2)).to.equal(null);
      expect(util.verifySignedMessage(wrongMessage3)).to.equal(null);
      expect(util.verifySignedMessage(wrongMessage4)).to.equal(null);
      expect(util.verifySignedMessage(wrongMessage5)).to.equal(null);
      expect(util.verifySignedMessage(wrongMessage6)).to.equal(null);
      expect(util.verifySignedMessage(wrongMessage7)).to.equal(null);
    });

    it("verifies signature correctly", () => {
      const mockMessage = {
        type: 'test',
        data: {
          body: body,
          signature: signature
        }
      };
      const address = util.getAddressFromMessage(mockMessage);
      expect(util.verifySignedMessage(mockMessage, address)).to.equal(true);
    });
  });
});
