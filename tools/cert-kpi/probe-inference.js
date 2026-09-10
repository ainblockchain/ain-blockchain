// M4 사전 프로브: N 동시 클라이언트로 RPS 측정 (라운드로빈)
// 사용: node probe-inference.js <mode:chat|comp> <concurrency> <seconds> [maxTokens] [nServers]
const mode = process.argv[2] || 'chat';
const CONC = parseInt(process.argv[3] || '240', 10);
const SECS = parseInt(process.argv[4] || '20', 10);
const MAXTOK = parseInt(process.argv[5] || '512', 10);
const NSRV = parseInt(process.argv[6] || '6', 10);
const SERVERS = Array.from({ length: NSRV }, (_, i) => `http://localhost:${8001 + i}`);

const PROMPTS = process.env.SHORT ? [
  'Q: 2+2=? Reply with only the number.',
  'Q: capital of France? Reply with only the city name.',
  'Q: 7*8=? Reply with only the number.',
  'Q: first letter of alphabet? Reply with only the letter.',
] : [
  'What is blockchain sharding? Answer in one short sentence.',
  'Define a state channel in one short sentence.',
  'What does TPS stand for? Answer briefly.',
  'Name one benefit of decentralized AI in one sentence.',
];

let done = 0, fail = 0, rr = 0, tokens = 0;
let recQueued = 0, recInflight = 0, recRR = 0;
let recBuf = [];
const RUNTAG = Date.now().toString(36);
function flushRec() {
  if (recBuf.length === 0) return;
  const batch = recBuf; recBuf = [];
  recInflight++;
  fetch(`http://localhost:${9100 + (recRR++ % 2)}/record`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  }).then(() => { recQueued += batch.length; recInflight--; })
    .catch(() => { recInflight--; });
}
const perSec = new Array(SECS + 5).fill(0);
const lat = [];
const t0 = Date.now();

async function worker() {
  while (Date.now() - t0 < SECS * 1000) {
    const s = SERVERS[rr++ % SERVERS.length];
    const p = PROMPTS[rr % PROMPTS.length];
    const body = mode === 'chat'
      ? { model: 'gpt-oss-20b', messages: [{ role: 'user', content: p }], max_tokens: MAXTOK }
      : { model: 'gpt-oss-20b', prompt: p + '\nAnswer:', max_tokens: MAXTOK, stop: ['\n', '.'] };
    const url = s + (mode === 'chat' ? '/v1/chat/completions' : '/v1/completions');
    const rs = Date.now();
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
      });
      if (r.ok) {
        const j = await r.json();
        tokens += (j.usage && j.usage.completion_tokens) || 0;
        done++;
        const sec = ((Date.now() - t0) / 1000) | 0;
        if (sec < perSec.length) perSec[sec]++;
        lat.push(Date.now() - rs);
        if (process.env.RECORD) {
          // 온-오프체인 구성: 기록을 50건 배치로 recorder에 전달 (클라이언트 HTTP 부하 1/50)
          recBuf.push({
            requestId: `m4c-${RUNTAG}-${done}-${rr}`,
            timestamp: Date.now(),
            tokensGenerated: (j.usage && j.usage.completion_tokens) || 0,
            inferenceTimeMs: Date.now() - rs,
          });
          if (recBuf.length >= 50) flushRec();
        }
      } else { fail++; await r.text(); }
    } catch { fail++; }
  }
}

(async () => {
  await Promise.all(Array.from({ length: CONC }, worker));
  const wall = (Date.now() - t0) / 1000;
  lat.sort((a, b) => a - b);
  const mid = perSec.slice(1, SECS - 1);
  if (process.env.RECORD) flushRec();
  while (recInflight > 0) await new Promise(r => setTimeout(r, 100));
  const out = {
    mode, conc: CONC, secs: SECS, maxTok: MAXTOK, servers: NSRV,
    done, fail, rps: +(done / wall).toFixed(1),
    maxRPS_1s: Math.max(...perSec),
    sustainedRPS: Math.round(perSec.slice(1, SECS - 1).reduce((a, b) => a + b, 0) / (SECS - 2)),
    avgCompletionTokens: +(tokens / Math.max(1, done)).toFixed(1),
    p50ms: lat[(lat.length * 0.5) | 0], p99ms: lat[(lat.length * 0.99) | 0],
    recordQueued: process.env.RECORD ? recQueued : null,
    tpsPerSecond: perSec.slice(0, SECS),
  };
  console.log(JSON.stringify(out, null, 2));
  require('fs').writeFileSync(`${require('./common').RESULTS_DIR}/m4-lightclient-${RUNTAG}.json`, JSON.stringify(out, null, 2));
})();
