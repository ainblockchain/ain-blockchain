#!/usr/bin/env bash
set -euo pipefail
KPI=$(cd "$(dirname "$0")/.." && pwd)
RUN_ID=${RUN_ID:?use the evidence directory containing observer-pause.json}
[[ "$RUN_ID" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
OUT="$KPI/evidence/$RUN_ID"
BACKUP="$KPI/secrets/$RUN_ID"
test -f "$OUT/observer-pause.json"
test ! -e "$BACKUP"
bash "$KPI/docker/ainize-cli.sh" teach jobs --json > "$OUT/jobs-before.json"
curl --fail --silent --show-error http://localhost:3410/api/info > "$OUT/info-before.json"
node - "$KPI" "$OUT" <<'JS'
const fs = require('fs');
const assert = require('assert/strict');
const [root, output] = process.argv.slice(2);
const pause = JSON.parse(fs.readFileSync(`${output}/observer-pause.json`));
const proc = fs.readFileSync(`/proc/${pause.pid}/status`, 'utf8');
assert.match(proc, /^State:\s+T/m, 'observer must be deliberately stopped, not an active submitter');
assert.equal(fs.readFileSync(`/proc/${pause.pid}/cmdline`, 'utf8'), `node\0${root}/evidence/ainize_lifecycle100_20260911/source/ainize-lifecycle.js\0`);
const progress = JSON.parse(fs.readFileSync(`${root}/evidence/ainize_lifecycle100_20260911/progress.json`));
assert.equal(progress.summary.jobs, progress.summary.inferenceComplete, 'unfinished observed job');
assert.ok(progress.entries.every(entry => entry.done || (!entry.jobId && !entry.submissionIntent)), 'ambiguous pending submission');
const jobs = JSON.parse(fs.readFileSync(`${output}/jobs-before.json`));
const terminal = new Set(['READY', 'NEEDS_MORE', 'FAILED', 'CANCELLED', 'REJECTED', 'ANNOUNCED', 'PENDING_REVIEW', 'EXPIRED']);
assert.ok(Array.isArray(jobs.items) && jobs.items.length < 500);
assert.ok(jobs.items.every(job => terminal.has(job.status)), 'a server-side job is active; do not stop the node');
const info = JSON.parse(fs.readFileSync(`${output}/info-before.json`));
assert.equal(info.ledger.kind, 'ain');
assert.equal(info.runtime.available, true);
const queue = info.runtime.queue;
assert.ok(queue && !queue.running && !queue.waiting && !queue.lock && !queue.queued?.length);
assert.deepEqual(info.runtime.applied, []);
const config = JSON.parse(fs.readFileSync(`${root}/ainize/home-docker/config.json`));
assert.equal(config.ledger.kind, 'ain');
assert.ok(config.peers.includes('https://ainize.ai'));
fs.writeFileSync(`${output}/config-before.sha256`, require('crypto').createHash('sha256').update(fs.readFileSync(`${root}/ainize/home-docker/config.json`)).digest('hex') + '\n', {flag:'wx'});
JS
mkdir -m 700 "$BACKUP"
docker inspect ain-cert-ainize-node-1 --format '{{json .Image}}' > "$OUT/image-before.json"
export AINIZE_UID="$(id -u)" AINIZE_GID="$(id -g)" DOCKER_GID="$(stat -c %g /var/run/docker.sock)"
docker compose -f "$KPI/docker/compose.ainize.json" stop -t 60 node > "$OUT/stop.log" 2>&1
umask 077
tar -C "$KPI/ainize" -cf "$BACKUP/home-docker.tar" home-docker
cp "$KPI/ainize/home-docker/config.json" "$BACKUP/config-before.json"
umask 022
sha256sum "$BACKUP/home-docker.tar" > "$OUT/backup.sha256"
RUN_ID="${RUN_ID}_config" bash "$KPI/docker/run-hf-cli.sh" config set ledger.kind local --json > "$OUT/config-set.json"
node - "$KPI" "$BACKUP" <<'JS'
const fs = require('fs');
const assert = require('assert/strict');
const [root, backup] = process.argv.slice(2);
const before = JSON.parse(fs.readFileSync(`${backup}/config-before.json`));
const after = JSON.parse(fs.readFileSync(`${root}/ainize/home-docker/config.json`));
assert.equal(after.ledger.kind, 'local');
after.ledger.kind = before.ledger.kind;
assert.deepEqual(after, before, 'only ledger.kind may change');
JS
docker compose -f "$KPI/docker/compose.ainize.json" up -d --no-deps node > "$OUT/start.log" 2>&1
for attempt in {1..60}; do
  if curl --fail --silent --max-time 5 http://localhost:3410/readyz > "$OUT/ready.json"; then break; fi
  sleep 2
done
curl --fail --silent --show-error http://localhost:3410/api/info > "$OUT/info-after.json"
bash "$KPI/docker/ainize-cli.sh" teach jobs --json > "$OUT/jobs-after.json"
docker inspect ain-cert-ainize-node-1 --format '{{json .HostConfig}}' > "$OUT/limits-after.json"
node - "$OUT" <<'JS'
const fs = require('fs');
const assert = require('assert/strict');
const output = process.argv[2];
const before = JSON.parse(fs.readFileSync(`${output}/jobs-before.json`));
const after = JSON.parse(fs.readFileSync(`${output}/jobs-after.json`));
assert.deepEqual(after, before, 'the same teaching jobs and dataset IDs must survive');
const oldInfo = JSON.parse(fs.readFileSync(`${output}/info-before.json`));
const newInfo = JSON.parse(fs.readFileSync(`${output}/info-after.json`));
assert.equal(newInfo.ledger.kind, 'local');
assert.equal(newInfo.node.address, oldInfo.node.address);
assert.equal(newInfo.runtime.available, true);
assert.deepEqual(newInfo.runtime.applied, []);
fs.writeFileSync(`${output}/result.json`, JSON.stringify({at:new Date().toISOString(),pass:true,jobsPreserved:after.items.length,node:newInfo.node.address,from:'ain',to:'local',scope:'Ainize publication ledger only; the ten-node AIN performance chain and all GPU containers remain unchanged. Local DAG/CREDIT records are not AIN transactions. Resume the same lifecycle RUN_ID after maintenance.'},null,2)+'\n',{flag:'wx'});
JS
echo "Ainize now uses the public marketplace's local ledger; jobs preserved. Resume the same lifecycle RUN_ID when maintenance is complete."
