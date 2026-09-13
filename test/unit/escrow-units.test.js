const assert = require('assert/strict');
const { toMicroUnits, fromMicroUnits, transferBalances,
  releaseAmounts } = require('../../db/escrow-units');

describe('Canonical native escrow micro-units', () => {
  for (const units of [0, 1, 249, 12345, 499940, 500060, 1000000, 2 ** 32]) {
    it(`round-trips ${units} units without floating multiplication`, () => {
      assert.equal(toMicroUnits(fromMicroUnits(units)), units);
    });
  }

  it('rejects the original residual instead of relaxing the six-decimal rule', () => {
    assert.equal(1 - 0.50006, 0.49994000000000005);
    assert.throws(() => toMicroUnits(1 - 0.50006), /canonical/);
    assert.deepEqual(releaseAmounts({ version: 2, source_units: 499940,
      target_units: 500060 }, 1), { source: 0.49994, target: 0.50006 });
  });

  it('debits both payout legs to exactly zero and conserves credits in units', () => {
    const target = transferBalances(1, 9.5, 0.50006);
    const source = transferBalances(target.from, 9.5, 0.49994);
    assert.deepEqual(target, { from: 0.49994, to: 10.00006 });
    assert.deepEqual(source, { from: 0, to: 9.99994 });
    assert.equal(toMicroUnits(source.to) + toMicroUnits(target.to), 20000000);
  });

  it('adds fractional deposits without retaining 0.1+0.2 residue', () => {
    assert.deepEqual(transferBalances(1, 0.1, 0.2), { from: 0.8, to: 0.3 });
    assert.deepEqual(transferBalances(1, null, 0.000249), { from: 0.999751, to: 0.000249 });
  });

  it('retains ordinary account arithmetic without rounding away pre-existing residue', () => {
    const residue = 0.1 + 0.2;
    const balances = transferBalances(1, residue, 0.49994, { toEscrow: false });
    assert.equal(balances.from, 0.50006);
    assert.equal(balances.to, residue + 0.49994);
    assert.equal(Math.round((balances.to - residue) * 1000000), 499940);
    assert.deepEqual(transferBalances(residue, 0, 0.1, { fromEscrow: false }),
        { from: residue - 0.1, to: 0.1 });
    assert.throws(() => transferBalances(1, 1e21, 0.1, { toEscrow: false }), /represent/);
  });

  for (const value of [-1, NaN, Infinity, '1', 0.0000001, 0.30000000000000004, 1e21]) {
    it(`refuses unsupported balance ${value} rather than rounding existing assets`, () => {
      assert.throws(() => transferBalances(1, value, 0.1));
    });
  }

  it('rejects malformed, overflowing, inflating, zero and ratio-mixed releases', () => {
    const release = { version: 2, source_units: 499940, target_units: 500060 };
    for (const invalid of [null, { ratio: 0.50006 }, { ...release, version: 1 },
      { ...release, ratio: 0.50006 }, { ...release, source_units: 499941 },
      { ...release, source_units: -1 }, { ...release, source_units: 0.5 },
      { ...release, target_units: Number.MAX_SAFE_INTEGER },
      { version: 2, source_units: 0, target_units: 0 }]) {
      assert.throws(() => releaseAmounts(invalid, 1));
    }
    for (const amount of [0, -1, 2]) assert.throws(() => transferBalances(1, 0, amount));
  });

  it('handles either zero allocation without creating a zero transfer', () => {
    assert.deepEqual(releaseAmounts({ version: 2, source_units: 0, target_units: 1000000 }, 1),
        { source: 0, target: 1 });
    assert.deepEqual(releaseAmounts({ version: 2, source_units: 1000000, target_units: 0 }, 1),
        { source: 1, target: 0 });
  });
});
