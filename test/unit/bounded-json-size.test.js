const assert = require('assert/strict');
const boundedJsonSize = require('../../block-pool/bounded-json-size');

describe('Bounded evidence JSON byte accounting', () => {
  it('matches UTF-8 JSON bytes, escaping, omitted properties and shared subtrees', () => {
    const shared = { text: '한글\n"\\\ud800', absent: undefined };
    for (const value of [null, false, -12.5, NaN, Infinity, shared, [], {},
      { shared, again: shared }, [undefined, shared, () => null, Symbol('omitted')]]) {
      const bytes = Buffer.byteLength(JSON.stringify(value));
      assert.equal(boundedJsonSize(value, bytes), bytes);
      assert.equal(boundedJsonSize(value, bytes - 1), null);
    }
  });

  it('stops before traversing the rest of an oversized candidate', () => {
    let visited = false;
    const candidate = { block: 'large'.repeat(1000), get votes() {
      visited = true;
      return [];
    } };
    assert.equal(boundedJsonSize(candidate, 1024), null);
    assert.equal(visited, false);
  });

  it('refuses cycles, excessive nesting, BigInt and custom serialization', () => {
    const cyclic = {};
    cyclic.self = cyclic;
    let nested = null;
    for (let index = 0; index < 300; index++) nested = [nested];
    let invoked = false;
    for (const value of [cyclic, nested, { number: BigInt(1) },
      { toJSON() {
        invoked = true;
        return {};
      } }]) {
      assert.equal(boundedJsonSize(value, 1024 ** 2), null);
    }
    assert.equal(invoked, false);
    assert.throws(() => boundedJsonSize({}, -1), /invalid JSON byte limit/);
  });
});
