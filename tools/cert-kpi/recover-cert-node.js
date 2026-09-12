const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

async function main() {
  const nodeIndex = Number(process.argv[2]);
  if (!Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex > 9) throw new Error('usage: node recover-cert-node.js <0..9>');
  const root = __dirname;
  const manifestPath = path.join(root, 'cert-net.manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  const oldPid = manifest.pids[nodeIndex + 1];
  try {
    process.kill(oldPid, 0);
    throw new Error(`recorded pid ${oldPid} is still live; recovery refused`);
  } catch (error) { if (error.code !== 'ESRCH') throw error; }
  const ports = [8081 + nodeIndex, 5001 + nodeIndex];
  if (nodeIndex >= 8) ports.push(5100 + nodeIndex - 8);
  const listeners = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  for (const port of ports) if (new RegExp(`:${port}\\s`).test(listeners)) throw new Error(`port ${port} is occupied`);
  const repo = process.env.AIN_BLOCKCHAIN_REPO || path.join(root, 'ain-blockchain-runtime');
  const genesisFile = path.join(repo, manifest.configDir, 'genesis_block.json.gz');
  const genesis = JSON.parse(require('zlib').gunzipSync(fs.readFileSync(genesisFile)));
  if (genesis.hash !== manifest.genesisHash) throw new Error('runtime genesis differs from preserved chain');
  const heap = process.env.NODE_HEAP_MB || '8192';
  if (!/^[1-9][0-9]*$/.test(heap)) throw new Error('invalid NODE_HEAP_MB');
  const runId = `recover_node${nodeIndex}_${Date.now()}`;
  const evidencePath = path.join(root, 'evidence', `${runId}.json`);
  const logPath = path.join(root, 'logs', `${runId}.log`);
  fs.writeFileSync(evidencePath, JSON.stringify({ runId, nodeIndex, oldPid, before: manifest, repo, heapMB: Number(heap), logPath }, null, 2), { flag: 'wx' });
  const accounts = JSON.parse(fs.readFileSync(path.join(repo, 'blockchain-configs/base/genesis_accounts.json')));
  const env = { ...process.env,
    UNSAFE_PRIVATE_KEY: accounts.others[nodeIndex].private_key,
    BLOCKCHAIN_CONFIGS_DIR: manifest.configDir,
    BLOCKCHAIN_DATA_DIR: path.join(manifest.dataDir, `node${nodeIndex}`),
    PORT: String(8081 + nodeIndex), P2P_PORT: String(5001 + nodeIndex),
    TRACKER_UPDATE_JSON_RPC_URL: 'http://localhost:8079/json-rpc',
    PEER_CANDIDATE_JSON_RPC_URL: 'http://localhost:8081/json-rpc',
    HOSTING_ENV: 'local', CONSOLE_LOG: 'false', ENABLE_EXPRESS_RATE_LIMIT: 'false',
    ENABLE_GAS_FEE_WORKAROUND: 'true', ENABLE_TX_SIG_VERIF_WORKAROUND: 'true',
    ENABLE_REST_FUNCTION_CALL: 'true', TX_POOL_SIZE_LIMIT: '1000000', TX_POOL_SIZE_LIMIT_PER_ACCOUNT: '200000',
    MAX_NUM_INBOUND_CONNECTION: '12', TARGET_NUM_OUTBOUND_CONNECTION: '9',
  };
  if (nodeIndex >= 8) { env.ENABLE_EVENT_HANDLER = 'true'; env.EVENT_HANDLER_PORT = String(5100 + nodeIndex - 8); }
  const args = ['--max-old-space-size=' + heap, './client/index.js'];
  const command = manifest.chainCpus ? 'taskset' : process.execPath;
  const commandArgs = manifest.chainCpus ? ['-c', manifest.chainCpus, process.execPath, ...args] : args;
  const logfile = fs.openSync(logPath, 'wx');
  const child = spawn(command, commandArgs, { cwd: repo, env, detached: true, stdio: ['ignore', logfile, logfile] });
  fs.closeSync(logfile);
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
  manifest.pids[nodeIndex + 1] = child.pid;
  manifest.recoveries = [...(manifest.recoveries || []), { runId, nodeIndex, oldPid, pid: child.pid, heapMB: Number(heap), logPath, repo }];
  const temporary = manifestPath + '.recovering';
  fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(temporary, manifestPath);
  fs.writeFileSync(path.join(root, 'cert-net.pids'), manifest.pids.join('\n') + '\n');
  console.log(JSON.stringify({ runId, pid: child.pid, logPath, evidencePath, status: 'started; run harness/preflight.js after synchronization' }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
