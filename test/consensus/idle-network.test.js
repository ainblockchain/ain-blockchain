/**
 * In-process multi-validator network driving the real consensus code (proposal creation,
 * proposal/vote validation, notarization and finalization) epoch by epoch with a fake clock.
 *
 * Run with BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/3-nodes (see `npm run test_idle_consensus`).
 * Set OLD_CODE_DIR to a checkout of the previous release (with node_modules) to run the
 * "old" validators of the mixed-network test from that code instead of this code with the idle
 * policy disabled.
 */
const assert = require('assert/strict');
const path = require('path');
const rimraf = require('rimraf');
const _ = require('lodash');

const NEW_ROOT = path.resolve(__dirname, '../..');
const OLD_ROOT = process.env.OLD_CODE_DIR ? path.resolve(process.env.OLD_CODE_DIR) : null;

const EPOCH_MS = 1000;
const HEARTBEAT_MS = 30 * EPOCH_MS;
// A genesis account that is not a validator.
const RECEIVER_ADDR = '0x03AAb7b6f16A92A1dfe018Fe34ee420eb098B98A';

function loadCode(root) {
  return {
    root,
    constants: require(path.join(root, 'common/constants')),
    BlockchainNode: require(path.join(root, 'node')),
    Consensus: require(path.join(root, 'consensus')),
    testUtil: require(path.join(root, 'test/test-util')),
    ConsensusStates: require(path.join(root, 'consensus/constants')).ConsensusStates,
    PathUtil: require(path.join(root, 'common/path-util')),
  };
}

const NEW = loadCode(NEW_ROOT);
const { NodeConfigs, TimerFlags } = NEW.constants;

class IdleTestNetwork {
  /**
   * @param {Array<'new'|'old'>} kinds per validator: 'new' runs the idle policy.
   */
  constructor(kinds, clock) {
    this.kinds = kinds;
    this.clock = clock;
    this.validators = [];
    this.queue = [];
    this.offline = new Set();
    this.portBase = 19100 + Math.floor(Math.random() * 500) * 10;
  }

  async start() {
    for (let i = 0; i < this.kinds.length; i++) {
      const kind = this.kinds[i];
      const code = kind === 'old' && OLD_ROOT ? (this.oldCode || (this.oldCode = loadCode(OLD_ROOT))) : NEW;
      code.constants.NodeConfigs.PORT = this.portBase + i;
      const node = new code.BlockchainNode();
      await code.testUtil.setNodeForTesting(node, i, true);
      const server = {
        client: {
          broadcastConsensusMessage: (msg) => this.broadcast(i, msg),
          requestChainSegment: () => {},
          setIntervalForShardProofHashReports: () => {},
        },
        executeAndBroadcastTransaction: () => {},
        stop: () => {},
      };
      node.state = code.constants.BlockchainNodeStates.SERVING;
      const consensus = new code.Consensus(server, node);
      consensus.setState(code.ConsensusStates.RUNNING);
      if (kind === 'new') {
        consensus.getIdleProposalConfig = () => ({ enabled: true, heartbeatMs: HEARTBEAT_MS });
      } else if (code === NEW) {
        consensus.getIdleProposalConfig = () => ({ enabled: false, heartbeatMs: HEARTBEAT_MS });
      }
      this.validators.push({ kind, code, node, consensus });
    }
  }

  broadcast(from, msg) {
    if (this.offline.has(from)) return;
    for (let to = 0; to < this.validators.length; to++) {
      if (to !== from && !this.offline.has(to)) {
        this.queue.push({ to, msg: JSON.parse(JSON.stringify(msg)) });
      }
    }
  }

  drain() {
    while (this.queue.length) {
      const { to, msg } = this.queue.shift();
      if (!this.offline.has(to)) {
        this.validators[to].consensus.handleConsensusMessage(msg);
      }
    }
  }

  /** One epoch, in the order of Consensus.setEpochTransition(). Returns the new block or null. */
  step(epoch) {
    this.clock.set(this.clock.base + epoch * EPOCH_MS);
    for (const [i, v] of this.validators.entries()) {
      if (this.offline.has(i)) continue;
      v.node.tryFinalizeChain();
      v.consensus.epoch = epoch;
      v.consensus.updateProposer();
    }
    for (const [i, v] of this.validators.entries()) {
      if (this.offline.has(i)) continue;
      v.consensus.tryPropose();
      this.drain();
    }
    const observer = this.validators.find((v, i) => !this.offline.has(i));
    const hash = observer.node.bp.epochToBlock.get(epoch);
    const info = hash ? observer.node.bp.hashToBlockInfo.get(hash) : null;
    return info ? info.block : null;
  }

  run(fromEpoch, toEpoch) {
    const blocks = [];
    for (let e = fromEpoch; e <= toEpoch; e++) {
      const block = this.step(e);
      if (block) blocks.push(block);
    }
    return blocks;
  }

  submit(fromIndex, value = 1) {
    const sender = this.validators[fromIndex];
    const receiver = RECEIVER_ADDR;
    const tx = sender.code.testUtil.getTransaction(sender.node, {
      operation: {
        type: 'SET_VALUE',
        ref: `/transfer/${sender.node.account.address}/${receiver}/` +
            `${this.clock.now()}/value`,
        value,
      },
      nonce: -1,
      gas_price: 1,
    });
    for (const [i, v] of this.validators.entries()) {
      if (this.offline.has(i)) continue;
      const res = v.node.executeTransactionAndAddToPool(JSON.parse(JSON.stringify(tx)));
      assert.ok(!res || res.code === undefined || res.code === 0, JSON.stringify(res));
    }
    return tx;
  }

  finalizedNumbers() {
    return this.validators.filter((v, i) => !this.offline.has(i)).map((v) => v.node.bc.lastBlockNumber());
  }

  assertSameFinalizedChain() {
    const online = this.validators.filter((v, i) => !this.offline.has(i));
    const minNumber = Math.min(...online.map((v) => v.node.bc.lastBlockNumber()));
    const hashes = online.map((v) => v.node.bc.lastBlockNumber() === minNumber ?
        v.node.bc.lastBlock().hash : v.node.bc.getBlockByNumber(minNumber).hash);
    assert.equal(new Set(hashes).size, 1, `finalized forks at ${minNumber}: ${hashes}`);
  }

  isTxFinalizedEverywhere(txHash) {
    return this.validators.filter((v, i) => !this.offline.has(i)).every((v) => {
      const info = v.node.tp.transactionTracker.get(txHash);
      return info && info.is_finalized === true;
    });
  }
}

function makeClock() {
  const realNow = Date.now;
  const base = realNow() - 1000 * EPOCH_MS;
  const clock = {
    base,
    current: base,
    now: () => clock.current,
    set: (t) => { clock.current = Math.max(clock.current, t); },
    install: () => { Date.now = () => clock.current; },
    uninstall: () => { Date.now = realNow; },
  };
  return clock;
}

function cleanDataDirs() {
  for (const code of [NEW].concat(OLD_ROOT ? [loadCode(OLD_ROOT)] : [])) {
    rimraf.sync(code.constants.NodeConfigs.CHAINS_DIR);
    rimraf.sync(code.constants.NodeConfigs.SNAPSHOTS_ROOT_DIR);
  }
}

/** Runs epochs until the chain is settled (idle) on every node; returns the next epoch. */
function runUntilIdle(net, fromEpoch, maxEpochs = 20) {
  let epoch = fromEpoch;
  let quiet = 0;
  while (quiet < 3 && epoch < fromEpoch + maxEpochs) {
    quiet = net.step(epoch) ? 0 : quiet + 1;
    epoch++;
  }
  assert.equal(quiet, 3, 'network did not become idle');
  return epoch;
}

describe('Idle block production (proposer-side policy, real consensus code)', function() {
  this.timeout(120000);
  let clock;
  let net;

  beforeEach(() => {
    assert.equal(NodeConfigs.BLOCKCHAIN_CONFIGS_DIR, 'blockchain-configs/3-nodes',
        'run with BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/3-nodes');
    cleanDataDirs();
    clock = makeClock();
    clock.install();
  });

  afterEach(() => {
    clock.uninstall();
    delete TimerFlags.reward_by_elapsed_epochs;
    cleanDataDirs();
  });

  it('proposes nothing while the pool is empty once the last block is finalized', async () => {
    net = new IdleTestNetwork(['new', 'new', 'new'], clock);
    await net.start();
    let epoch = runUntilIdle(net, 2);
    const finalizedBefore = net.finalizedNumbers();
    assert.ok(finalizedBefore.every((n) => n >= 1), `boot blocks finalized: ${finalizedBefore}`);
    // Well inside the heartbeat interval: no block at all.
    const idleBlocks = net.run(epoch, epoch + 20);
    epoch += 21;
    assert.deepEqual(idleBlocks, []);
    assert.deepEqual(net.finalizedNumbers(), finalizedBefore);
    // Everything except the empty notarized tip is final; consensus still reports healthy.
    for (const v of net.validators) {
      const { chain } = v.node.bp.getExtendingChain(v.consensus.getLastNotarizedBlock().hash);
      assert.ok(chain.length <= 1);
      assert.equal(v.consensus.isConsensusHealthy(v.node.bc.lastBlock()), true);
    }
    net.assertSameFinalizedChain();
  });

  it('control: with the policy disabled every epoch still gets a block', async () => {
    net = new IdleTestNetwork(['old', 'old', 'old'], clock);
    await net.start();
    const blocks = net.run(2, 31);
    assert.equal(blocks.length, 30);
  });

  it('a transaction is proposed in the next epoch and finalized as fast as before', async () => {
    net = new IdleTestNetwork(['new', 'new', 'new'], clock);
    await net.start();
    let epoch = runUntilIdle(net, 2);
    net.run(epoch, epoch + 9);
    epoch += 10;
    const tx = net.submit(0);
    const txBlock = net.step(epoch);
    assert.ok(txBlock, 'a block is proposed in the first epoch after the tx arrives');
    assert.equal(txBlock.transactions.length, 1);
    assert.equal(txBlock.transactions[0].hash, tx.hash);
    // Finality: two more consecutive epochs, exactly the pre-existing 3-consecutive-epoch rule.
    assert.ok(net.step(epoch + 1));
    assert.ok(net.step(epoch + 2));
    net.step(epoch + 3);  // next transition runs tryFinalizeChain on every node
    for (const n of net.finalizedNumbers()) assert.ok(n >= txBlock.number);
    assert.equal(net.isTxFinalizedEverywhere(tx.hash), true);
    // Then the chain goes idle again.
    const after = net.run(epoch + 4, epoch + 24);
    assert.deepEqual(after.map((b) => b.number), []);
    net.assertSameFinalizedChain();
  });

  it('keeps proposing until a tx block is final even if a validator goes offline', async () => {
    net = new IdleTestNetwork(['new', 'new', 'new'], clock);
    await net.start();
    let epoch = runUntilIdle(net, 2);
    const tx = net.submit(1);
    const txBlock = net.step(epoch);
    assert.ok(txBlock);
    // Take the next block's would-be proposer (or validator 0) offline: 2 of 3 still notarize.
    net.offline.add(0);
    let finalized = false;
    for (let e = epoch + 1; e < epoch + 40 && !finalized; e++) {
      net.step(e);
      finalized = net.finalizedNumbers().every((n) => n >= txBlock.number);
    }
    assert.equal(finalized, true);
    assert.equal(net.isTxFinalizedEverywhere(tx.hash), true);
    net.assertSameFinalizedChain();
  });

  it('emits a finalizing heartbeat once per configured interval', async () => {
    net = new IdleTestNetwork(['new', 'new', 'new'], clock);
    await net.start();
    let epoch = runUntilIdle(net, 2);
    const tipEpochs = [];
    const finalizedAtStart = Math.min(...net.finalizedNumbers());
    const blocks = net.run(epoch, epoch + 3 * (HEARTBEAT_MS / EPOCH_MS) + 5);
    // Group blocks into bursts of consecutive epochs.
    const bursts = [];
    for (const b of blocks) {
      const last = _.last(bursts);
      if (last && _.last(last).epoch + 1 === b.epoch) last.push(b); else bursts.push([b]);
    }
    assert.equal(bursts.length, 3, `bursts: ${JSON.stringify(bursts.map((x) => x.map((b) => b.epoch)))}`);
    for (const burst of bursts) {
      assert.equal(burst.length, 3, 'a heartbeat burst is the 3 blocks needed for finality');
      tipEpochs.push(burst[0].epoch);
    }
    for (let i = 1; i < tipEpochs.length; i++) {
      const gap = tipEpochs[i] - tipEpochs[i - 1];
      assert.ok(gap >= HEARTBEAT_MS / EPOCH_MS && gap <= HEARTBEAT_MS / EPOCH_MS + 3, `gap ${gap}`);
    }
    // ain_getLastBlockNumber-style monitors see the finalized height advance every heartbeat.
    assert.ok(Math.min(...net.finalizedNumbers()) >= finalizedAtStart + 6);
    for (const v of net.validators) {
      assert.equal(v.consensus.isConsensusHealthy(v.node.bc.lastBlock()), true);
    }
    net.assertSameFinalizedChain();
  });

  it('works with a mix of old and new validators (proposer-only change)', async () => {
    net = new IdleTestNetwork(['old', 'new', 'new'], clock);
    await net.start();
    let epoch = 2;
    const blocks = net.run(epoch, epoch + 59);
    epoch += 60;
    if (OLD_ROOT) {
      assert.equal(typeof net.validators[0].consensus.getIdleProposalDecision, 'undefined',
          'validator 0 runs the previous release');
    }
    // Old proposer turns still produce blocks; new proposers add only what finality needs.
    assert.ok(blocks.length > 0 && blocks.length < 60, `blocks: ${blocks.length}`);
    const oldAddr = net.validators[0].node.account.address;
    assert.ok(blocks.some((b) => b.proposer === oldAddr), 'old validator proposed');
    assert.ok(blocks.some((b) => b.proposer !== oldAddr), 'new validators proposed');
    const tx = net.submit(2);
    let finalized = false;
    for (let e = epoch; e < epoch + 40 && !finalized; e++) {
      net.step(e);
      finalized = net.isTxFinalizedEverywhere(tx.hash);
    }
    assert.equal(finalized, true, 'tx finalized on old and new validators');
    // Every validator (old code included) accepted and finalized the same chain.
    net.assertSameFinalizedChain();
    const oldNode = net.validators[0].node;
    assert.ok(oldNode.bc.lastBlockNumber() >= 3);
  });

  it("credits block rewards for elapsed epochs under 'reward_by_elapsed_epochs'", async () => {
    TimerFlags.reward_by_elapsed_epochs = { enabled_block: 0, has_bandage: false };
    net = new IdleTestNetwork(['new', 'new', 'new'], clock);
    await net.start();
    let epoch = runUntilIdle(net, 2);
    net.run(epoch, epoch + HEARTBEAT_MS / EPOCH_MS + 5);  // includes one heartbeat gap
    const node = net.validators[0].node;
    const finalVersion = node.stateManager.getFinalVersion();
    const get = (p) => node.db.getValue(p, { isFinal: true });
    const rewards = get('/consensus/rewards');
    const total = Object.values(rewards).reduce((acc, r) => acc + r.cumulative, 0);
    // Expected: distributions happened for every block N >= 2 whose proposal is final.
    let expectedEpochs = 0;
    let gapSeen = false;
    for (let n = 2; n <= node.bc.lastBlockNumber(); n++) {
      const cur = get(`/consensus/number/${n}/propose`);
      const prev = get(`/consensus/number/${n - 1}/propose`);
      if (!cur || !prev) continue;
      const gap = cur.epoch - prev.epoch;
      if (gap > 1) gapSeen = true;
      expectedEpochs += gap;
    }
    assert.ok(finalVersion);
    assert.equal(gapSeen, true, 'an idle gap was rewarded');
    const params = node.getBlockchainParam('reward/annual_rate');
    const perEpochPerStake = params * EPOCH_MS / 31557600000;
    const totalStake = 3 * 10000000;
    const expected = perEpochPerStake * totalStake * expectedEpochs;
    assert.ok(Math.abs(total - expected) / expected < 1e-6, `total ${total} expected ${expected}`);
  });
});
