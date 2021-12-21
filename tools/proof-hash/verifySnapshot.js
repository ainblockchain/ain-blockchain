const _ = require('lodash');
const { StateVersions, StateInfoProperties } = require('../../common/constants');
const FileUtil = require('../../common/file-util');
const Blockchain = require('../../blockchain');
const StateManager = require('../../db/state-manager');
const DB = require('../../db');
const { verifyProofHashForStateTree } = require('../../db/state-util');

async function verifySnapshot(snapshotFile) {
  console.log(`\n<< [0]: ${snapshotFile} >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);
  console.log(`\n* Reading snapshot file: ${snapshotFile}...`);
  const snapshot = FileUtil.isCompressedFile(snapshotFile) ?
      FileUtil.readCompressedJson(snapshotFile) : FileUtil.readJson(snapshotFile);
  if (snapshot === null) {
    console.log(`  Failed to read snapshot file: ${snapshotFile}`);
    process.exit(0)
  }

  console.log(`\n* Initializing db states with snapshot...`);
  const bc = new Blockchain(String(8888));
  const stateManager = new StateManager(StateInfoProperties.HASH_DELIMITER);
  const db = DB.create(
      StateVersions.EMPTY, 'verifyBlock', bc, false, bc.lastBlockNumber(), stateManager);
  db.initDb(snapshot);

  console.log(`\n* Verifying state tree proof hashes...`);
  const result = verifyProofHashForStateTree(db.stateRoot);
  console.log(`  > Is verified: ${result.isVerified}`);
  console.log(`  > Mismatched path: ${result.mismatchedPath}`);
  console.log(`  > Mismatched proof hash: ${result.mismatchedProofHash}`);
  console.log(`  > Mismatched proof hash computed: ${result.mismatchedProofHashComputed}`);
  if (result.isVerified === true) {
    console.log(`  *************`);
    console.log(`  * VERIFIED! *`);
    console.log(`  *************`);
  } else {
    console.log(`  *****************`);
    console.log(`  * NOT-VERIFIED! *`);
    console.log(`  *****************`);
  }

  console.log(`\n* Comparing root proof hashes...`);
  console.log(`  > Root proof hash from snapshot header: ${snapshot.root_proof_hash}`);
  console.log(`  > Root proof hash from recomputation: ${db.stateRoot.getProofHash()}`);
  if (db.stateRoot.getProofHash() === snapshot.root_proof_hash) {
    console.log(`  *************`);
    console.log(`  * VERIFIED! *`);
    console.log(`  *************`);
  } else {
    console.log(`  *****************`);
    console.log(`  * NOT-VERIFIED! *`);
    console.log(`  *****************`);
  }
}

async function processArguments() {
  if (process.argv.length < 3) {
    usage();
  }
  await verifySnapshot(process.argv[2]);
}

function usage() {
  console.log('\nUsage:\n  node verifyBlock.js <snapshot file>\n')
  console.log('Examples:')
  console.log('  node verifyBlock.js samples/snapshot-100.json')
  console.log('  node verifyBlock.js samples/snapshot-100.json.gz')
  process.exit(0)
}

processArguments();