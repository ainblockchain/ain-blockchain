const _ = require('lodash');
const CommonUtil = require('../../common/common-util');
const FileUtil = require('../../common/file-util');

async function jsonDiff(jsonFile1, jsonFile2) {
  console.log(`* Reading json file: ${jsonFile1}...`);
  const json1 = FileUtil.isCompressedFile(jsonFile1) ?
      FileUtil.readCompressedJson(jsonFile1) : FileUtil.readJson(jsonFile1);
  if (json1 === null) {
    console.log(`  Failed to read json file: ${jsonFile1}`);
    process.exit(0)
  }
  console.log(`  Done.`);

  console.log(`* Reading json file: ${jsonFile2}...`);
  const json2 = FileUtil.isCompressedFile(jsonFile2) ?
      FileUtil.readCompressedJson(jsonFile2) : FileUtil.readJson(jsonFile2);
  if (json2 === null) {
    console.log(`  Failed to read json file: ${jsonFile2}`);
    process.exit(0)
  }
  console.log(`  Done.`);
  console.log(`* Diff json files...`);
  const diffLines = CommonUtil.getJsonDiff(json1, json2);
  console.log(diffLines);
  console.log(`  Done.`);
}

async function processArguments() {
  if (process.argv.length !== 4) {
    usage();
  }
  await jsonDiff(process.argv[2], process.argv[3]);
}

function usage() {
  console.log('\nUsage:\n  node jsonDiff.js <json file 1> <json file 2>\n')
  console.log('Examples:')
  console.log('  node jsonDiff.js a.json b.json')
  process.exit(0)
}

processArguments();
