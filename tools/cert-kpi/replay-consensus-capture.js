const assert = require('assert/strict');
const fs = require('fs');
const crypto = require('crypto');
const BlockchainNode = require('../../node');
const Consensus = require('../../consensus');
const ConsensusUtil = require('../../consensus/consensus-util');
const CommonUtil = require('../../common/common-util');
const Transaction = require('../../tx-pool/transaction');
const { NodeConfigs } = require('../../common/constants');
const { ConsensusConsts } = require('../../consensus/constants');

function main() {
  const [input, output] = process.argv.slice(2);
  assert.ok(input && output && !fs.existsSync(output), 'pass a capture and new summary file');
  assert.ok(NodeConfigs.CHAINS_DIR.startsWith('/tmp/'), 'replay requires disposable storage');
  assert.equal(NodeConfigs.ENABLE_TX_SIG_VERIF_WORKAROUND, false);
  const bytes = fs.readFileSync(input);
  const capture = JSON.parse(bytes);
  const { block, proposal, previous } = capture;
  assert.equal(block.last_hash, previous.block.hash);
  assert.equal(previous.root_proof_hash, previous.block.state_proof_hash);
  const node = new BlockchainNode({ address: block.proposer });
  node.db.initDb(previous);
  node.bc.addBlockToChain(previous.block);
  assert.equal(node.db.getProofHash('/'), previous.root_proof_hash);
  const previousProposal = ConsensusUtil.filterProposalFromVotes(block.last_votes);
  node.bp.hashToBlockInfo.set(previous.block.hash, {
    block: previous.block, proposal: previousProposal, notarized: true,
    votes: block.last_votes.filter((vote) => vote.hash !== previousProposal.hash),
  });
  for (const evidence of Object.values(block.evidence).flat()) {
    node.bp.hashToInvalidBlockInfo.set(evidence.block.hash, {
      block: evidence.block, proposal: evidence.transactions[0], votes: evidence.votes,
    });
  }
  const majority = ConsensusUtil.getTotalAtStake(previous.block.validators) *
    ConsensusConsts.MAJORITY;
  const includedHashes = new Set(Object.values(block.evidence).flat().map((item) =>
    item.block.hash));
  const minority = capture.earlierCandidates?.find((candidate) => candidate.votes.length &&
    !includedHashes.has(candidate.block.hash) && candidate.votes.reduce((total, vote) =>
      total + (block.validators[vote.address]?.stake || 0), 0) < majority);
  const signedTransactions = [proposal, ...block.last_votes, ...block.transactions,
    ...Object.values(block.evidence).flat().flatMap((item) =>
      [...item.transactions, ...item.votes]),
    ...(minority ? [minority.proposal, ...minority.votes] : [])];
  const uniqueTransactions = [...new Map(signedTransactions.map((item) =>
    [item.hash, item])).values()];
  const chainId = node.getBlockchainParam('genesis/chain_id');
  for (const transaction of uniqueTransactions) {
    const executable = Transaction.toExecutable(transaction, chainId);
    assert.equal(Transaction.verifyTransaction(executable, chainId),
        true, `signature verification failed: ${transaction.hash}`);
  }
  const results = [];
  const modes = ['validator', 'creator-evidence-only'];
  if (minority) modes.push('creator-quorum-then-minority');
  for (const mode of modes) {
    if (mode === 'creator-quorum-then-minority') {
      node.bp.hashToInvalidBlockInfo.set(minority.block.hash, minority);
    }
    const database = node.createTempDb(node.db.stateVersion, `offline-${mode}`,
        mode === 'validator' ? block.number : previous.block.number - 1);
    const steps = [];
    const transactions = [];
    let phase = 'initial';
    const execute = database.executeTransaction.bind(database);
    database.executeTransaction = (...args) => {
      const result = execute(...args);
      transactions.push({ phase, hash: args[0]?.hash, code: result?.code,
        failed: CommonUtil.isFailedTx(result),
        skipFees: args[1], restoreIfFails: args[2], result });
      return result;
    };
    const checkpoint = (name) => steps.push({ name, proof: database.getProofHash('/'),
      state: database.getStateInfo('/') });
    try {
      checkpoint(phase);
      phase = 'last-votes';
      if (mode === 'validator') {
        Consensus.validateAndExecuteLastVotes(block.last_votes, block.last_hash,
            block.number, block.timestamp, database, node.bp, null);
      } else {
        assert.deepEqual(node.bp.getValidLastVotes(previous.block, block.number,
            block.timestamp, database), block.last_votes);
      }
      checkpoint(phase);
      phase = 'evidence';
      if (mode === 'validator') {
        Consensus.validateAndExecuteOffensesAndEvidence(block.evidence, block.validators,
            majority, block.number, block.timestamp, proposal, database, null);
      } else {
        const generated = node.bp.getOffensesAndEvidence(block.validators, new Set(),
            block.number, block.timestamp, database, null);
        assert.deepEqual(generated.evidence, block.evidence);
      }
      checkpoint(phase);
      phase = 'transactions';
      Consensus.validateAndExecuteTransactions(block.transactions, block.receipts, block.number,
          block.timestamp, block.gas_amount_total, block.gas_cost_total, database, node, null);
      checkpoint(phase);
      database.applyBandagesForBlockNumber(block.number);
      checkpoint('bandages');
      results.push({ mode, steps, transactions, expected: block.state_proof_hash,
        matches: database.getProofHash('/') === block.state_proof_hash });
    } catch (error) {
      results.push({ mode, steps, transactions, failedPhase: phase, error: error.message });
    } finally {
 database.destroyDb();
}
  }
  const summary = { at: new Date().toISOString(),
    inputSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    scope: 'offline native DB replay; evidence-only and reconstructed quorum/minority order; ' +
      'not full live pool history or network recovery',
    signatureBypass: NodeConfigs.ENABLE_TX_SIG_VERIF_WORKAROUND,
    signaturesVerified: uniqueTransactions.length,
    minority: minority ? { hash: minority.block.hash, votes: minority.votes.length } : null,
    block: { number: block.number, hash: block.hash, timestamp: block.timestamp }, results };
  fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ output, results: results.map(({mode, matches, failedPhase}) =>
    ({ mode, matches, failedPhase })) }));
  if (results.some((result) => result.error)) process.exitCode = 1;
}

try {
 main();
} catch (error) {
 console.error(error.stack); process.exitCode = 1;
}
