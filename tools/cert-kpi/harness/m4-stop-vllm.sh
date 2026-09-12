#!/usr/bin/env bash
KPI=${KPI_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
LOGS=$KPI/logs/vllm
[ -f "$LOGS/pids" ] && kill $(cat "$LOGS/pids") 2>/dev/null; sleep 5
[ -f "$LOGS/pids" ] && kill -9 $(cat "$LOGS/pids") 2>/dev/null
pkill -f "vllm serve ${M4_MODEL_DIR:-openai/gpt-oss-20b}" 2>/dev/null
rm -f "$LOGS/pids"; echo stopped
