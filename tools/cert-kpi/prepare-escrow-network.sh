#!/usr/bin/env bash
set -euo pipefail
umask 077
out=${1:?Pass a NEW evidence directory}
private=${2:?Pass a NEW private directory outside evidence}
project=${3:?Pass a distinct ain-units- project name}
image=${CHAIN_IMAGE:?Pass the tested native micro-unit chain image}
[[ "$project" =~ ^ain-units-[a-z0-9-]{1,40}$ ]] || exit 1
[[ ! -e "$out" && ! -e "$private" ]] || { echo 'Do not overwrite an existing experiment' >&2; exit 1; }
[[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=$project")" ]] || exit 1
[[ -z "$(docker volume ls -q --filter "label=com.docker.compose.project=$project")" ]] || exit 1
for port in 21041 21079 {21081..21090} {21501..21510}; do
  [[ -z "$(ss -H -ltn "sport = :$port")" ]] || { echo "Port $port occupied; no existing process is replaced" >&2; exit 1; }
done
mkdir "$out" "$private"
out=$(realpath "$out")
private=$(realpath "$private")
case "$private/" in "$out/"*) exit 1;; esac
case "$out/" in "$private/"*) exit 1;; esac
mkdir "$out/source"
mkdir -p "$private/data"/node{0..9}
source=$(cd "$(dirname "$0")" && pwd)
cp "$source"/escrow-network-{config,client,genesis}.js "$source/prepare-escrow-network.sh" "$out/source/"
(cd "$out/source" && sha256sum *) > "$out/source.sha256"
image=$(docker image inspect "$image" --format '{{.Id}}')
docker run --name "$project-genesis" --runtime runc --network none --cpus 2 --cpuset-cpus 0-7 \
  --memory 4g --memory-swap 4g --read-only --tmpfs /tmp:rw,size=256m --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" -e NVIDIA_VISIBLE_DEVICES=void \
  --mount "type=bind,src=$out/source,dst=/experiment,readonly" \
  --mount "type=bind,src=$out,dst=/evidence" --mount "type=bind,src=$private,dst=/private" \
  --entrypoint node "$image" /experiment/escrow-network-genesis.js > "$out/genesis.log" 2>&1
node - "$out" "$private" "$project" "$image" <<'NODE'
const fs = require('fs');
const [out, privateDirectory, project, chainImage] = process.argv.slice(2);
const { compose } = require(`${out}/source/escrow-network-config.js`);
const genesis = JSON.parse(fs.readFileSync(`${out}/network-genesis.json`, 'utf8'));
const plan = { ...genesis, project, chainImage, rpcPortBase: 21081, peerPort: 21041, nativeReleaseVersion: 2,
  uid: process.getuid(), gid: process.getgid() };
fs.writeFileSync(`${out}/network-plan.json`, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
fs.writeFileSync(`${out}/compose.json`, JSON.stringify(compose(plan, privateDirectory, `${out}/source`), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
NODE
docker compose -f "$out/compose.json" config --quiet
echo "Prepared only: $out/compose.json. Start only this new project, never old recovery compose files."
