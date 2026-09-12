// KPI 하네스 공통 모듈 (지표 1~6 공용)
// 리뷰 반영(2026-09-10 평가환경 점검):
//  - envSnapshot: 하드코딩(epochMs/validators) 제거 → 라이브 체인·호스트에서 실측 조회
//  - waitFinalized: state === 'FINALIZED' 만 최종화로 인정 (REVERTED 제외)
//  - getValueFinal: 최종화 상태(is_final) 기준 역검증 헬퍼
//  - 결과 JSON 은 '어느 체인 인스턴스에서 측정했는가'(genesis hash, config)를 항상 포함
const Ain = require('@ainblockchain/ain-js').default;
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { isDeepStrictEqual } = require('util');
const { dockerSnapshot, validateDockerChain } = require('./docker-snapshot');

const KPI_DIR = process.env.KPI_DIR || path.resolve(__dirname, '..');   // 기본: 이 번들(tools/cert-kpi)
// ain-blockchain 저장소 위치(커밋 해시 조회용): AIN_BLOCKCHAIN_REPO, 기본은 kpi/ain-blockchain-runtime (시험에 사용한 작업 사본, 핀 커밋 5b0373e).
// 없으면 evidence/ain-blockchain.commit 으로 대체한다.
const REPO = process.env.AIN_BLOCKCHAIN_REPO || path.resolve(KPI_DIR, '..', '..');   // 기본: 이 번들을 담은 ain-blockchain 클론
const ACCOUNTS = JSON.parse(fs.readFileSync(`${__dirname}/genesis_accounts.json`)).others;
const RESULTS_DIR = process.env.RESULTS_DIR || `${KPI_DIR}/results`;
const NET_MANIFEST = process.env.NET_MANIFEST || `${KPI_DIR}/cert-net.manifest.json`;   // start-cert-net.sh 가 기록

const NODES = process.env.CHAIN_URLS ? JSON.parse(process.env.CHAIN_URLS) :
  Array.from({ length: 10 }, (_, index) => `http://localhost:${Number(process.env.CHAIN_PORT_BASE || 8081) + index}`);
const EH_URLS = process.env.CHAIN_EVENT_URLS ? JSON.parse(process.env.CHAIN_EVENT_URLS) : ['ws://localhost:5100', 'ws://localhost:5101'];
if (!Array.isArray(NODES) || NODES.length !== 10 || new Set(NODES).size !== 10) throw new Error('exactly ten distinct CHAIN_URLS required');
if (!Array.isArray(EH_URLS) || EH_URLS.length !== 2) throw new Error('exactly two CHAIN_EVENT_URLS required');
const APP = 'ai_network_dag';

// AIN DB 경로 라벨은 '.' 불허 (code 10102) → 영숫자/_/- 만 허용
const safeName = id => String(id).replace(/[^A-Za-z0-9_\-]/g, '_');

function newAin(nodeIdx = 0, ehIdx = null, accountIdx = 10) {
  // accountIdx 10..19: 검증자(0..9)와 분리된 시험 계정 (genesis 시드 20개)
  const ain = new Ain(NODES[nodeIdx], ehIdx === null ? null : EH_URLS[ehIdx], 0);
  ain.wallet.addAndSetDefaultAccount(ACCOUNTS[accountIdx].private_key);
  return ain;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function httpJson(url, timeoutMs = 3000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  return r.json();
}

// 라이브 체인 스냅샷: 결과 JSON 의 env 블록. 실패한 항목은 null 로 남겨 '측정 불가'를 드러낸다.
async function chainSnapshot(nodeUrl = NODES[0]) {
  const out = {
    configDir: null, genesisHash: null, epochMs: null, bandwidthBudgetPerBlock: null,
    validators: null, validatorAddrs: null, servingNodes: null, lastBlockNumber: null, chainCpus: null, clientCpus: null,
  };
  try {
    if (process.env.CHAIN_CONTAINER_PROJECT) throw new Error('Docker chain does not use host PID manifest');
    const m = JSON.parse(fs.readFileSync(NET_MANIFEST, 'utf8'));
    out.configDir = m.configDir || null;
    // 검증자 프로세스의 CPU 친화도(단일 호스트 리허설의 코어 분할 기록): 매니페스트의 두 번째 PID(node0) 기준
    try {
      const pid = m.pids && m.pids[1];
      if (pid) out.chainCpus = execSync(`taskset -pc ${pid}`, { timeout: 3000 }).toString().trim().split(':').pop().trim();
    } catch { out.chainCpus = null; }
  } catch {}
  try { out.clientCpus = execSync(`taskset -pc ${process.pid}`, { timeout: 3000 }).toString().trim().split(':').pop().trim(); } catch { out.clientCpus = null; }
  try {
    // REST /get_block_by_number (JSON-RPC ain_getBlockByNumber 는 genesis 블록에서 서버측 tx-hash 추출 오류를 로그에 남김)
    const g = await httpJson(`${nodeUrl}/get_block_by_number?number=0`);
    out.genesisHash = g && g.result ? g.result.hash : null;
  } catch {}
  try { out.epochMs = (await httpJson(`${nodeUrl}/get_value?ref=/blockchain_params/genesis/epoch_ms`)).result; } catch {}
  try { out.bandwidthBudgetPerBlock = (await httpJson(`${nodeUrl}/get_value?ref=/blockchain_params/resource/bandwidth_budget_per_block`)).result; } catch {}
  try {
    const v = (await httpJson(`${nodeUrl}/get_value?ref=/blockchain_params/consensus/genesis_validators`)).result;
    if (v) { out.validatorAddrs = Object.keys(v); out.validators = out.validatorAddrs.length; }
  } catch {}
  try {
    // 라이브 블록의 검증자 집합(설정값이 아닌 실제 합의 참여자)과 블록 정보
    const lb = (await httpJson(`${nodeUrl}/last_block`, 5000)).result;
    if (lb) {
      out.lastBlockNumber = lb.number; out.lastBlockHash = lb.hash; out.lastBlockTimestamp = lb.timestamp;
      out.blockValidators = lb.validators ? Object.keys(lb.validators).length : null;
      out.blockLastVotes = Array.isArray(lb.last_votes) ? lb.last_votes.length : null;
    }
  } catch {}
  if (out.lastBlockNumber == null) { try { out.lastBlockNumber = (await httpJson(`${nodeUrl}/last_block_number`)).result; } catch {} }
  // 노드별 신원·상태 (10개 REST 엔드포인트 각각): 같은 genesis 위의 서로 다른 검증자임을 파일만으로 확인 가능하게
  const nodes = [];
  for (const n of NODES) {
    const rec = { url: n, state: null, address: null, lastBlockNumber: null };
    try {
      const st = (await httpJson(`${n}/node_status`, 1500)).result;
      if (st) { rec.state = st.state; rec.address = st.address || null; rec.lastBlockNumber = st.lastBlockNumber ?? (st.lastBlock && st.lastBlock.number) ?? null; }
      if (rec.lastBlockNumber === null) {
        const head = (await httpJson(`${n}/last_block`, 1500)).result;
        rec.lastBlockNumber = head?.number ?? null;
        rec.lastBlockHash = head?.hash ?? null;
      }
    } catch {}
    nodes.push(rec);
  }
  out.nodes = nodes;
  out.servingNodes = nodes.filter(r => r.state === 'SERVING').length;
  out.distinctValidatorAddrs = new Set(nodes.map(r => r.address).filter(Boolean)).size;
  return out;
}

function hostSnapshot() {
  const os = require('os');
  let gpus = null;
  try {
    gpus = execSync('nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader', { timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim().split('\n').map(l => l.trim());
  } catch {}
  let commit = null;
  try { commit = execSync(`git -C ${REPO} rev-parse HEAD`, { timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {
    try { commit = fs.readFileSync(`${KPI_DIR}/evidence/ain-blockchain.commit`, 'utf8').trim(); } catch { commit = null; }
  }
  return {
    node: process.version,
    harnessSourceSha256: process.env.KPI_SOURCE_SHA256 || null,
    commits: { 'ain-blockchain': commit },
    host: os.hostname(), cpus: os.cpus().length, memGB: Math.round(os.totalmem() / 2 ** 30), gpus,
    declaredTopology: 'single-host rehearsal: 10 validator processes + tracker on one host; GPU roles on the same host (declared, not measured — see doc §2.4)',
    timestamp: new Date().toISOString(),
  };
}

async function envSnapshot() {
  const env = { ...hostSnapshot(), chain: await chainSnapshot() };
  if (process.env.CHAIN_CONTAINER_PROJECT) {
    env.workspaceCommits = env.commits;
    env.commits = { 'ain-blockchain': null };
    env.declaredTopology = 'Docker containers sharing one host; limits and image identities are measured in env.docker';
    env.docker = await dockerSnapshot(process.env.CHAIN_CONTAINER_PROJECT);
    if (!env.docker.clientCgroup['cpu.max'] || env.docker.clientCgroup['cpu.max'].startsWith('max ') ||
        !env.docker.clientCgroup['memory.max'] || env.docker.clientCgroup['memory.max'] === 'max') {
      throw new Error('Docker benchmark client requires measured CPU and memory cgroup limits');
    }
    env.docker.chainValidation = validateDockerChain(env.docker, NODES);
    const nodes = env.docker.containers.filter(container => /^node[0-9]$/.test(container.service || ''));
    const configs = [...new Set(nodes.map(node => node.chainConfig))];
    env.chain.configDir = configs.length === 1 ? configs[0] : null;
    env.chain.chainCpus = [...new Set(nodes.map(node => node.cpuSet))].join(';') || null;
    env.chain.clientCpus = env.docker.clientCgroup['cpuset.cpus.effective'];
    const revisions = [...new Set(nodes.map(node => node.sourceRevision))];
    env.commits['ain-blockchain'] = revisions.length === 1 ? revisions[0] : null;
    if (!env.docker.chainValidation.ok) throw new Error(`Docker chain environment invalid: ${env.docker.chainValidation.errors.join('; ')}`);
  }
  return env;
}

// 결과 파일 가드: 같은 이름의 결과가 이미 있으면 실행을 거부한다(회차 덮어쓰기 방지, §3.5 항목 6)
function assertResultFree(name) {
  const file = path.join(RESULTS_DIR, `${name}.json`);
  if (fs.existsSync(file)) throw new Error(`result file already exists: ${file} — use a new RUN_ID`);
}
// 온체인 경로 가드: 이 회차의 경로가 이미 존재하면 거부(RUN_ID 재사용 방지)
async function assertChainPathFree(ain, refPath) {
  const v = await ain.db.ref(refPath).getValue().catch(() => null);
  if (v !== null && v !== undefined) throw new Error(`on-chain path already exists: ${refPath} — use a new RUN_ID`);
}

// envBefore: 스크립트가 측정 시작 전에 찍은 envSnapshot() (있으면 env.before 로 함께 기록)
async function writeResult(name, data, envBefore = null) {
  const file = path.join(RESULTS_DIR, `${name}.json`);
  const env = await envSnapshot();
  if (envBefore) env.before = envBefore;
  fs.writeFileSync(file, JSON.stringify({ ...data, env }, null, 2));
  console.log(`[result] ${file}`);
  return file;
}

// 블록 데이터 기준 포함 재검증(영수증 트래커는 노드 메모리라 재기동 후 사라짐 → 블록 파일로 영구 검증)
async function verifyTxInBlock(nodeUrl, blockNumber, txHash) {
  if (blockNumber == null) return { ok: false, reason: 'no block number' };
  try {
    const b = (await httpJson(`${nodeUrl}/get_block_by_number?number=${blockNumber}`, 10000)).result;
    if (!b || !Array.isArray(b.transactions)) return { ok: false, reason: 'block not found' };
    const ok = b.transactions.some(t => t && t.hash === txHash);
    return { ok, blockHash: b.hash, blockTimestamp: b.timestamp, txCount: b.transactions.length, proposer: b.proposer };
  } catch (e) { return { ok: false, reason: String(e.message) }; }
}

function percentile(arr, p) {
  // nearest-rank: 0-based index = ceil(n*p) - 1
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.max(0, Math.min(s.length - 1, Math.ceil(s.length * p) - 1))];
}

// tx 최종화(finalization)를 영수증으로 증명. state === 'FINALIZED' 만 인정(REVERTED = 블록 포함됐으나 실패).
async function waitFinalized(ain, txHashes, timeoutMs = 60000, pollMs = 1000) {
  const t0 = Date.now();
  const status = new Map();   // txHash -> { finalized, state, blockNumber }
  let remaining = [...txHashes];
  while (remaining.length > 0 && Date.now() - t0 < timeoutMs) {
    const results = await Promise.all(remaining.map(h => ain.getTransactionByHash(h).catch(() => null)));
    const next = [];
    remaining.forEach((h, i) => {
      const r = results[i];
      if (r && r.state === 'FINALIZED') {
        status.set(h, { finalized: true, state: r.state, blockNumber: r.number ?? null });
      } else if (r && r.state === 'REVERTED') {
        status.set(h, { finalized: false, state: r.state, blockNumber: r.number ?? null });
      } else next.push(h);
    });
    remaining = next;
    if (remaining.length > 0) await sleep(pollMs);
  }
  remaining.forEach(h => status.set(h, { finalized: false, state: 'PENDING_OR_UNKNOWN', blockNumber: null }));
  const finalizedCount = [...status.values()].filter(s => s.finalized).length;
  // 빈 입력은 '전부 최종화' 로 보지 않는다 (공허한 통과 방지)
  return { status, allFinalized: txHashes.length > 0 && finalizedCount === txHashes.length, finalizedCount, pendingCount: remaining.length };
}

// 최종화 상태 기준 읽기 (풀에서 선실행된 값이 아니라 확정 블록의 상태)
function getValueFinal(ain, refPath) {
  return ain.db.ref(refPath).getValue(undefined, { is_final: true });
}

// is_final 읽기 (재시도): 제출 노드가 FINALIZED 를 보고한 직후 다른 노드의 최종화가 몇 블록 늦을 수 있어, 조건이 맞을 때까지 최대 timeoutMs 동안 다시 읽는다.
// 반환: { value, waitedMs } (조건 불충족이면 마지막 값)
async function getValueFinalUntil(ain, refPath, check, timeoutMs = 30000, pollMs = 500) {
  const t0 = Date.now();
  let v = null;
  while (true) {
    v = await ain.db.ref(refPath).getValue(undefined, { is_final: true }).catch(() => null);
    if (check(v) || Date.now() - t0 >= timeoutMs) return { value: v, waitedMs: Date.now() - t0 };
    await sleep(pollMs);
  }
}

// setValue → 최종화 영수증 → is_final getValue 까지 한 번에 (M5/M6 온체인 기록·역검증 공용)
async function recordAndVerifyFinal(ain, refPath, value, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('recordAndVerifyFinal options must be an object');
  }
  const { timeoutMs = 90000, check, reader = newAin(5), blockNode = NODES[9] } = options;
  const matches = observed => isDeepStrictEqual(observed, value) && (!check || check(observed));
  const res = await ain.db.ref(refPath).setValue({ value, gas_price: 1, nonce: -1 });
  if (!res || !res.tx_hash || !res.result || res.result.code !== 0) {
    throw new Error(`onchain record failed: ${JSON.stringify(res && (res.result || res)).slice(0, 200)}`);
  }
  const fin = await waitFinalized(ain, [res.tx_hash], timeoutMs);
  const st = fin.status.get(res.tx_hash);
  if (!st.finalized) throw new Error(`tx ${res.tx_hash} not finalized: ${st.state}`);
  const readback = await getValueFinalUntil(reader, refPath, matches, timeoutMs);
  if (!matches(readback.value)) throw new Error(`independent is_final getValue mismatch at ${refPath}`);
  const block = await verifyTxInBlockUntil(blockNode, st.blockNumber, res.tx_hash, timeoutMs);
  if (!block.ok) throw new Error(`independent block verification failed: ${block.reason || 'transaction absent'}`);
  return {
    txHash: res.tx_hash, blockNumber: st.blockNumber, value: readback.value,
    receipt: { state: st.state, block: st.blockNumber },
    readback: { node: options.reader ? (options.readerNode || null) : NODES[5], waitedMs: readback.waitedMs },
    blockVerification: { node: blockNode, ...block },
  };
}

// 블록 재검증(재시도): 검증 노드가 몇 블록 뒤처져 있을 수 있으므로 블록이 나타날 때까지 최대 timeoutMs 대기
async function verifyTxInBlockUntil(nodeUrl, blockNumber, txHash, timeoutMs = 30000, pollMs = 1000) {
  const t0 = Date.now();
  let v = await verifyTxInBlock(nodeUrl, blockNumber, txHash);
  while (!v.ok && v.reason === 'block not found' && Date.now() - t0 < timeoutMs) { await sleep(pollMs); v = await verifyTxInBlock(nodeUrl, blockNumber, txHash); }
  return { ...v, waitedMs: Date.now() - t0 };
}

module.exports = {
  Ain, ACCOUNTS, NODES, EH_URLS, APP, KPI_DIR, REPO, RESULTS_DIR, NET_MANIFEST,
  newAin, writeResult, envSnapshot, chainSnapshot, hostSnapshot, percentile, sleep, httpJson,
  waitFinalized, getValueFinal, getValueFinalUntil, recordAndVerifyFinal, safeName,
  assertResultFree, assertChainPathFree, verifyTxInBlock, verifyTxInBlockUntil,
};
