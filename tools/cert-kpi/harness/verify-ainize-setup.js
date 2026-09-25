const fs = require('fs');
const path = require('path');
const { newAin, NODES, KPI_DIR, envSnapshot, waitFinalized, verifyTxInBlockUntil, getValueFinal,
  assertResultFree, writeResult } = require('./common');

async function main() {
  const runId = process.env.RUN_ID;
  if (!runId || !/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error('valid RUN_ID required');
  assertResultFree(`ainize-setup-${runId}`);
  const environment = await envSnapshot();
  const log = path.resolve(KPI_DIR, process.argv[2] || 'evidence/ainize-chain-setup-20260911.json');
  const messages = fs.readFileSync(log, 'utf8').trim().split(/\n(?=\{)/).map(message => JSON.parse(message));
  const setup = messages.find(message => typeof message.created === 'boolean');
  if (!setup?.admin) throw new Error('Ainize setup did not report an admin');
  const hashes = messages.flatMap(message => [message.tx_hash, message.tx].filter(Boolean));
  if (!hashes.length) throw new Error('no setup transaction evidence');
  const reader = newAin(5);
  const finalized = await waitFinalized(reader, hashes);
  const transactions = [];
  for (const txHash of hashes) {
    const receipt = finalized.status.get(txHash);
    const block = receipt?.finalized ? await verifyTxInBlockUntil(NODES[9], receipt.blockNumber, txHash) : null;
    transactions.push({ txHash, receipt, block, ok: receipt?.finalized === true && block?.ok === true });
  }
  const config = await getValueFinal(reader, '/manage_app/knowledge/config');
  const stake = await getValueFinal(reader, '/staking/knowledge/balance_total');
  const rules = await reader.db.ref('/apps/knowledge/market').getRule(undefined, { is_final: true });
  const checks = {
    transactionsFinalizedAndInIndependentBlock: transactions.every(transaction => transaction.ok),
    adminMatches: config?.admin?.[setup.admin] === true,
    stakeAtLeast100: stake >= 100,
    nodeIdentityRule: rules?.nodes?.['$addr']?.['.rule']?.write === 'auth.addr === $addr',
    patchOwnershipRule: rules?.patches?.['$patch_id']?.['.rule']?.write === 'auth.addr === newData.author && (data === null || data.author === auth.addr)',
  };
  const pass = Object.values(checks).every(Boolean);
  await writeResult(`ainize-setup-${runId}`, { runId, scope: 'Ainize knowledge app setup and funding; not teach or inference',
    submittedBy: setup.admin, independentReader: NODES[5], checks, transactions, config, stake, rules, pass }, environment);
  console.log(JSON.stringify({ runId, checks, pass }, null, 2));
  process.exitCode = pass ? 0 : 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
