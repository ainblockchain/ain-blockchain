const assert = require('assert/strict');
const rimraf = require('rimraf');
const BlockPool = require('../../block-pool');
const BlockchainNode = require('../../node');
const Consensus = require('../../consensus');
const Transaction = require('../../tx-pool/transaction');
const RuleUtil = require('../../db/rule-util');
const PathUtil = require('../../common/path-util');
const { NodeConfigs } = require('../../common/constants');
const { ValidatorOffenseTypes, ConsensusConsts } = require('../../consensus/constants');
const { Block } = require('../../blockchain/block');
const { setNodeForTesting } = require('../test-util');
const genesisAccounts = require('../../blockchain-configs/base/genesis_accounts.json');
const accounts = genesisAccounts.others.slice(0, 3);

describe('BlockPool evidence checkpoints with native DB execution', () => {
  let node;
  let validators;
  let candidates;
  const blockNumber = 10;
  const blockTime = 1789125450000;

  beforeEach(async () => {
    assert.equal(NodeConfigs.ENABLE_TX_SIG_VERIF_WORKAROUND, false);
    rimraf.sync(NodeConfigs.CHAINS_DIR);
    node = new BlockchainNode();
    await setNodeForTesting(node, 0, true);
    let fixtureTimestamp = blockTime - 20000;
    const setup = (account, ref, value) => {
      const transaction = Transaction.fromTxBody({ operation: { type: 'SET_VALUE', ref, value },
        timestamp: fixtureTimestamp++, gas_price: 0, nonce: -1 }, account.private_key, 0);
      assert.equal(Transaction.verifyTransaction(transaction, 0), true);
      assert.equal(node.db.executeTransaction(
          transaction, true, true, 1, blockTime - 10000).code, 0);
    };
    for (const account of accounts) {
      setup(genesisAccounts.owner, `/consensus/validator_whitelist/${account.address}`, true);
      const balance = new RuleUtil().getConsensusStakeBalance(
          account.address, (ref) => node.db.getValue(ref));
      if (balance === 0) {
        const stake = node.getBlockchainParam('consensus/min_stake_for_proposer');
        setup(genesisAccounts.owner,
            `/transfer/${genesisAccounts.owner.address}/${account.address}/evidence-fixture/value`,
            stake);
        setup(account, PathUtil.getStakingStakeRecordValuePath(
            'consensus', account.address, 0, 'evidence-fixture'), stake);
      }
    }
    validators = Object.fromEntries(accounts.map((account) => [account.address, {
      stake: new RuleUtil().getConsensusStakeBalance(
          account.address, (ref) => node.db.getValue(ref)),
      proposal_right: true,
    }]));
    assert.ok(Object.values(validators).every((validator) => validator.stake > 0));
    candidates = Array.from({ length: 4 }, (_, index) => {
      const block = Block.create(node.bc.lastBlock().hash, [], {}, [], [], index + 1,
          index + 1, node.db.getProofHash('/'), accounts[index % accounts.length].address,
          validators, 0, 0, blockTime - 10000 + index);
      const proposal = Transaction.fromTxBody({ operation: { type: 'SET_VALUE',
        ref: `/consensus/number/${block.number}/propose`, value: {
          number: block.number, block_hash: block.hash, proposer: block.proposer, gas_cost_total: 0,
        } }, timestamp: blockTime - 5000 + index, gas_price: 0, nonce: -1 },
      accounts[index % accounts.length].private_key, 0);
      const votes = accounts.map((account, accountIndex) => {
        const transaction = Transaction.fromTxBody({ operation: { type: 'SET_VALUE',
          ref: `/consensus/number/${block.number}/${block.hash}/vote/${account.address}`,
          value: { block_hash: block.hash, stake: validators[account.address].stake,
            is_against: true, offense_type: ValidatorOffenseTypes.INVALID_PROPOSAL,
            vote_nonce: blockTime - 1000 + index * 10 + accountIndex } },
        timestamp: blockTime - 1000 + index * 10 + accountIndex, gas_price: 0, nonce: -1 },
        account.private_key, 0);
        assert.equal(Transaction.verifyTransaction(transaction, 0), true);
        return Transaction.toJsObject(transaction);
      });
      return { block, proposal: Transaction.toJsObject(proposal), votes };
    });
  });

  afterEach(() => rimraf.sync(NodeConfigs.CHAINS_DIR));

  function execute(order) {
    const pool = new BlockPool(node);
    for (const [index, count] of order) {
      const candidate = candidates[index];
      pool.hashToInvalidBlockInfo.set(candidate.block.hash, {
        ...candidate, votes: candidate.votes.slice(0, count),
      });
    }
    const base = node.createTempDb(node.db.stateVersion, 'evidence-create', blockNumber - 1);
    const replay = node.createTempDb(node.db.stateVersion, 'evidence-validate', blockNumber - 1);
    const versionsBefore = node.stateManager.numVersions();
    const result = pool.getOffensesAndEvidence(
        validators, new Set(), blockNumber, blockTime, base, null);
    const majority = Object.values(validators).reduce((sum, validator) =>
      sum + validator.stake, 0) * ConsensusConsts.MAJORITY;
    Consensus.validateAndExecuteOffensesAndEvidence(result.evidence, validators, majority,
        blockNumber, blockTime, null, replay, null);
    assert.equal(node.stateManager.numVersions(), versionsBefore,
        'checkpoint versions must be released');
    return { result, base, replay };
  }

  for (const [label, order] of [
    ['quorum followed by minority', [[0, 3], [1, 1]]],
    ['two quorums followed by minority', [[0, 3], [1, 3], [2, 1]]],
    ['minority, quorum, minority', [[0, 1], [1, 3], [2, 1]]],
    ['quorum, minority, quorum', [[0, 3], [1, 1], [2, 3]]],
    ['only quorum', [[0, 3]]],
    ['only minorities', [[0, 1], [1, 1]]],
  ]) {
    it(`${label}: creator state equals independent evidence replay`, () => {
      const { result, base, replay } = execute(order);
      try {
        assert.equal(Object.values(result.evidence).flat().length,
            order.filter(([, count]) => count === 3).length);
        assert.equal(base.getProofHash('/'), replay.getProofHash('/'),
            'proposal and validator DB state proofs must match');
        for (const [index, count] of order) {
          for (const vote of candidates[index].votes) {
            assert.deepEqual(base.getValue(vote.tx_body.operation.ref),
                count === 3 ? vote.tx_body.operation.value : null);
          }
        }
      } finally {
 base.destroyDb(); replay.destroyDb();
}
    });
  }

  it('changing candidate order does not erase accepted evidence', () => {
    const first = execute([[0, 3], [1, 1]]);
    const second = execute([[1, 1], [0, 3]]);
    try {
      assert.deepEqual(first.result, second.result);
      assert.equal(first.base.getProofHash('/'), second.base.getProofHash('/'));
    } finally {
      first.base.destroyDb(); first.replay.destroyDb();
      second.base.destroyDb(); second.replay.destroyDb();
    }
  });
});
