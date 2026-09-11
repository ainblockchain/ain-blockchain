const assert = require('assert/strict');
const fs = require('fs');
const crypto = require('crypto');
const { Block } = require('../../blockchain/block');
const ConsensusUtil = require('../../consensus/consensus-util');
const { NodeConfigs } = require('../../common/constants');
const { ConsensusConsts } = require('../../consensus/constants');
const { verifySignedTransaction, verifyBlockTransactions } = require('./audit-ledger');

function verify(capture, plan) {
  assert.equal(NodeConfigs.ENABLE_TX_SIG_VERIF_WORKAROUND, false);
  assert.equal(capture.finalized.number, plan.snapshotNumber);
  assert.equal(capture.finalized.hash, plan.originalFinalHash);
  assert.ok(Block.validateHashes(capture.finalized));
  assert.ok(capture.pendingChain.length > 0 && capture.pendingChain.length <= 100);
  const cache = new Set();
  let previous = capture.finalized;
  const records = [];
  for (const entry of capture.pendingChain) {
    const { block, proposal, votes } = entry;
    assert.equal(entry.notarized, true);
    assert.equal(block.number, previous.number + 1);
    assert.equal(block.last_hash, previous.hash);
    assert.ok(Block.validateHashes(block));
    verifyBlockTransactions(block, 0, cache);
    verifySignedTransaction(proposal, 0, cache);
    assert.equal(proposal.tx_body.nonce, -1);
    assert.equal(ConsensusUtil.isProposalTx(proposal), true);
    assert.equal(ConsensusUtil.getBlockHashFromConsensusTx(proposal), block.hash);
    assert.equal(Number(ConsensusUtil.getBlockNumberFromConsensusTx(proposal)), block.number);
    assert.equal(proposal.address, block.proposer);
    assert.deepEqual(proposal.tx_body.operation.op_list[0].value.validators, block.validators);
    const voters = new Set();
    let stake = 0;
    for (const vote of votes) {
      verifySignedTransaction(vote, 0, cache);
      assert.equal(vote.tx_body.nonce, -1);
      assert.equal(vote.tx_body.operation.type, 'SET_VALUE');
      assert.equal(vote.tx_body.operation.ref,
          `/consensus/number/${block.number}/${block.hash}/vote/${vote.address}`);
      assert.equal(ConsensusUtil.getBlockHashFromConsensusTx(vote), block.hash);
      assert.equal(ConsensusUtil.isAgainstVoteTx(vote), false);
      assert.equal(ConsensusUtil.getStakeFromVoteTx(vote), block.validators[vote.address]?.stake);
      if (!voters.has(vote.address)) stake += block.validators[vote.address].stake;
      voters.add(vote.address);
    }
    const totalStake = ConsensusUtil.getTotalAtStake(block.validators);
    assert.ok(totalStake > 0 && stake >= totalStake * ConsensusConsts.MAJORITY);
    records.push({ number: block.number, hash: block.hash, uniqueVoters: voters.size,
      stake, totalStake });
    previous = block;
  }
  assert.deepEqual(capture.tips, [previous.hash]);
  return { pass: true, signatureBypass: false, captureAt: capture.at, address: capture.address,
    finalizedNumber: capture.finalized.number, finalizedHash: capture.finalized.hash,
    lastNumber: previous.number, lastHash: previous.hash, signatureChecks: cache.size, records,
    scope: 'preserved pending-chain hashes, linkage, signatures and deduplicated voting stake; ' +
      'not DB replay, fresh finality or a new consensus decision' };
}

if (require.main === module) {
  try {
    const [, , capturePath, planPath, output] = process.argv;
    const bytes = fs.readFileSync(capturePath);
    const result = verify(JSON.parse(bytes), JSON.parse(fs.readFileSync(planPath)));
    result.captureSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ output, pass: true, blocks: result.records.length,
      signatureChecks: result.signatureChecks, lastNumber: result.lastNumber }));
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}

module.exports = { verify };
