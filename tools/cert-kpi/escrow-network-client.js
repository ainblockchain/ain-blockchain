const assert = require('assert/strict');
const fs = require('fs');
const index = Number(process.env.NODE_INDEX);
assert.ok(Number.isSafeInteger(index) && index >= 0 && index < 10);
assert.equal(process.env.BLOCKCHAIN_CONFIGS_DIR, '/network');
const accounts = JSON.parse(fs.readFileSync('/network/genesis_accounts.json', 'utf8'));
process.env.UNSAFE_PRIVATE_KEY = accounts.others[index].private_key;
require('/app/ain-blockchain/client/index.js');
