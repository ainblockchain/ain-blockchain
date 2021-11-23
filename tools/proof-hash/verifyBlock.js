const _ = require('lodash');
const FileUtil = require('../../common/file-util');
const {
  StateVersions,
  BlockchainNodeStates
} = require('../../common/constants');
const BlockchainNode = require('../../node');
const { verifyProofHashForStateTree } = require('../../db/state-util');
const Consensus = require('../../consensus');
const ConsensusUtil = require('../../consensus/consensus-util');

async function loadSnapshot(snapshotFile) {
  console.log(`\n* Reading snapshot file: ${snapshotFile}...`);
  const snapshot = FileUtil.isCompressedFile(snapshotFile) ?
      FileUtil.readCompressedJson(snapshotFile) : FileUtil.readJson(snapshotFile);
  if (snapshot === null) {
    console.log(`  Failed to read snapshot file: ${snapshotFile}`);
    process.exit(0)
  }
  return snapshot;
}

async function loadBlocks(blockFileList) {
  const blockList = [];
  for (let i = 0; i < blockFileList.length; i++) {
    const blockFile = blockFileList[i];
    console.log(`\n* Reading block file: ${blockFile}...`);
    const block = FileUtil.isCompressedFile(blockFile) ?
        FileUtil.readCompressedJson(blockFile) : FileUtil.readJson(blockFile);
    if (block === null) {
      console.log(`  Failed to read block file: ${blockFile}`);
      process.exit(0);
    }
    blockList.push(block);
  }
  return blockList;
}

async function verifyBlock(snapshotFile, blockFileList) {
  const snapshot = await loadSnapshot(snapshotFile);
  const snapshotBlock = snapshot.block;
  const snapshotBlockNumber = snapshot.block_number;
  const blockList = await loadBlocks(blockFileList);

  console.log(`\n* Initializing db states with snapshot...`);
  const account = {
    "address": "0x00ADEc28B6a845a085e03591bE7550dd68673C1C",
    "private_key": "b22c95ffc4a5c096f7d7d0487ba963ce6ac945bdc91c79b64ce209de289bec96",
    "public_key": "63e90c5abdf55221a9736eaa6d859a1346e406f8dde49b6465bb6280c80a3826f66dcf69b5573ad1f91cb0f0b2675c5c282c93d320ba758c27abe3c4662dc545"
  };
  const node = new BlockchainNode(account);
  node.db.initDb(snapshot);
  node.bc.initBlockchain(true, snapshot);
  const snapshotProposalTx = ConsensusUtil.filterProposalFromVotes(blockList[0].last_votes);
  node.bp.addSeenBlock(snapshotBlock, snapshotProposalTx);
  const latestDb = node.createTempDb(
      node.db.stateVersion, `${StateVersions.LOAD}:${snapshotBlockNumber}`, snapshotBlockNumber);
  node.bp.addToHashToDbMap(snapshotBlock.hash, latestDb);
  node.state = BlockchainNodeStates.SYNCING;

  console.log(`\n<< [0]: ${snapshotFile} >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);
  console.log(`\n* Verifying state tree proof hashes...`);
  const result = verifyProofHashForStateTree(node.db.stateRoot);
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
  console.log(`  > Root proof hash from recomputation: ${node.db.stateRoot.getProofHash()}`);
  if (node.db.stateRoot.getProofHash() === snapshot.root_proof_hash) {
    console.log(`  *************`);
    console.log(`  * VERIFIED! *`);
    console.log(`  *************`);
  } else {
    console.log(`  *****************`);
    console.log(`  * NOT-VERIFIED! *`);
    console.log(`  *****************`);
  }

  for (let i = 0; i < blockList.length; i++) {
    const blockFile = blockFileList[i];
    console.log(`\n<< [${i + 1}]: ${blockFile} >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);
    console.log(`\n* Verifying block: ${blockFile}...`);

    const block = blockList[i];
    const nextBlock = i + 1 < blockList.length ? blockList[i + 1] : null;
    proposalTx = nextBlock ? ConsensusUtil.filterProposalFromVotes(nextBlock.last_votes) : null;

    console.log(`\n* Executing block on db...`);
    try {
      Consensus.validateAndExecuteBlockOnDb(block, node, 'verifyBlock', proposalTx);
    } catch (e) {
      console.log(`Failed to validate and excute block ${block.number}: ${e}`);
      process.exit(0);
    }
    console.log(`\n* Comparing root proof hashes...`);
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