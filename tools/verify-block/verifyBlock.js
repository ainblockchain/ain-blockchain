const FileUtil = require('../../common/file-util');
const { StateVersions } = require('../../common/constants');
const Blockchain = require('../../blockchain');
const StateManager = require('../../db/state-manager');
const DB = require('../../db');

async function verifyBlock(snapshotFile, blockFile) {
  console.log(`* Reading snapshot file: ${snapshotFile}...`);
  const snapshot = FileUtil.readJson(snapshotFile);
  if (snapshot === null) {
    console.log(`  Failed to read snapshot file: ${snapshotFile}`);
    process.exit(0)
  }
  console.log(`  Done.`);
  console.log(`* Reading block file: ${blockFile}...`);
  const block = FileUtil.readJson(blockFile);
  if (block === null) {
    console.log(`  Failed to read block file: ${blockFile}`);
    process.exit(0);
  }
  console.log(`  Done.`);
  const bc = new Blockchain(String(8888));
  const stateManager = new StateManager();
  const db = DB.create(
      StateVersions.EMPTY, 'verifyBlock', bc, false, bc.lastBlockNumber(), stateManager);
  console.log(`* Initializing db states with snapshot...`);
  db.initDbStates(snapshot);
  console.log(`  Done.`);
  console.log(`* Executing block on db...`);
  if (block.number > 0) {
    if (!db.executeTransactionList(block.last_votes, true, false, block.number, block.timestamp)) {
      logger.error(`  Failed to execute last_votes (${block.number})`);
      process.exit(0);
    }
  }
  if (!db.executeTransactionList(block.transactions, block.number === 0, false, block.number, block.timestamp)) {
    logger.error(`  Failed to execute transactions (${block.number})`)
    process.exit(0);
  }
  console.log(`  Done.`);
  console.log(`=> State root proof hash: ${db.stateRoot.getProofHash()}`);
  console.log(`=> Block proof hash: ${block.state_proof_hash}`);
}

async function processArguments() {
  if (process.argv.length !== 4) {
    usage();
  }
  await verifyBlock(process.argv[2], process.argv[3]);
}

function usage() {
  console.log('\nUsage:\n  node verifyBlock.js <snapshot file> <block file>\n')
  console.log('Examples:\n  node verifyBlock.js 100.json 101.json\n')
  process.exit(0)
}

processArguments();