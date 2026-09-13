const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function collect(directory, prefix = '') {
  return fs.readdirSync(path.join(directory, prefix), { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? collect(directory, relative) : entry.isFile() ? [relative] : [];
  });
}

function audit(source, output) {
  const roots = ['common', 'client', 'p2p', 'node', 'consensus', 'db', 'blockchain', 'block-pool', 'tx-pool', 'json_rpc', 'event-handler', 'logger', 'tools/genesis-file', 'blockchain-configs/base', 'blockchain-configs/3-nodes', 'patches'];
  const files = ['package.json', 'yarn.lock', ...roots.filter(relative => fs.existsSync(path.join(source, relative))).flatMap(relative => collect(source, relative))].sort();
  const hash = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  const records = files.map(relative => {
    const actual = path.join(process.cwd(), relative);
    const sourceSha256 = hash(path.join(source, relative));
    const imageSha256 = fs.existsSync(actual) ? hash(actual) : null;
    return { relative, sourceSha256, imageSha256, match: sourceSha256 === imageSha256 };
  });
  const report = { at: new Date().toISOString(), node: process.version, roots, files: records, pass: records.every(record => record.match), scope: 'runtime source/configuration templates and dependency lockfile compared byte-for-byte with the chain image; not a performance-equivalence claim' };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, files: records.length, pass: report.pass, differences: records.filter(record => !record.match) }));
  if (!report.pass) process.exitCode = 1;
}

if (require.main === module) audit(...process.argv.slice(2));
module.exports = { collect, audit };
