const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const home = path.join(root, 'ainize', 'home-docker');
const template = path.join(root, 'ainize', 'home-cert', 'config.json');
if (fs.existsSync(home)) throw new Error('home-docker exists; preserve it and inspect before retrying');
const config = JSON.parse(fs.readFileSync(template, 'utf8'));
config.name = 'cert-ainize-docker';
config.port = 3410;
config.host = '127.0.0.1';
config.dataDir = path.join(home, 'data');
config.peers = [];
config.ledger.ain.providerUrl = 'http://localhost:18081';
config.ledger.ain.eventHandlerUrl = null;
config.runtime.python = '/opt/runtime/bin/python';
delete config.operatorPasswordHash;
fs.mkdirSync(home, { mode: 0o700 });
fs.mkdirSync(config.dataDir, { mode: 0o700 });
fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
fs.writeFileSync(path.join(home, 'operator-password.txt'), crypto.randomBytes(24).toString('base64url'), { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ home, provider: config.ledger.ain.providerUrl, port: config.port,
  readiness: 'node provisioning only; PLE serving and trainer must be configured and verified before teach' }, null, 2));
