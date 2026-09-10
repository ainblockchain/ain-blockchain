#!/usr/bin/env bash
HERE=$(cd "$(dirname "$0")" && pwd)
KPI_DIR=${KPI_DIR:-$HERE/work}
PIDF=$KPI_DIR/cert-net.pids
[ -f "$PIDF" ] && kill $(cat "$PIDF") 2>/dev/null
sleep 2
[ -f "$PIDF" ] && kill -9 $(cat "$PIDF") 2>/dev/null
rm -f "$PIDF"
echo stopped
