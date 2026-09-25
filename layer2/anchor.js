'use strict';

const crypto = require('crypto');
const ainUtil = require('@ainblockchain/ain-util');
const HASH = /^0x[a-f0-9]{64}$/;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// Operator-attested checkpoints. These are not validity proofs and must never
// be presented as trustless settlement. The native consensus policy validates these before recording a checkpoint.
function statement(input) {
  if (!input || input.version !== 1 || !Number.isSafeInteger(input.chain_id) || input.chain_id < 0 ||
      !Number.isSafeInteger(input.parent_chain_id) || input.parent_chain_id < 0 ||
      input.chain_id === input.parent_chain_id || !Number.isSafeInteger(input.height) || input.height < 0 ||
      !Number.isSafeInteger(input.timestamp) || input.timestamp < 0 ||
      !['genesis_hash', 'block_hash', 'state_root', 'transaction_root', 'previous_anchor'].every(key => HASH.test(input[key]))) {
    throw Error('Invalid checkpoint statement');
  }
  const canonical = {
    version: 1, chain_id: input.chain_id, parent_chain_id: input.parent_chain_id,
    genesis_hash: input.genesis_hash, height: input.height, block_hash: input.block_hash,
    state_root: input.state_root, transaction_root: input.transaction_root,
    previous_anchor: input.previous_anchor, timestamp: input.timestamp,
  };
  if (Object.keys(input).some(key => !Object.prototype.hasOwnProperty.call(canonical, key))) {
    throw Error('Unknown checkpoint field');
  }
  return canonical;
}

function statementHash(input) {
  return '0x' + crypto.createHash('sha256').update('AIN_OPERATOR_L2_CHECKPOINT_V1\n')
    .update(JSON.stringify(statement(input))).digest('hex');
}

function attestationBody(input) {
  const value = statement(input);
  return { operation: { type: 'SET_VALUE', ref: `/layer2/attestations/${value.genesis_hash}/${value.height}`, value },
    nonce: -1, timestamp: value.timestamp };
}

function verifyCertificate(certificate, configuration, previous = null) {
  if (!certificate || !Array.isArray(certificate.signatures)) throw Error('Checkpoint certificate required');
  const value = statement(certificate.statement);
  if (value.chain_id !== configuration.chainId || value.parent_chain_id !== configuration.parentChainId ||
      value.genesis_hash !== configuration.genesisHash) throw Error('Checkpoint domain mismatch');
  const validators = Array.isArray(configuration.validators) ? configuration.validators :
    Object.values(configuration.validators || {});
  if (!Array.isArray(validators) || validators.length !== 5 || validators.some(addr => !ADDRESS.test(addr)) ||
      new Set(validators.map(addr => addr.toLowerCase())).size !== 5 || configuration.threshold !== 4) {
    throw Error('A five-validator, four-signature committee is required');
  }
  const previousHash = previous ? statementHash(previous) : '0x' + '0'.repeat(64);
  if (previous && (previous.chain_id !== value.chain_id || previous.genesis_hash !== value.genesis_hash ||
      value.height <= previous.height || value.timestamp < previous.timestamp)) throw Error('Checkpoint does not advance');
  if (value.previous_anchor !== previousHash) throw Error('Checkpoint ancestry mismatch');
  if (certificate.signatures.length < 4 || certificate.signatures.length > 5) throw Error('Checkpoint quorum missing');
  const allowed = new Set(validators.map(addr => addr.toLowerCase()));
  const seen = new Set();
  const body = attestationBody(value);
  for (const vote of certificate.signatures) {
    if (!vote || typeof vote.address !== 'string' || !allowed.has(vote.address.toLowerCase()) ||
        seen.has(vote.address.toLowerCase()) || typeof vote.signature !== 'string') throw Error('Invalid or duplicate signer');
    let valid = false;
    try { valid = ainUtil.ecVerifySig(body, vote.signature, vote.address, configuration.parentChainId); } catch {}
    if (!valid) throw Error('Invalid checkpoint signature');
    seen.add(vote.address.toLowerCase());
  }
  return { statement: value, hash: statementHash(value), signers: [...seen], trust_model: 'operator-validated' };
}

module.exports = { statement, statementHash, attestationBody, verifyCertificate };
