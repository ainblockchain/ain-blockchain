const fs = require('fs');
const assert = require('assert/strict');
const crypto = require('crypto');
const { PaymentChannel, paymentStateBytes } = require('/opt/ain-js/lib/state-channel');
const { createPaymentPeer, postPayment } = require('/opt/ain-js/lib/state-channel/http-peer');
const directory = '/evidence';
const mode = process.argv[2];

async function remoteState() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch('http://peer:9000/state', { signal: AbortSignal.timeout(2000) });
      if (response.ok) return response.json();
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('peer state unavailable; inspect existing server');
}

async function main() {
  if (mode === 'init') {
    const participants = [crypto.generateKeyPairSync('ed25519'), crypto.generateKeyPairSync('ed25519')];
    for (const [index, role] of ['client', 'server'].entries()) {
      fs.writeFileSync(`/secrets/${role}.pem`, participants[index].privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600, flag: 'wx' });
    }
    const opening = { chainId: 'socket-smoke-not-onchain', channelId: process.env.RUN_ID,
      openingReference: crypto.randomBytes(32).toString('hex'), balances: ['1000', '1000'],
      publicKeys: participants.map(participant => participant.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')) };
    fs.writeFileSync(`${directory}/opening.json`, JSON.stringify(opening), { flag: 'wx' });
    return;
  }
  const opening = JSON.parse(fs.readFileSync(`${directory}/opening.json`));
  if (mode === 'server') {
    const channel = new PaymentChannel(opening);
    const journal = `${directory}/receipts.jsonl`;
    if (fs.existsSync(journal)) {
      for (const line of fs.readFileSync(journal, 'utf8').split('\n').filter(Boolean)) channel.commit(JSON.parse(line));
    }
    const descriptor = fs.openSync(journal, 'a');
    const key = crypto.createPrivateKey(fs.readFileSync('/private.pem'));
    createPaymentPeer(channel, key, async receipt => {
      fs.writeSync(descriptor, JSON.stringify(receipt) + '\n');
      fs.fsyncSync(descriptor);
    }).listen(9000, '0.0.0.0', () => console.log(JSON.stringify({ ready: true, recoveredSequence: channel.snapshot().sequence })));
    return;
  }
  if (mode === 'recover') {
    const prior = JSON.parse(fs.readFileSync(`${directory}/client-result.json`));
    assert.deepEqual(await remoteState(), prior.state);
    const receipt = await postPayment('http://peer:9000', prior.lastProposal);
    assert.deepEqual(receipt, prior.state.receipt);
    assert.deepEqual(await remoteState(), prior.state);
    fs.writeFileSync(`${directory}/recovery-result.json`, JSON.stringify({ pass: true, recoveredSequence: prior.state.sequence,
      evidence: 'peer killed after acknowledged transfers, restarted from fsynced receipts, last delivery replayed without double payment' }, null, 2));
    return;
  }
  if (mode !== 'client') throw new Error('mode must be init, server, client or recover');
  await remoteState();
  const key = crypto.createPrivateKey(fs.readFileSync('/private.pem'));
  const channel = new PaymentChannel(opening);
  let lastProposal;
  const timings = [];
  for (let index = 0; index < 20; index++) {
    lastProposal = channel.propose(0, '3', key);
    const started = process.hrtime.bigint();
    const receipt = await postPayment('http://peer:9000', lastProposal);
    channel.commit(receipt);
    timings.push(Number(process.hrtime.bigint() - started) / 1e6);
    assert.deepEqual(await postPayment('http://peer:9000', lastProposal), receipt);
  }
  const invalid = channel.propose(0, '1', key);
  await assert.rejects(postPayment('http://peer:9000', { ...invalid, signature: '0'.repeat(128) }), /signature/);
  const skipped = { ...invalid.state, sequence: invalid.state.sequence + 1 };
  await assert.rejects(postPayment('http://peer:9000', { state: skipped,
    signature: crypto.sign(null, paymentStateBytes(skipped), key).toString('hex') }), /skipped/);
  const inflation = { ...invalid.state, balances: ['9999', '9999'] };
  await assert.rejects(postPayment('http://peer:9000', { state: inflation,
    signature: crypto.sign(null, paymentStateBytes(inflation), key).toString('hex') }), /conservation/);
  const remote = await remoteState();
  assert.deepEqual(remote, channel.snapshot());
  assert.deepEqual(remote.balances, ['940', '1060']);
  assert.equal(fs.readFileSync(`${directory}/receipts.jsonl`, 'utf8').trim().split('\n').length, 20);
  fs.writeFileSync(`${directory}/client-result.json`, JSON.stringify({ pass: true, state: remote, lastProposal,
    timingsMs: timings, tests: ['20 acknowledged transfers', '20 idempotent redeliveries', 'bad signature', 'sequence gap', 'balance inflation'],
    scope: 'two Docker processes over HTTP; test credit protocol smoke, not 7000 TPS or onchain escrow/settlement' }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ pass: true, transferred: 60, accepted: remote.sequence }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
