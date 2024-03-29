const _ = require('lodash');
const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const spawn = require('child_process').spawn;
const rimraf = require('rimraf');
const jayson = require('jayson/promise');
const syncRequest = require('sync-request');
const ainUtil = require('@ainblockchain/ain-util');
const {
  NodeConfigs,
  BlockchainConsts,
  PredefinedDbPaths,
  BlockchainParams,
} = require('../../common/constants');
const {
  ConsensusMessageTypes,
  ValidatorOffenseTypes,
} = require('../../consensus/constants');
const CommonUtil = require('../../common/common-util');
const PathUtil = require('../../common/path-util');
const {
  waitUntilTxFinalized,
  waitUntilNetworkIsReady,
  waitForNewBlocks,
  parseOrLog,
  getLastBlock,
} = require('../test-util');
const { Block } = require('../../blockchain/block');
const Functions = require('../../db/functions');
const ConsensusUtil = require('../../consensus/consensus-util');
const { JSON_RPC_METHODS } = require('../../json_rpc/constants');

const PROJECT_ROOT = require('path').dirname(__filename) + '/../../';
const TRACKER_SERVER = PROJECT_ROOT + 'tracker-server/index.js';
const APP_SERVER = PROJECT_ROOT + 'client/index.js';
const MAX_ITERATION = 200;
const MAX_NUM_VALIDATORS = 4;
const ENV_VARIABLES = [
  {
    UNSAFE_PRIVATE_KEY: 'b22c95ffc4a5c096f7d7d0487ba963ce6ac945bdc91c79b64ce209de289bec96',
    ENABLE_GAS_FEE_WORKAROUND: true, BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/3-nodes',
    ENABLE_EXPRESS_RATE_LIMIT: false, PORT: 8081, P2P_PORT: 5001,
  },
  {
    UNSAFE_PRIVATE_KEY: '921cc48e48c876fc6ed1eb02a76ad520e8d16a91487f9c7e03441da8e35a0947',
    ENABLE_GAS_FEE_WORKAROUND: true, BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/3-nodes',
    ENABLE_EXPRESS_RATE_LIMIT: false, PORT: 8082, P2P_PORT: 5002,
  },
  {
    UNSAFE_PRIVATE_KEY: '41e6e5718188ce9afd25e4b386482ac2c5272c49a622d8d217887bce21dce560',
    ENABLE_GAS_FEE_WORKAROUND: true, BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/3-nodes',
    ENABLE_EXPRESS_RATE_LIMIT: false, PORT: 8083, P2P_PORT: 5003,
  },
  {
    UNSAFE_PRIVATE_KEY: '79e8473fb27896c16eeedc8aea7966e5fa489faca4deacdbbb2428750eb4d6eb',
    ENABLE_GAS_FEE_WORKAROUND: true, BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/3-nodes',
    ENABLE_EXPRESS_RATE_LIMIT: false, PORT: 8084, P2P_PORT: 5004,
  },
  {
    UNSAFE_PRIVATE_KEY: 'ff8ccb5edbc6662d7751501b377819fa6bc57ea29135de5f25f27c371d65bc4c',
    ENABLE_GAS_FEE_WORKAROUND: true, BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/3-nodes',
    ENABLE_EXPRESS_RATE_LIMIT: false, PORT: 8085, P2P_PORT: 5005,
  },
];

// Server configurations
const server1 = 'http://localhost:8081';
const server2 = 'http://localhost:8082';
const server3 = 'http://localhost:8083';
const server4 = 'http://localhost:8084';
const server5 = 'http://localhost:8085';
const serverList = [server1, server2, server3, server4, server5];

const JSON_RPC_ENDPOINT = '/json-rpc';

class Process {
  constructor(application, envVariables) {
    this.application = application;
    this.envVariables = envVariables;
    this.proc = null;
  }

  start(stdioInherit = false) {
    if (this.proc) {
      throw Error('Process already started');
    }
    const options = {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        ...this.envVariables,
      },
    }
    if (stdioInherit) {
      options.stdio = 'inherit';
    }
    this.proc = spawn('node', [this.application], options).on('error', (err) => {
      console.error(
          `Failed to start server${this.application} with ${this.envVariables} with error: ` +
          err.message);
    });
  }

  kill() {
    this.proc.kill();
    this.proc = null;
  }
}

const SERVER_PROCS = [];
for (let i = 0; i < ENV_VARIABLES.length; i++) {
  SERVER_PROCS.push(new Process(APP_SERVER, ENV_VARIABLES[i]));
}

describe('Consensus', () => {
  let trackerProc;
  let jsonRpcClient;
  let server1Addr;
  let server2Addr;
  let server3Addr;
  let server4Addr;
  let server5Addr;
  const nodeAddressList = [];

  before(async () => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);

    const promises = [];
    // Start up all servers
    trackerProc = new Process(TRACKER_SERVER, { CONSOLE_LOG: false });
    trackerProc.start(true);
    await CommonUtil.sleep(3000);
    for (let i = 0; i < SERVER_PROCS.length; i++) {
      const proc = SERVER_PROCS[i];
      proc.start(true);
      await CommonUtil.sleep(i === 0 ? 100000 : 3000);
      const address =
          parseOrLog(syncRequest('GET', serverList[i] + '/get_address').body.toString('utf-8')).result;
      nodeAddressList.push(address);
    };
    await waitUntilNetworkIsReady(serverList);
    jsonRpcClient = jayson.client.http(server2 + JSON_RPC_ENDPOINT);
    promises.push(new Promise((resolve) => {
      jsonRpcClient.request(JSON_RPC_METHODS.AIN_GET_LAST_BLOCK,
          {protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION}, function(err, response) {
        if (err) {
          resolve();
          throw err;
        }
        numBlocksOnStartup = response.result.result ? response.result.result.number : 0;
        resolve();
      });
    }));
    await Promise.all(promises);

    server1Addr = parseOrLog(syncRequest(
        'GET', server1 + '/get_address').body.toString('utf-8')).result;
    server2Addr = parseOrLog(syncRequest(
        'GET', server2 + '/get_address').body.toString('utf-8')).result;
    server3Addr = parseOrLog(syncRequest(
        'GET', server3 + '/get_address').body.toString('utf-8')).result;
    server4Addr = parseOrLog(syncRequest(
        'GET', server4 + '/get_address').body.toString('utf-8')).result;
    server5Addr = parseOrLog(syncRequest(
        'GET', server5 + '/get_address').body.toString('utf-8')).result;
  });

  after(() => {
    // Teardown all servers
    for (let i = 0; i < SERVER_PROCS.length; i++) {
      SERVER_PROCS[i].kill();
    }
    trackerProc.kill();

    rimraf.sync(NodeConfigs.CHAINS_DIR);
  });

  describe('Validators', () => {
    before(async () => {
      // Update max_num_validators to 4
      const client = jayson.client.http(server1 + '/json-rpc');
      const txBody = {
        operation: {
          type: 'SET_VALUE',
          ref: `/blockchain_params/consensus/max_num_validators`,
          value: MAX_NUM_VALIDATORS
        },
        gas_price: 0,
        timestamp: Date.now(),
        nonce: -1
      };
      const signature =
          ainUtil.ecSignTransaction(txBody, Buffer.from('a2b5848760d81afe205884284716f90356ad82be5ab77b8130980bdb0b7ba2ba', 'hex'));
      const res = await client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
        tx_body: txBody,
        signature,
        protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
      });
      if (!(await waitUntilTxFinalized([server1], _.get(res, 'result.result.tx_hash')))) {
        console.error(`Failed to check finalization of tx.`);
      }
      expect(res.result.result.result.code).to.be.equal(0);
    })

    it('Number of validators cannot exceed max_num_validators', async () => {
      // 1. server4 stakes 100000
      const server4StakeRes = parseOrLog(syncRequest('POST', server4 + '/set_value', {json: {
        ref: `/staking/consensus/${server4Addr}/0/stake/${Date.now()}/value`,
        value: 100000,
        nonce: -1
      }}).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized([server4], server4StakeRes.tx_hash))) {
        console.error(`Failed to check finalization of server4's staking tx.`);
      }
      // 2. server4 added to validators & can vote
      let iterCount = 0;
      let lastBlock = getLastBlock(server1);
      while (!lastBlock.validators[server4Addr]) {
        if (iterCount >= MAX_ITERATION) {
          console.log(`Iteration count exceeded its limit before server4 becomes a validator`);
          assert.fail(`server4 is not included in validators`);
        }
        lastBlock = getLastBlock(server1);
        iterCount++;
        await CommonUtil.sleep(200);
      }
      assert.deepEqual(lastBlock.validators[server4Addr][PredefinedDbPaths.CONSENSUS_PROPOSAL_RIGHT], false);
      await waitForNewBlocks(server1, 1);
      const server4Voted = parseOrLog(syncRequest(
        'GET',
        `${server1}/get_value?ref=/consensus/number/${lastBlock.number}/${lastBlock.hash}/vote/${server4Addr}&is_final=true`
      ).body.toString('utf-8')).result;
      assert.deepEqual(server4Voted[PredefinedDbPaths.CONSENSUS_STAKE], 100000);
      // 3. server5 stakes 100000
      const server5StakeRes = parseOrLog(syncRequest('POST', server5 + '/set_value', {json: {
        ref: `/staking/consensus/${server5Addr}/0/stake/${Date.now()}/value`,
        value: 100000,
        nonce: -1
      }}).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized([server4], server5StakeRes.tx_hash))) {
        console.error(`Failed to check finalization of server5's staking tx.`);
      }
      // 4. server5 added to validators & server4 is evicted (server5's expireAt > server4's expireAt)
      iterCount = 0;
      lastBlock = getLastBlock(server1);
      while (!lastBlock.validators[server5Addr]) {
        if (iterCount >= MAX_ITERATION) {
          console.log(`Iteration count exceeded its limit before server5 becomes a validator`);
          assert.fail(`server5 is not included in validators`);
        }
        lastBlock = getLastBlock(server1);
        assert.deepEqual(Object.keys(lastBlock.validators).length, MAX_NUM_VALIDATORS);
        iterCount++;
        await CommonUtil.sleep(200);
      }
      assert.deepEqual(lastBlock.validators[server5Addr][PredefinedDbPaths.CONSENSUS_PROPOSAL_RIGHT], false);
      await waitForNewBlocks(server1, 1);
      const votes = parseOrLog(syncRequest(
        'GET',
        `${server1}/get_value?ref=/consensus/number/${lastBlock.number}/${lastBlock.hash}/vote&is_final=true`
      ).body.toString('utf-8')).result;
      assert.deepEqual(votes[server4Addr], undefined);
      assert.deepEqual(votes[server5Addr][PredefinedDbPaths.CONSENSUS_STAKE], 100000);
    });

    it('When more than max_num_validators validators exist, validatators with bigger stakes get prioritized', async () => {
      // 1. server4 stakes 10 more AIN
      const server4StakeRes = parseOrLog(syncRequest('POST', server4 + '/set_value', {json: {
        ref: `/staking/consensus/${server4Addr}/0/stake/${Date.now()}/value`,
        value: 10,
        nonce: -1
      }}).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized([server4], server4StakeRes.tx_hash))) {
        console.error(`Failed to check finalization of server4's staking tx.`);
      }
      // 2. server4 added to validators & server5 is evicted
      let iterCount = 0;
      let lastBlock = getLastBlock(server1);
      while (!lastBlock.validators[server4Addr]) {
        if (iterCount >= MAX_ITERATION) {
          console.log(`Iteration count exceeded its limit before server4 becomes a validator`);
          assert.fail(`server4 is not included in validators`);
        }
        lastBlock = getLastBlock(server1);
        iterCount++;
        await CommonUtil.sleep(200);
      }
      await waitForNewBlocks(server1, 1);
      let votes = parseOrLog(syncRequest(
        'GET',
        `${server1}/get_value?ref=/consensus/number/${lastBlock.number}/${lastBlock.hash}/vote&is_final=true`
      ).body.toString('utf-8')).result;
      assert.deepEqual(votes[server5Addr], undefined);
      assert.deepEqual(votes[server4Addr][PredefinedDbPaths.CONSENSUS_STAKE], 100010);
      // 3. server5 stakes 20 more AIN
      const server5StakeRes = parseOrLog(syncRequest('POST', server5 + '/set_value', {json: {
        ref: `/staking/consensus/${server5Addr}/0/stake/${Date.now()}/value`,
        value: 20,
        nonce: -1
      }}).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized([server4], server5StakeRes.tx_hash))) {
        console.error(`Failed to check finalization of server5's staking tx.`);
      }
      // 4. server5 added to validators & server4 is evicted
      iterCount = 0;
      lastBlock = getLastBlock(server1);
      while (!lastBlock.validators[server5Addr]) {
        if (iterCount >= MAX_ITERATION) {
          console.log(`Iteration count exceeded its limit before server5 becomes a validator`);
          assert.fail(`server5 is not included in validators`);
        }
        lastBlock = getLastBlock(server1);
        assert.deepEqual(Object.keys(lastBlock.validators).length, MAX_NUM_VALIDATORS);
        iterCount++;
        await CommonUtil.sleep(200);
      }
      await waitForNewBlocks(server1, 1);
      votes = parseOrLog(syncRequest(
        'GET',
        `${server1}/get_value?ref=/consensus/number/${lastBlock.number}/${lastBlock.hash}/vote&is_final=true`
      ).body.toString('utf-8')).result;
      assert.deepEqual(votes[server4Addr], undefined);
      assert.deepEqual(votes[server5Addr][PredefinedDbPaths.CONSENSUS_STAKE], 100020);
    });
  });

  describe('Rewards', () => {
    it('consensus rewards are updated', async () => {
      const rewardsBefore = parseOrLog(syncRequest('GET',
          server1 + `/get_value?ref=/consensus/rewards&is_final=true`).body.toString('utf-8')).result || {};
      const txWithGasFee = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
        ref: `/transfer/${server1Addr}/${server2Addr}/0/value`,
        value: 1,
        gas_price: 1000000
      }}).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, txWithGasFee.tx_hash))) {
        console.error(`Failed to check finalization of tx.`);
      }
      await waitForNewBlocks(server1, 2); // Make sure 1 more block is finalized
      const rewardsAfter = parseOrLog(syncRequest('GET',
          server1 + `/get_value?ref=/consensus/rewards&is_final=true`).body.toString('utf-8')).result;
      const txInfo = parseOrLog(syncRequest('GET',
          server1 + `/get_transaction?hash=${txWithGasFee.tx_hash}`).body.toString('utf-8')).result;
      const blockNumber = txInfo.number;
      const consensusRound = parseOrLog(syncRequest('GET',
          server1+ `/get_value?ref=/consensus/number/${blockNumber}&is_final=true`).body.toString('utf-8')).result;
      const blockRewardMultiplier =
          BlockchainParams.reward.annual_rate * BlockchainParams.genesis.epoch_ms / 31557600000; // 365.25 * 24 * 60 * 60 * 1000
      const blockHash = consensusRound.propose.block_hash;
      const votes = consensusRound[blockHash].vote;
      const validators = Object.keys(votes);
      const gasCostTotal = consensusRound.propose.gas_cost_total;
      const totalAtStake = Object.values(votes).reduce((acc, cur) => acc + cur.stake, 0);
      let txFeeSum = 0;
      for (let index = 0; index < validators.length; index++) {
        const validatorAddr = validators[index];
        const validatorStake = votes[validatorAddr].stake;
        const blockReward = blockRewardMultiplier * validatorStake;
        let txFee = 0;
        if (gasCostTotal > 0) {
          if (index === validators.length - 1) {
            txFee = gasCostTotal - txFeeSum;
          } else {
            txFee = gasCostTotal * (validatorStake / totalAtStake);
            txFeeSum += txFee;
          }
        }
        // It's greater than or equal to the expected values because block rewards are keep accumulating
        expect(rewardsAfter[validatorAddr].unclaimed).to.be.at.least(
            _.get(rewardsBefore, `${validatorAddr}.unclaimed`, 0) + (txFee + blockReward));
        expect(rewardsAfter[validatorAddr].cumulative).to.be.at.least(
            _.get(rewardsBefore, `${validatorAddr}.cumulative`, 0) + (txFee + blockReward));
      }
      assert.deepEqual(txWithGasFee.result.gas_cost_total, consensusRound.propose.gas_cost_total);
    });

    it('cannot claim more than unclaimed rewards', async () => {
      const unclaimed = parseOrLog(syncRequest('GET',
          server1 + `/get_value?ref=/consensus/rewards/${server1Addr}/unclaimed&is_final=true`).body.toString('utf-8')).result;
      const claimTx = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
        ref: `/gas_fee/claim/${server1Addr}/0`,
        value: {
          amount: unclaimed + 1
        }
      }}).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, claimTx.tx_hash))) {
        console.error(`Failed to check finalization of tx.`);
      }
      claimTx.result.message = 'erased';
      assert.deepEqual(claimTx.result, {
        "gas_amount_total": {
          "bandwidth": {
            "service": 1
          },
          "state": {
            "service": 0
          }
        },
        "gas_cost_total": 0,
        "message": "erased",
        "code": 12103,
        "bandwidth_gas_amount": 1,
        "gas_amount_charged": 1
      });
    });

    it('cannot claim with an amount of more than 6 decimals', async () => {
      const claimTx = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
        ref: `/gas_fee/claim/${server1Addr}/0`,
        value: {
          amount: 0.0000001  // an amount of 7 decimals
        }
      }}).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, claimTx.tx_hash))) {
        console.error(`Failed to check finalization of tx.`);
      }
      expect(claimTx.result.code).to.equal(10104);
      expect(claimTx.result.func_results._claimReward.code).to.equal(20001);
      expect(claimTx.result.func_results._claimReward.op_results['0'].result.code).to.equal(12103);
    });

    it('can claim unclaimed rewards', async () => {
      const unclaimed = parseOrLog(syncRequest('GET',
          server1 + `/get_value?ref=/consensus/rewards/${server1Addr}/unclaimed&is_final=true`).body.toString('utf-8')).result;
      const unclaimedFloored = Math.floor(unclaimed * 1000000) / 1000000;
      const claimTx = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
        ref: `/gas_fee/claim/${server1Addr}/1`,
        value: {
          amount: unclaimedFloored
        },
        timestamp: 1629377509815
      }}).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, claimTx.tx_hash))) {
        console.error(`Failed to check finalization of tx.`);
      }
      assert.deepEqual(claimTx.result, {
        "gas_amount_total": {
          "bandwidth": {
            "service": 5
          },
          "state": {
            "service": 1574
          }
        },
        "gas_cost_total": 0,
        "func_results": {
          "_claimReward": {
            "op_results": {
              "0": {
                "path": "/transfer/gas_fee|gas_fee|unclaimed/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/1629377509815/value",
                "result": {
                  "func_results": {
                    "_transfer": {
                      "op_results": {
                        "0": {
                          "path": "/service_accounts/gas_fee/gas_fee/unclaimed/balance",
                          "result": {
                            "code": 0,
                            "bandwidth_gas_amount": 1
                          }
                        },
                        "1": {
                          "path": "/accounts/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/balance",
                          "result": {
                            "code": 0,
                            "bandwidth_gas_amount": 1
                          }
                        }
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 0
                    }
                  },
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              },
              "1": {
                "path": "/consensus/rewards/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/unclaimed",
                "result": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 0
          }
        },
        "code": 0,
        "bandwidth_gas_amount": 1,
        "gas_amount_charged": 1579
      });
    });
  });

  describe('Penalties', () => {
    function sendInvalidBlockProposal() {
      const lastBlock = getLastBlock(server1);
      const proposalBlock = Block.create(lastBlock.hash, [], {}, [], [], lastBlock.number + 1,
          lastBlock.epoch + 1, '', server2Addr, {}, 0, 0);
      proposalBlock.hash += '0'; // Invalid block hash
      const proposalTxBody = {
        operation: {
          type: 'SET_VALUE',
          ref: PathUtil.getConsensusProposePath(proposalBlock.number),
          value: {
            number: proposalBlock.number,
            epoch: proposalBlock.epoch,
            validators: proposalBlock.validators,
            total_at_stake: 0,
            proposer: server2Addr,
            block_hash: proposalBlock.hash,
            last_hash: proposalBlock.last_hash,
            timestamp: proposalBlock.timestamp,
            gas_cost_total: 0
          }
        },
        nonce: -1,
        timestamp: Date.now(),
        gas_price: 1,
      };
      const proposalTx = parseOrLog(syncRequest('POST', server2 + `/sign_transaction`,
          {json: proposalTxBody}).body.toString('utf-8')).result;
      const invalidProposal = {
        value: { proposalBlock, proposalTx },
        type: ConsensusMessageTypes.PROPOSE,
        consensusProtoVer: BlockchainConsts.CONSENSUS_PROTOCOL_VERSION
      };
      syncRequest('POST', server1 + '/broadcast_consensus_msg', {json: invalidProposal});
      return { proposalBlock, proposalTx };
    }

    async function waitUntilAgainstVotesInBlock(proposalBlock) {
      let againstVotes = parseOrLog(syncRequest('GET',
          server2 + `/get_value?ref=/consensus/number/${proposalBlock.number}/${proposalBlock.hash}/vote&is_final=true`)
          .body.toString('utf-8')).result;
      while (againstVotes === null) {
        await CommonUtil.sleep(200);
        againstVotes = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/consensus/number/${proposalBlock.number}/${proposalBlock.hash}/vote&is_final=true`)
            .body.toString('utf-8')).result;
      }
      // Wait for 1 more block.
      await waitForNewBlocks(server2, 1);
      return againstVotes;
    }

    it('can record an offense and its evidence', async () => {
      const { proposalBlock, proposalTx } = sendInvalidBlockProposal();
      const againstVotesFromState = await waitUntilAgainstVotesInBlock(proposalBlock);
      const offenseRecords = parseOrLog(syncRequest(
          'GET', server2 + `/get_value?ref=/consensus/offense_records&is_final=true`).body.toString('utf-8')).result;
      expect(offenseRecords[server2Addr]).to.equal(1);
      const blockWithEvidence = (parseOrLog(syncRequest('GET', server2 + `/blocks`)
          .body.toString('utf-8')).result || [])
              .find((block) => !CommonUtil.isEmpty(block.evidence));
      const evidence = blockWithEvidence.evidence[server2Addr][0];
      assert.deepEqual(blockWithEvidence.evidence[server2Addr].length, 1);
      assert.deepEqual(evidence.offense_type, ValidatorOffenseTypes.INVALID_PROPOSAL);
      assert.deepEqual(evidence.block, proposalBlock);
      assert.deepEqual(evidence.transactions, [proposalTx]);
      evidence.votes.forEach((vote) => {
        assert.deepEqual(ConsensusUtil.isAgainstVoteTx(vote), true);
      });
      for (const [addr, vote] of Object.entries(againstVotesFromState)) {
        expect(blockWithEvidence.validators[addr]).to.not.equal(undefined);
        assert.deepEqual(vote.stake, blockWithEvidence.validators[addr].stake);
        assert.deepEqual(vote.block_hash, proposalBlock.hash);
        assert.deepEqual(vote.is_against, true);
        assert.deepEqual(vote.offense_type, ValidatorOffenseTypes.INVALID_PROPOSAL);
      }
      const offenses = parseOrLog(syncRequest(
        'GET', server2 + `/get_value?ref=/consensus/number/${blockWithEvidence.number}/propose/offenses&is_final=true`)
        .body.toString('utf-8')).result;
      assert.deepEqual(offenses[server2Addr], { [ValidatorOffenseTypes.INVALID_PROPOSAL]: 1 });
    });

    it('can penalize malicious validators ', async () => {
      const offenseRecordsBefore = parseOrLog(syncRequest(
          'GET', server2 + `/get_value?ref=/consensus/offense_records/${server2Addr}&is_final=true`).body.toString('utf-8')).result;
      const stakeExpirationBefore = parseOrLog(syncRequest(
          'GET', server2 + `/get_value?ref=/staking/consensus/${server2Addr}/0/expire_at&is_final=true`).body.toString('utf-8')).result;
      const { proposalBlock } = sendInvalidBlockProposal();
      await waitUntilAgainstVotesInBlock(proposalBlock);
      const offenseRecordsAfter = parseOrLog(syncRequest(
        'GET', server2 + `/get_value?ref=/consensus/offense_records/${server2Addr}&is_final=true`).body.toString('utf-8')).result;
      const stakeExpirationAfter = parseOrLog(syncRequest(
          'GET', server2 + `/get_value?ref=/staking/consensus/${server2Addr}/0/expire_at&is_final=true`).body.toString('utf-8')).result;
      assert.deepEqual(offenseRecordsAfter, offenseRecordsBefore + 1);
      assert.deepEqual(
        stakeExpirationAfter,
        stakeExpirationBefore + Functions.getLockupExtensionForNewOffenses(1, offenseRecordsAfter, BlockchainParams.consensus.stake_lockup_extension)
      );
    });
  });
});