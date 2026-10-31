const assert = require('assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const rimraf = require('rimraf');
const IdlePolicy = require('../../consensus/idle-policy');
const Consensus = require('../../consensus');
const Functions = require('../../db/functions');
const BlockchainNode = require('../../node');
const { NodeConfigs, TimerFlags } = require('../../common/constants');
const { ConsensusErrorCode } = require('../../common/result-code');
const { setNodeForTesting, getTransaction } = require('../test-util');

const { IdleProposalReasons: R } = IdlePolicy;
const ADDR = '0x00ADEc28B6a845a085e03591bE7550dd68673C1C';

const finalized = { number: 10, epoch: 100, hash: '0xf' };
const empty = (epoch, extra = {}) => ({ number: 11, epoch, hash: `0x${epoch}`, last_hash: '0xf',
  transactions: [], evidence: {}, ...extra });

describe('Idle proposal policy', () => {
  describe('isChainSettled', () => {
    it('is settled when everything is final', () => {
      assert.equal(IdlePolicy.isChainSettled([], finalized), true);
    });
    it('is settled with only the empty block that completed the finalizing run', () => {
      assert.equal(IdlePolicy.isChainSettled([empty(101)], finalized), true);
    });
    it('is not settled when the tip carries transactions or evidence', () => {
      assert.equal(IdlePolicy.isChainSettled([empty(101, { transactions: [{}] })], finalized), false);
      assert.equal(IdlePolicy.isChainSettled([empty(101, { evidence: { a: [] } })], finalized), false);
    });
    it('is not settled when more than the tip is unfinalized', () => {
      assert.equal(IdlePolicy.isChainSettled([empty(101), empty(102)], finalized), false);
    });
    it('is not settled after a lone (heartbeat) block that cannot finalize anything yet', () => {
      assert.equal(IdlePolicy.isChainSettled([empty(150)], finalized), false);
      assert.equal(IdlePolicy.isChainSettled([empty(101, { last_hash: '0xother' })], finalized), false);
    });
    it('fails safe (not settled) on missing information', () => {
      assert.equal(IdlePolicy.isChainSettled(undefined, finalized), false);
      assert.equal(IdlePolicy.isChainSettled([], null), false);
      assert.equal(IdlePolicy.isChainSettled({ chain: [] }, finalized), false);
    });
  });

  describe('decideIdleProposal', () => {
    const base = { enabled: true, heartbeatMs: 600000, now: 1000000, tipTimestamp: 999000,
      settled: true, hasPendingTxs: false };
    it('always proposes when disabled (pre-existing behavior)', () => {
      assert.deepEqual(IdlePolicy.decideIdleProposal({ ...base, enabled: false }),
          { propose: true, reason: R.DISABLED });
    });
    it('proposes while the chain is unsettled, even with an empty pool', () => {
      assert.equal(IdlePolicy.decideIdleProposal({ ...base, settled: false }).reason, R.UNSETTLED);
    });
    it('proposes when the pool has work', () => {
      assert.equal(IdlePolicy.decideIdleProposal({ ...base, hasPendingTxs: true }).reason, R.PENDING_TXS);
    });
    it('skips when settled, idle and within the heartbeat interval', () => {
      assert.deepEqual(IdlePolicy.decideIdleProposal(base), { propose: false, reason: R.IDLE });
    });
    it('proposes a heartbeat once the tip is a heartbeat interval old', () => {
      assert.equal(IdlePolicy.decideIdleProposal({ ...base, tipTimestamp: 400000 }).reason, R.HEARTBEAT);
      assert.equal(IdlePolicy.decideIdleProposal({ ...base, tipTimestamp: 400001 }).reason, R.IDLE);
      assert.equal(IdlePolicy.decideIdleProposal({ ...base, tipTimestamp: NaN }).reason, R.HEARTBEAT);
    });
  });

  it('drops a pending-tx proposal only if it would be an empty block', () => {
    const pending = { propose: true, reason: R.PENDING_TXS };
    assert.equal(IdlePolicy.shouldBroadcastProposal(pending, empty(101)), false);
    assert.equal(IdlePolicy.shouldBroadcastProposal(pending, empty(101, { transactions: [{}] })), true);
    for (const reason of [R.DISABLED, R.UNSETTLED, R.HEARTBEAT]) {
      assert.equal(IdlePolicy.shouldBroadcastProposal({ propose: true, reason }, empty(101)), true);
    }
  });

  it('reads config with a safe heartbeat', () => {
    assert.deepEqual(IdlePolicy.getIdleProposalConfig({}, 2000),
        { enabled: false, heartbeatMs: 600000 });
    assert.deepEqual(IdlePolicy.getIdleProposalConfig(
        { IDLE_BLOCK_PROPOSAL_SKIP: true, IDLE_HEARTBEAT_INTERVAL_MS: 60000 }, 2000),
        { enabled: true, heartbeatMs: 60000 });
    assert.equal(IdlePolicy.getIdleProposalConfig(
        { IDLE_BLOCK_PROPOSAL_SKIP: 'true', IDLE_HEARTBEAT_INTERVAL_MS: 0 }, 2000).heartbeatMs, 600000);
    assert.equal(IdlePolicy.getIdleProposalConfig(
        { IDLE_BLOCK_PROPOSAL_SKIP: true, IDLE_HEARTBEAT_INTERVAL_MS: 5 }, 2000).heartbeatMs, 2000);
  });

  describe('consensus health with idle blocks', () => {
    const on = { enabled: true, heartbeatMs: 600000 };  // 300 epochs of 2 s
    const fin = { number: 10, epoch: 1000, hash: '0xf' };
    const tip = empty(1001);
    const check = (currentEpoch, unfinalizedChain, idleConfig = on) =>
      IdlePolicy.isConsensusHealthyWithIdle({ currentEpoch, lastFinalizedBlock: fin, unfinalizedChain,
        thresholdEpochs: 10, epochMs: 2000, idleConfig });
    it('keeps the original rule for a recent finalized block or when disabled', () => {
      assert.equal(check(1009, []), true);
      assert.equal(check(1010, [], { ...on, enabled: false }), false);
      assert.equal(check(1009, null, { ...on, enabled: false }), true);
    });
    it('a settled chain is healthy until its heartbeat is overdue', () => {
      assert.equal(check(1300, [tip]), true);
      assert.equal(check(1310, [tip]), true);
      assert.equal(check(1311, [tip]), false);
      assert.equal(check(1309, []), true);
      assert.equal(check(1310, []), false);
    });
    it('an unsettled chain is judged by its oldest block that still needs finality', () => {
      const heartbeat = { ...empty(1290), number: 12, last_hash: tip.hash };
      assert.equal(check(1295, [tip, heartbeat]), true);
      assert.equal(check(1300, [tip, heartbeat]), false);
      const txTip = empty(1001, { transactions: [{}] });
      assert.equal(check(1010, [txTip]), true);
      assert.equal(check(1011, [txTip]), false);
    });
    it('fails safe on a missing chain view', () => {
      assert.equal(check(1100, null), false);
      assert.equal(IdlePolicy.isConsensusHealthyWithIdle({ currentEpoch: 1, lastFinalizedBlock: null }), false);
    });
  });
});

describe('Consensus.tryPropose with the idle policy', () => {
  function fakeConsensus({ enabled = true, chain = [empty(101)], pending = false, tipAgeMs = 1000,
    proposalTxs = [] } = {}) {
    const consensus = Object.create(Consensus.prototype);
    const tip = chain.length ? chain[chain.length - 1] : finalized;
    tip.timestamp = Date.now() - tipAgeMs;
    const sent = [];
    let created = 0;
    Object.assign(consensus, {
      epoch: 200, timeAdjustment: 0, proposer: ADDR, cache: {},
      node: {
        account: { address: ADDR },
        bc: { lastBlock: () => finalized },
        bp: { epochToBlock: new Map(), getExtendingChain: () => ({ chain }),
          getHeighestSeenBlockNumber: () => tip.number },
        tp: { hasNonConsensusTransactions: () => pending },
        getBlockchainParam: () => 2000,
      },
      getIdleProposalConfig: () => ({ enabled, heartbeatMs: 600000 }),
      getLastNotarizedBlock: () => tip,
      createProposal: () => {
        created++;
        return { proposalBlock: empty(201, { transactions: proposalTxs }), proposalTx: {} };
      },
      handleConsensusMessage: (msg) => sent.push(msg),
    });
    return { consensus, sent, created: () => created };
  }

  it('does not even build a proposal when settled, idle and before the heartbeat', () => {
    const f = fakeConsensus();
    f.consensus.tryPropose();
    assert.equal(f.created(), 0);
    assert.equal(f.sent.length, 0);
  });
  it('proposes while a tx block is not yet final', () => {
    const f = fakeConsensus({ chain: [empty(101, { transactions: [{}] })] });
    f.consensus.tryPropose();
    assert.equal(f.sent.length, 1);
  });
  it('proposes immediately when an includable tx arrives', () => {
    const f = fakeConsensus({ pending: true, proposalTxs: [{ hash: '0x1' }] });
    f.consensus.tryPropose();
    assert.equal(f.sent.length, 1);
  });
  it('drops the proposal if pending txs are not includable yet', () => {
    const f = fakeConsensus({ pending: true, proposalTxs: [] });
    f.consensus.tryPropose();
    assert.equal(f.created(), 1);
    assert.equal(f.sent.length, 0);
  });
  it('proposes a heartbeat', () => {
    const f = fakeConsensus({ tipAgeMs: 600000 });
    f.consensus.tryPropose();
    assert.equal(f.sent.length, 1);
  });
  it('proposes every epoch when the policy is disabled', () => {
    const f = fakeConsensus({ enabled: false });
    f.consensus.tryPropose();
    assert.equal(f.sent.length, 1);
  });
  it('keeps proposing while a block above the notarized tip has been seen', () => {
    const f = fakeConsensus();
    f.consensus.node.bp.getHeighestSeenBlockNumber = () => 12;
    f.consensus.tryPropose();
    assert.equal(f.sent.length, 1);
  });
  it('falls back to proposing if the chain view cannot be read', () => {
    const f = fakeConsensus();
    f.consensus.node.bp.getExtendingChain = () => { throw Error('broken'); };
    f.consensus.tryPropose();
    assert.equal(f.sent.length, 1);
  });
});

describe('Transaction pool work detection', () => {
  let node;
  beforeEach(async () => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);
    node = new BlockchainNode();
    await setNodeForTesting(node);
  });
  afterEach(() => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);
  });

  it('ignores consensus votes and proposals', () => {
    assert.equal(node.tp.hasNonConsensusTransactions(), false);
    const vote = getTransaction(node, { operation: { type: 'SET_VALUE',
      ref: '/consensus/number/1/0xabc/vote/' + node.account.address, value: {} }, nonce: -1, gas_price: 0 });
    const proposal = getTransaction(node, { operation: { type: 'SET', op_list: [{ type: 'SET_VALUE',
      ref: '/consensus/number/1/propose', value: {} }] }, nonce: -1, gas_price: 0 });
    node.tp.addTransaction(vote);
    node.tp.addTransaction(proposal);
    assert.equal(node.tp.getPoolSize(), 2);
    assert.equal(node.tp.hasNonConsensusTransactions(), false);
    node.tp.addTransaction(getTransaction(node, { operation: { type: 'SET_VALUE',
      ref: '/apps/test/value', value: 1 }, nonce: -1, gas_price: 1 }));
    assert.equal(node.tp.hasNonConsensusTransactions(), true);
  });
});

describe("Block reward for elapsed epochs ('reward_by_elapsed_epochs')", () => {
  afterEach(() => { delete TimerFlags.reward_by_elapsed_epochs; });

  it('credits the epochs elapsed since the previous block, within [1, one day]', () => {
    assert.equal(Functions.getCreditedRewardEpochs(101, 100, 2000), 1);
    assert.equal(Functions.getCreditedRewardEpochs(400, 100, 2000), 300);
    assert.equal(Functions.getCreditedRewardEpochs(100, 100, 2000), 1);
    assert.equal(Functions.getCreditedRewardEpochs(10 ** 9, 0, 2000), 43200);
    assert.equal(Functions.getCreditedRewardEpochs(undefined, 100, 2000), 1);
  });

  it('requires the proposal epoch to match the block epoch only once the flag is enabled', () => {
    const proposer = '0xabc';
    const validators = { [proposer]: { stake: 1, proposal_right: true } };
    const proposalTx = { address: proposer, tx_body: { operation: { type: 'SET', op_list: [{
      type: 'SET_VALUE', ref: '/consensus/number/5/propose',
      value: { block_hash: '0xh', validators, total_at_stake: 1, epoch: 99 } }] } } };
    const ConsensusUtil = require('../../consensus/consensus-util');
    const original = ConsensusUtil.isValidConsensusTx;
    ConsensusUtil.isValidConsensusTx = () => true;
    try {
      Consensus.validateProposalTx(proposalTx, proposer, validators, '0xh', 5, 100);
      TimerFlags.reward_by_elapsed_epochs = { enabled_block: 6, has_bandage: false };
      Consensus.validateProposalTx(proposalTx, proposer, validators, '0xh', 5, 100);
      assert.throws(() => Consensus.validateProposalTx(proposalTx, proposer, validators, '0xh', 6, 100),
          (err) => err.code === ConsensusErrorCode.INVALID_EPOCH);
      proposalTx.tx_body.operation.op_list[0].value.epoch = 100;
      Consensus.validateProposalTx(proposalTx, proposer, validators, '0xh', 6, 100);
    } finally {
      ConsensusUtil.isValidConsensusTx = original;
    }
  });
});

describe('Node params added after a network generated its own node_params.json', () => {
  it('get defaults and env overrides with a custom BLOCKCHAIN_CONFIGS_DIR', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-params-'));
    try {
      const base = JSON.parse(fs.readFileSync(
          path.resolve(__dirname, '../../blockchain-configs/base/node_params.json')));
      for (const key of ['BLOCK_HISTORY_RETENTION', 'IDLE_BLOCK_PROPOSAL_SKIP', 'IDLE_HEARTBEAT_INTERVAL_MS']) {
        delete base[key];
      }
      base.BLOCKCHAIN_DATA_DIR = path.join(dir, 'data');
      fs.writeFileSync(path.join(dir, 'node_params.json'), JSON.stringify(base));
      const script = 'const { NodeConfigs } = require("./common/constants");' +
          'console.log(JSON.stringify([NodeConfigs.BLOCK_HISTORY_RETENTION, ' +
          'NodeConfigs.IDLE_BLOCK_PROPOSAL_SKIP, NodeConfigs.IDLE_HEARTBEAT_INTERVAL_MS]));';
      const run = (env) => JSON.parse(execFileSync(process.execPath, ['-e', script], {
        cwd: path.resolve(__dirname, '../..'),
        env: { ...process.env, BLOCKCHAIN_CONFIGS_DIR: dir, ...env },
      }).toString().trim().split('\n').pop());
      assert.deepEqual(run({}), [0, false, 600000]);
      assert.deepEqual(run({ IDLE_BLOCK_PROPOSAL_SKIP: 'true', IDLE_HEARTBEAT_INTERVAL_MS: '120000',
        BLOCK_HISTORY_RETENTION: '20000' }), [20000, true, 120000]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
