const _ = require('lodash');
const FileUtil = require('../../common/file-util');
const {
  verifyStateProof,
} = require('../../db/state-util');

async function verifyProof(proofFile) {
  console.log(`* Reading proof file: ${proofFile}...`);
  const proof = FileUtil.isCompressedFile(proofFile) ?
      FileUtil.readCompressedJson(proofFile) : FileUtil.readJson(proofFile);
  if (proof === null) {
    console.log(`  Failed to read proof file: ${proofFile}`);
    process.exit(0)
  }
  console.log(`  Done.`);
  console.log(`* Trying to verify proof...`);
  const result = verifyStateProof(proof);
  console.log(`  > Root proof hash: ${result.rootProofHash}`);
  console.log(`  > Is verified: ${result.isVerified}`);
  console.log(`  > Mismatched path: ${result.mismatchedPath}`);
  if (result.isVerified === true) {
    console.log(`  *************`);
    console.log(`  * VERIFIED! *`);
    console.log(`  *************`);
  } else {
    console.log(`  *****************`);
    console.log(`  * NOT-VERIFIED! *`);
    console.log(`  *****************`);
  }
  console.log(`  Done.`);
}

async function processArguments() {
  if (process.argv.length !== 3) {
    usage();
  }
  await verifyProof(process.argv[2]);
}

function usage() {
  console.log('\nUsage:\n  node verifyProof.js <proof file>\n')
  console.log('Examples:')
  console.log('  node verifyProof.js samples/proof-test1.json')
  process.exit(0)
}

processArguments();