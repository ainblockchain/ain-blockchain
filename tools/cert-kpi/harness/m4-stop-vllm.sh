#!/usr/bin/env bash
HERE=$(cd "$(dirname "$0")" && pwd)
KPI=${KPI_DIR:-$(cd "$HERE/.." && pwd)}
LOGS=$KPI/logs/vllm
MODEL=${M4_MODEL_DIR:-openai/gpt-oss-20b}
[ -f "$LOGS/pids" ] && kill $(cat "$LOGS/pids") 2>/dev/null; sleep 5
[ -f "$LOGS/pids" ] && kill -9 $(cat "$LOGS/pids") 2>/dev/null
pkill -f "vllm serve $MODEL" 2>/dev/null
rm -f "$LOGS/pids"; echo stopped
