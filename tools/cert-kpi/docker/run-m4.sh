#!/usr/bin/env bash
set -euo pipefail
KPI=$(cd "$(dirname "$0")/.." && pwd)
export RUN_ID=${RUN_ID:-docker_m4_$(date -u +%Y%m%dT%H%M%SZ)}
export M4_RUN=$RUN_ID
export HARNESS_IMAGE=${HARNESS_IMAGE:-ain-cert-m4:repro-20260911}
export HARNESS_IMAGE_DEPENDENCIES=1 HARNESS_CPUS=4 HARNESS_CPUSET=0-7 HARNESS_MEMORY=16g
export LOCUST_CPUS=0-7 USERS=240 WORKERS=60 DUR=${DUR:-60}
export VLLM_PORTS=18001,18002,18003,18004,18005
RUN_ID="${RUN_ID}_gpu" node "$KPI/docker/verify-gpu.js"
exec bash "$KPI/docker/run-harness.sh" m4-run-locust.sh
