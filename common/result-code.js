/**
 * Dev Client API result code.
 *
 * @enum {number}
 */
const DevClientResultCode = {
  // Common code
  SUCCESS: 0,
  FAILURE: 1,
};

/**
 * JSON RPC API result code.
 *
 * @enum {number}
 */
const JsonRpcResultCode = {
  // Common code
  SUCCESS: 0,
  // ain_checkProtocolVersion
  PROTO_VERSION_NOT_SPECIFIED: 1,
  PROTO_VERSION_INVALID: 2,
  PROTO_VERSION_INCOMPATIBLE: 3,
  // ain_get
  GET_INVALID_OPERATION: 1,
  // ain_sendSignedTransaction
  TX_EXCEEDS_SIZE_LIMIT: 1,
  TX_MISSING_PROPERTIES: 2,
  TX_INVALID_FORMAT: 3,
  // ain_sendSignedTransactionBatch
  BATCH_INVALID_FORMAT: 1,
  BATCH_TX_LIST_EXCEEDS_SIZE_LIMIT: 2,
  BATCH_TX_EXCEEDS_SIZE_LIMIT: 3,
  BATCH_TX_MISSING_PROPERTIES: 4,
  BATCH_TX_INVALID_FORMAT: 5,
};

/**
 * Transaction result code.
 *
 * @enum {number}
 */
const TxResultCode = {
  // Node
  TX_ALREADY_RECEIVED: 1,
  TX_INVALID: 5,
  TX_INVALID_SIGNATURE: 6,
  TX_POOL_NOT_ENOUGH_ROOM: 3,
  TX_POOL_NOT_ENOUGH_ROOM_FOR_ACCOUNT: 4,
  BLOCKCHAIN_NODE_NOT_SERVING: 2,
};

/**
 * Function result code.
 *
 * @enum {number}
 */
const FunctionResultCode = {
  SUCCESS: 0,
  FAILURE: 1,  // Normal failure
  INTERNAL_ERROR: 2,  // Something went wrong but don't know why
  // Transfer
  INSUFFICIENT_BALANCE: 100,
  // Staking
  IN_LOCKUP_PERIOD: 200,
  // Create app
  INVALID_SERVICE_NAME: 300,
  // Check-in & Check-out
  INVALID_ACCOUNT_NAME: 400,
  INVALID_CHECKOUT_AMOUNT: 401,
  INVALID_RECIPIENT: 402,
  INVALID_TOKEN_BRIDGE_CONFIG: 403,
  INVALID_SENDER: 405,
  UNPROCESSED_REQUEST_EXISTS: 406,
  INVALID_CHECKIN_AMOUNT: 407,
  // Claim reward
  INVALID_AMOUNT: 500,
};

module.exports = {
  DevClientResultCode,
  JsonRpcResultCode,
  TxResultCode,
  FunctionResultCode,
};
