// cert-10-nodes 설정 자동 생성: 검증자 10, epoch 1s, 대역폭 예산 상향
// 사용: node tools/cert-kpi/make-cert-config.js [출력 디렉토리] [epoch_ms] [bandwidth_budget_per_block]   (저장소 루트에서 실행)
//   cert-10-nodes    : epoch 1000ms, 대역폭 1,000,000 (지표 1~3)
//   cert-10-nodes-m4 : epoch 5000ms, 대역폭 50,000   (지표 4, Merkle 배치 앵커링)
const fs = require('fs');
const DIR = process.argv[2] || 'blockchain-configs/cert-10-nodes';
const EPOCH_MS = Number(process.argv[3] || 1000);
const BANDWIDTH = Number(process.argv[4] || 1000000);

fs.rmSync(DIR, { recursive: true, force: true });
fs.cpSync('blockchain-configs/3-nodes', DIR, { recursive: true });

const params = JSON.parse(fs.readFileSync(`${DIR}/blockchain_params.json`));
const accounts = JSON.parse(fs.readFileSync('blockchain-configs/base/genesis_accounts.json'));
const validators = accounts.others.slice(0, 10);

params.consensus.min_num_validators = 5;
params.consensus.max_num_validators = 10;
// others[5..9] 잔액이 1M이므로 스테이크를 균일 1M로 설정 (min_stake도 동일 조정)
params.consensus.min_stake_for_proposer = 1000000;
params.consensus.max_stake_for_proposer = 10000000;
params.consensus.genesis_proposer_whitelist = {};
params.consensus.genesis_validator_whitelist = {};
params.consensus.genesis_validators = {};
for (const v of validators) {
  params.consensus.genesis_proposer_whitelist[v.address] = true;
  params.consensus.genesis_validator_whitelist[v.address] = true;
  params.consensus.genesis_validators[v.address] = { stake: 1000000, proposal_right: true };
}
params.genesis.epoch_ms = EPOCH_MS;
params.genesis.num_genesis_accounts = 20;   // others[0..19] 잔액 시드 (검증자10 + 시험계정 여유)
params.resource.bandwidth_budget_per_block = BANDWIDTH;
params.resource.min_gas_price = 1;

fs.writeFileSync(`${DIR}/blockchain_params.json`, JSON.stringify(params, null, 2));
console.log('validators:');
validators.forEach((v, i) => console.log(` ${i}: ${v.address} balance=${v.balance}`));
console.log('OK');
