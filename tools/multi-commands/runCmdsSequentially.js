const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function runCommand(command, index) {
  if (!command) {
    return;
  }
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`error (${index}): ${error.message}`);
        resolve();
      }
      if (stderr) {
        console.log(`stderr (${index}): ${stderr}`);
        resolve();
      }
      console.log(`stdout (${index}): ${stdout}`);
      resolve();
    });
  });
}

async function runCmdsSequentially(file) {
  const fileStream = fs.createReadStream(path.resolve(__dirname, file));
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  // Note: we use the crlfDelay option to recognize all instances of CR LF
  // ('\r\n') in input.txt as a single line break.
  let i = 0;
  for await (const line of rl) {
    await runCommand(line, i++);
  }
}

async function processArguments() {
  if (process.argv.length !== 3) {
    usage();
  }
  await runCmdsSequentially(process.argv[2]);
}

function usage() {
  console.log('\nUsage:\n  node runCmdsSequentially.js <commands file>\n');
  console.log('Examples:');
  console.log('  node runCmdsSequentially.js commands/localCreateGenesisBlockCommands.txt');
  process.exit(0);
}

processArguments();
