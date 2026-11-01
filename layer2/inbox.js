'use strict';
const ain = require('@ainblockchain/ain-util');
const HASH = /^0x[a-f0-9]{64}$/;
const MARKER = /^0x4c31494e[a-f0-9]{56}$/;

function canonical(value) {
  if (!value || value.version !== 1 || !MARKER.test(value.marker) ||
      !['parent_genesis', 'parent_block_hash', 'parent_tx_hash', 'inner_hash'].every(k => HASH.test(value[k])) ||
      !['parent_chain_id', 'child_chain_id', 'parent_height', 'timestamp'].every(k => Number.isSafeInteger(value[k]) && value[k] >= 0) ||
      value.parent_chain_id === value.child_chain_id) throw Error('Invalid inbox attestation');
  const result = { version: 1, marker: value.marker, parent_chain_id: value.parent_chain_id,
    child_chain_id: value.child_chain_id, parent_genesis: value.parent_genesis,
    parent_height: value.parent_height, parent_block_hash: value.parent_block_hash,
    parent_tx_hash: value.parent_tx_hash, inner_hash: value.inner_hash, timestamp: value.timestamp };
  if (Object.keys(value).some(k => !Object.hasOwn(result, k))) throw Error('Unknown inbox field');
  return result;
}

function body(value) {
  const statement = canonical(value);
  return { operation: { type: 'SET_VALUE', ref: '/layer2/inbox-attestations/' + statement.marker, value: statement },
    timestamp: statement.timestamp, nonce: -1 };
}

function verify(certificate, config) {
  if (!certificate || !Array.isArray(certificate.signatures)) throw Error('Inbox certificate required');
  const value = canonical(certificate.statement);
  if (value.parent_chain_id !== config.parentChainId || value.child_chain_id !== require('./domain').executionChainId(config) ||
      value.parent_genesis !== config.parentGenesisHash) throw Error('Inbox domain mismatch');
  const validators = Array.isArray(config.parentValidators) ? config.parentValidators : Object.values(config.parentValidators || {});
  if (validators.length !== 5 || validators.some(a => typeof a !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(a)) ||
      new Set(validators.map(a => a.toLowerCase())).size !== 5) throw Error('Invalid parent committee');
  if (certificate.signatures.length < 4 || certificate.signatures.length > 5) throw Error('Inbox quorum missing');
  const allowed = new Set(validators.map(a => a.toLowerCase())), seen = new Set();
  for (const vote of certificate.signatures) {
    if (!vote || typeof vote.address !== 'string' || !allowed.has(vote.address.toLowerCase()) || seen.has(vote.address.toLowerCase())) {
      throw Error('Invalid inbox signer');
    }
    let valid = false;
    try { valid = ain.ecVerifySig(body(value), vote.signature, vote.address, require('./domain').executionChainId(config)); } catch {}
    if (!valid) throw Error('Invalid inbox signature');
    seen.add(vote.address.toLowerCase());
  }
  return value;
}
module.exports = { MARKER, canonical, body, verify };
