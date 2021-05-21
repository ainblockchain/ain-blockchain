const util = require('../p2p/util');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("P2P Util", () => {
  const mockAddress = '0x012345678abcdef';
  const mockSocket = {
    _events: {},
    _eventsCount: 0,
    _maxListeners: undefined,
    readyState: 0,
    protocol: '',
    _binaryType: 'nodebuffer',
    _closeFrameReceived: false,
    _closeFrameSent: false,
    _closeMessage: '',
    _closeTimer: null,
    _closeCode: 1006,
    _extensions: {},
    _receiver: null,
    _sender: null,
    _socket: null,
    _isServer: false,
    _redirects: 0,
    url: 'ws://172.30.1.59:5001',
    _req: {
      _events: {
        socket: [Function],
        error: [Function],
        response: [Function],
        upgrade: [Function]
      },
      _eventsCount: 4,
      _maxListeners: undefined,
      outputData: [[Object]],
      outputSize: 225,
      writable: true,
      _last: true,
      chunkedEncoding: false,
      shouldKeepAlive: true,
      useChunkedEncodingByDefault: false,
      sendDate: false,
      _removedConnection: false,
      _removedContLen: false,
      _removedTE: false,
      _contentLength: 0,
      _hasBody: true,
      _trailer: '',
      finished: true,
      _headerSent: true,
      socket: null,
      connection: null,
      _header: 'GET / HTTP/1.1\r\n' +
        'Sec-WebSocket-Version: 13\r\n' +
        'Sec-WebSocket-Key: XOFzb4NA2IFXjNUE10r3ug==\r\n' +
        'Connection: Upgrade\r\n' +
        'Upgrade: websocket\r\n' +
        'Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits\r\n' +
        'Host: 172.30.1.59:5001\r\n' +
        '\r\n',
      _onPendingData: [Function],
      agent: undefined,
      socketPath: undefined,
      method: 'GET',
      insecureHTTPParser: undefined,
      path: '/',
      _ended: false,
      res: null,
      aborted: false,
      timeoutCb: null,
      upgradeOrConnect: false,
      parser: null,
      maxHeadersCount: null,
      reusedSocket: false,
      "[Symbol(kCapture)]": false,
      "[Symbol(kNeedDrain)]": false,
      "[Symbol(corked)]": 0,
      "[Symbol(kOutHeaders)]": {
        'sec-websocket-version': [Array],
        'sec-websocket-key': [Array],
        connection: [Array],
        upgrade: [Array],
        'sec-websocket-extensions': [Array],
        host: [Array]
      }
    },
    "[Symbol(kCapture)]": false
  }
  const connectionObj = {
    [mockAddress]: {
      socket: mockSocket
    }
  };

  describe("getAddressFromSocket", () => {
    it("finds the socket successfully", () => {
      expect(util.getAddressFromSocket(connectionObj, mockSocket)).to.equal(mockAddress);
    });

    it("finds nothing", () => {
      expect(util.getAddressFromSocket(connectionObj, '0xdeadbeef')).to.equal(undefined);
    });
  });

  describe("removeSocketConnectionIfExists", () => {
    const clonedConnectionObj = JSON.parse(JSON.stringify(connectionObj));
    it("removes nothing", () => {
      util.removeSocketConnectionIfExists(clonedConnectionObj, '0xdeadbeef');
      assert.deepEqual(clonedConnectionObj, clonedConnectionObj);
    });

    it("removes the socket successfully", () => {
      util.removeSocketConnectionIfExists(clonedConnectionObj, mockAddress);
      expect(clonedConnectionObj[mockAddress]).to.equal(undefined);
    });
  });
});