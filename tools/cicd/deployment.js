require('dotenv').config();
const { GoogleSpreadsheet } = require('google-spreadsheet');

const envId = process.env.ENV_ID;
const envClientEmail = process.env.CLIENT_EMAIL;
const envPrivateKey = process.env.PRIVATE_KEY.replace(/\\n/g, '\n');   // replace string \n into \n

if (!envId || !envClientEmail || !envPrivateKey) {
  console.log('CANNOT proceed the script without ENV_ID, CLIENT_EMAIL, or PRIVATE_KEY');
  process.exit(-1);
}

const doc = new GoogleSpreadsheet(envId);

const auth = async () => {
  await doc.useServiceAccountAuth({
    client_email: envClientEmail,
    private_key: envPrivateKey
  });
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
  sheet.addRow({
    date: today.toISOString().slice(0, 10),
    cur: currentVersion,
    min: minVersion,
    max: maxVersion
  });
}

main();
