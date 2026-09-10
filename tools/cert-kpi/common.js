// KPI 하네스 공통 모듈
const Ain = require('@ainblockchain/ain-js').default;
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 저장소 루트(tools/cert-kpi 의 두 단계 위). 결과·로그·증빙은 KPI_DIR 아래(기본: <repo>/tools/cert-kpi/work)
const REPO = path.resolve(__dirname, '..', '..');
const KPI_DIR = process.env.KPI_DIR || path.join(__dirname, 'work');
const ACCOUNTS = JSON.parse(fs.readFileSync(path.join(REPO, 'blockchain-configs/base/genesis_accounts.json'))).others;
const RESULTS_DIR = path.join(KPI_DIR, 'results');
fs.mkdirSync(RESULTS_DIR, { recursive: true });

const NODES = Array.from({ length: 10 }, (_, i) => `http://localhost:${8081 + i}`);
const EH_URLS = ['ws://localhost:5100', 'ws://localhost:5101'];
const APP = 'ai_network_dag';

function newAin(nodeIdx = 0, ehIdx = null, accountIdx = 10) {
  // accountIdx 10..19: 검증자(0..9)와 분리된 시험 계정 (genesis 시드 20개)
  const ain = new Ain(NODES[nodeIdx], ehIdx === null ? null : EH_URLS[ehIdx], 0);
  ain.wallet.addAndSetDefaultAccount(ACCOUNTS[accountIdx].private_key);
  return ain;
}

function envSnapshot() {
  const commits = {};
  try {
    commits['ain-blockchain'] = execSync(`git -C ${REPO} rev-parse HEAD`).toString().trim();
  } catch {
    // 리뷰 반영: 저장소 부재 시 증빙 파일에서 확보, 그래도 없으면 명시적으로 표기
    try {
      commits['ain-blockchain'] = fs.readFileSync(path.join(KPI_DIR, 'evidence/ain-blockchain.commit'), 'utf8').trim();
    } catch { commits['ain-blockchain'] = 'unavailable'; }
  }
  return {
    node: process.version,
    commits,
    epochMs: 1000,
    validators: 10,
    timestamp: new Date().toISOString(),
    host: require('os').hostname(),
    cpus: require('os').cpus().length,
  };
}

function writeResult(name, data) {
  const file = path.join(RESULTS_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...data, env: envSnapshot() }, null, 2));
  console.log(`[result] ${file}`);
  return file;
}

function percentile(arr, p) {
  // nearest-rank: 0-based index = ceil(n*p) - 1 (리뷰 반영: off-by-one 수정)
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.max(0, Math.min(s.length - 1, Math.ceil(s.length * p) - 1))];
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 리뷰 반영: 고정 sleep 대신 tx 최종화(finalization)를 영수증 기반으로 증명
async function waitFinalized(ain, txHashes, timeoutMs = 60000, pollMs = 1000) {
  const t0 = Date.now();
  const status = new Map();   // txHash -> { finalized, blockNumber }
  let remaining = [...txHashes];
  while (remaining.length > 0 && Date.now() - t0 < timeoutMs) {
    const results = await Promise.all(remaining.map(h =>
      ain.getTransactionByHash(h).catch(() => null)));
    const next = [];
    remaining.forEach((h, i) => {
      const r = results[i];
      const fin = r && (r.is_finalized === true || r.state === 'FINALIZED');
      if (fin) {
        status.set(h, { finalized: true, blockNumber: r.number ?? r.block_number ?? null });
      } else next.push(h);
    });
    remaining = next;
    if (remaining.length > 0) await sleep(pollMs);
  }
  remaining.forEach(h => status.set(h, { finalized: false, blockNumber: null }));
  return { status, allFinalized: remaining.length === 0, pendingCount: remaining.length };
}

module.exports = { Ain, ACCOUNTS, NODES, EH_URLS, APP, newAin, writeResult, percentile, sleep, waitFinalized, RESULTS_DIR, KPI_DIR, REPO };
