const rimraf = require('rimraf');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const stringify = require('fast-json-stable-stringify');
const BlockchainNode = require('../../node');
const DB = require('../../db');
const Functions = require('../../db/functions');
const Transaction = require('../../tx-pool/transaction');
const CommonUtil = require('../../common/common-util');
const {
  DevFlags,
  NodeConfigs,
  TimerFlags,
  NativeFunctionIds,
  isNativeFunctionId,
  isActiveNativeFunctionId,
  StateLabelProperties,
} = require('../../common/constants');
const { TxResultCode } = require('../../common/result-code');
const { setNodeForTesting } = require('../test-util');

const hash = (str) => CommonUtil.hashString(str);

// Independent reference: the peaks of an MMR over `leaves` are the Merkle roots of the
// perfect binary trees given by the binary decomposition of n, largest (oldest) first.
function referencePeaks(leaves) {
  const merkleRoot = (nodes) => {
    let level = nodes;
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        next.push(hash(level[i] + level[i + 1]));
      }
      level = next;
    }
    return level[0];
  };
  const peaks = [];
  let start = 0;
  for (let bit = 31; bit >= 0; bit--) {
    const size = Math.pow(2, bit);
    if (Math.floor(leaves.length / size) % 2 === 1) {
      peaks.push(merkleRoot(leaves.slice(start, start + size)));
      start += size;
    }
  }
  return peaks;
}

// For SET txs a budget failure only shows in the top-level code.
function txOk(res) {
  return !CommonUtil.isFailedTx(res) && (res.code === undefined || res.code === 0);
}

function popcount(n) {
  return n.toString(2).split('').filter((b) => b === '1').length;
}

function peakObj(list) {
  const obj = {};
  list.forEach((p, i) => {
 obj[i] = p;
});
  return obj;
}

// The leaf as the Store must recompute it.
function referenceLeaf(app, collection, key, record, txHash) {
  return hash(stringify({ a: app, c: collection, k: key, r: record, t: txHash }));
}

describe('AIN Store: MMR append', () => {
  it('peaks match a reference implementation for n = 1..70 (popcount(n) peaks)', () => {
    const leaves = [];
    let mmr = null;
    for (let n = 1; n <= 70; n++) {
      const leaf = hash(`leaf-${n}`);
      leaves.push(leaf);
      mmr = Functions.appendToMmr(mmr, leaf);
      const expected = referencePeaks(leaves);
      expect(mmr.n).to.equal(n);
      expect(Object.keys(mmr.peaks).length).to.equal(popcount(n));
      expect(expected.length).to.equal(popcount(n));
      assert.deepEqual(Functions.getMmrPeakList(mmr), expected);
      assert.deepEqual(mmr.peaks, peakObj(expected));
    }
  });

  it('does not modify its input and accepts array peaks', () => {
    const mmr = { n: 1, peaks: { 0: hash('a') } };
    const next = Functions.appendToMmr(mmr, hash('b'));
    assert.deepEqual(mmr, { n: 1, peaks: { 0: hash('a') } });
    assert.deepEqual(next, { n: 2, peaks: { 0: hash(hash('a') + hash('b')) } });
    assert.deepEqual(Functions.appendToMmr({ n: 1, peaks: [hash('a')] }, hash('b')), next);
  });

  it('validates the stored MMR shape', () => {
    const h = hash('a');
    expect(Functions.isValidMmr({ n: 1, peaks: { 0: h } })).to.equal(true);
    expect(Functions.isValidMmr({ n: 3, peaks: { 0: h, 1: h } })).to.equal(true);
    expect(Functions.isValidMmr({ n: 0 })).to.equal(true);
    for (const bad of [
      { n: 1 }, { n: 1, peaks: {} }, { n: 1.5, peaks: { 0: h } }, { n: '1', peaks: { 0: h } },
      { n: -1 }, { n: 2, peaks: { 0: h, 1: h } }, { n: 1, peaks: { 0: '0xabc' } },
      { n: 1, peaks: { 1: h } }, { n: 1, peaks: { 0: h.toUpperCase() } },
      { n: 1, peaks: { 0: h }, x: 1 }, { n: Math.pow(2, 53), peaks: { 0: h } }, 'mmr', 7,
    ]) {
      expect(Functions.isValidMmr(bad), JSON.stringify(bad)).to.equal(false);
    }
  });

  it('computes the leaf from the canonical record and the tx hash', () => {
    const record = { op: 'set', id: 'u1/p9', h: '0x' + '1'.repeat(64), base: 0 };
    const leaf = Functions.computeStoreLeaf('app', 'col', 'k'.repeat(20), record, '0xabc');
    expect(leaf).to.equal(hash(
        '{"a":"app","c":"col","k":"kkkkkkkkkkkkkkkkkkkk",' +
        `"r":{"base":0,"h":"0x${'1'.repeat(64)}","id":"u1/p9","op":"set"},"t":"0xabc"}`));
    expect(Functions.computeStoreLeaf('app', 'col', 'k'.repeat(20), record, '0xabd'))
        .to.not.equal(leaf);
  });

  it('_storeAppend is a known native function only once the timer flag activates', () => {
    const original = TimerFlags.ain_store;
    try {
      TimerFlags.ain_store = { enabled_block: 10 };
      expect(isActiveNativeFunctionId(NativeFunctionIds.STORE_APPEND, 9)).to.equal(false);
      expect(isActiveNativeFunctionId(NativeFunctionIds.STORE_APPEND, 10)).to.equal(true);
      expect(isActiveNativeFunctionId(NativeFunctionIds.SAVE_LAST_TX, 0)).to.equal(true);
      // Never a valid 'fid:' owner, so owner config validation is unchanged.
      expect(isNativeFunctionId(NativeFunctionIds.STORE_APPEND)).to.equal(false);
    } finally {
      TimerFlags.ain_store = original;
    }
  });
});

describe('AIN Store: chain behaviour', () => {
  const app = 'store_app';
  const collection = 'articles';
  const slotPattern = `/apps/${app}/writes/${collection}/$key`;
  let node;
  let timestamp;
  let originalFlag;
  let keyCounter;

  const nextKey = () => `key${String(keyCounter++).padStart(17, '0')}`;
  const blockNumber = () => node.bc.lastBlockNumber() + 1;
  const execute = (operation, bn = null, eventSource = null) => {
    const tx = Transaction.fromTxBody({
      operation,
      gas_price: 1,
      nonce: -1,
      timestamp: timestamp++,
    }, node.account.private_key);
    const res = node.db.executeTransaction(
        tx, false, true, bn === null ? blockNumber() : bn, null, eventSource);
    return { tx, res };
  };
  const record = (i) => ({
    id: `doc${i}`, op: 'set', base: 0, h: '0x' + i.toString(16).padStart(64, '0'),
  });
  const writeSlot = (key, value) =>
      execute({ type: 'SET_VALUE', ref: `/apps/${app}/writes/${collection}/${key}`, value });
  const setup = () => {
    const addr = node.account.address;
    expect(execute({
      type: 'SET_VALUE',
      ref: `/manage_app/${app}/create/1`,
      value: { admin: { [addr]: true } },
    }).res.code).to.equal(0);
    // App rules that would reject the slot erasure (newData === null) and allow anyone to
    // write store/mmr; neither must matter.
    expect(execute({
      type: 'SET_RULE',
      ref: slotPattern,
      value: { '.rule': { write: `auth.addr === '${addr}' && util.isDict(newData)` } },
    }).res.code).to.equal(0);
    expect(execute({
      type: 'SET_RULE',
      ref: `/apps/${app}/store`,
      value: { '.rule': { write: true } },
    }).res.code).to.equal(0);
    return execute({
      type: 'SET_FUNCTION',
      ref: slotPattern,
      value: {
        '.function': {
          [NativeFunctionIds.STORE_APPEND]: {
            function_type: 'NATIVE',
            function_id: NativeFunctionIds.STORE_APPEND,
          },
        },
      },
    }).res;
  };

  beforeEach(async () => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);
    originalFlag = TimerFlags.ain_store;
    TimerFlags.ain_store = { enabled_block: 1 };
    node = new BlockchainNode();
    await setNodeForTesting(node, 0, true);
    timestamp = 1700000000000;
    keyCounter = 0;
  });

  afterEach(() => {
    if (originalFlag === undefined) delete TimerFlags.ain_store;
    else TimerFlags.ain_store = originalFlag;
    rimraf.sync(NodeConfigs.CHAINS_DIR);
  });

  describe('with the ain_store flag enabled', () => {
    beforeEach(() => {
      expect(blockNumber()).to.be.at.least(1);
      expect(setup().code).to.equal(0);
    });

    it('appends the leaf (record + tx hash) to the MMR and erases the slot in the same tx', () => {
      const key = nextKey();
      const { tx, res } = writeSlot(key, record(1));
      expect(res.code).to.equal(0);
      expect(node.db.getValue(`/apps/${app}/writes/${collection}/${key}`)).to.equal(null);
      const leaf = referenceLeaf(app, collection, key, record(1), tx.hash);
      assert.deepEqual(node.db.getValue(`/apps/${app}/store/mmr`), { n: 1, peaks: { 0: leaf } });
    });

    it('matches the reference MMR over the chain-computed leaves', () => {
      const leaves = [];
      for (let i = 0; i < 11; i++) {
        const key = nextKey();
        const { tx, res } = writeSlot(key, record(i));
        expect(res.code).to.equal(0);
        leaves.push(referenceLeaf(app, collection, key, record(i), tx.hash));
        assert.deepEqual(node.db.getValue(`/apps/${app}/store/mmr`),
            { n: i + 1, peaks: peakObj(referencePeaks(leaves)) });
      }
      expect(node.db.getValue(`/apps/${app}/writes`)).to.equal(null);
    });

    it('leaf includes the tx hash: the same record at the same key gives a new leaf', () => {
      const key = nextKey();
      const first = writeSlot(key, record(7));
      const second = writeSlot(key, record(7));
      expect(first.res.code).to.equal(0);
      expect(second.res.code).to.equal(0);
      expect(first.tx.hash).to.not.equal(second.tx.hash);
      const leaves = [first, second].map(({ tx }) =>
          referenceLeaf(app, collection, key, record(7), tx.hash));
      expect(leaves[0]).to.not.equal(leaves[1]);
      assert.deepEqual(node.db.getValue(`/apps/${app}/store/mmr`),
          { n: 2, peaks: { 0: hash(leaves[0] + leaves[1]) } });
    });

    it('folds each slot of a batch (SET op_list) in op order', () => {
      const keys = [nextKey(), nextKey(), nextKey()];
      const { tx, res } = execute({
        type: 'SET',
        op_list: keys.map((key, i) => ({
          type: 'SET_VALUE', ref: `/apps/${app}/writes/${collection}/${key}`, value: record(i),
        })),
      });
      expect(txOk(res)).to.equal(true);
      expect(Object.keys(res.result_list).length).to.equal(3);
      const leaves = keys.map((key, i) => referenceLeaf(app, collection, key, record(i), tx.hash));
      assert.deepEqual(node.db.getValue(`/apps/${app}/store/mmr`),
          { n: 3, peaks: peakObj(referencePeaks(leaves)) });
    });

    it('rejects a slot key that is not a 20-char push id', () => {
      const { res } = writeSlot('short', record(1));
      expect(res.code).to.equal(TxResultCode.SET_VALUE_TRIGGERED_FUNCTION_CALL_FAILED);
      expect(node.db.getValue(`/apps/${app}/store/mmr`)).to.equal(null);
      expect(node.db.getValue(`/apps/${app}/writes/${collection}/short`)).to.equal(null);
    });

    it('rejects ordinary writes to store/mmr regardless of app rules', () => {
      expect(writeSlot(nextKey(), record(1)).res.code).to.equal(0);
      const mmr = node.db.getValue(`/apps/${app}/store/mmr`);
      const forged = { n: 1, peaks: { 0: hash('forged') } };
      for (const op of [
        { type: 'SET_VALUE', ref: `/apps/${app}/store/mmr`, value: forged },
        { type: 'SET_VALUE', ref: `/apps/${app}/store/mmr/n`, value: 5 },
        { type: 'INC_VALUE', ref: `/apps/${app}/store/mmr/n`, value: 1 },
        { type: 'SET_VALUE', ref: `/apps/${app}/store/mmr`, value: null },
        { type: 'SET_VALUE', ref: `/apps/${app}/store`, value: { mmr: forged } },
        { type: 'SET_VALUE', ref: `/apps/${app}/store`, value: null },
        { type: 'SET_VALUE', ref: `/apps/${app}`, value: { other: 1 } },
      ]) {
        const { res } = execute(op);
        expect(res.code, JSON.stringify(op))
            .to.equal(TxResultCode.SET_VALUE_STORE_MMR_NOT_WRITABLE);
      }
      assert.deepEqual(node.db.getValue(`/apps/${app}/store/mmr`), mmr);
      // Writes next to the MMR are unaffected.
      expect(execute({
        type: 'SET_VALUE',
        ref: `/apps/${app}/store/state`,
        value: { upTo: 1, root: hash('r'), at: 1 },
      }).res.code).to.equal(0);
      expect(execute({
        type: 'SET_VALUE', ref: `/apps/${app}/store`, value: { mmr, state: { upTo: 1 } },
      }).res.code).to.equal(0);
    });

    it('allows installing _storeAppend only under /apps/<app>/writes/<collection>/...', () => {
      const fn = {
        '.function': {
          [NativeFunctionIds.STORE_APPEND]: {
            function_type: 'NATIVE', function_id: NativeFunctionIds.STORE_APPEND,
          },
        },
      };
      for (const ref of [`/apps/${app}/other/$key`, `/apps/${app}/writes`,
        `/apps/${app}/store/mmr`, `/apps/${app}`]) {
        expect(execute({ type: 'SET_FUNCTION', ref, value: fn }).res.code, ref)
            .to.equal(TxResultCode.SET_FUNCTION_STORE_APPEND_INVALID_PATH);
      }
      // Nested in a function tree set at an ancestor path.
      expect(execute({
        type: 'SET_FUNCTION', ref: `/apps/${app}`, value: { other: { $key: fn } },
      }).res.code).to.equal(TxResultCode.SET_FUNCTION_STORE_APPEND_INVALID_PATH);
      expect(execute({
        type: 'SET_FUNCTION', ref: `/apps/${app}`, value: { writes: { comments: { $key: fn } } },
      }).res.code).to.equal(0);
      expect(execute({
        type: 'SET_FUNCTION', ref: `/apps/${app}/writes/scores/$key`, value: fn,
      }).res.code).to.equal(0);
      // Removing it is allowed anywhere.
      expect(execute({
        type: 'SET_FUNCTION', ref: `/apps/${app}/writes/scores/$key`, value: null,
      }).res.code).to.equal(0);
    });
  });

  describe('with the ain_store flag enabled (review follow-ups)', () => {
    const mmrPath = `/apps/${app}/store/mmr`;
    beforeEach(() => {
      expect(setup().code).to.equal(0);
    });

    it('refuses to append onto a malformed MMR', () => {
      const h = hash('a');
      for (const bad of [
        { n: 1 }, { n: 1.5, peaks: { 0: h } }, { n: '7', peaks: { 0: h } },
        { n: 2, peaks: { 0: h, 1: h } }, { n: 1, peaks: { 0: '0xabc' } },
      ]) {
        node.db.setValuesForTesting(mmrPath, bad);
        const before = node.db.getValue(mmrPath);
        const key = nextKey();
        const { res } = writeSlot(key, record(1));
        expect(res.code, JSON.stringify(bad))
            .to.equal(TxResultCode.SET_VALUE_TRIGGERED_FUNCTION_CALL_FAILED);
        assert.deepEqual(node.db.getValue(mmrPath), before);
        expect(node.db.getValue(`/apps/${app}/writes/${collection}/${key}`)).to.equal(null);
      }
      node.db.setValuesForTesting(mmrPath, { n: 1, peaks: { 0: h } });
      const key = nextKey();
      const { tx, res } = writeSlot(key, record(1));
      expect(res.code).to.equal(0);
      const leaf = referenceLeaf(app, collection, key, record(1), tx.hash);
      assert.deepEqual(node.db.getValue(mmrPath), { n: 2, peaks: { 0: hash(h + leaf) } });
    });

    for (const [name, rulePath, childPath] of [
      ['/apps/<app>/store/$x', `/apps/${app}/store/$x`, `/apps/${app}/store`],
      ['/apps/<app>/$x', `/apps/${app}/$x`, `/apps/${app}`],
    ]) {
      it(`a GC state rule at ${name} never deletes the MMR`, () => {
        expect(writeSlot(nextKey(), record(1)).res.code).to.equal(0);
        const mmr = node.db.getValue(mmrPath);
        expect(execute({
          type: 'SET_RULE',
          ref: rulePath,
          value: {
            '.rule': { write: true, state: { gc_max_siblings: 100, gc_num_siblings_deleted: 100 } },
          },
        }).res.code).to.equal(0);
        for (let i = 0; i < 101; i++) {
          expect(execute({ type: 'SET_VALUE', ref: `${childPath}/c${i}`, value: i }).res.code)
              .to.equal(0);
        }
        assert.deepEqual(node.db.getValue(mmrPath), mmr);
        // GC still ran on the other siblings.
        const children = Object.keys(node.db.getValue(childPath, { isShallow: true }));
        expect(children.length).to.be.at.most(101);
        expect(children).to.include(childPath.endsWith('store') ? 'mmr' : 'store');
        expect(writeSlot(nextKey(), record(2)).res.code).to.equal(0);
        expect(node.db.getValue(`${mmrPath}/n`)).to.equal(2);
      });
    }

    it('emits value-changed events for the MMR update and the slot erase', () => {
      const events = [];
      node.db.eh = {
        emitValueChanged: (auth, tx, path, before, after) =>
          events.push({ path: CommonUtil.formatPath(path), after }),
      };
      const key = nextKey();
      const slot = `/apps/${app}/writes/${collection}/${key}`;
      expect(execute({ type: 'SET_VALUE', ref: slot, value: record(1) }, null, 'BLOCK').res.code)
          .to.equal(0);
      const paths = events.map((e) => e.path);
      expect(paths).to.include(mmrPath);
      expect(events.find((e) => e.path === slot && e.after === null)).to.not.equal(undefined);
    });

    it('rolls back the MMR and the slot erase when a later function fails', () => {
      expect(execute({
        type: 'SET_FUNCTION',
        ref: slotPattern,
        value: {
          '.function': {
            [NativeFunctionIds.STORE_APPEND]: {
              function_type: 'NATIVE', function_id: NativeFunctionIds.STORE_APPEND,
            },
            [NativeFunctionIds.FAIL]: {
              function_type: 'NATIVE', function_id: NativeFunctionIds.FAIL,
            },
          },
        },
      }).res.code).to.equal(0);
      expect(writeSlot(nextKey(), record(1)).res.code).to.not.equal(0);
      expect(node.db.getValue(mmrPath)).to.equal(null);
      expect(node.db.getValue(`/apps/${app}/writes`)).to.equal(null);
    });

    it('folds the slots of a parent-path write (subtree triggers) in key order', () => {
      expect(execute({
        type: 'SET_RULE', ref: `/apps/${app}/writes`, value: { '.rule': { write: true } },
      }).res.code).to.equal(0);
      const keys = [nextKey(), nextKey()];
      const { tx, res } = execute({
        type: 'SET_VALUE',
        ref: `/apps/${app}/writes`,
        value: { [collection]: { [keys[0]]: record(1), [keys[1]]: record(2) } },
      });
      expect(res.code).to.equal(0);
      const leaves = keys.map((k, i) => referenceLeaf(app, collection, k, record(i + 1), tx.hash));
      assert.deepEqual(node.db.getValue(mmrPath),
          { n: 2, peaks: { 0: hash(leaves[0] + leaves[1]) } });
      expect(node.db.getValue(`/apps/${app}/writes`)).to.equal(null);
    });
  });

  describe('activation boundary', () => {
    it('behaves as before at block N-1 and switches on at block N in the same node', () => {
      const N = 5;
      TimerFlags.ain_store = { enabled_block: N };
      expect(setup().code).to.equal(0);
      const k1 = nextKey();
      expect(execute(
          { type: 'SET_VALUE', ref: `/apps/${app}/writes/${collection}/${k1}`, value: record(1) },
          N - 1).res.code).to.equal(0);
      assert.deepEqual(node.db.getValue(`/apps/${app}/writes/${collection}/${k1}`), record(1));
      expect(node.db.getValue(`/apps/${app}/store/mmr`)).to.equal(null);
      expect(execute({ type: 'SET_VALUE', ref: `/apps/${app}/store/x`, value: 1 }, N - 1)
          .res.code).to.equal(0);
      const k2 = nextKey();
      const { tx, res } = execute(
          { type: 'SET_VALUE', ref: `/apps/${app}/writes/${collection}/${k2}`, value: record(2) },
          N);
      expect(res.code).to.equal(0);
      expect(node.db.getValue(`/apps/${app}/writes/${collection}/${k2}`)).to.equal(null);
      assert.deepEqual(node.db.getValue(`/apps/${app}/store/mmr`),
          { n: 1, peaks: { 0: referenceLeaf(app, collection, k2, record(2), tx.hash) } });
      expect(execute({ type: 'SET_VALUE', ref: `/apps/${app}/store/mmr/n`, value: 9 }, N)
          .res.code).to.equal(TxResultCode.SET_VALUE_STORE_MMR_NOT_WRITABLE);
    });
  });

  describe('per-app state budgets and deletions', () => {
    const budgetPath = `/blockchain_params/resource/app_state_budget/${app}`;
    const freeRatioPath = '/blockchain_params/resource/free_state_budget_ratio';
    const appBytes = () =>
      node.db.getStateUsageAtPath(`apps/${app}`)[StateLabelProperties.TREE_BYTES];
    const bigTree = (n) => {
      const tree = {};
      for (let i = 0; i < n; i++) tree[`k${i}`] = 'a'.repeat(50);
      return tree;
    };

    beforeEach(() => {
      expect(setup().code).to.equal(0);
      expect(execute({ type: 'SET_VALUE', ref: `/apps/${app}/data`, value: bigTree(20) }).res.code)
          .to.equal(0);
    });

    it('enforces the app\'s own budget', () => {
      node.db.setValuesForTesting(budgetPath, appBytes() + 200);
      const ok = execute({ type: 'SET_VALUE', ref: `/apps/${app}/small`, value: 'x' });
      expect(ok.res.code).to.equal(0);
      const over = execute({ type: 'SET_VALUE', ref: `/apps/${app}/more`, value: bigTree(20) });
      expect(over.res.code).to.equal(TxResultCode.GAS_EXCEED_STATE_BUDGET_LIMIT_FOR_APP);
      expect(over.res.message).to.include(`app ${app}`);
      expect(node.db.getValue(`/apps/${app}/more`)).to.equal(null);
    });

    it('accepts a delete-only tx while over budget, but not a growing one', () => {
      node.db.setValuesForTesting(budgetPath, 10); // Far below current usage.
      expect(execute({ type: 'SET_VALUE', ref: `/apps/${app}/x`, value: 'x' }).res.code)
          .to.equal(TxResultCode.GAS_EXCEED_STATE_BUDGET_LIMIT_FOR_APP);
      const del = execute({ type: 'SET_VALUE', ref: `/apps/${app}/data/k0`, value: null });
      expect(del.res.code).to.equal(0);
      expect(node.db.getValue(`/apps/${app}/data/k0`)).to.equal(null);
      // Shrinking an existing value is also accepted.
      expect(execute({ type: 'SET_VALUE', ref: `/apps/${app}/data/k1`, value: 'a' }).res.code)
          .to.equal(0);
    });

    it('excludes an app with its own budget from the free-tier pool', () => {
      const bn = blockNumber();
      const before = node.db.getStateFreeTierUsage(bn)[StateLabelProperties.TREE_BYTES];
      node.db.setValuesForTesting(budgetPath, 1000000);
      const after = node.db.getStateFreeTierUsage(bn)[StateLabelProperties.TREE_BYTES] || 0;
      expect(before - after).to.equal(appBytes());
      // Free tier exhausted: the budgeted app can still grow within its own budget.
      node.db.setValuesForTesting(freeRatioPath, 0);
      expect(execute({ type: 'SET_VALUE', ref: `/apps/${app}/more`, value: 'x' }).res.code)
          .to.equal(0);
      node.db.setValuesForTesting(budgetPath, null);
      expect(execute({ type: 'SET_VALUE', ref: `/apps/${app}/more2`, value: 'x' }).res.code)
          .to.equal(TxResultCode.GAS_EXCEED_STATE_BUDGET_LIMIT_FOR_FREE_TIER);
      // Deletion is still accepted with the free tier exhausted.
      expect(execute({ type: 'SET_VALUE', ref: `/apps/${app}/more`, value: null }).res.code)
          .to.equal(0);
    });

    it('excludes budgeted apps on the legacy (non-optimized) free-tier path too', () => {
      const bn = blockNumber();
      const original = DevFlags.enableGetStateFreeTierUsageOptimization;
      try {
        DevFlags.enableGetStateFreeTierUsageOptimization = false;
        const before = node.db.getStateFreeTierUsage(bn)[StateLabelProperties.TREE_BYTES];
        node.db.setValuesForTesting(budgetPath, 1000000);
        const after = node.db.getStateFreeTierUsage(bn)[StateLabelProperties.TREE_BYTES] || 0;
        expect(before - after).to.equal(appBytes());
        // Before activation the app stays in the pool.
        expect(node.db.getStateFreeTierUsage(0)[StateLabelProperties.TREE_BYTES]).to.equal(before);
      } finally {
        DevFlags.enableGetStateFreeTierUsageOptimization = original;
      }
    });

    it('reports the own budget in getStateUsageWithStakingInfo', () => {
      node.bc.lastBlockNumber = () => 1;
      node.stateManager.getFinalRoot = () => node.db.stateRoot;
      const without = node.getStateUsageWithStakingInfo(app);
      expect(without.budget).to.equal(undefined);
      node.db.setValuesForTesting(budgetPath, appBytes() + 500);
      const info = node.getStateUsageWithStakingInfo(app);
      assert.deepEqual(info.budget, { tree_bytes: appBytes() + 500 });
      expect(info.available.tree_bytes).to.equal(500);
      expect(info.staking.unstakeable).to.equal(info.staking.app);
    });

    it('measures growth net per app per tx: delete+add without net growth passes, ' +
        'growth of another app is still checked', () => {
      node.db.setValuesForTesting(budgetPath, 10);
      const swap = execute({
        type: 'SET',
        op_list: [
          { type: 'SET_VALUE', ref: `/apps/${app}/data`, value: null },
          { type: 'SET_VALUE', ref: `/apps/${app}/fresh`, value: { a: 'b' } },
        ],
      });
      expect(txOk(swap.res)).to.equal(true);
      expect(node.db.getValue(`/apps/${app}/fresh/a`)).to.equal('b');
      // Another app growing in the same tx is still checked against its own budget.
      expect(execute({
        type: 'SET_VALUE',
        ref: '/manage_app/other_app/create/1',
        value: { admin: { [node.account.address]: true } },
      }).res.code).to.equal(0);
      node.db.setValuesForTesting('/blockchain_params/resource/app_state_budget/other_app', 1);
      const mixed = execute({
        type: 'SET',
        op_list: [
          { type: 'SET_VALUE', ref: `/apps/${app}/fresh`, value: null },
          { type: 'SET_VALUE', ref: '/apps/other_app/x', value: 'grow' },
        ],
      });
      // NOTE: For SET txs the budget failure is reported only in the top-level code; the
      // tx must still be rolled back.
      expect(node.db.getValue('/apps/other_app/x')).to.equal(null);
      expect(mixed.res.code).to.equal(TxResultCode.GAS_EXCEED_STATE_BUDGET_LIMIT_FOR_APP);
      expect(mixed.res.message).to.include('other_app');
    });

    it('reads the budget param from state', () => {
      node.db.setValuesForTesting(budgetPath, 1234);
      expect(DB.getAppStateBudget(app, blockNumber(), node.db.stateRoot)).to.equal(1234);
      expect(DB.getAppStateBudget('no_such_app', blockNumber(), node.db.stateRoot)).to.equal(null);
      node.db.setValuesForTesting(budgetPath, 'big');
      expect(DB.getAppStateBudget(app, blockNumber(), node.db.stateRoot)).to.equal(null);
    });
  });

  describe('before the ain_store flag activates', () => {
    beforeEach(() => {
      TimerFlags.ain_store = { enabled_block: null };
      expect(setup().code).to.equal(0);
    });

    it('_storeAppend is inert: the slot is kept and no MMR is written', () => {
      const key = nextKey();
      expect(writeSlot(key, record(1)).res.code).to.equal(0);
      assert.deepEqual(node.db.getValue(`/apps/${app}/writes/${collection}/${key}`), record(1));
      expect(node.db.getValue(`/apps/${app}/store/mmr`)).to.equal(null);
    });

    it('store/mmr is an ordinary path governed by app rules', () => {
      const op = { type: 'SET_VALUE', ref: `/apps/${app}/store/mmr`, value: { n: 9 } };
      expect(execute(op).res.code).to.equal(0);
    });

    it('the fid can be set on any path, as before', () => {
      expect(execute({
        type: 'SET_FUNCTION',
        ref: `/apps/${app}/other/$key`,
        value: {
          '.function': {
            [NativeFunctionIds.STORE_APPEND]: {
              function_type: 'NATIVE', function_id: NativeFunctionIds.STORE_APPEND,
            },
          },
        },
      }).res.code).to.equal(0);
    });

    it('keeps the legacy (unrolled-back) result of a SET tx failing the budget check', () => {
      node.db.setValuesForTesting('/blockchain_params/resource/free_state_budget_ratio', 0);
      const res = execute({
        type: 'SET',
        op_list: [{ type: 'SET_VALUE', ref: `/apps/${app}/legacy`, value: 'kept' }],
      }).res;
      expect(res.code).to.equal(TxResultCode.GAS_EXCEED_STATE_BUDGET_LIMIT_FOR_FREE_TIER);
      expect(node.db.getValue(`/apps/${app}/legacy`)).to.equal('kept');
    });

    it('per-app budgets are ignored and deletions are budget-checked as before', () => {
      expect(execute({ type: 'SET_VALUE', ref: `/apps/${app}/data`, value: { a: 'b', c: 'd' } })
          .res.code).to.equal(0);
      node.db.setValuesForTesting(`/blockchain_params/resource/app_state_budget/${app}`, 1000000);
      node.db.setValuesForTesting('/blockchain_params/resource/free_state_budget_ratio', 0);
      expect(execute({ type: 'SET_VALUE', ref: `/apps/${app}/x`, value: 'x' }).res.code)
          .to.equal(TxResultCode.GAS_EXCEED_STATE_BUDGET_LIMIT_FOR_FREE_TIER);
      expect(execute({ type: 'SET_VALUE', ref: `/apps/${app}/data/a`, value: null }).res.code)
          .to.equal(TxResultCode.GAS_EXCEED_STATE_BUDGET_LIMIT_FOR_FREE_TIER);
    });
  });
});
