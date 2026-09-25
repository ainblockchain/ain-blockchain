const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[2], 'utf8');
const method = source.slice(source.indexOf('  setEpochTransition() {'), source.indexOf('\n  stop() {'));
let time = 113, duration = 250, origin = null, id = 0;
const timers = new Map();
const C = vm.runInNewContext(`(class { ${method} })`, {
  Date: { now: () => time }, Symbol,
  setTimeout: (fn, ms) => { timers.set(++id, { fn, at: time + ms }); return id; },
  clearInterval: key => timers.delete(key),
  logger: { info() {}, debug() {}, error(e) { throw Error(e); } },
  NodeConfigs: { HOSTING_ENV: 'local' }, HostingEnvs: { LOCAL: 'local' },
});
function instance() {
  const c = new C();
  Object.assign(c, { startingTime: 0, timeAdjustment: 0, epoch: 0,
    node: { getBlockchainParam: p => p === 'genesis/epoch_ms' ? duration : p === 'consensus/epoch_time_origin_ms' ? origin : 10,
      bc: { genesisBlock: { timestamp: 0 }, lastBlock: () => ({ number: 1 }) }, tryFinalizeChain() {} },
    isConsensusHealthy: () => true, updateProposer() {}, tryPropose() {},
  });
  return c;
}
(async () => {
  const a = instance(); a.setEpochTransition();
  time = 219; const b = instance(); b.setEpochTransition();
  assert.equal(timers.get(a.epochInterval).at, 255);
  assert.equal(timers.get(b.epochInterval).at, 255);
  time = 255; await timers.get(a.epochInterval).fn();
  assert.equal(timers.get(a.epochInterval).at, 505);
  duration = 125; time = 505; await timers.get(a.epochInterval).fn();
  assert.equal(timers.get(a.epochInterval).at, 630);
  const old = timers.get(a.epochInterval).fn;
  a.setEpochTransition(); const current = a.epochInterval;
  await old(); assert.equal(a.epochInterval, current);
  const previousEpoch = a.epoch;
  duration = 250; origin = time - (previousEpoch + 100) * duration;
  a.setEpochTransition(); time = timers.get(a.epochInterval).at;
  await timers.get(a.epochInterval).fn();
  assert.ok(a.epoch > previousEpoch, 'a longer interval must not move the epoch backwards');
  console.log('PASS: absolute alignment, recurring alignment, parameter refresh, generation guard, monotonic interval change');
})().catch(e => { console.error(e); process.exitCode = 1; });
