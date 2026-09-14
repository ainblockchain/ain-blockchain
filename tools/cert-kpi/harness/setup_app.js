// 시험 앱 생성: /apps/ai_network_dag (admin + write true + 스테이킹)
const { newAin, NODES, APP, sleep, waitFinalized, verifyTxInBlockUntil, getValueFinalUntil,
  envSnapshot, writeResult, assertResultFree } = require('./common');

async function main() {
  const ain = newAin(0);
  const reader = newAin(5);
  const addr = ain.wallet.defaultAccount.address;
  const runId = process.env.RUN_ID || `setup_${Date.now()}`;
  assertResultFree(`setup-${runId}`);
  const environment = await envSnapshot();
  const transactions = [];
  async function confirm(kind, response) {
    if (!response?.tx_hash || response.result?.code !== 0) throw new Error(`${kind} rejected`);
    const finalized = await waitFinalized(ain, [response.tx_hash]);
    const receipt = finalized.status.get(response.tx_hash);
    if (!receipt?.finalized) throw new Error(`${kind} not finalized`);
    const block = await verifyTxInBlockUntil(NODES[9], receipt.blockNumber, response.tx_hash);
    if (!block.ok) throw new Error(`${kind} not in independent node block`);
    transactions.push({ kind, txHash: response.tx_hash, receipt, block });
  }
  console.log('signer:', addr);

  const exists = await ain.db.ref(`/manage_app/${APP}/config`).getValue(undefined, { is_final: true });
  if (!exists) {
    let res = await ain.db.ref(`/manage_app/${APP}/create/${Date.now()}`).setValue({
      value: { admin: { [addr]: true }, service: { staking: { lockup_duration: 604800000 } } },
      gas_price: 1, nonce: -1,
    });
    console.log('create_app:', res.tx_hash, 'code:', res.result.code);
    await confirm('create_app', res);
  } else {
    console.log('app already exists');
  }

  let res = await ain.db.ref(`/apps/${APP}`).setRule({
    value: { '.rule': { write: true } }, gas_price: 1, nonce: -1,
  });
  console.log('set_rule:', res.tx_hash, 'code:', res.result.code);
  await confirm('set_rule', res);

  const stakeBefore = (await ain.db.ref(`/staking/${APP}/balance_total`).getValue(undefined, { is_final: true })) || 0;
  if (stakeBefore < 10000) {
    res = await ain.db.ref(`/staking/${APP}/${addr}/0/stake/${Date.now()}/value`).setValue({
      value: 10000 - stakeBefore, gas_price: 1, nonce: -1,
    });
    console.log('stake:', res.tx_hash, 'code:', res.result.code);
    await confirm('stake', res);
  }

  const deadline = Date.now() + 30000;
  let rule;
  do {
    rule = await reader.db.ref(`/apps/${APP}`).getRule(undefined, { is_final: true });
    if (rule?.['.rule']?.write === true) break;
    await sleep(500);
  } while (Date.now() < deadline);
  const stake = (await getValueFinalUntil(reader, `/staking/${APP}/balance_total`, value => value >= 10000)).value;
  console.log('rule:', JSON.stringify(rule), 'stake_total:', stake);
  if (!rule || !rule['.rule'] || rule['.rule'].write !== true) {
    console.error('RULE NOT SET'); process.exit(1);
  }
  if (!(stake >= 10000)) { console.error('STAKE_TOTAL BELOW 10000'); process.exit(1); }
  await writeResult(`setup-${runId}`, { runId, app: APP, transactions, reader: NODES[5], rule, stake, pass: true }, environment);
  console.log('APP READY');
}
main().catch(e => { console.error(e); process.exit(1); });
