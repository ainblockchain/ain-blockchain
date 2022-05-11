const JSON_RPC_METHOD = {
  // GET
  AIN_GET_ADDRESS: 'ain_getAddress',
  AIN_GET_BALANCE: 'ain_getBalance',
  AIN_GET_NONCE: 'ain_getNonce',
  AIN_GET_TIMESTAMP: 'ain_getTimestamp',
  AIN_GET_VALIDATOR_INFO: 'ain_getValidatorInfo',
  AIN_GET_DEV_CLIENT_API_IP_WHITELIST: 'ain_getDevClientApiIpWhitelist',
  AIN_VALIDATE_APP_NAME: 'ain_validateAppName',
  AIN_GET_BLOCK_LIST: 'ain_getBlockList',
  AIN_GET_LAST_BLOCK: 'ain_getLastBlock',
  AIN_GET_LAST_BLOCK_NUMBER: 'ain_getLastBlockNumber',
  AIN_GET_BLOCK_HEADERS_LIST: 'ain_getBlockHeadersList',
  AIN_GET_BLOCK_BY_HASH: 'ain_getBlockByHash',
  AIN_GET_BLOCK_BY_NUMBER: 'ain_getBlockByNumber',
  AIN_GET_PROPOSER_BY_HASH: 'ain_getProposerByHash',
  AIN_GET_PROPOSER_BY_NUMBER: 'ain_getProposerByNumber',
  AIN_GET_VALIDATORS_BY_NUMBER: 'ain_getValidatorsByNumber',
  AIN_GET_VALIDATORS_BY_HASH: 'ain_getValidatorsByHash',
  AIN_GET_BLOCK_TRANSACTION_COUNT_BY_HASH: 'ain_getBlockTransactionCountByHash',
  AIN_GET_BLOCK_TRANSACTION_COUNT_BY_NUMBER: 'ain_getBlockTransactionCountByNumber',
  AIN_GET: 'ain_get',
  AIN_MATCH_FUNCTION: 'ain_matchFunction',
  AIN_MATCH_RULE: 'ain_matchRule',
  AIN_MATCH_OWNER: 'ain_matchOwner',
  AIN_EVAL_RULE: 'ain_evalRule',
  AIN_EVAL_OWNER: 'ain_evalOwner',
  AIN_GET_STATE_PROOF: 'ain_getStateProof',
  AIN_GET_PROOF_HASH: 'ain_getProofHash',
  AIN_GET_STATE_INFO: 'ain_getStateInfo',
  AIN_GET_STATE_USAGE: 'ain_getStateUsage',
  // SET
  AIN_ADD_TO_DEV_CLIENT_API_IP_WHITELIST: 'ain_addToDevClientApiIpWhitelist',
  AIN_REMOVE_FROM_DEV_CLIENT_API_IP_WHITELIST: 'ain_removeFromDevClientApiIpWhitelist',
}

module.exports = {
  JSON_RPC_METHOD
};
