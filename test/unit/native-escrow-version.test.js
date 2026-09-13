const assert = require('assert/strict');
const Functions = require('../../db/functions');
const { TimerFlags } = require('../../common/constants');
const { FunctionResultCode } = require('../../common/result-code');
const CommonUtil = require('../../common/common-util');

describe('Opt-in native escrow arithmetic activation', () => {
  const source = `0x${'11'.repeat(20)}`;
  const target = `0x${'22'.repeat(20)}`;
  const escrow = `escrow|escrow|${source}:${target}:units`;
  const configPath = `/escrow/${source}/${target}/units/config/native_release_version`;
  const balancePath = CommonUtil.getBalancePath(escrow);
  let originalFlag;
  let values;
  let functions;
  let writes;

  beforeEach(() => {
    originalFlag = TimerFlags.native_escrow_micro_units;
    TimerFlags.native_escrow_micro_units = { enabled_block: 10, disabled_block: 20 };
    values = new Map([[configPath, 2], [balancePath, 0.1],
      [CommonUtil.getBalancePath(source), 1]]);
    functions = new Functions({ getValue: (path) => values.get(path) ?? null,
      isNonExistingAccount: () => false });
    writes = [];
    functions.setValueOrLog = (path, value) => {
      values.set(path, value);
      writes.push({ path, value });
      return { code: 0 };
    };
    functions.decValueOrLog = (path, amount) =>
      functions.setValueOrLog(path, values.get(path) - amount);
    functions.incValueOrLog = (path, amount) =>
      functions.setValueOrLog(path, (values.get(path) ?? 0) + amount);
  });

  afterEach(() => {
    if (originalFlag === undefined) delete TimerFlags.native_escrow_micro_units;
    else TimerFlags.native_escrow_micro_units = originalFlag;
  });

  const context = (blockNumber = 10, fid = '_transfer') => ({ blockNumber, fid, opResultList: [],
    params: { from: source, to: escrow, source_account: source,
      target_account: target, escrow_key: 'units' }, accountRegistrationGasAmount: 0 });

  it('requires both a scheduled activation and this exact escrow opt-in', () => {
    assert.equal(functions.isMicroUnitEscrow(escrow, context(9)), false);
    assert.equal(functions.isMicroUnitEscrow(escrow, context(10)), true);
    assert.equal(functions.isMicroUnitEscrow(escrow, context(20)), false);
    values.set(configPath, 1);
    assert.equal(functions.isMicroUnitEscrow(escrow, context()), false);
    TimerFlags.native_escrow_micro_units = { enabled_block: null };
    values.set(configPath, 2);
    assert.equal(functions.isMicroUnitEscrow(escrow, context()), false);
  });

  it('does not treat other services or malformed participant paths as opt-in', () => {
    for (const account of [source, null, 'escrow|other|key', 'escrow|escrow|x:y:z',
      `escrow|escrow|${source}:${target}:../other`, `${escrow}:extra`]) {
      assert.equal(functions.isMicroUnitEscrow(account, context()), false);
    }
  });

  it('preserves legacy arithmetic before activation and without opt-in', () => {
    functions._transfer(0.2, context(9));
    assert.equal(values.get(balancePath), 0.1 + 0.2);
    values.set(balancePath, 0.1);
    values.set(configPath, 1);
    functions._transfer(0.2, context(10));
    assert.equal(values.get(balancePath), 0.1 + 0.2);
  });

  it('uses exact micro-unit debits and credits only for an active opted-in escrow', () => {
    assert.equal(functions._transfer(0.2, context()).code, FunctionResultCode.SUCCESS);
    assert.equal(values.get(balancePath), 0.3);
    assert.equal(values.get(CommonUtil.getBalancePath(source)), 0.8);
  });

  it('refuses noncanonical existing balances before either balance write', () => {
    values.set(balancePath, 0.1 + 0.2);
    assert.equal(functions._transfer(0.2, context()).code, FunctionResultCode.FAILURE);
    assert.equal(writes.length, 0);
    assert.equal(values.get(CommonUtil.getBalancePath(source)), 1);
  });

  it('emits exact version2 amounts without changing the six-decimal transfer rule', () => {
    const transfers = [];
    values.set(balancePath, 1);
    functions.setServiceAccountTransferOrLog = (from, to, amount) => {
      transfers.push({ from, to, amount });
      return { code: 0 };
    };
    assert.equal(functions._release({ version: 2, source_units: 499940,
      target_units: 500060 }, context(10, '_release')).code, FunctionResultCode.SUCCESS);
    assert.deepEqual(transfers, [{ from: escrow, to: target, amount: 0.50006 },
      { from: escrow, to: source, amount: 0.49994 }]);
  });

  it('requires the explicit version2 amount payload for an opted-in escrow', () => {
    values.set(balancePath, 1);
    functions.setServiceAccountTransferOrLog = () => assert.fail('unexpected payout');
    assert.equal(functions._release({ ratio: 0.50006 }, context(10, '_release')).code,
        FunctionResultCode.FAILURE);
  });

  it('keeps a legacy frozen channel unchanged even after activation', () => {
    const amounts = [];
    values.set(configPath, null);
    values.set(balancePath, 1);
    functions.setServiceAccountTransferOrLog = (from, to, amount) => {
      amounts.push(amount);
      return { code: 0 };
    };
    assert.equal(functions._release({ ratio: 0.50006 }, context(10, '_release')).code,
        FunctionResultCode.SUCCESS);
    assert.deepEqual(amounts, [0.50006, 0.49994000000000005]);
  });
});
