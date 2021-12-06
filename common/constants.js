const fs = require('fs');
const path = require('path');
const semver = require('semver');
const CommonUtil = require('./common-util');
const TrafficStatsManager = require('../traffic/traffic-stats-manager');

// ** Dev flags **
const DevFlags = {
  // Enables rich logging for functions.
  enableRichFunctionLogging: false,
  // Enables rich logging for transactions.
  enableRichTransactionLogging: false,
  // Enables rich logging for p2p communication.
  enableRichP2pCommunicationLogging: false,
  // Enables rich logging for tx selection in tx pool.
  enableRichTxSelectionLogging: false,
  // Enables state tree transfer.
  enableStateTreeTransfer: false,
  // Enables receipts recording to the state.
  enableReceiptsRecording: true,  // Some test cases assume this value true.
  // Enables ntp-sync for global time syncing.
  enableNtpSync: true,
  // Enables traffic monitoring.
  enableTrafficMonitoring: true,
};

// ** Node configs, set for individual nodes by env vars **
const NodeConfigs = {};
NodeConfigs.DEBUG = CommonUtil.convertEnvVarInputToBool(process.env.DEBUG);
NodeConfigs.CONSOLE_LOG = CommonUtil.convertEnvVarInputToBool(process.env.CONSOLE_LOG);
NodeConfigs.HOSTING_ENV = process.env.HOSTING_ENV || 'gcp';
NodeConfigs.ENABLE_DEV_CLIENT_SET_API =
    CommonUtil.convertEnvVarInputToBool(process.env.ENABLE_DEV_CLIENT_SET_API);
NodeConfigs.ENABLE_JSON_RPC_TX_API =
    CommonUtil.convertEnvVarInputToBool(process.env.ENABLE_JSON_RPC_TX_API, true);
NodeConfigs.ENABLE_TX_SIG_VERIF_WORKAROUND =
    CommonUtil.convertEnvVarInputToBool(process.env.ENABLE_TX_SIG_VERIF_WORKAROUND);
NodeConfigs.ENABLE_GAS_FEE_WORKAROUND =
    CommonUtil.convertEnvVarInputToBool(process.env.ENABLE_GAS_FEE_WORKAROUND, true);
NodeConfigs.ENABLE_REST_FUNCTION_CALL =
    CommonUtil.convertEnvVarInputToBool(process.env.ENABLE_REST_FUNCTION_CALL);
NodeConfigs.ENABLE_EXPRESS_RATE_LIMIT =
    CommonUtil.convertEnvVarInputToBool(process.env.ENABLE_EXPRESS_RATE_LIMIT, true);
NodeConfigs.ENABLE_EVENT_HANDLER =
    CommonUtil.convertEnvVarInputToBool(process.env.ENABLE_EVENT_HANDLER);
NodeConfigs.ACCOUNT_INDEX = process.env.ACCOUNT_INDEX || null;
NodeConfigs.PORT = process.env.PORT || getPortNumber(8080, 8080);
NodeConfigs.P2P_PORT = process.env.P2P_PORT || getPortNumber(5000, 5000);
NodeConfigs.EVENT_HANDLER_PORT = process.env.EVENT_HANDLER_PORT || getPortNumber(6000, 6000);
NodeConfigs.LIGHTWEIGHT = CommonUtil.convertEnvVarInputToBool(process.env.LIGHTWEIGHT);
NodeConfigs.SYNC_MODE = process.env.SYNC_MODE || 'full';
NodeConfigs.ACCOUNT_INJECTION_OPTION = process.env.ACCOUNT_INJECTION_OPTION || null;
NodeConfigs.KEYSTORE_FILE_PATH = process.env.KEYSTORE_FILE_PATH || null;
NodeConfigs.ENABLE_STATUS_REPORT_TO_TRACKER =
    CommonUtil.convertEnvVarInputToBool(process.env.ENABLE_STATUS_REPORT_TO_TRACKER, true);
NodeConfigs.REQUEST_BODY_SIZE_LIMIT = process.env.REQUEST_BODY_SIZE_LIMIT || '100mb';
// NOTE(liayoo): CORS_WHITELIST env var is a comma-separated list of cors-allowed domains.
// Note that if it includes '*', it will be set to allow all domains.
NodeConfigs.CORS_WHITELIST = CommonUtil.getCorsWhitelist(process.env.CORS_WHITELIST) || [
  'https://ainetwork\\.ai',
  'https://ainize\\.ai',
  'https://afan\\.ai',
  '\\.ainetwork\\.ai$',
  '\\.ainize\\.ai$',
  '\\.afan\\.ai$',
  'http://localhost:3000',
];
NodeConfigs.BLOCKCHAIN_DATA_DIR = process.env.BLOCKCHAIN_DATA_DIR || path.resolve(__dirname, '../ain_blockchain_data');
if (!fs.existsSync(NodeConfigs.BLOCKCHAIN_DATA_DIR)) {
  fs.mkdirSync(NodeConfigs.BLOCKCHAIN_DATA_DIR, { recursive: true });
}
const BASE_BLOCKCHAIN_CONFIGS_DIR = 'blockchain-configs/base';
NodeConfigs.CUSTOM_BLOCKCHAIN_CONFIGS_DIR = process.env.BLOCKCHAIN_CONFIGS_DIR || null;
NodeConfigs.GENESIS_BLOCK_DIR = path.resolve(__dirname, '..',
    process.env.BLOCKCHAIN_CONFIGS_DIR || BASE_BLOCKCHAIN_CONFIGS_DIR);

/**
 * Overwriting node_params.json with environment variables.
 * These parameters are defined in node_params.json, but if specified as environment variables,
 * the env vars take precedence.
 * (priority: env var > ${BLOCKCHAIN_CONFIGS_DIR}/node_params.json > ./genesis-configs/base/node_params.json)
 */
const NodeParams = getBlockchainConfig('node_params.json');
function overwriteNodeConfigs() {
  for (const [param, valFromNodeParams] of Object.entries(NodeParams)) {
    const valFromEnvVar = process.env[param];
    if (valFromEnvVar !== undefined) {
      NodeConfigs[param] = CommonUtil.isIntegerString(valFromEnvVar) ? Number(valFromEnvVar) : valFromEnvVar;
    } else {
      NodeConfigs[param] = valFromNodeParams;
    }
  }
}
overwriteNodeConfigs();

// ** Blockchain configs **
const BlockchainConsts = {};
// *** Genesis ***
const BlockchainParams = getBlockchainConfig('blockchain_params.json');
BlockchainConsts.CHAIN_ID = BlockchainParams.blockchain.chain_id;
BlockchainConsts.EPOCH_MS = BlockchainParams.consensus.epoch_ms;
BlockchainConsts.GENESIS_ADDR = BlockchainParams.genesis.genesis_addr;
BlockchainConsts.NETWORK_ID = BlockchainParams.network.network_id;
// TODO(liayoo): Use on-chain value instead of GenesisToken
const GenesisToken = BlockchainParams.token;
// TODO(liayoo): Deprecate GenesisAccounts
const GenesisAccounts = getBlockchainConfig('genesis_accounts.json');
// TODO(liayoo): Use on-chain value instead of GenesisSharding
const GenesisSharding = BlockchainParams.sharding;
// *** Protocol Versions ***
BlockchainConsts.CURRENT_PROTOCOL_VERSION = require('../package.json').version;
if (!semver.valid(BlockchainConsts.CURRENT_PROTOCOL_VERSION)) {
  throw Error('Wrong version format is specified in package.json');
}
BlockchainConsts.PROTOCOL_VERSIONS = path.resolve(__dirname, '../client/protocol_versions.json');
if (!fs.existsSync(BlockchainConsts.PROTOCOL_VERSIONS)) {
  throw Error('Missing protocol versions file: ' + BlockchainConsts.PROTOCOL_VERSIONS);
}
BlockchainConsts.PROTOCOL_VERSION_MAP = JSON.parse(fs.readFileSync(BlockchainConsts.PROTOCOL_VERSIONS));
BlockchainConsts.DATA_PROTOCOL_VERSION = '1.0.0';
if (!semver.valid(BlockchainConsts.DATA_PROTOCOL_VERSION)) {
  throw Error('Wrong data version format is specified for DATA_PROTOCOL_VERSION');
}
BlockchainConsts.CONSENSUS_PROTOCOL_VERSION = '1.0.0';
if (!semver.valid(BlockchainConsts.CONSENSUS_PROTOCOL_VERSION)) {
  throw Error('Wrong data version format is specified for CONSENSUS_PROTOCOL_VERSION');
}
// *** Directories & Files ***
BlockchainConsts.LOGS_DIR = path.resolve(__dirname, '../logs');
BlockchainConsts.CHAINS_DIR = path.resolve(NodeConfigs.BLOCKCHAIN_DATA_DIR, 'chains');
BlockchainConsts.CHAINS_N2B_DIR_NAME = 'n2b'; // Number-to-block directory name.
BlockchainConsts.CHAINS_H2N_DIR_NAME = 'h2n'; // Hash-to-number directory name.
BlockchainConsts.CHAINS_N2B_MAX_NUM_FILES = 100000;
BlockchainConsts.CHAINS_H2N_HASH_PREFIX_LENGTH = 5;
BlockchainConsts.CHAIN_SEGMENT_LENGTH = 20;
BlockchainConsts.SNAPSHOTS_ROOT_DIR = path.resolve(NodeConfigs.BLOCKCHAIN_DATA_DIR, 'snapshots');
BlockchainConsts.ON_MEMORY_CHAIN_LENGTH = 10;
BlockchainConsts.SNAPSHOTS_N2S_DIR_NAME = 'n2s'; // Number-to-snapshot directory name.
BlockchainConsts.DEBUG_SNAPSHOT_FILE_PREFIX = 'debug_'; // Prefix for debug snapshot files.
// NOTE(platfowner): Should have a value bigger than ON_MEMORY_CHAIN_LENGTH.
BlockchainConsts.SNAPSHOTS_INTERVAL_BLOCK_NUMBER = 1000; // How often the snapshot is generated.
BlockchainConsts.MAX_NUM_SNAPSHOTS = 10; // Maximum number of snapshots to be kept.
BlockchainConsts.HASH_DELIMITER = '#';
BlockchainConsts.VARIABLE_LABEL_PREFIX = '$';
BlockchainConsts.STATE_INFO_PREFIX = '#';
BlockchainConsts.KEYS_ROOT_DIR = path.resolve(NodeConfigs.BLOCKCHAIN_DATA_DIR, 'keys');
// *** Error Codes ***
BlockchainConsts.TX_NONCE_ERROR_CODE = 900;
BlockchainConsts.TX_TIMESTAMP_ERROR_CODE = 901;
// *** Token Denominations ***
BlockchainConsts.MILLI_AIN = 10**-3; // 1,000 milliain = 1 ain
BlockchainConsts.MICRO_AIN = 10**-6; // 1,000,000 microain = 1 ain
// *** State Budgets ***
BlockchainConsts.SERVICE_BANDWIDTH_BUDGET_RATIO = 0.5;
BlockchainConsts.APPS_BANDWIDTH_BUDGET_RATIO = 0.45;
BlockchainConsts.FREE_BANDWIDTH_BUDGET_RATIO = 0.05;
BlockchainConsts.SERVICE_STATE_BUDGET_RATIO = 0.5;
BlockchainConsts.APPS_STATE_BUDGET_RATIO = 0.45;
BlockchainConsts.FREE_STATE_BUDGET_RATIO = 0.05;
BlockchainConsts.MAX_STATE_TREE_SIZE_PER_BYTE = 0.01;
BlockchainConsts.STATE_GAS_COEFFICIENT = 1;
BlockchainConsts.UNIT_WRITE_GAS_AMOUNT = 1;
BlockchainConsts.ACCOUNT_REGISTRATION_GAS_AMOUNT = 2000;
BlockchainConsts.REST_FUNCTION_CALL_GAS_AMOUNT = 100;
// *** Traffic ***
BlockchainConsts.TRAFFIC_DB_INTERVAL_MS = 60000;  // 1 min
BlockchainConsts.TRAFFIC_DB_MAX_INTERVALS = 60;  // 1 hour
// *** Functions ***
BlockchainConsts.REST_FUNCTION_CALL_TIMEOUT_MS = 10000; // 10 sec

// ** Enums **
/**
 * Message types for communication between nodes.
 *
 * @enum {string}
 */
const MessageTypes = {
  ADDRESS_REQUEST: 'ADDRESS_REQUEST',
  ADDRESS_RESPONSE: 'ADDRESS_RESPONSE',
  CHAIN_SEGMENT_REQUEST: 'CHAIN_SEGMENT_REQUEST',
  CHAIN_SEGMENT_RESPONSE: 'CHAIN_SEGMENT_RESPONSE',
  TRANSACTION: 'TRANSACTION',
  CONSENSUS: 'CONSENSUS',
  PEER_INFO_UPDATE: 'PEER_INFO_UPDATE'
};

/**
 * States of blockchain nodes.
 *
 * @enum {string}
 */
const BlockchainNodeStates = {
  STARTING: 'STARTING',
  SYNCING: 'SYNCING',
  SERVING: 'SERVING',
  STOPPED: 'STOPPED',
};

/**
 * States of p2p network.
 *
 * @enum {string}
 */
const P2pNetworkStates = {
  STARTING: 'STARTING',
  EXPANDING: 'EXPANDING',
  STEADY: 'STEADY'
};

/**
 * Predefined database paths.
 * @enum {string}
 */
// TODO(platfowner): Move '.something' paths to here from '[Owner|Function|Rule|Value]Properties'.
const PredefinedDbPaths = {
  // Roots
  OWNERS_ROOT: 'owners',
  RULES_ROOT: 'rules',
  FUNCTIONS_ROOT: 'functions',
  VALUES_ROOT: 'values',
  // Entry point labels (.*)
  DOT_RULE: '.rule',
  DOT_FUNCTION: '.function',
  DOT_OWNER: '.owner',
  DOT_SHARD: '.shard',
  // Blockchain Params
  BLOCKCHAIN_PARAMS: 'blockchain_params',
  BLOCKCHAIN_PARAMS_BLOCKCHAIN: 'blockchain',
  BLOCKCHAIN_PARAMS_CONSENSUS: 'consensus',
  BLOCKCHAIN_PARAMS_GENESIS: 'genesis',
  BLOCKCHAIN_PARAMS_NETWORK: 'network',
  BLOCKCHAIN_PARAMS_RESOURCE: 'resource',
  BLOCKCHAIN_PARAMS_MAX_FUNCTION_URLS_PER_DEVELOPER: 'max_function_urls_per_developer',
  // Consensus
  CONSENSUS: 'consensus',
  CONSENSUS_BLOCK_HASH: 'block_hash',
  CONSENSUS_IS_AGAINST: 'is_against',
  CONSENSUS_NUMBER: 'number',
  CONSENSUS_OFFENSE_RECORDS: 'offense_records',
  CONSENSUS_OFFENSE_TYPE: 'offense_type',
  CONSENSUS_PROPOSAL_RIGHT: 'proposal_right',
  CONSENSUS_PROPOSE: 'propose',
  CONSENSUS_PROPOSER: 'proposer',
  CONSENSUS_REWARDS: 'rewards',
  CONSENSUS_REWARDS_UNCLAIMED: 'unclaimed',
  CONSENSUS_REWARDS_CUMULATIVE: 'cumulative',
  CONSENSUS_STAKE: 'stake',
  CONSENSUS_TOTAL_AT_STAKE: 'total_at_stake',
  CONSENSUS_VALIDATORS: 'validators',
  CONSENSUS_VOTE: 'vote',
  CONSENSUS_VOTE_NONCE: 'vote_nonce',
  CONSENSUS_PROPOSER_WHITELIST: 'proposer_whitelist',
  // Developers
  DEVELOPERS: 'developers',
  DEVELOPERS_REST_FUNCTIONS: 'rest_functions',
  DEVELOPERS_REST_FUNCTIONS_PARAMS: 'params',
  DEVELOPERS_REST_FUNCTIONS_USER_WHITELIST: 'user_whitelist',
  DEVELOPERS_REST_FUNCTIONS_URL_WHITELIST: 'url_whitelist',
  // Receipts
  RECEIPTS: 'receipts',
  RECEIPTS_ADDRESS: 'address',
  RECEIPTS_BILLING: 'billing',
  RECEIPTS_BLOCK_NUMBER: 'block_number',
  RECEIPTS_EXEC_RESULT: 'exec_result',
  RECEIPTS_EXEC_RESULT_CODE: 'code',
  RECEIPTS_EXEC_RESULT_ERROR_MESSAGE: 'error_message',
  RECEIPTS_EXEC_RESULT_GAS_AMOUNT_CHARGED: 'gas_amount_charged',
  RECEIPTS_EXEC_RESULT_GAS_COST_TOTAL: 'gas_cost_total',
  RECEIPTS_EXEC_RESULT_RESULT_LIST: 'result_list',
  // Gas fee
  GAS_FEE: 'gas_fee',
  GAS_FEE_AMOUNT: 'amount',
  GAS_FEE_BILLING: 'billing',
  GAS_FEE_CLAIM: 'claim',
  GAS_FEE_COLLECT: 'collect',
  GAS_FEE_UNCLAIMED: 'unclaimed',
  // Token
  TOKEN: 'token',
  TOKEN_BRIDGE: 'bridge',
  TOKEN_BRIDGE_TOKEN_POOL: 'token_pool',
  TOKEN_NAME: 'name',
  TOKEN_SYMBOL: 'symbol',
  TOKEN_TOTAL_SUPPLY: 'total_supply',
  // Save last tx
  SAVE_LAST_TX_LAST_TX: '.last_tx',
  // Erase value
  ERASE_VALUE_ERASED: 'erased',
  // Accounts & Transfer
  ACCOUNTS: 'accounts',
  ACCOUNTS_NONCE: 'nonce',
  ACCOUNTS_TIMESTAMP: 'timestamp',
  SERVICE_ACCOUNTS: 'service_accounts',
  BALANCE: 'balance',
  TRANSFER: 'transfer',
  TRANSFER_VALUE: 'value',
  TRANSFER_RESULT: 'result',
  // Apps & Manage app
  APPS: 'apps',
  MANAGE_APP: 'manage_app',
  MANAGE_APP_CONFIG: 'config',
  MANAGE_APP_CONFIG_ADMIN: 'admin',
  MANAGE_APP_CONFIG_BILLING: 'billing',
  MANAGE_APP_CONFIG_BILLING_USERS: 'users',
  MANAGE_APP_CONFIG_IS_PUBLIC: 'is_public',
  MANAGE_APP_CONFIG_SERVICE: 'service',
  MANAGE_APP_CREATE: 'create',
  MANAGE_APP_RESULT: 'result',
  // Staking
  STAKING: 'staking',
  STAKING_BALANCE_TOTAL: 'balance_total',
  STAKING_EXPIRE_AT: 'expire_at',
  STAKING_LOCKUP_DURATION: 'lockup_duration',
  STAKING_RESULT: 'result',
  STAKING_STAKE: 'stake',
  STAKING_UNSTAKE: 'unstake',
  STAKING_VALUE: 'value',
  // Payments
  PAYMENTS: 'payments',
  PAYMENTS_ADMIN: 'admin',
  PAYMENTS_CLAIM: 'claim',
  PAYMENTS_CONFIG: 'config',
  PAYMENTS_PAY: 'pay',
  PAYMENTS_RESULT: 'result',
  // Escrow
  ESCROW: 'escrow',
  ESCROW_ADMIN: 'admin',
  ESCROW_HOLD: 'hold',
  ESCROW_OPEN: 'open',
  ESCROW_RELEASE: 'release',
  ESCROW_RESULT: 'result',
  // Sharding
  SHARDING: 'sharding',
  SHARDING_CONFIG: 'config',
  SHARDING_SHARD: 'shard',
  // Check-in & Check-out
  CHECKIN: 'checkin',
  CHECKIN_AMOUNT: 'amount',
  CHECKIN_HISTORY: 'history',
  CHECKIN_REQUESTS: 'requests',
  CHECKIN_STATS: 'stats',
  CHECKIN_STATS_COMPLETE: 'complete',
  CHECKIN_STATS_PENDING: 'pending',
  CHECKIN_STATS_TOTAL: 'total',
  CHECKIN_TOKEN_POOL: 'token_pool',
  CHECKOUT: 'checkout',
  CHECKOUT_HISTORY: 'history',
  CHECKOUT_HISTORY_REFUND: 'refund',
  CHECKOUT_REQUESTS: 'requests',
  CHECKOUT_STATS: 'stats',
  CHECKOUT_STATS_COMPLETE: 'complete',
  CHECKOUT_STATS_PENDING: 'pending',
  CHECKOUT_STATS_TOTAL: 'total',
};

/**
 * Properties of token configs.
 *
 * @enum {string}
 */
const TokenProperties = {
  NAME: 'name',
  SYMBOL: 'symbol',
  TOTAL_SUPPLY: 'total_supply',
  BRIDGE: 'bridge',
};

/**
 * Properties of token bridge configs.
 *
 * @enum {string}
 */
 const TokenBridgeProperties = {
  TOKEN_POOL: 'token_pool',
  MIN_CHECKOUT_PER_REQUEST: 'min_checkout_per_request',
  MAX_CHECKOUT_PER_REQUEST: 'max_checkout_per_request',
  MAX_CHECKOUT_PER_DAY: 'max_checkout_per_day',
  CHECKOUT_FEE_RATE: 'checkout_fee_rate',
  TOKEN_EXCH_RATE: 'token_exchange_rate',
  TOKEN_EXCH_SCHEME: 'token_exchange_scheme',
};

/**
 * Properties of account configs.
 *
 * @enum {string}
 */
const AccountProperties = {
  ADDRESS: 'address',
  OTHERS: 'others',
  OWNER: 'owner',
  PRIVATE_KEY: 'private_key',
  PUBLIC_KEY: 'public_key',
};

/**
 * Properties of owner configs.
 *
 * @enum {string}
 */
const OwnerProperties = {
  ANYONE: '*',
  BRANCH_OWNER: 'branch_owner',
  FID_PREFIX: 'fid:',
  OWNERS: 'owners',
  WRITE_FUNCTION: 'write_function',
  WRITE_OWNER: 'write_owner',
  WRITE_RULE: 'write_rule',
};

/**
 * Properties of rule configs.
 *
 * @enum {string}
 */
const RuleProperties = {
  WRITE: 'write',
  STATE: 'state',
  MAX_CHILDREN: 'max_children',
  GC_MAX_SIBLINGS: 'gc_max_siblings',
  // TODO(liayoo): Add more properties (max_height, max_size, max_bytes)
};

/**
 * Properties of function configs.
 *
 * @enum {string}
 */
const FunctionProperties = {
  FUNCTION_ID: 'function_id',
  FUNCTION_TYPE: 'function_type',
  FUNCTION_URL: 'function_url',
};

/**
 * Types of functions.
 *
 * @enum {string}
 */
const FunctionTypes = {
  NATIVE: 'NATIVE',
  REST: 'REST',
};

/**
 * Properties of state info.
 *
 * @enum {string}
 */
const StateInfoProperties = {
  HAS_PARENT_STATE_NODE: '#has_parent_state_node',
  NEXT_SERIAL: '#next_serial',
  NUM_PARENTS: '#num_parents',
  RADIX_LABEL_PREFIX: '#radix:',
  RADIX_PROOF_HASH: '#radix_ph',
  SERIAL: '#serial',
  STATE_LABEL_PREFIX: '#state:',
  STATE_PROOF_HASH: '#state_ph',
  VERSION: '#version',
  TREE_HEIGHT: '#tree_height',
  TREE_SIZE: '#tree_size',
  TREE_BYTES: '#tree_bytes',
};

/**
 * Properties of blockchain snapshot.
 *
 * @enum {string}
 */
const BlockchainSnapshotProperties = {
  BLOCK: 'block',
  BLOCK_NUMBER: 'block_number',
  RADIX_SNAPSHOT: 'radix_snapshot',
  ROOT_PROOF_HASH: 'root_proof_hash',
  STATE_SNAPSHOT: 'state_snapshot',
};

/**
 * IDs of native functions.
 *
 * @enum {string}
 */
const NativeFunctionIds = {
  CANCEL_CHECKIN: '_cancelCheckin',
  CLAIM: '_claim',
  CLAIM_REWARD: '_claimReward',
  CLOSE_CHECKIN: '_closeCheckin',
  CLOSE_CHECKOUT: '_closeCheckout',
  COLLECT_FEE: '_collectFee',
  CREATE_APP: '_createApp',
  DISTRIBUTE_FEE: '_distributeFee',
  ERASE_VALUE: '_eraseValue',
  HANDLE_OFFENSES: '_handleOffenses',
  HOLD: '_hold',
  OPEN_CHECKIN: '_openCheckin',
  OPEN_CHECKOUT: '_openCheckout',
  PAY: '_pay',
  RELEASE: '_release',
  SAVE_LAST_TX: '_saveLastTx',
  SET_OWNER_CONFIG: '_setOwnerConfig',
  STAKE: '_stake',
  TRANSFER: '_transfer',
  UNSTAKE: '_unstake',
  UPDATE_LATEST_SHARD_REPORT: '_updateLatestShardReport',
};

function isNativeFunctionId(fid) {
  const fidList = Object.values(NativeFunctionIds);
  return fidList.includes(fid);
}

/**
 * Properties of sharding configs.
 *
 * @enum {string}
 */
const ShardingProperties = {
  LATEST_BLOCK_NUMBER: 'latest_block_number',
  MAX_SHARD_REPORT: 'max_shard_report',
  PARENT_CHAIN_POC: 'parent_chain_poc',
  PROOF_HASH: 'proof_hash',
  PROOF_HASH_MAP: 'proof_hash_map',
  REPORTING_PERIOD: 'reporting_period',
  SHARD_OWNER: 'shard_owner',
  SHARD_REPORTER: 'shard_reporter',
  SHARDING_ENABLED: 'sharding_enabled',
  SHARDING_PATH: 'sharding_path',
  SHARDING_PROTOCOL: 'sharding_protocol',
  TOKEN_EXCH_SCHEME: 'token_exchange_scheme',
  TOKEN_EXCH_RATE: 'token_exchange_rate',
};

/**
 * Sharding protocols.
 *
 * @enum {string}
 */
const ShardingProtocols = {
  NONE: 'NONE',
  POA: 'POA',
};

/**
 * Token exchange schemes.
 *
 * @enum {string}
 */
const TokenExchangeSchemes = {
  NONE: 'NONE',
  FIXED: 'FIXED',
};

/**
 * Types of read database operations.
 *
 * @enum {string}
 */
const ReadDbOperations = {
  GET_VALUE: 'GET_VALUE',
  GET_FUNCTION: 'GET_FUNCTION',
  GET_RULE: 'GET_RULE',
  GET_OWNER: 'GET_OWNER',
  MATCH_FUNCTION: 'MATCH_FUNCTION',
  MATCH_RULE: 'MATCH_RULE',
  MATCH_OWNER: 'MATCH_OWNER',
  EVAL_RULE: 'EVAL_RULE',
  EVAL_OWNER: 'EVAL_OWNER',
  GET: 'GET',
};

/**
 * Types of write database operations.
 *
 * @enum {string}
 */
const WriteDbOperations = {
  SET_VALUE: 'SET_VALUE',
  INC_VALUE: 'INC_VALUE',
  DEC_VALUE: 'DEC_VALUE',
  SET_FUNCTION: 'SET_FUNCTION',
  SET_RULE: 'SET_RULE',
  SET_OWNER: 'SET_OWNER',
  SET: 'SET',
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

/**
 * Transaction states.
 *
 * @enum {string}
 */
const TransactionStates = {
  FINALIZED: 'FINALIZED',
  EXECUTED: 'EXECUTED',
  FAILED: 'FAILED',
  PENDING: 'PENDING',
  TIMED_OUT: 'TIMED_OUT',
};

/**
 * State versions.
 *
 * @enum {string}
 */
const StateVersions = {
  BACKUP: 'BACKUP',
  CONSENSUS_CREATE: 'CONSENSUS_CREATE',
  CONSENSUS_PROPOSE: 'CONSENSUS_PROPOSE',
  CONSENSUS_VOTE: 'CONSENSUS_VOTE',
  EMPTY: 'EMPTY',
  FINAL: 'FINAL',
  NODE: 'NODE',
  POOL: 'POOL',
  SEGMENT: 'SEGMENT',
  LOAD: 'LOAD',
  SNAP: 'SNAP',
  START: 'START',
  TX_POOL: 'TX_POOL',
};

/**
 * Sync mode options.
 *
 * @enum {string}
 */
const SyncModeOptions = {
  FULL: 'full',
  FAST: 'fast',
};

const TrafficEventTypes = {
  // JSON-RPC APIs
  JSON_RPC_GET: 'json_rpc_get',
  JSON_RPC_SET: 'json_rpc_set',
  // P2P messages
  P2P_MESSAGE_CLIENT: 'p2p_message_client',
  P2P_MESSAGE_SERVER: 'p2p_message_server',
  // Client APIs
  CLIENT_API_GET: 'client_api_get',
  CLIENT_API_SET: 'client_api_set',
  // Blocks
  BLOCK_EVIDENCE: 'block_evidence',
  BLOCK_GAS_AMOUNT: 'block_gas_amount',
  BLOCK_GAS_COST: 'block_gas_cost',
  BLOCK_LAST_VOTES: 'block_last_votes',
  BLOCK_SIZE: 'block_size',
  BLOCK_TXS: 'block_txs',
  // Txs
  TX_BYTES: 'tx_bytes',
  TX_GAS_AMOUNT: 'tx_gas_amount',
  TX_GAS_COST: 'tx_gas_cost',
  TX_OP_SIZE: 'tx_op_size',
};

const BlockchainEventTypes = {
  BLOCK_FINALIZED: 'BLOCK_FINALIZED',
  VALUE_CHANGED: 'VALUE_CHANGED',
};

const BlockchainEventMessageTypes = {
  REGISTER_FILTER: 'REGISTER_FILTER',
  DEREGISTER_FILTER: 'DEREGISTER_FILTER',
  EMIT_EVENT: 'EMIT_EVENT',
};

// ** Lists **

/**
 * Root labels of service paths.
 */
const SERVICE_TYPES = [
  PredefinedDbPaths.ACCOUNTS,
  PredefinedDbPaths.CHECKIN,
  PredefinedDbPaths.CHECKOUT,
  PredefinedDbPaths.ESCROW,
  PredefinedDbPaths.GAS_FEE,
  PredefinedDbPaths.MANAGE_APP,
  PredefinedDbPaths.PAYMENTS,
  PredefinedDbPaths.SERVICE_ACCOUNTS,
  PredefinedDbPaths.SHARDING,
  PredefinedDbPaths.STAKING,
  PredefinedDbPaths.TRANSFER,
];

function isServiceType(type) {
  return SERVICE_TYPES.includes(type);
}

/**
 * Service types allowed to create service accounts.
 */
const SERVICE_ACCOUNT_SERVICE_TYPES = [
  PredefinedDbPaths.GAS_FEE_BILLING,
  PredefinedDbPaths.ESCROW,
  PredefinedDbPaths.GAS_FEE,
  PredefinedDbPaths.PAYMENTS,
  PredefinedDbPaths.STAKING,
];

function isServiceAccountServiceType(type) {
  return SERVICE_ACCOUNT_SERVICE_TYPES.includes(type);
}

/**
 * Service types that are app-dependent.
 */
const APP_DEPENDENT_SERVICE_TYPES = [
  PredefinedDbPaths.MANAGE_APP,
  PredefinedDbPaths.PAYMENTS,
  PredefinedDbPaths.STAKING,
];

function isAppDependentServiceType(type) {
  return APP_DEPENDENT_SERVICE_TYPES.includes(type);
}

/**
 * Port number helper.
 * @param {number} defaultValue
 * @param {number} baseValue
 */
function getPortNumber(defaultValue, baseValue) {
  if (NodeConfigs.HOSTING_ENV === 'local') {
    return Number(baseValue) + (NodeConfigs.ACCOUNT_INDEX !== null ? Number(NodeConfigs.ACCOUNT_INDEX) + 1 : 0);
  }
  return defaultValue;
}

function getBlockchainConfig(filename) {
  let config = null;
  if (NodeConfigs.CUSTOM_BLOCKCHAIN_CONFIGS_DIR) {
    const configPath = path.resolve(__dirname, '..', NodeConfigs.CUSTOM_BLOCKCHAIN_CONFIGS_DIR, filename);
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath));
    }
  }
  if (!config) {
    const configPath = path.resolve(__dirname, '..', BASE_BLOCKCHAIN_CONFIGS_DIR, filename);
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath));
    } else {
      throw Error(`Missing blockchain config file: ${configPath}`);
    }
  }
  return config;
}

function buildOwnerPermissions(branchOwner, writeFunction, writeOwner, writeRule) {
  return {
    [OwnerProperties.BRANCH_OWNER]: branchOwner,
    [OwnerProperties.WRITE_FUNCTION]: writeFunction,
    [OwnerProperties.WRITE_OWNER]: writeOwner,
    [OwnerProperties.WRITE_RULE]: writeRule
  };
}

function buildRulePermission(rule) {
  return {
    [PredefinedDbPaths.DOT_RULE]: {
      [RuleProperties.WRITE]: rule
    }
  };
}

const trafficStatsManager = new TrafficStatsManager(
    BlockchainConsts.TRAFFIC_DB_INTERVAL_MS, BlockchainConsts.TRAFFIC_DB_MAX_INTERVALS, DevFlags.enableTrafficMonitoring);

module.exports = {
  DevFlags,
  BlockchainConsts,
  NodeConfigs,
  MessageTypes,
  BlockchainNodeStates,
  P2pNetworkStates,
  PredefinedDbPaths,
  TokenProperties,
  TokenBridgeProperties,
  AccountProperties,
  OwnerProperties,
  RuleProperties,
  FunctionProperties,
  FunctionTypes,
  FunctionResultCode,
  StateInfoProperties,
  BlockchainSnapshotProperties,
  NativeFunctionIds,
  isNativeFunctionId,
  ShardingProperties,
  ShardingProtocols,
  TokenExchangeSchemes,
  ReadDbOperations,
  WriteDbOperations,
  TransactionStates,
  StateVersions,
  GenesisToken,
  GenesisAccounts,
  GenesisSharding,
  getBlockchainConfig,
  SyncModeOptions,
  TrafficEventTypes,
  BlockchainEventTypes,
  BlockchainEventMessageTypes,
  isServiceType,
  isServiceAccountServiceType,
  isAppDependentServiceType,
  buildOwnerPermissions,
  buildRulePermission,
  BlockchainParams,
  trafficStatsManager,
};
