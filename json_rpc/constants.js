const JSON_RPC_METHODS = {
  AIN_ADD_TO_DEV_CLIENT_API_IP_WHITELIST: 'ain_addToDevClientApiIpWhitelist',
  AIN_CHECK_PROTOCOL_VERSION: 'ain_checkProtocolVersion',
  AIN_EVAL_RULE: 'ain_evalRule',
  AIN_EVAL_OWNER: 'ain_evalOwner',
  AIN_GET: 'ain_get',
  AIN_GET_ADDRESS: 'ain_getAddress',
  AIN_GET_BALANCE: 'ain_getBalance',
  AIN_GET_BLOCK_BY_HASH: 'ain_getBlockByHash',
  AIN_GET_BLOCK_BY_NUMBER: 'ain_getBlockByNumber',
  AIN_GET_BLOCK_HEADERS_LIST: 'ain_getBlockHeadersList',
  AIN_GET_BLOCK_LIST: 'ain_getBlockList',
  AIN_GET_BLOCK_TRANSACTION_COUNT_BY_HASH: 'ain_getBlockTransactionCountByHash',
  AIN_GET_BLOCK_TRANSACTION_COUNT_BY_NUMBER: 'ain_getBlockTransactionCountByNumber',
  AIN_GET_BOOTSTRAP_PUB_KEY: 'ain_getBootstrapPubKey',
  AIN_GET_DEV_CLIENT_API_IP_WHITELIST: 'ain_getDevClientApiIpWhitelist',
  AIN_GET_EVENT_HANDLER_CHANNEL_INFO: 'ain_getEventHandlerChannelInfo',
  AIN_GET_EVENT_HANDLER_FILTER_INFO: 'ain_getEventHandlerFilterInfo',
  AIN_GET_LAST_BLOCK: 'ain_getLastBlock',
  AIN_GET_LAST_BLOCK_NUMBER: 'ain_getLastBlockNumber',
  AIN_GET_NONCE: 'ain_getNonce',
  AIN_GET_PENDING_TRANSACTIONS: 'ain_getPendingTransactions',
  AIN_GET_PROOF_HASH: 'ain_getProofHash',
  AIN_GET_PROPOSER_BY_HASH: 'ain_getProposerByHash',
  AIN_GET_PROPOSER_BY_NUMBER: 'ain_getProposerByNumber',
  AIN_GET_PROTOCOL_VERSION: 'ain_getProtocolVersion',
  AIN_GET_STATE_INFO: 'ain_getStateInfo',
  AIN_GET_STATE_PROOF: 'ain_getStateProof',
  AIN_GET_STATE_USAGE: 'ain_getStateUsage',
  AIN_GET_TRANSACTION_BY_BLOCK_HASH_AND_INDEX: 'ain_getTransactionByBlockHashAndIndex',
  AIN_GET_TRANSACTION_BY_BLOCK_NUMBER_AND_INDEX: 'ain_getTransactionByBlockNumberAndIndex',
  AIN_GET_TRANSACTION_BY_HASH: 'ain_getTransactionByHash',
  AIN_GET_TRANSACTION_POOL_SIZE_UTILIZATION: 'ain_getTransactionPoolSizeUtilization',
  AIN_GET_TIMESTAMP: 'ain_getTimestamp',
  AIN_GET_VALIDATOR_INFO: 'ain_getValidatorInfo',
  AIN_GET_VALIDATORS_BY_HASH: 'ain_getValidatorsByHash',
  AIN_GET_VALIDATORS_BY_NUMBER: 'ain_getValidatorsByNumber',
  AIN_INJECT_ACCOUNT_FROM_HD_WALLET: 'ain_injectAccountFromHDWallet',
  AIN_INJECT_ACCOUNT_FROM_KEYSTORE: 'ain_injectAccountFromKeystore',
  AIN_INJECT_ACCOUNT_FROM_PRIVATE_KEY: 'ain_injectAccountFromPrivateKey',
  AIN_MATCH_FUNCTION: 'ain_matchFunction',
  AIN_MATCH_OWNER: 'ain_matchOwner',
  AIN_MATCH_RULE: 'ain_matchRule',
  AIN_REMOVE_FROM_DEV_CLIENT_API_IP_WHITELIST: 'ain_removeFromDevClientApiIpWhitelist',
  AIN_SEND_SIGNED_TRANSACTION: 'ain_sendSignedTransaction',
  AIN_SEND_SIGNED_TRANSACTION_BATCH: 'ain_sendSignedTransactionBatch',
  AIN_VALIDATE_APP_NAME: 'ain_validateAppName',
  NET_CONSENSUS_STATUS: 'net_consensusStatus',
  NET_GET_CHAIN_ID: 'net_getChainId',
  NET_GET_EVENT_HANDLER_NETWORK_INFO: 'net_getEventHandlerNetworkInfo',
  NET_GET_NETWORK_ID: 'net_getNetworkId',
  NET_LISTENING: 'net_listening',
  NET_PEER_COUNT: 'net_peerCount',
  NET_RAW_CONSENSUS_STATUS: 'net_rawConsensusStatus',
  NET_SYNCING: 'net_syncing',
  P2P_GET_PEER_CANDIDATE_INFO: 'p2p_getPeerCandidateInfo',
}

const JSON_RPC_SET_METHOD_SET = new Set([
  JSON_RPC_METHODS.AIN_ADD_TO_DEV_CLIENT_API_IP_WHITELIST,
  JSON_RPC_METHODS.AIN_INJECT_ACCOUNT_FROM_HD_WALLET,
  JSON_RPC_METHODS.AIN_INJECT_ACCOUNT_FROM_KEYSTORE,
  JSON_RPC_METHODS.AIN_INJECT_ACCOUNT_FROM_PRIVATE_KEY,
  JSON_RPC_METHODS.AIN_REMOVE_FROM_DEV_CLIENT_API_IP_WHITELIST,
  JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION,
  JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_BATCH
]);

module.exports = {
  JSON_RPC_METHODS,
  JSON_RPC_SET_METHOD_SET
};
