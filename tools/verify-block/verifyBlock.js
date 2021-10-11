const FileUtil = require('../../common/file-util');

async function verifyBlock(snapshotFile, blockFile) {
  console.log(`* blockFile: ${blockFile}`);
  console.log(`Reading snapshotFile: ${snapshotFile}...`);
  const snapshot = FileUtil.readJson(snapshotFile);
  console.log(`Done.`);
  console.log(`Reading blockFile: ${snapshotFile}...`);
  const block = FileUtil.readJson(blockFile);
  console.log(`Done.`);
  // TODO(platfowner): Implement this.
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