require('dotenv').config();
const { GoogleSpreadsheet } = require('google-spreadsheet');
const{ execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const semver = require('semver');

const envId = process.env.ENV_ID;
const envClientEmail = process.env.CLIENT_EMAIL;
const envPrivateKey = process.env.PRIVATE_KEY.replace(/\\n/g, '\n');   // replace string \n into \n

if (!envId || !envClientEmail || !envPrivateKey) {
  console.log('CANNOT proceed the script without ENV_ID, CLIENT_EMAIL, or PRIVATE_KEY');
  process.exit(-1);
}

const doc = new GoogleSpreadsheet(envId);

const AINJS_GITHUB = 'https://github.com/ainblockchain/ain-js.git';
const AINJS = 'ainJs';
const GPT2 = 'gpt2';
const INSIGHT = 'insight';
const FAUCET = 'faucet';
const PIPELINE = 'pipeline';
const DATA = 'data';

const CELL_DICTIONARY = {
  'ain-js': 'E',
  'ain-connect': 'F',
  'Teachable-NLP': 'G',
  'ain-insight': 'H',
  'ain-faucet': 'I',
  'insight-pipeline': 'J',
  'blockchain-data': 'K',
  'GPT2-exporter': 'L'
}

const auth = async () => {
  await doc.useServiceAccountAuth({
    client_email: envClientEmail,
    private_key: envPrivateKey
  });
}

const resolvePath = (morePath) => {
  return path.resolve(__dirname, morePath);
}

const cloneGitRepo = (git, appName) => {
  if (fs.existsSync(resolvePath(`${appName}`))) {
    return;
  }
  execSync(`git clone ${git} ${appName}`, {
    cwd: resolvePath('')
  });
}

const getVersion = (pathName, fileName, varName, versionPosition) => {
  const path = resolvePath(pathName);
  const stdoutBuffer = execSync(`cat ${path}/${fileName} | grep ${varName} -m 1`);
  const stdout = stdoutBuffer.toString();
  const version = stdout.split(' ').filter(e => e)[versionPosition];
  return version.replace(/[^0-9.]/g, '');
}

const getVersionFromAinJs = (ainJsVersion, repoName) => {
  const currentAinJsRepoVersion = getVersion(`${AINJS}/`, 'package.json', 'version', 1);
  const ainJsVersionInOtherRepo = getVersion(`${repoName}/`, 'package.json', 'ain-js', 1);
  if (semver.lt(ainJsVersionInOtherRepo, currentAinJsRepoVersion)) {
    cloneGitRepo(`${AINJS_GITHUB} --branch v${ainJsVersionInOtherRepo}`,
        `${AINJS}-${ainJsVersionInOtherRepo}`);
    return getVersion(`${AINJS}-${ainJsVersionInOtherRepo}/src`,'constants.ts',
        'BLOCKCHAIN_PROTOCOL_VERSION', 4);
  }
  return ainJsVersion;
}

const main = async () => {
  await auth();
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];

  const today = new Date();
  const currentVersion = require('../../package.json').version;
  const protocolVersion = require('../../client/protocol_versions.json');
  const minVersion = protocolVersion[currentVersion].min;
  const maxVersion =
      protocolVersion[currentVersion].max ? protocolVersion[currentVersion].max : null;

  // Clone repos
  cloneGitRepo(`${AINJS_GITHUB}`, AINJS);
  cloneGitRepo(`${process.env.GPT2} --config core.sshCommand="ssh -i ./id_rsa"`, GPT2);
  cloneGitRepo(`${process.env.INSIGHT} -b develop --single-branch --config core.sshCommand="ssh -i ./id_rsa"`, INSIGHT);
  cloneGitRepo(`${process.env.FAUCET} --config core.sshCommand="ssh -i ./id_rsa"`, FAUCET);
  cloneGitRepo(`${process.env.PIPELINE} -b develop --single-branch --config core.sshCommand="ssh -i ./id_rsa"`, PIPELINE);
  cloneGitRepo(`${process.env.DATA} --config core.sshCommand="ssh -i ./id_rsa"`, DATA);

  // Get versions
  const ainJsVersion = getVersion(`${AINJS}/src`, 'constants.ts', 'BLOCKCHAIN_PROTOCOL_VERSION', 4);
  const GPT2Version = getVersion(`${GPT2}/functions`, 'util.js', 'CURRENT_PROTOCOL_VERSION', 3);
  const insightVersion = getVersion(`${INSIGHT}/src/data/constants`, 'const.js', 'VERSION', 1);
  const faucetVersion = getVersionFromAinJs(ainJsVersion, FAUCET);
  const connectVersion = faucetVersion;
  const pipelineVersion = getVersion(`${PIPELINE}/constants`, 'const.js', 'AIN_PROTOCOL_VERSION', 3);
  const dataVersion = getVersionFromAinJs(ainJsVersion, DATA);
  const exporterVersion = GPT2Version;

  // Set versions
  const row = {
    date: today.toISOString().slice(0, 10),
    cur: currentVersion,
    min: minVersion,
    max: maxVersion,
    'ain-js': ainJsVersion,
    'ain-connect': connectVersion,
    'Teachable-NLP': GPT2Version,
    'ain-insight': insightVersion,
    'ain-faucet': faucetVersion,
    'insight-pipeline': pipelineVersion,
    'blockchain-data': dataVersion,
    'GPT2-exporter': exporterVersion
  }
  await sheet.addRow(row);

  // Compare versions and set color
  const currentRowNumber = (await sheet.getRows()).length + 1;
  await sheet.loadCells(`E${currentRowNumber}:L${currentRowNumber}`);
  for (const repo of Object.keys(CELL_DICTIONARY)) {
    if (!semver.valid(row[repo])) continue;
    const isLower = semver.lt(row[repo], row.min);
    if (isLower) {
      const latestAinJsCell = sheet.getCellByA1(`${CELL_DICTIONARY[repo]}${currentRowNumber}`);
      latestAinJsCell.backgroundColor = {
        red: 1,
        green: 0,
        blue: 0
      };
    }
  }
  await sheet.saveUpdatedCells();
}

main();
