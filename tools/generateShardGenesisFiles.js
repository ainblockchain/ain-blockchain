const ainUtil = require('@ainblockchain/ain-util');
const _ = require('lodash');
const path = require('path');
const fs = require('fs');
// All blockchain nodes in parent chains
const parentChainPoCList = {
  dev: [
    'http://35.194.235.180:8080',
    'http://34.83.238.42:8080',
    'http://34.87.61.255:8080',
    'http://35.224.157.200:8080',
    'http://34.90.7.23:8080'
  ],
  staging: [
    'http://35.194.139.219:8080',
    'http://35.197.60.255:8080',
    'http://35.247.190.24:8080',
    'http://35.222.212.217:8080',
    'http://35.204.62.84:8080'
  ],
  spring: [
    'http://35.221.184.48:8080',
    'http://35.199.150.150:8080',
    'http://35.240.215.241:8080',
    'http://35.223.56.37:8080',
    'http://34.90.158.21:8080'
  ],
  summer: [
    'http://35.194.169.78:8080',
    'http://34.82.95.95:8080',
    'http://35.198.254.194:8080',
    'http://35.224.254.17:8080',
    'http://35.204.162.35:8080'
  ]
};

function writeFile(json, file) {
  fs.writeFileSync(file, json, 'utf8');
}

function createAccount(prefix) {
  console.log(`Creating an account with prefix ${prefix}..`);
  let count = 0;
  while (true) {
    const account = ainUtil.createAccount(); // { private_key, public_key, address }
    const address = account.address.substring(2);
    if (_.startsWith(address, prefix)) {
      // console.log(`Account: ${JSON.stringify(account, null, 2)}`);
      return account;
    }
    count++;
    if (count % 10000 === 0) {
      console.log(`Tried ${count} times..`);
    }
  }
}

function createAccounts(num, _prefix) {
  const ownerAccount = createAccount(_prefix + _prefix);
  const otherAccounts = [];
  for (let i = 0; i < num; i++) {
    const prefix = _prefix === null ? '' : _.padStart(i, 2, '0') + _prefix;
    otherAccounts.push(createAccount(prefix));
  }
  return {
    owner: ownerAccount,
    timestamp: Date.now(),
    shares: 1000000,
    others: otherAccounts
  }
}

function getShardingConfig(env, index) {
  const pocList = parentChainPoCList[env];
  return {
    sharding_protocol: 'POA',
    sharding_path: `/apps/shard_${index}`,
    parent_chain_poc: pocList[index % pocList.length],
    reporting_period: 5,
    token_exchange_scheme: 'FIXED',
    token_exchange_rate: 10,
  };
}

function getShardingToken(prefix) {
  return {
    name: `ShardCoin${prefix}`,
    symbol: `SHARDCO${prefix}`,
    total_supply: 100000000000
  };
}

async function processArguments() {
  if (process.argv.length !== 5) {
    usage();
  }
  const env = process.argv[2];
  const num = Number(process.argv[3]);
  const index = Number(process.argv[4]);
  console.log(`Env: ${env} / Number of accounts: ${num} / Index: ${index}`);
  if (!parentChainPoCList[env]) {
    console.log('Invalid env: ' + env);
    usage();
  }
  if (isNaN(num) || num === 0) {
    console.log('Invalid number of accounts: ' + num);
    usage();
  }
  if (isNaN(index) || index < 1) {
    console.log('Invalid shard index: ' + index);
    usage();
  }

  // directory for shard genesis files
  const shardDir = path.resolve(__dirname, `../genesis-configs/shard_${index}`);
  if (!fs.existsSync(shardDir)) {
    fs.mkdirSync(shardDir);
  }
  // genesis_accounts.json
  // prefixing rule: shard 1 = 'B0', shard 2 = 'B1', ... shard 11 = 'C0' ... shard 20 = 'C9'
  // TODO(liayoo): Improve the prefixing rule to support shards of index > 20.
  const prefix = (index < 11 ? 'B' : 'C') + (index - 1) % 10;
  const accounts = createAccounts(num, prefix);
  const accountsFile = path.join(shardDir, 'genesis_accounts.json');
  writeFile(JSON.stringify(accounts, null, 2), accountsFile);

  // genesis_sharding.json
  const shardingConfig = getShardingConfig(env, index);
  const configFile = path.join(shardDir, 'genesis_sharding.json');
  writeFile(JSON.stringify(shardingConfig, null, 2), configFile);

  // genesis_token.json
  const shardingToken = getShardingToken(prefix);
  const tokenFile = path.join(shardDir, 'genesis_token.json');
  writeFile(JSON.stringify(shardingToken, null, 2), tokenFile);
}

function usage() {
  console.log('\nExample commandlines:\n  node generateShardGenesisFiles.js dev 10 1\n');
  process.exit(0);
}

processArguments();
