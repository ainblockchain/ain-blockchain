const fs = require('fs');
const path = require('path');

async function main() {
  const origin = new URL(process.env.PUBLIC_AINIZE_URL || 'https://www.ainize.ai');
  if (origin.protocol !== 'https:' || origin.username || origin.password) {
    throw new Error('public verification requires HTTPS without embedded credentials');
  }
  const expected = [...new Set((process.env.EXPECTED_PATCH_IDS || '').split(',').map(value => value.trim()).filter(Boolean))];
  const requireListed = process.env.CATALOG_REQUIRE_LISTED !== '0';
  const runId = process.env.RUN_ID || `public-catalog-${Date.now()}`;
  if (!/^[a-zA-Z0-9_-]+$/.test(runId)) throw new Error('invalid RUN_ID');
  const directory = path.resolve(__dirname, '..', 'evidence', runId);
  fs.mkdirSync(directory, { recursive: false });
  const responses = {};
  for (const endpoint of ['info', 'catalog']) {
    const response = await fetch(new URL(`/api/${endpoint}`, origin), { signal: AbortSignal.timeout(30000) });
    const body = await response.text();
    fs.writeFileSync(path.join(directory, `${endpoint}.json`), body, { flag: 'wx' });
    if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
    responses[endpoint] = JSON.parse(body);
  }
  if (!Array.isArray(responses.catalog.items)) throw new Error('catalog.items is not an array');
  const total = responses.catalog.total;
  if (!Number.isSafeInteger(total) || total < 0 || total > 100000) throw new Error('invalid catalog total');
  const items = [...responses.catalog.items];
  while (items.length < total) {
    const offset = items.length;
    const response = await fetch(new URL(`/api/catalog?limit=200&offset=${offset}`, origin), { signal: AbortSignal.timeout(30000) });
    const body = await response.text();
    fs.writeFileSync(path.join(directory, `catalog-offset-${offset}.json`), body, { flag: 'wx' });
    if (!response.ok) throw new Error(`catalog offset ${offset}: HTTP ${response.status}`);
    const page = JSON.parse(body);
    if (page.total !== total || !Array.isArray(page.items) || page.items.length === 0) throw new Error('catalog changed or pagination stalled; repeat with a new RUN_ID');
    items.push(...page.items);
  }
  const ids = items.map(item => item.anchor?.id);
  if (items.length !== total || ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== total) {
    throw new Error('catalog has missing or duplicate IDs; repeat with a new RUN_ID');
  }
  const matches = expected.map(id => {
    const item = items.find(candidate => candidate.anchor.id === id);
    const verified = item?.status === 'VERIFIED' || item?.status === 'LISTED';
    return { id, found: Boolean(item), status: item?.status || null, verified, listed: verified };
  });
  const result = {
    checkedAt: new Date().toISOString(), origin: origin.origin,
    node: responses.info.node?.address, ledger: responses.info.ledger?.kind,
    runtimeAvailable: responses.info.runtime?.available,
    catalogTotal: total, returnedItems: items.length,
    expected, matches, requireListed,
    visibleCount: matches.filter(item => item.found).length,
    listedCount: matches.filter(item => item.listed).length,
    verifiedCount: matches.filter(item => item.verified).length,
    catalogPresenceComplete: expected.length > 0 && matches.every(item => item.found),
    verificationComplete: expected.length > 0 && matches.every(item => item.listed),
    pass: expected.length > 0 && matches.every(item => requireListed ? item.listed : item.found),
    scope: 'Public catalog presence and VERIFIED (legacy LISTED) status are separate observations; not an atomic snapshot, payment, model load, dataset, teach or inference proof.',
  };
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
