const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test } = require('node:test');

for (const failure of ['index', 'existing-public', 'existing-private', 'nested-private',
  'image', 'dead', 'bypass', 'busy']) {
  test(`capture refuses ${failure} before signalling or changing a node`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-preflight-'));
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    const log = path.join(root, 'docker.jsonl');
    const plan = path.join(root, 'plan.json');
    const output = path.join(root, 'public');
    const privateRoot = failure === 'nested-private' ? path.join(output, 'private') :
        path.join(root, 'private');
    const image = `sha256:${'a'.repeat(64)}`;
    fs.writeFileSync(plan, JSON.stringify({ image }));
    if (failure === 'existing-public') fs.mkdirSync(output);
    if (failure === 'existing-private') fs.mkdirSync(privateRoot);
    const executable = (name, source) => fs.writeFileSync(path.join(bin, name),
        `#!${process.execPath}\n${source}`, { mode: 0o700 });
    executable('docker', `
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'image') console.log(process.env.CASE === 'image' ? 'other' : '${image}');
else if (args[0] === 'inspect' && args.includes('--format')) {
  console.log(process.env.CASE === 'dead' ? 'false' : 'true');
} else if (args[0] === 'inspect') {
  console.log(JSON.stringify([{ Config: { Env: process.env.CASE === 'bypass' ? [] :
    ['ENABLE_TX_SIG_VERIF_WORKAROUND=false'] } }]));
} else process.exit(99);
`);
    executable('jq', `
const fs = require('fs');
if (process.argv[2] === '-er') {
  console.log(JSON.parse(fs.readFileSync(process.argv.at(-1))).image);
} else {
  const data = JSON.parse(fs.readFileSync(0));
  process.exit(data[0].Config.Env.includes('ENABLE_TX_SIG_VERIF_WORKAROUND=false') ? 0 : 1);
}
`);
    executable('ss', 'if (process.env.CASE === \'busy\') console.log(\'existing inspector\');\n');
    try {
      const result = spawnSync('bash', [path.join(__dirname, 'capture-pending-checkpoint.sh'),
        plan, failure === 'index' ? '10' : '2', output, privateRoot], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CASE: failure, CALL_LOG: log },
        encoding: 'utf8', timeout: 10000,
      });
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n')
        .filter(Boolean).map(JSON.parse) : [];
      assert.ok(calls.every((args) => ['inspect', 'image'].includes(args[0])));
      if (failure !== 'existing-public') assert.equal(fs.existsSync(output), false);
      if (failure !== 'existing-private') assert.equal(fs.existsSync(privateRoot), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
