const fs = require('node:fs');
const path = require('node:path');
const { resolveSeeds } = require('./resolve-seeds');

const directory = process.env.BLOCKCHAIN_CONFIGS_DIR;
const index = Number(process.env.NODE_INDEX);
const accounts = JSON.parse(fs.readFileSync(path.join(directory, 'genesis_accounts.json')));
const params = JSON.parse(fs.readFileSync(path.join(directory, 'blockchain_params.json')));
const validators = Object.keys(params.consensus.genesis_validators);
if (!Number.isInteger(index) || index < 0 || index >= validators.length || accounts.others[index].address !== validators[index]) {
  throw new Error('NODE_INDEX must select a matching genesis validator');
}
process.env.UNSAFE_PRIVATE_KEY = accounts.others[index].private_key;
resolveSeeds(process.env).then(() => {
  console.log(JSON.stringify({ stage: 'resolved-peer-endpoints', seed: process.env.PEER_CANDIDATE_JSON_RPC_URL, tracker: process.env.TRACKER_UPDATE_JSON_RPC_URL }));
  require('/app/ain-blockchain/client/index.js');
}).catch(error => { console.error(error.message); process.exitCode = 1; });
