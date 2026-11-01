/**
 * Read-only pre-activation check for the 'ain_store' timer flag.
 *
 * Lists, via JSON-RPC 'ain_get' reads only (no transactions, no keys):
 *   1. every .function config that contains the '_storeAppend' function id, and
 *   2. every pre-seeded /apps/<app>/store/mmr value.
 * Both must be empty (or reviewed and cleaned) before the flag is activated: a pre-existing
 * install would start running at activation, and a pre-seeded MMR either fails every append
 * (if malformed) or becomes a forged starting point (if well-formed).
 *
 * Usage: node tools/ain-store/check-pre-activation.js [json-rpc-endpoint] [--concurrency N]
 *   default endpoint: https://mainnet-api.ainetwork.ai/json-rpc
 * Exit code: 0 = nothing found, 1 = findings, 2 = scan error (incomplete).
 */
const axios = require('axios');

const STORE_APPEND = '_storeAppend';
const LIMIT_CODES = new Set([30001, 30002, 30003]); // response tree size/height/sibling limits
const args = process.argv.slice(2);
const endpoint = args.find((a) => a.startsWith('http')) ||
    'https://mainnet-api.ainetwork.ai/json-rpc';
const concIdx = args.indexOf('--concurrency');
const CONCURRENCY = concIdx >= 0 ? Number(args[concIdx + 1]) : 8;
let requestCount = 0;
const errors = [];

async function ainGet(params, attempt = 0) {
  requestCount++;
  try {
    const resp = await axios.post(endpoint, {
      jsonrpc: '2.0', id: requestCount, method: 'ain_get',
      params: Object.assign({ protoVer: '1.6.1' }, params),
    }, { timeout: 30000 });
    if (resp.data.error) throw new Error(JSON.stringify(resp.data.error));
    return resp.data.result; // { result, code?, message? }
  } catch (e) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      return ainGet(params, attempt + 1);
    }
    throw e;
  }
}

const isMeta = (label) => label.startsWith('#');
const joinPath = (base, label) => (base === '/' ? `/${label}` : `${base}/${label}`);

// All child labels of a node, paging through partial (sibling-limited) responses.
async function listChildren(type, ref) {
  const labels = [];
  let lastEndLabel;
  for (;;) {
    const params = { type, ref, is_shallow: true, is_partial: true };
    if (lastEndLabel !== undefined) params.last_end_label = lastEndLabel;
    const res = await ainGet(params);
    const obj = res && res.result;
    if (!obj || typeof obj !== 'object') break;
    const page = Object.keys(obj).filter((l) => !isMeta(l));
    labels.push(...page);
    if (obj['#end_label'] === undefined || page.length === 0) break;
    lastEndLabel = obj['#end_label'];
  }
  return labels;
}

// Calls visit(path, fullSubtree) for every subtree small enough to fetch in one read.
async function walk(type, ref, visit) {
  const res = await ainGet({ type, ref });
  if (res && (res.code === undefined || res.code === 0)) {
    visit(ref, res.result);
    return;
  }
  if (!res || !LIMIT_CODES.has(res.code)) {
    errors.push(`${type} ${ref}: ${JSON.stringify(res)}`);
    return;
  }
  for (const label of await listChildren(type, ref)) {
    await walk(type, joinPath(ref, label), visit);
  }
}

function findStoreAppend(base, tree, found) {
  if (!tree || typeof tree !== 'object') return;
  for (const [label, child] of Object.entries(tree)) {
    if (isMeta(label)) continue;
    if (label === '.function') {
      if (child && typeof child === 'object' && child[STORE_APPEND] !== undefined) {
        found.push({ path: base, config: child[STORE_APPEND] });
      }
    } else {
      findStoreAppend(joinPath(base, label), child, found);
    }
  }
}

async function pool(items, fn) {
  let i = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const item = items[i++];
      try {
        await fn(item);
      } catch (e) {
        errors.push(`${item}: ${e.message}`);
      }
    }
  });
  await Promise.all(workers);
}

async function main() {
  console.log(`[ain_store pre-activation check] endpoint: ${endpoint}`);
  const installs = [];
  const mmrs = [];
  // 1. _storeAppend installs anywhere in /functions.
  const topLabels = await listChildren('GET_FUNCTION', '/');
  for (const label of topLabels.filter((l) => l !== 'apps')) {
    await walk('GET_FUNCTION', `/${label}`, (path, tree) => findStoreAppend(path, tree, installs));
  }
  const apps = await listChildren('GET_VALUE', '/apps');
  const funcApps = await listChildren('GET_FUNCTION', '/apps');
  console.log(`apps (values): ${apps.length}, apps with functions: ${funcApps.length}`);
  await pool(funcApps, (app) => walk('GET_FUNCTION', `/apps/${app}`,
      (path, tree) => findStoreAppend(path, tree, installs)));
  // 2. Pre-seeded /apps/<app>/store/mmr values.
  await pool(apps, async (app) => {
    const res = await ainGet({ type: 'GET_VALUE', ref: `/apps/${app}/store/mmr` });
    if (res && res.result !== null && res.result !== undefined) {
      mmrs.push({ path: `/apps/${app}/store/mmr`, value: res.result });
    } else if (res && res.code !== undefined && res.code !== 0) {
      mmrs.push({ path: `/apps/${app}/store/mmr`, value: `(too large to read: ${res.message})` });
    }
  });
  console.log(`requests: ${requestCount}`);
  console.log(`_storeAppend installs: ${installs.length}`);
  installs.forEach((f) => console.log(`  ${f.path}/.function ${JSON.stringify(f.config)}`));
  console.log(`pre-seeded store/mmr values: ${mmrs.length}`);
  mmrs.forEach((m) => console.log(`  ${m.path} = ${JSON.stringify(m.value)}`));
  if (errors.length > 0) {
    console.log(`SCAN INCOMPLETE, ${errors.length} error(s):`);
    errors.slice(0, 50).forEach((e) => console.log(`  ${e}`));
    process.exit(2);
  }
  if (installs.length > 0 || mmrs.length > 0) {
    console.log('RESULT: findings present; block activation until they are reviewed/cleaned.');
    process.exit(1);
  }
  console.log('RESULT: clean.');
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
