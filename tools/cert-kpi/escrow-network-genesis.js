const assert = require('assert/strict');
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { parameters, timerFlags } = require('./escrow-network-config');
const ainUtil = require('/app/ain-blockchain/node_modules/@ainblockchain/ain-util');
const root = '/app/ain-blockchain';
const read = (filename) => JSON.parse(fs.readFileSync(filename, 'utf8'));
const write = (filename, value) => fs.writeFileSync(filename,
    JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
fs.mkdirSync('/private/config', { mode: 0o700 });
const accounts = { owner: ainUtil.createAccount(),
  others: Array.from({ length: 20 }, () => ({ ...ainUtil.createAccount(), balance: 2000000 })) };
write('/private/config/genesis_accounts.json', accounts);
const template = read(`${root}/blockchain-configs/3-nodes/blockchain_params.json`);
write('/private/config/blockchain_params.json', parameters(template, accounts, Date.now()));
const flags = timerFlags(read(`${root}/blockchain-configs/base/timer_flags.json`));
write('/private/config/timer_flags.json', flags);
execFileSync('node', ['tools/genesis-file/createGenesisBlock.js'], {
  cwd: root, stdio: 'inherit', env: { ...process.env,
    BLOCKCHAIN_CONFIGS_DIR: '/private/config', BLOCKCHAIN_DATA_DIR: '/tmp/genesis' },
});
const genesisBytes = fs.readFileSync('/private/config/genesis_block.json.gz');
const genesis = JSON.parse(zlib.gunzipSync(genesisBytes));
assert.equal(genesis.number, 0);
assert.equal(Object.keys(genesis.validators).length, 10);
const hashes = {};
for (const name of fs.readdirSync('/private/config')) {
  fs.chmodSync(`/private/config/${name}`, 0o600);
  hashes[name] = crypto.createHash('sha256')
    .update(fs.readFileSync(`/private/config/${name}`)).digest('hex');
}
const runtimeHashes = {};
const directories = ['client', 'common', 'p2p', 'node', 'consensus', 'db', 'blockchain',
  'block-pool', 'tx-pool', 'json_rpc', 'event-handler', 'logger'];
for (const directory of directories) {
  function visit(relative) {
    for (const item of fs.readdirSync(`${root}/${relative}`, { withFileTypes: true })) {
      const name = `${relative}/${item.name}`;
      if (item.isDirectory()) visit(name);
      else if (item.isFile()) {
        runtimeHashes[name] = crypto.createHash('sha256')
          .update(fs.readFileSync(`${root}/${name}`)).digest('hex');
      }
    }
  }
  visit(directory);
}
write('/evidence/network-genesis.json', { at: new Date().toISOString(), genesisHash: genesis.hash,
  clientHash: crypto.createHash('sha256')
    .update(fs.readFileSync('/experiment/escrow-network-client.js')).digest('hex'),
  validators: accounts.others.slice(0, 10).map((account) => account.address),
  owner: accounts.owner.address,
  activationBlock: flags.native_escrow_micro_units.enabled_block,
  configHashes: hashes, runtimeHashes,
  scope: 'separate fresh ten-validator native chain; ' +
    'original failed channel and all existing volumes unchanged' });
