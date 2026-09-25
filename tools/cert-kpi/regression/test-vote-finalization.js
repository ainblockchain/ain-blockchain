const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[2], 'utf8');
const method = source.slice(source.indexOf('  checkVoteTx(voteTx) {'), source.indexOf('\n  tryPropose() {'));
const pending = [];
let invalid = false, failedExecution = false, finalized = 0, accepted = 0;
const C = vm.runInNewContext(`(class { ${method} })`, {
  setImmediate: fn => pending.push(fn),
  ConsensusUtil: { isValidConsensusTx: () => !invalid, getBlockHashFromConsensusTx: () => 'hash', isAgainstVoteTx: () => false, getTimestampFromVoteTx: () => 1 },
  Transaction: { toExecutable: tx => tx }, StateVersions: { SNAP: 'SNAP' },
  CommonUtil: { isFailedTx: () => failedExecution }, logger: { error() {}, info() {} },
});
const c = new C();
c.epochTransitionGeneration = Symbol();
c.getSnapDb = () => ({ stateVersion: 'snapshot' });
c.node = { bp: { hashToBlockInfo: new Map([['hash', { block: { timestamp: 0, number: 4 } }]]), addSeenVote() { accepted++; } },
  getBlockchainParam: () => 1, createTempDb: () => ({ executeTransaction() {}, destroyDb() {} }), tp: { addTransaction() {} },
  tryFinalizeChain() { finalized++; } };
invalid = true; assert.equal(c.checkVoteTx({}), false); assert.equal(pending.length, 0);
invalid = false; failedExecution = true; assert.equal(c.checkVoteTx({}), false); assert.equal(pending.length, 0);
failedExecution = false;
assert.equal(c.checkVoteTx({}), true); assert.equal(c.checkVoteTx({}), true);
assert.equal(accepted, 2); assert.equal(finalized, 0); assert.equal(pending.length, 1);
pending.shift()(); assert.equal(finalized, 1);
c.checkVoteTx({}); c.epochTransitionGeneration = null; pending.shift()(); assert.equal(finalized, 1);
c.epochTransitionGeneration = Symbol(); c.checkVoteTx({}); pending.shift()(); assert.equal(finalized, 2);
console.log('PASS: rejected votes excluded, deferred and coalesced finality check, stopped generation ignored');
