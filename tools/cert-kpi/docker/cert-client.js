const path = require('path');
const nodeIndex = Number(process.env.NODE_INDEX);
if (!Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex > 9) throw new Error('NODE_INDEX must be 0..9');
const root = '/app/ain-blockchain';
const accounts = require(path.join(root, 'blockchain-configs/base/genesis_accounts.json'));
process.env.UNSAFE_PRIVATE_KEY = accounts.others[nodeIndex].private_key;
require(path.join(root, 'client/index.js'));
