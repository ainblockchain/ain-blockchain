const fs = require('fs');
const espree = require('espree');

async function parseRule(ruleFile) {
  console.log(`* Reading rule file: ${ruleFile}...`);
  let ruleStr = '';
  try {
    ruleStr = fs.readFileSync(ruleFile).toString();
  } catch (err) {
    return null;
  }
  console.log(`  Rule string: [${ruleStr}]`);
  const tokens = espree.tokenize(ruleStr, { ecmaVersion: 12 });
  console.log(tokens);
}

async function processArguments() {
  if (process.argv.length !== 3) {
    usage();
  }
  await parseRule(process.argv[2]);
}

function usage() {
  console.log('\nUsage:\n  node parseRule.js <rule file 1>\n')
  console.log('Examples:')
  console.log('  node parseRule.js samples/transfer.txt')
  process.exit(0)
}

processArguments();
