const _ = require('lodash');
const { StateVersions } = require('../../common/constants');
const FileUtil = require('../../common/file-util');
const Blockchain = require('../../blockchain');
const StateManager = require('../../db/state-manager');
const DB = require('../../db');

async function verifyBlock(snapshotFile, blockFileList) {
  console.log(`\n<< [0]: ${snapshotFile} >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n`);
  console.log(`* Reading snapshot file: ${snapshotFile}...`);
  const snapshot = FileUtil.isCompressedFile(snapshotFile) ?
      FileUtil.readCompressedJson(snapshotFile) : FileUtil.readJson(snapshotFile);
  if (snapshot === null) {
    console.log(`  Failed to read snapshot file: ${snapshotFile}`);
    process.exit(0)
  }
  console.log(`  Done.`);

  console.log(`* Initializing db states with snapshot...`);
  const bc = new Blockchain(String(8888));
  const stateManager = new StateManager();
  const db = DB.create(
      StateVersions.EMPTY, 'verifyBlock', bc, false, bc.lastBlockNumber(), stateManager);
  db.initDbStates(snapshot);
  console.log(`  Done.`);

  for (let i = 0; i < blockFileList.length; i++) {
    const blockFile = blockFileList[i];
    console.log(`\n<< [${i + 1}]: ${blockFile} >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n`);
    console.log(`* Reading block file: ${blockFile}...`);
    const block = FileUtil.isCompressedFile(blockFile) ?
        FileUtil.readCompressedJson(blockFile) : FileUtil.readJson(blockFile);
    if (block === null) {
      console.log(`  Failed to read block file: ${blockFile}`);
      process.exit(0);
    }
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
    console.log(`* Comparing root proof hashes...`);
    console.log(`  > Root proof hash from block header: ${block.state_proof_hash}`);
    console.log(`  > Root proof hash from recomputation: ${db.stateRoot.getProofHash()}`);
    if (db.stateRoot.getProofHash() === block.state_proof_hash) {
      console.log(`  *************`);
      console.log(`  * VERIFIED! *`);
      console.log(`  *************`);
    } else {
      console.log(`  *****************`);
      console.log(`  * NOT-VERIFIED! *`);
      console.log(`  *****************`);
      console.log(`  Halting verification...`);
      break;
    }
    console.log(`  Done.`);
  }
}

async function processArguments() {
  if (process.argv.length < 4) {
    usage();
  }
  await verifyBlock(process.argv[2], process.argv.slice(3));
}

function usage() {
  console.log('\nUsage:\n  node verifyBlock.js <snapshot file> <block file 1> [<block file 2> ... <block file k>\n')
  console.log('Examples:')
  console.log('  node verifyBlock.js samples/snapshot-100.json samples/block-101.json')
  console.log('  node verifyBlock.js samples/snapshot-100.json.gz samples/block-101.json.gz')
  console.log('  node verifyBlock.js samples/snapshot-100.json samples/block-101.json samples/block-102.json')
  console.log('  node verifyBlock.js samples/snapshot-100.json.gz samples/block-101.json.gz samples/block-102.json.gz\n')
  process.exit(0)
}

processArguments();