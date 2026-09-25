#!/usr/bin/env bash
set -euo pipefail
KPI=$(cd "$(dirname "$0")/.." && pwd)
RUN_ID=${RUN_ID:-ple_start_$(date -u +%Y%m%dT%H%M%SZ)}
[[ "$RUN_ID" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
OUT="$KPI/evidence/$RUN_ID"
mkdir "$OUT"
python3 - "$KPI" <<'PY'
import json, os, pathlib, subprocess, sys
root = pathlib.Path(sys.argv[1])
for container in json.loads(subprocess.check_output(['docker', 'inspect', 'flashnext', 'flashtrain'])):
    if container['State']['Running']:
        raise SystemExit('PLE container already running; inspect the existing process instead of restarting')
    if container['Image'] != 'sha256:bd995759b5b8ac51062e04c9e4d7c91c382d1ba377bb787e24dca2ccb39925e9':
        raise SystemExit('unexpected PLE image')
queued = list(pathlib.Path(os.environ['TRAINER_QUEUE']).glob('*.json'))
if queued:
    raise SystemExit('existing trainer requests must be inspected before startup')
for line in (root / 'logs/vllm/pids').read_text().splitlines():
    process = pathlib.Path('/proc', str(int(line)), 'cmdline')
    if process.exists():
        arguments = process.read_bytes().split(b'\0')
        if os.environ['VLLM_BIN'].encode() not in arguments or os.environ['M4_MODEL_DIR'].encode() not in arguments:
            raise SystemExit('PID file refers to another process; refusing to stop it')
PY
if curl -fsS -m 2 http://localhost:9100/stats >/dev/null 2>&1; then
  echo 'M4 recorder is live; finish its experiment before switching'; exit 1
fi
docker compose -f "$KPI/docker/compose.gpu.json" stop > "$OUT/m4-gpu-stop.log" 2>&1
python3 - "$KPI" <<'PY'
import os, pathlib, signal, sys, time
root = pathlib.Path(sys.argv[1])
processes = [int(line) for line in (root / 'logs/vllm/pids').read_text().splitlines()]
for process in processes:
    try:
        arguments = pathlib.Path('/proc', str(process), 'cmdline').read_bytes().split(b'\0')
        if os.environ['VLLM_BIN'].encode() not in arguments or os.environ['M4_MODEL_DIR'].encode() not in arguments:
            raise SystemExit('process changed identity before stop')
        os.kill(process, signal.SIGTERM)
    except FileNotFoundError:
        pass
for attempt in range(60):
    alive = [process for process in processes if pathlib.Path('/proc', str(process)).exists()]
    if not alive:
        break
    time.sleep(1)
else:
    raise SystemExit('M4 parent processes have not exited; inspect them, do not force-kill')
PY
nvidia-smi --query-compute-apps=pid,gpu_uuid,used_memory --format=csv,noheader > "$OUT/gpu-before.txt"
docker update --cpus=4 --cpuset-cpus=0-7 --memory=320g --memory-swap=320g flashnext flashtrain > "$OUT/resource-update.log"
for container in flashnext flashtrain; do
  docker inspect "$container" --format '{{json .HostConfig}}' > "$OUT/$container-limits.json"
  docker inspect "$container" --format '{{json .Image}}' > "$OUT/$container-image.json"
done
docker start flashnext flashtrain > "$OUT/start.log"
docker exec flashtrain bash -c 'rm -f /work/.teach/_queue/.ready; exec python3 /work/resident/teach_server.py' > "$OUT/trainer.stdout.log" 2> "$OUT/trainer.stderr.log" &
trainer_handle=$!
printf '%s\n' "$trainer_handle" > "$OUT/docker-exec.pid"
echo "PLE started; trainer docker-exec PID=$trainer_handle; evidence=$OUT"
wait "$trainer_handle"
