const fs = require('fs');
const path = require('path');
const { envSnapshot, KPI_DIR } = require('./common');

async function main() {
  const runId = process.env.RUN_ID;
  if (!runId || !/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error('valid RUN_ID required');
  const environment = await envSnapshot();
  const output = path.join(KPI_DIR, 'evidence', runId, 'environment.json');
  const checks = {
    dockerContainersValid: environment.docker?.chainValidation.ok === true,
    tenServing: environment.chain.servingNodes === 10,
    tenIdentities: environment.chain.distinctValidatorAddrs === 10,
    tenBlockValidators: environment.chain.blockValidators === 10,
    measuredClientCgroup: !!environment.docker?.clientCgroup['cpu.max'] && !!environment.docker?.clientCgroup['memory.max'],
  };
  const pass = Object.values(checks).every(Boolean);
  fs.writeFileSync(output, JSON.stringify({ checks, pass, environment }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, checks, pass }, null, 2));
  process.exitCode = pass ? 0 : 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
