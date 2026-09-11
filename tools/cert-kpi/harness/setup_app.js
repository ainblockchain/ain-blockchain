// 시험 앱 생성: /apps/ai_network_dag (admin + write true + 스테이킹)
const { newAin, APP, sleep } = require('./common');

async function main() {
  const ain = newAin(0);
  const addr = ain.wallet.defaultAccount.address;
  console.log('signer:', addr);

  const exists = await ain.db.ref(`/manage_app/${APP}/config`).getValue();
  if (!exists) {
    let res = await ain.db.ref(`/manage_app/${APP}/create/${Date.now()}`).setValue({
      value: { admin: { [addr]: true }, service: { staking: { lockup_duration: 604800000 } } },
      gas_price: 1, nonce: -1,
    });
    console.log('create_app:', res.tx_hash, 'code:', res.result.code);
    await sleep(4000);
  } else {
    console.log('app already exists');
  }

  let res = await ain.db.ref(`/apps/${APP}`).setRule({
    value: { '.rule': { write: true } }, gas_price: 1, nonce: -1,
  });
  console.log('set_rule:', res.tx_hash, 'code:', res.result.code);
  if (res.result.code !== 0) { console.error('SET_RULE FAILED'); process.exit(1); }

  const stakeBefore = (await ain.db.ref(`/staking/${APP}/balance_total`).getValue()) || 0;
  if (stakeBefore <= 0) {
    res = await ain.db.ref(`/staking/${APP}/${addr}/0/stake/${Date.now()}/value`).setValue({
      value: 10000, gas_price: 1, nonce: -1,
    });
    console.log('stake:', res.tx_hash, 'code:', res.result.code);
    if (res.result.code !== 0) { console.error('STAKE FAILED'); process.exit(1); }
  }

  await sleep(4000);
  const rule = await ain.db.ref(`/apps/${APP}`).getRule();
  const stake = await ain.db.ref(`/staking/${APP}/balance_total`).getValue();
  console.log('rule:', JSON.stringify(rule), 'stake_total:', stake);
  if (!rule || !rule['.rule'] || rule['.rule'].write !== true) {
    console.error('RULE NOT SET'); process.exit(1);
  }
  if (!stake || stake <= 0) { console.error('STAKE_TOTAL NOT POSITIVE'); process.exit(1); }
  console.log('APP READY');
}
main().catch(e => { console.error(e); process.exit(1); });
